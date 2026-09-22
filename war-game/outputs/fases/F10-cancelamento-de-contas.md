# Relatório — F10: Cancelamento de contas a pagar e a receber

**Data:** 2026-09-22 · **Estado:** Concluído e verificado (E3) · **Método:** War Game SoftHam

---

## 1. O que foi feito

Esta fase eliminou a lacuna funcional **B2** (anteriormente listada na §7 das Fronteiras em `contexto.md` e nos manuais 03 e 04): *"Não cancela conta. Não há rota que marque uma cuenta ou cuota como CANCELADO"*.

Compromissos financeiros registrados incorretamente ou que deixaram de ser devidos agora podem ser cancelados formalmente, mantendo rastreabilidade e integridade com o Livro-Caixa.

### Modificações Realizadas

1. **Domínio Puro (`backend-financeiro/src/domain/cancellation.ts`):**
   - Função `assertCanCancelAccount`: valida se a conta já está cancelada e se possui baixas ativas vigentes (`activeBajasCount > 0`), rejeitando com mensagem clara antes de qualquer mutação.
   - Função `assertCanSettleInstallment`: impede que contas ou parcelas canceladas recebam pagamentos ou recebimentos.
   - Testes unitários puros em `backend-financeiro/tests/cancel-account.test.ts` (9 testes, 100% passando).

2. **Rotas de Negócio e Transacionalidade (`payables.routes.ts` e `receivables.routes.ts`):**
   - Adicionadas rotas `POST /cuentas-pagar/:id/cancelar` e `POST /cuentas-cobrar/:id/cancelar`.
   - Consulta `FOR UPDATE` para travamento de concorrência.
   - Validação contra `bajas_*` ativas (se houver baixas não estornadas, a API rejeita exigindo que o operador reverta a baixa primeiro para não gerar furo no caixa).
   - Atualização atômica de `estado = 'CANCELADO'` em `cuentas_*` e em todas as `cuotas_*` vinculadas.
   - Registro imutável de evento em `auditoria_eventos` (`action: 'CANCELAR'`, gravando código do operador, motivo e valores originais).
   - Atualização das rotas de listagem (`GET /`) e detalhe (`GET /:id/detalle`) para devolver `estado = 'CANCELADO'` e zerar o saldo pendente derivado para contas canceladas.

3. **Interface do Usuário (Cockpit MDI - `CuentasScreen.tsx` e `CuentaDetail.tsx`):**
   - Modal `CuentaDetail.tsx`: exibe badge visual `Cancelada` no cabeçalho, aviso informativo de conta cancelada, oculta botões de pagamento e exibe o botão **Cancelar cuenta** (habilitado apenas se não houver pagamentos vigentes).
   - Listagem `CuentasScreen.tsx`: adicionada a opção **Canceladas** no filtro de estado, ocultando contas canceladas das visões de "Con saldo" e "Solo vencidas".
   - Integridade de i18n em `pt-BR.ts`: dicionário bilíngue atualizado (`'Cancelar cuenta'`, `'Cancelando…'`, `'Cancelada'`, `'Canceladas'`), mantendo conformidade com o validador `i18n.test.ts`.

4. **Sincronização com o Corpus da IRIS Global (`T:\IRIS Global`):**
   - `contexto.md`: marcada fronteira §7 como resolvida e atualizada tabela de histórico.
   - `manual/03-cuentas-por-pagar.md`: criada seção sobre cancelamento de conta e atualizada a lista de limitações.
   - `manual/04-cuentas-por-cobrar.md`: atualizada lista de limitações apontando para o procedimento de cancelamento.
   - Validação com `check-corpus.js`: **0 erros**. Commit `38f9aeb` registrado no repositório canônico.

---

## 2. Evidências de Execução (E3)

- **Backend Tests:** 36 passed (8 test files, 100% ok).
- **Backend Build:** `tsc -p tsconfig.json` concluído com zero erros.
- **Frontend Tests:** 19 passed (100% de completude do dicionário pt-BR, sem chaves órfãs).
- **Frontend Build:** `vite build` gerou pacote de produção em 923ms.
- **Corpus Integrity:** `node ferramentas/storin/check-corpus.js` passou com 0 erros.

---

## 3. Estado das Fronteiras e Próximos Passos

As fronteiras de "O fluxo de caixa não projeta saldo" (F9) e "Não cancela conta" (F10) estão formalmente resolvidas no código, nos testes e no Corpus.

Próximos passos recomendados no Kuatiá:
1. **B3:** Habilitar upload direto de arquivo XLSX na tela de importações (carga em lote de compras/vendas).
2. **D-12:** Atualização de `bloqueio_ativo = 'N'` no master para a empresa 120 (decisão humana pendente no ledger).
