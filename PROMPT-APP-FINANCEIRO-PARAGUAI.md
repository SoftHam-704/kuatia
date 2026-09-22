# PROMPT — Aplicativo de Gestão Financeira Multiempresa (Paraguai)

> **Como usar:** copie deste ponto até o fim e entregue à IA que vai iniciar o projeto.
> O documento é autocontido: traz o modelo de dados já testado em produção, as regras
> de negócio e as armadilhas conhecidas. Não precisa de contexto adicional.

---

## 1. Seu papel

Você vai construir do zero um **aplicativo web de gestão financeira para grupo empresarial**, e vai começar pelo **banco de dados e pela fundação do projeto**.

O modelo de dados abaixo **não é sugestão**: é a estrutura de um módulo financeiro que já roda em produção há mais de um ano, atendendo mais de 30 empresas. Ele foi validado no uso real. Adapte ao Paraguai onde indicado, mas **não redesenhe o que já está resolvido** — se você acha que uma tabela deveria ser diferente, explique o porquê antes de mudar.

---

## 2. O cliente e a dor

Um **grupo paraguaio com 5 empresas** que hoje opera **100% manual** — planilhas, papel e memória.

O que isso significa na prática, e que deve guiar cada decisão de produto:

- **Ninguém sabe o saldo real hoje.** O dono descobre que faltou dinheiro quando o cheque volta.
- **Contas a pagar vencem sem aviso**, porque só existem na cabeça de quem lançou.
- **Não há visão do grupo.** Cinco empresas, cinco realidades separadas, nenhum número consolidado.
- **Quem sai leva o conhecimento junto.** Nada está registrado de forma recuperável.

O aplicativo é o **primeiro sistema** desse cliente. Isso tem duas consequências que você não pode esquecer:

1. **A tela precisa ser óbvia para quem nunca usou software de gestão.** Sem jargão contábil onde couber a palavra do dia a dia. Sem tela que exige treinamento de duas horas.
2. **O cadastro inicial é o maior risco do projeto.** Se lançar as primeiras 200 contas for penoso, o cliente desiste e volta pra planilha. Importação e lançamento rápido são requisito, não enfeite.

---

## 3. Escopo

### O que o aplicativo É

Um **controle financeiro interno completo**: contas a pagar e receber com parcelamento, baixas e estornos, livro caixa com múltiplas contas, plano de contas, centro de custo, fluxo de caixa projetado e DRE gerencial — com **visão isolada por empresa e visão consolidada do grupo**.

### O que o aplicativo NÃO É — não construa

- ❌ **Não emite documento fiscal.** Nada de factura electrónica, SIFEN, timbrado ou integração com a SET. O cliente continua faturando pelo processo atual.
- ❌ **Não é contabilidade.** Sem partida dobrada, sem balanço patrimonial, sem SPED. É gestão financeira, não escrituração.
- ❌ **Não tem folha de pagamento, estoque, vendas ou compras.** Salário entra como conta a pagar, e ponto.
- ❌ **Não integra com banco.** Sem conciliação automática, sem API bancária, sem PIX. Lançamento é manual ou por importação de arquivo.

> **Deixe preparado, sem construir:** o modelo de dados deve guardar `ruc`, `timbrado` e `numero_factura` como campos livres nas contas a receber. Custa três colunas agora e evita migração dolorosa se um dia entrar faturamento.

---

## 4. Localização — Paraguai (leia com atenção)

### 🚨 Moeda: Guaraní (PYG) NÃO TEM CENTAVOS

Esta é a adaptação mais importante e a que mais quebra sistema portado do Brasil.

O guaraní é uma moeda **sem subdivisão em uso**. Valores são inteiros: `₲ 1.500.000`, nunca `₲ 1.500.000,00`.

**Consequências obrigatórias:**

- Colunas monetárias em **`NUMERIC(15,0)`**, não `(15,2)`. O modelo original brasileiro usa 2 casas — **converta todas**.
- Formatação com separador de milhar `.` e **zero casas decimais**.
- **Nunca arredonde para 2 casas** em cálculo intermediário — não existe meio guaraní.
- Rateio e divisão de parcela precisam distribuir o resto em guaranis inteiros: `₲ 1.000.000` em 3 parcelas = `333.334 + 333.333 + 333.333`, e a **soma tem que fechar exatamente**. Escreva teste para isso.
- Se o grupo operar também em **dólar** (comum no Paraguai, sobretudo em importação), então: valor + moeda + cotação em cada lançamento, e **nunca** some moedas diferentes num mesmo total sem conversão explícita e visível.

