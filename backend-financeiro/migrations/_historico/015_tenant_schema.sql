-- ============================================================================
-- Move os dados do tenant de `public` para o schema do tenant
-- ============================================================================
--
-- O `public` é do BANCO, não de um cliente. Ele guarda o que é comum a todos os
-- tenants; os dados de cada tenant moram no schema dele (`pinheirao`, e os que
-- vierem). Com tudo em `public`, o segundo tenant não teria onde morar — e o
-- `db_schema` do master, que já aponta para `pinheirao`, não significaria nada.
--
-- FICA EM `public` (comum):
--   schema_migrations              — controle do migrador
--   plantillas_plan_cuentas(_items)— modelos de plano de contas, servem a todos
--   tenants                        — registro de quem é quem e qual schema usa
--
-- VAI PARA O SCHEMA DO TENANT (tudo o mais).
--
-- `ALTER TABLE ... SET SCHEMA` leva junto dados, índices, constraints, triggers
-- e policies, e as chaves estrangeiras que apontam para a tabela continuam
-- válidas (a referência é por OID, não por nome).
--
-- ⚠️ As FUNÇÕES são o contrário: mover não reescreve o corpo. Uma função que
--    diz `FROM public.cuotas_pagar` continuaria procurando em `public` depois da
--    mudança e quebraria em silêncio. Por isso elas são RECRIADAS aqui, sem
--    qualificar o schema e com `search_path` fixo no schema do tenant.
-- ============================================================================

DO $$
DECLARE
  esquema TEXT;
  tabela  TEXT;
  tenant_tables TEXT[] := ARRAY[
    'empresas','usuarios','usuarios_tenants','usuarios_empresas',
    'planes_cuentas','cuentas_plan','empresas_planes_cuentas',
    'centros_costo','contrapartes','cotizaciones',
    'cajas','movimientos_caja',
    'cuentas_pagar','cuotas_pagar','bajas_pagar',
    'cuentas_cobrar','cuotas_cobrar','bajas_cobrar',
    'documentos_importados','reportes_consolidados','auditoria_eventos'
  ];
