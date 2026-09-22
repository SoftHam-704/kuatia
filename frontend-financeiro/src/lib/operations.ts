import { apiGet, apiPost } from './api';
import type { CurrencyCode } from '../design-system/format';

/* Telas operacionais: contas a pagar, a cobrar, caixa e consolidado.
   Mesma disciplina do painel — dinheiro em unidades mínimas como string,
   datas como texto ISO vindas do servidor, nada de `number` no caminho. */

export type EstadoCuenta = 'ABIERTO' | 'VENCIDO' | 'PAGADO' | 'COBRADO' | 'CANCELADO';

export interface Cuenta {
  id: string;
  empresaId: number;
  empresa: string;
  descripcion: string;
  numeroDocumento: string | null;
  moneda: CurrencyCode;
  valorTotalMinor: string;
  saldoMinor: string;
  fechaEmision: string;
  fechaVencimiento: string;
  cuotas: number;
  cuotasPendientes: number;
  cuotaPendienteId: string | null;
  cuotaPendienteSaldoMinor: string | null;
  estado: EstadoCuenta;
  /** Hoje segundo o servidor: é o que decide o que está vencido. */
  hoy: string;
}

interface CuentaRow {
  id: string | number;
  empresa_id: string | number;
  empresa: string;
  descripcion: string;
  numero_documento: string | null;
  moneda: CurrencyCode;
  valor_total_minor: string;
  saldo_minor: string;
  fecha_emision: string;
  fecha_vencimiento: string;
  cuotas: string | number;
  cuotas_pendientes: string | number;
  cuota_pendiente_id: string | number | null;
  cuota_pendiente_saldo_minor: string | number | null;
  estado: EstadoCuenta;
  hoy: string;
}

function toCuenta(row: CuentaRow): Cuenta {
  return {
    id: String(row.id),
    empresaId: Number(row.empresa_id),
    empresa: row.empresa,
    descripcion: row.descripcion,
    numeroDocumento: row.numero_documento,
    moneda: row.moneda,
    valorTotalMinor: String(row.valor_total_minor),
    saldoMinor: String(row.saldo_minor),
    fechaEmision: row.fecha_emision,
    fechaVencimiento: row.fecha_vencimiento,
    cuotas: Number(row.cuotas),
    cuotasPendientes: Number(row.cuotas_pendientes),
    cuotaPendienteId: row.cuota_pendiente_id == null ? null : String(row.cuota_pendiente_id),
    cuotaPendienteSaldoMinor: row.cuota_pendiente_saldo_minor == null ? null : String(row.cuota_pendiente_saldo_minor),
    estado: row.estado,
    hoy: row.hoy,
  };
}

export async function fetchCuentas(
  tipo: 'pagar' | 'cobrar',
  token: string,
  empresaId: number,
): Promise<Cuenta[]> {
  const path = tipo === 'pagar' ? '/cuentas-pagar' : '/cuentas-cobrar';
  const body = await apiGet<{ data: CuentaRow[] }>(`${path}?empresaId=${empresaId}`, token);
  return body.data.map(toCuenta);
}

export function createCuenta(
  tipo: 'pagar' | 'cobrar',
  token: string,
  input: {
    empresaId: number;
    descripcion: string;
    numeroDocumento?: string;
    moneda: CurrencyCode;
    valorTotalMinor: string;
    fechaEmision: string;
    fechaVencimiento: string;
    cuentaPlanId?: number;
    centroCostoId?: number;
    contraparteId?: number;
    cuotas: Array<{ numero: number; valorMinor: string; fechaVencimiento: string }>;
  },
): Promise<{ id: string | number }> {
  const path = tipo === 'pagar' ? '/cuentas-pagar' : '/cuentas-cobrar';
  return apiPost(path, input, token);
}

