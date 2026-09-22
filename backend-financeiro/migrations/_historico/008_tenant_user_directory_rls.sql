CREATE OR REPLACE FUNCTION public.puede_acceder_empresa(p_tenant_id BIGINT, p_empresa_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios_tenants ut
    JOIN public.usuarios u ON u.id = ut.usuario_id
    WHERE ut.tenant_id = p_tenant_id
      AND u.tenant_id = p_tenant_id
      AND u.usuario_origem_codigo = NULLIF(current_setting('app.user_id', true), '')::INTEGER
      AND ut.rol = 'ADMIN_TENANT'
  ) OR EXISTS (
    SELECT 1
    FROM public.usuarios_empresas ue
    JOIN public.usuarios u ON u.id = ue.usuario_id
    WHERE ue.tenant_id = p_tenant_id
      AND u.tenant_id = p_tenant_id
      AND ue.empresa_id = p_empresa_id
      AND u.usuario_origem_codigo = NULLIF(current_setting('app.user_id', true), '')::INTEGER
  );
$$;

CREATE OR REPLACE FUNCTION public.es_admin_tenant(p_tenant_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios_tenants ut
    JOIN public.usuarios u ON u.id = ut.usuario_id
    WHERE ut.tenant_id = p_tenant_id
      AND u.tenant_id = p_tenant_id
      AND u.usuario_origem_codigo = NULLIF(current_setting('app.user_id', true), '')::INTEGER
      AND ut.rol = 'ADMIN_TENANT'
  );
$$;

DROP POLICY tenant_user_membership ON public.usuarios_tenants;
CREATE POLICY tenant_user_membership ON public.usuarios_tenants
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = usuario_id
        AND u.tenant_id = tenant_id
        AND u.usuario_origem_codigo = NULLIF(current_setting('app.user_id', true), '')::INTEGER
    )
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = usuario_id
        AND u.tenant_id = tenant_id
        AND u.usuario_origem_codigo = NULLIF(current_setting('app.user_id', true), '')::INTEGER
    )
  );

DROP POLICY tenant_user_company_access ON public.usuarios_empresas;
CREATE POLICY tenant_user_company_access ON public.usuarios_empresas
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = usuario_id
        AND u.tenant_id = tenant_id
        AND u.usuario_origem_codigo = NULLIF(current_setting('app.user_id', true), '')::INTEGER
    )
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = usuario_id
        AND u.tenant_id = tenant_id
        AND u.usuario_origem_codigo = NULLIF(current_setting('app.user_id', true), '')::INTEGER
    )
  );

DROP POLICY tenant_admin_consolidated_reports ON public.reportes_consolidados;
CREATE POLICY tenant_admin_consolidated_reports ON public.reportes_consolidados
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT AND public.es_admin_tenant(tenant_id))
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = solicitado_por
        AND u.tenant_id = tenant_id
        AND u.usuario_origem_codigo = NULLIF(current_setting('app.user_id', true), '')::INTEGER
    )
    AND public.es_admin_tenant(tenant_id)
  );
