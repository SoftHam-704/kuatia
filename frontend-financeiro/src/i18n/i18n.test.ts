/* =============================================================================
   i18n — TESTE DE COMPLETUDE E COMPORTAMENTO
   -----------------------------------------------------------------------------
   Lei 12 (war-game): este teste PRECISA poder ficar vermelho. Ele fica vermelho
   quando alguém escreve `t('Texto novo')` numa tela e esquece a entrada no
   dicionário pt-BR — ou quando apagam uma entrada que ainda tem chamada viva.

   A varredura é por regex sobre o código-fonte: por isso a regra de ouro é
   string literal em `t('...')` / `tMsg('...')`. String montada em runtime
   escapa daqui e vira buraco silencioso.
   ============================================================================ */

import { describe, expect, it, beforeEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLocale, setLocale } from './locale';
import { t, translate } from './translate';
import { PT_BR } from './pt-BR';
import { describeDueDate } from '../design-system/format';

const SRC_ROOT = fileURLToPath(new URL('..', import.meta.url));
const I18N_DIR = fileURLToPath(new URL('.', import.meta.url));
const SELF = fileURLToPath(import.meta.url);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry)) yield full;
  }
}

/* O módulo i18n em si não tem texto de tela — os exemplos vivem em comentários
   e seriam falsos positivos da varredura. */
function scannable(file: string): boolean {
  return file !== SELF && !file.startsWith(I18N_DIR);
}

/* Captura o primeiro argumento literal de t('...') e tMsg('...'). */
const CALL_RE = /\bt(?:Msg)?\(\s*'((?:[^'\\]|\\.)*)'/g;

describe('i18n — completude do dicionário pt-BR', () => {
  it('toda chave usada em t()/tMsg() no código existe no dicionário', () => {
    const missing = new Map<string, string[]>();
    for (const file of walk(SRC_ROOT)) {
      if (!scannable(file)) continue;
      const source = readFileSync(file, 'utf-8');
      for (const match of source.matchAll(CALL_RE)) {
        const key = match[1].replace(/\\'/g, "'");
        if (!(key in PT_BR)) {
          const rel = relative(SRC_ROOT, file);
          missing.set(key, [...(missing.get(key) ?? []), rel]);
        }
      }
    }
    expect(
      missing.size === 0,
      `Chaves sem tradução pt-BR:\n${[...missing.entries()].map(([k, files]) => `  '${k}'  ← ${files.join(', ')}`).join('\n')}`,
    ).toBe(true);
  });

  it('o dicionário não tem entradas órfãs (sem chamada viva no código)', () => {
    const used = new Set<string>();
    for (const file of walk(SRC_ROOT)) {
      if (!scannable(file)) continue;
      const source = readFileSync(file, 'utf-8');
      for (const match of source.matchAll(CALL_RE)) {
        used.add(match[1].replace(/\\'/g, "'"));
      }
    }
    const orphans = Object.keys(PT_BR).filter((key) => !used.has(key));
    expect(
      orphans.length === 0,
      `Entradas órfãs no dicionário (apagar ou religar):\n${orphans.map((k) => `  '${k}'`).join('\n')}`,
    ).toBe(true);
  });
});

describe('i18n — comportamento do idioma', () => {
  beforeEach(() => {
    setLocale('es-PY');
  });

  it('o padrão da casa é espanhol do Paraguai', () => {
    expect(getLocale()).toBe('es-PY');
    expect(t('Cuentas por pagar')).toBe('Cuentas por pagar');
  });

  it('pt-BR traduz e interpola variáveis', () => {
    setLocale('pt-BR');
    expect(t('Cuentas por pagar')).toBe('Contas a pagar');
    expect(t('Saldo de la cuota {n}: {valor}', { n: 2, valor: '₲ 100.000' })).toBe('Saldo da parcela 2: ₲ 100.000');
  });

  it('o que falta no dicionário cai no espanhol, nunca em branco', () => {
    setLocale('pt-BR');
    expect(translate('pt-BR', 'Texto que ninguém catalogou ainda')).toBe('Texto que ninguém catalogou ainda');
  });

  it('describeDueDate acompanha o idioma ativo', () => {
    const hoy = new Date().toISOString().slice(0, 10);
    setLocale('es-PY');
    expect(describeDueDate(hoy, hoy).text).toBe('Vence hoy');
    setLocale('pt-BR');
    expect(describeDueDate(hoy, hoy).text).toBe('Vence hoje');
  });
});
