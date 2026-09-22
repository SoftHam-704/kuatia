/**
 * Regras puras de domínio para cancelamento de contas (pagar / cobrar).
 *
 * Invariante da Frota SoftHam:
 * 1. Conta já cancelada não pode ser re-cancelada.
 * 2. Conta com baixas ativas (pagamentos ou cobros vigentes com saldo aplicado > 0)
 *    NÃO pode ser cancelada sem prévio estorno (reversão) de todas as baixas.
 * 3. Após cancelamento, o compromisso e suas parcelas deixam de produzir saldo pendente.
 */

export function assertCanCancelAccount(params: {
  estado: string;
  activeBajasCount: number;
  tipo: 'pagar' | 'cobrar';
}): void {
  if (params.estado === 'CANCELADO') {
    throw new Error('La cuenta ya se encuentra cancelada.');
  }
  if (params.activeBajasCount > 0) {
    const operacion = params.tipo === 'pagar' ? 'pagos' : 'cobros';
    throw new Error(`No se puede cancelar una cuenta con ${operacion} aplicados. Debe revertir los ${operacion} primero.`);
  }
}

export function assertCanSettleInstallment(params: {
  cuentaEstado: string;
  cuotaEstado: string;
  tipo: 'pagar' | 'cobrar';
}): void {
  if (params.cuentaEstado === 'CANCELADO' || params.cuotaEstado === 'CANCELADO') {
    const operacion = params.tipo === 'pagar' ? 'un pago' : 'un cobro';
    throw new Error(`No se puede registrar ${operacion} en una cuenta o cuota cancelada.`);
  }
}