export function registrarBaja(tipo: 'pagar' | 'cobrar', token: string, input: { cuotaId: number; fecha: string; valorMinor: string; interesesMinor?: string; descuentoMinor?: string; cajaId?: number }): Promise<{ id: string | number }> {
  return tipo === 'pagar'
    ? apiPost('/cuentas-pagar/bajas', { cuotaId: input.cuotaId, fecha: input.fecha, valorPagadoMinor: input.valorMinor, interesesMinor: input.interesesMinor, descuentoMinor: input.descuentoMinor, cajaId: input.cajaId }, token)
    : apiPost('/cuentas-cobrar/bajas', { cuotaId: input.cuotaId, fecha: input.fecha, valorCobradoMinor: input.valorMinor, interesesMinor: input.interesesMinor, descuentoMinor: input.descuentoMinor, cajaId: input.cajaId }, token);
}

export interface CuotaDetalle {
  id: string;
  numero: number;
  valorMinor: string;
  fechaVencimiento: string;
  aplicadoMinor: string;
  saldoMinor: string;
}

export interface BajaDetalle {
  id: string;
  cuotaId: string;
  cuotaNumero: number;
  tipo: 'BAJA' | 'REVERSION';
  fecha: string;
  valorMinor: string;
  interesesMinor: string;
  descuentoMinor: string;
  observaciones: string | null;
  reversionDeId: string | null;
  revertida: boolean;
}

export interface CuentaDetalle {
  cuenta: Cuenta;
  cuotas: CuotaDetalle[];
  bajas: BajaDetalle[];
}

interface CuentaDetalleRow {
  cuenta: CuentaRow;
  cuotas: Array<{ id: string | number; numero_cuota: string | number; valor_minor: string | number; fecha_vencimiento: string; aplicado_minor: string | number; saldo_minor: string | number }>;
  bajas: Array<{ id: string | number; cuota_id: string | number; numero_cuota: string | number; tipo: 'BAJA' | 'REVERSION'; fecha: string; valor_minor: string | number; intereses_minor: string | number; descuento_minor: string | number; observaciones: string | null; reversion_de_id: string | number | null; revertida: boolean }>;
}

export async function fetchDetalleCuenta(tipo: 'pagar' | 'cobrar', token: string, cuentaId: string): Promise<CuentaDetalle> {
  const path = tipo === 'pagar' ? '/cuentas-pagar' : '/cuentas-cobrar';
  const body = await apiGet<CuentaDetalleRow>(`${path}/${cuentaId}/detalle`, token);
  return {
    cuenta: toCuenta({
      ...body.cuenta,
      saldo_minor: body.cuotas.reduce((total, cuota) => total + BigInt(cuota.saldo_minor), 0n).toString(),
      cuotas: body.cuotas.length,
      cuotas_pendientes: body.cuotas.filter((cuota) => BigInt(cuota.saldo_minor) > 0n).length,
      cuota_pendiente_id: null,
      cuota_pendiente_saldo_minor: null,
      estado: body.cuenta.estado ?? 'ABIERTO',
      hoy: new Date().toISOString().slice(0, 10),
    }),
    cuotas: body.cuotas.map((row) => ({ id: String(row.id), numero: Number(row.numero_cuota), valorMinor: String(row.valor_minor), fechaVencimiento: row.fecha_vencimiento, aplicadoMinor: String(row.aplicado_minor), saldoMinor: String(row.saldo_minor) })),
    bajas: body.bajas.map((row) => ({ id: String(row.id), cuotaId: String(row.cuota_id), cuotaNumero: Number(row.numero_cuota), tipo: row.tipo, fecha: row.fecha, valorMinor: String(row.valor_minor), interesesMinor: String(row.intereses_minor), descuentoMinor: String(row.descuento_minor), observaciones: row.observaciones, reversionDeId: row.reversion_de_id == null ? null : String(row.reversion_de_id), revertida: row.revertida })),
  };
}

export function revertirBaja(tipo: 'pagar' | 'cobrar', token: string, bajaId: string, fecha: string): Promise<{ id: string | number }> {
  const path = tipo === 'pagar' ? '/cuentas-pagar' : '/cuentas-cobrar';
  return apiPost(`${path}/bajas/${bajaId}/reversion`, { fecha }, token);
}

