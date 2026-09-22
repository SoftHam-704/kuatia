CREATE TABLE IF NOT EXISTS public.tenants (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  ruc VARCHAR(20),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.empresas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  razon_social VARCHAR(200) NOT NULL,
  nombre_fantasia VARCHAR(200),
  ruc VARCHAR(20),
  moneda_base CHAR(3) NOT NULL DEFAULT 'PYG' CHECK (moneda_base IN ('PYG', 'USD', 'BRL')),
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, ruc)
);

CREATE TABLE IF NOT EXISTS public.usuarios (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.usuarios_tenants (
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  usuario_id BIGINT NOT NULL REFERENCES public.usuarios(id),
  rol VARCHAR(30) NOT NULL CHECK (rol IN ('ADMIN_TENANT', 'OPERADOR', 'CONSULTA')),
  PRIMARY KEY (tenant_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS public.usuarios_empresas (
  tenant_id BIGINT NOT NULL,
  usuario_id BIGINT NOT NULL,
  empresa_id BIGINT NOT NULL,
  PRIMARY KEY (tenant_id, usuario_id, empresa_id),
  FOREIGN KEY (tenant_id, usuario_id) REFERENCES public.usuarios_tenants(tenant_id, usuario_id),
  FOREIGN KEY (tenant_id, empresa_id) REFERENCES public.empresas(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS public.plantillas_plan_cuentas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  pais CHAR(2) NOT NULL DEFAULT 'PY',
  activa BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS public.plantillas_plan_cuentas_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plantilla_id BIGINT NOT NULL REFERENCES public.plantillas_plan_cuentas(id) ON DELETE CASCADE,
  codigo VARCHAR(20) NOT NULL,
  descripcion VARCHAR(200) NOT NULL,
  naturaleza CHAR(1) NOT NULL CHECK (naturaleza IN ('R', 'D')),
  nivel SMALLINT NOT NULL CHECK (nivel BETWEEN 1 AND 3),
  id_padre BIGINT REFERENCES public.plantillas_plan_cuentas_items(id),
  UNIQUE (plantilla_id, codigo)
);

CREATE TABLE IF NOT EXISTS public.planes_cuentas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  nombre VARCHAR(100) NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, nombre)
);

CREATE TABLE IF NOT EXISTS public.cuentas_plan (
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
  FOREIGN KEY (tenant_id, plan_id) REFERENCES public.planes_cuentas(tenant_id, id),
  FOREIGN KEY (tenant_id, id_padre) REFERENCES public.cuentas_plan(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS public.empresas_planes_cuentas (
  tenant_id BIGINT NOT NULL,
  empresa_id BIGINT NOT NULL,
  plan_id BIGINT NOT NULL,
  PRIMARY KEY (tenant_id, empresa_id, plan_id),
  FOREIGN KEY (tenant_id, empresa_id) REFERENCES public.empresas(tenant_id, id),
  FOREIGN KEY (tenant_id, plan_id) REFERENCES public.planes_cuentas(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS public.centros_costo (
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
  FOREIGN KEY (tenant_id, empresa_id) REFERENCES public.empresas(tenant_id, id),
  FOREIGN KEY (tenant_id, empresa_id, id_padre) REFERENCES public.centros_costo(tenant_id, empresa_id, id)
);

CREATE TABLE IF NOT EXISTS public.contrapartes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
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

CREATE TABLE IF NOT EXISTS public.cotizaciones (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  fecha DATE NOT NULL,
  moneda_origen CHAR(3) NOT NULL CHECK (moneda_origen IN ('PYG', 'USD', 'BRL')),
  moneda_destino CHAR(3) NOT NULL CHECK (moneda_destino IN ('PYG', 'USD', 'BRL')),
  tasa NUMERIC(30,15) NOT NULL CHECK (tasa > 0),
  fuente VARCHAR(100), creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (moneda_origen <> moneda_destino),
  UNIQUE (tenant_id, fecha, moneda_origen, moneda_destino)
);

CREATE TABLE IF NOT EXISTS public.cajas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL, empresa_id BIGINT NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  tipo VARCHAR(20) NOT NULL DEFAULT 'caja' CHECK (tipo IN ('caja', 'banco')),
  moneda CHAR(3) NOT NULL DEFAULT 'PYG' CHECK (moneda IN ('PYG', 'USD', 'BRL')),
  saldo_inicial_minor BIGINT NOT NULL DEFAULT 0,
  fecha_saldo_inicial DATE NOT NULL DEFAULT CURRENT_DATE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, empresa_id) REFERENCES public.empresas(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS public.cuentas_pagar (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL, empresa_id BIGINT NOT NULL,
  descripcion VARCHAR(200) NOT NULL, contraparte_id BIGINT, numero_documento VARCHAR(50),
  moneda CHAR(3) NOT NULL CHECK (moneda IN ('PYG', 'USD', 'BRL')),
  valor_total_minor BIGINT NOT NULL CHECK (valor_total_minor >= 0), valor_pagado_minor BIGINT NOT NULL DEFAULT 0 CHECK (valor_pagado_minor >= 0),
  fecha_emision DATE NOT NULL, fecha_vencimiento DATE NOT NULL, fecha_pago DATE,
  estado VARCHAR(20) NOT NULL DEFAULT 'ABIERTO' CHECK (estado IN ('ABIERTO', 'PAGADO', 'VENCIDO', 'CANCELADO')),
  cuenta_plan_id BIGINT, centro_costo_id BIGINT,
  iva_tipo VARCHAR(6) CHECK (iva_tipo IN ('10', '5', 'EXENTA')), iva_valor_minor BIGINT NOT NULL DEFAULT 0 CHECK (iva_valor_minor >= 0),
  observaciones TEXT, creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(), creado_por BIGINT,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, empresa_id) REFERENCES public.empresas(tenant_id, id),
  FOREIGN KEY (tenant_id, contraparte_id) REFERENCES public.contrapartes(tenant_id, id),
  FOREIGN KEY (tenant_id, cuenta_plan_id) REFERENCES public.cuentas_plan(tenant_id, id),
  FOREIGN KEY (tenant_id, centro_costo_id) REFERENCES public.centros_costo(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS public.cuotas_pagar (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL, cuenta_pagar_id BIGINT NOT NULL,
  numero_cuota INTEGER NOT NULL CHECK (numero_cuota > 0), valor_minor BIGINT NOT NULL CHECK (valor_minor >= 0),
  fecha_vencimiento DATE NOT NULL, fecha_pago DATE, valor_pagado_minor BIGINT NOT NULL DEFAULT 0 CHECK (valor_pagado_minor >= 0),
  intereses_minor BIGINT NOT NULL DEFAULT 0 CHECK (intereses_minor >= 0), descuento_minor BIGINT NOT NULL DEFAULT 0 CHECK (descuento_minor >= 0),
  estado VARCHAR(20) NOT NULL DEFAULT 'ABIERTO' CHECK (estado IN ('ABIERTO', 'PAGADO', 'VENCIDO', 'CANCELADO')),
  observaciones TEXT,
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, cuenta_pagar_id, numero_cuota),
  FOREIGN KEY (tenant_id, cuenta_pagar_id) REFERENCES public.cuentas_pagar(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.cuentas_cobrar (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL, empresa_id BIGINT NOT NULL,
  descripcion VARCHAR(200) NOT NULL, contraparte_id BIGINT, numero_documento VARCHAR(50), timbrado VARCHAR(20), numero_factura VARCHAR(30),
  moneda CHAR(3) NOT NULL CHECK (moneda IN ('PYG', 'USD', 'BRL')),
  valor_total_minor BIGINT NOT NULL CHECK (valor_total_minor >= 0), valor_cobrado_minor BIGINT NOT NULL DEFAULT 0 CHECK (valor_cobrado_minor >= 0),
  fecha_emision DATE NOT NULL, fecha_vencimiento DATE NOT NULL, fecha_cobro DATE,
  estado VARCHAR(20) NOT NULL DEFAULT 'ABIERTO' CHECK (estado IN ('ABIERTO', 'COBRADO', 'VENCIDO', 'CANCELADO')),
  cuenta_plan_id BIGINT, centro_costo_id BIGINT,
  iva_tipo VARCHAR(6) CHECK (iva_tipo IN ('10', '5', 'EXENTA')), iva_valor_minor BIGINT NOT NULL DEFAULT 0 CHECK (iva_valor_minor >= 0),
  observaciones TEXT, creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(), creado_por BIGINT,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, empresa_id) REFERENCES public.empresas(tenant_id, id),
  FOREIGN KEY (tenant_id, contraparte_id) REFERENCES public.contrapartes(tenant_id, id),
  FOREIGN KEY (tenant_id, cuenta_plan_id) REFERENCES public.cuentas_plan(tenant_id, id),
  FOREIGN KEY (tenant_id, centro_costo_id) REFERENCES public.centros_costo(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS public.cuotas_cobrar (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL, cuenta_cobrar_id BIGINT NOT NULL,
  numero_cuota INTEGER NOT NULL CHECK (numero_cuota > 0), valor_minor BIGINT NOT NULL CHECK (valor_minor >= 0),
  fecha_vencimiento DATE NOT NULL, fecha_cobro DATE, valor_cobrado_minor BIGINT NOT NULL DEFAULT 0 CHECK (valor_cobrado_minor >= 0),
  intereses_minor BIGINT NOT NULL DEFAULT 0 CHECK (intereses_minor >= 0), descuento_minor BIGINT NOT NULL DEFAULT 0 CHECK (descuento_minor >= 0),
  estado VARCHAR(20) NOT NULL DEFAULT 'ABIERTO' CHECK (estado IN ('ABIERTO', 'COBRADO', 'VENCIDO', 'CANCELADO')),
  observaciones TEXT,
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, cuenta_cobrar_id, numero_cuota),
  FOREIGN KEY (tenant_id, cuenta_cobrar_id) REFERENCES public.cuentas_cobrar(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.movimientos_caja (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL, empresa_id BIGINT NOT NULL, caja_id BIGINT NOT NULL,
  fecha DATE NOT NULL, historico TEXT NOT NULL, tipo CHAR(1) NOT NULL CHECK (tipo IN ('C', 'D')),
  moneda CHAR(3) NOT NULL CHECK (moneda IN ('PYG', 'USD', 'BRL')), valor_minor BIGINT NOT NULL CHECK (valor_minor > 0),
  cuenta_plan_id BIGINT, centro_costo_id BIGINT, documento VARCHAR(60),
  origen CHAR(2) NOT NULL DEFAULT 'MA' CHECK (origen IN ('MA', 'CP', 'CC', 'TR')),
  cuota_origen_id BIGINT, transferencia_id UUID, creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, empresa_id) REFERENCES public.empresas(tenant_id, id),
  FOREIGN KEY (tenant_id, caja_id) REFERENCES public.cajas(tenant_id, id),
  FOREIGN KEY (tenant_id, cuenta_plan_id) REFERENCES public.cuentas_plan(tenant_id, id),
  FOREIGN KEY (tenant_id, centro_costo_id) REFERENCES public.centros_costo(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS public.bajas_pagar (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL, cuota_id BIGINT NOT NULL,
  tipo VARCHAR(10) NOT NULL DEFAULT 'BAJA' CHECK (tipo IN ('BAJA', 'REVERSION')),
  fecha DATE NOT NULL, valor_pagado_minor BIGINT NOT NULL DEFAULT 0 CHECK (valor_pagado_minor >= 0),
  intereses_minor BIGINT NOT NULL DEFAULT 0 CHECK (intereses_minor >= 0), descuento_minor BIGINT NOT NULL DEFAULT 0 CHECK (descuento_minor >= 0),
  caja_id BIGINT, movimiento_caja_id BIGINT, reversion_de_id BIGINT, observaciones TEXT, creado_por BIGINT, creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, cuota_id) REFERENCES public.cuotas_pagar(tenant_id, id),
  FOREIGN KEY (tenant_id, caja_id) REFERENCES public.cajas(tenant_id, id),
  FOREIGN KEY (tenant_id, movimiento_caja_id) REFERENCES public.movimientos_caja(tenant_id, id),
  FOREIGN KEY (tenant_id, reversion_de_id) REFERENCES public.bajas_pagar(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS public.bajas_cobrar (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL, cuota_id BIGINT NOT NULL,
  tipo VARCHAR(10) NOT NULL DEFAULT 'BAJA' CHECK (tipo IN ('BAJA', 'REVERSION')),
  fecha DATE NOT NULL, valor_cobrado_minor BIGINT NOT NULL DEFAULT 0 CHECK (valor_cobrado_minor >= 0),
  intereses_minor BIGINT NOT NULL DEFAULT 0 CHECK (intereses_minor >= 0), descuento_minor BIGINT NOT NULL DEFAULT 0 CHECK (descuento_minor >= 0),
  caja_id BIGINT, movimiento_caja_id BIGINT, reversion_de_id BIGINT, observaciones TEXT, creado_por BIGINT, creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, cuota_id) REFERENCES public.cuotas_cobrar(tenant_id, id),
  FOREIGN KEY (tenant_id, caja_id) REFERENCES public.cajas(tenant_id, id),
  FOREIGN KEY (tenant_id, movimiento_caja_id) REFERENCES public.movimientos_caja(tenant_id, id),
  FOREIGN KEY (tenant_id, reversion_de_id) REFERENCES public.bajas_cobrar(tenant_id, id)
);

CREATE OR REPLACE FUNCTION public.bloquear_mutacion_bajas()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Las bajas son append-only: use una reversión, no UPDATE ni DELETE';
END $$;

CREATE TRIGGER trg_bajas_pagar_append_only BEFORE UPDATE OR DELETE ON public.bajas_pagar
FOR EACH ROW EXECUTE FUNCTION public.bloquear_mutacion_bajas();
CREATE TRIGGER trg_bajas_cobrar_append_only BEFORE UPDATE OR DELETE ON public.bajas_cobrar
FOR EACH ROW EXECUTE FUNCTION public.bloquear_mutacion_bajas();

DO $$
DECLARE tabla TEXT;
BEGIN
  FOREACH tabla IN ARRAY ARRAY[
    'empresas','usuarios_tenants','usuarios_empresas','planes_cuentas','cuentas_plan','empresas_planes_cuentas',
    'centros_costo','contrapartes','cotizaciones','cajas','cuentas_pagar','cuotas_pagar','cuentas_cobrar',
    'cuotas_cobrar','movimientos_caja','bajas_pagar','bajas_cobrar'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tabla);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tabla);
    EXECUTE format('CREATE POLICY tenant_isolation ON public.%I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::BIGINT)', tabla);
  END LOOP;
END $$;
