import { Router } from 'express';
import { z } from 'zod';
import { withTenantContext } from '../../config/database.js';
import { authenticate } from '../../middleware/auth.js';
import { assertInstallmentsTotal } from '../../domain/installments.js';
import { asMinorUnit, assertAllBusinessDates } from '../../domain/validation.js';
import { assertCanCancelAccount, assertCanSettleInstallment } from '../../domain/cancellation.js';
import { assertCanUpdateAccount } from '../../domain/account-update.js';
import { recordAudit } from '../audit/audit.service.js';

const router = Router();
const amount = z
  .union([z.string().regex(/^\d+$/), z.number().int().nonnegative()])
  .transform((value) => BigInt(value));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const createSchema = z.object({
  empresaId: z.number().int().positive(),
  descripcion: z.string().trim().min(1).max(200),
  contraparteId: z.number().int().positive().optional(),
  numeroDocumento: z.string().trim().max(50).optional(),
  timbrado: z.string().trim().max(20).optional(),
  numeroFactura: z.string().trim().max(30).optional(),
  moneda: z.enum(['PYG', 'USD', 'BRL']),
  valorTotalMinor: amount,
  fechaEmision: date,
  fechaVencimiento: date,
  cuentaPlanId: z.number().int().positive().optional(),
  centroCostoId: z.number().int().positive().optional(),
  ivaTipo: z.enum(['10', '5', 'EXENTA']).optional(),
  ivaValorMinor: amount.optional(),
  observaciones: z.string().max(10_000).optional(),
  cuotas: z
    .array(
      z.object({
        numero: z.number().int().positive(),
        valorMinor: amount,
        fechaVencimiento: date,
      }),
    )
    .min(1),
});

const collectionSchema = z.object({
  cuotaId: z.number().int().positive(),
  fecha: date,
  valorCobradoMinor: amount,
  interesesMinor: amount.optional(),
  descuentoMinor: amount.optional(),
  cajaId: z.number().int().positive().optional(),
  observaciones: z.string().max(10_000).optional(),
});

const listQuery = z.object({ empresaId: z.coerce.number().int().positive().optional() });

const cancelReceivableSchema = z.object({
  motivo: z.string().trim().max(1000).optional(),
});

