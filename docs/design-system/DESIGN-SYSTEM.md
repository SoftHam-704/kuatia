# Design System — Finanzas del Grupo (Paraguai)

Sistema de interface para o aplicativo financeiro multiempresa. Escrito para um cliente
que **nunca usou software de gestão** e opera hoje em planilha e papel, em espanhol
paraguaio, em guaraní sem centavos, com cinco empresas e três moedas.

**Arquivos**

| Arquivo | O que é |
| --- | --- |
| `frontend-financeiro/src/design-system/tokens.css` | Fundamentos: cor, tipografia, espaço, forma, movimento, densidade, tema escuro |
| `frontend-financeiro/src/design-system/components.css` | Biblioteca de componentes (`.ds-*`) |
| `frontend-financeiro/src/design-system/format.ts` | Formatação e validação de dinheiro, moeda, cotação e data |
| `frontend-financeiro/src/design-system/index.css` | Ponto de entrada único |
| `docs/design-system/showcase.html` | Demonstração viva: telas reais + todos os componentes |
| `docs/brand/logos.html` | Três conceitos de logotipo com prova de redução |

**Uso**

```ts
// main.tsx
import './design-system/index.css';
```

```tsx
import { formatMoney, formatDate, parseMoneyInput } from './design-system/format';

<td className="is-num ds-money">{formatMoney(cuota.valor, cuota.moneda)}</td>
```

Sem Tailwind, sem biblioteca de componentes, sem dependência nova: CSS puro com custom
properties, igual ao que o projeto já usa. Prefixo `ds-` para conviver com código legado.

---

## 1. Princípios

**1. O número manda.** Dinheiro é o conteúdo; o resto é moldura. Todo valor tem tipografia
tabular, alinhamento à direita e cor própria. Nenhum efeito visual compete com ele.

**2. O guaraní define a régua.** `₲ 1.500.000` — inteiro, agrupado por ponto, zero casas
decimais em qualquer tela, relatório ou exportação. Centavo em PYG é dado inventado.

**3. Cor tem significado fixo.** Azul é marca e ação. Verde é entrada, vermelho é saída,
âmbar é aviso. Não se decora com verde nem se pinta um botão de vermelho por estética.
E cor nunca é o único sinal: sempre acompanha texto, sinal ou marca de borda.

**4. Nada é digitado quando pode ser derivado.** Estado, saldo, vencido: tudo sai do dado.
O que o usuário pode escolher errado, ele escolhe errado.

**5. Zero mudo é proibido.** Toda tela vazia explica o motivo, e todo número diz de quando é.

**6. O celular é um cliente de primeira classe.** O dono confere saldo no telefone, à noite.
Tabela vira lista, alvo de toque tem 44 px, tema escuro existe.

---

## 2. Cor

### Marca e ação — Azul Tinta

Sóbrio de extrato bancário. É o único azul da interface: sidebar, botão primário, seleção,
foco.

| Token | Hex | Uso |
| --- | --- | --- |
| `--blue-900` | `#0c2a45` | Sidebar |
| `--blue-800` | `#123a5c` | Marca, ícone |
| `--blue-700` | `#17496f` | Ação primária (`--accent`) |
| `--blue-100` | `#dfeaf5` | Linha selecionada, borda de destaque |
| `--blue-50` | `#f1f6fb` | Fundo de aviso informativo |
| `--gold-500` | `#c8961e` | Acento de marca. **Nunca** representa dinheiro |

### Significado de valor

| Token | Hex | Significa |
| --- | --- | --- |
| `--positive` | `#0f7a46` | Ingreso, crédito, pagado, cobrado |
| `--negative` | `#b3261e` | Egreso, débito, vencido |
| `--warning` | `#a86f05` | Por vencer, parcial, incompleto |
| `--text-muted` | `#6f7d8d` | Cancelado, zero, sem dado |

O verde da marca não existe justamente para que verde signifique **uma coisa só**.

### Moedas

Cada moeda tem um chip discreto (`--cur-pyg`, `--cur-usd`, `--cur-brl`) para que num
consolidado ninguém leia PYG achando que é USD. O chip nunca substitui o símbolo do valor.

### Superfícies

