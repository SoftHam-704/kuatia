/* =============================================================================
   Design System — Finanzas del Grupo (Paraguay)
   03 · FORMATO (dinero, monedas, fechas)
   -----------------------------------------------------------------------------
   Regras que este módulo garante, e que nenhuma tela pode contornar:
   · Dinheiro nunca vira `number`. Entra e sai como string decimal canônica
     (o que o driver `pg` devolve de um NUMERIC) ou como bigint de unidades
     mínimas. Ponto flutuante em dinheiro não é otimização, é bug adiado.
   · PYG não tem centavos: 0 casas decimais, sempre.
   · Formato es-PY: `.` separa milhar, `,` separa decimal.
   · Data sempre dd/mm/aaaa, com ano entre 2000 e 2100.
   ============================================================================ */

export type CurrencyCode = 'PYG' | 'USD' | 'BRL';

import { t } from '../i18n/translate';

export interface CurrencyMeta {
  code: CurrencyCode;
  /** Símbolo curto exibido antes do número. */
  symbol: string;
  /** Nome em espanhol, para leitores de tela e selects. */
  label: string;
  /** Casas decimais permitidas. PYG = 0. Não é configurável por tela. */
  decimals: 0 | 2;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyMeta> = {
  PYG: { code: 'PYG', symbol: '₲', label: 'Guaraní', decimals: 0 },
  USD: { code: 'USD', symbol: 'US$', label: 'Dólar estadounidense', decimals: 2 },
  BRL: { code: 'BRL', symbol: 'R$', label: 'Real brasileño', decimals: 2 },
};

const GROUP_SEPARATOR = '.';
const DECIMAL_SEPARATOR = ',';

/** Partes já formatadas, para estilizar os centavos em tom secundário. */
export interface MoneyParts {
  sign: '' | '-';
  symbol: string;
  integer: string;
  /** Vazio em PYG. Inclui o separador quando existe: `,50`. */
  decimals: string;
  code: CurrencyCode;
  /** Texto completo, pronto para `aria-label` ou exportação. */
  plain: string;
}

/** Aceita o que vem do banco (`"1500000.0000"`), um bigint ou um inteiro seguro. */
export type MoneyInput = string | bigint | number;

function toCanonical(value: MoneyInput): { negative: boolean; int: string; frac: string } {
  let raw: string;

  if (typeof value === 'bigint') {
    raw = value.toString();
  } else if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new TypeError(
        'formatMoney: `number` só é aceito se for inteiro. Use string ou bigint para valores com decimais.',
      );
    }
    raw = value.toString();
  } else {
    raw = value.trim();
  }

  if (raw === '') return { negative: false, int: '0', frac: '' };

  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;

  if (!/^\d*(\.\d*)?$/.test(unsigned)) {
    throw new TypeError(`formatMoney: valor monetário inválido: ${JSON.stringify(value)}`);
  }

  const [int = '0', frac = ''] = unsigned.split('.');
  return { negative, int: int === '' ? '0' : int, frac };
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR);
}

/**
 * Trunca ou completa a parte decimal conforme a moeda.
 * PYG nunca arredonda para centavo: a fração é descartada na exibição, mas o
 * cálculo continua no banco em NUMERIC. Se aparecer fração em PYG, é dado sujo
 * e a UI deve sinalizar — por isso `hasHiddenFraction`.
 */
function fitDecimals(frac: string, decimals: 0 | 2): { text: string; hasHiddenFraction: boolean } {
  const trimmed = frac.replace(/0+$/, '');
  if (decimals === 0) {
    return { text: '', hasHiddenFraction: trimmed.length > 0 };
  }
  const shown = (frac + '00').slice(0, 2);
  const hidden = trimmed.length > 2;
  return { text: DECIMAL_SEPARATOR + shown, hasHiddenFraction: hidden };
}

export function formatMoneyParts(value: MoneyInput, currency: CurrencyCode): MoneyParts {
  const meta = CURRENCIES[currency];
  const { negative, int, frac } = toCanonical(value);
  const { text: decimals } = fitDecimals(frac, meta.decimals);
  const integer = groupThousands(int);
  const sign = negative && !(int === '0' && decimals === '') ? '-' : '';

  return {
    sign,
    symbol: meta.symbol,
    integer,
    decimals,
    code: currency,
    plain: `${sign}${meta.symbol} ${integer}${decimals}`,
  };
}

