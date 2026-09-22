/* =============================================================================
   i18n — TRADUÇÃO
   -----------------------------------------------------------------------------
   `t(texto)` recebe o texto-fonte em espanhol (o que já está escrito na tela) e
   devolve o correspondente no idioma ativo. Interpolação com `{nome}`:

     t('Hay {n} cuentas en esta empresa', { n: cuentas.length })

   Regra de ouro: a chamada usa SEMPRE string literal entre aspas simples — o
   teste de completude (i18n.test.ts) varre o código atrás de `t('...')` e exige
   cada chave no dicionário pt-BR. String montada em runtime escapa da varredura
   e vira buraco silencioso de tradução.
   ============================================================================ */

import { getLocale } from './locale';
import type { Locale } from './locale';
import { PT_BR } from './pt-BR';

export type Vars = Record<string, string | number>;

export function translate(locale: Locale, text: string, vars?: Vars): string {
  let out = locale === 'pt-BR' ? (PT_BR[text] ?? text) : text;
  if (vars) {
    for (const [key, value] of Object.entries(vars)) {
      out = out.split(`{${key}}`).join(String(value));
    }
  }
  return out;
}

/** Versão não-React, para módulos fora de componente (format.ts, api.ts). */
export function t(text: string, vars?: Vars): string {
  return translate(getLocale(), text, vars);
}
