ALTER TABLE public.cuentas_pagar ADD CONSTRAINT cuentas_pagar_tenant_empresa_id_key UNIQUE (tenant_id, empresa_id, id);
ALTER TABLE public.cuentas_cobrar ADD CONSTRAINT cuentas_cobrar_tenant_empresa_id_key UNIQUE (tenant_id, empresa_id, id);

ALTER TABLE public.cuotas_pagar ADD COLUMN empresa_id BIGINT NOT NULL;
ALTER TABLE public.cuotas_cobrar ADD COLUMN empresa_id BIGINT NOT NULL;
ALTER TABLE public.bajas_pagar ADD COLUMN empresa_id BIGINT NOT NULL;
ALTER TABLE public.bajas_cobrar ADD COLUMN empresa_id BIGINT NOT NULL;

ALTER TABLE public.cuotas_pagar
  ADD CONSTRAINT cuotas_pagar_tenant_empresa_cuenta_fkey
  FOREIGN KEY (tenant_id, empresa_id, cuenta_pagar_id) REFERENCES public.cuentas_pagar(tenant_id, empresa_id, id);
ALTER TABLE public.cuotas_cobrar
  ADD CONSTRAINT cuotas_cobrar_tenant_empresa_cuenta_fkey
  FOREIGN KEY (tenant_id, empresa_id, cuenta_cobrar_id) REFERENCES public.cuentas_cobrar(tenant_id, empresa_id, id);
ALTER TABLE public.cuotas_pagar ADD CONSTRAINT cuotas_pagar_tenant_empresa_id_key UNIQUE (tenant_id, empresa_id, id);
ALTER TABLE public.cuotas_cobrar ADD CONSTRAINT cuotas_cobrar_tenant_empresa_id_key UNIQUE (tenant_id, empresa_id, id);

ALTER TABLE public.bajas_pagar
  ADD CONSTRAINT bajas_pagar_tenant_empresa_cuota_fkey
  FOREIGN KEY (tenant_id, empresa_id, cuota_id) REFERENCES public.cuotas_pagar(tenant_id, empresa_id, id);
ALTER TABLE public.bajas_cobrar
  ADD CONSTRAINT bajas_cobrar_tenant_empresa_cuota_fkey
  FOREIGN KEY (tenant_id, empresa_id, cuota_id) REFERENCES public.cuotas_cobrar(tenant_id, empresa_id, id);

CREATE OR REPLACE FUNCTION public.puede_acceder_empresa(p_tenant_id BIGINT, p_empresa_id BIGINT)
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
  ) OR EXISTS (
    SELECT 1 FROM public.usuarios_empresas ue
    WHERE ue.tenant_id = p_tenant_id
      AND ue.empresa_id = p_empresa_id
      AND ue.usuario_id = NULLIF(current_setting('app.user_id', true), '')::BIGINT
  );
$$;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_self ON public.tenants
  USING (id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT)
  WITH CHECK (id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT);

DROP POLICY tenant_isolation ON public.usuarios_tenants;
CREATE POLICY tenant_user_membership ON public.usuarios_tenants
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT AND usuario_id = NULLIF(current_setting('app.user_id', true), '')::BIGINT)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT AND usuario_id = NULLIF(current_setting('app.user_id', true), '')::BIGINT);

DROP POLICY tenant_isolation ON public.usuarios_empresas;
CREATE POLICY tenant_user_company_access ON public.usuarios_empresas
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT AND usuario_id = NULLIF(current_setting('app.user_id', true), '')::BIGINT)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT AND usuario_id = NULLIF(current_setting('app.user_id', true), '')::BIGINT);

DO $$
DECLARE tabla TEXT;
BEGIN
  DROP POLICY tenant_isolation ON public.empresas;
  CREATE POLICY tenant_company_isolation ON public.empresas
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT AND public.puede_acceder_empresa(tenant_id, id))
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT AND public.puede_acceder_empresa(tenant_id, id));

  FOREACH tabla IN ARRAY ARRAY[
    'centros_costo','cajas','cuentas_pagar','cuotas_pagar','cuentas_cobrar','cuotas_cobrar',
    'movimientos_caja','bajas_pagar','bajas_cobrar'
  ] LOOP
    EXECUTE format('DROP POLICY tenant_isolation ON public.%I', tabla);
    EXECUTE format('CREATE POLICY tenant_company_isolation ON public.%I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::BIGINT AND public.puede_acceder_empresa(tenant_id, empresa_id)) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::BIGINT AND public.puede_acceder_empresa(tenant_id, empresa_id))', tabla);
  END LOOP;
END $$;
