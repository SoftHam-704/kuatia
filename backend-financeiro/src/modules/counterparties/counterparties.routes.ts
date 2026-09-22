import { Router } from 'express';
import { z } from 'zod';
import { withTenantContext } from '../../config/database.js';
import { authenticate } from '../../middleware/auth.js';

const router = Router();
const schema = z.object({
  tipoPersona: z.enum(['F', 'J']), ruc: z.string().trim().max(20).optional(), razonSocial: z.string().trim().min(2).max(200),
  nombreFantasia: z.string().trim().max(200).optional(), direccion: z.string().trim().max(200).optional(), numero: z.string().trim().max(20).optional(),
  barrio: z.string().trim().max(100).optional(), ciudad: z.string().trim().max(100).optional(), departamento: z.string().trim().max(50).optional(),
  telefono: z.string().trim().max(20).optional(), celular: z.string().trim().max(20).optional(), email: z.string().trim().email().max(100).optional(), observaciones: z.string().max(10_000).optional(),
});

router.get('/', authenticate, async (request, response) => {
  try {
    const auth = request.auth!;
    const rows = await withTenantContext({ tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema }, async (client) => {
      const result = await client.query(
        `SELECT id, tipo_persona, ruc, razon_social, nombre_fantasia, ciudad, telefono, celular, email, activo
         FROM contrapartes WHERE tenant_id = $1 AND activo = TRUE ORDER BY razon_social`, [auth.tenantId],
      );
      return result.rows;
    }, auth.pool);
    response.json({ data: rows });
  } catch { response.status(400).json({ message: 'No fue posible listar clientes y proveedores.' }); }
});

router.post('/', authenticate, async (request, response) => {
  try {
    const input = schema.parse(request.body); const auth = request.auth!;
    const result = await withTenantContext({ tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema }, async (client) => {
      const created = await client.query(
        `INSERT INTO contrapartes (tenant_id,tipo_persona,ruc,razon_social,nombre_fantasia,direccion,numero,barrio,ciudad,departamento,telefono,celular,email,observaciones)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id, razon_social, ruc`,
        [auth.tenantId,input.tipoPersona,input.ruc ?? null,input.razonSocial,input.nombreFantasia ?? null,input.direccion ?? null,input.numero ?? null,input.barrio ?? null,input.ciudad ?? null,input.departamento ?? null,input.telefono ?? null,input.celular ?? null,input.email ?? null,input.observaciones ?? null],
      ); return created.rows[0];
    }, auth.pool);
    response.status(201).json(result);
  } catch (error) { response.status(400).json({ message: error instanceof z.ZodError ? 'Datos de cliente o proveedor inválidos.' : (error as Error).message }); }
});

router.put('/:id', authenticate, async (request, response) => {
  try {
    const id = z.coerce.number().int().positive().parse(request.params.id);
    const input = schema.parse(request.body);
    const auth = request.auth!;
    const updated = await withTenantContext({ tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema }, async (client) => {
      const result = await client.query(
        `UPDATE contrapartes
         SET tipo_persona = $3, ruc = $4, razon_social = $5, nombre_fantasia = $6,
             direccion = $7, numero = $8, barrio = $9, ciudad = $10,
             departamento = $11, telefono = $12, celular = $13, email = $14,
             observaciones = $15, atualizado_em = CURRENT_TIMESTAMP
         WHERE tenant_id = $1 AND id = $2
         RETURNING id, razon_social, ruc`,
        [auth.tenantId, id, input.tipoPersona, input.ruc ?? null, input.razonSocial, input.nombreFantasia ?? null,
         input.direccion ?? null, input.numero ?? null, input.barrio ?? null, input.ciudad ?? null,
         input.departamento ?? null, input.telefono ?? null, input.celular ?? null, input.email ?? null, input.observaciones ?? null],
      );
      if (!result.rowCount) throw new Error('Cliente o proveedor no encontrado.');
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
        `UPDATE contrapartes SET activo = FALSE, atualizado_em = CURRENT_TIMESTAMP
         WHERE tenant_id = $1 AND id = $2 RETURNING id`,
        [auth.tenantId, id],
      );
      if (!result.rowCount) throw new Error('Cliente o proveedor no encontrado.');
    }, auth.pool);
    response.status(204).send();
  } catch (error) {
    response.status(400).json({ message: (error as Error).message || 'No se pudo eliminar el contacto.' });
  }
});

export default router;