**Confirme com o cliente antes de fechar:** o grupo movimenta só guarani, ou também dólar e real? A resposta muda o modelo.

### Identificação fiscal: RUC

Substitui CPF/CNPJ. Formato `NNNNNNNN-D` (número + dígito verificador).

- Campo `ruc VARCHAR(20)` no lugar de `cpf_cnpj`.
- Implemente a validação do dígito verificador — mas **permita salvar sem RUC**, porque fornecedor informal existe e travar o cadastro faz o usuário inventar número falso.
- Mantenha `tipo_persona` (`F` física / `J` jurídica).

### Endereço

- **`departamento`** no lugar de "UF/estado" (o país tem 17 departamentos + Asunción como capital, que é distrito próprio).
- **`ciudad`** e **`barrio`**.
- **CEP não é usado no Paraguai** como no Brasil — o campo pode existir opcional, mas **não faça dele obrigatório e não construa busca por CEP**.

### IVA (informativo apenas)

Como não há emissão fiscal, o IVA entra como **informação de apoio**, não cálculo obrigatório:
- `iva_tipo`: `10` (geral), `5` (reduzido — alimentos básicos, aluguel, medicamentos) ou `EXENTA`.
- Guarde o valor do IVA destacado quando o usuário informar, para relatório. **Não calcule imposto automaticamente** — sem emissão fiscal, errar aqui só gera número falso.

**Confirme com o cliente:** ele precisa separar IVA nos relatórios, ou só quer o valor total?

### Idioma

**Interface inteiramente em espanhol.** Não entregue em português "porque dá pra entender". Termos corretos: *Cuentas por Pagar · Cuentas por Cobrar · Flujo de Caja · Plan de Cuentas · Centro de Costos · Libro de Caja · Proveedores · Clientes · Vencimiento · Saldo · Cobro · Pago*.

Datas em `dd/mm/aaaa`.

---

## 5. Arquitetura multiempresa

**Cada empresa tem seus dados isolados, e existe um painel que soma as cinco.**

Use **um schema PostgreSQL por empresa** (`empresa_01`, `empresa_02`, …), com um schema `control` para o que é do grupo (usuários, empresas, permissões).

### Por que schema-por-empresa, e não uma coluna `empresa_id`

Este é o desenho que roda em produção no sistema de origem, e a razão é dura:

> Com coluna `empresa_id`, **basta um `WHERE` esquecido para uma empresa ver os dados da outra** — e ninguém percebe até o dono da empresa A ver o saldo da empresa B. Com schema separado, o vazamento exige erro deliberado.

Num grupo familiar com cinco empresas, isso não é hipótese acadêmica: sócios diferentes, contadores diferentes, e informação que **não deve** circular entre eles.

**Regra inegociável:** toda consulta usa a conexão já apontada para o schema da empresa ativa. **Nenhuma query monta o nome do schema por concatenação de string vinda do usuário.**

### A visão consolidada

Um usuário com permissão de grupo vê um painel que **soma as cinco empresas**: saldo total, a pagar/receber por vencimento, fluxo consolidado, comparativo entre empresas.

Implemente lendo cada schema e somando na aplicação, **não** com `UNION ALL` de cinco schemas escrito à mão — quando entrar a sexta empresa, ninguém vai lembrar de todos os lugares a alterar.

---

## 6. Modelo de dados

Estrutura validada em produção. **Nomes em espanhol** na implementação nova; abaixo está o original com a tradução sugerida.

### 6.1 `plan_cuentas` (plano de contas)

