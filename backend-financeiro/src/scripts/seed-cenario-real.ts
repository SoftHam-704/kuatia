import 'dotenv/config';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { withTenantContext } from '../config/database.js';

dotenv.config({ path: resolve(process.cwd(), '..', '.env') });

async function main() {
  const context = {
    tenantId: 120,
    userId: 1,
    schema: 'pinheirao',
  };

  console.log('🌱 Iniciando semeadura do Cenário de Testes Real (Paraguai)...');

  await withTenantContext(context, async (client) => {
    // 1. Obter Empresas
    const empresasRes = await client.query('SELECT id, razon_social, moneda_base FROM empresas ORDER BY id');
    console.log(`🏢 Empresas encontradas (${empresasRes.rowCount}):`, empresasRes.rows.map((e) => `${e.id}: ${e.razon_social} (${e.moneda_base})`).join(', '));
    if (empresasRes.rowCount === 0) {
      throw new Error('Nenhuma empresa encontrada no tenant 120.');
    }
    const empresa1 = empresasRes.rows[0];
    const empresa2 = empresasRes.rows[1] ?? empresa1;

    // 2. Centros de Custo
    const existingCenters = await client.query('SELECT id, codigo, descripcion FROM centros_costo WHERE empresa_id = $1', [empresa1.id]);
    let adminCenterId = existingCenters.rows.find((c) => c.codigo === '01')?.id;
    let opCenterId = existingCenters.rows.find((c) => c.codigo === '02')?.id;
    let comCenterId = existingCenters.rows.find((c) => c.codigo === '03')?.id;

    if (!adminCenterId) {
      const c1 = await client.query(
        `INSERT INTO centros_costo (tenant_id, empresa_id, codigo, descripcion)
         VALUES ($1, $2, '01', 'Administración y Finanzas') RETURNING id`,
        [context.tenantId, empresa1.id],
      );
      adminCenterId = c1.rows[0].id;
    }
    if (!opCenterId) {
      const c2 = await client.query(
        `INSERT INTO centros_costo (tenant_id, empresa_id, codigo, descripcion)
         VALUES ($1, $2, '02', 'Operaciones y Logística') RETURNING id`,
        [context.tenantId, empresa1.id],
      );
      opCenterId = c2.rows[0].id;
    }
    if (!comCenterId) {
      const c3 = await client.query(
        `INSERT INTO centros_costo (tenant_id, empresa_id, codigo, descripcion)
         VALUES ($1, $2, '03', 'Comercial y Exportación') RETURNING id`,
        [context.tenantId, empresa1.id],
      );
      comCenterId = c3.rows[0].id;
    }
    console.log('📌 Centros de custo configurados:', { adminCenterId, opCenterId, comCenterId });

    // 3. Identificar Cuentas del Plan
    const planAccounts = await client.query('SELECT id, codigo, descripcion, naturaleza FROM cuentas_plan WHERE nivel = 3');
    console.log(`📚 Contas analíticas do plano (${planAccounts.rowCount} encontradas).`);
    const ingVentas = planAccounts.rows.find((p) => p.naturaleza === 'R')?.id ?? null;
    const egCombustible = planAccounts.rows.find((p) => p.naturaleza === 'D' && p.descripcion.toLowerCase().includes('combust'))?.id
      ?? planAccounts.rows.find((p) => p.naturaleza === 'D')?.id ?? null;
    const egServicios = planAccounts.rows.find((p) => p.naturaleza === 'D' && (p.descripcion.toLowerCase().includes('servic') || p.descripcion.toLowerCase().includes('energ') || p.descripcion.toLowerCase().includes('luz')))?.[0]?.id
      ?? planAccounts.rows.filter((p) => p.naturaleza === 'D')[1]?.id
      ?? egCombustible;

    // 4. Cajas y Bancos
    const existingCajas = await client.query('SELECT id, nombre, moneda, tipo FROM cajas WHERE empresa_id = $1', [empresa1.id]);
    let cajaPygId = existingCajas.rows.find((c) => c.moneda === 'PYG')?.id;
    let bancoUsdId = existingCajas.rows.find((c) => c.moneda === 'USD')?.id;
    let bancoBrlId = existingCajas.rows.find((c) => c.moneda === 'BRL')?.id;

    if (!cajaPygId) {
      const res = await client.query(
        `INSERT INTO cajas (tenant_id, empresa_id, nombre, tipo, moneda, saldo_inicial_minor, fecha_saldo_inicial)
         VALUES ($1, $2, 'Caja Central Asunción', 'caja', 'PYG', 15000000, '2026-01-01') RETURNING id`,
        [context.tenantId, empresa1.id],
      );
      cajaPygId = res.rows[0].id;
    }
    if (!bancoUsdId) {
      const res = await client.query(
        `INSERT INTO cajas (tenant_id, empresa_id, nombre, tipo, moneda, saldo_inicial_minor, fecha_saldo_inicial)
         VALUES ($1, $2, 'Banco Continental USD', 'banco', 'USD', 4500000, '2026-01-01') RETURNING id`,
        [context.tenantId, empresa1.id],
      );
      bancoUsdId = res.rows[0].id;
    }
    if (!bancoBrlId) {
      const res = await client.query(
        `INSERT INTO cajas (tenant_id, empresa_id, nombre, tipo, moneda, saldo_inicial_minor, fecha_saldo_inicial)
         VALUES ($1, $2, 'Banco Itaú BRL', 'banco', 'BRL', 1250000, '2026-01-01') RETURNING id`,
        [context.tenantId, empresa1.id],
      );
      bancoBrlId = res.rows[0].id;
    }
    console.log('🏦 Caixas/Bancos prontos:', { cajaPygId, bancoUsdId, bancoBrlId });

    // 5. Contrapartes Reais do Paraguai
    const contrapartesData = [
      { ruc: '80012345-6', tipo: 'J', razon: 'Agroquímica del Este S.A.', fantasia: 'Agroquímica del Este', ciudad: 'Ciudad del Este', depto: 'Alto Paraná', obs: 'Insumos agrícolas y fertilizantes' },
      { ruc: '80023456-7', tipo: 'J', razon: 'Combustibles Chaco S.R.L.', fantasia: 'Chaco Combustibles', ciudad: 'Filadelfia', depto: 'Boquerón', obs: 'Diesel y lubricantes para flota' },
      { ruc: '80000001-1', tipo: 'J', razon: 'Administración Nacional de Electricidad (ANDE)', fantasia: 'ANDE', ciudad: 'Asunción', depto: 'Central', obs: 'Energía eléctrica' },
      { ruc: '80001234-5', tipo: 'J', razon: 'Telecel S.A. (Tigo Paraguay)', fantasia: 'Tigo', ciudad: 'Asunción', depto: 'Central', obs: 'Internet y telefonía celular corporativa' },
      { ruc: '80034567-8', tipo: 'J', razon: 'Cargill Agropecuaria SACI', fantasia: 'Cargill Paraguay', ciudad: 'Hernandarias', depto: 'Alto Paraná', obs: 'Comprador principal de granos exportación' },
      { ruc: '80045678-9', tipo: 'J', razon: 'Bunge Paraguay S.A.', fantasia: 'Bunge', ciudad: 'Villeta', depto: 'Central', obs: 'Trading agrícola y logística fluvial' },
      { ruc: '80056789-0', tipo: 'J', razon: 'Cooperativa Colonias Unidas', fantasia: 'Colonias Unidas', ciudad: 'Obligado', depto: 'Itapúa', obs: 'Venta de semillas y granos' },
      { ruc: '80067890-1', tipo: 'J', razon: 'Trans Chaco Logística S.A.', fantasia: 'Trans Chaco', ciudad: 'Mariano Roque Alonso', depto: 'Central', obs: 'Fletes terrestres e internacionales' },
      { ruc: '1234567-8', tipo: 'F', razon: 'Juan Carlos Benítez', fantasia: 'Taller Mecánico Benítez', ciudad: 'Santa Rita', depto: 'Alto Paraná', obs: 'Mantenimiento preventivo de cosechadoras y camiones' },
      { ruc: '2345678-9', tipo: 'F', razon: 'María Elena Galeano', fantasia: 'Estudio Galeano & Asoc.', ciudad: 'Asunción', depto: 'Central', obs: 'Asesoría fiscal y auditoría tributaria' },
    ];

    const cpMap = new Map<string, number>();
    for (const cp of contrapartesData) {
      const existing = await client.query('SELECT id FROM contrapartes WHERE ruc = $1', [cp.ruc]);
      if (existing.rowCount && existing.rows[0]) {
        cpMap.set(cp.ruc, existing.rows[0].id);
      } else {
        const ins = await client.query(
          `INSERT INTO contrapartes (tenant_id, tipo_persona, ruc, razon_social, nombre_fantasia, ciudad, departamento, observaciones)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [context.tenantId, cp.tipo, cp.ruc, cp.razon, cp.fantasia, cp.ciudad, cp.depto, cp.obs],
        );
        cpMap.set(cp.ruc, ins.rows[0].id);
      }
    }
    console.log(`🤝 Contrapartes cadastradas/verificadas: ${cpMap.size}`);

    // Limpar contas operacionais antigas do cenário para garantir repetibilidade limpa
    // (Apenas se já existirem)
    const existingCuentas = await client.query('SELECT count(*)::int n FROM cuentas_pagar WHERE tenant_id = $1', [context.tenantId]);
    if (existingCuentas.rows[0].n > 0) {
      console.log(`ℹ️ Tenant já possui ${existingCuentas.rows[0].n} contas a pagar. Mantendo ou adicionando dados.`);
    }

    // 6. Cuentas por Pagar (PYG, USD, BRL)
    const payablesData = [
      {
        desc: 'Combustibles Chaco - Lote Diesel Flota Norte',
        doc: 'FAC-001-002-0045210',
        moneda: 'PYG',
        totalMinor: '18500000', // 18.500.000 PYG
        emision: '2026-08-10',
        vencimiento: '2026-09-10', // Vencida
        ruc: '80023456-7',
        planId: egCombustible,
        centerId: opCenterId,
        cuotas: [
          { num: 1, valor: '9250000', vence: '2026-09-10', paga: true, cajaId: cajaPygId, fechaPago: '2026-09-12' },
          { num: 2, valor: '9250000', vence: '2026-10-10', paga: false },
        ],
      },
      {
        desc: 'Suministro Energía ANDE - Silos y Secador Hernandarias',
        doc: 'ANDE-2026-09-8812',
        moneda: 'PYG',
        totalMinor: '4850000', // 4.850.000 PYG
        emision: '2026-09-05',
        vencimiento: '2026-09-25', // Vence em 3 dias
        ruc: '80000001-1',
        planId: egServicios,
        centerId: opCenterId,
        cuotas: [
          { num: 1, valor: '4850000', vence: '2026-09-25', paga: false },
        ],
      },
      {
        desc: 'Importación Fertilizantes Fosfatados 200T',
        doc: 'IMP-2026-0771',
        moneda: 'USD',
        totalMinor: '1500000', // 15.000,00 USD
        emision: '2026-08-15',
        vencimiento: '2026-09-15', // Vencida
        ruc: '80012345-6',
        planId: egCombustible,
        centerId: opCenterId,
        cuotas: [
          { num: 1, valor: '500000', vence: '2026-09-15', pagaParcial: '300000', cajaId: bancoUsdId, fechaPago: '2026-09-16' },
          { num: 2, valor: '500000', vence: '2026-10-15', paga: false },
          { num: 3, valor: '500000', vence: '2026-11-15', paga: false },
        ],
      },
      {
        desc: 'Mantenimiento Preventivo Cosechadoras John Deere',
        doc: 'TC-2026-0044',
        moneda: 'USD',
        totalMinor: '280000', // 2.800,00 USD
        emision: '2026-09-18',
        vencimiento: '2026-10-02', // Vence em 10 dias
        ruc: '1234567-8',
        planId: egServicios,
        centerId: opCenterId,
        cuotas: [
          { num: 1, valor: '280000', vence: '2026-10-02', paga: false },
        ],
      },
      {
        desc: 'Repuestos de Rodamiento Importados Foz do Iguaçu',
        doc: 'NF-BR-991204',
        moneda: 'BRL',
        totalMinor: '640000', // 6.400,00 BRL
        emision: '2026-09-01',
        vencimiento: '2026-09-20', // Vencida há 2 dias
        ruc: '80067890-1',
        planId: egCombustible,
        centerId: opCenterId,
        cuotas: [
          { num: 1, valor: '320000', vence: '2026-09-20', paga: false },
          { num: 2, valor: '320000', vence: '2026-10-20', paga: false },
        ],
      },
      {
        desc: 'Honorarios Asesoría Fiscal y Auditoría DNIT',
        doc: 'REC-EG-2026-09',
        moneda: 'PYG',
        totalMinor: '3500000', // 3.500.000 PYG
        emision: '2026-09-20',
        vencimiento: '2026-10-05', // Vence em 13 dias
        ruc: '2345678-9',
        planId: egServicios,
        centerId: adminCenterId,
        cuotas: [
          { num: 1, valor: '3500000', vence: '2026-10-05', paga: false },
        ],
      },
    ];

    for (const p of payablesData) {
      const cpId = cpMap.get(p.ruc) ?? null;
      const ctaRes = await client.query(
        `INSERT INTO cuentas_pagar (tenant_id, empresa_id, descripcion, numero_documento, moneda, valor_total_minor, fecha_emision, fecha_vencimiento, cuenta_plan_id, centro_costo_id, contraparte_id, creado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [context.tenantId, empresa1.id, p.desc, p.doc, p.moneda, p.totalMinor, p.emision, p.vencimiento, p.planId, p.centerId, cpId, context.userId],
      );
      const cuentaId = ctaRes.rows[0].id;

      for (const cuota of p.cuotas) {
        const cuoRes = await client.query(
          `INSERT INTO cuotas_pagar (tenant_id, empresa_id, cuenta_pagar_id, numero_cuota, valor_minor, fecha_vencimiento)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [context.tenantId, empresa1.id, cuentaId, cuota.num, cuota.valor, cuota.vence],
        );
        const cuotaId = cuoRes.rows[0].id;

        if (cuota.paga && cuota.cajaId) {
          // Baixa integral
          const mov = await client.query(
            `INSERT INTO movimientos_caja (tenant_id, empresa_id, caja_id, fecha, historico, tipo, moneda, valor_minor, origen, cuota_origen_id)
             VALUES ($1, $2, $3, $4, $5, 'D', $6, $7, 'CP', $8) RETURNING id`,
            [context.tenantId, empresa1.id, cuota.cajaId, cuota.fechaPago, `Pago: ${cuotaId}`, p.moneda, cuota.valor, cuotaId],
          );
          await client.query(
            `INSERT INTO bajas_pagar (tenant_id, empresa_id, cuota_id, tipo, fecha, valor_pagado_minor, caja_id, movimiento_caja_id, creado_por)
             VALUES ($1, $2, $3, 'BAJA', $4, $5, $6, $7, $8)`,
            [context.tenantId, empresa1.id, cuotaId, cuota.fechaPago, cuota.valor, cuota.cajaId, mov.rows[0].id, context.userId],
          );
        } else if (cuota.pagaParcial && cuota.cajaId) {
          // Baixa parcial
          const mov = await client.query(
            `INSERT INTO movimientos_caja (tenant_id, empresa_id, caja_id, fecha, historico, tipo, moneda, valor_minor, origen, cuota_origen_id)
             VALUES ($1, $2, $3, $4, $5, 'D', $6, $7, 'CP', $8) RETURNING id`,
            [context.tenantId, empresa1.id, cuota.cajaId, cuota.fechaPago, `Pago parcial: ${cuotaId}`, p.moneda, cuota.pagaParcial, cuotaId],
          );
          await client.query(
            `INSERT INTO bajas_pagar (tenant_id, empresa_id, cuota_id, tipo, fecha, valor_pagado_minor, caja_id, movimiento_caja_id, creado_por)
             VALUES ($1, $2, $3, 'BAJA', $4, $5, $6, $7, $8)`,
            [context.tenantId, empresa1.id, cuotaId, cuota.fechaPago, cuota.pagaParcial, cuota.cajaId, mov.rows[0].id, context.userId],
          );
        }
      }
    }
    console.log('✅ Cuentas por pagar inseridas com sucesso.');

    // 7. Cuentas por Cobrar (USD, PYG, BRL)
    const receivablesData = [
      {
        desc: 'Exportación Soja Zafra 2026 - Lote EXP-088',
        doc: 'FAC-EXP-088',
        moneda: 'USD',
        totalMinor: '6800000', // 68.000,00 USD
        emision: '2026-08-20',
        vencimiento: '2026-09-20',
        ruc: '80034567-8',
        planId: ingVentas,
        centerId: comCenterId,
        cuotas: [
          { num: 1, valor: '3400000', vence: '2026-09-20', cobrada: true, cajaId: bancoUsdId, fechaCobro: '2026-09-21' },
          { num: 2, valor: '3400000', vence: '2026-10-20', cobrada: false },
        ],
      },
      {
        desc: 'Venta Maíz Grano a Granel - Contrato C-402',
        doc: 'FAC-EXP-092',
        moneda: 'USD',
        totalMinor: '4250000', // 42.500,00 USD
        emision: '2026-09-10',
        vencimiento: '2026-09-28', // Vence em 6 dias
        ruc: '80045678-9',
        planId: ingVentas,
        centerId: comCenterId,
        cuotas: [
          { num: 1, valor: '4250000', vence: '2026-09-28', cobrada: false },
        ],
      },
      {
        desc: 'Venta Semillas Certificadas Soja Zafriña',
        doc: 'FAC-INT-00128',
        moneda: 'PYG',
        totalMinor: '32000000', // 32.000.000 PYG
        emision: '2026-09-01',
        vencimiento: '2026-09-26', // Vence em 4 dias
        ruc: '80056789-0',
        planId: ingVentas,
        centerId: comCenterId,
        cuotas: [
          { num: 1, valor: '16000000', vence: '2026-09-26', cobrada: false },
          { num: 2, valor: '16000000', vence: '2026-10-26', cobrada: false },
        ],
      },
      {
        desc: 'Servicio de Flete Terrestre Internacional Carga Granos',
        doc: 'CRT-004921',
        moneda: 'BRL',
        totalMinor: '1800000', // 18.000,00 BRL
        emision: '2026-08-25',
        vencimiento: '2026-09-15', // Vencida há 7 dias
        ruc: '80067890-1',
        planId: ingVentas,
        centerId: opCenterId,
        cuotas: [
          { num: 1, valor: '1800000', vence: '2026-09-15', cobroParcial: '1000000', cajaId: bancoBrlId, fechaCobro: '2026-09-18' },
        ],
      },
    ];

    for (const r of receivablesData) {
      const cpId = cpMap.get(r.ruc) ?? null;
      const ctaRes = await client.query(
        `INSERT INTO cuentas_cobrar (tenant_id, empresa_id, descripcion, numero_documento, moneda, valor_total_minor, fecha_emision, fecha_vencimiento, cuenta_plan_id, centro_costo_id, contraparte_id, creado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [context.tenantId, empresa1.id, r.desc, r.doc, r.moneda, r.totalMinor, r.emision, r.vencimiento, r.planId, r.centerId, cpId, context.userId],
      );
      const cuentaId = ctaRes.rows[0].id;

      for (const cuota of r.cuotas) {
        const cuoRes = await client.query(
          `INSERT INTO cuotas_cobrar (tenant_id, empresa_id, cuenta_cobrar_id, numero_cuota, valor_minor, fecha_vencimiento)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [context.tenantId, empresa1.id, cuentaId, cuota.num, cuota.valor, cuota.vence],
        );
        const cuotaId = cuoRes.rows[0].id;

        if (cuota.cobrada && cuota.cajaId) {
          // Cobro integral
          const mov = await client.query(
            `INSERT INTO movimientos_caja (tenant_id, empresa_id, caja_id, fecha, historico, tipo, moneda, valor_minor, origen, cuota_origen_id)
             VALUES ($1, $2, $3, $4, $5, 'C', $6, $7, 'CC', $8) RETURNING id`,
            [context.tenantId, empresa1.id, cuota.cajaId, cuota.fechaCobro, `Cobro: ${cuotaId}`, r.moneda, cuota.valor, cuotaId],
          );
          await client.query(
            `INSERT INTO bajas_cobrar (tenant_id, empresa_id, cuota_id, tipo, fecha, valor_cobrado_minor, caja_id, movimiento_caja_id, creado_por)
             VALUES ($1, $2, $3, 'BAJA', $4, $5, $6, $7, $8)`,
            [context.tenantId, empresa1.id, cuotaId, cuota.fechaCobro, cuota.valor, cuota.cajaId, mov.rows[0].id, context.userId],
          );
        } else if (cuota.cobroParcial && cuota.cajaId) {
          // Cobro parcial
          const mov = await client.query(
            `INSERT INTO movimientos_caja (tenant_id, empresa_id, caja_id, fecha, historico, tipo, moneda, valor_minor, origen, cuota_origen_id)
             VALUES ($1, $2, $3, $4, $5, 'C', $6, $7, 'CC', $8) RETURNING id`,
            [context.tenantId, empresa1.id, cuota.cajaId, cuota.fechaCobro, `Cobro parcial: ${cuotaId}`, r.moneda, cuota.cobroParcial, cuotaId],
          );
          await client.query(
            `INSERT INTO bajas_cobrar (tenant_id, empresa_id, cuota_id, tipo, fecha, valor_cobrado_minor, caja_id, movimiento_caja_id, creado_por)
             VALUES ($1, $2, $3, 'BAJA', $4, $5, $6, $7, $8)`,
            [context.tenantId, empresa1.id, cuotaId, cuota.fechaCobro, cuota.cobroParcial, cuota.cajaId, mov.rows[0].id, context.userId],
          );
        }
      }
    }
    console.log('✅ Cuentas por cobrar inseridas com sucesso.');

    // 8. Movimentos manuais de caixa (origen = 'MA')
    if (cajaPygId) {
      await client.query(
        `INSERT INTO movimientos_caja (tenant_id, empresa_id, caja_id, fecha, historico, tipo, moneda, valor_minor, cuenta_plan_id, centro_costo_id, origen)
         VALUES ($1, $2, $3, '2026-09-21', 'Gastos menores de útiles de oficina y cafetería', 'D', 'PYG', 350000, $4, $5, 'MA')`,
        [context.tenantId, empresa1.id, cajaPygId, egServicios, adminCenterId],
      );
      await client.query(
        `INSERT INTO movimientos_caja (tenant_id, empresa_id, caja_id, fecha, historico, tipo, moneda, valor_minor, cuenta_plan_id, centro_costo_id, origen)
         VALUES ($1, $2, $3, '2026-09-22', 'Venta al contado de pallets y bolsas usadas', 'C', 'PYG', 600000, $4, $5, 'MA')`,
        [context.tenantId, empresa1.id, cajaPygId, ingVentas, opCenterId],
      );
      console.log('✅ Movimentos manuais de caixa inseridos.');
    }
  });

  console.log('🎉 Semeadura do Cenário de Testes Real concluída com sucesso!');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Erro na semeadura:', err);
  process.exit(1);
});
