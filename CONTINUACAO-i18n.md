# CONTINUAÇÃO — i18n es-PY (padrão) + pt-BR (opção)

> Deixado por Kimi (sessão Kimi Work) a pedido do Hamilton, 22/08/2026, pausa para almoço.
> **Trabalho acontecendo na cópia:** `C:\Users\Systems\Documents\kimi\workspace\Financeiro`
> O original em `E:\Sistemas_ia\Financeiro` **ainda não foi tocado** — sincronizar de volta só
> depois da prova ponta a ponta, com o Hamilton de acordo.

---

## 1. Estado exato

**Baseline (antes de mexer):** backend `tsc` + 12 testes ✅ · frontend build + 13 testes ✅

**Ambiente desta máquina (armadilha resolvida):** o `npm` não está no PATH do Git Bash e falha
com `ERR_INVALID_ARG_TYPE` no postinstall do esbuild. Antes de qualquer comando npm:

```bash
export PATH="/c/Program Files/nodejs:$PATH"
export ComSpec='C:\Windows\System32\cmd.exe'
```

(Node 22.19.0 + npm 10.9.3 em `C:\Program Files\nodejs`.)

## 2. A arquitetura do i18n (decidida, não redesenhar)

- **Espanhol é o idioma-fonte e fica escrito no código.** `t('Cuentas por pagar')` devolve
  pt-BR quando o idioma ativo é pt-BR; em es-PY devolve o próprio texto. Sem chave artificial.
- `src/i18n/locale.ts` — store fora do React. Padrão `es-PY`, persiste em
  `localStorage['kuatia_idioma']`, atualiza `<html lang>`. Guardado contra `localStorage`
  ausente porque os testes rodam em ambiente node (sem DOM).
- `src/i18n/pt-BR.ts` — dicionário chave-espanhol → valor-português (~300 entradas).
- `src/i18n/translate.ts` — `t(texto, {vars})` com interpolação `{nome}`.
- `src/i18n/useI18n.ts` — hook via `useSyncExternalStore`: trocar o idioma re-renderiza
  tudo, sem provider.
- `src/components/LocaleSwitcher.tsx` — seletor ES/PT (classe `.ds-locale`, adicionada em
  `design-system/components.css`, com regra extra em `.ds-login__brand .ds-locale`).

### ⚠️ Convenção que NÃO pode quebrar

- **Render (JSX):** `const { t } = useI18n();` — precisa re-renderizar na troca de idioma.
- **Dentro de `useCallback`/`useEffect`/handlers memoizados:** usar `import { t as tMsg } from '../i18n/translate'`.
  O `t` do hook vira closure velha dentro de callback memoizado (deps não incluem `t`).
  Já aplicado em `AppShell`, `PanelScreen`, `CuentasScreen`.
- **Sempre string literal em `t('...')`/`tMsg('...')`** — o teste de completude varre o
  código com regex atrás dessas chamadas. String montada em runtime escapa da varredura.
- Títulos de janela do Cockpit ficam em espanhol no estado (`janela.title`) e são
  traduzidos **na renderização** (`t(janela.title)`) — assim re-traduzem ao trocar o idioma.

## 3. O que já está refatorado

- [x] `design-system/format.ts` (erros de data + `describeDueDate`)
- [x] `lib/api.ts` (3 mensagens de erro)
- [x] `app/AppShell.tsx` (nav, trocador de empresa, topbars, estados vazios, `Grupo {id}`)
- [x] `app/Cockpit.tsx` (janelas, launcher, dock, confirmação de fechar)
- [x] `components/StatusBar.tsx` (data/hora por extenso via `toLocaleDateString(locale)`)
- [x] `components/Modal.tsx` · `components/Money.tsx` (labels de moeda no a11y)
- [x] `screens/LoginScreen.tsx` (+ LocaleSwitcher no cartão de login)
- [x] `screens/PanelScreen.tsx` (completo)
- [ ] `screens/CuentasScreen.tsx` — **PAREI AQUI, no meio.** Feito: header, erros, KPIs,
      filtros, estados vazios. **Falta: a tabela de contas** (cabeçalhos Vencimiento/
      Descripción/Moneda/Total/Saldo/Avance/Estado/Acción, células, botão Detalle/Pagar/
      Cobrar, `estadoVisual` já recebe `t` como parâmetro, rodapé do card).

