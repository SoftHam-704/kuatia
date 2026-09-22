import { Router } from 'express';
import { z } from 'zod';
import { withTenantContext } from '../../config/database.js';
import { authenticate, requireTenantAdmin } from '../../middleware/auth.js';

const router = Router();
const query = z.object({ limite: z.coerce.number().int().min(1).max(200).default(100) });
router.get('/', authenticate, requireTenantAdmin, async (request, response) => {
  try {
    const auth = request.auth!; const { limite } = query.parse(request.query);
    const data = await withTenantContext({ tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema }, async (client) => (await client.query(
      `SELECT a.id, a.accion, a.entidad, a.entidad_id, a.detalle, a.creado_en, a.usuario_origem_codigo,
              u.nombre, u.sobrenome, e.razon_social AS empresa
         FROM auditoria_eventos a
         LEFT JOIN usuarios u ON u.tenant_id = a.tenant_id AND u.usuario_origem_codigo = a.usuario_origem_codigo
         LEFT JOIN empresas e ON e.tenant_id = a.tenant_id AND e.id = a.empresa_id
        WHERE a.tenant_id = $1 ORDER BY a.creado_en DESC, a.id DESC LIMIT $2`, [auth.tenantId, limite])).rows, auth.pool);
    response.json({ data });
  } catch (error) { response.status(400).json({ message: error instanceof z.ZodError ? 'Filtro inválido.' : 'No fue posible consultar la auditoría.' }); }
});
export default router;
