import { LOCALES, setLocale } from '../i18n/locale';
import { useI18n } from '../i18n/useI18n';

/* Seletor de idioma. Dois botões, sempre nomeados por extenso no `title` —
   o rótulo curto (ES/PT) é para quem já conhece; o `title` é para quem não
   conhece. `aria-pressed` comunica o estado sem depender de cor. */
export function LocaleSwitcher() {
  const { locale, t } = useI18n();
  const nombres: Record<string, string> = {
    'es-PY': t('Español (Paraguay)'),
    'pt-BR': t('Português (Brasil)'),
  };

  return (
    <span className="ds-locale" role="group" aria-label={t('Idioma')}>
      {LOCALES.map((item) => (
        <button
          key={item.code}
          type="button"
          className={`ds-locale__btn${locale === item.code ? ' is-active' : ''}`}
          aria-pressed={locale === item.code}
          title={nombres[item.code]}
          onClick={() => setLocale(item.code)}
        >
          {item.label}
        </button>
      ))}
    </span>
  );
}