`--bg-app` (fundo) → `--bg-surface` (card, tabela) → `--bg-sunken` (campo desabilitado,
rodapé de total). Borda faz o trabalho de separação; sombra só onde algo flutua.

### Tema escuro

`[data-theme="dark"]` no `<html>` troca os tokens semânticos. A sidebar tem tokens próprios
(`--sidebar-*`) porque é escura nos dois temas — nunca herda `--text-inverse`.

---

## 3. Tipografia

Inter (fallback: system-ui). Uma família só. O peso e o tamanho fazem a hierarquia.

| Token | px | Uso |
| --- | --- | --- |
| `--fs-4xl` | 36 | Saldo principal do painel |
| `--fs-3xl` | 28 | Valor de KPI |
| `--fs-2xl` | 22 | Título de tela |
| `--fs-xl` | 18 | Título de card / modal |
| `--fs-lg` | 16 | **Inputs** (abaixo disso o iOS dá zoom sozinho) |
| `--fs-md` | 14 | Corpo da interface |
| `--fs-sm` | 13 | Conteúdo de tabela |
| `--fs-xs` | 12 | Ajuda, metadado |
| `--fs-2xs` | 11 | Cabeçalho de coluna, chip |

**Regra dura:** todo número usa `font-variant-numeric: tabular-nums`. Já vem aplicado em
`.ds-num`, `.ds-money`, `.is-num`, `.ds-kpi__value` e nos inputs numéricos. Sem isso, a
coluna de valores não alinha e o olho não consegue comparar.

---

## 4. Dinheiro

### Formato por moeda

| Moeda | Decimais | Exemplo | Regra |
| --- | --- | --- | --- |
| PYG | 0 | `₲ 1.500.000` | Nunca decimais, nem na entrada |
| USD | 2 | `US$ 1.500,00` | Centavos em `.ds-money__decimals` (tom secundário) |
| BRL | 2 | `R$ 1.500,00` | Idem |

Separador de milhar `.`, decimal `,` (es-PY). Símbolo antes do número, com espaço.

### API de `format.ts`

```ts
formatMoney('1500000.0000', 'PYG')        // '₲ 1.500.000'
formatMoneyParts(v, 'USD')                // { sign, symbol, integer, decimals, plain }
formatAmount(v, 'PYG')                    // '1.500.000'  (coluna com moeda no cabeçalho)
formatSignedMoney(v, 'PYG', 'D')          // '− ₲ 500.000' (extrato)
moneyTone(v)                              // 'pos' | 'neg' | 'zero'
formatRate('7940', 'USD', 'PYG')          // '1 USD = 7.940 PYG'
parseMoneyInput('1.500,50', 'PYG')        // null → o guaraní não tem centavos
formatDate('2026-03-09')                  // '09/03/2026'
parseDateInput('09/03/2026')              // { iso: '2026-03-09', error: null }
describeDueDate(due, hoy)                 // 'Vencido hace 3 días' + tom
```

Dinheiro entra e sai como **string decimal canônica** (o que o driver `pg` devolve de um
`NUMERIC`) ou `bigint`. `number` só é aceito se for inteiro. Ponto flutuante em dinheiro não
é otimização, é bug adiado — e em guaraní o erro é de unidade inteira, não de centavo.

### Consolidado multimoeda

Um total que envolve mais de uma moeda **sempre** mostra: valor por empresa na moeda de
origem, cotação aplicada com a data, e o equivalente convertido. Cotação ausente vira
`.ds-badge--incompleto` na linha e um `.ds-alert--warning` no topo dizendo quanto ficou de
fora. Nunca se converte "por aproximação" para fechar o número.

---

## 5. Espaço, forma e movimento

- Base 4 px: `--sp-1` … `--sp-16`. Dentro de um card, `--sp-4`; entre seções, `--sp-5`/`--sp-6`.
- Raio: `--radius-md` (8) em controles, `--radius-lg` (12) em cards e tabelas, `--radius-xl` (16) em modais.
- Sombra: `xs` em cards, `md` em toast, `lg` em modal. Nada mais flutua.
- Movimento: 120–240 ms, `--ease-out`. Sem animação decorativa. `prefers-reduced-motion` zera tudo.
- Densidade: `[data-density="compact"]` reduz linha de 44 px para 36 px, para quem passa o dia na lista.