export function cancelarCuenta(
  tipo: 'pagar' | 'cobrar',
  token: string,
  cuentaId: string,
  motivo?: string,
): Promise<{ id: string | number; estado: 'CANCELADO' }> {
  const path = tipo === 'pagar' ? '/cuentas-pagar' : '/cuentas-cobrar';
  return apiPost(`${path}/${cuentaId}/cancelar`, { motivo }, token);
}

export interface Caja {
  id: string;
  nombre: string;
  tipo: 'caja' | 'banco';
  moneda: CurrencyCode;
  saldoInicialMinor: string;
  saldoActualMinor: string;
  fechaSaldoInicial: string;
  ultimoMovimiento: string | null;
  movimientos: number;
  hoy: string;
}

interface CajaRow {
  id: string | number;
  nombre: string;
  tipo: 'caja' | 'banco';
  moneda: CurrencyCode;
  saldo_inicial_minor: string;
  saldo_actual_minor: string;
  fecha_saldo_inicial: string;
  ultimo_movimiento: string | null;
  movimientos: number;
  hoy: string;
}

export async function fetchCajas(token: string, empresaId: number): Promise<Caja[]> {
  const body = await apiGet<{ data: CajaRow[] }>(`/libro-caja/cajas?empresaId=${empresaId}`, token);
  return body.data.map((row) => ({
    id: String(row.id),
    nombre: row.nombre,
    tipo: row.tipo,
    moneda: row.moneda,
    saldoInicialMinor: String(row.saldo_inicial_minor),
    saldoActualMinor: String(row.saldo_actual_minor),
    fechaSaldoInicial: row.fecha_saldo_inicial,
    ultimoMovimiento: row.ultimo_movimiento,
    movimientos: Number(row.movimientos),
    hoy: row.hoy,
  }));
}

export function createCaja(token: string, input: { empresaId: number; nombre: string; tipo: 'caja' | 'banco'; moneda: CurrencyCode; saldoInicialMinor: string; fechaSaldoInicial: string }): Promise<{ id: string | number }> {
  return apiPost('/libro-caja/cajas', input, token);
}

export function createMovimiento(token: string, input: { empresaId: number; cajaId: number; fecha: string; historico: string; tipo: 'C' | 'D'; moneda: CurrencyCode; valorMinor: string; documento?: string }): Promise<{ id: string | number }> {
  return apiPost('/libro-caja/movimientos', input, token);
}

export function createTransferencia(token: string, input: { empresaId: number; cajaOrigenId: number; cajaDestinoId: number; fecha: string; valorMinor: string; historico: string }): Promise<{ transferenciaId: string }> {
  return apiPost('/libro-caja/transferencias', input, token);
}

export type OrigenMovimiento = 'MA' | 'CP' | 'CC' | 'TR';

export interface Movimiento {
  id: string;
  fecha: string;
  historico: string;
  tipo: 'C' | 'D';
  moneda: CurrencyCode;
  valorMinor: string;
  origen: OrigenMovimiento;
  documento: string | null;
  cajaId: string;
  caja: string;
  esTransferencia: boolean;
}

interface MovimientoRow {
  id: string | number;
  fecha: string;
  historico: string;
  tipo: 'C' | 'D';
  moneda: CurrencyCode;
  valor_minor: string;
  origen: OrigenMovimiento;
  documento: string | null;
  caja_id: string | number;
  caja: string;
  transferencia_id: string | null;
}

export interface LibroCaja {
  movimientos: Movimiento[];
  /** Verdadeiro quando o limite cortou a lista: a tela precisa dizer isso. */
  truncado: boolean;
  limite: number;
}

