import { Router } from 'express';
import { z } from 'zod';
import { withTenantContext } from '../../config/database.js';
import { authenticate, requireTenantAdmin } from '../../middleware/auth.js';
import { assertAllBusinessDates } from '../../domain/validation.js';

const router = Router();
const companyQuery = z.object({ empresaId: z.coerce.number().int().positive() });
const periodQuery = z.object({ empresaId: z.coerce.number().int().positive(), desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export async function companyDashboard(client: Parameters<Parameters<typeof withTenantContext>[1]>[0], tenantId: number, empresaId: number) {
  const [cash, payables, receivables, month] = await Promise.all([
    client.query(`SELECT c.moneda,
      (c.saldo_inicial_minor + COALESCE(SUM(CASE WHEN m.tipo='C' THEN m.valor_minor ELSE -m.valor_minor END),0))::TEXT AS saldo_minor
      FROM cajas c LEFT JOIN movimientos_caja m ON m.tenant_id=c.tenant_id AND m.caja_id=c.id AND m.fecha >= c.fecha_saldo_inicial
      WHERE c.tenant_id=$1 AND c.empresa_id=$2 AND c.activo=TRUE GROUP BY c.id,c.moneda ORDER BY c.moneda`, [tenantId,empresaId]),
    client.query(`SELECT cp.moneda,
      COALESCE(SUM(q.valor_minor-COALESCE(b.aplicado_minor,0)) FILTER (WHERE q.fecha_vencimiento>=CURRENT_DATE AND q.fecha_vencimiento<CURRENT_DATE+7),0)::TEXT AS proximos_7_minor,
      COALESCE(SUM(q.valor_minor-COALESCE(b.aplicado_minor,0)) FILTER (WHERE q.fecha_vencimiento>=CURRENT_DATE AND q.fecha_vencimiento<CURRENT_DATE+15),0)::TEXT AS proximos_15_minor,
      COALESCE(SUM(q.valor_minor-COALESCE(b.aplicado_minor,0)) FILTER (WHERE q.fecha_vencimiento>=CURRENT_DATE AND q.fecha_vencimiento<CURRENT_DATE+30),0)::TEXT AS proximos_30_minor,
      COALESCE(SUM(q.valor_minor-COALESCE(b.aplicado_minor,0)) FILTER (WHERE q.fecha_vencimiento<CURRENT_DATE),0)::TEXT AS vencidos_minor
      FROM cuentas_pagar cp JOIN cuotas_pagar q ON q.tenant_id=cp.tenant_id AND q.cuenta_pagar_id=cp.id
      LEFT JOIN LATERAL (SELECT SUM(CASE WHEN tipo='BAJA' THEN valor_pagado_minor+descuento_minor ELSE -(valor_pagado_minor+descuento_minor) END) AS aplicado_minor FROM bajas_pagar WHERE tenant_id=q.tenant_id AND cuota_id=q.id) b ON TRUE
      WHERE cp.tenant_id=$1 AND cp.empresa_id=$2 AND q.estado <> 'CANCELADO' AND (q.valor_minor-COALESCE(b.aplicado_minor,0)) > 0 GROUP BY cp.moneda ORDER BY cp.moneda`, [tenantId,empresaId]),
    client.query(`SELECT cc.moneda,
      COALESCE(SUM(q.valor_minor-COALESCE(b.aplicado_minor,0)) FILTER (WHERE q.fecha_vencimiento>=CURRENT_DATE AND q.fecha_vencimiento<CURRENT_DATE+7),0)::TEXT AS proximos_7_minor,
      COALESCE(SUM(q.valor_minor-COALESCE(b.aplicado_minor,0)) FILTER (WHERE q.fecha_vencimiento>=CURRENT_DATE AND q.fecha_vencimiento<CURRENT_DATE+15),0)::TEXT AS proximos_15_minor,
      COALESCE(SUM(q.valor_minor-COALESCE(b.aplicado_minor,0)) FILTER (WHERE q.fecha_vencimiento>=CURRENT_DATE AND q.fecha_vencimiento<CURRENT_DATE+30),0)::TEXT AS proximos_30_minor,
      COALESCE(SUM(q.valor_minor-COALESCE(b.aplicado_minor,0)) FILTER (WHERE q.fecha_vencimiento<CURRENT_DATE),0)::TEXT AS vencidos_minor
      FROM cuentas_cobrar cc JOIN cuotas_cobrar q ON q.tenant_id=cc.tenant_id AND q.cuenta_cobrar_id=cc.id
      LEFT JOIN LATERAL (SELECT SUM(CASE WHEN tipo='BAJA' THEN valor_cobrado_minor+descuento_minor ELSE -(valor_cobrado_minor+descuento_minor) END) AS aplicado_minor FROM bajas_cobrar WHERE tenant_id=q.tenant_id AND cuota_id=q.id) b ON TRUE
      WHERE cc.tenant_id=$1 AND cc.empresa_id=$2 AND q.estado <> 'CANCELADO' AND (q.valor_minor-COALESCE(b.aplicado_minor,0)) > 0 GROUP BY cc.moneda ORDER BY cc.moneda`, [tenantId,empresaId]),
    client.query(`SELECT moneda, COALESCE(SUM(valor_minor) FILTER(WHERE tipo='C'),0)::TEXT AS entradas_minor, COALESCE(SUM(valor_minor) FILTER(WHERE tipo='D'),0)::TEXT AS salidas_minor
      FROM movimientos_caja WHERE tenant_id=$1 AND empresa_id=$2 AND date_trunc('month',fecha)=date_trunc('month',CURRENT_DATE) GROUP BY moneda ORDER BY moneda`, [tenantId,empresaId]),
  ]);
  return { saldosCaja: cash.rows, cuentasPagar: payables.rows, cuentasCobrar: receivables.rows, movimientosMes: month.rows };
}

router.get('/dashboard', authenticate, async (request,response) => {
  try { const { empresaId }=companyQuery.parse(request.query); const auth=request.auth!; const data=await withTenantContext({tenantId:auth.tenantId,userId: auth.tenantUserCode, schema: auth.schema },client=>companyDashboard(client,auth.tenantId,empresaId),auth.pool); const noData=!data.saldosCaja.length&&!data.cuentasPagar.length&&!data.cuentasCobrar.length&&!data.movimientosMes.length; response.json({...data,emptyReason:noData?'No hay movimientos ni cuentas registradas para esta empresa.':null}); }
  catch(error){response.status(400).json({message:error instanceof z.ZodError?'Empresa inválida.':(error as Error).message});}
});

router.get('/flujo-caja', authenticate, async (request,response) => {
  try { const {empresaId,desde,hasta}=periodQuery.parse(request.query); assertAllBusinessDates(desde,hasta); if(hasta<desde)throw new Error('La fecha final debe ser igual o posterior a la inicial.'); const auth=request.auth!;
    const data=await withTenantContext({tenantId:auth.tenantId,userId: auth.tenantUserCode, schema: auth.schema },async client=>{
      const result=await client.query(`WITH eventos AS (
        SELECT cp.moneda,q.fecha_vencimiento AS fecha,'PAGAR' AS tipo,SUM(q.valor_minor-COALESCE(b.aplicado_minor,0)) AS valor_minor
        FROM cuentas_pagar cp JOIN cuotas_pagar q ON q.tenant_id=cp.tenant_id AND q.cuenta_pagar_id=cp.id LEFT JOIN LATERAL (SELECT SUM(CASE WHEN tipo='BAJA' THEN valor_pagado_minor+descuento_minor ELSE -(valor_pagado_minor+descuento_minor) END) AS aplicado_minor FROM bajas_pagar WHERE tenant_id=q.tenant_id AND cuota_id=q.id)b ON TRUE
        WHERE cp.tenant_id=$1 AND cp.empresa_id=$2 AND q.fecha_vencimiento BETWEEN $3 AND $4 GROUP BY cp.moneda,q.fecha_vencimiento
        UNION ALL
        SELECT cc.moneda,q.fecha_vencimiento,'COBRAR',SUM(q.valor_minor-COALESCE(b.aplicado_minor,0)) FROM cuentas_cobrar cc JOIN cuotas_cobrar q ON q.tenant_id=cc.tenant_id AND q.cuenta_cobrar_id=cc.id LEFT JOIN LATERAL (SELECT SUM(CASE WHEN tipo='BAJA' THEN valor_cobrado_minor+descuento_minor ELSE -(valor_cobrado_minor+descuento_minor) END) AS aplicado_minor FROM bajas_cobrar WHERE tenant_id=q.tenant_id AND cuota_id=q.id)b ON TRUE
        WHERE cc.tenant_id=$1 AND cc.empresa_id=$2 AND q.fecha_vencimiento BETWEEN $3 AND $4 GROUP BY cc.moneda,q.fecha_vencimiento)
        SELECT fecha,moneda,COALESCE(SUM(valor_minor) FILTER(WHERE tipo='COBRAR'),0) AS cobrar_minor,COALESCE(SUM(valor_minor) FILTER(WHERE tipo='PAGAR'),0) AS pagar_minor FROM eventos GROUP BY fecha,moneda ORDER BY fecha,moneda`,[auth.tenantId,empresaId,desde,hasta]);return result.rows;
    },auth.pool);response.json({data,emptyReason:data.length?'': 'No hay vencimientos en el período seleccionado.'});
  }catch(error){response.status(400).json({message:error instanceof z.ZodError?'Parámetros inválidos.':(error as Error).message});}
});

router.get('/resultados', authenticate, async (request, response) => {
  try {
    const { empresaId, desde, hasta } = periodQuery.parse(request.query); assertAllBusinessDates(desde, hasta);
    if (hasta < desde) throw new Error('La fecha final debe ser igual o posterior a la inicial.'); const auth = request.auth!;
    const data = await withTenantContext({ tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema }, async (client) => (
      await client.query(`SELECT cp.codigo,cp.descripcion,cp.naturaleza,origen.moneda,SUM(origen.valor_minor)::TEXT AS valor_minor,COUNT(*)::INT AS documentos
        FROM (
          SELECT cuenta_plan_id,moneda,valor_total_minor AS valor_minor FROM cuentas_pagar WHERE tenant_id=$1 AND empresa_id=$2 AND fecha_emision BETWEEN $3 AND $4 AND estado<>'CANCELADO'
          UNION ALL
          SELECT cuenta_plan_id,moneda,valor_total_minor FROM cuentas_cobrar WHERE tenant_id=$1 AND empresa_id=$2 AND fecha_emision BETWEEN $3 AND $4 AND estado<>'CANCELADO'
        ) origen JOIN cuentas_plan cp ON cp.tenant_id=$1 AND cp.id=origen.cuenta_plan_id
        GROUP BY cp.codigo,cp.descripcion,cp.naturaleza,origen.moneda ORDER BY origen.moneda,cp.codigo`, [auth.tenantId, empresaId, desde, hasta])
    ).rows, auth.pool);
    response.json({ data, emptyReason: data.length ? '' : 'No hay cuentas clasificadas en el período seleccionado.' });
  } catch (error) { response.status(400).json({ message: error instanceof z.ZodError ? 'Parámetros inválidos.' : (error as Error).message }); }
});

router.get('/consolidado', authenticate, requireTenantAdmin, async (request,response)=>{
  try {const auth=request.auth!;const data=await withTenantContext({tenantId:auth.tenantId,userId: auth.tenantUserCode, schema: auth.schema },async client=>{
    const companies=await client.query('SELECT id,razon_social,nombre_fantasia,moneda_base FROM empresas WHERE tenant_id=$1 AND activa=TRUE ORDER BY razon_social',[auth.tenantId]);
    return Promise.all(companies.rows.map(async company=>({empresa:company,...await companyDashboard(client,auth.tenantId,Number(company.id))})));},auth.pool);response.json({data,emptyReason:data.length?'':'No hay empresas activas en el grupo.'});
  }catch{response.status(400).json({message:'No fue posible generar el panel consolidado.'});}
});

export default router;