---

## 6. Componentes

| Classe | Quando usar |
| --- | --- |
| `.ds-app` / `.ds-sidebar` / `.ds-topbar` / `.ds-content` | Estrutura da aplicação |
| `.ds-company` | Trocador de empresa. Sempre visível, sempre com o nome por extenso |
| `.ds-btn--primary/secondary/ghost/danger/reversion` | Ações. Uma primária por tela |
| `.ds-field`, `.ds-input`, `.ds-select`, `.ds-money-input` | Formulários |
| `.ds-table` + `.is-num` / `.is-overdue` / `.is-due-soon` | Listas de dados |
| `.ds-table--cards` | A mesma tabela vira cartões abaixo de 720 px |
| `.ds-badge--abierto/parcial/vencido/pagado/cobrado/cancelado/incompleto` | Estado derivado |
| `.ds-kpi` | Números de topo do painel |
| `.ds-ledger` | Histórico de baixas (livro append-only) |
| `.ds-empty` | Resultado vazio — com o motivo |
| `.ds-alert` / `.ds-toast` | Aviso persistente / confirmação passageira |
| `.ds-cur` / `.ds-rate` | Moeda e cotação |

### Padrões de tela

**Painel.** KPI de saldo, a vencer, vencido, a cobrar. Cada card mostra a origem do número.
No topo, `.ds-asof` com a data e a hora do dado.

**Lista (Cuentas por Pagar/Cobrar).** Abas por estado com contador → filtros → tabela com
urgência marcada na borda esquerda → rodapé de total **por moeda**, separado por borda
dupla. Ação principal na própria linha.

**Baixa.** Saldo da parcela em destaque, aviso de que pagar menos é normal, campos de juros
e desconto opcionais, e o saldo restante calculado antes de confirmar. Ao lado, o histórico
em `.ds-ledger`: a reversão aparece riscada, apontando para a baixa original, e nada some.

**Consolidado.** Uma linha por empresa, moeda de origem, cotação com data, equivalente.
Total só das empresas convertidas, com aviso do que ficou fora.

---

## 7. Acessibilidade e resiliência

- Foco sempre visível (`--focus-ring`); nunca `outline: none` sem substituto.
- Alvo de toque mínimo de 44 px; 48 px de altura de linha no celular.
- Contraste mínimo AA (4.5:1) para texto e 3:1 para bordas de estado.
- Cor nunca é o único sinal: badge tem texto, linha vencida tem barra na borda, valor negativo tem sinal.
- Estilos de impressão inclusos: sidebar e ações somem, tabelas não quebram no meio.
- Idioma da interface: **espanhol**. Datas `dd/mm/aaaa`. Este documento é a única peça em português.

---

## 8. Checklist antes de dar uma tela por pronta

- [ ] Nenhum valor em PYG mostra casa decimal — inclusive no Excel exportado
- [ ] Toda coluna de valor é `.is-num` e alinha à direita
- [ ] Todo total mostra a moeda; nada soma moedas diferentes sem cotação visível
- [ ] Nenhum campo de estado é editável
- [ ] A tela diz de quando é o dado que mostra
- [ ] Resultado vazio explica o motivo
- [ ] Data inválida (ano fora de 2000–2100) é recusada com mensagem clara
- [ ] Existe caminho de estorno; não existe botão de excluir movimento com histórico
- [ ] Funciona a 360 px de largura e com o teclado, sem mouse
- [ ] Lançamento do caso comum leva menos de 15 segundos

---

## 9. Marca

Três conceitos em `docs/brand/`, todos derivados dos mesmos tokens:

| Conceito | Nome | Ideia |
| --- | --- | --- |
| A | **Kuatiá** (papel, registro) | O ₲ como selo de registro; o traço dourado é a barra do guaraní e o lombo do livro |
| B | **Aty** (reunião, grupo) | Cinco barras sobre uma base: as cinco empresas; a dourada é a que está ativa |
| C | **Syry** (fluir) | A corrente do caixa subindo, com o saldo projetado em ouro |

Abra `docs/brand/logos.html` para ver os três com lockup, versão em fundo escuro,
monocromática e prova de redução até 16 px.
