CREATE OR REPLACE FUNCTION public.validar_movimiento_caja_integridad()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE caja_registro RECORD;
BEGIN
  SELECT empresa_id, moneda, activo INTO caja_registro
  FROM public.cajas WHERE tenant_id = NEW.tenant_id AND id = NEW.caja_id;
  IF NOT FOUND OR NOT caja_registro.activo THEN RAISE EXCEPTION 'La caja no existe o está inactiva'; END IF;
  IF caja_registro.empresa_id <> NEW.empresa_id THEN RAISE EXCEPTION 'La caja pertenece a otra empresa'; END IF;
  IF caja_registro.moneda <> NEW.moneda THEN RAISE EXCEPTION 'La moneda del movimiento no coincide con la caja'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_movimientos_caja_integridad ON public.movimientos_caja;
CREATE TRIGGER trg_movimientos_caja_integridad
BEFORE INSERT OR UPDATE ON public.movimientos_caja
FOR EACH ROW EXECUTE FUNCTION public.validar_movimiento_caja_integridad();

CREATE OR REPLACE FUNCTION public.validar_baja_pagar_integridad()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE cuota_registro RECORD; aplicado BIGINT; delta BIGINT; efectivo BIGINT; tipo_movimiento CHAR(1);
BEGIN
  SELECT q.empresa_id, q.valor_minor, cp.moneda INTO cuota_registro
  FROM public.cuotas_pagar q JOIN public.cuentas_pagar cp ON cp.tenant_id=q.tenant_id AND cp.id=q.cuenta_pagar_id
  WHERE q.tenant_id=NEW.tenant_id AND q.id=NEW.cuota_id;
  IF NOT FOUND OR cuota_registro.empresa_id <> NEW.empresa_id THEN RAISE EXCEPTION 'La cuota no pertenece a la empresa informada'; END IF;
  IF NEW.tipo='REVERSION' AND NOT EXISTS (SELECT 1 FROM public.bajas_pagar b WHERE b.tenant_id=NEW.tenant_id AND b.id=NEW.reversion_de_id AND b.cuota_id=NEW.cuota_id AND b.tipo='BAJA') THEN RAISE EXCEPTION 'La reversión debe referirse a una baja original de la misma cuota'; END IF;
  IF NEW.tipo='REVERSION' AND EXISTS (SELECT 1 FROM public.bajas_pagar b WHERE b.tenant_id=NEW.tenant_id AND b.reversion_de_id=NEW.reversion_de_id) THEN RAISE EXCEPTION 'La baja original ya fue revertida'; END IF;
  SELECT COALESCE(SUM(CASE WHEN tipo='BAJA' THEN valor_pagado_minor+descuento_minor ELSE -(valor_pagado_minor+descuento_minor) END),0) INTO aplicado FROM public.bajas_pagar WHERE tenant_id=NEW.tenant_id AND cuota_id=NEW.cuota_id;
  delta := NEW.valor_pagado_minor + NEW.descuento_minor; IF NEW.tipo='REVERSION' THEN delta := -delta; END IF;
  IF aplicado + delta < 0 OR aplicado + delta > cuota_registro.valor_minor THEN RAISE EXCEPTION 'La baja supera el saldo disponible de la cuota'; END IF;
  efectivo := NEW.valor_pagado_minor + NEW.intereses_minor - NEW.descuento_minor;
  IF efectivo < 0 THEN RAISE EXCEPTION 'El descuento no puede superar el efectivo más intereses'; END IF;
  IF efectivo = 0 AND (NEW.caja_id IS NOT NULL OR NEW.movimiento_caja_id IS NOT NULL) THEN RAISE EXCEPTION 'Una baja sin efectivo no puede generar movimiento de caja'; END IF;
  IF efectivo > 0 THEN
    IF NEW.caja_id IS NULL OR NEW.movimiento_caja_id IS NULL THEN RAISE EXCEPTION 'La baja con efectivo exige caja y movimiento'; END IF;
    tipo_movimiento := CASE WHEN NEW.tipo='BAJA' THEN 'D' ELSE 'C' END;
    IF NOT EXISTS (SELECT 1 FROM public.movimientos_caja m WHERE m.tenant_id=NEW.tenant_id AND m.id=NEW.movimiento_caja_id AND m.empresa_id=NEW.empresa_id AND m.caja_id=NEW.caja_id AND m.moneda=cuota_registro.moneda AND m.tipo=tipo_movimiento AND m.origen='CP' AND m.valor_minor=efectivo) THEN RAISE EXCEPTION 'El movimiento de caja de la baja no es válido'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.validar_baja_cobrar_integridad()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE cuota_registro RECORD; aplicado BIGINT; delta BIGINT; efectivo BIGINT; tipo_movimiento CHAR(1);
