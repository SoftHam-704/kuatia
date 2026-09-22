# Relatório — F9: Fluxo de caixa com saldo inicial e acumulado

**Data:** 2026-09-22 · **Estado:** Concluído e verificado (E3) · **Método:** War Game SoftHam

---

## 1. O que foi feito

Esta fase atacou a principal lacuna funcional de liquidez do Kuatiá (antiga fronteira §7 do `contexto.md` e capítulo 06 do manual), além de eliminar alertas de concorrência no cliente PostgreSQL.

Anteriormente, a rota `/reportes/flujo-caja` e a tela `FlujoScreen.tsx` listavam apenas os vencimentos previstos entre duas datas (`desde` e `hasta`). O operador não sabia se o saldo em caixa e banco cobriria os pagamentos de uma data específica sem somar manualmente os saldos do Painel com os vencimentos.

### Modificações Realizadas

1. **Domínio Puro (`backend-financeiro/src/domain/cashflow.ts`):**
   - Função pura `projectCashflow` que recebe `initialBalances` por moeda e a lista de vencimentos ordenados por data.
   - Preserva isolamento absoluto entre moedas (`PYG`, `USD`, `BRL`). Nunca cruza ou soma moedas.
   - Calcula `neto_minor = cobrar_minor - pagar_minor` e projeta `saldo_acumulado_minor = saldo_acumulado_anterior + neto_minor` em aritmética inteira de alta precisão (`BigInt`).

2. **Testes Unitários de Domínio (`backend-financeiro/tests/reports.test.ts`):**
   - Cenário com saldo inicial positivo projetando saldo acumulado ao longo de datas e múltiplos vencimentos.
   - Cenário com múltiplas moedas concorrentes sem contaminação entre saldos.
   - 27/27 testes do backend passando.

3. **Correção de Concorrência no PoolClient & Cálculo do Saldo Inicial (`reports.routes.ts`):**
   - Eliminado o aviso do Node.js: `DeprecationWarning: Calling client.query() when the client is already executing a query`. Todas as consultas compartilhando a mesma transação/cliente com tenant context foram convertidas para execução estritamente sequencial (`await client.query(...)`).
   - Implementado cálculo do saldo prévio em caixas e bancos até o dia anterior a `desde` (`saldo_inicial_minor` de cada caixa cadastrada mais a soma de créditos menos débitos registrados em `movimientos_caja` com data menor que `desde`).
   - Resposta da API agora retorna `data: CashflowItem[]` com `neto_minor` e `saldo_acumulado_minor`, além de `saldosIniciales: Record<CurrencyCode, string>`.

4. **Exportações Excel e PDF (`exports.routes.ts`):**
   - Atualizado o gerador de fluxo de caixa em planilhas XLSX e relatórios PDF para incluir as colunas `Neto` e `Saldo acumulado`.
   - Corrigido typo no nome da tabela (`movimentos_caja` corrigido para `movimientos_caja`).

5. **Interface do Usuário (Cockpit MDI - `FlujoScreen.tsx`):**
   - Grade de cartões de KPI no topo da tela exibindo o `Saldo inicial` em caixas e bancos para cada moeda ativa.
   - Tabela com coluna `Saldo acumulado` formatada com `<Money tone="signed" />`, destacando em tom negativo (vermelho) quando o fluxo projetado fica descoberto.
   - Adicionada chave `'Saldo acumulado': 'Saldo acumulado'` ao dicionário `pt-BR.ts` preservando integridade estrita exigida por `i18n.test.ts`.

6. **Sincronização com o Corpus da IRIS Global (`T:\IRIS Global`):**
   - Atualizado `T:\IRIS Global\softham-corpus\products\kuatia\contexto.md`: marcada fronteira §7 como resolvida e atualizada a tabela de histórico.
   - Atualizado `T:\IRIS Global\softham-corpus\products\kuatia\manual\06-flujo-y-resultados.md`: capítulo 06 atualizado explicando a projeção de saldo acumulado.
   - Validação com `check-corpus.js`: 0 erros de consistência.

---

## 2. Evidências de Execução (E3)

- **Backend Tests:** 27 passed (7 test files, 100% ok).
- **Backend Build:** `tsc -p tsconfig.json` concluído com zero erros.
- **Frontend Tests:** 19 passed (incluindo teste de completude e ausência de órfãos do `i18n.test.ts`).
- **Frontend Build:** `vite build` gerou pacote de produção em 917ms.
- **E2E API Test:** Execução contra banco real com token de operador retornou HTTP 200 com saldos iniciais calculados e saldo acumulado projetado.
- **Corpus Integrity:** `node ferramentas/storin/check-corpus.js` passou com 0 erros.

---

## 3. Estado das Fronteiras e Próximos Passos

A fronteira de "O fluxo de caixa não projeta saldo" deixa formalmente de existir.

Próximos passos recomendados no Kuatiá:
1. **D-12:** Atualização de `bloqueio_ativo = 'N'` no master para a empresa 120 (decisão humana pendente no ledger).
2. **Paginação e filtros avançados** nas contas a pagar/receber caso o volume cresça.
3. **Importação assistida de faturas/XML** e conciliação bancária inicial.
