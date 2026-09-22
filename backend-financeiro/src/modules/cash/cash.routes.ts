import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { withTenantContext } from '../../config/database.js';
import { authenticate } from '../../middleware/auth.js';
import { asMinorUnit, assertBusinessDate } from '../../domain/validation.js';

const router = Router();
const amount = z.union([z.string().regex(/^\d+$/), z.number().int().positive()]).transform((v) => BigInt(v));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const boxSchema = z.object({ empresaId: z.number().int().positive(), nombre: z.string().trim().min(2).max(100), tipo: z.enum(['caja', 'banco']).default('caja'), moneda: z.enum(['PYG','USD','BRL']).default('PYG'), saldoInicialMinor: z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).optional().transform((v) => v === undefined ? 0n : BigInt(v)), fechaSaldoInicial: date.optional() });
const movementSchema = z.object({ empresaId: z.number().int().positive(), cajaId: z.number().int().positive(), fecha: date, historico: z.string().trim().min(2).max(10_000), tipo: z.enum(['C','D']), moneda: z.enum(['PYG','USD','BRL']), valorMinor: amount, cuentaPlanId: z.number().int().positive().optional(), centroCostoId: z.number().int().positive().optional(), documento: z.string().trim().max(60).optional() });
const transferSchema = z.object({ empresaId: z.number().int().positive(), cajaOrigenId: z.number().int().positive(), cajaDestinoId: z.number().int().positive(), fecha: date, valorMinor: amount, historico: z.string().trim().min(2).max(10_000) });
const boxesQuery = z.object({ empresaId: z.coerce.number().int().positive().optional() });
const ledgerQuery = z.object({
  empresaId: z.coerce.number().int().positive(),
  cajaId: z.coerce.number().int().positive().optional(),
  desde: date.optional(),
  hasta: date.optional(),
  limite: z.coerce.number().int().positive().max(500).default(100),
});

router.get('/cajas', authenticate, async (request, response) => {
  try { const auth = request.auth!; const { empresaId } = boxesQuery.parse(request.query);
    const data = await withTenantContext({ tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema }, async (client) => {
    /* O saldo é sempre calculado, e só contam movimentos a partir da data do
       saldo inicial — o mesmo critério do painel, para que nunca apareçam dois
       saldos diferentes para a mesma caja em duas telas. */
    const result = await client.query(`SELECT c.id,c.empresa_id,c.nombre,c.tipo,c.moneda,c.saldo_inicial_minor,
      c.fecha_saldo_inicial::TEXT AS fecha_saldo_inicial,
      CURRENT_DATE::TEXT AS hoy,
      c.saldo_inicial_minor + COALESCE(SUM(CASE WHEN m.tipo='C' THEN m.valor_minor ELSE -m.valor_minor END),0) AS saldo_actual_minor,
      COUNT(m.id)::INT AS movimientos,
      MAX(m.fecha)::TEXT AS ultimo_movimiento
      FROM cajas c
      LEFT JOIN movimientos_caja m ON m.tenant_id=c.tenant_id AND m.caja_id=c.id AND m.fecha >= c.fecha_saldo_inicial
      WHERE c.tenant_id=$1 AND c.activo=TRUE AND ($2::bigint IS NULL OR c.empresa_id=$2)
      GROUP BY c.id ORDER BY c.tipo, c.nombre`, [auth.tenantId, empresaId ?? null]); return result.rows;
  }, auth.pool); response.json({ data }); } catch { response.status(400).json({ message: 'No fue posible listar las cajas.' }); }
});

/** Livro caixa: o extrato que explica de onde veio cada guaraní do saldo. */
router.get('/movimientos', authenticate, async (request, response) => {
  try {
    const input = ledgerQuery.parse(request.query);
    if (input.desde && input.hasta && input.hasta < input.desde) throw new Error('La fecha final debe ser igual o posterior a la inicial.');
    const auth = request.auth!;
    const data = await withTenantContext({ tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema }, async (client) => {
      const result = await client.query(
        `SELECT m.id, m.fecha::TEXT AS fecha, m.historico, m.tipo, m.moneda, m.valor_minor, m.origen, m.documento,
                m.caja_id, c.nombre AS caja, c.tipo AS caja_tipo, m.transferencia_id
         FROM movimientos_caja m
         JOIN cajas c ON c.tenant_id = m.tenant_id AND c.id = m.caja_id
         WHERE m.tenant_id = $1 AND m.empresa_id = $2
           AND ($3::bigint IS NULL OR m.caja_id = $3)
           AND ($4::date IS NULL OR m.fecha >= $4)
           AND ($5::date IS NULL OR m.fecha <= $5)
         ORDER BY m.fecha DESC, m.id DESC
         LIMIT $6`,
        [auth.tenantId, input.empresaId, input.cajaId ?? null, input.desde ?? null, input.hasta ?? null, input.limite],
      );
      return result.rows;
    }, auth.pool);
    response.json({ data, limite: input.limite, truncado: data.length === input.limite });
  } catch (error) {
    response.status(400).json({ message: error instanceof z.ZodError ? 'Filtros del libro caja inválidos.' : (error as Error).message });
  }
});

