/* =============================================================================
   i18n — IDIOMA (store fora do React)
   -----------------------------------------------------------------------------
   · Padrão da casa: es-PY (Paraguai). pt-BR é opção do usuário, por dispositivo.
   · A preferência mora no `localStorage` — é gosto de quem opera, não dado do
     servidor. Sobrevive ao reload e não depende de login.
   · O espanhol é o idioma-fonte: fica escrito no código. O dicionário pt-BR só
     cobre o que difere; o que falhar cai no espanhol (fallback visível, nunca
     tela em branco).
   ============================================================================ */

export type Locale = 'es-PY' | 'pt-BR';

export const LOCALES: ReadonlyArray<{ code: Locale; label: string }> = [
  { code: 'es-PY', label: 'ES' },
  { code: 'pt-BR', label: 'PT' },
];

const STORAGE_KEY = 'kuatia_idioma';

function readStored(): Locale {
  try {
    if (typeof localStorage === 'undefined') return 'es-PY';
    return localStorage.getItem(STORAGE_KEY) === 'pt-BR' ? 'pt-BR' : 'es-PY';
  } catch {
    return 'es-PY';
  }
}

let current: Locale = readStored();
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return current;
}

export function setLocale(next: Locale): void {
  if (next === current) return;
  current = next;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* storage bloqueado não derruba a troca em memória */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  for (const listener of listeners) listener();
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/* O <html lang> acompanha a preferência desde o primeiro paint — leitor de
   tela e buscador leem o idioma certo mesmo antes de qualquer interação. */
if (typeof document !== 'undefined') document.documentElement.lang = current;
