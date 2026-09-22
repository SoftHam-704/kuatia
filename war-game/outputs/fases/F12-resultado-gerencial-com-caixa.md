# Relatório — F12: Apuração do Resultado Gerencial com Movimentos Manuais de Caixa

**Data:** 2026-09-22 · **Estado:** Concluído e verificado (E3) · **Método:** War Game SoftHam

---

## 1. O que foi feito

Esta fase eliminou a lacuna funcional e fronteira **B-04** (documentada na seção §7 de `contexto.md` e no capítulo 06 do manual): *"O resultado gerencial ignora lançamento manual de caixa. Classifica pelo valor_total das cuentas na emissão; um gasto lançado direto no livro caixa não aparece..."*.

Foi entregue a integração completa dos lançamentos manuais do Livro de Caixa (`movimientos_caja` com `origen = 'MA'`) que possuem conta contábil vinculada (`cuenta_plan_id IS NOT NULL`) no Demonstrativo do Resultado do Exercício (DRE) gerencial e no Cockpit MDI.

### Modificações Realizadas

1. **Domínio Puro (`backend-financeiro/src/domain/income-statement.ts`):**
   - Criada a função pura `calculateIncomeStatementTotals(rows)` com tipos estritos `IncomeStatementRow` e `IncomeStatementCurrencyTotal`.
   - Isolamento monetário absoluto: totalização de receitas (`Ingresos`), despesas (`Egresos`) e resultado líquido (`Resultado neto`) estritamente por moeda (`PYG`, `USD`, `BRL`), sem conversões cambiais cruzadas e operando em inteiros (`BigInt`) em minor units (`string`).
   - Testes unitários integrados em `tests/reports.test.ts` cobrindo cenários com mix de moedas, resultado positivo, negativo e neutro (39/39 testes backend passando).

2. **Rotas da API e Exportações:**
   - **`backend-financeiro/src/modules/reports/reports.routes.ts` (`GET /resultados`):**
     - Adicionado bloco `UNION ALL` na consulta SQL unindo `cuentas_pagar`, `cuentas_cobrar` e `movimientos_caja`.
     - Filtro estrito `m.origen = 'MA'` e `m.cuenta_plan_id IS NOT NULL`, evitando duplicidade com baixas de títulos (`CP`, `CC`) ou transferências internas (`TR`).
     - Cálculo de sinal conforme a natureza da conta contábil:
       `CASE WHEN (cp.naturaleza = 'D' AND m.tipo = 'D') OR (cp.naturaleza = 'R' AND m.tipo = 'C') THEN m.valor_minor ELSE -m.valor_minor END AS valor_minor`.
     - Retorno estendido da resposta contendo `data`, `totalesPorMoneda` e `emptyReason`.
   - **`backend-financeiro/src/modules/exports/exports.routes.ts` (`GET /exportaciones/reportes?tipo=RESULTADOS`):**
     - Alinhada a consulta de exportação em Excel e PDF com a mesma regra e união do endpoint de visualização.

3. **Cockpit Frontend MDI (`frontend-financeiro/src/screens/ResultadosScreen.tsx`):**
   - Código descompactado e reestruturado seguindo o padrão de design system (`ds-card`, `ds-filters`, `ds-table`).
   - Inclusão de grade de KPIs no topo (`ds-kpi-grid`) para cada moeda com movimentos no período:
     - Card **Ingresos** (`.ds-kpi--positive`).
     - Card **Egresos** (`.ds-kpi--negative`).
     - Card **Resultado neto** (`<Money tone="signed" />` com tom dinâmico positivo/negativo/accent).
   - Dicionário `pt-BR.ts` atualizado com as chaves `'Ingresos'`, `'Egresos'` e `'Resultado neto'`, verificado por `i18n.test.ts` (19/19 testes passando sem falhas e sem chaves órfãs).

4. **Sincronização com o Corpus da IRIS Global (`T:\IRIS Global`):**
   - `contexto.md`: riscada a fronteira §7 "O resultado gerencial ignora lançamento manual de caixa" e adicionada a entrada correspondente no histórico de versões.
   - `manual/06-flujo-y-resultados.md`: documentada a inclusão dos movimentos manuais com conta do plano, regras de descarte de transferências/baixas para evitar dupla contagem, e os novos indicadores de resultado líquido por moeda.
   - Validação com `check-corpus.js`: **0 erros**. Commit isolado `b73f36c` registrado na branch `main`.

---

## 2. Evidências de Execução (E3)

- **Backend Tests:** 39 passed (8 test files, 100% ok).
- **Backend Build:** `tsc -p tsconfig.json` compilado com zero erros.
- **Frontend Tests:** 19 passed (100% de completude do dicionário pt-BR, sem chaves órfãs).
- **Frontend Build:** `vite build` gerou pacote de produção em 915ms.
- **Corpus Integrity:** `node ferramentas/storin/check-corpus.js` passou com 0 erros.
- **Commit IRIS Global:** `b73f36c` gravado em `T:\IRIS Global`.

---

## 3. Estado das Fronteiras e Próximos Passos

Quatro lacunas funcionais e de produto foram eliminadas em sequência com conformidade absoluta ao War-Game:
- **F9:** Projeção de fluxo de caixa com saldo acumulado por moeda.
- **F10:** Cancelamento seguro de contas com trava de baixas e auditoria.
- **F11:** Carga inicial em lote por planilha (CSV e Excel .xlsx).
- **F12:** Apuração gerencial (DRE) integrando lançamentos manuais de caixa com KPIs por moeda.

Próximos passos recomendados:
1. **D-12:** Atualização de `bloqueio_ativo = 'N'` no master para o tenant 120 (Pinheirão).
2. **Avaliação das próximas fronteiras de §7:** (ex.: validação do DV do RUC paraguaio, persistência do estado da mesa MDI via router com URL, ou conciliação assistida de extratos).