/** `₲ 1.500.000` · `US$ 1.500,00` · `R$ -1.500,00` */
export function formatMoney(value: MoneyInput, currency: CurrencyCode): string {
  return formatMoneyParts(value, currency).plain;
}

/** Número sem símbolo, para colunas onde a moeda já está no cabeçalho. */
export function formatAmount(value: MoneyInput, currency: CurrencyCode): string {
  const parts = formatMoneyParts(value, currency);
  return `${parts.sign}${parts.integer}${parts.decimals}`;
}

/** Sinal explícito nos extratos: `+ ₲ 500.000` / `− ₲ 500.000`. */
export function formatSignedMoney(
  value: MoneyInput,
  currency: CurrencyCode,
  direction: 'C' | 'D',
): string {
  const parts = formatMoneyParts(value, currency);
  const prefix = direction === 'C' ? '+ ' : '− ';
  return `${prefix}${parts.symbol} ${parts.integer}${parts.decimals}`;
}

/** Classe do design system correspondente ao sinal do valor. */
export function moneyTone(value: MoneyInput): 'pos' | 'neg' | 'zero' {
  const { negative, int, frac } = toCanonical(value);
  const isZero = int.replace(/0/g, '') === '' && frac.replace(/0/g, '') === '';
  if (isZero) return 'zero';
  return negative ? 'neg' : 'pos';
}

/** Cotação: mostrada com até 6 casas, porque taxa não é dinheiro. */
export function formatRate(value: MoneyInput, from: CurrencyCode, to: CurrencyCode): string {
  const { negative, int, frac } = toCanonical(value);
  const decimals = frac.replace(/0+$/, '').slice(0, 6);
  const number = groupThousands(int) + (decimals ? DECIMAL_SEPARATOR + decimals : '');
  return `1 ${from} = ${negative ? '-' : ''}${number} ${to}`;
}

/* ---------------------------------------------------------------------------
   ENTRADA DO USUÁRIO
   ------------------------------------------------------------------------ */

/**
 * Converte o que foi digitado (`1.500.000`, `1500000`, `1.500,50`) em string
 * decimal canônica para enviar ao backend. Devolve `null` se não for um valor
 * válido para a moeda — a tela mostra o erro, o backend valida de novo.
 */
export function parseMoneyInput(input: string, currency: CurrencyCode): string | null {
  const meta = CURRENCIES[currency];
  const cleaned = input.trim().replace(/\s|\u00a0/g, '');
  if (cleaned === '') return null;

  const negative = cleaned.startsWith('-');
  let body = negative ? cleaned.slice(1) : cleaned;

  body = body.split(GROUP_SEPARATOR).join('');

  const decimalCount = (body.match(/,/g) ?? []).length;
  if (decimalCount > 1) return null;
  body = body.replace(DECIMAL_SEPARATOR, '.');

  if (!/^\d+(\.\d+)?$/.test(body)) return null;

  const [int, frac = ''] = body.split('.');
  if (meta.decimals === 0 && frac.replace(/0+$/, '') !== '') return null;
  if (meta.decimals === 2 && frac.length > 2) return null;

  const normalizedFrac = meta.decimals === 0 ? '' : frac.padEnd(2, '0');
  return `${negative ? '-' : ''}${int}${normalizedFrac ? '.' + normalizedFrac : ''}`;
}

/* ---------------------------------------------------------------------------
   UNIDADES MÍNIMAS — o formato em que a API transporta dinheiro
   -----------------------------------------------------------------------------
   O banco guarda `*_minor` em BIGINT: guaraníes inteiros em PYG, centavos em
   USD/BRL. Como BigInt não sobrevive a JSON, a API manda string de dígitos.
   Estas funções são a única ponte entre esse formato e a tela.
   ------------------------------------------------------------------------ */

function toMinorDigits(value: MoneyInput): { negative: boolean; digits: string } {
  const raw = typeof value === 'string' ? value.trim() : value.toString();
  if (raw === '') return { negative: false, digits: '0' };

  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  if (!/^\d+$/.test(unsigned)) {
    throw new TypeError(`Unidades mínimas inválidas: ${JSON.stringify(value)}`);
  }
  return { negative, digits: unsigned };
}

/** `'150050'` + USD → `'1500.50'` · `'1500000'` + PYG → `'1500000'`. */
export function fromMinorUnits(value: MoneyInput, currency: CurrencyCode): string {
  const { negative, digits } = toMinorDigits(value);
  const scale = CURRENCIES[currency].decimals;
  const sign = negative && digits.replace(/0/g, '') !== '' ? '-' : '';
  if (scale === 0) return `${sign}${digits}`;

  const padded = digits.padStart(scale + 1, '0');
  return `${sign}${padded.slice(0, -scale)}.${padded.slice(-scale)}`;
}