```sql
id              SERIAL PRIMARY KEY
codigo          VARCHAR(20)  NOT NULL UNIQUE   -- '1', '1.1', '1.1.01'
descripcion     VARCHAR(200) NOT NULL
tipo            CHAR(1)      NOT NULL CHECK (tipo IN ('R','D'))  -- Receita/Despesa
nivel           INTEGER      NOT NULL CHECK (nivel BETWEEN 1 AND 3)
id_padre        INTEGER      REFERENCES plan_cuentas(id)
activo          BOOLEAN      DEFAULT TRUE
creado_en       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
```

Hierarquia de **3 níveis** — grupo → subgrupo → conta. Semeie um plano inicial pronto (o cliente nunca montou um; pedir que ele crie do zero trava o projeto no primeiro dia). Estrutura de referência, a traduzir e adaptar:

```
1 INGRESOS                          2 EGRESOS
  1.1 Ventas                          2.1 Gastos de Personal
    1.1.01 Venta de Productos           2.1.01 Sueldos
    1.1.02 Venta de Servicios           2.1.02 Cargas Sociales (IPS)
    1.1.03 Reventa de Mercaderías       2.1.03 Aguinaldo
  1.2 Ingresos Financieros              2.1.04 Vacaciones
    1.2.01 Intereses Ganados          2.2 Gastos Administrativos
    1.2.02 Descuentos Obtenidos         2.2.01 Alquiler
    1.2.03 Rendimientos                 2.2.02 Energía Eléctrica (ANDE)
  1.3 Otros Ingresos                    2.2.03 Agua (ESSAP)
    1.3.01 Recupero de Gastos           2.2.04 Teléfono e Internet
    1.3.02 Venta de Activos             2.2.05 Útiles de Oficina
                                      2.3 Gastos de Ventas
                                        2.3.01 Comisiones
                                        2.3.02 Publicidad
                                        2.3.03 Viáticos
                                      2.4 Gastos Tributarios
                                        2.4.01 IVA
                                        2.4.02 IRE
                                        2.4.03 Tasas Municipales
                                      2.5 Gastos Financieros
                                        2.5.01 Intereses Pagados
                                        2.5.02 Comisiones Bancarias
```

> ⚠️ Os tributos acima são **exemplo estrutural**. Confirme a lista real com o contador do cliente antes de semear — não invente tributo paraguaio.

### 6.2 `centros_costo`

```sql
id              SERIAL PRIMARY KEY
codigo          VARCHAR(20) UNIQUE
descripcion     VARCHAR(100) NOT NULL
activo          BOOLEAN DEFAULT TRUE
```

### 6.3 `clientes` e `proveedores` (estrutura idêntica)

```sql
id              SERIAL PRIMARY KEY
tipo_persona    CHAR(1) NOT NULL CHECK (tipo_persona IN ('F','J'))
ruc             VARCHAR(20)          -- pode ficar vazio
razon_social    VARCHAR(200) NOT NULL
nombre_fantasia VARCHAR(200)
direccion       VARCHAR(200)
numero          VARCHAR(20)
barrio          VARCHAR(100)
ciudad          VARCHAR(100)
departamento    VARCHAR(50)
telefono        VARCHAR(20)
celular         VARCHAR(20)
email           VARCHAR(100)
observaciones   TEXT
activo          BOOLEAN DEFAULT TRUE
creado_en       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

### 6.4 Contas a pagar — três níveis

Esta é a parte mais importante do modelo. **São três tabelas, não uma.** Entenda o porquê antes de simplificar:

**`cuentas_pagar`** — o compromisso (a nota, o contrato)
```sql
id                SERIAL PRIMARY KEY
descripcion       VARCHAR(200) NOT NULL
id_proveedor      INTEGER REFERENCES proveedores(id)
numero_documento  VARCHAR(50)
valor_total       NUMERIC(15,0) NOT NULL CHECK (valor_total >= 0)   -- SEM centavos
valor_pagado      NUMERIC(15,0) DEFAULT 0 CHECK (valor_pagado >= 0)
fecha_emision     DATE NOT NULL
fecha_vencimiento DATE NOT NULL
fecha_pago        DATE
estado            VARCHAR(20) DEFAULT 'ABIERTO'
                  CHECK (estado IN ('ABIERTO','PAGADO','VENCIDO','CANCELADO'))
