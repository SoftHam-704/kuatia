/* Hook React sobre o store de idioma. `useSyncExternalStore` faz todo
   componente que chama `useI18n()` re-renderizar na troca de idioma — sem
   provider, sem contexto, sem prop drilling. */

import { useSyncExternalStore } from 'react';
import { getLocale, setLocale, subscribeLocale } from './locale';
import { translate } from './translate';
import type { Vars } from './translate';

export function useI18n() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale);
  return {
    locale,
    setLocale,
    t: (text: string, vars?: Vars) => translate(locale, text, vars),
  };
}
