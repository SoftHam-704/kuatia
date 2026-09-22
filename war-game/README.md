# War Game — Kuatiá

> Planejamento da rodada "Blindagem crítica + entrada no Corpus".
> Método: [[PLY-004]] (Corpus SoftHam). **Metade 1 concluída. Nada foi implementado.**

## Estado

| | |
|---|---|
| **Fases fechadas** | F0, F1, F2, F3, F5, F6, F7, F8, F9 ✅ · F4 ⚠️ parcial (TLS pendente) |
| **Fase atual** | — F9 concluída (Fluxo de caixa com saldo inicial e acumulado) |
| **No Corpus** | `products/kuatia/contexto.md` + `manual/` com **9 capítulos** (atualizados em F9 com a projeção de saldo). `check-corpus.js` sem erros. |
| **Versão do plano** | `v1` (2026-08-11) · F9 (2026-09-22) |
| **RLS** | ✅ Ativo desde 2026-08-11. O app conecta como `kuatia_adm` (`NOSUPERUSER NOBYPASSRLS`); teste de vazamento com tenant inexistente devolve 0 linhas. |
| **Schema** | ✅ Dados do tenant em `pinheirao`; `public` só com o comum. Ver [`outputs/fases/F6-schema-do-tenant.md`](outputs/fases/F6-schema-do-tenant.md). |
| **Provisionamento** | ✅ `npm run migrate:tenant -- <schema>`. Provado criando um tenant do zero e comparando objeto a objeto com o Pinheirão. Ver [`F7`](outputs/fases/F7-provisionamento-de-tenant.md). |
| **Fluxo de Caixa** | ✅ Projeção com saldo inicial e acumulado por moeda. Ver [`F9`](outputs/fases/F9-flujo-caja-saldo-acumulado.md). |
| **Aberto** | L-05 (pools × Pgpool) · L-06 (nó fixo em vez do Pgpool) · D-09 (TLS) · D-12 (`bloqueio_ativo` no master) |
| **Repositório** | Git ativo e pareado: `https://github.com/SoftHam-704/kuatia.git` (`main`) |

Relatório das fases executadas: [`outputs/fases/F0-F4-relatorio.md`](outputs/fases/F0-F4-relatorio.md) · [`outputs/fases/F9-flujo-caja-saldo-acumulado.md`](outputs/fases/F9-flujo-caja-saldo-acumulado.md)

## Onde paramos — 2026-08-11, fim do dia

**No ar e provado:** blindagem crítica · RLS aplicado de fato (`kuatia_adm`) · schema por tenant ·
provisionamento por comando · Corpus publicado e commitado · faixa de data no banco · `JWT_SECRET`
próprio · login corrigido e medido · sidebar colapsável (só < 1024px) · **cockpit MDI** com o Panel
como moldura, dock, `Ctrl+M` e `Alt+1..9`.

**Serviços de desenvolvimento ficaram rodando:** backend em `:3001`, Vite em `:5173`.
Login: documento `01524628000259` · `hamilton` / `silva` / `admin123`.

**Esperando você:**
- `D-12` — o `UPDATE` do `bloqueio_ativo` no master (SQL pronto no ledger). O filtro no app está
  escrito e **desligado** para não trancar o Pinheirão para fora.
- `ADR-0020` — a decisão sobre o modal da IRIS (rascunho em `docs/pendente/`).

**Próximo passo técnico, na minha ordem:**
1. Povoar o sistema com um cenário real — sem dado, não dá para julgar visual nem medir volume
2. Router — sem URL, recarregar perde a mesa inteira de janelas
3. Telas marcarem `dirty`, senão a proteção de fechar janela é decorativa
4. StatusBar entrar no dock no modo desktop (hoje só aparece no mobile)

---

## Arquivos

| Arquivo | O que é |
|---|---|
| `WAR-GAME.md` | **Fonte normativa única.** Fases, riscos, critérios de saída e aborto. Quem executar lê este. |
| `ledger.md` | O que não sei e que muda o plano. Decisões `D-*` tomadas e pendentes. |
| `success.md` | Régua de qualidade do próprio plano + os NÃOs respeitados. |
| `versions/` | Revisões do plano. **Nunca sobrescrever versão boa.** |
| `checkpoints/` | Cópias de segurança (ex.: `.env` original). **Fora do git.** |
| `outputs/fases/` | Relatório de cada fase executada. Um arquivo por fase. |
| `risks/` | Atualizações da tabela de riscos conforme a execução revela realidade. |

## Ordem de leitura para quem chega agora

1. `WAR-GAME.md` §0 (preâmbulo) e §7 (caminho crítico) — 3 minutos, dá o mapa
2. `ledger.md` — o que está bloqueado e por quê
3. `WAR-GAME.md` §8 — só a fase que você vai executar
4. `WAR-GAME.md` §9 — a tabela de riscos, **antes** de improvisar qualquer coisa

## As três travas do método

- **Gate humano.** Toda decisão `D-*` é do Hamilton. A IA nunca se autoaprova (ADR-0001).
- **Anti-loop.** Uma versão + uma revisão crítica + parar. Não refinar ao infinito.
- **Versionar.** `versions/war-game-v1.md`, `v2`, `v3-approved`… Rollback é voltar de arquivo.

## Regra de ouro — toda fase termina com

1. relatório em `outputs/fases/` · 2. `ledger.md` atualizado · 3. este `README.md` atualizado ·
4. riscos atualizados · 5. próximo passo recomendado · 6. **parada antes da próxima fase.**