/** Inverso, para enviar ao backend: `'1500,50'` + USD → `'150050'`. */
export function toMinorUnits(input: string, currency: CurrencyCode): string | null {
  const canonical = parseMoneyInput(input, currency);
  if (canonical === null) return null;

  const scale = CURRENCIES[currency].decimals;
  const negative = canonical.startsWith('-');
  const [int, frac = ''] = (negative ? canonical.slice(1) : canonical).split('.');
  const digits = `${int}${frac.padEnd(scale, '0')}`.replace(/^0+(?=\d)/, '');
  return `${negative && digits.replace(/0/g, '') !== '' ? '-' : ''}${digits}`;
}

/** Atalho de exibição: unidades mínimas → `₲ 1.500.000`. */
export function formatMinor(value: MoneyInput, currency: CurrencyCode): string {
  return formatMoney(fromMinorUnits(value, currency), currency);
}

export function formatMinorParts(value: MoneyInput, currency: CurrencyCode): MoneyParts {
  return formatMoneyParts(fromMinorUnits(value, currency), currency);
}

/** `+ ₲ 500.000` / `− ₲ 500.000` a partir de unidades mínimas. */
export function formatSignedMinor(value: MoneyInput, currency: CurrencyCode, direction: 'C' | 'D'): string {
  return formatSignedMoney(fromMinorUnits(value, currency), currency, direction);
}

/** Zero de verdade — não confundir com "não há dado". */
export function isZeroMinor(value: MoneyInput): boolean {
  return toMinorDigits(value).digits.replace(/0/g, '') === '';
}

/* ---------------------------------------------------------------------------
   DATAS — dd/mm/aaaa, ano entre 2000 e 2100
   ------------------------------------------------------------------------ */

export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;

/** `2026-03-09` → `09/03/2026`. Aceita Date ou ISO. Nunca usa a data de hoje
 *  como substituto silencioso de um valor ausente. */
export function formatDate(value: string | Date | null | undefined): string {
  if (value == null || value === '') return '—';
  const iso = value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return '—';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** Timestamp do servidor → `09/03/2026 08:12`. A hora vem do dado, não do relógio. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (value == null || value === '') return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export interface DateParseResult {
  /** `aaaa-mm-dd` pronto para a API, ou `null` quando a entrada é inválida. */
  iso: string | null;
  /** Mensagem no idioma ativo, pronta para `.ds-field__error`. */
  error: string | null;
}

/** `09/03/2026` → `2026-03-09`, com validação de ano e de data existente. */
export function parseDateInput(input: string): DateParseResult {
  const cleaned = input.trim();
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(cleaned);
  if (!match) return { iso: null, error: t('Ingresá la fecha como dd/mm/aaaa.') };

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  if (year < MIN_YEAR || year > MAX_YEAR) {
    return { iso: null, error: t('El año debe estar entre {min} y {max}. Revisá el dato.', { min: MIN_YEAR, max: MAX_YEAR }) };
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  const exists =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!exists) return { iso: null, error: t('Esa fecha no existe en el calendario.') };

  const pad = (n: number) => String(n).padStart(2, '0');
  return { iso: `${year}-${pad(month)}-${pad(day)}`, error: null };
}

/** Vencimento em linguagem de quem opera: `Vence hoy`, `Vencido hace 3 días`. */
export function describeDueDate(dueISO: string, todayISO: string): { text: string; tone: 'neutral' | 'warning' | 'danger' } {
  const due = Date.parse(dueISO + 'T00:00:00Z');
  const today = Date.parse(todayISO + 'T00:00:00Z');
  if (Number.isNaN(due) || Number.isNaN(today)) return { text: '—', tone: 'neutral' };

  const days = Math.round((due - today) / 86_400_000);
  if (days === 0) return { text: t('Vence hoy'), tone: 'warning' };
  if (days === 1) return { text: t('Vence mañana'), tone: 'warning' };
  if (days > 1 && days <= 7) return { text: t('Vence en {n} días', { n: days }), tone: 'warning' };
  if (days > 7) return { text: t('Vence en {n} días', { n: days }), tone: 'neutral' };
  if (days === -1) return { text: t('Vencido ayer'), tone: 'danger' };
  return { text: t('Vencido hace {n} días', { n: Math.abs(days) }), tone: 'danger' };
}
