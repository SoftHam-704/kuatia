CREATE TABLE IF NOT EXISTS public.auditoria_eventos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  empresa_id BIGINT,
  usuario_origem_codigo INTEGER NOT NULL,
  accion VARCHAR(60) NOT NULL,
  entidad VARCHAR(60) NOT NULL,
  entidad_id VARCHAR(80),
  detalle JSONB NOT NULL DEFAULT '{}'::jsonb,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS auditoria_eventos_tenant_fecha_idx ON public.auditoria_eventos (tenant_id, creado_en DESC);
ALTER TABLE public.auditoria_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_eventos FORCE ROW LEVEL SECURITY;
CREATE POLICY auditoria_admin_lectura ON public.auditoria_eventos
  FOR SELECT USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT AND public.es_admin_tenant(tenant_id));
CREATE POLICY auditoria_registro_propietario ON public.auditoria_eventos
  FOR INSERT WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT AND usuario_origem_codigo = NULLIF(current_setting('app.user_id', true), '')::INTEGER);
