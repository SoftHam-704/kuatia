export function assertBusinessDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('La fecha debe usar el formato aaaa-mm-dd.');
  const [year, month, day] = value.split('-').map(Number);
  if (year < 2000 || year > 2100) throw new Error('El año de la fecha debe estar entre 2000 y 2100.');
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new Error('La fecha no es válida.');
  }
}

export function assertAllBusinessDates(...values: string[]): void {
  values.forEach(assertBusinessDate);
}

export function asMinorUnit(value: bigint): string {
  if (value < 0n) throw new Error('El importe no puede ser negativo.');
  return value.toString();
}
