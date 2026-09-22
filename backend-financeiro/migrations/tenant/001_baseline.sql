-- ============================================================================
-- Estrutura de UM tenant — roda uma vez por schema
-- ============================================================================
--
-- `npm run migrate:tenant -- <schema>`
--
-- 🔴 NADA aqui é qualificado com `public.` — quem resolve é o `search_path`,
--    fixado pelo migrador no schema de destino. Um `public.` esquecido nesta
--    pasta cria a tabela no lugar errado e o `search_path` não corrige: nome
--    qualificado ganha do `search_path`, sempre.
--
-- ✅ As DUAS exceções são propositais e estão comentadas onde aparecem:
--    `public.tenants` é o registro compartilhado de tenants. Se alguém
--    "padronizar" isso tirando o prefixo, a FK passa a procurar uma tabela
--    inexistente no schema do tenant.
--
-- Idempotente: pode rodar de novo num schema já criado sem estragar nada.
-- ============================================================================

-- ── Empresas do grupo ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS empresas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),   -- public: compartilhado
  razon_social VARCHAR(200) NOT NULL,
  nombre_fantasia VARCHAR(200),
  ruc VARCHAR(20),
  moneda_base CHAR(3) NOT NULL DEFAULT 'PYG' CHECK (moneda_base IN ('PYG', 'USD', 'BRL')),
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tipo_documento VARCHAR(4) CHECK (tipo_documento IN ('CNPJ', 'RUC')),
  documento_principal VARCHAR(20),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, ruc),
  CONSTRAINT empresas_tenant_documento_key UNIQUE (tenant_id, documento_principal)
);

-- ── Identidade financeira, espelhada do diretório de login ──────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  email VARCHAR(254) UNIQUE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  usuario_origem_codigo INTEGER NOT NULL,
  sobrenome VARCHAR(150) NOT NULL DEFAULT '',
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),   -- public: compartilhado
  CONSTRAINT usuarios_tenant_codigo_key UNIQUE (tenant_id, usuario_origem_codigo)
);

CREATE TABLE IF NOT EXISTS usuarios_tenants (
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),   -- public: compartilhado
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id),
  rol VARCHAR(30) NOT NULL CHECK (rol IN ('ADMIN_TENANT', 'OPERADOR', 'CONSULTA')),
  PRIMARY KEY (tenant_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS usuarios_empresas (
  tenant_id BIGINT NOT NULL,
  usuario_id BIGINT NOT NULL,
  empresa_id BIGINT NOT NULL,
  PRIMARY KEY (tenant_id, usuario_id, empresa_id),
  FOREIGN KEY (tenant_id, usuario_id) REFERENCES usuarios_tenants(tenant_id, usuario_id),
  FOREIGN KEY (tenant_id, empresa_id) REFERENCES empresas(tenant_id, id)
);

-- ── Plano de contas e centro de custo ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS planes_cuentas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),   -- public: compartilhado
  nombre VARCHAR(100) NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, nombre)
);

