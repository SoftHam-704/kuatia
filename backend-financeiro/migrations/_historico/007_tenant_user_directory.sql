ALTER TABLE public.tenants ADD COLUMN login_schema VARCHAR(63);
UPDATE public.tenants SET login_schema = 'pinheirao' WHERE id = 120;
ALTER TABLE public.tenants ALTER COLUMN login_schema SET NOT NULL;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_login_schema_format CHECK (login_schema ~ '^[a-z_][a-z0-9_]*$');

ALTER TABLE public.usuarios RENAME COLUMN master_usuario_id TO usuario_origem_codigo;
ALTER TABLE public.usuarios DROP CONSTRAINT usuarios_master_usuario_id_key;
ALTER TABLE public.usuarios ADD COLUMN tenant_id BIGINT REFERENCES public.tenants(id);
ALTER TABLE public.usuarios ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.usuarios ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_tenant_codigo_key UNIQUE (tenant_id, usuario_origem_codigo);
COMMENT ON COLUMN public.usuarios.usuario_origem_codigo IS 'Código da tabela user_nomes no schema de login do tenant.';

DROP POLICY master_user_self ON public.usuarios;
CREATE POLICY tenant_user_self ON public.usuarios
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT
    AND usuario_origem_codigo = NULLIF(current_setting('app.user_id', true), '')::INTEGER
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT
    AND usuario_origem_codigo = NULLIF(current_setting('app.user_id', true), '')::INTEGER
  );

CREATE TABLE IF NOT EXISTS pinheirao.user_nomes (
  codigo INTEGER PRIMARY KEY,
  nome VARCHAR(20) NOT NULL,
  sobrenome VARCHAR(20) NOT NULL,
  senha VARCHAR(20) NOT NULL,
  grupo VARCHAR(20),
  imagem BYTEA,
  master BOOLEAN NOT NULL DEFAULT FALSE,
  gerencia BOOLEAN NOT NULL DEFAULT FALSE,
  usuario VARCHAR(20),
  telefone VARCHAR(20),
  iniciais VARCHAR(4),
  ativo BOOLEAN NOT NULL DEFAULT TRUE
);
