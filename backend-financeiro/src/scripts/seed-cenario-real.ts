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

  console.log('🌱 Iniciando semeadura COMPLETA de dados de teste mock em TODAS as tabelas (Tenant 120)...');

  await withTenantContext(context, async (client) => {
    // 1. Obter Empresas do Tenant
    const empresasRes = await client.query('SELECT id, razon_social, nombre_fantasia, moneda_base FROM empresas ORDER BY id');
    console.log(`🏢 Empresas encontradas (${empresasRes.rowCount}):`, empresasRes.rows.map((e) => `${e.id}: ${e.nombre_fantasia || e.razon_social} (${e.moneda_base})`).join(' | '));
    if (empresasRes.rowCount === 0) {
      throw new Error('Nenhuma empresa encontrada no tenant 120.');
    }

    // 2. Contrapartes Reais do Paraguai (compartilhadas pelo tenant)
    const contrapartesData = [
      { ruc: '80012345-6', tipo: 'J', razon: 'Agroquímica del Este S.A.', fantasia: 'Agroquímica del Este', ciudad: 'Ciudad del Este', depto: 'Alto Paraná', obs: 'Insumos agrícolas y fertilizantes' },
      { ruc: '80023456-7', tipo: 'J', razon: 'Combustibles Chaco S.R.L.', fantasia: 'Chaco Combustibles', ciudad: 'Filadelfia', depto: 'Boquerón', obs: 'Diesel y lubricantes para flota pesada' },
      { ruc: '80000001-1', tipo: 'J', razon: 'Administración Nacional de Electricidad (ANDE)', fantasia: 'ANDE', ciudad: 'Asunción', depto: 'Central', obs: 'Energía eléctrica oficinas y bases' },
      { ruc: '80001234-5', tipo: 'J', razon: 'Telecel S.A. (Tigo Paraguay)', fantasia: 'Tigo', ciudad: 'Asunción', depto: 'Central', obs: 'Internet fibra óptica y telefonía corporativa' },
      { ruc: '80034567-8', tipo: 'J', razon: 'Cargill Agropecuaria SACI', fantasia: 'Cargill Paraguay', ciudad: 'Hernandarias', depto: 'Alto Paraná', obs: 'Comprador granos y contratación fletes' },
      { ruc: '80045678-9', tipo: 'J', razon: 'Bunge Paraguay S.A.', fantasia: 'Bunge', ciudad: 'Villeta', depto: 'Central', obs: 'Trading agrícola y contratos logísticos' },
      { ruc: '80056789-0', tipo: 'J', razon: 'Cooperativa Colonias Unidas', fantasia: 'Colonias Unidas', ciudad: 'Obligado', depto: 'Itapúa', obs: 'Venta de semillas e insumos agrícolas' },
      { ruc: '80067890-1', tipo: 'J', razon: 'Trans Chaco Logística S.A.', fantasia: 'Trans Chaco', ciudad: 'Mariano Roque Alonso', depto: 'Central', obs: 'Fletes internacionales y transbordo' },
      { ruc: '1234567-8', tipo: 'F', razon: 'Juan Carlos Benítez', fantasia: 'Taller Mecánico Benítez', ciudad: 'Santa Rita', depto: 'Alto Paraná', obs: 'Mantenimiento preventivo camiones y semirremolques' },
      { ruc: '2345678-9', tipo: 'F', razon: 'María Elena Galeano', fantasia: 'Estudio Galeano & Asoc.', ciudad: 'Asunción', depto: 'Central', obs: 'Asesoría fiscal, tributaria y auditoría' },
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
    console.log(`🤝 Contrapartes disponíveis: ${cpMap.size}`);

    // Contas do plano analíticas
    const planAccounts = await client.query('SELECT id, codigo, descripcion, naturaleza FROM cuentas_plan WHERE nivel = 3');
    const ingVentas = planAccounts.rows.find((p) => p.naturaleza === 'R')?.id ?? null;
    const egCombustible = planAccounts.rows.find((p) => p.naturaleza === 'D' && p.descripcion.toLowerCase().includes('combust'))?.id
      ?? planAccounts.rows.find((p) => p.naturaleza === 'D')?.id ?? null;
    const egServicios = planAccounts.rows.find((p) => p.naturaleza === 'D' && (p.descripcion.toLowerCase().includes('servic') || p.descripcion.toLowerCase().includes('energ') || p.descripcion.toLowerCase().includes('luz')))?.[0]?.id
      ?? planAccounts.rows.filter((p) => p.naturaleza === 'D')[1]?.id
      ?? egCombustible;

    // Iterar por TODAS as empresas cadastradas no tenant
    for (const emp of empresasRes.rows) {
      console.log(`\n======================================================`);
      console.log(`🏢 Populando Empresa [ID: ${emp.id}] - ${emp.nombre_fantasia || emp.razon_social}`);
      console.log(`======================================================`);

      // 1. Centros de Custo
      const existingCenters = await client.query('SELECT id, codigo, descripcion FROM centros_costo WHERE empresa_id = $1', [emp.id]);
      let adminCenterId = existingCenters.rows.find((c) => c.codigo === '01')?.id;
      let opCenterId = existingCenters.rows.find((c) => c.codigo === '02')?.id;
      let comCenterId = existingCenters.rows.find((c) => c.codigo === '03')?.id;

      if (!adminCenterId) {
        const c1 = await client.query(
          `INSERT INTO centros_costo (tenant_id, empresa_id, codigo, descripcion)
           VALUES ($1, $2, '01', 'Administración General') RETURNING id`,
          [context.tenantId, emp.id],
        );
        adminCenterId = c1.rows[0].id;
      }
      if (!opCenterId) {
        const c2 = await client.query(
          `INSERT INTO centros_costo (tenant_id, empresa_id, codigo, descripcion)
           VALUES ($1, $2, '02', 'Operaciones y Logística') RETURNING id`,
          [context.tenantId, emp.id],
        );
        opCenterId = c2.rows[0].id;
      }
      if (!comCenterId) {
        const c3 = await client.query(
          `INSERT INTO centros_costo (tenant_id, empresa_id, codigo, descripcion)
           VALUES ($1, $2, '03', 'Comercial y Mantenimiento') RETURNING id`,
          [context.tenantId, emp.id],
        );
        comCenterId = c3.rows[0].id;
      }
      console.log(`  📌 Centros de custo prontos: { admin: ${adminCenterId}, op: ${opCenterId}, com: ${comCenterId} }`);

      // 2. Cajas y Bancos (PYG, USD, BRL)
      const existingCajas = await client.query('SELECT id, nombre, moneda, tipo FROM cajas WHERE empresa_id = $1', [emp.id]);
      let cajaPygId = existingCajas.rows.find((c) => c.moneda === 'PYG')?.id;
      let bancoUsdId = existingCajas.rows.find((c) => c.moneda === 'USD')?.id;
      let bancoBrlId = existingCajas.rows.find((c) => c.moneda === 'BRL')?.id;

      if (!cajaPygId) {
        const res = await client.query(
          `INSERT INTO cajas (tenant_id, empresa_id, nombre, tipo, moneda, saldo_inicial_minor, fecha_saldo_inicial)
           VALUES ($1, $2, $3, 'caja', 'PYG', 12000000, '2026-01-01') RETURNING id`,
          [context.tenantId, emp.id, emp.id === '2' ? 'Caja Operativa CDE' : 'Caja Central Asunción'],
        );
        cajaPygId = res.rows[0].id;
      }
      if (!bancoUsdId) {
        const res = await client.query(
          `INSERT INTO cajas (tenant_id, empresa_id, nombre, tipo, moneda, saldo_inicial_minor, fecha_saldo_inicial)
           VALUES ($1, $2, $3, 'banco', 'USD', 3500000, '2026-01-01') RETURNING id`,
          [context.tenantId, emp.id, emp.id === '2' ? 'Banco Sudameris USD' : 'Banco Continental USD'],
        );
        bancoUsdId = res.rows[0].id;
      }
      if (!bancoBrlId) {
        const res = await client.query(
          `INSERT INTO cajas (tenant_id, empresa_id, nombre, tipo, moneda, saldo_inicial_minor, fecha_saldo_inicial)
           VALUES ($1, $2, $3, 'banco', 'BRL', 1500000, '2026-01-01') RETURNING id`,
          [context.tenantId, emp.id, emp.id === '2' ? 'Banco do Brasil BRL' : 'Banco Itaú BRL'],
        );
        bancoBrlId = res.rows[0].id;
      }
      console.log(`  🏦 Cajas prontas: { PYG: ${cajaPygId}, USD: ${bancoUsdId}, BRL: ${bancoBrlId} }`);

      // 3. Cuentas por Pagar (PYG, USD, BRL)
      const payablesCount = await client.query('SELECT count(*)::int n FROM cuentas_pagar WHERE empresa_id = $1', [emp.id]);
      if (payablesCount.rows[0].n === 0) {
        console.log(`  🧾 Inserindo Cuentas por Pagar mock para empresa ${emp.id}...`);
        const payablesData = [
          {
            desc: emp.id === '2' ? 'Combustibles Petropar - Carga Flota Chaco' : 'Combustibles Chaco - Lote Diesel Flota Norte',
            doc: `FAC-001-002-00${emp.id}521`,
            moneda: 'PYG',
            totalMinor: '16800000',
            emision: '2026-08-10',
            vencimiento: '2026-09-10', // Vencida
            ruc: '80023456-7',
            planId: egCombustible,
            centerId: opCenterId,
            cuotas: [
              { num: 1, valor: '8400000', vence: '2026-09-10', paga: true, cajaId: cajaPygId, fechaPago: '2026-09-12' },
              { num: 2, valor: '8400000', vence: '2026-10-10', paga: false },
            ],
          },
          {
            desc: 'Suministro Energía Eléctrica ANDE - Base Operativa',
            doc: `ANDE-2026-09-0${emp.id}8`,
            moneda: 'PYG',
            totalMinor: '4350000',
            emision: '2026-09-05',
            vencimiento: '2026-09-25', // Vence em 3 dias
            ruc: '80000001-1',
            planId: egServicios,
            centerId: opCenterId,
            cuotas: [
              { num: 1, valor: '4350000', vence: '2026-09-25', paga: false },
            ],
          },
          {
            desc: emp.id === '2' ? 'Adquisición Semirremolque Randon 3 Ejes' : 'Importación Fertilizantes Fosfatados 200T',
            doc: `IMP-2026-09${emp.id}1`,
            moneda: 'USD',
            totalMinor: '1800000', // 18.000,00 USD
            emision: '2026-08-15',
            vencimiento: '2026-09-15', // Vencida
            ruc: '80012345-6',
            planId: egCombustible,
            centerId: opCenterId,
            cuotas: [
              { num: 1, valor: '600000', vence: '2026-09-15', pagaParcial: '400000', cajaId: bancoUsdId, fechaPago: '2026-09-16' },
              { num: 2, valor: '600000', vence: '2026-10-15', paga: false },
              { num: 3, valor: '600000', vence: '2026-11-15', paga: false },
            ],
          },
          {
            desc: 'Mantenimiento Preventivo Cosechadoras y Camiones',
            doc: `TC-2026-00${emp.id}4`,
            moneda: 'USD',
            totalMinor: '320000', // 3.200,00 USD
            emision: '2026-09-18',
            vencimiento: '2026-10-02', // Vence em 10 dias
            ruc: '1234567-8',
            planId: egServicios,
            centerId: opCenterId,
            cuotas: [
              { num: 1, valor: '320000', vence: '2026-10-02', paga: false },
            ],
          },
          {
            desc: 'Neumáticos Michelin 295/80 R22.5 - Lote Importado',
            doc: `NF-BR-88${emp.id}04`,
            moneda: 'BRL',
            totalMinor: '780000', // 7.800,00 BRL
            emision: '2026-09-01',
            vencimiento: '2026-09-20', // Vencida há 2 dias
            ruc: '80067890-1',
            planId: egCombustible,
            centerId: opCenterId,
            cuotas: [
              { num: 1, valor: '390000', vence: '2026-09-20', paga: false },
              { num: 2, valor: '390000', vence: '2026-10-20', paga: false },
            ],
          },
          {
            desc: 'Honorarios Asesoría Fiscal y Auditoría DNIT',
            doc: `REC-EG-2026-0${emp.id}`,
            moneda: 'PYG',
            totalMinor: '3500000',
            emision: '2026-09-20',
            vencimiento: '2026-10-05',
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
            [context.tenantId, emp.id, p.desc, p.doc, p.moneda, p.totalMinor, p.emision, p.vencimiento, p.planId, p.centerId, cpId, context.userId],
          );
          const cuentaId = ctaRes.rows[0].id;

          for (const cuota of p.cuotas) {
            const cuoRes = await client.query(
              `INSERT INTO cuotas_pagar (tenant_id, empresa_id, cuenta_pagar_id, numero_cuota, valor_minor, fecha_vencimiento)
               VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
              [context.tenantId, emp.id, cuentaId, cuota.num, cuota.valor, cuota.vence],
            );
            const cuotaId = cuoRes.rows[0].id;

            if (cuota.paga && cuota.cajaId) {
              const mov = await client.query(
                `INSERT INTO movimientos_caja (tenant_id, empresa_id, caja_id, fecha, historico, tipo, moneda, valor_minor, origen, cuota_origen_id)
                 VALUES ($1, $2, $3, $4, $5, 'D', $6, $7, 'CP', $8) RETURNING id`,
                [context.tenantId, emp.id, cuota.cajaId, cuota.fechaPago, `Pago: ${cuotaId}`, p.moneda, cuota.valor, cuotaId],
              );
              await client.query(
                `INSERT INTO bajas_pagar (tenant_id, empresa_id, cuota_id, tipo, fecha, valor_pagado_minor, caja_id, movimiento_caja_id, creado_por)
                 VALUES ($1, $2, $3, 'BAJA', $4, $5, $6, $7, $8)`,
                [context.tenantId, emp.id, cuotaId, cuota.fechaPago, cuota.valor, cuota.cajaId, mov.rows[0].id, context.userId],
              );
            } else if (cuota.pagaParcial && cuota.cajaId) {
              const mov = await client.query(
                `INSERT INTO movimientos_caja (tenant_id, empresa_id, caja_id, fecha, historico, tipo, moneda, valor_minor, origen, cuota_origen_id)
                 VALUES ($1, $2, $3, $4, $5, 'D', $6, $7, 'CP', $8) RETURNING id`,
                [context.tenantId, emp.id, cuota.cajaId, cuota.fechaPago, `Pago parcial: ${cuotaId}`, p.moneda, cuota.pagaParcial, cuotaId],
              );
              await client.query(
                `INSERT INTO bajas_pagar (tenant_id, empresa_id, cuota_id, tipo, fecha, valor_pagado_minor, caja_id, movimiento_caja_id, creado_por)
                 VALUES ($1, $2, $3, 'BAJA', $4, $5, $6, $7, $8)`,
                [context.tenantId, emp.id, cuotaId, cuota.fechaPago, cuota.pagaParcial, cuota.cajaId, mov.rows[0].id, context.userId],
              );
            }
          }
        }
        console.log(`  ✅ Cuentas por pagar inseridas para empresa ${emp.id}.`);
      } else {
        console.log(`  ℹ️ Empresa ${emp.id} já possui ${payablesCount.rows[0].n} contas por pagar.`);
      }

      // 4. Cuentas por Cobrar (USD, PYG, BRL)
      const receivablesCount = await client.query('SELECT count(*)::int n FROM cuentas_cobrar WHERE empresa_id = $1', [emp.id]);
      if (receivablesCount.rows[0].n === 0) {
        console.log(`  📈 Inserindo Cuentas por Cobrar mock para empresa ${emp.id}...`);
        const receivablesData = [
          {
            desc: emp.id === '2' ? 'Flete Fluvial y Terrestre Soja - Transbordo Villeta' : 'Exportación Soja Zafra 2026 - Lote EXP-088',
            doc: `FAC-EXP-08${emp.id}`,
            moneda: 'USD',
            totalMinor: '5400000', // 54.000,00 USD
            emision: '2026-08-20',
            vencimiento: '2026-09-20',
            ruc: '80034567-8',
            planId: ingVentas,
            centerId: comCenterId,
            cuotas: [
              { num: 1, valor: '2700000', vence: '2026-09-20', cobrada: true, cajaId: bancoUsdId, fechaCobro: '2026-09-21' },
              { num: 2, valor: '2700000', vence: '2026-10-20', cobrada: false },
            ],
          },
          {
            desc: 'Transporte Maíz Grano a Granel - Puerto Fénix',
            doc: `FAC-EXP-09${emp.id}`,
            moneda: 'USD',
            totalMinor: '3650000', // 36.500,00 USD
            emision: '2026-09-10',
            vencimiento: '2026-09-28', // Vence em 6 dias
            ruc: '80045678-9',
            planId: ingVentas,
            centerId: comCenterId,
            cuotas: [
              { num: 1, valor: '3650000', vence: '2026-09-28', cobrada: false },
            ],
          },
          {
            desc: 'Servicio de Flete Distribución Semillas Zafriña',
            doc: `FAC-INT-00${emp.id}28`,
            moneda: 'PYG',
            totalMinor: '28000000', // 28.000.000 PYG
            emision: '2026-09-01',
            vencimiento: '2026-09-26', // Vence em 4 dias
            ruc: '80056789-0',
            planId: ingVentas,
            centerId: comCenterId,
            cuotas: [
              { num: 1, valor: '14000000', vence: '2026-09-26', cobrada: false },
              { num: 2, valor: '14000000', vence: '2026-10-26', cobrada: false },
            ],
          },
          {
            desc: 'Flete Internacional CDE - Cascavel PR Carga Pesada',
            doc: `CRT-00${emp.id}921`,
            moneda: 'BRL',
            totalMinor: '2100000', // 21.000,00 BRL
            emision: '2026-08-25',
            vencimiento: '2026-09-15', // Vencida há 7 dias
            ruc: '80067890-1',
            planId: ingVentas,
            centerId: opCenterId,
            cuotas: [
              { num: 1, valor: '2100000', vence: '2026-09-15', cobroParcial: '1200000', cajaId: bancoBrlId, fechaCobro: '2026-09-18' },
            ],
          },
        ];

        for (const r of receivablesData) {
          const cpId = cpMap.get(r.ruc) ?? null;
          const ctaRes = await client.query(
            `INSERT INTO cuentas_cobrar (tenant_id, empresa_id, descripcion, numero_documento, moneda, valor_total_minor, fecha_emision, fecha_vencimiento, cuenta_plan_id, centro_costo_id, contraparte_id, creado_por)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
            [context.tenantId, emp.id, r.desc, r.doc, r.moneda, r.totalMinor, r.emision, r.vencimiento, r.planId, r.centerId, cpId, context.userId],
          );
          const cuentaId = ctaRes.rows[0].id;

          for (const cuota of r.cuotas) {
            const cuoRes = await client.query(
              `INSERT INTO cuotas_cobrar (tenant_id, empresa_id, cuenta_cobrar_id, numero_cuota, valor_minor, fecha_vencimiento)
               VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
              [context.tenantId, emp.id, cuentaId, cuota.num, cuota.valor, cuota.vence],
            );
            const cuotaId = cuoRes.rows[0].id;

            if (cuota.cobrada && cuota.cajaId) {
              const mov = await client.query(
                `INSERT INTO movimientos_caja (tenant_id, empresa_id, caja_id, fecha, historico, tipo, moneda, valor_minor, origen, cuota_origen_id)
                 VALUES ($1, $2, $3, $4, $5, 'C', $6, $7, 'CC', $8) RETURNING id`,
                [context.tenantId, emp.id, cuota.cajaId, cuota.fechaCobro, `Cobro: ${cuotaId}`, r.moneda, cuota.valor, cuotaId],
              );
              await client.query(
                `INSERT INTO bajas_cobrar (tenant_id, empresa_id, cuota_id, tipo, fecha, valor_cobrado_minor, caja_id, movimiento_caja_id, creado_por)
                 VALUES ($1, $2, $3, 'BAJA', $4, $5, $6, $7, $8)`,
                [context.tenantId, emp.id, cuotaId, cuota.fechaCobro, cuota.valor, cuota.cajaId, mov.rows[0].id, context.userId],
              );
            } else if (cuota.cobroParcial && cuota.cajaId) {
              const mov = await client.query(
                `INSERT INTO movimientos_caja (tenant_id, empresa_id, caja_id, fecha, historico, tipo, moneda, valor_minor, origen, cuota_origen_id)
                 VALUES ($1, $2, $3, $4, $5, 'C', $6, $7, 'CC', $8) RETURNING id`,
                [context.tenantId, emp.id, cuota.cajaId, cuota.fechaCobro, `Cobro parcial: ${cuotaId}`, r.moneda, cuota.cobroParcial, cuotaId],
              );
              await client.query(
                `INSERT INTO bajas_cobrar (tenant_id, empresa_id, cuota_id, tipo, fecha, valor_cobrado_minor, caja_id, movimiento_caja_id, creado_por)
                 VALUES ($1, $2, $3, 'BAJA', $4, $5, $6, $7, $8)`,
                [context.tenantId, emp.id, cuotaId, cuota.fechaCobro, cuota.cobroParcial, cuota.cajaId, mov.rows[0].id, context.userId],
              );
            }
          }
        }
        console.log(`  ✅ Cuentas por cobrar inseridas para empresa ${emp.id}.`);
      } else {
        console.log(`  ℹ️ Empresa ${emp.id} já possui ${receivablesCount.rows[0].n} contas por cobrar.`);
      }

      // 5. Movimentos Manuais de Caixa (MA)
      const manualMovs = await client.query("SELECT count(*)::int n FROM movimientos_caja WHERE empresa_id = $1 AND origen = 'MA'", [emp.id]);
      if (manualMovs.rows[0].n === 0 && cajaPygId) {
        await client.query(
          `INSERT INTO movimientos_caja (tenant_id, empresa_id, caja_id, fecha, historico, tipo, moneda, valor_minor, cuenta_plan_id, centro_costo_id, origen)
           VALUES ($1, $2, $3, '2026-09-21', 'Gastos menores de útiles y cafetería base operativa', 'D', 'PYG', 420000, $4, $5, 'MA')`,
          [context.tenantId, emp.id, cajaPygId, egServicios, adminCenterId],
        );
        await client.query(
          `INSERT INTO movimientos_caja (tenant_id, empresa_id, caja_id, fecha, historico, tipo, moneda, valor_minor, cuenta_plan_id, centro_costo_id, origen)
           VALUES ($1, $2, $3, '2026-09-22', 'Venta al contado de sobrantes y pallets reciclados', 'C', 'PYG', 750000, $4, $5, 'MA')`,
          [context.tenantId, emp.id, cajaPygId, ingVentas, opCenterId],
        );
        console.log(`  ✅ Movimentos manuais de caixa inseridos para empresa ${emp.id}.`);
      }

      // 6. Auditoria de Eventos
      const auditCount = await client.query('SELECT count(*)::int n FROM auditoria_eventos WHERE empresa_id = $1', [emp.id]);
      if (auditCount.rows[0].n === 0) {
        await client.query(
          `INSERT INTO auditoria_eventos (tenant_id, empresa_id, usuario_origem_codigo, accion, entidad, entidad_id, detalle)
           VALUES ($1, $2, 1, 'CREAR', 'EMPRESA', $3, '{"motivo": "Inicialización de empresa en el tenant"}'::jsonb)`,
          [context.tenantId, emp.id, String(emp.id)],
        );
        await client.query(
          `INSERT INTO auditoria_eventos (tenant_id, empresa_id, usuario_origem_codigo, accion, entidad, entidad_id, detalle)
           VALUES ($1, $2, 1, 'CREAR', 'CAJA', $3, '{"nombre": "Caja Operativa", "moneda": "PYG"}'::jsonb)`,
          [context.tenantId, emp.id, String(cajaPygId)],
        );
        await client.query(
          `INSERT INTO auditoria_eventos (tenant_id, empresa_id, usuario_origem_codigo, accion, entidad, entidad_id, detalle)
           VALUES ($1, $2, 1, 'APERTURA', 'EJERCICIO', '2026', '{"sistema": "Kuatiá", "estado": "ABIERTO"}'::jsonb)`,
          [context.tenantId, emp.id],
        );
        console.log(`  ✅ Eventos de auditoria inseridos para empresa ${emp.id}.`);
      }

      // 7. Documentos Importados
      const docsCount = await client.query('SELECT count(*)::int n FROM documentos_importados WHERE empresa_id = $1', [emp.id]);
      if (docsCount.rows[0].n === 0) {
        const hash1 = 'a'.repeat(63) + String(emp.id).slice(-1);
        const hash2 = 'b'.repeat(63) + String(emp.id).slice(-1);
        await client.query(
          `INSERT INTO documentos_importados (tenant_id, empresa_id, tipo, identificador_origen, hash_archivo, datos_extra, creado_por)
           VALUES ($1, $2, 'PLANILLA', $3, $4, '{"nombreArchivo": "carga_inicial_cuentas.xlsx", "filas": 42}'::jsonb, $5)`,
          [context.tenantId, emp.id, `PLANILLA-2026-09-${emp.id}`, hash1, context.userId],
        );
        await client.query(
          `INSERT INTO documentos_importados (tenant_id, empresa_id, tipo, identificador_origen, hash_archivo, archivo_xml, datos_extra, creado_por)
           VALUES ($1, $2, 'XML_COMPRA', $3, $4, '<rDE><dFecEmi>2026-09-01</dFecEmi></rDE>', '{"nombreArchivo": "factura_sifen_001.xml"}'::jsonb, $5)`,
          [context.tenantId, emp.id, `SIFEN-0180023456700100200${emp.id}521`, hash2, context.userId],
        );
        console.log(`  ✅ Documentos importados mock inseridos para empresa ${emp.id}.`);
      }
    }
  });

  console.log('\n🎉 Semeadura COMPLETA de dados de teste mock finalizada com sucesso em TODAS as tabelas!');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Erro na semeadura:', err);
  process.exit(1);
});
