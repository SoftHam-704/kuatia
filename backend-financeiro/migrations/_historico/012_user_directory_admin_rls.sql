DROP POLICY IF EXISTS tenant_user_self ON public.usuarios;
CREATE POLICY tenant_user_directory ON public.usuarios
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT
    AND (
      usuario_origem_codigo = NULLIF(current_setting('app.user_id', true), '')::INTEGER
      OR public.es_admin_tenant(tenant_id)
    )
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT
    AND (
      usuario_origem_codigo = NULLIF(current_setting('app.user_id', true), '')::INTEGER
      OR public.es_admin_tenant(tenant_id)
    )
  );

DROP POLICY IF EXISTS tenant_user_membership ON public.usuarios_tenants;
CREATE POLICY tenant_user_membership ON public.usuarios_tenants
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT
    AND (
      public.es_admin_tenant(tenant_id)
      OR EXISTS (
        SELECT 1 FROM public.usuarios u
        WHERE u.id = usuario_id AND u.tenant_id = tenant_id
          AND u.usuario_origem_codigo = NULLIF(current_setting('app.user_id', true), '')::INTEGER
      )
    )
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT
    AND (
      public.es_admin_tenant(tenant_id)
      OR EXISTS (
        SELECT 1 FROM public.usuarios u
        WHERE u.id = usuario_id AND u.tenant_id = tenant_id
          AND u.usuario_origem_codigo = NULLIF(current_setting('app.user_id', true), '')::INTEGER
      )
    )
  );

DROP POLICY IF EXISTS tenant_user_company_access ON public.usuarios_empresas;
CREATE POLICY tenant_user_company_access ON public.usuarios_empresas
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT
    AND (
      public.es_admin_tenant(tenant_id)
      OR EXISTS (
        SELECT 1 FROM public.usuarios u
        WHERE u.id = usuario_id AND u.tenant_id = tenant_id
          AND u.usuario_origem_codigo = NULLIF(current_setting('app.user_id', true), '')::INTEGER
      )
    )
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT
    AND public.es_admin_tenant(tenant_id)
  );