router.post('/', authenticate, async (request, response) => {
  try {
    const input = createSchema.parse(request.body);
    assertAllBusinessDates(
      input.fechaEmision,
      input.fechaVencimiento,
      ...input.cuotas.map((q) => q.fechaVencimiento),
    );
    assertInstallmentsTotal(
      input.valorTotalMinor,
      input.cuotas.map((q) => q.valorMinor),
    );
    if (new Set(input.cuotas.map((q) => q.numero)).size !== input.cuotas.length) {
      throw new Error('El número de cuota debe ser único.');
    }
    const auth = request.auth!;
    const created = await withTenantContext(
      { tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema },
      async (client) => {
        const company = await client.query(
          'SELECT id FROM empresas WHERE tenant_id = $1 AND id = $2 AND activa = TRUE',
          [auth.tenantId, input.empresaId],
        );
        if (!company.rowCount) throw new Error('Empresa no encontrada o sin acceso.');

        const account = await client.query(
          `INSERT INTO cuentas_cobrar (
             tenant_id, empresa_id, descripcion, contraparte_id, numero_documento,
             timbrado, numero_factura, moneda, valor_total_minor, fecha_emision, fecha_vencimiento,
             cuenta_plan_id, centro_costo_id, iva_tipo, iva_valor_minor, observaciones, creado_por
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
           RETURNING id`,
          [
            auth.tenantId,
            input.empresaId,
            input.descripcion,
            input.contraparteId ?? null,
            input.numeroDocumento ?? null,
            input.timbrado ?? null,
            input.numeroFactura ?? null,
            input.moneda,
            asMinorUnit(input.valorTotalMinor),
            input.fechaEmision,
            input.fechaVencimiento,
            input.cuentaPlanId ?? null,
            input.centroCostoId ?? null,
            input.ivaTipo ?? null,
            asMinorUnit(input.ivaValorMinor ?? 0n),
            input.observaciones ?? null,
            auth.financeUserId,
          ],
        );
        for (const cuota of input.cuotas) {
          await client.query(
            `INSERT INTO cuotas_cobrar (tenant_id, empresa_id, cuenta_cobrar_id, numero_cuota, valor_minor, fecha_vencimiento)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [
              auth.tenantId,
              input.empresaId,
              account.rows[0].id,
              cuota.numero,
              asMinorUnit(cuota.valorMinor),
              cuota.fechaVencimiento,
            ],
          );
        }
        await recordAudit(client, {
          tenantId: auth.tenantId,
          userCode: auth.tenantUserCode,
          action: 'CREAR',
          entity: 'CUENTA_COBRAR',
          entityId: account.rows[0].id,
          empresaId: input.empresaId,
          detail: {
            descripcion: input.descripcion,
            moneda: input.moneda,
            cuotas: input.cuotas.length,
          },
        });
        return { id: account.rows[0].id, cuotas: input.cuotas.length };
      },
      auth.pool,
    );
    response.status(201).json(created);
  } catch (error) {
    response.status(400).json({
      message: error instanceof z.ZodError ? 'Datos de cuenta por cobrar inválidos.' : (error as Error).message,
    });
  }
});

router.get('/', authenticate, async (request, response) => {
  try {
    const auth = request.auth!;
    const { empresaId } = listQuery.parse(request.query);
    const data = await withTenantContext(
      { tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema },
      async (client) => {
        const result = await client.query(
          `SELECT cc.id, cc.empresa_id, cc.descripcion, cc.numero_documento, cc.numero_factura, cc.moneda,
                  cc.valor_total_minor, cc.fecha_emision::TEXT AS fecha_emision, cc.fecha_vencimiento::TEXT AS fecha_vencimiento,
                  e.razon_social AS empresa,
                  CURRENT_DATE::TEXT AS hoy,
                  CASE WHEN cc.estado = 'CANCELADO' THEN '0'
                       ELSE COALESCE(s.saldo_minor, cc.valor_total_minor)::TEXT END AS saldo_minor,
                  COALESCE(s.cuotas, 0) AS cuotas,
                  CASE WHEN cc.estado = 'CANCELADO' THEN 0
                       ELSE COALESCE(s.cuotas_pendientes, 0) END AS cuotas_pendientes,
                  CASE WHEN cc.estado = 'CANCELADO' THEN NULL
                       ELSE pendiente.id END AS cuota_pendiente_id,
                  CASE WHEN cc.estado = 'CANCELADO' THEN NULL
                       ELSE pendiente.saldo_minor::TEXT END AS cuota_pendiente_saldo_minor,
                  CASE WHEN cc.estado = 'CANCELADO' THEN 'CANCELADO'
                       WHEN COALESCE(s.saldo_minor, cc.valor_total_minor) = 0 THEN 'COBRADO'
                       WHEN cc.fecha_vencimiento < CURRENT_DATE THEN 'VENCIDO' ELSE 'ABIERTO' END AS estado
           FROM cuentas_cobrar cc
           JOIN empresas e ON e.tenant_id = cc.tenant_id AND e.id = cc.empresa_id
           LEFT JOIN LATERAL (
             SELECT SUM(q.valor_minor - COALESCE(b.aplicado_minor, 0)) AS saldo_minor,
                    COUNT(*) AS cuotas,
                    COUNT(*) FILTER (WHERE q.valor_minor - COALESCE(b.aplicado_minor, 0) > 0) AS cuotas_pendientes
             FROM cuotas_cobrar q
             LEFT JOIN LATERAL (
               SELECT SUM(CASE WHEN tipo = 'BAJA' THEN valor_cobrado_minor + descuento_minor ELSE -(valor_cobrado_minor + descuento_minor) END) AS aplicado_minor
               FROM bajas_cobrar WHERE tenant_id = q.tenant_id AND cuota_id = q.id
             ) b ON TRUE
             WHERE q.tenant_id = cc.tenant_id AND q.cuenta_cobrar_id = cc.id
           ) s ON TRUE
           LEFT JOIN LATERAL (
             SELECT q.id, q.valor_minor - COALESCE(b.aplicado_minor, 0) AS saldo_minor
             FROM cuotas_cobrar q
             LEFT JOIN LATERAL (
               SELECT SUM(CASE WHEN tipo = 'BAJA' THEN valor_cobrado_minor + descuento_minor ELSE -(valor_cobrado_minor + descuento_minor) END) AS aplicado_minor
               FROM bajas_cobrar WHERE tenant_id = q.tenant_id AND cuota_id = q.id
             ) b ON TRUE
             WHERE q.tenant_id = cc.tenant_id AND q.cuenta_cobrar_id = cc.id AND q.valor_minor - COALESCE(b.aplicado_minor, 0) > 0
             ORDER BY q.numero_cuota LIMIT 1
           ) pendiente ON TRUE
           WHERE cc.tenant_id = $1 AND ($2::bigint IS NULL OR cc.empresa_id = $2)
           ORDER BY cc.fecha_vencimiento ASC, cc.id ASC`,
          [auth.tenantId, empresaId ?? null],
        );
        return result.rows;
      },
      auth.pool,
    );
    response.json({ data });
  } catch {
    response.status(400).json({ message: 'No fue posible listar las cuentas por cobrar.' });
  }
});

router.get('/:id/detalle', authenticate, async (request, response) => {
  try {
    const cuentaId = z.coerce.number().int().positive().parse(request.params.id);
    const auth = request.auth!;
    const data = await withTenantContext(
      { tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema },
      async (client) => {
        const cuenta = await client.query(
          `SELECT cc.id, cc.empresa_id, cc.descripcion, cc.numero_documento, cc.numero_factura, cc.moneda,
                  cc.valor_total_minor::TEXT, cc.fecha_emision::TEXT, cc.fecha_vencimiento::TEXT,
                  cc.estado, cc.contraparte_id, cc.cuenta_plan_id, cc.centro_costo_id, cc.observaciones,
                  e.razon_social AS empresa
            FROM cuentas_cobrar cc
            JOIN empresas e ON e.tenant_id = cc.tenant_id AND e.id = cc.empresa_id
            WHERE cc.tenant_id = $1 AND cc.id = $2`,
          [auth.tenantId, cuentaId],
        );
        if (!cuenta.rowCount) throw new Error('Cuenta no encontrada o sin acceso.');
        const cuotas = await client.query(
          `SELECT q.id, q.numero_cuota, q.valor_minor::TEXT, q.fecha_vencimiento::TEXT,
                  COALESCE(b.aplicado_minor, 0)::TEXT AS aplicado_minor,
                  (q.valor_minor - COALESCE(b.aplicado_minor, 0))::TEXT AS saldo_minor
           FROM cuotas_cobrar q
           LEFT JOIN LATERAL (
             SELECT SUM(CASE WHEN tipo = 'BAJA' THEN valor_cobrado_minor + descuento_minor ELSE -(valor_cobrado_minor + descuento_minor) END) AS aplicado_minor
             FROM bajas_cobrar b WHERE b.tenant_id = q.tenant_id AND b.cuota_id = q.id
           ) b ON TRUE
           WHERE q.tenant_id = $1 AND q.cuenta_cobrar_id = $2
           ORDER BY q.numero_cuota`,
          [auth.tenantId, cuentaId],
        );
        const bajas = await client.query(
          `SELECT b.id, b.cuota_id, q.numero_cuota, b.tipo, b.fecha::TEXT,
                  (b.valor_cobrado_minor + b.descuento_minor)::TEXT AS valor_minor,
                  b.intereses_minor::TEXT, b.descuento_minor::TEXT, b.observaciones, b.reversion_de_id,
                  EXISTS(SELECT 1 FROM bajas_cobrar r WHERE r.tenant_id = b.tenant_id AND r.reversion_de_id = b.id) AS revertida
           FROM bajas_cobrar b
           JOIN cuotas_cobrar q ON q.tenant_id = b.tenant_id AND q.id = b.cuota_id
           WHERE b.tenant_id = $1 AND q.cuenta_cobrar_id = $2
           ORDER BY b.fecha DESC, b.id DESC`,
          [auth.tenantId, cuentaId],
        );
        return { cuenta: cuenta.rows[0], cuotas: cuotas.rows, bajas: bajas.rows };
      },
      auth.pool,
    );
    response.json(data);
  } catch (error) {
    response.status(400).json({
      message: error instanceof z.ZodError ? 'Cuenta inválida.' : (error as Error).message,
    });
  }
});

router.post('/bajas', authenticate, async (request, response) => {
  try {
    const input = collectionSchema.parse(request.body);
    assertAllBusinessDates(input.fecha);
    const auth = request.auth!;
    const result = await withTenantContext(
      { tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema },
      async (client) => {
        const cuota = await client.query(
          `SELECT q.id, q.empresa_id, q.valor_minor, cc.moneda, cc.estado AS cuenta_estado, q.estado AS cuota_estado,
                  COALESCE((
                    SELECT SUM(CASE WHEN b.tipo = 'BAJA' THEN b.valor_cobrado_minor + b.descuento_minor ELSE -(b.valor_cobrado_minor + b.descuento_minor) END)
                    FROM bajas_cobrar b WHERE b.tenant_id = q.tenant_id AND b.cuota_id = q.id
                  ), 0) AS aplicado_minor
           FROM cuotas_cobrar q
           JOIN cuentas_cobrar cc ON cc.tenant_id = q.tenant_id AND cc.id = q.cuenta_cobrar_id
           WHERE q.tenant_id = $1 AND q.id = $2 FOR UPDATE`,
          [auth.tenantId, input.cuotaId],
        );
        if (!cuota.rowCount) throw new Error('Cuota no encontrada o sin acesso.');
        const row = cuota.rows[0];
        assertCanSettleInstallment({
          cuentaEstado: row.cuenta_estado,
          cuotaEstado: row.cuota_estado,
          tipo: 'cobrar',
        });

        const interest = input.interesesMinor ?? 0n;
        const discount = input.descuentoMinor ?? 0n;
        const applied = input.valorCobradoMinor + discount;
        const remaining = BigInt(row.valor_minor) - BigInt(row.aplicado_minor);
        if (applied <= 0n || applied > remaining) {
          throw new Error('El cobro y descuento no pueden superar el saldo de la cuota.');
        }
        const cashAmount = input.valorCobradoMinor + interest - discount;
        if (cashAmount < 0n) {
          throw new Error('El descuento no puede superar el importe cobrado más los intereses.');
        }
        let movementId: string | null = null;
        if (cashAmount > 0n) {
          if (!input.cajaId) throw new Error('Seleccione la caja que recibió el cobro.');
          const cash = await client.query(
            'SELECT id FROM cajas WHERE tenant_id = $1 AND empresa_id = $2 AND id = $3 AND moneda = $4 AND activo = TRUE',
            [auth.tenantId, row.empresa_id, input.cajaId, row.moneda],
          );
          if (!cash.rowCount) throw new Error('La caja no pertenece a la empresa, está inactiva o usa otra moneda.');
          const movRes = await client.query(
            `INSERT INTO movimientos_caja (tenant_id, empresa_id, caja_id, fecha, historico, tipo, moneda, valor_minor, origen, cuota_origen_id)
             VALUES ($1,$2,$3,$4,$5,'C',$6,$7,'CC',$8) RETURNING id`,
            [
              auth.tenantId,
              row.empresa_id,
              input.cajaId,
              input.fecha,
              `Cobro: ${input.cuotaId}`,
              row.moneda,
              asMinorUnit(cashAmount),
              input.cuotaId,
            ],
          );
          movementId = movRes.rows[0].id;
        } else if (input.cajaId) {
          throw new Error('No informe caja cuando el movimiento de efectivo es cero.');
        }
        const created = await client.query(
          `INSERT INTO bajas_cobrar (tenant_id, empresa_id, cuota_id, tipo, fecha, valor_cobrado_minor, intereses_minor, descuento_minor, caja_id, movimiento_caja_id, observaciones, creado_por)
           VALUES ($1,$2,$3,'BAJA',$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [
            auth.tenantId,
            row.empresa_id,
            input.cuotaId,
            input.fecha,
            asMinorUnit(input.valorCobradoMinor),
            asMinorUnit(interest),
            asMinorUnit(discount),
            input.cajaId ?? null,
            movementId,
            input.observaciones ?? null,
            auth.financeUserId,
          ],
        );
        await recordAudit(client, {
          tenantId: auth.tenantId,
          userCode: auth.tenantUserCode,
          action: 'BAJA',
          entity: 'CUOTA_COBRAR',
          entityId: input.cuotaId,
          empresaId: row.empresa_id,
          detail: {
            bajaId: created.rows[0].id,
            valorMinor: input.valorCobradoMinor.toString(),
            descuentoMinor: discount.toString(),
            interesesMinor: interest.toString(),
          },
        });
        return { id: created.rows[0].id, saldoRestanteMinor: (remaining - applied).toString() };
      },
      auth.pool,
    );
    response.status(201).json(result);
  } catch (error) {
    response.status(400).json({
      message: error instanceof z.ZodError ? 'Datos de cobro inválidos.' : (error as Error).message,
    });
  }
});

router.post('/bajas/:id/reversion', authenticate, async (request, response) => {
  try {
    const id = z.coerce.number().int().positive().parse(request.params.id);
    const body = z.object({ fecha: date, observaciones: z.string().max(10_000).optional() }).parse(request.body);
    assertAllBusinessDates(body.fecha);
    const auth = request.auth!;
    const result = await withTenantContext(
      { tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema },
      async (client) => {
        const original = await client.query(
          `SELECT b.*, cc.moneda
           FROM bajas_cobrar b
           JOIN cuotas_cobrar q ON q.tenant_id = b.tenant_id AND q.id = b.cuota_id
           JOIN cuentas_cobrar cc ON cc.tenant_id = q.tenant_id AND cc.id = q.cuenta_cobrar_id
           WHERE b.tenant_id = $1 AND b.id = $2 AND b.tipo = 'BAJA' FOR UPDATE`,
          [auth.tenantId, id],
        );
        if (!original.rowCount) throw new Error('Cobro no encontrado.');
        const row = original.rows[0];
        const already = await client.query(
          'SELECT 1 FROM bajas_cobrar WHERE tenant_id = $1 AND reversion_de_id = $2',
          [auth.tenantId, id],
        );
        if (already.rowCount) throw new Error('Este cobro ya fue revertido.');

        const cashAmount =
          BigInt(row.valor_cobrado_minor) + BigInt(row.intereses_minor) - BigInt(row.descuento_minor);
        let movementId: string | null = null;
        if (cashAmount > 0n) {
          const movRes = await client.query(
            `INSERT INTO movimientos_caja (tenant_id, empresa_id, caja_id, fecha, historico, tipo, moneda, valor_minor, origen, cuota_origen_id)
             VALUES ($1,$2,$3,$4,$5,'D',$6,$7,'CC',$8) RETURNING id`,
            [
              auth.tenantId,
              row.empresa_id,
              row.caja_id,
              body.fecha,
              `Reversión de cobro: ${id}`,
              row.moneda,
              asMinorUnit(cashAmount),
              row.cuota_id,
            ],
          );
          movementId = movRes.rows[0].id;
        }
        const reversed = await client.query(
          `INSERT INTO bajas_cobrar (tenant_id, empresa_id, cuota_id, tipo, fecha, valor_cobrado_minor, intereses_minor, descuento_minor, caja_id, movimiento_caja_id, reversion_de_id, observaciones, creado_por)
           VALUES ($1,$2,$3,'REVERSION',$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
          [
            auth.tenantId,
            row.empresa_id,
            row.cuota_id,
            body.fecha,
            row.valor_cobrado_minor,
            row.intereses_minor,
            row.descuento_minor,
            row.caja_id,
            movementId,
            id,
            body.observaciones ?? null,
            auth.financeUserId,
          ],
        );
        await recordAudit(client, {
          tenantId: auth.tenantId,
          userCode: auth.tenantUserCode,
          action: 'REVERSION',
          entity: 'BAJA_COBRAR',
          entityId: id,
          empresaId: row.empresa_id,
          detail: { reversionId: reversed.rows[0].id },
        });
        return { id: reversed.rows[0].id, reversionDeId: id };
      },
      auth.pool,
    );
    response.status(201).json(result);
  } catch (error) {
    response.status(400).json({
      message: error instanceof z.ZodError ? 'Datos de reversión inválidos.' : (error as Error).message,
    });
  }
});

router.post('/:id/cancelar', authenticate, async (request, response) => {
  try {
    const cuentaId = z.coerce.number().int().positive().parse(request.params.id);
    const body = cancelReceivableSchema.parse(request.body ?? {});
    const auth = request.auth!;

    const result = await withTenantContext(
      { tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema },
      async (client) => {
        const cuentaRes = await client.query(
          `SELECT id, empresa_id, descripcion, moneda, valor_total_minor, estado
           FROM cuentas_cobrar
           WHERE tenant_id = $1 AND id = $2
           FOR UPDATE`,
          [auth.tenantId, cuentaId],
        );
        if (!cuentaRes.rowCount) throw new Error('Cuenta no encontrada o sin acceso.');
        const cuenta = cuentaRes.rows[0];

        const activeBajas = await client.query(
          `SELECT 1
           FROM bajas_cobrar b
           JOIN cuotas_cobrar q ON q.tenant_id = b.tenant_id AND q.id = b.cuota_id
           WHERE b.tenant_id = $1 AND q.cuenta_cobrar_id = $2
           GROUP BY b.cuota_id
           HAVING SUM(CASE WHEN b.tipo = 'BAJA' THEN b.valor_cobrado_minor + b.descuento_minor ELSE -(b.valor_cobrado_minor + b.descuento_minor) END) > 0
           LIMIT 1`,
          [auth.tenantId, cuentaId],
        );

        assertCanCancelAccount({
          estado: cuenta.estado,
          activeBajasCount: activeBajas.rowCount ?? 0,
          tipo: 'cobrar',
        });

        await client.query(
          `UPDATE cuentas_cobrar
           SET estado = 'CANCELADO'
           WHERE tenant_id = $1 AND id = $2`,
          [auth.tenantId, cuentaId],
        );

        await client.query(
          `UPDATE cuotas_cobrar
           SET estado = 'CANCELADO'
           WHERE tenant_id = $1 AND cuenta_cobrar_id = $2`,
          [auth.tenantId, cuentaId],
        );

        await recordAudit(client, {
          tenantId: auth.tenantId,
          userCode: auth.tenantUserCode,
          action: 'CANCELAR',
          entity: 'CUENTA_COBRAR',
          entityId: cuentaId,
          empresaId: cuenta.empresa_id,
          detail: {
            descripcion: cuenta.descripcion,
            moneda: cuenta.moneda,
            valorTotalMinor: String(cuenta.valor_total_minor),
            motivo: body.motivo ?? 'Cancelación solicitada por el usuario',
          },
        });

        return { id: cuentaId, estado: 'CANCELADO' };
      },
      auth.pool,
    );

    response.json(result);
  } catch (error) {
    response.status(400).json({
      message: error instanceof z.ZodError ? 'Datos de cancelación inválidos.' : (error as Error).message,
    });
  }
});

const updateReceivableSchema = z.object({
  descripcion: z.string().trim().min(1).max(200).optional(),
  numeroDocumento: z.string().trim().max(50).nullable().optional(),
  contraparteId: z.number().int().positive().nullable().optional(),
  cuentaPlanId: z.number().int().positive().nullable().optional(),
  centroCostoId: z.number().int().positive().nullable().optional(),
  observaciones: z.string().max(10_000).nullable().optional(),
  fechaVencimiento: date.optional(),
});

router.patch('/:id', authenticate, async (request, response) => {
  try {
    const cuentaId = z.coerce.number().int().positive().parse(request.params.id);
    const body = updateReceivableSchema.parse(request.body ?? {});
    const auth = request.auth!;

    const result = await withTenantContext(
      { tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema },
      async (client) => {
        const cuentaRes = await client.query(
          `SELECT id, empresa_id, descripcion, numero_documento, contraparte_id,
                  cuenta_plan_id, centro_costo_id, observaciones, fecha_vencimiento::TEXT as fecha_vencimiento,
                  moneda, valor_total_minor, estado
           FROM cuentas_cobrar
           WHERE tenant_id = $1 AND id = $2
           FOR UPDATE`,
          [auth.tenantId, cuentaId],
        );
        if (!cuentaRes.rowCount) throw new Error('Cuenta no encontrada o sin acceso.');
        const cuenta = cuentaRes.rows[0];

        const activeBajas = await client.query(
          `SELECT 1
           FROM bajas_cobrar b
           JOIN cuotas_cobrar q ON q.tenant_id = b.tenant_id AND q.id = b.cuota_id
           WHERE b.tenant_id = $1 AND q.cuenta_cobrar_id = $2
           GROUP BY b.cuota_id
           HAVING SUM(CASE WHEN b.tipo = 'BAJA' THEN b.valor_cobrado_minor + b.descuento_minor ELSE -(b.valor_cobrado_minor + b.descuento_minor) END) > 0
           LIMIT 1`,
          [auth.tenantId, cuentaId],
        );

        const hasDueDateChange = body.fechaVencimiento !== undefined && body.fechaVencimiento !== cuenta.fecha_vencimiento;

        assertCanUpdateAccount({
          estado: cuenta.estado,
          hasDueDateChange,
          activeBajasCount: activeBajas.rowCount ?? 0,
          tipo: 'cobrar',
        });

        if (body.cuentaPlanId) {
          const plan = await client.query(
            `SELECT id FROM cuentas_plan
             WHERE tenant_id = $1 AND empresa_id = $2 AND id = $3 AND naturaleza = 'R'`,
            [auth.tenantId, cuenta.empresa_id, body.cuentaPlanId],
          );
          if (!plan.rowCount) throw new Error('Cuenta del plan inválida o no corresponde a una cuenta de ingreso.');
        }

        if (body.centroCostoId) {
          const center = await client.query(
            `SELECT id FROM centros_costo WHERE tenant_id = $1 AND empresa_id = $2 AND id = $3`,
            [auth.tenantId, cuenta.empresa_id, body.centroCostoId],
          );
          if (!center.rowCount) throw new Error('Centro de costo no encontrado.');
        }

        if (body.contraparteId) {
          const contact = await client.query(
            `SELECT id FROM contrapartes WHERE tenant_id = $1 AND id = $2`,
            [auth.tenantId, body.contraparteId],
          );
          if (!contact.rowCount) throw new Error('Contacto no encontrado.');
        }

        const newDescripcion = body.descripcion ?? cuenta.descripcion;
        const newNumeroDoc = body.numeroDocumento !== undefined ? body.numeroDocumento : cuenta.numero_documento;
        const newContraparteId = body.contraparteId !== undefined ? body.contraparteId : cuenta.contraparte_id;
        const newCuentaPlanId = body.cuentaPlanId !== undefined ? body.cuentaPlanId : cuenta.cuenta_plan_id;
        const newCentroCostoId = body.centroCostoId !== undefined ? body.centroCostoId : cuenta.centro_costo_id;
        const newObservaciones = body.observaciones !== undefined ? body.observaciones : cuenta.observaciones;
        const newFechaVenc = body.fechaVencimiento ?? cuenta.fecha_vencimiento;

        await client.query(
          `UPDATE cuentas_cobrar
           SET descripcion = $1,
               numero_documento = $2,
               contraparte_id = $3,
               cuenta_plan_id = $4,
               centro_costo_id = $5,
               observaciones = $6,
               fecha_vencimiento = $7
           WHERE tenant_id = $8 AND id = $9`,
          [newDescripcion, newNumeroDoc, newContraparteId, newCuentaPlanId, newCentroCostoId, newObservaciones, newFechaVenc, auth.tenantId, cuentaId],
        );

        if (hasDueDateChange) {
          const cuotasCount = await client.query(
            `SELECT COUNT(*)::int as count FROM cuotas_cobrar WHERE tenant_id = $1 AND cuenta_cobrar_id = $2`,
            [auth.tenantId, cuentaId],
          );
          if (cuotasCount.rows[0].count === 1) {
            await client.query(
              `UPDATE cuotas_cobrar SET fecha_vencimiento = $1 WHERE tenant_id = $2 AND cuenta_cobrar_id = $3`,
              [newFechaVenc, auth.tenantId, cuentaId],
            );
          }
        }

        await recordAudit(client, {
          tenantId: auth.tenantId,
          userCode: auth.tenantUserCode,
          action: 'ACTUALIZAR',
          entity: 'CUENTA_COBRAR',
          entityId: cuentaId,
          empresaId: cuenta.empresa_id,
          detail: {
            antes: {
              descripcion: cuenta.descripcion,
              numeroDocumento: cuenta.numero_documento,
              cuentaPlanId: cuenta.cuenta_plan_id,
              centroCostoId: cuenta.centro_costo_id,
              fechaVencimiento: cuenta.fecha_vencimiento,
            },
            despues: {
              descripcion: newDescripcion,
              numeroDocumento: newNumeroDoc,
              cuentaPlanId: newCuentaPlanId,
              centroCostoId: newCentroCostoId,
              fechaVencimiento: newFechaVenc,
            },
          },
        });

        return { id: cuentaId, ok: true };
      },
      auth.pool,
    );

    response.json(result);
  } catch (error) {
    response.status(400).json({
      message: error instanceof z.ZodError ? 'Datos de actualización inválidos.' : (error as Error).message,
    });
  }
});

export default router;
