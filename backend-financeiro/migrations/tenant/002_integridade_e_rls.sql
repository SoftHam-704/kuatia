-- ============================================================================
-- Regras que moram no BANCO — integridade e isolamento
-- ============================================================================
--
-- Guarda de dinheiro não pode viver só na aplicação: um script, um psql ou um
-- bug de rota passariam por cima. Aqui ficam as regras que o Postgres aplica
-- independentemente de quem esteja chamando.
--
-- Tudo é construído com `current_schema()`, que o migrador fixa no schema de
-- destino. Nenhum nome de tenant aparece escrito.
-- ============================================================================

DO $migracao$
DECLARE
  esquema  CONSTANT TEXT := current_schema();
  ctx_tenant CONSTANT TEXT := 'tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::BIGINT';
  ctx_user   CONSTANT TEXT := 'NULLIF(current_setting(''app.user_id'', true), '''')::INTEGER';
  tabela   TEXT;
  eu_em    TEXT;
BEGIN

-- ── Funções de política ─────────────────────────────────────────────────────
-- SECURITY DEFINER: precisam enxergar as tabelas de permissão mesmo com RLS
-- ligado. O `search_path` fixo é o que impede que a função seja sequestrada por
-- um schema plantado na frente pelo chamador.

EXECUTE format($f$
  CREATE OR REPLACE FUNCTION %1$I.puede_acceder_empresa(p_tenant_id BIGINT, p_empresa_id BIGINT)
  RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = %1$I, pg_temp
  AS $body$
    SELECT EXISTS (
      SELECT 1 FROM usuarios_tenants ut JOIN usuarios u ON u.id = ut.usuario_id
      WHERE ut.tenant_id = p_tenant_id AND u.tenant_id = p_tenant_id
        AND u.usuario_origem_codigo = NULLIF(current_setting('app.user_id', true), '')::INTEGER
        AND ut.rol = 'ADMIN_TENANT'
    ) OR EXISTS (
      SELECT 1 FROM usuarios_empresas ue JOIN usuarios u ON u.id = ue.usuario_id
      WHERE ue.tenant_id = p_tenant_id AND u.tenant_id = p_tenant_id
        AND ue.empresa_id = p_empresa_id
        AND u.usuario_origem_codigo = NULLIF(current_setting('app.user_id', true), '')::INTEGER
    );
  $body$ $f$, esquema);

EXECUTE format($f$
  CREATE OR REPLACE FUNCTION %1$I.es_admin_tenant(p_tenant_id BIGINT)
  RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = %1$I, pg_temp
  AS $body$
    SELECT EXISTS (
      SELECT 1 FROM usuarios_tenants ut JOIN usuarios u ON u.id = ut.usuario_id
      WHERE ut.tenant_id = p_tenant_id AND u.tenant_id = p_tenant_id
        AND u.usuario_origem_codigo = NULLIF(current_setting('app.user_id', true), '')::INTEGER
        AND ut.rol = 'ADMIN_TENANT'
    );
  $body$ $f$, esquema);

-- ── Trigger: o livro de baixas é append-only ────────────────────────────────
EXECUTE format($f$
  CREATE OR REPLACE FUNCTION %1$I.bloquear_mutacion_bajas()
  RETURNS TRIGGER LANGUAGE plpgsql SET search_path = %1$I, pg_temp AS $body$
  BEGIN
    RAISE EXCEPTION 'Las bajas son append-only: use una reversión, no UPDATE ni DELETE';
  END $body$ $f$, esquema);

-- ── Trigger: movimento de caixa casa com a caixa ────────────────────────────
EXECUTE format($f$
  CREATE OR REPLACE FUNCTION %1$I.validar_movimiento_caja_integridad()
  RETURNS TRIGGER LANGUAGE plpgsql SET search_path = %1$I, pg_temp AS $body$
  DECLARE caja_registro RECORD;
  BEGIN
    SELECT empresa_id, moneda, activo INTO caja_registro
    FROM cajas WHERE tenant_id = NEW.tenant_id AND id = NEW.caja_id;
    IF NOT FOUND OR NOT caja_registro.activo THEN RAISE EXCEPTION 'La caja no existe o está inactiva'; END IF;
    IF caja_registro.empresa_id <> NEW.empresa_id THEN RAISE EXCEPTION 'La caja pertenece a otra empresa'; END IF;
    IF caja_registro.moneda <> NEW.moneda THEN RAISE EXCEPTION 'La moneda del movimiento no coincide con la caja'; END IF;
    RETURN NEW;
  END $body$ $f$, esquema);

-- ── Trigger: a baixa não pode exceder o saldo da parcela ────────────────────
EXECUTE format($f$
  CREATE OR REPLACE FUNCTION %1$I.validar_baja_pagar_integridad()
  RETURNS TRIGGER LANGUAGE plpgsql SET search_path = %1$I, pg_temp AS $body$
  DECLARE cuota_registro RECORD; aplicado BIGINT; delta BIGINT; efectivo BIGINT; tipo_movimiento CHAR(1);
  BEGIN
    SELECT q.empresa_id, q.valor_minor, cp.moneda INTO cuota_registro
    FROM cuotas_pagar q JOIN cuentas_pagar cp ON cp.tenant_id=q.tenant_id AND cp.id=q.cuenta_pagar_id
    WHERE q.tenant_id=NEW.tenant_id AND q.id=NEW.cuota_id;
    IF NOT FOUND OR cuota_registro.empresa_id <> NEW.empresa_id THEN RAISE EXCEPTION 'La cuota no pertenece a la empresa informada'; END IF;
    IF NEW.tipo='REVERSION' AND NOT EXISTS (SELECT 1 FROM bajas_pagar b WHERE b.tenant_id=NEW.tenant_id AND b.id=NEW.reversion_de_id AND b.cuota_id=NEW.cuota_id AND b.tipo='BAJA') THEN RAISE EXCEPTION 'La reversión debe referirse a una baja original de la misma cuota'; END IF;
    IF NEW.tipo='REVERSION' AND EXISTS (SELECT 1 FROM bajas_pagar b WHERE b.tenant_id=NEW.tenant_id AND b.reversion_de_id=NEW.reversion_de_id) THEN RAISE EXCEPTION 'La baja original ya fue revertida'; END IF;
    SELECT COALESCE(SUM(CASE WHEN tipo='BAJA' THEN valor_pagado_minor+descuento_minor ELSE -(valor_pagado_minor+descuento_minor) END),0) INTO aplicado FROM bajas_pagar WHERE tenant_id=NEW.tenant_id AND cuota_id=NEW.cuota_id;
    delta := NEW.valor_pagado_minor + NEW.descuento_minor; IF NEW.tipo='REVERSION' THEN delta := -delta; END IF;
    IF aplicado + delta < 0 OR aplicado + delta > cuota_registro.valor_minor THEN RAISE EXCEPTION 'La baja supera el saldo disponible de la cuota'; END IF;
    efectivo := NEW.valor_pagado_minor + NEW.intereses_minor - NEW.descuento_minor;
    IF efectivo < 0 THEN RAISE EXCEPTION 'El descuento no puede superar el efectivo más intereses'; END IF;
    IF efectivo = 0 AND (NEW.caja_id IS NOT NULL OR NEW.movimiento_caja_id IS NOT NULL) THEN RAISE EXCEPTION 'Una baja sin efectivo no puede generar movimiento de caja'; END IF;
    IF efectivo > 0 THEN
      IF NEW.caja_id IS NULL OR NEW.movimiento_caja_id IS NULL THEN RAISE EXCEPTION 'La baja con efectivo exige caja y movimiento'; END IF;
      tipo_movimiento := CASE WHEN NEW.tipo='BAJA' THEN 'D' ELSE 'C' END;
      IF NOT EXISTS (SELECT 1 FROM movimientos_caja m WHERE m.tenant_id=NEW.tenant_id AND m.id=NEW.movimiento_caja_id AND m.empresa_id=NEW.empresa_id AND m.caja_id=NEW.caja_id AND m.moneda=cuota_registro.moneda AND m.tipo=tipo_movimiento AND m.origen='CP' AND m.valor_minor=efectivo) THEN RAISE EXCEPTION 'El movimiento de caja de la baja no es válido'; END IF;
    END IF;
    RETURN NEW;
  END $body$ $f$, esquema);

EXECUTE format($f$
  CREATE OR REPLACE FUNCTION %1$I.validar_baja_cobrar_integridad()
  RETURNS TRIGGER LANGUAGE plpgsql SET search_path = %1$I, pg_temp AS $body$
  DECLARE cuota_registro RECORD; aplicado BIGINT; delta BIGINT; efectivo BIGINT; tipo_movimiento CHAR(1);
  BEGIN
    SELECT q.empresa_id, q.valor_minor, cc.moneda INTO cuota_registro
    FROM cuotas_cobrar q JOIN cuentas_cobrar cc ON cc.tenant_id=q.tenant_id AND cc.id=q.cuenta_cobrar_id
    WHERE q.tenant_id=NEW.tenant_id AND q.id=NEW.cuota_id;
    IF NOT FOUND OR cuota_registro.empresa_id <> NEW.empresa_id THEN RAISE EXCEPTION 'La cuota no pertenece a la empresa informada'; END IF;
    IF NEW.tipo='REVERSION' AND NOT EXISTS (SELECT 1 FROM bajas_cobrar b WHERE b.tenant_id=NEW.tenant_id AND b.id=NEW.reversion_de_id AND b.cuota_id=NEW.cuota_id AND b.tipo='BAJA') THEN RAISE EXCEPTION 'La reversión debe referirse a una baja original de la misma cuota'; END IF;
    IF NEW.tipo='REVERSION' AND EXISTS (SELECT 1 FROM bajas_cobrar b WHERE b.tenant_id=NEW.tenant_id AND b.reversion_de_id=NEW.reversion_de_id) THEN RAISE EXCEPTION 'La baja original ya fue revertida'; END IF;
    SELECT COALESCE(SUM(CASE WHEN tipo='BAJA' THEN valor_cobrado_minor+descuento_minor ELSE -(valor_cobrado_minor+descuento_minor) END),0) INTO aplicado FROM bajas_cobrar WHERE tenant_id=NEW.tenant_id AND cuota_id=NEW.cuota_id;
    delta := NEW.valor_cobrado_minor + NEW.descuento_minor; IF NEW.tipo='REVERSION' THEN delta := -delta; END IF;
    IF aplicado + delta < 0 OR aplicado + delta > cuota_registro.valor_minor THEN RAISE EXCEPTION 'La baja supera el saldo disponible de la cuota'; END IF;
    efectivo := NEW.valor_cobrado_minor + NEW.intereses_minor - NEW.descuento_minor;
    IF efectivo < 0 THEN RAISE EXCEPTION 'El descuento no puede superar el efectivo más intereses'; END IF;
    IF efectivo = 0 AND (NEW.caja_id IS NOT NULL OR NEW.movimiento_caja_id IS NOT NULL) THEN RAISE EXCEPTION 'Una baja sin efectivo no puede generar movimiento de caja'; END IF;
    IF efectivo > 0 THEN
      IF NEW.caja_id IS NULL OR NEW.movimiento_caja_id IS NULL THEN RAISE EXCEPTION 'La baja con efectivo exige caja y movimiento'; END IF;
      tipo_movimiento := CASE WHEN NEW.tipo='BAJA' THEN 'C' ELSE 'D' END;
      IF NOT EXISTS (SELECT 1 FROM movimientos_caja m WHERE m.tenant_id=NEW.tenant_id AND m.id=NEW.movimiento_caja_id AND m.empresa_id=NEW.empresa_id AND m.caja_id=NEW.caja_id AND m.moneda=cuota_registro.moneda AND m.tipo=tipo_movimiento AND m.origen='CC' AND m.valor_minor=efectivo) THEN RAISE EXCEPTION 'El movimiento de caja de la baja no es válido'; END IF;
    END IF;
    RETURN NEW;
  END $body$ $f$, esquema);

-- ── Triggers ────────────────────────────────────────────────────────────────
EXECUTE format('DROP TRIGGER IF EXISTS trg_bajas_pagar_append_only ON %1$I.bajas_pagar', esquema);
EXECUTE format('CREATE TRIGGER trg_bajas_pagar_append_only BEFORE UPDATE OR DELETE ON %1$I.bajas_pagar FOR EACH ROW EXECUTE FUNCTION %1$I.bloquear_mutacion_bajas()', esquema);
EXECUTE format('DROP TRIGGER IF EXISTS trg_bajas_cobrar_append_only ON %1$I.bajas_cobrar', esquema);
EXECUTE format('CREATE TRIGGER trg_bajas_cobrar_append_only BEFORE UPDATE OR DELETE ON %1$I.bajas_cobrar FOR EACH ROW EXECUTE FUNCTION %1$I.bloquear_mutacion_bajas()', esquema);
EXECUTE format('DROP TRIGGER IF EXISTS trg_movimientos_caja_integridad ON %1$I.movimientos_caja', esquema);
EXECUTE format('CREATE TRIGGER trg_movimientos_caja_integridad BEFORE INSERT OR UPDATE ON %1$I.movimientos_caja FOR EACH ROW EXECUTE FUNCTION %1$I.validar_movimiento_caja_integridad()', esquema);
EXECUTE format('DROP TRIGGER IF EXISTS trg_bajas_pagar_integridad ON %1$I.bajas_pagar', esquema);
EXECUTE format('CREATE TRIGGER trg_bajas_pagar_integridad BEFORE INSERT ON %1$I.bajas_pagar FOR EACH ROW EXECUTE FUNCTION %1$I.validar_baja_pagar_integridad()', esquema);
EXECUTE format('DROP TRIGGER IF EXISTS trg_bajas_cobrar_integridad ON %1$I.bajas_cobrar', esquema);
EXECUTE format('CREATE TRIGGER trg_bajas_cobrar_integridad BEFORE INSERT ON %1$I.bajas_cobrar FOR EACH ROW EXECUTE FUNCTION %1$I.validar_baja_cobrar_integridad()', esquema);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- O schema separa CLIENTES. O RLS separa EMPRESAS e USUÁRIOS dentro do mesmo
-- cliente: um operador só enxerga as empresas a que foi dado acesso. As duas
-- camadas fazem trabalhos diferentes; nenhuma substitui a outra.
--
-- ⚠️ FORCE, não só ENABLE: sem FORCE, o dono da tabela passa por cima. E nem o
-- FORCE vale para superuser — por isso o app conecta com papel comum.
FOREACH tabela IN ARRAY ARRAY[
  'empresas','usuarios','usuarios_tenants','usuarios_empresas','planes_cuentas','cuentas_plan',
  'empresas_planes_cuentas','centros_costo','contrapartes','cotizaciones','cajas','movimientos_caja',
  'cuentas_pagar','cuotas_pagar','bajas_pagar','cuentas_cobrar','cuotas_cobrar','bajas_cobrar',
  'documentos_importados','reportes_consolidados','auditoria_eventos'
] LOOP
  EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', esquema, tabela);
  EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', esquema, tabela);
END LOOP;

-- Isolamento por empresa.
FOREACH tabela IN ARRAY ARRAY['centros_costo','cajas','movimientos_caja','cuentas_pagar','cuotas_pagar',
  'bajas_pagar','cuentas_cobrar','cuotas_cobrar','bajas_cobrar','documentos_importados'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS tenant_company_isolation ON %I.%I', esquema, tabela);
  EXECUTE format('CREATE POLICY tenant_company_isolation ON %I.%I USING (%s AND %I.puede_acceder_empresa(tenant_id, empresa_id)) WITH CHECK (%s AND %I.puede_acceder_empresa(tenant_id, empresa_id))',
    esquema, tabela, ctx_tenant, esquema, ctx_tenant, esquema);
END LOOP;

-- `empresas` se filtra por si mesma: a empresa é a própria linha.
EXECUTE format('DROP POLICY IF EXISTS tenant_company_isolation ON %I.empresas', esquema);
EXECUTE format('CREATE POLICY tenant_company_isolation ON %I.empresas USING (%s AND %I.puede_acceder_empresa(tenant_id, id)) WITH CHECK (%s AND %I.puede_acceder_empresa(tenant_id, id))',
  esquema, ctx_tenant, esquema, ctx_tenant, esquema);

-- Sem recorte por empresa.
FOREACH tabela IN ARRAY ARRAY['contrapartes','cotizaciones','planes_cuentas','cuentas_plan','empresas_planes_cuentas'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I.%I', esquema, tabela);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I.%I USING (%s) WITH CHECK (%s)', esquema, tabela, ctx_tenant, ctx_tenant);
END LOOP;

-- Diretório de usuários: cada um vê a si; o admin do grupo vê todos.
EXECUTE format('DROP POLICY IF EXISTS tenant_user_directory ON %I.usuarios', esquema);
EXECUTE format('CREATE POLICY tenant_user_directory ON %I.usuarios USING (%s AND (usuario_origem_codigo = %s OR %I.es_admin_tenant(tenant_id))) WITH CHECK (%s AND (usuario_origem_codigo = %s OR %I.es_admin_tenant(tenant_id)))',
  esquema, ctx_tenant, ctx_user, esquema, ctx_tenant, ctx_user, esquema);

/* 🔎 `u.tenant_id = <tabela>.tenant_id` — qualificado de propósito.
   A versão anterior escrevia `u.tenant_id = tenant_id`, e dentro da subconsulta
   o nome não-qualificado resolve para a coluna de `u`: virava `u.tenant_id =
   u.tenant_id`, tautologia sempre verdadeira. O predicado parecia checar o
   tenant e não checava nada. */
FOREACH tabela IN ARRAY ARRAY['usuarios_tenants','usuarios_empresas'] LOOP
  eu_em := format('EXISTS (SELECT 1 FROM %I.usuarios u WHERE u.id = usuario_id AND u.tenant_id = %I.tenant_id AND u.usuario_origem_codigo = %s)',
    esquema, tabela, ctx_user);
  IF tabela = 'usuarios_tenants' THEN
    EXECUTE format('DROP POLICY IF EXISTS tenant_user_membership ON %I.%I', esquema, tabela);
    EXECUTE format('CREATE POLICY tenant_user_membership ON %I.%I USING (%s AND (%I.es_admin_tenant(tenant_id) OR %s)) WITH CHECK (%s AND (%I.es_admin_tenant(tenant_id) OR %s))',
      esquema, tabela, ctx_tenant, esquema, eu_em, ctx_tenant, esquema, eu_em);
  ELSE
    EXECUTE format('DROP POLICY IF EXISTS tenant_user_company_access ON %I.%I', esquema, tabela);
    EXECUTE format('CREATE POLICY tenant_user_company_access ON %I.%I USING (%s AND (%I.es_admin_tenant(tenant_id) OR %s)) WITH CHECK (%s AND %I.es_admin_tenant(tenant_id))',
      esquema, tabela, ctx_tenant, esquema, eu_em, ctx_tenant, esquema);
  END IF;
END LOOP;

-- Consolidado do grupo: só o administrador.
EXECUTE format('DROP POLICY IF EXISTS tenant_admin_consolidated_reports ON %I.reportes_consolidados', esquema);
EXECUTE format('CREATE POLICY tenant_admin_consolidated_reports ON %1$I.reportes_consolidados USING (%2$s AND %1$I.es_admin_tenant(tenant_id)) WITH CHECK (%2$s AND %1$I.es_admin_tenant(tenant_id) AND EXISTS (SELECT 1 FROM %1$I.usuarios u WHERE u.id = solicitado_por AND u.tenant_id = reportes_consolidados.tenant_id AND u.usuario_origem_codigo = %3$s))',
  esquema, ctx_tenant, ctx_user);

-- Auditoria: o admin lê; qualquer um registra em nome próprio.
EXECUTE format('DROP POLICY IF EXISTS auditoria_admin_lectura ON %I.auditoria_eventos', esquema);
EXECUTE format('CREATE POLICY auditoria_admin_lectura ON %1$I.auditoria_eventos FOR SELECT USING (%2$s AND %1$I.es_admin_tenant(tenant_id))', esquema, ctx_tenant);
EXECUTE format('DROP POLICY IF EXISTS auditoria_registro_propietario ON %I.auditoria_eventos', esquema);
EXECUTE format('CREATE POLICY auditoria_registro_propietario ON %I.auditoria_eventos FOR INSERT WITH CHECK (%s AND usuario_origem_codigo = %s)', esquema, ctx_tenant, ctx_user);

END $migracao$;
