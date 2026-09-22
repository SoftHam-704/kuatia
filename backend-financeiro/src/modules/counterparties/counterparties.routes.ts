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

export default router;
