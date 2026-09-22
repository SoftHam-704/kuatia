export function splitMinorAmount(total: bigint, installments: number): bigint[] {
  if (total < 0n || !Number.isInteger(installments) || installments < 1) throw new Error('Parámetros de cuotas inválidos.');
  const count = BigInt(installments);
  const base = total / count;
  const remainder = total % count;
  return Array.from({ length: installments }, (_, index) => base + (BigInt(index) < remainder ? 1n : 0n));
}

export function assertInstallmentsTotal(total: bigint, installments: readonly bigint[]): void {
  if (!installments.length || installments.some((value) => value < 0n)) throw new Error('Cuotas inválidas.');
  if (installments.reduce((sum, value) => sum + value, 0n) !== total) throw new Error('La suma de las cuotas debe coincidir exactamente con el total.');
}
