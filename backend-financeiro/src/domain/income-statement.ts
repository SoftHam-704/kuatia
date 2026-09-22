/* =============================================================================
   Estado de Resultados Gerencial (DRE) — Domínio Puro
   Totalizadores por moeda sem conversão cruzada.
   ============================================================================= */

import type { Currency } from './currency.js';

export interface IncomeStatementRow {
  codigo: string;
  descripcion: string;
  naturaleza: 'R' | 'D';
  moneda: Currency;
  valor_minor: string;
  documentos: number;
}

export interface IncomeStatementCurrencyTotal {
  moneda: Currency;
  ingresos_minor: string;
  egresos_minor: string;
  neto_minor: string;
}

export function calculateIncomeStatementTotals(
  rows: Array<Pick<IncomeStatementRow, 'naturaleza' | 'moneda' | 'valor_minor'>>,
): IncomeStatementCurrencyTotal[] {
  const totals = new Map<Currency, { ingresos: bigint; egresos: bigint }>();

  for (const row of rows) {
    const entry = totals.get(row.moneda) ?? { ingresos: 0n, egresos: 0n };
    const amount = BigInt(row.valor_minor);
    if (row.naturaleza === 'R') {
      entry.ingresos += amount;
    } else {
      entry.egresos += amount;
    }
    totals.set(row.moneda, entry);
  }

  const currencies: Currency[] = ['PYG', 'USD', 'BRL'];
  return currencies
    .filter((moneda) => totals.has(moneda))
    .map((moneda) => {
      const { ingresos, egresos } = totals.get(moneda)!;
      return {
        moneda,
        ingresos_minor: ingresos.toString(),
        egresos_minor: egresos.toString(),
        neto_minor: (ingresos - egresos).toString(),
      };
    });
}
