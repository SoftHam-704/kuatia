import { Router } from 'express';
import { z } from 'zod';
import { withTenantContext } from '../../config/database.js';
import { authenticate } from '../../middleware/auth.js';

const router = Router();
const query = z.object({ empresaId: z.coerce.number().int().positive() });

router.get('/', authenticate, async (request, response) => {
  try {
    const { empresaId } = query.parse(request.query); const auth = request.auth!;
    const data = await withTenantContext({ tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema }, async (client) => (
      await client.query(`SELECT cp.id,cp.codigo,cp.descripcion,cp.naturaleza,cp.nivel,cp.id_padre,cp.activo,p.nombre AS plan
        FROM empresas_planes_cuentas ep JOIN planes_cuentas p ON p.tenant_id=ep.tenant_id AND p.id=ep.plan_id
        JOIN cuentas_plan cp ON cp.tenant_id=p.tenant_id AND cp.plan_id=p.id
        WHERE ep.tenant_id=$1 AND ep.empresa_id=$2 ORDER BY cp.codigo`, [auth.tenantId, empresaId])
    ).rows, auth.pool);
    response.json({ data });
  } catch { response.status(400).json({ message: 'No fue posible listar el plan de cuentas.' }); }
});
export default router;
