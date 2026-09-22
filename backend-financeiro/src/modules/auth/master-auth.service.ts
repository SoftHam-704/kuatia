import { randomUUID, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Pool, PoolClient } from 'pg';
import { getRoutedTenantPool, masterPool, MASTER_PRODUCT_DB, type TenantDatabaseConfig, withTenantContext } from '../../config/database.js';

export interface MasterLoginInput {
  documento: string;
  nome: string;
  sobrenome: string;
  senha: string;
  lembrarDispositivo?: boolean;
}

export interface AuthenticatedFinanceUser {
  masterEmpresaId: number;
  tenantUserCode: number;
  financeUserId: number;
  role: 'ADMIN_TENANT' | 'OPERADOR';
  sessionId: string;
}

export class AuthenticationError extends Error {}

function normalizeDocument(value: string): string {
  return value.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

const BCRYPT_ROUNDS = 12;

/** Hash descartável, comparado quando o usuário não existe. Sem isso, "usuário
 *  inexistente" responde na hora e "senha errada" demora o tempo do bcrypt —
 *  e a diferença permite descobrir quem está cadastrado. */
const DUMMY_HASH = bcrypt.hashSync('kuatia-usuario-inexistente', BCRYPT_ROUNDS);

function sameLegacyPassword(input: string, stored: string): boolean {
  const inputBuffer = Buffer.from(input);
  const storedBuffer = Buffer.from(stored);
  return inputBuffer.length === storedBuffer.length && timingSafeEqual(inputBuffer, storedBuffer);
}

/**
 * Confere a senha aceitando os dois formatos e migra o usuário no caminho.
 *
 * `user_nomes` é o diretório legado, lido também por outros produtos da casa,
 * e guarda a senha em texto puro na coluna `senha`. O Kuatiá não pode apagar
 * essa coluna sem quebrar os vizinhos — então grava o bcrypt ao lado, em
 * `senha_hash`, e passa a preferi-lo. Cada usuário migra no primeiro login.
 *
 * ⚠️ Enquanto `senha` continuar preenchida, um dump do banco ainda entrega as
 * senhas. Isto reduz o risco e abre o caminho de saída; não o elimina. A
 * condição de saída está registrada em products/kuatia/contexto.md § Fronteiras.
 */
async function verifyAndUpgradePassword(
  client: PoolClient,
  row: { codigo: number; senha: string | null; senha_hash: string | null },
  senha: string,
): Promise<boolean> {
  if (row.senha_hash) return bcrypt.compare(senha, row.senha_hash);

  if (!row.senha || !sameLegacyPassword(senha, row.senha)) return false;

  const hash = await bcrypt.hash(senha, BCRYPT_ROUNDS);
  await client.query('UPDATE user_nomes SET senha_hash = $2 WHERE codigo = $1', [row.codigo, hash]);
  return true;
}

function assertSafeSchema(schema: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new AuthenticationError('Acesso financeiro indisponível. Contate o suporte.');
  return schema;
}

async function createMasterSession(masterEmpresaId: number, tenantUserCode: number, rememberDevice: boolean, schema: string): Promise<string> {
  const product = await masterPool.query("SELECT id FROM auth.products WHERE code = 'financeiro-paraguai' AND active = TRUE LIMIT 1");
  if (!product.rowCount) throw new Error('Produto Financeiro não está habilitado no master.');

  const sessionId = randomUUID();
  await masterPool.query(
    `INSERT INTO auth.sessions (id, family_id, product_id, empresa_id, subject_id, subject_source, remember_device, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '12 hours')`,
    [sessionId, randomUUID(), product.rows[0].id, masterEmpresaId, String(tenantUserCode), `${schema}.user_nomes`, rememberDevice],
  );
  return sessionId;
}

export async function authenticateInMaster(input: MasterLoginInput): Promise<AuthenticatedFinanceUser> {
  const documento = normalizeDocument(input.documento);
  if (!documento || !input.nome.trim() || !input.sobrenome.trim() || !input.senha) throw new AuthenticationError('Credenciais inválidas.');

  /* 🔴 `AND db_nome = $2` É OBRIGATÓRIO — invariante anti-cross-produto.
     NUNCA remover esta cláusula.

     `public.empresas` é o porteiro compartilhado com A FROTA INTEIRA da SoftHam,
     não só com o Kuatiá. Sem o filtro, o risco não é ambiguidade (`cnpj` é UNIQUE
     na tabela toda) — é ADMISSÃO INDEVIDA: o Kuatiá aceitaria o login de uma
     empresa que é cliente de outro produto, leria a rota daquela linha e
     conectaria no banco alheio com as credenciais alheias. E como o login migra
     a senha para bcrypt, ele acabaria ESCREVENDO no banco do outro produto.

     Padrão da casa: knowledge/PADRAO-login-master-tenant.md § REGRA nº 1.
     Referência: RepOne V2 `modules/auth/postgres-gateways.ts:60-88`. */
  const masterResult = await masterPool.query(
    `SELECT id AS master_empresa_id, db_host, db_nome, db_usuario, db_senha, db_porta, db_schema
     FROM public.empresas
     WHERE regexp_replace(upper(cnpj), '[^0-9A-Z]', '', 'g') = $1
       AND status = 'ATIVO'
       AND db_nome = $2
     ORDER BY id
     LIMIT 1`,
    [documento, MASTER_PRODUCT_DB],
  );
  if (!masterResult.rowCount) throw new AuthenticationError('Credenciais inválidas.');
  const masterCompany = masterResult.rows[0];
  const schema = assertSafeSchema(String(masterCompany.db_schema));
  const config: TenantDatabaseConfig = {
    host: masterCompany.db_host,
    port: Number(masterCompany.db_porta ?? 5432),
    database: masterCompany.db_nome,
    user: masterCompany.db_usuario,
    password: masterCompany.db_senha,
  };
  if (!config.host || !config.database || !config.user || !config.password) throw new AuthenticationError('Acesso financeiro indisponível. Contate o suporte.');

  const tenantPool = getRoutedTenantPool(config);
  const tenantUser = await validateTenantUser(tenantPool, schema, input.nome, input.sobrenome, input.senha);
  const masterEmpresaId = Number(masterCompany.master_empresa_id);
  const role: 'ADMIN_TENANT' | 'OPERADOR' = tenantUser.master === true ? 'ADMIN_TENANT' : 'OPERADOR';
  const financeUserId = await ensureFinanceIdentity(tenantPool, schema, masterEmpresaId, tenantUser, role);
  const sessionId = await createMasterSession(masterEmpresaId, tenantUser.codigo, input.lembrarDispositivo ?? false, schema);
  return { masterEmpresaId, tenantUserCode: tenantUser.codigo, financeUserId, role, sessionId };
}

async function validateTenantUser(tenantPool: Pool, schema: string, nome: string, sobrenome: string, senha: string): Promise<{ codigo: number; nome: string; sobrenome: string; iniciais: string | null; master: boolean; gerencia: boolean }> {
  const client = await tenantPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL search_path TO "${schema}", public`);
    const result = await client.query(
      `SELECT codigo, nome, sobrenome, senha, senha_hash, iniciais, master, gerencia
       FROM user_nomes
       WHERE lower(nome) = lower($1) AND lower(sobrenome) = lower($2) AND COALESCE(ativo, TRUE) = TRUE
       LIMIT 2`,
      [nome.trim(), sobrenome.trim()],
    );

    if (result.rowCount !== 1) {
      await bcrypt.compare(senha, DUMMY_HASH);
      await client.query('COMMIT');
      throw new AuthenticationError('Credenciais inválidas.');
    }

    const row = { ...result.rows[0], codigo: Number(result.rows[0].codigo) };
    const ok = await verifyAndUpgradePassword(client, row, senha);
    await client.query('COMMIT');
    if (!ok) throw new AuthenticationError('Credenciais inválidas.');
    return row;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/* `tenants` continua em `public`: é o registro de quem é quem e de qual schema
   cada um usa — comum ao banco, não de um tenant. `usuarios` e
   `usuarios_tenants` moram no schema do tenant e por isso não são qualificados:
   quem os resolve é o `search_path` fixado por `withTenantContext`. */
async function ensureFinanceIdentity(tenantPool: Pool, schema: string, tenantId: number, tenantUser: { codigo: number; nome: string; sobrenome: string; iniciais: string | null; master: boolean; gerencia: boolean }, role: 'ADMIN_TENANT' | 'OPERADOR'): Promise<number> {
  return withTenantContext({ tenantId, userId: tenantUser.codigo, schema }, async (client) => {
    const tenant = await client.query('SELECT id FROM public.tenants WHERE id = $1 AND master_empresa_id = $1 AND activo = TRUE', [tenantId]);
    if (!tenant.rowCount) throw new AuthenticationError('Acesso financeiro ainda não foi provisionado para esta empresa.');
    const existing = await client.query('SELECT id FROM usuarios WHERE tenant_id = $1 AND usuario_origem_codigo = $2', [tenantId, tenantUser.codigo]);
    const financeUserId = existing.rows[0]?.id ?? (await client.query(
      `INSERT INTO usuarios (tenant_id, usuario_origem_codigo, nombre, sobrenome, email, activo)
       VALUES ($1, $2, $3, $4, NULL, TRUE) RETURNING id`,
      [tenantId, tenantUser.codigo, tenantUser.nome, tenantUser.sobrenome],
    )).rows[0].id;
    await client.query(
      `INSERT INTO usuarios_tenants (tenant_id, usuario_id, rol)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, usuario_id) DO UPDATE SET rol = EXCLUDED.rol`,
      [tenantId, financeUserId, role],
    );
    return Number(financeUserId);
  }, tenantPool);
}

export async function assertMasterSession(sessionId: string, masterEmpresaId: number, tenantUserCode: number): Promise<void> {
  const session = await masterPool.query(
    `UPDATE auth.sessions s SET last_seen_at = NOW()
     FROM auth.products p
     WHERE s.id = $1 AND s.empresa_id = $2 AND s.subject_id = $3
       AND s.product_id = p.id AND p.code = 'financeiro-paraguai' AND p.active = TRUE
       AND s.revoked_at IS NULL AND s.expires_at > NOW()
     RETURNING s.id`,
    [sessionId, masterEmpresaId, String(tenantUserCode)],
  );
  if (!session.rowCount) throw new AuthenticationError('Sessão expirada ou revogada.');
}

export async function revokeMasterSession(sessionId: string): Promise<void> {
  await masterPool.query('UPDATE auth.sessions SET revoked_at = NOW(), revoke_reason = $2 WHERE id = $1 AND revoked_at IS NULL', [sessionId, 'logout']);
}
