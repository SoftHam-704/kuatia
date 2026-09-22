import { apiGet } from './api';
import type { CurrencyCode } from '../design-system/format';

/* Contratos do backend. Dinheiro chega em unidades mínimas como string
   (`saldoMinor`, `montoMinor`…) e datas como ISO — nada aqui vira `number`. */

export interface Company {
  id: number;
  razonSocial: string;
  nombreFantasia: string | null;
  monedaBase: CurrencyCode;
  activa: boolean;
}

export interface Caja {
  id: number;
  nombre: string;
  tipo: 'caja' | 'banco';
  moneda: CurrencyCode;
  saldoMinor: string;
  movimientos: number;
  /** Data do saldo inicial: nada antes disso entra na conta. */
  desde: string;
}

export interface Tramo {
  montoMinor: string;
  cuotas: number;
}

export interface Vencimientos {
  moneda: CurrencyCode;
  vencido: Tramo & { desde: string | null };
  dias7: Tramo;
  dias15: Tramo;
  dias30: Tramo;
}

export interface MesPorMoneda {
  moneda: CurrencyCode;
  entradasMinor: string;
  salidasMinor: string;
  movimientos: number;
  movimientosManuales: number;
}

export interface Panel {
  empresa: { id: number; razonSocial: string; nombreFantasia: string | null; monedaBase: CurrencyCode };
  /** Hoje segundo o servidor que fez a conta — não segundo o relógio do navegador. */
  hoy: string;
  generadoEn: string;
  cajas: Caja[];
  porPagar: Vencimientos[];
  porCobrar: Vencimientos[];
  mes: { desde: string; hasta: string; porMoneda: MesPorMoneda[] };
}

interface CompanyRow {
  id: string | number;
  razon_social: string;
  nombre_fantasia: string | null;
  moneda_base: CurrencyCode;
  activa: boolean;
}

export async function fetchCompanies(token: string): Promise<Company[]> {
  const body = await apiGet<{ data: CompanyRow[] }>('/empresas', token);
  return body.data.map((row) => ({
    id: Number(row.id),
    razonSocial: row.razon_social,
    nombreFantasia: row.nombre_fantasia,
    monedaBase: row.moneda_base,
    activa: row.activa,
  }));
}

export function fetchPanel(token: string, empresaId: number): Promise<Panel> {
  return apiGet<Panel>(`/panel?empresaId=${empresaId}`, token);
}

/** Ordem fixa das moedas na tela: nunca alfabética, nunca por volume. */
export const CURRENCY_ORDER: CurrencyCode[] = ['PYG', 'USD', 'BRL'];

export function sortCurrencies(codes: Iterable<CurrencyCode>): CurrencyCode[] {
  return [...new Set(codes)].sort(
    (a, b) => CURRENCY_ORDER.indexOf(a) - CURRENCY_ORDER.indexOf(b),
  );
}