export async function fetchMovimientos(
  token: string,
  empresaId: number,
  filtros: { cajaId?: string; desde?: string; hasta?: string } = {},
): Promise<LibroCaja> {
  const params = new URLSearchParams({ empresaId: String(empresaId) });
  if (filtros.cajaId) params.set('cajaId', filtros.cajaId);
  if (filtros.desde) params.set('desde', filtros.desde);
  if (filtros.hasta) params.set('hasta', filtros.hasta);

  const body = await apiGet<{ data: MovimientoRow[]; truncado: boolean; limite: number }>(
    `/libro-caja/movimientos?${params.toString()}`,
    token,
  );
  return {
    truncado: body.truncado,
    limite: body.limite,
    movimientos: body.data.map((row) => ({
      id: String(row.id),
      fecha: row.fecha,
      historico: row.historico,
      tipo: row.tipo,
      moneda: row.moneda,
      valorMinor: String(row.valor_minor),
      origen: row.origen,
      documento: row.documento,
      cajaId: String(row.caja_id),
      caja: row.caja,
      esTransferencia: row.transferencia_id !== null,
    })),
  };
}

export const ORIGEN_LABEL: Record<OrigenMovimiento, string> = {
  MA: 'Manual',
  CP: 'Cuenta por pagar',
  CC: 'Cuenta por cobrar',
  TR: 'Transferencia',
};

/* --- Consolidado ---------------------------------------------------------- */

interface PorMonedaRow {
  moneda: CurrencyCode;
  saldo_minor?: string;
  vencidos_minor?: string;
  proximos_7_minor?: string;
  proximos_15_minor?: string;
  proximos_30_minor?: string;
  entradas_minor?: string;
  salidas_minor?: string;
}

export interface ConsolidadoEmpresa {
  empresa: { id: number; razonSocial: string; nombreFantasia: string | null; monedaBase: CurrencyCode };
  /** Uma linha por caja: a tela soma por moeda, nunca entre moedas. */
  saldosCaja: Array<{ moneda: CurrencyCode; saldoMinor: string }>;
  cuentasPagar: Array<{ moneda: CurrencyCode; vencidosMinor: string; proximos30Minor: string }>;
  cuentasCobrar: Array<{ moneda: CurrencyCode; vencidosMinor: string; proximos30Minor: string }>;
  movimientosMes: Array<{ moneda: CurrencyCode; entradasMinor: string; salidasMinor: string }>;
}

export interface Consolidado {
  empresas: ConsolidadoEmpresa[];
  emptyReason: string;
}

export async function fetchConsolidado(token: string): Promise<Consolidado> {
  const body = await apiGet<{
    data: Array<{
      empresa: { id: string | number; razon_social: string; nombre_fantasia: string | null; moneda_base: CurrencyCode };
      saldosCaja: PorMonedaRow[];
      cuentasPagar: PorMonedaRow[];
      cuentasCobrar: PorMonedaRow[];
      movimientosMes: PorMonedaRow[];
    }>;
    emptyReason: string;
  }>('/reportes/consolidado', token);

  return {
    emptyReason: body.emptyReason,
    empresas: body.data.map((item) => ({
      empresa: {
        id: Number(item.empresa.id),
        razonSocial: item.empresa.razon_social,
        nombreFantasia: item.empresa.nombre_fantasia,
        monedaBase: item.empresa.moneda_base,
      },
      saldosCaja: item.saldosCaja.map((row) => ({ moneda: row.moneda, saldoMinor: String(row.saldo_minor ?? '0') })),
      cuentasPagar: item.cuentasPagar.map((row) => ({
        moneda: row.moneda,
        vencidosMinor: String(row.vencidos_minor ?? '0'),
        proximos30Minor: String(row.proximos_30_minor ?? '0'),
      })),
      cuentasCobrar: item.cuentasCobrar.map((row) => ({
        moneda: row.moneda,
        vencidosMinor: String(row.vencidos_minor ?? '0'),
        proximos30Minor: String(row.proximos_30_minor ?? '0'),
      })),
      movimientosMes: item.movimientosMes.map((row) => ({
        moneda: row.moneda,
        entradasMinor: String(row.entradas_minor ?? '0'),
        salidasMinor: String(row.salidas_minor ?? '0'),
      })),
    })),
  };
}
