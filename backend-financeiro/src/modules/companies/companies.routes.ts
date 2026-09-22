import { Router } from 'express';
import { z } from 'zod';
import { withTenantContext } from '../../config/database.js';
import { authenticate, requireTenantAdmin } from '../../middleware/auth.js';
import { recordAudit } from '../audit/audit.service.js';

const router = Router();

const companySchema = z.object({
  razonSocial: z.string().trim().min(2).max(200),
  nombreFantasia: z.string().trim().max(200).optional(),
  ruc: z.string().trim().max(20).optional(),
  tipoDocumento: z.enum(['CNPJ', 'RUC']).optional(),
  documentoPrincipal: z.string().trim().max(20).optional(),
  monedaBase: z.enum(['PYG', 'USD', 'BRL']).default('PYG'),
});

async function ensureTenantPlan(client: Parameters<Parameters<typeof withTenantContext>[1]>[0], tenantId: number): Promise<number> {
  const existing = await client.query('SELECT id FROM planes_cuentas WHERE tenant_id = $1 AND nombre = $2', [tenantId, 'Plan inicial Paraguay']);
  if (existing.rowCount) return Number(existing.rows[0].id);

  const template = await client.query("SELECT id FROM public.plantillas_plan_cuentas WHERE nombre = 'Plan inicial Paraguay' AND activa = TRUE");
  if (!template.rowCount) throw new Error('Plantilla de plan de cuentas no disponible.');
  const createdPlan = await client.query('INSERT INTO planes_cuentas (tenant_id, nombre) VALUES ($1, $2) RETURNING id', [tenantId, 'Plan inicial Paraguay']);
  const planId = Number(createdPlan.rows[0].id);
  const templateItems = await client.query(
    `SELECT id, codigo, descripcion, naturaleza, nivel, id_padre
     FROM public.plantillas_plan_cuentas_items WHERE plantilla_id = $1 ORDER BY nivel, codigo`,
    [template.rows[0].id],
  );
  const itemIds = new Map<number, number>();
  for (const item of templateItems.rows) {
    const inserted = await client.query(
      `INSERT INTO cuentas_plan (tenant_id, plan_id, codigo, descripcion, naturaleza, nivel, id_padre)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [tenantId, planId, item.codigo, item.descripcion, item.naturaleza, item.nivel, item.id_padre ? itemIds.get(Number(item.id_padre)) ?? null : null],
    );
    itemIds.set(Number(item.id), Number(inserted.rows[0].id));
  }
  return planId;
}

router.get('/', authenticate, async (request, response) => {
  try {
    const auth = request.auth!;
    const companies = await withTenantContext({ tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema }, async (client) => {
      const result = await client.query(
        `SELECT id, razon_social, nombre_fantasia, ruc, moneda_base, activa
         FROM empresas WHERE tenant_id = $1 ORDER BY razon_social`,
        [auth.tenantId],
      );
      return result.rows;
    }, auth.pool);
    response.json({ data: companies });
  } catch {
    response.status(400).json({ message: 'No fue posible listar las empresas.' });
  }
});

router.post('/', authenticate, requireTenantAdmin, async (request, response) => {
  try {
    const input = companySchema.parse(request.body);
    const auth = request.auth!;
    const company = await withTenantContext({ tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema }, async (client) => {
      const planId = await ensureTenantPlan(client, auth.tenantId);
      const created = await client.query(
        `INSERT INTO empresas (tenant_id, razon_social, nombre_fantasia, ruc, tipo_documento, documento_principal, moneda_base)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, razon_social, moneda_base`,
        [auth.tenantId, input.razonSocial, input.nombreFantasia ?? null, input.ruc ?? null, input.tipoDocumento ?? (input.ruc ? 'RUC' : null), input.documentoPrincipal ?? input.ruc ?? null, input.monedaBase],
      );
      await client.query('INSERT INTO empresas_planes_cuentas (tenant_id, empresa_id, plan_id) VALUES ($1,$2,$3)', [auth.tenantId, created.rows[0].id, planId]);
      await recordAudit(client, { tenantId: auth.tenantId, userCode: auth.tenantUserCode, action: 'CREAR', entity: 'EMPRESA', entityId: created.rows[0].id, empresaId: created.rows[0].id, detail: { razonSocial: input.razonSocial, monedaBase: input.monedaBase } });
      return created.rows[0];
    }, auth.pool);
    response.status(201).json(company);
  } catch (error) {
    response.status(400).json({ message: error instanceof z.ZodError ? 'Datos de empresa inválidos.' : (error as Error).message });
  }
});

router.put('/:id', authenticate, requireTenantAdmin, async (request, response) => {
  try {
    const id = z.coerce.number().int().positive().parse(request.params.id);
    const updateSchema = z.object({
      razonSocial: z.string().trim().min(2).max(200),
      nombreFantasia: z.string().trim().max(200).optional(),
      ruc: z.string().trim().max(20).optional(),
      activa: z.boolean().optional(),
    });
    const input = updateSchema.parse(request.body);
    const auth = request.auth!;
    const updated = await withTenantContext({ tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema }, async (client) => {
      const result = await client.query(
        `UPDATE empresas
         SET razon_social = $3, nombre_fantasia = $4, ruc = $5,
             activa = COALESCE($6, activa)
         WHERE tenant_id = $1 AND id = $2
         RETURNING id, razon_social, nombre_fantasia, ruc, activa`,
        [auth.tenantId, id, input.razonSocial, input.nombreFantasia ?? null, input.ruc ?? null, input.activa ?? null],
      );
      if (!result.rowCount) throw new Error('Empresa no encontrada.');
      await recordAudit(client, {
        tenantId: auth.tenantId, userCode: auth.tenantUserCode,
        action: 'ACTUALIZAR', entity: 'EMPRESA', entityId: id, empresaId: id,
        detail: input,
      });
      return result.rows[0];
    }, auth.pool);
    response.json(updated);
  } catch (error) {
    response.status(400).json({ message: error instanceof z.ZodError ? 'Datos de empresa inválidos.' : (error as Error).message });
  }
});

router.delete('/:id', authenticate, requireTenantAdmin, async (request, response) => {
  try {
    const id = z.coerce.number().int().positive().parse(request.params.id);
    const auth = request.auth!;
    await withTenantContext({ tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema }, async (client) => {
      const result = await client.query(
        `UPDATE empresas SET activa = FALSE WHERE tenant_id = $1 AND id = $2 RETURNING id`,
        [auth.tenantId, id],
      );
      if (!result.rowCount) throw new Error('Empresa no encontrada.');
      await recordAudit(client, {
        tenantId: auth.tenantId, userCode: auth.tenantUserCode,
        action: 'DESACTIVAR', entity: 'EMPRESA', entityId: id, empresaId: id,
      });
    }, auth.pool);
    response.status(204).send();
  } catch (error) {
    response.status(400).json({ message: (error as Error).message || 'No se pudo desactivar la empresa.' });
  }
});

export default router;
