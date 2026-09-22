import { describe, expect, it } from 'vitest';
import { projectCashflow } from '../src/domain/cashflow.js';
import { calculateIncomeStatementTotals } from '../src/domain/income-statement.js';

describe('cashflow projection', () => {
  it('projeta saldo acumulado isolando moedas diferentes', () => {
    const initial = [
      { moneda: 'PYG' as const, saldo_inicial_minor: '1000000' },
      { moneda: 'USD' as const, saldo_inicial_minor: '50000' }, // $500.00
    ];

    const events = [
      { fecha: '2026-09-23', moneda: 'PYG' as const, cobrar_minor: '500000', pagar_minor: '200000' },
      { fecha: '2026-09-23', moneda: 'USD' as const, cobrar_minor: '10000', pagar_minor: '25000' },
      { fecha: '2026-09-24', moneda: 'PYG' as const, cobrar_minor: '0', pagar_minor: '1500000' },
      { fecha: '2026-09-25', moneda: 'USD' as const, cobrar_minor: '30000', pagar_minor: '0' },
    ];

    const result = projectCashflow(initial, events);

    expect(result.saldosIniciales).toEqual(initial);
    expect(result.rows).toHaveLength(4);

    // Dia 23 PYG: 1.000.000 + 500.000 - 200.000 = 1.300.000 (neto: +300.000)
    expect(result.rows[0]).toEqual({
      fecha: '2026-09-23',
      moneda: 'PYG',
      cobrar_minor: '500000',
      pagar_minor: '200000',
      neto_minor: '300000',
      saldo_acumulado_minor: '1300000',
    });

    // Dia 23 USD: 50.000 + 10.000 - 25.000 = 35.000 (neto: -15.000)
    expect(result.rows[1]).toEqual({
      fecha: '2026-09-23',
      moneda: 'USD',
      cobrar_minor: '10000',
      pagar_minor: '25000',
      neto_minor: '-15000',
      saldo_acumulado_minor: '35000',
    });

    // Dia 24 PYG: 1.300.000 + 0 - 1.500.000 = -200.000 (saldo negativo detectado!)
    expect(result.rows[2]).toEqual({
      fecha: '2026-09-24',
      moneda: 'PYG',
      cobrar_minor: '0',
      pagar_minor: '1500000',
      neto_minor: '-1500000',
      saldo_acumulado_minor: '-200000',
    });

    // Dia 25 USD: 35.000 + 30.000 - 0 = 65.000
    expect(result.rows[3]).toEqual({
      fecha: '2026-09-25',
      moneda: 'USD',
      cobrar_minor: '30000',
      pagar_minor: '0',
      neto_minor: '30000',
      saldo_acumulado_minor: '65000',
    });
  });

  it('inicia saldo com zero se moeda não tiver caixa inicial', () => {
    const initial = [{ moneda: 'PYG' as const, saldo_inicial_minor: '100000' }];
    const events = [{ fecha: '2026-09-23', moneda: 'BRL' as const, cobrar_minor: '2000', pagar_minor: '5000' }];

    const result = projectCashflow(initial, events);
    expect(result.rows[0].saldo_acumulado_minor).toBe('-3000');
    expect(result.rows[0].neto_minor).toBe('-3000');
  });
});

describe('income statement totals (DRE)', () => {
  it('consolida receitas e despesas por moeda calculando resultado líquido', () => {
    const rows = [
      { naturaleza: 'R' as const, moneda: 'PYG' as const, valor_minor: '15000000' },
      { naturaleza: 'D' as const, moneda: 'PYG' as const, valor_minor: '9000000' },
      { naturaleza: 'D' as const, moneda: 'PYG' as const, valor_minor: '2000000' },
      { naturaleza: 'R' as const, moneda: 'USD' as const, valor_minor: '500000' }, // $5,000.00
      { naturaleza: 'D' as const, moneda: 'USD' as const, valor_minor: '650000' }, // $6,500.00 (resultado negativo)
    ];

    const totals = calculateIncomeStatementTotals(rows);
    expect(totals).toHaveLength(2);

    // PYG: 15.000.000 - 11.000.000 = +4.000.000
    expect(totals[0]).toEqual({
      moneda: 'PYG',
      ingresos_minor: '15000000',
      egresos_minor: '11000000',
      neto_minor: '4000000',
    });

    // USD: 500.000 - 650.000 = -150.000
    expect(totals[1]).toEqual({
      moneda: 'USD',
      ingresos_minor: '500000',
      egresos_minor: '650000',
      neto_minor: '-150000',
    });
  });
});