BEGIN
  SELECT q.empresa_id, q.valor_minor, cc.moneda INTO cuota_registro
  FROM public.cuotas_cobrar q JOIN public.cuentas_cobrar cc ON cc.tenant_id=q.tenant_id AND cc.id=q.cuenta_cobrar_id
  WHERE q.tenant_id=NEW.tenant_id AND q.id=NEW.cuota_id;
  IF NOT FOUND OR cuota_registro.empresa_id <> NEW.empresa_id THEN RAISE EXCEPTION 'La cuota no pertenece a la empresa informada'; END IF;
  IF NEW.tipo='REVERSION' AND NOT EXISTS (SELECT 1 FROM public.bajas_cobrar b WHERE b.tenant_id=NEW.tenant_id AND b.id=NEW.reversion_de_id AND b.cuota_id=NEW.cuota_id AND b.tipo='BAJA') THEN RAISE EXCEPTION 'La reversión debe referirse a una baja original de la misma cuota'; END IF;
  IF NEW.tipo='REVERSION' AND EXISTS (SELECT 1 FROM public.bajas_cobrar b WHERE b.tenant_id=NEW.tenant_id AND b.reversion_de_id=NEW.reversion_de_id) THEN RAISE EXCEPTION 'La baja original ya fue revertida'; END IF;
  SELECT COALESCE(SUM(CASE WHEN tipo='BAJA' THEN valor_cobrado_minor+descuento_minor ELSE -(valor_cobrado_minor+descuento_minor) END),0) INTO aplicado FROM public.bajas_cobrar WHERE tenant_id=NEW.tenant_id AND cuota_id=NEW.cuota_id;
  delta := NEW.valor_cobrado_minor + NEW.descuento_minor; IF NEW.tipo='REVERSION' THEN delta := -delta; END IF;
  IF aplicado + delta < 0 OR aplicado + delta > cuota_registro.valor_minor THEN RAISE EXCEPTION 'La baja supera el saldo disponible de la cuota'; END IF;
  efectivo := NEW.valor_cobrado_minor + NEW.intereses_minor - NEW.descuento_minor;
  IF efectivo < 0 THEN RAISE EXCEPTION 'El descuento no puede superar el efectivo más intereses'; END IF;
  IF efectivo = 0 AND (NEW.caja_id IS NOT NULL OR NEW.movimiento_caja_id IS NOT NULL) THEN RAISE EXCEPTION 'Una baja sin efectivo no puede generar movimiento de caja'; END IF;
  IF efectivo > 0 THEN
    IF NEW.caja_id IS NULL OR NEW.movimiento_caja_id IS NULL THEN RAISE EXCEPTION 'La baja con efectivo exige caja y movimiento'; END IF;
    tipo_movimiento := CASE WHEN NEW.tipo='BAJA' THEN 'C' ELSE 'D' END;
    IF NOT EXISTS (SELECT 1 FROM public.movimientos_caja m WHERE m.tenant_id=NEW.tenant_id AND m.id=NEW.movimiento_caja_id AND m.empresa_id=NEW.empresa_id AND m.caja_id=NEW.caja_id AND m.moneda=cuota_registro.moneda AND m.tipo=tipo_movimiento AND m.origen='CC' AND m.valor_minor=efectivo) THEN RAISE EXCEPTION 'El movimiento de caja de la baja no es válido'; END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_bajas_pagar_integridad ON public.bajas_pagar;
CREATE TRIGGER trg_bajas_pagar_integridad BEFORE INSERT ON public.bajas_pagar FOR EACH ROW EXECUTE FUNCTION public.validar_baja_pagar_integridad();
DROP TRIGGER IF EXISTS trg_bajas_cobrar_integridad ON public.bajas_cobrar;
CREATE TRIGGER trg_bajas_cobrar_integridad BEFORE INSERT ON public.bajas_cobrar FOR EACH ROW EXECUTE FUNCTION public.validar_baja_cobrar_integridad();
CREATE UNIQUE INDEX IF NOT EXISTS bajas_pagar_reversion_unica ON public.bajas_pagar (tenant_id, reversion_de_id) WHERE reversion_de_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bajas_cobrar_reversion_unica ON public.bajas_cobrar (tenant_id, reversion_de_id) WHERE reversion_de_id IS NOT NULL;
