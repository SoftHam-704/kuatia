import { Router } from 'express';
import { z } from 'zod';
import { withTenantContext } from '../../config/database.js';
import { authenticate } from '../../middleware/auth.js';
import { assertInstallmentsTotal } from '../../domain/installments.js';
import { asMinorUnit, assertAllBusinessDates } from '../../domain/validation.js';
import { assertCanCancelAccount, assertCanSettleInstallment } from '../../domain/cancellation.js';
import { recordAudit } from '../audit/audit.service.js';

const router = Router();
const minorAmount = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).transform((value) => BigInt(value));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const settlementAmount = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).transform((value) => BigInt(value));
const listQuery = z.object({ empresaId: z.coerce.number().int().positive().optional() });

const createPayableSchema = z.object({
  empresaId: z.number().int().positive(),
  descripcion: z.string().trim().min(1).max(200),
  contraparteId: z.number().int().positive().optional(),
  numeroDocumento: z.string().trim().max(50).optional(),
  moneda: z.enum(['PYG', 'USD', 'BRL']),
  valorTotalMinor: minorAmount,
  fechaEmision: date,
  fechaVencimiento: date,
  cuentaPlanId: z.number().int().positive().optional(),
  centroCostoId: z.number().int().positive().optional(),
  ivaTipo: z.enum(['10', '5', 'EXENTA']).optional(),
  ivaValorMinor: minorAmount.optional(),
  observaciones: z.string().max(10_000).optional(),
  cuotas: z.array(z.object({ numero: z.number().int().positive(), valorMinor: minorAmount, fechaVencimiento: date })).min(1),
});

const paymentSchema = z.object({
  cuotaId: z.number().int().positive(), fecha: date, valorPagadoMinor: settlementAmount,
  interesesMinor: settlementAmount.optional(), descuentoMinor: settlementAmount.optional(), cajaId: z.number().int().positive().optional(), observaciones: z.string().max(10_000).optional(),
});