BEGIN
  SELECT login_schema INTO esquema FROM public.tenants ORDER BY id LIMIT 1;
  IF esquema IS NULL THEN
    RAISE EXCEPTION 'Nenhum tenant com login_schema definido; nada a mover.';
  END IF;

  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', esquema);

  FOREACH tabela IN ARRAY tenant_tables LOOP
    IF to_regclass(format('public.%I', tabela)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA %I', tabela, esquema);
    END IF;
  END LOOP;

  -- ── Funções de policy (SECURITY DEFINER) ─────────────────────────────────
  -- Recriadas sem qualificar schema: quem resolve é o `search_path` fixo.
  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION %I.puede_acceder_empresa(p_tenant_id BIGINT, p_empresa_id BIGINT)
    RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = %I, pg_temp
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
    $body$ $f$, esquema, esquema);

  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION %I.es_admin_tenant(p_tenant_id BIGINT)
    RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = %I, pg_temp
    AS $body$
      SELECT EXISTS (
        SELECT 1 FROM usuarios_tenants ut JOIN usuarios u ON u.id = ut.usuario_id
        WHERE ut.tenant_id = p_tenant_id AND u.tenant_id = p_tenant_id
          AND u.usuario_origem_codigo = NULLIF(current_setting('app.user_id', true), '')::INTEGER
          AND ut.rol = 'ADMIN_TENANT'
      );
    $body$ $f$, esquema, esquema);

  -- ── Funções de trigger ───────────────────────────────────────────────────
  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION %I.bloquear_mutacion_bajas()
    RETURNS TRIGGER LANGUAGE plpgsql SET search_path = %I, pg_temp AS $body$
    BEGIN
      RAISE EXCEPTION 'Las bajas son append-only: use una reversión, no UPDATE ni DELETE';
    END $body$ $f$, esquema, esquema);

  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION %I.validar_movimiento_caja_integridad()
    RETURNS TRIGGER LANGUAGE plpgsql SET search_path = %I, pg_temp AS $body$
    DECLARE caja_registro RECORD;
    BEGIN
      SELECT empresa_id, moneda, activo INTO caja_registro
      FROM cajas WHERE tenant_id = NEW.tenant_id AND id = NEW.caja_id;
      IF NOT FOUND OR NOT caja_registro.activo THEN RAISE EXCEPTION 'La caja no existe o está inactiva'; END IF;
      IF caja_registro.empresa_id <> NEW.empresa_id THEN RAISE EXCEPTION 'La caja pertenece a otra empresa'; END IF;
      IF caja_registro.moneda <> NEW.moneda THEN RAISE EXCEPTION 'La moneda del movimiento no coincide con la caja'; END IF;
      RETURN NEW;
    END $body$ $f$, esquema, esquema);

  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION %I.validar_baja_pagar_integridad()
    RETURNS TRIGGER LANGUAGE plpgsql SET search_path = %I, pg_temp AS $body$
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
    END $body$ $f$, esquema, esquema);

  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION %I.validar_baja_cobrar_integridad()
    RETURNS TRIGGER LANGUAGE plpgsql SET search_path = %I, pg_temp AS $body$
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
    END $body$ $f$, esquema, esquema);

  -- Os triggers apontam para as funções por OID e continuam ligados; só é
  -- preciso reapontá-los para as cópias novas no schema do tenant.
  EXECUTE format('DROP TRIGGER IF EXISTS trg_bajas_pagar_append_only ON %I.bajas_pagar', esquema);
  EXECUTE format('CREATE TRIGGER trg_bajas_pagar_append_only BEFORE UPDATE OR DELETE ON %I.bajas_pagar FOR EACH ROW EXECUTE FUNCTION %I.bloquear_mutacion_bajas()', esquema, esquema);
  EXECUTE format('DROP TRIGGER IF EXISTS trg_bajas_cobrar_append_only ON %I.bajas_cobrar', esquema);
  EXECUTE format('CREATE TRIGGER trg_bajas_cobrar_append_only BEFORE UPDATE OR DELETE ON %I.bajas_cobrar FOR EACH ROW EXECUTE FUNCTION %I.bloquear_mutacion_bajas()', esquema, esquema);
  EXECUTE format('DROP TRIGGER IF EXISTS trg_movimientos_caja_integridad ON %I.movimientos_caja', esquema);
  EXECUTE format('CREATE TRIGGER trg_movimientos_caja_integridad BEFORE INSERT OR UPDATE ON %I.movimientos_caja FOR EACH ROW EXECUTE FUNCTION %I.validar_movimiento_caja_integridad()', esquema, esquema);
  EXECUTE format('DROP TRIGGER IF EXISTS trg_bajas_pagar_integridad ON %I.bajas_pagar', esquema);
  EXECUTE format('CREATE TRIGGER trg_bajas_pagar_integridad BEFORE INSERT ON %I.bajas_pagar FOR EACH ROW EXECUTE FUNCTION %I.validar_baja_pagar_integridad()', esquema, esquema);
  EXECUTE format('DROP TRIGGER IF EXISTS trg_bajas_cobrar_integridad ON %I.bajas_cobrar', esquema);
  EXECUTE format('CREATE TRIGGER trg_bajas_cobrar_integridad BEFORE INSERT ON %I.bajas_cobrar FOR EACH ROW EXECUTE FUNCTION %I.validar_baja_cobrar_integridad()', esquema, esquema);

  -- ── Policies ─────────────────────────────────────────────────────────────
  -- A policy guarda a referência à função por OID: mover a tabela leva a policy
  -- junto, mas ela continua apontando para a função ANTIGA, em `public`, cujo
  -- corpo procura tabelas que já não estão lá. Recriar é obrigatório — sem isso
  -- o RLS passaria a estourar erro em toda consulta.
  DECLARE
    ctx_tenant CONSTANT TEXT := 'tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::BIGINT';
    eu_no_tenant TEXT;
    sou_eu CONSTANT TEXT := 'u.usuario_origem_codigo = NULLIF(current_setting(''app.user_id'', true), '''')::INTEGER';
  BEGIN
    /* A expressão da policy é analisada e guardada JÁ RESOLVIDA — o
       `search_path` de quem roda a migration não vale na hora de usá-la. Toda
       tabela citada dentro da policy precisa vir qualificada. */
    eu_no_tenant := format(
      'EXISTS (SELECT 1 FROM %I.usuarios u WHERE u.id = usuario_id AND u.tenant_id = tenant_id AND %s)',
      esquema, sou_eu);
    -- Isolamento por empresa: o usuário só vê a empresa a que tem acesso.
    FOREACH tabela IN ARRAY ARRAY['centros_costo','cajas','cuentas_pagar','cuotas_pagar',
      'cuentas_cobrar','cuotas_cobrar','movimientos_caja','bajas_pagar','bajas_cobrar',
      'documentos_importados'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS tenant_company_isolation ON %I.%I', esquema, tabela);
      EXECUTE format(
        'CREATE POLICY tenant_company_isolation ON %I.%I USING (%s AND %I.puede_acceder_empresa(tenant_id, empresa_id)) WITH CHECK (%s AND %I.puede_acceder_empresa(tenant_id, empresa_id))',
        esquema, tabela, ctx_tenant, esquema, ctx_tenant, esquema);
    END LOOP;

    -- `empresas` se filtra por si mesma: a empresa é a própria linha.
    EXECUTE format('DROP POLICY IF EXISTS tenant_company_isolation ON %I.empresas', esquema);
    EXECUTE format(
      'CREATE POLICY tenant_company_isolation ON %I.empresas USING (%s AND %I.puede_acceder_empresa(tenant_id, id)) WITH CHECK (%s AND %I.puede_acceder_empresa(tenant_id, id))',
      esquema, ctx_tenant, esquema, ctx_tenant, esquema);

    -- Sem recorte por empresa: bastam tenant e a policy de grupo.
    FOREACH tabela IN ARRAY ARRAY['contrapartes','cotizaciones','planes_cuentas',
      'cuentas_plan','empresas_planes_cuentas'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I.%I', esquema, tabela);
      EXECUTE format('CREATE POLICY tenant_isolation ON %I.%I USING (%s) WITH CHECK (%s)',
        esquema, tabela, ctx_tenant, ctx_tenant);
    END LOOP;

    -- Diretório de usuários: cada um vê a si; o admin do grupo vê todos.
    EXECUTE format('DROP POLICY IF EXISTS tenant_user_directory ON %I.usuarios', esquema);
    EXECUTE format(
      'CREATE POLICY tenant_user_directory ON %I.usuarios USING (%s AND (usuario_origem_codigo = NULLIF(current_setting(''app.user_id'', true), '''')::INTEGER OR %I.es_admin_tenant(tenant_id))) WITH CHECK (%s AND (usuario_origem_codigo = NULLIF(current_setting(''app.user_id'', true), '''')::INTEGER OR %I.es_admin_tenant(tenant_id)))',
      esquema, ctx_tenant, esquema, ctx_tenant, esquema);

    EXECUTE format('DROP POLICY IF EXISTS tenant_user_membership ON %I.usuarios_tenants', esquema);
    EXECUTE format(
      'CREATE POLICY tenant_user_membership ON %I.usuarios_tenants USING (%s AND (%I.es_admin_tenant(tenant_id) OR %s)) WITH CHECK (%s AND (%I.es_admin_tenant(tenant_id) OR %s))',
      esquema, ctx_tenant, esquema, eu_no_tenant, ctx_tenant, esquema, eu_no_tenant);

    EXECUTE format('DROP POLICY IF EXISTS tenant_user_company_access ON %I.usuarios_empresas', esquema);
    EXECUTE format(
      'CREATE POLICY tenant_user_company_access ON %I.usuarios_empresas USING (%s AND (%I.es_admin_tenant(tenant_id) OR %s)) WITH CHECK (%s AND %I.es_admin_tenant(tenant_id))',
      esquema, ctx_tenant, esquema, eu_no_tenant, ctx_tenant, esquema);

    -- Consolidado é só do administrador do grupo.
    EXECUTE format('DROP POLICY IF EXISTS tenant_admin_consolidated_reports ON %I.reportes_consolidados', esquema);
    EXECUTE format(
      'CREATE POLICY tenant_admin_consolidated_reports ON %I.reportes_consolidados USING (%s AND %I.es_admin_tenant(tenant_id)) WITH CHECK (%s AND %I.es_admin_tenant(tenant_id) AND EXISTS (SELECT 1 FROM %I.usuarios u WHERE u.id = solicitado_por AND u.tenant_id = tenant_id AND %s))',
      esquema, ctx_tenant, esquema, ctx_tenant, esquema, esquema, sou_eu);

    -- Auditoria: o admin lê; qualquer um registra em nome próprio.
    EXECUTE format('DROP POLICY IF EXISTS auditoria_admin_lectura ON %I.auditoria_eventos', esquema);
    EXECUTE format('CREATE POLICY auditoria_admin_lectura ON %I.auditoria_eventos FOR SELECT USING (%s AND %I.es_admin_tenant(tenant_id))',
      esquema, ctx_tenant, esquema);
    EXECUTE format('DROP POLICY IF EXISTS auditoria_registro_propietario ON %I.auditoria_eventos', esquema);
    EXECUTE format('CREATE POLICY auditoria_registro_propietario ON %I.auditoria_eventos FOR INSERT WITH CHECK (%s AND usuario_origem_codigo = NULLIF(current_setting(''app.user_id'', true), '''')::INTEGER)',
      esquema, ctx_tenant);
  END;

  -- Só agora as antigas saem de cena: nada mais depende delas.
  DROP FUNCTION IF EXISTS public.puede_acceder_empresa(BIGINT, BIGINT);
  DROP FUNCTION IF EXISTS public.es_admin_tenant(BIGINT);
  DROP FUNCTION IF EXISTS public.bloquear_mutacion_bajas();
  DROP FUNCTION IF EXISTS public.validar_movimiento_caja_integridad();
  DROP FUNCTION IF EXISTS public.validar_baja_pagar_integridad();
  DROP FUNCTION IF EXISTS public.validar_baja_cobrar_integridad();

  RAISE NOTICE 'Tenant migrado para o schema %', esquema;
END $$;

-- O papel da aplicação precisa enxergar o que mudou de lugar.
DO $$
DECLARE esquema TEXT;
BEGIN
  SELECT login_schema INTO esquema FROM public.tenants ORDER BY id LIMIT 1;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kuatia_adm') THEN
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO kuatia_adm', esquema);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO kuatia_adm', esquema);
    EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO kuatia_adm', esquema);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kuatia_adm', esquema);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO kuatia_adm', esquema);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.puede_acceder_empresa(BIGINT, BIGINT) TO kuatia_adm', esquema);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.es_admin_tenant(BIGINT) TO kuatia_adm', esquema);
    -- Em `public` sobram só as tabelas comuns.
    GRANT SELECT ON public.plantillas_plan_cuentas, public.plantillas_plan_cuentas_items TO kuatia_adm;
    GRANT SELECT, INSERT, UPDATE ON public.tenants TO kuatia_adm;
  END IF;
END $$;
