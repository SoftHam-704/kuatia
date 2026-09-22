CREATE OR REPLACE FUNCTION public.es_admin_tenant(p_tenant_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios_tenants ut
    WHERE ut.tenant_id = p_tenant_id
      AND ut.usuario_id = NULLIF(current_setting('app.user_id', true), '')::BIGINT
      AND ut.rol = 'ADMIN_TENANT'
  );
$$;

CREATE TABLE IF NOT EXISTS public.reportes_consolidados (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  solicitado_por BIGINT NOT NULL REFERENCES public.usuarios(id),
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('SALDOS_CAJA', 'FLUJO_CAJA', 'RESULTADOS')),
  periodo_desde DATE NOT NULL,
  periodo_hasta DATE NOT NULL,
  moneda_destino CHAR(3) NOT NULL CHECK (moneda_destino IN ('PYG', 'USD', 'BRL')),
  criterio_cotizacion VARCHAR(30) NOT NULL CHECK (criterio_cotizacion IN ('FECHA_MOVIMIENTO', 'FECHA_CORTE')),
  fecha_cotizacion DATE,
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'GENERANDO', 'LISTO', 'INCOMPLETO', 'ERROR')),
  parametros JSONB NOT NULL DEFAULT '{}'::jsonb,
  resultado JSONB,
  generado_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (periodo_hasta >= periodo_desde),
  CHECK ((criterio_cotizacion = 'FECHA_MOVIMIENTO' AND fecha_cotizacion IS NULL) OR (criterio_cotizacion = 'FECHA_CORTE' AND fecha_cotizacion IS NOT NULL)),
  UNIQUE (tenant_id, id)
);

ALTER TABLE public.reportes_consolidados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reportes_consolidados FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_consolidated_reports ON public.reportes_consolidados
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT
    AND public.es_admin_tenant(tenant_id)
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT
    AND solicitado_por = NULLIF(current_setting('app.user_id', true), '')::BIGINT
    AND public.es_admin_tenant(tenant_id)
  );
