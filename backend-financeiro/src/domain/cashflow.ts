import type { Currency } from './currency.js';

export interface CashflowEventInput {
  fecha: string;
  moneda: Currency;
  cobrar_minor: string;
  pagar_minor: string;
}

export interface CashflowInitialBalance {
  moneda: Currency;
  saldo_inicial_minor: string;
}

export interface ProjectedCashflowRow extends CashflowEventInput {
  neto_minor: string;
  saldo_acumulado_minor: string;
}

/**
 * Projeta o fluxo de caixa acumulado por moeda.
 *
 * Invariantes financeiras:
 * 1. Moedas NUNCA se misturam (PYG, USD, BRL têm acumulação e saldos isolados).
 * 2. Valores são estritamente inteiros (unidades mínimas / BigInt), sem float.
 * 3. Saldo acumulado do dia D = Saldo anterior da moeda + cobrar(D) - pagar(D).
 */
export function projectCashflow(
  initialBalances: CashflowInitialBalance[],
  events: CashflowEventInput[],
): { saldosIniciales: CashflowInitialBalance[]; rows: ProjectedCashflowRow[] } {
  const running = new Map<Currency, bigint>();
  for (const item of initialBalances) {
    running.set(item.moneda, BigInt(item.saldo_inicial_minor));
  }

  const rows: ProjectedCashflowRow[] = [];
  for (const ev of events) {
    const prev = running.get(ev.moneda) ?? 0n;
    const cobrar = BigInt(ev.cobrar_minor);
    const pagar = BigInt(ev.pagar_minor);
    const neto = cobrar - pagar;
    const saldoAcumulado = prev + neto;
    running.set(ev.moneda, saldoAcumulado);

    rows.push({
      ...ev,
      neto_minor: neto.toString(),
      saldo_acumulado_minor: saldoAcumulado.toString(),
    });
  }

  return {
    saldosIniciales: initialBalances,
    rows,
  };
}