id_plan_cuentas   INTEGER REFERENCES plan_cuentas(id)
id_centro_costo   INTEGER REFERENCES centros_costo(id)
observaciones     TEXT
creado_en         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
creado_por        VARCHAR(100)
```

**`cuotas_pagar`** — cada parcela
```sql
id                SERIAL PRIMARY KEY
id_cuenta_pagar   INTEGER NOT NULL REFERENCES cuentas_pagar(id) ON DELETE CASCADE
numero_cuota      INTEGER NOT NULL CHECK (numero_cuota > 0)
valor             NUMERIC(15,0) NOT NULL CHECK (valor >= 0)
fecha_vencimiento DATE NOT NULL
fecha_pago        DATE
valor_pagado      NUMERIC(15,0)
intereses         NUMERIC(15,0) DEFAULT 0 CHECK (intereses >= 0)
descuento         NUMERIC(15,0) DEFAULT 0 CHECK (descuento >= 0)
estado            VARCHAR(20) DEFAULT 'ABIERTO'
                  CHECK (estado IN ('ABIERTO','PAGADO','VENCIDO','CANCELADO'))
observaciones     TEXT
```

**`bajas_pagar`** — cada evento de pagamento (o livro-razão da parcela)
```sql
id                  SERIAL PRIMARY KEY
id_cuota            INTEGER NOT NULL REFERENCES cuotas_pagar(id)
tipo                VARCHAR(8) NOT NULL DEFAULT 'BAJA'
                    CHECK (tipo IN ('BAJA','REVERSION'))
