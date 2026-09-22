import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { withTenantContext } from '../../config/database.js';
import { authenticate, requireTenantAdmin } from '../../middleware/auth.js';
import { recordAudit } from '../audit/audit.service.js';

const router = Router();
const code = z.coerce.number().int().positive();
const userSchema = z.object({
  nombre: z.string().trim().min(1).max(20), sobrenome: z.string().trim().min(1).max(20),
  senha: z.string().min(1).max(20).optional(), grupo: z.string().trim().max(20).optional(),
  usuario: z.string().trim().max(20).optional(), telefone: z.string().trim().max(20).optional(), iniciais: z.string().trim().max(4).optional(),
  master: z.boolean().default(false), gerencia: z.boolean().default(false), ativo: z.boolean().default(true),
  empresaIds: z.array(z.number().int().positive()).default([]),
});

const BCRYPT_ROUNDS = 12;

/* A senha é gravada nos DOIS formatos enquanto os outros produtos da casa
   dependerem do campo legado `senha` em texto puro. O Kuatiá autentica pelo
   `senha_hash`; `senha` existe só para não quebrar os vizinhos. Quando o
   último produto migrar, o campo legado sai daqui e do banco. */
const hashPassword = (senha: string) => bcrypt.hash(senha, BCRYPT_ROUNDS);

/* Antes daqui havia uma busca a `tenants.login_schema` para montar o
   `search_path` — segunda fonte de verdade, porque o roteamento já vem do
   `db_schema` do master. Agora quem fixa o `search_path` é o
   `withTenantContext`, com o schema resolvido pelo master a cada requisição.
   `user_nomes` mora no schema do tenant, então não precisa de qualificação. */

async function assertCompanies(client: Parameters<Parameters<typeof withTenantContext>[1]>[0], tenantId: number, empresaIds: number[]): Promise<void> {
  if (!empresaIds.length) return;
  const result = await client.query('SELECT id FROM empresas WHERE tenant_id = $1 AND id = ANY($2::bigint[]) AND activa = TRUE', [tenantId, empresaIds]);
  if (result.rowCount !== new Set(empresaIds).size) throw new Error('Una o más empresas no existen o están inactivas.');
}

async function syncFinanceIdentity(client: Parameters<Parameters<typeof withTenantContext>[1]>[0], tenantId: number, sourceCode: number, input: z.infer<typeof userSchema>): Promise<void> {
  await assertCompanies(client, tenantId, input.empresaIds);
  if (!input.master && input.ativo && input.empresaIds.length === 0) throw new Error('Un operador activo debe tener al menos una empresa asignada.');
  const identity = await client.query(
    `INSERT INTO usuarios (tenant_id, usuario_origem_codigo, nombre, sobrenome, email, activo)
     VALUES ($1,$2,$3,$4,NULL,$5)
     ON CONFLICT (tenant_id, usuario_origem_codigo) DO UPDATE SET nombre = EXCLUDED.nombre, sobrenome = EXCLUDED.sobrenome, activo = EXCLUDED.activo
     RETURNING id`,
    [tenantId, sourceCode, input.nombre, input.sobrenome, input.ativo],
  );
  const userId = identity.rows[0].id;
  await client.query(
    `INSERT INTO usuarios_tenants (tenant_id, usuario_id, rol) VALUES ($1,$2,$3)
     ON CONFLICT (tenant_id, usuario_id) DO UPDATE SET rol = EXCLUDED.rol`,
    [tenantId, userId, input.master ? 'ADMIN_TENANT' : 'OPERADOR'],
  );
  await client.query('DELETE FROM usuarios_empresas WHERE tenant_id = $1 AND usuario_id = $2', [tenantId, userId]);
  for (const empresaId of new Set(input.empresaIds)) await client.query('INSERT INTO usuarios_empresas (tenant_id, usuario_id, empresa_id) VALUES ($1,$2,$3)', [tenantId, userId, empresaId]);
}

router.get('/', authenticate, requireTenantAdmin, async (request, response) => {
  try {
    const auth = request.auth!;
    const data = await withTenantContext({ tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema }, async (client) => {
      const result = await client.query(
        `SELECT u.codigo, u.nome, u.sobrenome, u.grupo, u.master, u.gerencia, u.usuario, u.telefone, u.iniciais, COALESCE(u.ativo, TRUE) AS ativo,
                COALESCE(json_agg(ue.empresa_id ORDER BY ue.empresa_id) FILTER (WHERE ue.empresa_id IS NOT NULL), '[]') AS empresa_ids
           FROM user_nomes u
           LEFT JOIN usuarios fu ON fu.tenant_id = $1 AND fu.usuario_origem_codigo = u.codigo
           LEFT JOIN usuarios_empresas ue ON ue.tenant_id = $1 AND ue.usuario_id = fu.id
          GROUP BY u.codigo, u.nome, u.sobrenome, u.grupo, u.master, u.gerencia, u.usuario, u.telefone, u.iniciais, u.ativo
          ORDER BY lower(u.nome), lower(u.sobrenome)`,
        [auth.tenantId],
      );
      return result.rows;
    }, auth.pool);
    response.json({ data });
  } catch (error) { response.status(400).json({ message: (error as Error).message || 'No fue posible listar los usuarios.' }); }
});