CREATE TABLE IF NOT EXISTS cuentas_plan (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  plan_id BIGINT NOT NULL,
  codigo VARCHAR(20) NOT NULL,
  descripcion VARCHAR(200) NOT NULL,
  naturaleza CHAR(1) NOT NULL CHECK (naturaleza IN ('R', 'D')),
  nivel SMALLINT NOT NULL CHECK (nivel BETWEEN 1 AND 3),
  id_padre BIGINT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, plan_id, codigo),
  FOREIGN KEY (tenant_id, plan_id) REFERENCES planes_cuentas(tenant_id, id),
  FOREIGN KEY (tenant_id, id_padre) REFERENCES cuentas_plan(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS empresas_planes_cuentas (
  tenant_id BIGINT NOT NULL,
  empresa_id BIGINT NOT NULL,
  plan_id BIGINT NOT NULL,
  PRIMARY KEY (tenant_id, empresa_id, plan_id),
  FOREIGN KEY (tenant_id, empresa_id) REFERENCES empresas(tenant_id, id),
  FOREIGN KEY (tenant_id, plan_id) REFERENCES planes_cuentas(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS centros_costo (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  empresa_id BIGINT NOT NULL,
  codigo VARCHAR(20),
  descripcion VARCHAR(100) NOT NULL,
  id_padre BIGINT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, empresa_id, id),
  UNIQUE (tenant_id, empresa_id, codigo),
  FOREIGN KEY (tenant_id, empresa_id) REFERENCES empresas(tenant_id, id),
  FOREIGN KEY (tenant_id, empresa_id, id_padre) REFERENCES centros_costo(tenant_id, empresa_id, id)
);

-- ── Clientes e fornecedores ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contrapartes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),   -- public: compartilhado
  tipo_persona CHAR(1) NOT NULL CHECK (tipo_persona IN ('F', 'J')),
  ruc VARCHAR(20),
  razon_social VARCHAR(200) NOT NULL,
  nombre_fantasia VARCHAR(200),
  direccion VARCHAR(200), numero VARCHAR(20), barrio VARCHAR(100), ciudad VARCHAR(100), departamento VARCHAR(50),
  telefono VARCHAR(20), celular VARCHAR(20), email VARCHAR(100), observaciones TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS cotizaciones (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),   -- public: compartilhado
  fecha DATE NOT NULL,
  moneda_origen CHAR(3) NOT NULL CHECK (moneda_origen IN ('PYG', 'USD', 'BRL')),
  moneda_destino CHAR(3) NOT NULL CHECK (moneda_destino IN ('PYG', 'USD', 'BRL')),
  tasa NUMERIC(30,15) NOT NULL CHECK (tasa > 0),
  fuente VARCHAR(100),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (moneda_origen <> moneda_destino),
  UNIQUE (tenant_id, fecha, moneda_origen, moneda_destino)
);

-- ── Caixas e movimentos ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cajas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL, empresa_id BIGINT NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  tipo VARCHAR(20) NOT NULL DEFAULT 'caja' CHECK (tipo IN ('caja', 'banco')),
  moneda CHAR(3) NOT NULL DEFAULT 'PYG' CHECK (moneda IN ('PYG', 'USD', 'BRL')),
  saldo_inicial_minor BIGINT NOT NULL DEFAULT 0,
  fecha_saldo_inicial DATE NOT NULL DEFAULT CURRENT_DATE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, empresa_id) REFERENCES empresas(tenant_id, id)
);

-- Valor é sempre positivo; o sinal vem de `tipo`. Valor negativo com tipo
-- crédito é a receita de relatório que não fecha.
CREATE TABLE IF NOT EXISTS movimientos_caja (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL, empresa_id BIGINT NOT NULL, caja_id BIGINT NOT NULL,
  fecha DATE NOT NULL, historico TEXT NOT NULL, tipo CHAR(1) NOT NULL CHECK (tipo IN ('C', 'D')),
  moneda CHAR(3) NOT NULL CHECK (moneda IN ('PYG', 'USD', 'BRL')),
  valor_minor BIGINT NOT NULL CHECK (valor_minor > 0),
  cuenta_plan_id BIGINT, centro_costo_id BIGINT, documento VARCHAR(60),
  origen CHAR(2) NOT NULL DEFAULT 'MA' CHECK (origen IN ('MA', 'CP', 'CC', 'TR')),
  cuota_origen_id BIGINT, transferencia_id UUID,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, empresa_id) REFERENCES empresas(tenant_id, id),
  FOREIGN KEY (tenant_id, caja_id) REFERENCES cajas(tenant_id, id),
  FOREIGN KEY (tenant_id, cuenta_plan_id) REFERENCES cuentas_plan(tenant_id, id),
  FOREIGN KEY (tenant_id, centro_costo_id) REFERENCES centros_costo(tenant_id, id)
);

