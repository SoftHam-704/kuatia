import { Router } from 'express';
import { z } from 'zod';
import { withTenantContext } from '../../config/database.js';
import { authenticate } from '../../middleware/auth.js';

const router = Router();
const schema = z.object({ empresaId: z.number().int().positive(), codigo: z.string().trim().max(20).optional(), descripcion: z.string().trim().min(2).max(100), idPadre: z.number().int().positive().optional() });
const listSchema = z.object({ empresaId: z.coerce.number().int().positive() });

router.get('/', authenticate, async (request, response) => {
  try {
    const { empresaId } = listSchema.parse(request.query); const auth = request.auth!;
    const data = await withTenantContext({ tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema }, async (client) => (
      await client.query('SELECT id,codigo,descripcion,id_padre,activo FROM centros_costo WHERE tenant_id=$1 AND empresa_id=$2 ORDER BY codigo NULLS LAST, descripcion', [auth.tenantId, empresaId])
    ).rows, auth.pool);
    response.json({ data });
  } catch { response.status(400).json({ message: 'No fue posible listar los centros de costo.' }); }
});

router.post('/', authenticate, async (request, response) => {
  try {
    const input = schema.parse(request.body);
    const auth = request.auth!;
    const center = await withTenantContext({ tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema }, async (client) => {
      const result = await client.query(
        `INSERT INTO centros_costo (tenant_id, empresa_id, codigo, descripcion, id_padre)
         VALUES ($1,$2,$3,$4,$5) RETURNING id, codigo, descripcion`,
        [auth.tenantId, input.empresaId, input.codigo ?? null, input.descripcion, input.idPadre ?? null],
      );
      return result.rows[0];
    }, auth.pool);
    response.status(201).json(center);
  } catch (error) {
    response.status(400).json({ message: error instanceof z.ZodError ? 'Datos de centro de costo inválidos.' : (error as Error).message });
  }
});

router.put('/:id', authenticate, async (request, response) => {
  try {
    const id = z.coerce.number().int().positive().parse(request.params.id);
    const updateSchema = z.object({ codigo: z.string().trim().max(20).optional(), descripcion: z.string().trim().min(2).max(100) });
    const input = updateSchema.parse(request.body);
    const auth = request.auth!;
    const updated = await withTenantContext({ tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema }, async (client) => {
      const result = await client.query(
        `UPDATE centros_costo
         SET codigo = $3, descripcion = $4
         WHERE tenant_id = $1 AND id = $2
         RETURNING id, codigo, descripcion`,
        [auth.tenantId, id, input.codigo ?? null, input.descripcion],
      );
      if (!result.rowCount) throw new Error('Centro de costo no encontrado.');
      return result.rows[0];
    }, auth.pool);
    response.json(updated);
  } catch (error) {
    response.status(400).json({ message: error instanceof z.ZodError ? 'Datos inválidos.' : (error as Error).message });
  }
});

router.delete('/:id', authenticate, async (request, response) => {
  try {
    const id = z.coerce.number().int().positive().parse(request.params.id);
    const auth = request.auth!;
    await withTenantContext({ tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema }, async (client) => {
      const result = await client.query(
        `DELETE FROM centros_costo WHERE tenant_id = $1 AND id = $2 RETURNING id`,
        [auth.tenantId, id],
      );
      if (!result.rowCount) throw new Error('Centro de costo no encontrado.');
    }, auth.pool);
    response.status(204).send();
  } catch (error) {
    response.status(400).json({ message: (error as Error).message || 'No se pudo eliminar el centro de costo.' });
  }
});

export default router;
