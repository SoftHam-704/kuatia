import { formatMinorParts, fromMinorUnits, moneyTone } from '../design-system/format';
import type { CurrencyCode, MoneyInput } from '../design-system/format';
import { useI18n } from '../i18n/useI18n';

/* Nome da moeda por extenso (aria-label e tooltip). As chamadas t() ficam
   literais aqui para o teste de completude do i18n enxergar cada chave. */
function useCurrencyLabels(): Record<CurrencyCode, string> {
  const { t } = useI18n();
  return { PYG: t('Guaraní'), USD: t('Dólar estadounidense'), BRL: t('Real brasileño') };
}

/* Dinheiro na tela. Símbolo em tom secundário, centavos em tom secundário,
   sinal e cor sempre juntos. PYG nunca ganha centavos.

   `tone`:
   · `signed` — verde/vermelho pelo sinal. Só para valores em que o sinal é a
     informação: saldo de caixa, resultado do mês.
   · `plain`  — sem cor de sinal. Um vencido de ₲ 7.350.000 é um número positivo
     e pintá-lo de verde diria "está tudo bem", que é o oposto do fato.
   Zero é sempre discreto, nos dois casos. */
export function Money({
  minor,
  currency,
  tone = 'plain',
  big = false,
  className = '',
}: {
  minor: MoneyInput;
  currency: CurrencyCode;
  tone?: 'signed' | 'plain';
  big?: boolean;
  className?: string;
}) {
  const parts = formatMinorParts(minor, currency);
  const labels = useCurrencyLabels();
  const sign = moneyTone(fromMinorUnits(minor, currency));
  const modifier = sign === 'zero' ? 'ds-money--zero' : tone === 'signed' ? `ds-money--${sign}` : '';
  const classes = ['ds-money', modifier, big ? 'ds-money--big' : '', className].filter(Boolean).join(' ');

  return (
    <span className={classes} aria-label={`${parts.plain} ${labels[currency]}`}>
      {parts.sign}
      <span className="ds-money__symbol">{parts.symbol}</span>
      {parts.integer}
      {parts.decimals && <span className="ds-money__decimals">{parts.decimals}</span>}
    </span>
  );
}

/** Chip de moeda: todo total carrega a sua, sempre visível. */
export function CurrencyChip({ code }: { code: CurrencyCode }) {
  const labels = useCurrencyLabels();
  return (
    <span className={`ds-cur ds-cur--${code.toLowerCase()}`} title={labels[code]}>
      {code}
    </span>
  );
}
