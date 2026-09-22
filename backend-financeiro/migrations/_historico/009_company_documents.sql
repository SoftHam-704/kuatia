ALTER TABLE public.empresas ADD COLUMN tipo_documento VARCHAR(4) CHECK (tipo_documento IN ('CNPJ', 'RUC'));
ALTER TABLE public.empresas ADD COLUMN documento_principal VARCHAR(20);
UPDATE public.empresas SET tipo_documento = 'RUC', documento_principal = ruc WHERE ruc IS NOT NULL;
ALTER TABLE public.empresas ADD CONSTRAINT empresas_tenant_documento_key UNIQUE (tenant_id, documento_principal);
