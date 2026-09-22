import dotenv from 'dotenv';
import { resolve } from 'node:path';
import { Pool, type PoolClient } from 'pg';

dotenv.config({ path: resolve(process.cwd(), '..', '.env') });

const connectionString = process.env.DATABASE_URL;

/**
 * TLS de uma conexão, decidido num lugar só.
 *
 * Antes existiam duas regras diferentes: o pool padrão olhava
 * `DATABASE_SSL ?? MASTER_DB_SSL` e o pool roteado por tenant olhava apenas
 * `DATABASE_SSL`. Com uma das variáveis ausente, metade das conexões subia
 * cifrada e a outra metade em claro — e o `.env` parecia configurado.
 *
 * Com `ca`, o certificado do servidor é de fato validado. Sem `ca`, o tráfego
 * é cifrado mas o servidor NÃO é autenticado: protege contra escuta passiva,
 * não contra man-in-the-middle. É uma dívida consciente, não um padrão.
 */
function resolveSsl(enabledVar: string | undefined, caVar: string | undefined) {
  if (enabledVar !== 'true') return false as const;
  const ca = caVar?.trim();
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false };
}

const tenantSsl = () => resolveSsl(process.env.DATABASE_SSL, process.env.DATABASE_CA);

const databaseConfig = connectionString
  ? { connectionString }
  : {
      host: process.env.DB_HOST ?? process.env.MASTER_DB_HOST,
      port: Number(process.env.DB_PORT ?? process.env.MASTER_DB_PORT ?? 5432),
      database: process.env.DB_NAME ?? process.env.MASTER_DB_NAME,
      user: process.env.DB_USER ?? process.env.MASTER_DB_USER,
      password: process.env.DB_PASSWORD ?? process.env.MASTER_DB_PASSWORD,
    };

if (!connectionString && (!databaseConfig.host || !databaseConfig.database || !databaseConfig.user || !databaseConfig.password)) {
  throw new Error('Configure DATABASE_URL o las variables DB_HOST, DB_NAME, DB_USER y DB_PASSWORD.');
}

export const pool = new Pool({
  ...databaseConfig,
  max: 8,
  min: 0,
  idleTimeoutMillis: 30_000,
  ssl: tenantSsl(),
});

export const masterPool = new Pool({
  host: process.env.MASTER_DB_HOST,
  port: Number(process.env.MASTER_DB_PORT ?? 5432),
  database: process.env.MASTER_DB_NAME,
  user: process.env.MASTER_DB_USER,
  password: process.env.MASTER_DB_PASSWORD,
  max: 4,
  min: 0,
  idleTimeoutMillis: 30_000,
  ssl: resolveSsl(process.env.MASTER_DB_SSL, process.env.MASTER_DB_CA),
});

/**
 * Banco que identifica este produto em `master.public.empresas`.
 *
 * O master é compartilhado por toda a Frota SoftHam: um mesmo documento pode
 * existir para o RepOne, o QuickCash e o Kuatiá. Sem este filtro, o login
 * resolve a empresa errada e conecta no banco de outro sistema.
 */
export const MASTER_PRODUCT_DB = process.env.MASTER_PRODUCT_DB ?? 'financeiro';

export interface TenantDatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

const routedTenantPools = new Map<string, Pool>();

export function getRoutedTenantPool(config: TenantDatabaseConfig): Pool {
  const cacheKey = `${config.host}:${config.port}:${config.database}:${config.user}`;
  const cached = routedTenantPools.get(cacheKey);
  if (cached) return cached;

  const routedPool = new Pool({
    ...config,
    max: 8,
    min: 0,
    idleTimeoutMillis: 30_000,
    ssl: tenantSsl(),
  });
  routedTenantPools.set(cacheKey, routedPool);
  return routedPool;
}