-- ── Contas a pagar: compromisso → parcela → livro de baixas ─────────────────
CREATE TABLE IF NOT EXISTS cuentas_pagar (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL, empresa_id BIGINT NOT NULL,
  descripcion VARCHAR(200) NOT NULL, contraparte_id BIGINT, numero_documento VARCHAR(50),
  moneda CHAR(3) NOT NULL CHECK (moneda IN ('PYG', 'USD', 'BRL')),
  valor_total_minor BIGINT NOT NULL CHECK (valor_total_minor >= 0),
  valor_pagado_minor BIGINT NOT NULL DEFAULT 0 CHECK (valor_pagado_minor >= 0),
  fecha_emision DATE NOT NULL, fecha_vencimiento DATE NOT NULL, fecha_pago DATE,
  estado VARCHAR(20) NOT NULL DEFAULT 'ABIERTO' CHECK (estado IN ('ABIERTO', 'PAGADO', 'VENCIDO', 'CANCELADO')),
  cuenta_plan_id BIGINT, centro_costo_id BIGINT,
  iva_tipo VARCHAR(6) CHECK (iva_tipo IN ('10', '5', 'EXENTA')),
  iva_valor_minor BIGINT NOT NULL DEFAULT 0 CHECK (iva_valor_minor >= 0),
  observaciones TEXT, creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(), creado_por BIGINT,
  UNIQUE (tenant_id, id),
  CONSTRAINT cuentas_pagar_tenant_empresa_id_key UNIQUE (tenant_id, empresa_id, id),
  FOREIGN KEY (tenant_id, empresa_id) REFERENCES empresas(tenant_id, id),
  FOREIGN KEY (tenant_id, contraparte_id) REFERENCES contrapartes(tenant_id, id),
  FOREIGN KEY (tenant_id, cuenta_plan_id) REFERENCES cuentas_plan(tenant_id, id),
  FOREIGN KEY (tenant_id, centro_costo_id) REFERENCES centros_costo(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS cuotas_pagar (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL, cuenta_pagar_id BIGINT NOT NULL,
  numero_cuota INTEGER NOT NULL CHECK (numero_cuota > 0),
  valor_minor BIGINT NOT NULL CHECK (valor_minor >= 0),
  fecha_vencimiento DATE NOT NULL, fecha_pago DATE,
  valor_pagado_minor BIGINT NOT NULL DEFAULT 0 CHECK (valor_pagado_minor >= 0),
  intereses_minor BIGINT NOT NULL DEFAULT 0 CHECK (intereses_minor >= 0),
  descuento_minor BIGINT NOT NULL DEFAULT 0 CHECK (descuento_minor >= 0),
  estado VARCHAR(20) NOT NULL DEFAULT 'ABIERTO' CHECK (estado IN ('ABIERTO', 'PAGADO', 'VENCIDO', 'CANCELADO')),
  observaciones TEXT,
  empresa_id BIGINT NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, cuenta_pagar_id, numero_cuota),
  CONSTRAINT cuotas_pagar_tenant_empresa_id_key UNIQUE (tenant_id, empresa_id, id),
  FOREIGN KEY (tenant_id, cuenta_pagar_id) REFERENCES cuentas_pagar(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT cuotas_pagar_tenant_empresa_cuenta_fkey
    FOREIGN KEY (tenant_id, empresa_id, cuenta_pagar_id) REFERENCES cuentas_pagar(tenant_id, empresa_id, id)
);

-- 🚨 `bajas` é um LIVRO: só recebe INSERT. Estorno não apaga a baixa original —
-- cria linha nova com tipo='REVERSION' apontando para ela. O saldo da parcela é
-- a soma do livro, nunca um campo editado. O trigger mais abaixo impede UPDATE
-- e DELETE; não é convenção, é impedimento.
CREATE TABLE IF NOT EXISTS bajas_pagar (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL, cuota_id BIGINT NOT NULL,
  tipo VARCHAR(10) NOT NULL DEFAULT 'BAJA' CHECK (tipo IN ('BAJA', 'REVERSION')),
  fecha DATE NOT NULL,
  valor_pagado_minor BIGINT NOT NULL DEFAULT 0 CHECK (valor_pagado_minor >= 0),
  intereses_minor BIGINT NOT NULL DEFAULT 0 CHECK (intereses_minor >= 0),
  descuento_minor BIGINT NOT NULL DEFAULT 0 CHECK (descuento_minor >= 0),
  caja_id BIGINT, movimiento_caja_id BIGINT, reversion_de_id BIGINT,
  observaciones TEXT, creado_por BIGINT, creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  empresa_id BIGINT NOT NULL,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, cuota_id) REFERENCES cuotas_pagar(tenant_id, id),
  FOREIGN KEY (tenant_id, caja_id) REFERENCES cajas(tenant_id, id),
  FOREIGN KEY (tenant_id, movimiento_caja_id) REFERENCES movimientos_caja(tenant_id, id),
  FOREIGN KEY (tenant_id, reversion_de_id) REFERENCES bajas_pagar(tenant_id, id),
  CONSTRAINT bajas_pagar_tenant_empresa_cuota_fkey
    FOREIGN KEY (tenant_id, empresa_id, cuota_id) REFERENCES cuotas_pagar(tenant_id, empresa_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS bajas_pagar_reversion_unica
  ON bajas_pagar (tenant_id, reversion_de_id) WHERE reversion_de_id IS NOT NULL;

-- ── Contas a receber: espelho do acima ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS cuentas_cobrar (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL, empresa_id BIGINT NOT NULL,
  descripcion VARCHAR(200) NOT NULL, contraparte_id BIGINT, numero_documento VARCHAR(50),
  timbrado VARCHAR(20), numero_factura VARCHAR(30),   -- preparação: guardados, não usados
  moneda CHAR(3) NOT NULL CHECK (moneda IN ('PYG', 'USD', 'BRL')),
  valor_total_minor BIGINT NOT NULL CHECK (valor_total_minor >= 0),
  valor_cobrado_minor BIGINT NOT NULL DEFAULT 0 CHECK (valor_cobrado_minor >= 0),
  fecha_emision DATE NOT NULL, fecha_vencimiento DATE NOT NULL, fecha_cobro DATE,
  estado VARCHAR(20) NOT NULL DEFAULT 'ABIERTO' CHECK (estado IN ('ABIERTO', 'COBRADO', 'VENCIDO', 'CANCELADO')),
  cuenta_plan_id BIGINT, centro_costo_id BIGINT,
  iva_tipo VARCHAR(6) CHECK (iva_tipo IN ('10', '5', 'EXENTA')),
  iva_valor_minor BIGINT NOT NULL DEFAULT 0 CHECK (iva_valor_minor >= 0),
  observaciones TEXT, creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(), creado_por BIGINT,
  UNIQUE (tenant_id, id),
  CONSTRAINT cuentas_cobrar_tenant_empresa_id_key UNIQUE (tenant_id, empresa_id, id),
  FOREIGN KEY (tenant_id, empresa_id) REFERENCES empresas(tenant_id, id),
  FOREIGN KEY (tenant_id, contraparte_id) REFERENCES contrapartes(tenant_id, id),
  FOREIGN KEY (tenant_id, cuenta_plan_id) REFERENCES cuentas_plan(tenant_id, id),
  FOREIGN KEY (tenant_id, centro_costo_id) REFERENCES centros_costo(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS cuotas_cobrar (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL, cuenta_cobrar_id BIGINT NOT NULL,
  numero_cuota INTEGER NOT NULL CHECK (numero_cuota > 0),
  valor_minor BIGINT NOT NULL CHECK (valor_minor >= 0),
  fecha_vencimiento DATE NOT NULL, fecha_cobro DATE,
  valor_cobrado_minor BIGINT NOT NULL DEFAULT 0 CHECK (valor_cobrado_minor >= 0),
  intereses_minor BIGINT NOT NULL DEFAULT 0 CHECK (intereses_minor >= 0),
  descuento_minor BIGINT NOT NULL DEFAULT 0 CHECK (descuento_minor >= 0),
  estado VARCHAR(20) NOT NULL DEFAULT 'ABIERTO' CHECK (estado IN ('ABIERTO', 'COBRADO', 'VENCIDO', 'CANCELADO')),
  observaciones TEXT,
  empresa_id BIGINT NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, cuenta_cobrar_id, numero_cuota),
  CONSTRAINT cuotas_cobrar_tenant_empresa_id_key UNIQUE (tenant_id, empresa_id, id),
  FOREIGN KEY (tenant_id, cuenta_cobrar_id) REFERENCES cuentas_cobrar(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT cuotas_cobrar_tenant_empresa_cuenta_fkey
    FOREIGN KEY (tenant_id, empresa_id, cuenta_cobrar_id) REFERENCES cuentas_cobrar(tenant_id, empresa_id, id)
);

CREATE TABLE IF NOT EXISTS bajas_cobrar (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL, cuota_id BIGINT NOT NULL,
  tipo VARCHAR(10) NOT NULL DEFAULT 'BAJA' CHECK (tipo IN ('BAJA', 'REVERSION')),
  fecha DATE NOT NULL,
  valor_cobrado_minor BIGINT NOT NULL DEFAULT 0 CHECK (valor_cobrado_minor >= 0),
  intereses_minor BIGINT NOT NULL DEFAULT 0 CHECK (intereses_minor >= 0),
  descuento_minor BIGINT NOT NULL DEFAULT 0 CHECK (descuento_minor >= 0),
  caja_id BIGINT, movimiento_caja_id BIGINT, reversion_de_id BIGINT,
  observaciones TEXT, creado_por BIGINT, creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  empresa_id BIGINT NOT NULL,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, cuota_id) REFERENCES cuotas_cobrar(tenant_id, id),
  FOREIGN KEY (tenant_id, caja_id) REFERENCES cajas(tenant_id, id),
  FOREIGN KEY (tenant_id, movimiento_caja_id) REFERENCES movimientos_caja(tenant_id, id),
  FOREIGN KEY (tenant_id, reversion_de_id) REFERENCES bajas_cobrar(tenant_id, id),
  CONSTRAINT bajas_cobrar_tenant_empresa_cuota_fkey
    FOREIGN KEY (tenant_id, empresa_id, cuota_id) REFERENCES cuotas_cobrar(tenant_id, empresa_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS bajas_cobrar_reversion_unica
  ON bajas_cobrar (tenant_id, reversion_de_id) WHERE reversion_de_id IS NOT NULL;

-- ── Importações, relatórios e auditoria ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS documentos_importados (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),   -- public: compartilhado
  empresa_id BIGINT NOT NULL,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('XML_COMPRA', 'EXTRACTO_BANCARIO')),
  identificador_origen VARCHAR(120) NOT NULL,
  hash_archivo CHAR(64) NOT NULL,
  cuenta_pagar_id BIGINT,
  archivo_xml TEXT,
  datos_extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  creado_por BIGINT NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT documentos_importados_empresa_fkey FOREIGN KEY (tenant_id, empresa_id) REFERENCES empresas(tenant_id, id),
  CONSTRAINT documentos_importados_unico UNIQUE (tenant_id, empresa_id, tipo, identificador_origen),
  CONSTRAINT documentos_importados_hash_unico UNIQUE (tenant_id, empresa_id, hash_archivo)
);

CREATE TABLE IF NOT EXISTS reportes_consolidados (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),   -- public: compartilhado
  solicitado_por BIGINT NOT NULL REFERENCES usuarios(id),
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
  CHECK ((criterio_cotizacion = 'FECHA_MOVIMIENTO' AND fecha_cotizacion IS NULL)
      OR (criterio_cotizacion = 'FECHA_CORTE' AND fecha_cotizacion IS NOT NULL)),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS auditoria_eventos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),   -- public: compartilhado
  empresa_id BIGINT,
  usuario_origem_codigo INTEGER NOT NULL,
  accion VARCHAR(60) NOT NULL,
  entidad VARCHAR(60) NOT NULL,
  entidad_id VARCHAR(80),
  detalle JSONB NOT NULL DEFAULT '{}'::jsonb,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS auditoria_eventos_tenant_fecha_idx
  ON auditoria_eventos (tenant_id, creado_en DESC);

-- ── Diretório de login legado ───────────────────────────────────────────────
-- Compartilhado em FORMATO com os outros produtos da casa (não em dados): cada
-- tenant tem o seu. `senha` segue em texto puro porque os vizinhos ainda a leem;
-- o Kuatiá autentica por `senha_hash`.
CREATE TABLE IF NOT EXISTS user_nomes (
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
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  senha_hash TEXT
);
