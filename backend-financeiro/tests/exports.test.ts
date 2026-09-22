import { describe, expect, it } from 'vitest';
import { createCashPdf, createCashXlsx, createPdf, createReportPdf, createReportXlsx, createXlsx } from '../src/modules/exports/exports.routes.js';

const rows = [{ fecha: '2026-08-11', descripcion: 'Compra de prueba', documento: '001-001-0000001', contraparte: 'Proveedor S.A.', moneda: 'PYG' as const, total_minor: '1000000', saldo_minor: '500000', estado: 'ABIERTA' }];

describe('exportaciones', () => {
  it('genera formatos XLSX y PDF válidos', async () => {
    const [xlsx, pdf] = await Promise.all([createXlsx('Empresa de prueba', 'Cuentas por pagar', rows), createPdf('Empresa de prueba', 'Cuentas por pagar', rows)]);
    expect(xlsx.subarray(0, 2).toString('utf8')).toBe('PK');
    expect(pdf.subarray(0, 4).toString('utf8')).toBe('%PDF');
  });

  it('genera el libro de caja en XLSX y PDF', async () => {
    const cash = [{ fecha: '2026-08-11', caja: 'Banco PYG', historico: 'Cobro de factura', documento: '001-001-0001', origen: 'CC' as const, tipo: 'C' as const, moneda: 'PYG' as const, valor_minor: '1000000' }];
    const [xlsx, pdf] = await Promise.all([createCashXlsx('Empresa de prueba', cash), createCashPdf('Empresa de prueba', cash)]);
    expect(xlsx.subarray(0, 2).toString('utf8')).toBe('PK');
    expect(pdf.subarray(0, 4).toString('utf8')).toBe('%PDF');
  });

  it('genera reportes en XLSX y PDF', async () => {
    const report = { title: 'Flujo de Caja', subtitle: 'Empresa de prueba · monedas separadas', headers: ['Fecha', 'Moneda', 'A cobrar', 'A pagar', 'Neto'], rows: [['11/08/2026', 'PYG', 'PYG 1.000.000', 'PYG 500.000', 'PYG 500.000']] };
    const [xlsx, pdf] = await Promise.all([createReportXlsx(report), createReportPdf(report)]);
    expect(xlsx.subarray(0, 2).toString('utf8')).toBe('PK'); expect(pdf.subarray(0, 4).toString('utf8')).toBe('%PDF');
  });
});
