# Relatório — F11: Importação de Planilhas em Lote (Carga Inicial)

**Data:** 2026-09-22 · **Estado:** Concluído e verificado (E3) · **Método:** War Game SoftHam

---

## 1. O que foi feito

Esta fase eliminou a lacuna funcional **B3** (anteriormente documentada na seção §7 das Fronteiras em `contexto.md` e no manual 07): *"Não importa planilha. A carga inicial de clientes, fornecedores e contas em aberto é manual, um registro por vez..."*.

Foi entregue a capacidade completa de ingestão em lote de clientes/fornecedores (`CONTRAPARTES`) e contas em aberto com saldos legados (`CUENTAS_PAGAR` e `CUENTAS_COBRAR`), suportando tanto arquivos **CSV** quanto pastas de trabalho **Excel (.xlsx)** diretamente no Cockpit MDI.

### Modificações Realizadas

1. **Domínio e Utilitários (`backend-financeiro/src/domain/spreadsheet-import.ts`):**
   - Implementado `parseXlsxBuffer(buffer: Buffer): Promise<string>` utilizando o `ExcelJS` (dependência de produção existente), permitindo carregar arquivos `.xlsx` nativamente no backend e convertendo-os em representação estruturada com validação de datas e valores humanos por moeda.
   - Implementadas as funções geradoras de modelos:
     - `generateTemplateCsv(tipo: TipoPlanilla): string`
     - `generateTemplateXlsx(tipo: TipoPlanilla): Promise<Buffer>`
   - Criados testes unitários dedicados em `tests/spreadsheet-import.test.ts` validando a geração e re-ingestão de planilhas para todos os tipos (15/15 testes passando).

2. **Rotas da API (`backend-financeiro/src/modules/imports/imports.routes.ts`):**
   - Atualizado `planillaSchema` com a função `resolveCsvContent`: aceita tanto texto puro (`csv`) quanto arquivo codificado em base64 (`archivoBase64`), viabilizando o upload direto de arquivos `.xlsx` sem inflar o bundle do frontend.
   - Criada rota `GET /importaciones/planilla/plantilla`: download dinâmico de modelos em formato CSV ou Excel (.xlsx) com cabeçalhos e exemplos válidos.
   - Mantida e comprovada a idempotência por hash SHA-256 e gravação em `auditoria_eventos`.

3. **Cockpit Frontend MDI (`frontend-financeiro/src/screens/ImportacionesScreen.tsx`):**
   - Adicionada navegação por abas: `Carga inicial por planilha`, `Compra desde XML electrónico` e `Extractos bancarios`.
   - Seletor de tipo de cadastro: Clientes/Proveedores, Cuentas por Pagar, Cuentas por Cobrar.
   - Botões de download do modelo em Excel (.xlsx) e CSV (.csv).
   - Upload com leitura de arquivo (.xlsx e .csv) e renderização imediata do painel de conferência.
   - Painel de validação linha a linha: exibição clara de linhas válidas (verde) e linhas com erro (vermelho) com lista descritiva dos motivos de falha.
   - Botão de confirmação de linhas válidas e feedback completo da importação.
   - Dicionário `pt-BR.ts` atualizado e validado por `i18n.test.ts` (19/19 testes passando sem falhas nem chaves órfãs).

4. **Sincronização com o Corpus da IRIS Global (`T:\IRIS Global`):**
   - `contexto.md`: eliminada fronteira §7 "Não importa planilha" e atualizado histórico de versões.
   - `manual/07-importaciones.md`: documentada a carga inicial por planilha, regras de preenchimento, modelos e tratamento de erros linha a linha.
   - Validação com `check-corpus.js`: **0 erros**. Commit `3795a10` registrado na branch `main`.

---

## 2. Evidências de Execução (E3)

- **Backend Tests:** 38 passed (8 test files, 100% ok).
- **Backend Build:** `tsc -p tsconfig.json` compilado com zero erros.
- **Frontend Tests:** 19 passed (100% de completude do dicionário pt-BR, sem chaves órfãs).
- **Frontend Build:** `vite build` gerou pacote de produção em 851ms.
- **Corpus Integrity:** `node ferramentas/storin/check-corpus.js` passou com 0 erros.
- **Commit IRIS Global:** `3795a10` gravado em `T:\IRIS Global`.

---

## 3. Estado das Fronteiras e Próximos Passos

Três grandes lacunas funcionais de sobrevivência do produto foram superadas em sequência com conformidade absoluta ao War-Game:
- **F9:** Projeção de fluxo de caixa com saldo acumulado.
- **F10:** Cancelamento seguro de contas com auditoria.
- **F11:** Carga inicial em lote por planilha (CSV / Excel).

Próximos passos recomendados:
1. **D-12:** Atualização de `bloqueio_ativo = 'N'` no master para o tenant 120 (Pinheirão).
2. **Avaliação das próximas fronteiras de §7:** (ex.: validação de DV de RUC, visualização gerencial considerando lançamentos manuais, ou router com URL persistente na mesa do MDI).
