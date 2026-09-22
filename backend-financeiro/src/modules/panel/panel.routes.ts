import { Router } from 'express';
import { z } from 'zod';
import { withTenantContext } from '../../config/database.js';
import { authenticate } from '../../middleware/auth.js';

const router = Router();

const querySchema = z.object({ empresaId: z.coerce.number().int().positive() });

class EmpresaNoAccesibleError extends Error {}

const VENCIMIENTOS_SELECT = `
  SELECT moneda,
         COALESCE(SUM(saldo) FILTER (WHERE vence < CURRENT_DATE), 0)::TEXT AS vencido_minor,
         (COUNT(*) FILTER (WHERE vence < CURRENT_DATE))::INT AS vencido_cuotas,
         (MIN(vence) FILTER (WHERE vence < CURRENT_DATE))::TEXT AS vencido_desde,
         COALESCE(SUM(saldo) FILTER (WHERE vence BETWEEN CURRENT_DATE AND CURRENT_DATE + 7), 0)::TEXT AS dias7_minor,
         (COUNT(*) FILTER (WHERE vence BETWEEN CURRENT_DATE AND CURRENT_DATE + 7))::INT AS dias7_cuotas,
         COALESCE(SUM(saldo) FILTER (WHERE vence BETWEEN CURRENT_DATE AND CURRENT_DATE + 15), 0)::TEXT AS dias15_minor,
         (COUNT(*) FILTER (WHERE vence BETWEEN CURRENT_DATE AND CURRENT_DATE + 15))::INT AS dias15_cuotas,
         COALESCE(SUM(saldo) FILTER (WHERE vence BETWEEN CURRENT_DATE AND CURRENT_DATE + 30), 0)::TEXT AS dias30_minor,
         (COUNT(*) FILTER (WHERE vence BETWEEN CURRENT_DATE AND CURRENT_DATE + 30))::INT AS dias30_cuotas
  FROM pendientes
  GROUP BY moneda
  ORDER BY moneda`;

/**
 * Agregados do painel de uma empresa.
 *
 * Três regras que este endpoint respeita e das quais a tela depende:
 * 1. Saldo é sempre calculado (`saldo_inicial + Σ créditos − Σ débitos`), nunca lido
 *    de um campo denormalizado. Movimentos anteriores à data do saldo inicial ficam fora.
 * 2. Nada soma moedas diferentes. Todo agregado sai agrupado por `moneda`.
 * 3. `hoy` e `generadoEn` vêm do banco, não do navegador: o "vencido" da tela é o
 *    mesmo que o do servidor que fez a conta.
 *
 * Datas saem como texto ISO e dinheiro em unidades mínimas (PYG: guaraníes inteiros;
 * USD/BRL: centavos), também como texto — BigInt não sobrevive a JSON.
 */
