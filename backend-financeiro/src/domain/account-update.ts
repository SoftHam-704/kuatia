/**
 * Regras puras de domínio para edição/atualização de contas (pagar / cobrar).
 *
 * Invariantes da Frota SoftHam:
 * 1. Conta cancelada não admite alteração.
 * 2. Se houver baixas ativas, data de vencimento não pode ser alterada diretamente
 *    (exige estornar baixas para evitar incoerência de datas financeiras).
 * 3. Metadados cadastrais (descripción, número de documento, conta do plano,
 *    centro de custo, observações, contraparte) podem ser atualizados em contas ativas.
 */

export function assertCanUpdateAccount(params: {
  estado: string;
  hasDueDateChange: boolean;
  activeBajasCount: number;
  tipo: 'pagar' | 'cobrar';
}): void {
  if (params.estado === 'CANCELADO') {
    throw new Error('No se puede modificar una cuenta cancelada.');
  }

  if (params.hasDueDateChange && params.activeBajasCount > 0) {
    const operacion = params.tipo === 'pagar' ? 'pagos' : 'cobros';
    throw new Error(`No se puede modificar el vencimiento de una cuenta con ${operacion} aplicados.`);
  }
}