/**
 * Pool de DDL, usado só pelo migrador.
 *
 * O papel da aplicação não é dono das tabelas e por isso não consegue
 * `ALTER TABLE` — e isso é proposital: quem serve requisição não muda
 * estrutura. Sem `DB_ADMIN_USER`, o migrador cai na credencial da aplicação e
 * falha alto se faltar privilégio, em vez de rodar pela metade.
 */
export const migrationPool = new Pool({
  ...(connectionString ? { connectionString } : {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_ADMIN_USER || process.env.DB_USER,
    password: process.env.DB_ADMIN_PASSWORD || process.env.DB_PASSWORD,
  }),
  max: 2,
  min: 0,
  idleTimeoutMillis: 10_000,
  ssl: tenantSsl(),
});

/**
 * Nome de schema aceito ou recusado — nunca "corrigido".
 *
 * O nome vem do master e entra na consulta como identificador, não como
 * parâmetro (o Postgres não parametriza identificador). Remover caracteres
 * inválidos transformaria um nome hostil num nome válido e diferente; recusar
 * é a única resposta segura. Invariante 4 do PADRAO-login-master-tenant.
 */
export function assertSafeSchema(schema: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Esquema de tenant inválido.');
  return schema;
}

export interface TenantRoute {
  pool: Pool;
  /** Schema onde moram os dados deste tenant. `public` guarda só o que é comum. */
  schema: string;
}

export async function resolveTenantRoute(masterEmpresaId: number): Promise<TenantRoute> {
  /* 🔴 O filtro de produto vale nos DOIS gateways — por documento (login) e por
     id (todo request autenticado). Filtrar só no login deixaria um token válido
     rotear para o banco de outro produto. Ver RepOne V2 `postgres-gateways.ts`,
     que aplica a cláusula nos dois. NUNCA remover. */
  const result = await masterPool.query(
    `SELECT db_host, db_nome, db_usuario, db_senha, db_porta, db_schema
     FROM public.empresas
     WHERE id = $1 AND status = 'ATIVO' AND db_nome = $2 LIMIT 1`,
    [masterEmpresaId, MASTER_PRODUCT_DB],
  );
  if (!result.rowCount) throw new Error('Tenant no disponible.');
  const company = result.rows[0];
  const config: TenantDatabaseConfig = {
    host: company.db_host,
    port: Number(company.db_porta ?? 5432),
    database: company.db_nome,
    user: company.db_usuario,
    password: company.db_senha,
  };
  if (!config.host || !config.database || !config.user || !config.password) throw new Error('Configuración de tenant incompleta.');
  return { pool: getRoutedTenantPool(config), schema: assertSafeSchema(String(company.db_schema)) };
}

export interface TenantContext {
  tenantId: number;
  userId: number;
  /** Schema do tenant. Vem do master, nunca do token nem do corpo da requisição. */
  schema: string;
}

/**
 * Abre a transação em que toda consulta de negócio roda.
 *
 * Fixa três coisas e nenhuma delas vem do cliente:
 * - `search_path` no schema do tenant — é o que faz `cuentas_pagar` significar
 *   `pinheirao.cuentas_pagar`. O `public` fica no fim da lista porque ainda
 *   guarda o que é comum a todos os tenants (modelos de plano de contas,
 *   registro de tenants, controle de migrations).
 * - `app.tenant_id` e `app.user_id`, que as policies de RLS leem.
 *
 * O schema é validado antes de virar identificador; o resto vai por parâmetro.
 */
export async function withTenantContext<T>(context: TenantContext, work: (client: PoolClient) => Promise<T>, targetPool: Pool = pool): Promise<T> {
  if (!Number.isSafeInteger(context.tenantId) || context.tenantId <= 0 || !Number.isSafeInteger(context.userId) || context.userId <= 0) {
    throw new Error('Contexto de tenant o usuario inválido.');
  }
  const schema = assertSafeSchema(context.schema);
  const client = await targetPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL search_path TO "${schema}", public`);
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [String(context.tenantId)]);
    await client.query("SELECT set_config('app.user_id', $1, true)", [String(context.userId)]);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
