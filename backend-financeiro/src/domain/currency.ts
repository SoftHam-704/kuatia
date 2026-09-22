export const SUPPORTED_CURRENCIES = ['PYG', 'USD', 'BRL'] as const;

export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

const decimalPlaces: Record<Currency, number> = {
  PYG: 0,
  USD: 2,
  BRL: 2,
};

export function assertMonetaryAmount(value: string, currency: Currency): void {
  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new Error('El valor monetario debe ser un número positivo en formato decimal.');
  }

  const [, decimals = ''] = value.split('.');
  if (decimals.length > decimalPlaces[currency]) {
    throw new Error(`${currency} admite como máximo ${decimalPlaces[currency]} decimales.`);
  }
}

export function formatMoney(value: number, currency: Currency, locale = 'es-PY'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: decimalPlaces[currency],
    maximumFractionDigits: decimalPlaces[currency],
  }).format(value);
}
