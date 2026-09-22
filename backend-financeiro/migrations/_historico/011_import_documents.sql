CREATE TABLE IF NOT EXISTS public.documentos_importados (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  empresa_id BIGINT NOT NULL,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('XML_COMPRA', 'EXTRACTO_BANCARIO')),
  identificador_origen VARCHAR(120) NOT NULL,
  hash_archivo CHAR(64) NOT NULL,
  cuenta_pagar_id BIGINT,
  archivo_xml TEXT,
  datos_extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  creado_por BIGINT NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT documentos_importados_empresa_fkey FOREIGN KEY (tenant_id, empresa_id) REFERENCES public.empresas(tenant_id, id),
  CONSTRAINT documentos_importados_unico UNIQUE (tenant_id, empresa_id, tipo, identificador_origen),
  CONSTRAINT documentos_importados_hash_unico UNIQUE (tenant_id, empresa_id, hash_archivo)
);

ALTER TABLE public.documentos_importados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos_importados FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_company_isolation ON public.documentos_importados;
CREATE POLICY tenant_company_isolation ON public.documentos_importados
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT AND public.puede_acceder_empresa(tenant_id, empresa_id))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT AND public.puede_acceder_empresa(tenant_id, empresa_id));