router.post('/cajas', authenticate, async (request, response) => {
  try { const input = boxSchema.parse(request.body); if (input.fechaSaldoInicial) assertBusinessDate(input.fechaSaldoInicial); const auth=request.auth!;
    const created = await withTenantContext({tenantId:auth.tenantId,userId: auth.tenantUserCode, schema: auth.schema }, async client => (await client.query(
      `INSERT INTO cajas (tenant_id,empresa_id,nombre,tipo,moneda,saldo_inicial_minor,fecha_saldo_inicial) VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,CURRENT_DATE)) RETURNING id,nombre,moneda`,
      [auth.tenantId,input.empresaId,input.nombre,input.tipo,input.moneda,asMinorUnit(input.saldoInicialMinor),input.fechaSaldoInicial ?? null])).rows[0],auth.pool);
    response.status(201).json(created);
  } catch (error) { response.status(400).json({ message:error instanceof z.ZodError?'Datos de caja inválidos.':(error as Error).message }); }
});

router.post('/movimientos', authenticate, async (request,response) => {
  try { const input=movementSchema.parse(request.body); assertBusinessDate(input.fecha); const auth=request.auth!;
    const created=await withTenantContext({tenantId:auth.tenantId,userId: auth.tenantUserCode, schema: auth.schema },async client=>{
      const box=await client.query('SELECT id FROM cajas WHERE tenant_id=$1 AND empresa_id=$2 AND id=$3 AND moneda=$4 AND activo=TRUE',[auth.tenantId,input.empresaId,input.cajaId,input.moneda]);
      if(!box.rowCount) throw new Error('La caja no existe, no pertenece a la empresa o usa otra moneda.');
      return (await client.query(`INSERT INTO movimientos_caja (tenant_id,empresa_id,caja_id,fecha,historico,tipo,moneda,valor_minor,cuenta_plan_id,centro_costo_id,documento,origen) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'MA') RETURNING id`,[auth.tenantId,input.empresaId,input.cajaId,input.fecha,input.historico,input.tipo,input.moneda,asMinorUnit(input.valorMinor),input.cuentaPlanId ?? null,input.centroCostoId ?? null,input.documento ?? null])).rows[0];
    },auth.pool); response.status(201).json(created);
  } catch(error){response.status(400).json({message:error instanceof z.ZodError?'Datos de movimiento inválidos.':(error as Error).message});}
});

router.post('/transferencias', authenticate, async (request,response)=>{
  try { const input=transferSchema.parse(request.body); assertBusinessDate(input.fecha); if(input.cajaOrigenId===input.cajaDestinoId) throw new Error('Las cajas de origen y destino deben ser distintas.'); const auth=request.auth!;
    const transfer=await withTenantContext({tenantId:auth.tenantId,userId: auth.tenantUserCode, schema: auth.schema },async client=>{
      const boxes=await client.query('SELECT id,moneda FROM cajas WHERE tenant_id=$1 AND empresa_id=$2 AND id=ANY($3::bigint[]) AND activo=TRUE',[auth.tenantId,input.empresaId,[input.cajaOrigenId,input.cajaDestinoId]]);
      if(boxes.rowCount!==2) throw new Error('Las dos cajas deben pertenecer a la empresa y estar activas.'); if(boxes.rows[0].moneda!==boxes.rows[1].moneda) throw new Error('Una transferencia requiere cajas de la misma moneda.');
      const id=randomUUID(); const params=[auth.tenantId,input.empresaId,input.fecha,input.historico,boxes.rows[0].moneda,asMinorUnit(input.valorMinor),id];
      const out=await client.query(`INSERT INTO movimientos_caja (tenant_id,empresa_id,caja_id,fecha,historico,tipo,moneda,valor_minor,origen,transferencia_id) VALUES ($1,$2,$3,$4,$5,'D',$6,$7,'TR',$8) RETURNING id`,[...params.slice(0,2),input.cajaOrigenId,...params.slice(2)]);
      const into=await client.query(`INSERT INTO movimientos_caja (tenant_id,empresa_id,caja_id,fecha,historico,tipo,moneda,valor_minor,origen,transferencia_id) VALUES ($1,$2,$3,$4,$5,'C',$6,$7,'TR',$8) RETURNING id`,[...params.slice(0,2),input.cajaDestinoId,...params.slice(2)]);
      return { transferenciaId:id, debitoId:out.rows[0].id, creditoId:into.rows[0].id };
    },auth.pool); response.status(201).json(transfer);
  } catch(error){response.status(400).json({message:error instanceof z.ZodError?'Datos de transferencia inválidos.':(error as Error).message});}
});

export default router;