## 4. O que falta (nesta ordem)

1. Terminar `CuentasScreen.tsx` (tabela + rodapé)
2. `CajasScreen.tsx` · `ConsolidadoScreen.tsx` · `FlujoScreen.tsx` · `ResultadosScreen.tsx`
3. `ContrapartesScreen.tsx` · `ConfiguracionScreen.tsx` · `EmpresasScreen.tsx` ·
   `UsuariosScreen.tsx` · `AuditoriaScreen.tsx` (DateTimeFormat 'es-PY' → locale) ·
   `ImportacionesScreen.tsx`
4. `components/CuentaForm.tsx` · `BajaForm.tsx` · `CajaActionForm.tsx` · `CuentaDetail.tsx`
   (títulos de Modal já chegam traduzidos se embrulhados com `t()` na chamada)
5. `lib/operations.ts` — só `ORIGEN_LABEL`: traduzir no uso, `t(ORIGEN_LABEL[row.origen])`

## 5. Verificação (as leis mandam)

- **Teste de completude** (`src/i18n/i18n.test.ts`, a criar): varrer `src/**` atrás de
  `\bt(Msg)?\('...'` e exigir cada chave em `PT_BR` — Lei 12: apagar uma entrada do
  dicionário tem que deixar o teste vermelho. Testar também: padrão é es-PY, `setLocale`
  persiste e notifica, fallback devolve o espanhol, `describeDueDate` fala português em pt-BR.
- `npx vitest run` + `npm run build` verdes.
- **Prova de verdade (Lei 1/2/8):** subir `npm run dev`, abrir no navegador, trocar ES→PT,
  conferir a tela E o console. Build verde não é prova.

## 6. Depois do verde

- Sincronizar a cópia de volta para `E:\Sistemas_ia\Financeiro` (com o Hamilton).
- Não esquecer: o dicionário pt-BR é o lugar de qualquer texto novo daqui pra frente.

---

## SELLO DE CIERRE — 22/08/2026 ~14h50 (Kimi)

**i18n CONCLUÍDO E PROVADO.**

- Refactor completo: todas as telas (`screens/`), componentes (`components/`), `app/`,
  `design-system/format.ts`, `lib/api.ts` usando `t()`/`tMsg()` com strings literais.
- `i18n/i18n.test.ts` criado: varredura de completude (toda chave `t('...')` tem entrada
  pt-BR + sem órfãs) + comportamento (padrão es-PY, interpolação, fallback, describeDueDate).
  Ficou vermelho durante o desenvolvimento e foi fechado de verdade (Lei 12 ✅).
  Pontos dinâmicos (nav, TEXTOS, moedas, ORIGEN) convertidos para mapas literais.
- Verde: frontend tsc + 19 testes + build ✅ · backend tsc + 12 testes ✅ (intocado).
- Prova ponta a ponta no navegador (Playwright headless, `prova-i18n.py`): login em es-PY
  por padrão, troca ES→PT traduz tudo, sobrevive a reload, `<html lang>` acompanha,
  console limpo. Capturas: `prova-i18n-1-es.png`, `prova-i18n-2-pt.png`.
- Instalado: `@types/node` (dev, frontend) e Playwright no Python gerenciado.

**PENDENTE:** sincronizar de volta para `E:\Sistemas_ia\Financeiro` — só com o Hamilton
de acordo. Bloqueadores de lançamento (não-código) seguem: TLS, JWT_SECRET, chaves de IA,
backup. Requisito de sobrevivência pendente de código: importação de planilha.