router.get('/', authenticate, async (request, response) => {
  try {
    const { empresaId } = querySchema.parse(request.query);
    const auth = request.auth!;

    const panel = await withTenantContext(
      { tenantId: auth.tenantId, userId: auth.tenantUserCode, schema: auth.schema },
      async (client) => {
        const empresa = await client.query(
          `SELECT id, razon_social, nombre_fantasia, moneda_base
           FROM empresas
           WHERE tenant_id = $1 AND id = $2 AND activa = TRUE`,
          [auth.tenantId, empresaId],
        );
        if (!empresa.rowCount) throw new EmpresaNoAccesibleError('Empresa no encontrada o sin acceso.');

        const reloj = await client.query(
          `SELECT CURRENT_DATE::TEXT AS hoy,
                  NOW() AS generado_en,
                  date_trunc('month', CURRENT_DATE)::date::TEXT AS mes_desde,
                  (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date::TEXT AS mes_hasta`,
        );

        const cajas = await client.query(
          `SELECT c.id, c.nombre, c.tipo, c.moneda,
                  c.fecha_saldo_inicial::TEXT AS desde,
                  (c.saldo_inicial_minor
                    + COALESCE(SUM(m.valor_minor) FILTER (WHERE m.tipo = 'C'), 0)
                    - COALESCE(SUM(m.valor_minor) FILTER (WHERE m.tipo = 'D'), 0))::TEXT AS saldo_minor,
                  (COUNT(m.id))::INT AS movimientos
           FROM cajas c
           LEFT JOIN movimientos_caja m
             ON m.tenant_id = c.tenant_id AND m.caja_id = c.id AND m.fecha >= c.fecha_saldo_inicial
           WHERE c.tenant_id = $1 AND c.empresa_id = $2 AND c.activo = TRUE
           GROUP BY c.id, c.nombre, c.tipo, c.moneda, c.fecha_saldo_inicial, c.saldo_inicial_minor
           ORDER BY c.tipo, c.nombre`,
          [auth.tenantId, empresaId],
        );

        const porPagar = await client.query(
          `WITH pendientes AS (
             SELECT cta.moneda AS moneda,
                    cuo.fecha_vencimiento AS vence,
                    (cuo.valor_minor - COALESCE(b.aplicado_minor, 0)) AS saldo
             FROM cuotas_pagar cuo
             JOIN cuentas_pagar cta
               ON cta.tenant_id = cuo.tenant_id AND cta.id = cuo.cuenta_pagar_id
             LEFT JOIN LATERAL (
               SELECT SUM(CASE WHEN tipo = 'BAJA' THEN valor_pagado_minor + descuento_minor
                               ELSE -(valor_pagado_minor + descuento_minor) END) AS aplicado_minor
               FROM bajas_pagar WHERE tenant_id = cuo.tenant_id AND cuota_id = cuo.id
             ) b ON TRUE
             WHERE cuo.tenant_id = $1 AND cta.empresa_id = $2
               AND cuo.estado <> 'CANCELADO'
               AND (cuo.valor_minor - COALESCE(b.aplicado_minor, 0)) > 0
           )${VENCIMIENTOS_SELECT}`,
          [auth.tenantId, empresaId],
        );

        const porCobrar = await client.query(
          `WITH pendientes AS (
             SELECT cta.moneda AS moneda,
                    cuo.fecha_vencimiento AS vence,
                    (cuo.valor_minor - COALESCE(b.aplicado_minor, 0)) AS saldo
             FROM cuotas_cobrar cuo
             JOIN cuentas_cobrar cta
               ON cta.tenant_id = cuo.tenant_id AND cta.id = cuo.cuenta_cobrar_id
             LEFT JOIN LATERAL (
               SELECT SUM(CASE WHEN tipo = 'BAJA' THEN valor_cobrado_minor + descuento_minor
                               ELSE -(valor_cobrado_minor + descuento_minor) END) AS aplicado_minor
               FROM bajas_cobrar WHERE tenant_id = cuo.tenant_id AND cuota_id = cuo.id
             ) b ON TRUE
             WHERE cuo.tenant_id = $1 AND cta.empresa_id = $2
               AND cuo.estado <> 'CANCELADO'
               AND (cuo.valor_minor - COALESCE(b.aplicado_minor, 0)) > 0
           )${VENCIMIENTOS_SELECT}`,
          [auth.tenantId, empresaId],
        );

        const mes = await client.query(
          `SELECT moneda,
                  COALESCE(SUM(valor_minor) FILTER (WHERE tipo = 'C'), 0)::TEXT AS entradas_minor,
                  COALESCE(SUM(valor_minor) FILTER (WHERE tipo = 'D'), 0)::TEXT AS salidas_minor,
                  (COUNT(*))::INT AS movimientos,
                  (COUNT(*) FILTER (WHERE origen = 'MA'))::INT AS movimientos_manuales
           FROM movimientos_caja
           WHERE tenant_id = $1 AND empresa_id = $2
             AND fecha >= date_trunc('month', CURRENT_DATE)::date
             AND fecha < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
           GROUP BY moneda
           ORDER BY moneda`,
          [auth.tenantId, empresaId],
        );

        return {
          empresa: empresa.rows[0],
          reloj: reloj.rows[0],
          cajas: cajas.rows,
          porPagar: porPagar.rows,
          porCobrar: porCobrar.rows,
          mes: mes.rows,
        };
      },
      auth.pool,
    );

    const vencimientos = (rows: Array<Record<string, unknown>>) =>
      rows.map((row) => ({
        moneda: row.moneda,
        vencido: { montoMinor: row.vencido_minor, cuotas: row.vencido_cuotas, desde: row.vencido_desde },
        dias7: { montoMinor: row.dias7_minor, cuotas: row.dias7_cuotas },
        dias15: { montoMinor: row.dias15_minor, cuotas: row.dias15_cuotas },
        dias30: { montoMinor: row.dias30_minor, cuotas: row.dias30_cuotas },
      }));

    response.json({
      empresa: {
        id: panel.empresa.id,
        razonSocial: panel.empresa.razon_social,
        nombreFantasia: panel.empresa.nombre_fantasia,
        monedaBase: panel.empresa.moneda_base,
      },
      hoy: panel.reloj.hoy,
      generadoEn: panel.reloj.generado_en,
      cajas: panel.cajas.map((caja) => ({
        id: caja.id,
        nombre: caja.nombre,
        tipo: caja.tipo,
        moneda: caja.moneda,
        saldoMinor: caja.saldo_minor,
        movimientos: caja.movimientos,
        desde: caja.desde,
      })),
      porPagar: vencimientos(panel.porPagar),
      porCobrar: vencimientos(panel.porCobrar),
      mes: {
        desde: panel.reloj.mes_desde,
        hasta: panel.reloj.mes_hasta,
        porMoneda: panel.mes.map((row) => ({
          moneda: row.moneda,
          entradasMinor: row.entradas_minor,
          salidasMinor: row.salidas_minor,
          movimientos: row.movimientos,
          movimientosManuales: row.movimientos_manuales,
        })),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      response.status(400).json({ message: 'Indique la empresa del panel.' });
      return;
    }
    if (error instanceof EmpresaNoAccesibleError) {
      response.status(404).json({ message: error.message });
      return;
    }
    console.error('Erro ao montar o painel:', error);
    response.status(500).json({ message: 'No se pudo armar el panel.' });
  }
});

export default router;