fecha               DATE NOT NULL
valor_pagado        NUMERIC(15,0) NOT NULL DEFAULT 0
intereses           NUMERIC(15,0) NOT NULL DEFAULT 0
descuento           NUMERIC(15,0) NOT NULL DEFAULT 0
id_cuenta_caja      INTEGER REFERENCES cajas(id)
id_movimiento_caja  INTEGER REFERENCES movimientos_caja(id)
reversion_de        INTEGER REFERENCES bajas_pagar(id)
observaciones       TEXT
creado_por          INTEGER
creado_en           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
```

> 🚨 **Por que `bajas` existe, e por que ela é append-only.**
> Uma parcela pode ser paga em partes, com juros num dia e desconto noutro, e o pagamento pode ser estornado. Se o pagamento morar como campo dentro da parcela, **um estorno apaga o histórico** e ninguém consegue reconstruir o que aconteceu.
> `bajas` é um **livro**: só recebe INSERT. Estorno **não deleta** a baixa original — cria uma linha nova com `tipo='REVERSION'` apontando para ela em `reversion_de`. O saldo da parcela é a soma do livro, nunca um campo editado.
> **Nunca implemente UPDATE ou DELETE em `bajas`.** No sistema de origem, uma tela que apagava documento em vez de estorná-lo destruiu registro fiscal que continuava válido do lado de fora — e não havia como reconstruir.

### 6.5 Contas a receber

Espelho exato de 6.4: `cuentas_cobrar` / `cuotas_cobrar` / `bajas_cobrar`, trocando `id_proveedor`→`id_cliente`, `valor_pagado`→`valor_cobrado`, `PAGADO`→`COBRADO`.

Acrescente aqui (preparação, sem uso agora): `timbrado VARCHAR(20)`, `numero_factura VARCHAR(30)`.

### 6.6 Livro caixa

**`cajas`** — cada caixa ou conta bancária
```sql
id                   SERIAL PRIMARY KEY
nombre               VARCHAR(100) NOT NULL
tipo                 VARCHAR(20) NOT NULL DEFAULT 'caja'   -- caja | banco
moneda               CHAR(3) NOT NULL DEFAULT 'PYG'        -- PYG | USD | BRL
saldo_inicial        NUMERIC(15,0) NOT NULL DEFAULT 0
fecha_saldo_inicial  DATE NOT NULL DEFAULT CURRENT_DATE
activo               BOOLEAN NOT NULL DEFAULT TRUE
```

**`movimientos_caja`** — entradas e saídas
```sql
id                  SERIAL PRIMARY KEY
id_caja             INTEGER NOT NULL REFERENCES cajas(id)
fecha               DATE NOT NULL
historico           TEXT NOT NULL
tipo                CHAR(1) NOT NULL CHECK (tipo IN ('C','D'))  -- Crédito/Débito
valor               NUMERIC(15,0) NOT NULL CHECK (valor > 0)
id_plan_cuentas     INTEGER REFERENCES plan_cuentas(id)
id_centro_costo     INTEGER REFERENCES centros_costo(id)
documento           VARCHAR(60)
origen              CHAR(2) NOT NULL DEFAULT 'MA'   -- MA=manual · CP=c.pagar · CC=c.cobrar · TR=transferência
id_cuota_origen     INTEGER
id_transferencia    INTEGER
creado_en           TIMESTAMP DEFAULT NOW()
```

> **`valor` é sempre positivo; o sinal vem de `tipo`.** Valor negativo com tipo crédito é a receita de relatório que não fecha.
> **`origen` é obrigatório e não é enfeite:** ele diz se o lançamento nasceu à mão ou veio de uma baixa. Sem isso, ninguém consegue auditar por que o caixa não bate, e o usuário edita à mão um lançamento que deveria vir da parcela.
> **Transferência entre caixas gera DOIS movimentos** (débito na origem, crédito no destino) amarrados pelo mesmo `id_transferencia`. Nunca um só.

---

## 7. Regras de negócio inegociáveis

Cada uma abaixo custou caro para ser aprendida. Implemente todas.

1. **Saldo é calculado, nunca armazenado.** O saldo de uma caixa é `saldo_inicial + Σ créditos − Σ débitos`. Campo de saldo denormalizado sai de sincronia e ninguém descobre quando.

2. **Status é derivado da data e das baixas**, não digitado. `VENCIDO` é `fecha_vencimiento < hoje AND saldo > 0`. Se o usuário puder escolher o status, ele vai escolher errado.

3. **Baixa parcial é normal.** Pagar `₲ 300.000` de uma parcela de `₲ 500.000` deixa a parcela `ABIERTO` com saldo `₲ 200.000`. Não force pagamento integral.

4. **Estorno nunca apaga.** Ver 6.4.

5. **A soma das parcelas TEM que bater com o total da conta.** Valide na gravação, e distribua o resto da divisão na última parcela. Teste com valores que não dividem exato.

6. **Excluir conta com baixa é proibido.** Se já houve movimento financeiro, só cancelamento — e o cancelamento preserva o histórico.

7. **Toda data digitada é validada.** Ano fora de `2000–2100` é erro de digitação, não dado. No sistema de origem, alguém digitou "6" em vez de "2026" e o registro ficou inutilizável por dois meses sem ninguém perceber — porque nada validava e a tela mostrava o que foi digitado.

8. **Resultado vazio precisa dizer por quê.** Um relatório que devolve `₲ 0` porque não há dado é indistinguível de `₲ 0` por bug. Sempre que o resultado for vazio, a tela diz "não há lançamentos no período selecionado", nunca só o zero.

---

## 8. Telas

Na ordem de valor para quem opera hoje no papel:

1. **Dashboard da empresa** — saldo por caixa, a vencer nos próximos 7/15/30 dias, vencidos, entradas × saídas do mês.
2. **Cuentas por Pagar** — lista com filtro por vencimento e estado, cadastro com parcelamento, tela de baixa (parcial, com juros e desconto).
3. **Cuentas por Cobrar** — espelho da anterior.
4. **Libro de Caja** — lançamento manual rápido, transferência entre caixas, extrato por conta e período.
5. **Flujo de Caja** — projeção diária/semanal/mensal juntando saldo atual + a receber + a pagar. **É a tela que o dono vai abrir todo dia.**
6. **Plan de Cuentas** e **Centros de Costo** — cadastros com árvore.
7. **Clientes** e **Proveedores**.
8. **Reporte de Resultados (DRE gerencial)** — receitas e despesas por conta do plano, com comparativo entre períodos.
9. **Panel Consolidado do grupo** — as 5 empresas somadas e comparadas lado a lado.

**Requisitos de tela que não são opcionais:**
- Lançamento em **menos de 15 segundos** para o caso comum. Quem vem do papel abandona software lento.
- **Importação de planilha** para carga inicial de clientes, fornecedores e contas em aberto. Sem isso o projeto morre na largada.
- Tudo que lista tem **exportação para Excel** — o cliente vai querer conferir fora do sistema no começo, e isso é saudável.
- **Responsivo.** O dono vai consultar saldo pelo celular.

---

## 9. Stack

- **Backend:** Node.js + TypeScript + Express + PostgreSQL (driver `pg`, sem ORM pesado)
- **Frontend:** React + TypeScript + Vite
- **Auth:** JWT, com empresa ativa no token
- **Migrations:** arquivos SQL versionados e idempotentes, aplicáveis em qualquer ordem sem quebrar

**Pool de conexões enxuto:** `max: 8`, `min: 0`, `idleTimeoutMillis: 30000`. Pool grande satura o servidor e derruba todo mundo junto.

**Dinheiro nunca em `float`.** `NUMERIC` no banco, inteiro em JavaScript. Ponto flutuante em cálculo financeiro produz erro de centavo que ninguém rastreia — e em guarani, erro de unidade inteira.

---

## 10. Ordem de construção

1. Schema `control` (empresas, usuários, permissões) + os 5 schemas de empresa
2. Migrations do modelo financeiro completo + seed do plano de contas
3. Auth com seleção de empresa
4. Cadastros: plano de contas, centros de custo, clientes, fornecedores
5. Contas a pagar (conta → parcelas → baixa → movimento de caixa). **É o núcleo — faça inteiro e certo antes de seguir.**
6. Contas a receber (espelho)
7. Livro caixa + transferências
8. Fluxo de caixa e DRE
9. Painel consolidado
10. Importação de planilha

---

## 11. Armadilhas conhecidas

Erros reais que já aconteceram no sistema de origem. Evite todos:

- **Guaraní com 2 casas decimais.** Portar `NUMERIC(15,2)` direto do modelo brasileiro cria centavo que não existe, e a soma nunca fecha com o extrato do banco.
- **`WHERE` sem filtro de empresa.** Por isso o schema separado.
- **Deletar em vez de estornar.** Destrói o histórico e não há como reconstruir.
- **Saldo denormalizado.** Sai de sincronia silenciosamente.
- **Transação abortada tratada como sucesso.** No PostgreSQL, um erro dentro de transação aborta a transação inteira: capturar a exceção **não** desfaz o aborto, e o `COMMIT` seguinte age como `ROLLBACK` respondendo "ok". Sempre confira o resultado no banco em vez de acreditar na mensagem.
- **Tela que mostra data de hoje ignorando a data do dado.** Faz o usuário duvidar de informação correta — e é pior que um erro visível.
- **Validar só na tela.** Regra de dinheiro se valida no backend também. Guarda de interface não é guarda.

---

## 12. Critérios de aceite

O projeto está pronto para a próxima etapa quando:

- [ ] Os 5 schemas existem e uma empresa **não consegue** ler dado de outra, mesmo com requisição forjada
- [ ] Uma conta de `₲ 1.000.000` em 3 parcelas gera parcelas que **somam exatamente** `₲ 1.000.000`
- [ ] Baixa parcial deixa a parcela aberta com o saldo correto
- [ ] Estorno preserva a baixa original e devolve o saldo
- [ ] Baixa gera movimento no caixa com `origen` correto, e o saldo da caixa reflete
- [ ] Transferência entre caixas gera exatamente 2 movimentos amarrados
- [ ] Nenhum valor monetário exibe casa decimal
- [ ] Data com ano inválido é rejeitada com mensagem clara
- [ ] Relatório sem dado explica o motivo em vez de mostrar zero
- [ ] O painel consolidado soma as 5 empresas e confere com a soma manual

---

## 13. Antes de começar, pergunte

Não invente resposta para nenhuma destas — cada uma muda o modelo:

1. O grupo opera **só em guarani**, ou também dólar e real?
2. As 5 empresas têm **contadores diferentes**? Alguém pode ver todas?
3. Existe **plano de contas atual** (mesmo em planilha) a ser respeitado?
4. Precisa separar **IVA** nos relatórios?
5. Quantas pessoas vão usar, e **quem lança** — o dono, um assistente, cada empresa a sua?
6. Existe **histórico** a importar, ou começa do zero numa data de corte?