router.post('/', authenticate, async (request, response) => {
  try {
    const input = createPayableSchema.parse(request.body);
    assertAllBusinessDates(input.fechaEmision, input.fechaVencimiento, ...input.cuotas.map((cuota) => cuota.fechaVencimiento));
    assertInstallmentsTotal(input.valorTotalMinor, input.cuotas.map((cuota) => cuota.valorMinor));
    if (new Set(input.cuotas.map((cuota) => cuota.numero)).size !== input.cuotas.length) throw new Error('El número de cuota debe ser único.');

    const auth = request.auth!;
    const payable = await withTenantContext({ tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema }, async (client) => {
      const company = await client.query('SELECT id FROM empresas WHERE tenant_id = $1 AND id = $2 AND activa = TRUE', [auth.tenantId, input.empresaId]);
      if (!company.rowCount) throw new Error('Empresa no encontrada o sin acceso.');

      const created = await client.query(
        `INSERT INTO cuentas_pagar (
          tenant_id, empresa_id, descripcion, contraparte_id, numero_documento, moneda,
          valor_total_minor, fecha_emision, fecha_vencimiento, cuenta_plan_id, centro_costo_id,
          iva_tipo, iva_valor_minor, observaciones, creado_por
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        RETURNING id, estado`,
        [auth.tenantId, input.empresaId, input.descripcion, input.contraparteId ?? null, input.numeroDocumento ?? null, input.moneda,
          input.valorTotalMinor, input.fechaEmision, input.fechaVencimiento, input.cuentaPlanId ?? null, input.centroCostoId ?? null,
          input.ivaTipo ?? null, input.ivaValorMinor ?? 0n, input.observaciones ?? null, auth.financeUserId],
      );
      const cuentaId = created.rows[0].id;
      for (const cuota of input.cuotas) {
        await client.query(
          `INSERT INTO cuotas_pagar (tenant_id, empresa_id, cuenta_pagar_id, numero_cuota, valor_minor, fecha_vencimiento)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [auth.tenantId, input.empresaId, cuentaId, cuota.numero, cuota.valorMinor, cuota.fechaVencimiento],
        );
      }
      await recordAudit(client, { tenantId: auth.tenantId, userCode: auth.tenantUserCode, action: 'CREAR', entity: 'CUENTA_PAGAR', entityId: cuentaId, empresaId: input.empresaId, detail: { descripcion: input.descripcion, moneda: input.moneda, cuotas: input.cuotas.length } });
      return { id: cuentaId, estado: created.rows[0].estado, cuotas: input.cuotas.length };
    }, auth.pool);
    response.status(201).json(payable);
  } catch (error) {
    const message = error instanceof z.ZodError ? 'Datos de cuenta por pagar inválidos.' : (error as Error).message;
    response.status(400).json({ message });
  }
});

router.get('/', authenticate, async (request, response) => {
  try {
    const auth = request.auth!;
    const { empresaId } = listQuery.parse(request.query);
    const rows = await withTenantContext({ tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema }, async (client) => {
      const result = await client.query(
        `SELECT cp.id, cp.empresa_id, cp.descripcion, cp.numero_documento, cp.moneda,
                cp.valor_total_minor, cp.fecha_emision::TEXT AS fecha_emision, cp.fecha_vencimiento::TEXT AS fecha_vencimiento,
                e.razon_social AS empresa,
                CURRENT_DATE::TEXT AS hoy,
                CASE WHEN cp.estado = 'CANCELADO' THEN '0'
                     ELSE COALESCE(s.saldo_minor, cp.valor_total_minor)::TEXT END AS saldo_minor,
                COALESCE(s.cuotas, 0) AS cuotas,
                CASE WHEN cp.estado = 'CANCELADO' THEN 0
                     ELSE COALESCE(s.cuotas_pendientes, 0) END AS cuotas_pendientes,
                CASE WHEN cp.estado = 'CANCELADO' THEN NULL
                     ELSE pendiente.id END AS cuota_pendiente_id,
                CASE WHEN cp.estado = 'CANCELADO' THEN NULL
                     ELSE pendiente.saldo_minor::TEXT END AS cuota_pendiente_saldo_minor,
                CASE WHEN cp.estado = 'CANCELADO' THEN 'CANCELADO'
                     WHEN COALESCE(s.saldo_minor, cp.valor_total_minor) = 0 THEN 'PAGADO'
                     WHEN cp.fecha_vencimiento < CURRENT_DATE THEN 'VENCIDO' ELSE 'ABIERTO' END AS estado
         FROM cuentas_pagar cp
         JOIN empresas e ON e.tenant_id = cp.tenant_id AND e.id = cp.empresa_id
         LEFT JOIN LATERAL (
           SELECT SUM(q.valor_minor - COALESCE(b.aplicado_minor, 0)) AS saldo_minor,
                  COUNT(*) AS cuotas,
                  COUNT(*) FILTER (WHERE q.valor_minor - COALESCE(b.aplicado_minor, 0) > 0) AS cuotas_pendientes
           FROM cuotas_pagar q
           LEFT JOIN LATERAL (
             SELECT SUM(CASE WHEN tipo = 'BAJA' THEN valor_pagado_minor + descuento_minor ELSE -(valor_pagado_minor + descuento_minor) END) AS aplicado_minor
             FROM bajas_pagar WHERE tenant_id = q.tenant_id AND cuota_id = q.id
           ) b ON TRUE
           WHERE q.tenant_id = cp.tenant_id AND q.cuenta_pagar_id = cp.id
         ) s ON TRUE
         LEFT JOIN LATERAL (
           SELECT q.id, q.valor_minor - COALESCE(b.aplicado_minor, 0) AS saldo_minor FROM cuotas_pagar q
           LEFT JOIN LATERAL (SELECT SUM(CASE WHEN tipo='BAJA' THEN valor_pagado_minor+descuento_minor ELSE -(valor_pagado_minor+descuento_minor) END) AS aplicado_minor FROM bajas_pagar WHERE tenant_id=q.tenant_id AND cuota_id=q.id) b ON TRUE
           WHERE q.tenant_id=cp.tenant_id AND q.cuenta_pagar_id=cp.id AND q.valor_minor-COALESCE(b.aplicado_minor,0)>0
           ORDER BY q.numero_cuota LIMIT 1
         ) pendiente ON TRUE
         WHERE cp.tenant_id = $1 AND ($2::bigint IS NULL OR cp.empresa_id = $2)
         ORDER BY cp.fecha_vencimiento ASC, cp.id ASC`,
        [auth.tenantId, empresaId ?? null],
      );
      return result.rows;
    }, auth.pool);
    response.json({ data: rows });
  } catch {
    response.status(400).json({ message: 'No fue posible listar las cuentas por pagar.' });
  }
});

router.get('/:id/detalle', authenticate, async (request, response) => {
  try {
    const cuentaId = z.coerce.number().int().positive().parse(request.params.id);
    const auth = request.auth!;
    const data = await withTenantContext({ tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema }, async (client) => {
      const cuenta = await client.query(
        `SELECT cp.id, cp.empresa_id, cp.descripcion, cp.numero_documento, cp.moneda,
                cp.valor_total_minor::TEXT, cp.fecha_emision::TEXT, cp.fecha_vencimiento::TEXT,
                cp.estado,
                e.razon_social AS empresa
           FROM cuentas_pagar cp
           JOIN empresas e ON e.tenant_id = cp.tenant_id AND e.id = cp.empresa_id
          WHERE cp.tenant_id = $1 AND cp.id = $2`,
        [auth.tenantId, cuentaId],
      );
      if (!cuenta.rowCount) throw new Error('Cuenta no encontrada o sin acceso.');
      const cuotas = await client.query(
        `SELECT q.id, q.numero_cuota, q.valor_minor::TEXT, q.fecha_vencimiento::TEXT,
                COALESCE(b.aplicado_minor, 0)::TEXT AS aplicado_minor,
                (q.valor_minor - COALESCE(b.aplicado_minor, 0))::TEXT AS saldo_minor
           FROM cuotas_pagar q
           LEFT JOIN LATERAL (
             SELECT SUM(CASE WHEN tipo = 'BAJA' THEN valor_pagado_minor + descuento_minor ELSE -(valor_pagado_minor + descuento_minor) END) AS aplicado_minor
               FROM bajas_pagar b WHERE b.tenant_id = q.tenant_id AND b.cuota_id = q.id
           ) b ON TRUE
          WHERE q.tenant_id = $1 AND q.cuenta_pagar_id = $2
          ORDER BY q.numero_cuota`,
        [auth.tenantId, cuentaId],
      );
      const bajas = await client.query(
        `SELECT b.id, b.cuota_id, q.numero_cuota, b.tipo, b.fecha::TEXT,
                (b.valor_pagado_minor + b.descuento_minor)::TEXT AS valor_minor, b.intereses_minor::TEXT, b.descuento_minor::TEXT,
                b.observaciones, b.reversion_de_id,
                EXISTS(SELECT 1 FROM bajas_pagar r WHERE r.tenant_id = b.tenant_id AND r.reversion_de_id = b.id) AS revertida
           FROM bajas_pagar b
           JOIN cuotas_pagar q ON q.tenant_id = b.tenant_id AND q.id = b.cuota_id
          WHERE b.tenant_id = $1 AND q.cuenta_pagar_id = $2
          ORDER BY b.fecha DESC, b.id DESC`,
        [auth.tenantId, cuentaId],
      );
      return { cuenta: cuenta.rows[0], cuotas: cuotas.rows, bajas: bajas.rows };
    }, auth.pool);
    response.json(data);
  } catch (error) {
    response.status(400).json({ message: error instanceof z.ZodError ? 'Cuenta inválida.' : (error as Error).message });
  }
});

router.post('/bajas', authenticate, async (request, response) => {
  try {
    const input = paymentSchema.parse(request.body); assertAllBusinessDates(input.fecha);
    const auth = request.auth!;
    const result = await withTenantContext({ tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema }, async (client) => {
      const cuota = await client.query(
        `SELECT q.id, q.empresa_id, q.valor_minor, cp.moneda, cp.estado AS cuenta_estado, q.estado AS cuota_estado,
                COALESCE((SELECT SUM(CASE WHEN b.tipo='BAJA' THEN b.valor_pagado_minor+b.descuento_minor ELSE -(b.valor_pagado_minor+b.descuento_minor) END)
                 FROM bajas_pagar b WHERE b.tenant_id=q.tenant_id AND b.cuota_id=q.id), 0) AS aplicado_minor
         FROM cuotas_pagar q JOIN cuentas_pagar cp ON cp.tenant_id=q.tenant_id AND cp.id=q.cuenta_pagar_id
         WHERE q.tenant_id=$1 AND q.id=$2 FOR UPDATE`, [auth.tenantId, input.cuotaId],
      );
      if (!cuota.rowCount) throw new Error('Cuota no encontrada o sin acceso.');
      const row = cuota.rows[0];
      assertCanSettleInstallment({ cuentaEstado: row.cuenta_estado, cuotaEstado: row.cuota_estado, tipo: 'pagar' });
      const interest = input.interesesMinor ?? 0n; const discount = input.descuentoMinor ?? 0n;
      const applied = input.valorPagadoMinor + discount; const remaining = BigInt(row.valor_minor) - BigInt(row.aplicado_minor);
      if (applied <= 0n || applied > remaining) throw new Error('El pago y descuento no pueden superar el saldo de la cuota.');
      const cashAmount = input.valorPagadoMinor + interest - discount;
      if (cashAmount < 0n) throw new Error('El descuento no puede superar el importe cobrado más los intereses.');
      let movementId: string | null = null;
      if (cashAmount > 0n) {
        if (!input.cajaId) throw new Error('Seleccione la caja desde la que se realizó el pago.');
        const cash = await client.query('SELECT id FROM cajas WHERE tenant_id=$1 AND empresa_id=$2 AND id=$3 AND moneda=$4 AND activo=TRUE', [auth.tenantId, row.empresa_id, input.cajaId, row.moneda]);
        if (!cash.rowCount) throw new Error('La caja no pertenece a la empresa, está inactiva o usa otra moneda.');
        const movement = await client.query(
          `INSERT INTO movimientos_caja (tenant_id,empresa_id,caja_id,fecha,historico,tipo,moneda,valor_minor,origen,cuota_origen_id)
           VALUES ($1,$2,$3,$4,$5,'D',$6,$7,'CP',$8) RETURNING id`,
          [auth.tenantId,row.empresa_id,input.cajaId,input.fecha,`Pago: ${input.cuotaId}`,row.moneda,asMinorUnit(cashAmount),input.cuotaId],
        ); movementId = movement.rows[0].id;
      } else if (input.cajaId) throw new Error('No informe caja quando el movimiento de efectivo es cero.');
      const created = await client.query(
        `INSERT INTO bajas_pagar (tenant_id,empresa_id,cuota_id,tipo,fecha,valor_pagado_minor,intereses_minor,descuento_minor,caja_id,movimiento_caja_id,observaciones,creado_por)
         VALUES ($1,$2,$3,'BAJA',$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [auth.tenantId,row.empresa_id,input.cuotaId,input.fecha,asMinorUnit(input.valorPagadoMinor),asMinorUnit(interest),asMinorUnit(discount),input.cajaId ?? null,movementId,input.observaciones ?? null,auth.financeUserId],
      ); await recordAudit(client, { tenantId: auth.tenantId, userCode: auth.tenantUserCode, action: 'BAJA', entity: 'CUOTA_PAGAR', entityId: input.cuotaId, empresaId: row.empresa_id, detail: { bajaId: created.rows[0].id, valorMinor: input.valorPagadoMinor.toString(), descuentoMinor: discount.toString(), interesesMinor: interest.toString() } }); return { id: created.rows[0].id, saldoRestanteMinor: (remaining - applied).toString() };
    }, auth.pool);
    response.status(201).json(result);
  } catch (error) { response.status(400).json({ message: error instanceof z.ZodError ? 'Datos de pago inválidos.' : (error as Error).message }); }
});

router.post('/bajas/:id/reversion', authenticate, async (request, response) => {
  try {
    const bajaId = z.coerce.number().int().positive().parse(request.params.id); const body = z.object({ fecha: date, observaciones: z.string().max(10_000).optional() }).parse(request.body); assertAllBusinessDates(body.fecha);
    const auth = request.auth!;
    const result = await withTenantContext({ tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema }, async (client) => {
      const original = await client.query(
        `SELECT b.*, cp.moneda FROM bajas_pagar b JOIN cuotas_pagar q ON q.tenant_id=b.tenant_id AND q.id=b.cuota_id
          JOIN cuentas_pagar cp ON cp.tenant_id=q.tenant_id AND cp.id=q.cuenta_pagar_id
         WHERE b.tenant_id=$1 AND b.id=$2 AND b.tipo='BAJA' FOR UPDATE`, [auth.tenantId,bajaId],
      );
      if (!original.rowCount) throw new Error('Pago no encontrado.'); const row=original.rows[0];
      const already = await client.query('SELECT 1 FROM bajas_pagar WHERE tenant_id=$1 AND reversion_de_id=$2', [auth.tenantId,bajaId]);
      if (already.rowCount) throw new Error('Este pago ya fue revertido.');
      let movementId: string | null = null; const cashAmount=BigInt(row.valor_pagado_minor)+BigInt(row.intereses_minor)-BigInt(row.descuento_minor);
      if (cashAmount > 0n) {
        const movement = await client.query(`INSERT INTO movimientos_caja (tenant_id,empresa_id,caja_id,fecha,historico,tipo,moneda,valor_minor,origen,cuota_origen_id)
          VALUES ($1,$2,$3,$4,$5,'C',$6,$7,'CP',$8) RETURNING id`, [auth.tenantId,row.empresa_id,row.caja_id,body.fecha,`Reversión de pago: ${bajaId}`,row.moneda,asMinorUnit(cashAmount),row.cuota_id]); movementId=movement.rows[0].id;
      }
      const reversed=await client.query(`INSERT INTO bajas_pagar (tenant_id,empresa_id,cuota_id,tipo,fecha,valor_pagado_minor,intereses_minor,descuento_minor,caja_id,movimiento_caja_id,reversion_de_id,observaciones,creado_por)
        VALUES ($1,$2,$3,'REVERSION',$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,[auth.tenantId,row.empresa_id,row.cuota_id,body.fecha,row.valor_pagado_minor,row.intereses_minor,row.descuento_minor,row.caja_id,movementId,bajaId,body.observaciones ?? null,auth.financeUserId]);
      await recordAudit(client, { tenantId: auth.tenantId, userCode: auth.tenantUserCode, action: 'REVERSION', entity: 'BAJA_PAGAR', entityId: bajaId, empresaId: row.empresa_id, detail: { reversionId: reversed.rows[0].id } }); return { id:reversed.rows[0].id, reversionDeId:bajaId };
    },auth.pool); response.status(201).json(result);
  } catch(error){response.status(400).json({message:error instanceof z.ZodError?'Datos de reversión inválidos.':(error as Error).message});}
});

const cancelPayableSchema = z.object({
  motivo: z.string().trim().max(1000).optional(),
});

router.post('/:id/cancelar', authenticate, async (request, response) => {
  try {
    const cuentaId = z.coerce.number().int().positive().parse(request.params.id);
    const body = cancelPayableSchema.parse(request.body ?? {});
    const auth = request.auth!;

    const result = await withTenantContext(
      { tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema },
      async (client) => {
        const cuentaRes = await client.query(
          `SELECT id, empresa_id, descripcion, moneda, valor_total_minor, estado
           FROM cuentas_pagar
           WHERE tenant_id = $1 AND id = $2
           FOR UPDATE`,
          [auth.tenantId, cuentaId],
        );
        if (!cuentaRes.rowCount) throw new Error('Cuenta no encontrada o sin acceso.');
        const cuenta = cuentaRes.rows[0];

        const activeBajas = await client.query(
          `SELECT 1
           FROM bajas_pagar b
           JOIN cuotas_pagar q ON q.tenant_id = b.tenant_id AND q.id = b.cuota_id
           WHERE b.tenant_id = $1 AND q.cuenta_pagar_id = $2
           GROUP BY b.cuota_id
           HAVING SUM(CASE WHEN b.tipo = 'BAJA' THEN b.valor_pagado_minor + b.descuento_minor ELSE -(b.valor_pagado_minor + b.descuento_minor) END) > 0
           LIMIT 1`,
          [auth.tenantId, cuentaId],
        );

        assertCanCancelAccount({
          estado: cuenta.estado,
          activeBajasCount: activeBajas.rowCount ?? 0,
          tipo: 'pagar',
        });

        await client.query(
          `UPDATE cuentas_pagar
           SET estado = 'CANCELADO'
           WHERE tenant_id = $1 AND id = $2`,
          [auth.tenantId, cuentaId],
        );

        await client.query(
          `UPDATE cuotas_pagar
           SET estado = 'CANCELADO'
           WHERE tenant_id = $1 AND cuenta_pagar_id = $2`,
          [auth.tenantId, cuentaId],
        );

        await recordAudit(client, {
          tenantId: auth.tenantId,
          userCode: auth.tenantUserCode,
          action: 'CANCELAR',
          entity: 'CUENTA_PAGAR',
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

export default router;