router.post('/', authenticate, requireTenantAdmin, async (request, response) => {
  try {
    const input = userSchema.extend({ senha: z.string().min(1).max(20) }).parse(request.body); const auth = request.auth!;
    const created = await withTenantContext({ tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema }, async (client) => {
      const duplicate = await client.query('SELECT 1 FROM user_nomes WHERE lower(nome) = lower($1) AND lower(sobrenome) = lower($2) LIMIT 1', [input.nombre, input.sobrenome]);
      if (duplicate.rowCount) throw new Error('Ya existe un usuario con ese nombre y apellido en este tenant.');
      await client.query('LOCK TABLE user_nomes IN SHARE ROW EXCLUSIVE MODE');
      const next = await client.query('SELECT COALESCE(MAX(codigo), 0) + 1 AS codigo FROM user_nomes'); const sourceCode = Number(next.rows[0].codigo);
      await client.query('INSERT INTO user_nomes (codigo,nome,sobrenome,senha,senha_hash,grupo,master,gerencia,usuario,telefone,iniciais,ativo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [sourceCode,input.nombre,input.sobrenome,input.senha,await hashPassword(input.senha),input.grupo ?? null,input.master,input.gerencia,input.usuario ?? null,input.telefone ?? null,input.iniciais ?? null,input.ativo]);
      await syncFinanceIdentity(client, auth.tenantId, sourceCode, input);
      await recordAudit(client, { tenantId: auth.tenantId, userCode: auth.tenantUserCode, action: 'CREAR', entity: 'USUARIO', entityId: sourceCode, detail: { nombre: input.nombre, sobrenome: input.sobrenome, master: input.master, empresas: input.empresaIds } });
      return { codigo: sourceCode };
    }, auth.pool);
    response.status(201).json(created);
  } catch (error) { response.status(400).json({ message: error instanceof z.ZodError ? 'Datos de usuario inválidos.' : (error as Error).message }); }
});

router.put('/:codigo', authenticate, requireTenantAdmin, async (request, response) => {
  try {
    const sourceCode = code.parse(request.params.codigo); const input = userSchema.parse(request.body); const auth = request.auth!;
    if (sourceCode === auth.tenantUserCode && (!input.master || !input.ativo)) throw new Error('No podés retirar tu propia administración ni desactivar tu sesión.');
    await withTenantContext({ tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema }, async (client) => {
      const existing = await client.query('SELECT codigo FROM user_nomes WHERE codigo = $1', [sourceCode]); if (!existing.rowCount) throw new Error('Usuario no encontrado.');
      await client.query(`UPDATE user_nomes SET nome=$2,sobrenome=$3,senha=COALESCE($4,senha),senha_hash=COALESCE($12,senha_hash),grupo=$5,master=$6,gerencia=$7,usuario=$8,telefone=$9,iniciais=$10,ativo=$11 WHERE codigo=$1`, [sourceCode,input.nombre,input.sobrenome,input.senha ?? null,input.grupo ?? null,input.master,input.gerencia,input.usuario ?? null,input.telefone ?? null,input.iniciais ?? null,input.ativo,input.senha ? await hashPassword(input.senha) : null]);
      await syncFinanceIdentity(client, auth.tenantId, sourceCode, input);
      await recordAudit(client, { tenantId: auth.tenantId, userCode: auth.tenantUserCode, action: 'ACTUALIZAR', entity: 'USUARIO', entityId: sourceCode, detail: { nombre: input.nombre, sobrenome: input.sobrenome, master: input.master, activo: input.ativo, empresas: input.empresaIds } });
    }, auth.pool);
    response.status(204).send();
  } catch (error) { response.status(400).json({ message: error instanceof z.ZodError ? 'Datos de usuario inválidos.' : (error as Error).message }); }
});

router.delete('/:codigo', authenticate, requireTenantAdmin, async (request, response) => {
  try {
    const sourceCode = code.parse(request.params.codigo);
    const auth = request.auth!;
    if (sourceCode === auth.tenantUserCode) throw new Error('No podés desactivar tu propia cuenta mientras estás logueado.');
    await withTenantContext({ tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema }, async (client) => {
      const result = await client.query('UPDATE user_nomes SET ativo = FALSE WHERE codigo = $1 RETURNING codigo', [sourceCode]);
      if (!result.rowCount) throw new Error('Usuario no encontrado.');
      await client.query('UPDATE usuarios SET activo = FALSE WHERE tenant_id = $1 AND usuario_origem_codigo = $2', [auth.tenantId, sourceCode]);
      await recordAudit(client, {
        tenantId: auth.tenantId, userCode: auth.tenantUserCode,
        action: 'DESACTIVAR', entity: 'USUARIO', entityId: sourceCode,
      });
    }, auth.pool);
    response.status(204).send();
  } catch (error) {
    response.status(400).json({ message: (error as Error).message || 'No se pudo desactivar el usuario.' });
  }
});

export default router;
