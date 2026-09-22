# WAR-GAME — Kuatiá · Blindagem crítica + entrada no Corpus

> **Não execute ainda. Primeiro simule como este projeto pode falhar.**
>
> Versão: `v1` · Data: 2026-08-11 · Método: [[PLY-004]] · Estado: **aguardando gate humano**
> Planejado por: Opus 5 (esforço alto). Nada aqui foi implementado.

---

## 0. Preâmbulo — leia isto se você é o executor

Você provavelmente não participou do planejamento. Este documento é sua **fonte normativa
única**. Regras que valem antes de qualquer coisa:

1. **Não replaneje.** Se algo não bate com a realidade, consulte a §9 (tabela de riscos) antes de
   improvisar. Se não estiver lá, **pare e escale** — não invente.
2. **Uma fase por vez.** Termine, escreva o relatório, atualize o `ledger.md`, e **pare**.
3. **Nenhuma fase começa sem o `D-*` dela aprovado.** As decisões pendentes estão no `ledger.md`.
4. **Fronteira de produto:** alcançar o arquivo de outro sistema pelo filesystem **não é
   autorização**. Se a correção certa exigir tocar outro produto, isso é aborto, não iniciativa.
5. **Segredo = quem detém cola.** Você nunca manuseia chave, senha ou token. Nem para conferir.
   Verifica-se por **efeito** ("essa credencial consegue escrever?"), nunca por valor.

---

## 1. Contexto

`e:\Sistemas_ia\Financeiro` — app de gestão financeira multiempresa para um grupo paraguaio
(Grupo Pinheirão, 5 empresas, moedas PYG/USD/BRL). Construído por outra IA como protótipo, a
partir do spec `PROMPT-APP-FINANCEIRO-PARAGUAI.md`. Em 2026-08-11 passou a ser **produto da Frota
SoftHam**, com o nome **Kuatiá** (D-01).

**Estado medido em 2026-08-11** (build limpo, 12 testes verdes, `tsc` strict):

| Camada | O que existe |
|---|---|
| Backend | Express + TS + `pg`, 14 módulos de rota, 13 migrations, RLS com `FORCE` |
| Frontend | React + Vite, 12 telas, design system próprio |
| Testes | 12 unitários (moeda, datas, parcelas, XML, geração de arquivo) |
| Corpus | **nada** — o produto não existe em `softham-corpus/products/` |

**O núcleo financeiro é bom** e não é alvo desta rodada: dinheiro como `BIGINT` em unidades
mínimas (nunca `float`), livro `bajas_*` append-only garantido por **trigger**, e
`010_financial_integrity.sql` validando no banco que baixa não excede saldo e que o movimento de
caixa casa em empresa/caixa/moeda/tipo/valor. Isso se **protege**, não se refatora.

O que trava a produção são quatro riscos de segurança, um bug de roteamento multi-tenant já
catalogado como cicatriz da casa, e uma dívida constitucional (Art. 3).

---

## 2. Objetivo

Deixar o Kuatiá **seguro o bastante para ir a produção** e **dentro do patrimônio institucional**,
sem quebrar nada do que já funciona e sem tocar em nenhum outro produto da Frota.

Não é objetivo desta rodada: dar IRIS ao produto (isso é PLY-006 Fase A, rodada seguinte),
nem fechar as lacunas funcionais do spec original (importação de planilha, cancelamento de conta,
fluxo de caixa com saldo real).

---

## 3. Público

- **Usuário final:** operadores e donos do Grupo Pinheirão no Paraguai. Vêm de planilha e papel;
  este é o **primeiro sistema** deles. Interface em espanhol. Nenhum é técnico.
- **Consumidor do plano:** um agente executor (Sonnet) sem contexto desta conversa.
- **Quem ratifica:** Hamilton. Todo `D-*` é dele.

---

## 4. Stack

Node 22 · TypeScript strict (`NodeNext`) · Express 4 · `pg` 8 · Zod · React 18 · Vite 6 ·
Vitest 2 · PostgreSQL com RLS. Sem ORM. Banco por tenant, roteado pelo **master SoftHam**
(`public.empresas`), que é **compartilhado por toda a Frota**.

Dependências relevantes já instaladas e **não usadas**: `bcryptjs` (nenhum import — é a Fase 3).
A instalar: `express-rate-limit`, `helmet` (Fase 4).

---

## 5. Restrições

- **Não cruzar fronteira de produto.** Nenhum arquivo de outro sistema é tocado.
- **Não manusear segredo.** Rotação de chave é do dono.
- **Não quebrar o protótipo.** O núcleo financeiro é a versão boa a proteger.
- **DDL só sai do papel em teste.** Schema descartável, provado e revertido, antes de produção
  (PLY-006 §3).
- **Sem autoaprovação.** Cada fase termina com parada e gate.
- **Orçamento de tentativas por fase.** Esgotou → escala, não insiste.

---

## 6. O que NÃO pode acontecer (riscos críticos)

1. 🔴 **Chave viva entrar no histórico do git.** O `.env` da raiz tem credenciais de **outros
   produtos**. Uma vez commitada, está lá para sempre.
2. 🔴 **Login parar de funcionar.** O Pinheirão perde o acesso ao próprio sistema.
3. 🔴 **Quebrar outro produto** ao mexer em `user_nomes` ou no master compartilhado.
4. 🔴 **"Consertar" o TLS e não conseguir mais conectar** no banco.
5. 🟠 **O `contexto.md` nascer defasado** e a IRIS passar a negar com confiança o que existe.
6. 🟠 **Loop de ajuste** — insistir num parâmetro em vez de achar a causa estrutural.

---

## 7. Caminho crítico

```
      ┌──────────────────────────────────────────────────────────┐
      │  F0  Rede de segurança (git + .gitignore + checkpoints)   │  ← nada começa antes
      └────────────────────────┬─────────────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
   ┌─────────┐         ┌──────────────┐        ┌─────────────┐
   │ F1 .env │         │ F2 roteamento│        │ F4 TLS +    │   (independentes entre si)
   │ limpo   │         │ do master    │        │ perímetro   │
   └────┬────┘         └──────┬───────┘        └──────┬──────┘
        │                     │                       │
        │                     ▼                       │
        │              ┌─────────────┐                │
        │              │ F3 senha    │                │  (depende de F2: mesmo fluxo de login)
        │              │ bcrypt      │                │
        │              └──────┬──────┘                │
        └─────────────────────┼───────────────────────┘
                              ▼
                    ┌──────────────────┐
                    │ F5 Corpus        │  ← POR ÚLTIMO, sempre.
                    │ contexto+manual  │    Escrever antes = documentar produto que já mudou.
                    └──────────────────┘
```

**F0 é bloqueante de tudo.** F1, F2 e F4 são independentes e podem ser reordenadas. **F3 depende
de F2** (as duas mexem no mesmo fluxo de login — juntá-las viola a Lei 6 do PLY-008: comparação
só vale com o conjunto igual dos dois lados). **F5 é sempre a última.**

---

## 8. As fases

### FASE 0 — Rede de segurança
> *Parece a fase mais trivial e é a mais perigosa da rodada.*

| | |
|---|---|
| **Objetivo** | Existir um ponto de retorno antes de qualquer mudança. |
| **Faz** | `.gitignore` → `git init` → commit do estado atual. Copiar `.env` original para `war-game/checkpoints/` (fora do git). |
| **NÃO faz** | Não commita `.env`, `node_modules`, `dist`, `tmp/*.pdf\|png`. Não cria remoto sem D-05. Não toca em produção. |
| **Otimista** | `git init` + commit resolve; o `.env` fica de fora. |
| **Pessimista** | O `.gitignore` é escrito depois do `git add` e as chaves de outros produtos entram no histórico permanentemente. |

**Ação → Reação → Contra-ação**
- **Ação:** `git init && git add -A && git commit`
- **Reação:** `.env` versionado · `node_modules` de 2 pastas versionado · `dist/` com build versionado
- **Contra-ação:** escrever o `.gitignore` **antes** do primeiro `git add`; verificar antes de
  commitar. Se o `.env` entrou: apagar `.git` e refazer do zero — o repo é novo, não há história
  a preservar. **Nunca `filter-branch`** para isto.

**Detecção:** `git ls-files` não retorna nada que case com `env`, `node_modules`, `dist`, `tmp/`.
**Recuperação:** apagar `.git/`, refazer. Custo zero.
**Saída:** 1 commit · `git ls-files` limpo · `.env` original em `checkpoints/` · working tree limpo.
**Aborto:** D-05 exige remoto antes do commit → parar e escalar.
**Orçamento:** 2 tentativas.

---

### FASE 1 — Descontaminação do `.env`
| | |
|---|---|
| **Objetivo** | O `.env` do Kuatiá conter só o que o Kuatiá usa. |
| **Faz** | Grep de `process.env` em todo o `src/` → lista fechada de variáveis lidas. Reduzir o `.env` a elas. Escrever `.env.example` **verdadeiro**. Listar pro Hamilton o que rotacionar. |
| **NÃO faz** | **Não rotaciona chave nenhuma** (PLY-006 §5). Não toca `.env` de outro projeto. |
| **Otimista** | ANTHROPIC/OPENAI/GEMINI/EVOLUTION não são usadas; sair não quebra nada. |
| **Pessimista** | O `.env` é compartilhado com outro projeto seu e reduzi-lo quebra o vizinho — **silenciosamente**. |

**Ação → Reação → Contra-ação**
- **Ação:** reduzir o `.env` à lista provada
- **Reação:** o app não sobe porque uma variável era lida por caminho que o grep não pegou
- **Contra-ação:** checkpoint do original antes de editar; restaurar e refazer o levantamento

**Detecção:** ⚠️ `GET /health` **não prova nada** — ele não toca o banco (Lei 1 do PLY-008: prova-se
o caminho, não o nó). A prova é **um login real completando**.
**Recuperação:** restaurar de `checkpoints/`.
**Saída:** `.env` só com variáveis provadas · `.env.example` documenta 100% delas (hoje documenta
3 de ~10 e **omite `JWT_SECRET` e todas as `MASTER_DB_*`**) · login real verde.
**Aborto:** se o `.env` for compartilhado (D-06) → **parar**, é fronteira.
**Orçamento:** 2 tentativas.

> **Nota honesta (L-01):** se as chaves de IA daqui forem as **mesmas** dos outros 4 produtos —
> e o `CAT-001 §5` diz que isso nunca foi confirmado — limpar este arquivo **não reduz exposição
> nenhuma**. Só a rotação no provedor reduz. A fase entrega higiene e um pedido; não entrega
> segurança sozinha. Não declarar "resolvido" ao fim dela.

---

### FASE 2 — Discriminador de produto no roteamento do master  🔴
> *A fase com a maior indefinição do plano (D-07). Começa lendo, não escrevendo.*

| | |
|---|---|
| **Objetivo** | O Kuatiá resolver **só** empresas que são dele. |
| **Faz** | (a) SELECT **read-only** no master: colunas de `public.empresas` + linhas do CNPJ do Pinheirão. (b) Só então escolher o filtro e aplicá-lo em `authenticateInMaster`. |
| **NÃO faz** | Não altera schema do master. Não escreve no master. Não inventa convenção nova num banco da Frota inteira. |
| **Otimista** | Existe discriminador utilizável (o PLY-006 sugere `db_nome`) e basta filtrar. |
| **Pessimista** | **Não existe discriminador confiável.** Se o banco do tenant for compartilhado com outro produto, `db_nome` não discrimina nada — e aí não há correção local possível. |

**Ação → Reação → Contra-ação**
- **Ação:** acrescentar `AND <discriminador> = $2` em [master-auth.service.ts:55-63](../backend-financeiro/src/modules/auth/master-auth.service.ts#L55-L63)
- **Reação:** **nenhum login funciona** porque o valor não bate (caixa, sufixo de ambiente, `NULL`)
- **Contra-ação:** a leitura da etapa (a) é o que impede isso. Sem ela, é chute.

**Detecção — os dois lados, sempre:**
1. CNPJ do Pinheirão → **entra**
2. CNPJ que exista só em outro produto → **negado**

Só o teste 1 não prova isolamento (é a régua do PLY-006 aplicada ao roteamento: sem o segundo
lado, você provou que não quebrou, não que isolou).
**Recuperação:** reverter o commit da fase.
**Saída:** os dois testes verdes.
**Aborto:** sem discriminador confiável → **PARAR e escalar** (D-07). Não criar coluna nova no
master por conta própria.
**Orçamento:** **1** tentativa de query após a leitura. Se errar, volta a ler — não fica ajustando
o valor. *(Lei 3 do PLY-008.)*

---

### FASE 3 — Senha: bcrypt com dupla leitura  🔴
| | |
|---|---|
| **Objetivo** | O Kuatiá parar de comparar senha em texto puro, **sem** quebrar os outros produtos que leem `user_nomes.senha`. |
| **Faz** | Login: se `senha_hash` existe → `bcrypt.compare`; senão → compara o legado **e grava o hash** (migração preguiçosa, um usuário por login). `PUT /usuarios`: grava os dois enquanto o legado for necessário. |
| **NÃO faz** | **Não remove a coluna `senha`.** Não toca outro produto (D-03). Não força troca de senha de ninguém. |
| **Otimista** | `master-migrations/001` já criou `senha_hash` — basta usar. |
| **Pessimista** | ⚠️ **A coluna foi criada no lugar errado.** |

> #### 🔎 Achado F3-A do war game (E2 — os dois arquivos lidos)
> [master-migrations/001](../backend-financeiro/master-migrations/001_financeiro_master_identity.sql#L1)
> faz `ALTER TABLE public.usuarios ADD COLUMN senha_hash` e roda via `masterPool` → cria a coluna
> em **`master.public.usuarios`**.
> Mas o login valida contra **`<schema>.user_nomes`** no banco do **tenant**
> ([master-auth.service.ts:89-95](../backend-financeiro/src/modules/auth/master-auth.service.ts#L89-L95))
> — outra tabela, outro banco. O fluxo de autenticação **nunca toca** `master.public.usuarios`.
>
> **A coluna existe onde ninguém a usa.** Para o D-03 funcionar, o hash tem que morar onde a
> senha mora: em `<schema>.user_nomes`. E **essa** tabela é lida por outros produtos → é o D-08.

**Ação → Reação → Contra-ação**
- **Ação:** `ALTER TABLE <schema>.user_nomes ADD COLUMN senha_hash TEXT NULL`
- **Reação:** um produto que faça `INSERT INTO user_nomes VALUES (...)` **posicional** quebra
- **Contra-ação:** coluna nullable no fim é segura para `SELECT *` e para `INSERT` com lista de
  colunas. Antes de aplicar em qualquer lugar real: **schema descartável** (PLY-006 §3) e
  confirmação do D-08.

**Detecção — três testes, nesta ordem:**
1. Usuário legado (sem hash), senha certa → entra **e** o hash aparece gravado
2. Segundo login do mesmo usuário → usa o caminho bcrypt
3. Senha errada → negada nos **dois** caminhos

**Recuperação:** `DROP COLUMN senha_hash` — é aditiva, nada depende dela ainda.
**Saída:** os 3 testes + confirmação sua de que os outros produtos continuam logando.
**Aborto:** algum produto faz `INSERT` posicional → parar e replanejar.
**Orçamento:** 1 tentativa, sempre em teste antes.

> **Honestidade obrigatória:** enquanto `user_nomes.senha` continuar em claro — e vai continuar,
> porque outros produtos leem —, **um dump ainda entrega todas as senhas**. Esta fase não elimina
> o risco: ela tira o Kuatiá de porta de entrada e cria caminho de saída. Isso vira item de
> fronteira no `contexto.md` **com condição de saída**, não silêncio.
> Efeito colateral bom: `samePassword` (`timingSafeEqual` sobre texto puro, com *early return* por
> comprimento) sai de cena.

---

### FASE 4 — TLS e perímetro
| | |
|---|---|
| **Objetivo** | Dado financeiro não trafegar em claro; login não ser força-brutável; API não ser chamável de qualquer origem. |
| **Faz** | Unificar a decisão de SSL num lugar só. `express-rate-limit` no `/auth/login`. `cors({origin: allowlist})`. `helmet`. |
| **NÃO faz** | Não muda host do banco. Não mexe em firewall nem infra do servidor. |
| **Otimista** | O Postgres aceita TLS com certificado verificável. |
| **Pessimista** | Certificado **self-signed** — que é justamente por que o código tem `rejectUnauthorized:false`. Ligar validação sem a CA derruba tudo. |

> #### 🔎 Achado F4-A (E2)
> São **dois caminhos de SSL com regras diferentes** em [database.ts](../backend-financeiro/src/config/database.ts#L28):
> o pool default usa `DATABASE_SSL ?? MASTER_DB_SSL` (linha 28); o `getRoutedTenantPool` usa
> **só** `DATABASE_SSL` (linha 63). O `.env` real define `MASTER_DB_SSL=true` e **não define
> `DATABASE_SSL`** → o master vai cifrado e **o pool por onde passa todo o dado financeiro vai em
> claro**. Corrigir um e não o outro deixa metade aberta e *parece* resolvido.
> Derivar de **um lugar só** (Lei 4 do PLY-008).

**Ação → Reação → Contra-ação**
- **Ação:** `rejectUnauthorized: true`
- **Reação:** `self signed certificate in certificate chain` em toda query — e como o pool conecta
  sob demanda, **isso pode aparecer só no primeiro request, não no boot**
- **Contra-ação:** passar a CA via `ssl: { ca }`. Sem CA disponível → decisão consciente (D-09):
  `rejectUnauthorized:false` cifra sem autenticar, vira dívida **registrada com condição de saída**

**Detecção — provar por efeito, não por variável:**
- TLS: `SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()` → `true` **na conexão do app**
- Rate limit: 11ª tentativa de login → `429`
- CORS: `Origin: https://evil.example` → **sem** `Access-Control-Allow-Origin` na resposta

**Recuperação:** reverter; o `.env` volta do checkpoint.
**Saída:** os 3 provados por efeito.
**Aborto:** ligar TLS derruba o ambiente → reverter e escalar (D-09).
**Orçamento:** 2 tentativas por item.

---

### FASE 5 — Entrada no Corpus (Art. 3)
> *Última, sempre. Escrever antes é documentar um produto que ainda vai mudar.*

| | |
|---|---|
| **Objetivo** | `products/kuatia/` existir no Corpus com `contexto.md` e `manual/`. |
| **Faz** | `contexto.md` pelo `_GABARITO.md` (7 seções; §7 com as **4 partes obrigatórias**, incluindo condição de saída). `manual/` quebrado por módulo — é a fonte do vídeo (D-04). Propor a linha do Kuatiá no CAT-001. |
| **NÃO faz** | **Não roda `sync-iris-corpus.js`** (publicar é do dono, PLY-002). Não escreve em `especialistas/`. Não dá IRIS ao produto — isso é PLY-006 Fase A, rodada seguinte. |
| **Otimista** | Escrevo o contexto a partir do código que já li. |
| **Pessimista** | **Nasce defasado.** É a cicatriz documentada em `_MANUAL-convencao.md` (QuickCash, 2026-08-10): o texto foi escrito, 40 min depois o produto ganhou outra porta, e a linha velha virou **negativa confiante** na boca da IRIS. Aqui é pior — as fases 1–4 mudam o produto **enquanto** eu escreveria. |

**Contra-ação:** por isso F5 é a última, e cada afirmação é aterrada no código **pós-Fase 4**.

**Detecção:** gate — toda afirmação do `contexto.md` tem `arquivo:linha` correspondente no estado
final. A reconferência **começa pela §7** (fronteiras), não pelo topo.
**Saída:** `contexto.md` + `manual/00-visao-geral.md` no mínimo; **nada publicado** sem gate seu.
**Aborto:** —
**Orçamento:** 1 versão + 1 revisão crítica. Anti-loop: "bom o suficiente, salva e avança."

---

## 9. Tabela mestra de riscos

| # | Risco | Prob. | Impacto | Como detectar | Como recuperar | Quando parar | **Quem decide** |
|---|---|---|---|---|---|---|---|
| R-01 | `.env` com chaves de outros produtos entra no histórico do git | **Alta** se `.gitignore` vier depois | 🔴 Crítico — permanente | `git ls-files` antes do commit | apagar `.git/`, refazer | — | Executor (é procedimento) |
| R-02 | Discriminador de produto não existe no master | Média | 🔴 Bloqueia F2 | leitura read-only do master | não há correção local | imediatamente | **Hamilton (D-07)** |
| R-03 | Filtro novo derruba o login do Pinheirão | Média | 🔴 Cliente sem sistema | teste de login pós-mudança | reverter commit da fase | 1ª falha | Executor → escala |
| R-04 | `ALTER TABLE user_nomes` quebra outro produto | Baixa | 🔴 Fora da fronteira | teste em schema descartável | `DROP COLUMN` | antes de aplicar | **Hamilton (D-08)** |
| R-05 | TLS com validação derruba todas as conexões | **Alta** (self-signed é comum) | 🟠 Ambiente parado | erro no 1º request, não no boot | reverter para `rejectUnauthorized:false` | 2ª tentativa | **Hamilton (D-09)** |
| R-06 | `contexto.md` nasce defasado → IRIS nega o que existe | **Alta** se F5 vier antes | 🟠 Pior que não saber | gate de aterramento por `arquivo:linha` | corrigir e re-gatear | — | Executor + gate |
| R-07 | Limpar o `.env` não reduz exposição (chaves compartilhadas) | Média | 🟠 Falsa sensação | comparação de valores | rotação no provedor | — | **Hamilton (L-01)** |
| R-08 | `.env` da raiz é compartilhado com outro projeto | Baixa | 🔴 Quebra vizinho | perguntar antes de editar | restaurar checkpoint | antes de editar | **Hamilton (D-06)** |
| R-09 | Rate limit bloqueia usuário legítimo do Pinheirão | Média | 🟠 Suporte | 429 em uso normal | afrouxar janela | — | Executor |
| R-10 | Loop de ajuste (mesmo parâmetro 3×) | Média | 🟠 Queima tempo/token | contador de tentativas por fase | parar, procurar causa estrutural | 3ª iteração | Executor (Lei 3) |
| R-11 | Executor cruza fronteira "porque o arquivo estava alcançável" | Baixa | 🔴 Viola CODEX | revisão do diff por caminho | reverter | imediatamente | **Hamilton** |
| R-12 | Declarar "pronto" com build verde e caminho não provado | **Alta** | 🟠 Prova falsa | critério de saída exige efeito | refazer a prova | — | Revisor (Lei 1) |
| R-13 | Migration 007 falha em base limpa (L-02) | Alta | 🟠 Bloqueia 2º tenant | rodar migrate em base nova | corrigir 007 | — | Fora do escopo D-02 |

---

## 10. Unknown unknowns

**Known knowns** — medido, com evidência
Núcleo financeiro sólido (BIGINT, trigger append-only, integridade no banco) · build e 12 testes
verdes · `JWT_SECRET` fail-closed (conforme PLY-006) · roteamento sem discriminador de produto ·
`senha_hash` na tabela errada · dois caminhos de SSL divergentes · `.env` com 4 chaves não usadas.

**Known unknowns** — sei que não sei (estão no ledger)
Colunas reais do master (D-07) · quem mais escreve em `user_nomes` (D-08) · existe CA? (D-09) ·
as chaves de IA são as mesmas da Frota? (L-01) · a migration 007 roda limpa? (L-02).

**Unknown knowns** — conhecimento tácito seu que o plano assume e você não me disse
- Se o **Pinheirão já está em produção** ou ainda é piloto. Muda tudo: com usuários reais, F2 e F3
  precisam de janela; sem eles, dá para ser direto.
- Quantos usuários existem em `user_nomes` do Pinheirão. Se forem 3, a migração preguiçosa fecha
  em dias; se forem 200 com gente que loga uma vez por mês, o texto puro sobrevive meses.
- Se o banco do tenant é **exclusivo** do Kuatiá ou compartilhado com outro produto SoftHam —
  é o que determina se `db_nome` serve como discriminador.
- Qual é a **superfície de rede real**: o backend fica só na sua máquina (como o ADM, `CAT-001 X7`)
  ou vai publicado? Se ficar local, R-05 e o rate limit caem de prioridade.

**Unknown unknowns** — o que nem sei perguntar, com o palpite honesto de onde mora
1. **O que mais lê `user_nomes` além de login.** Se algum produto sincroniza essa tabela por job,
   `ADD COLUMN` pode entrar num `SELECT *` → `INSERT` que eu não previ.
2. **Se o master tem trigger/view sobre `empresas`.** Filtrar por coluna que uma view esconde
   produz resultado diferente do esperado.
3. **Comportamento do pool sob TLS ligado com pgpool no meio.** O `PLY-001` registra um apagão de
   Pgpool que derrubou 10 sistemas. Se houver pgpool entre o app e o Postgres, TLS ponta-a-ponta
   pode não ser o que parece.
4. **Se `docs/brand` já foi mostrado ao cliente.** Se sim, o nome não é mais escolha técnica
   nenhuma (Lei 10 do PLY-008) — e o D-01 já é fato consumado, não decisão.

---

## 11. Armadilhas de ferramenta (não portar hábito cegamente)

- **`pg` + pool sob demanda:** erro de TLS/credencial aparece no **primeiro request**, não no boot.
  Um `/health` verde não prova conexão.
- **`express-rate-limit` atrás de proxy:** sem `app.set('trust proxy', ...)` todos os clientes
  compartilham o IP do proxy → um usuário bloqueia todos. Configurar junto, não depois.
- **`cors()` sem argumento** libera qualquer origem. A allowlist tem que cobrir o Vite em dev
  (`5173`) **e** o host de produção, ou o front quebra em um dos dois.
- **`bcrypt.compare` é assíncrono e lento por desenho** (~100ms). Combinado com rate limit é bom;
  sem rate limit, vira vetor de DoS barato.
- **`ADD COLUMN` no Postgres é instantâneo** para nullable sem default — não trava tabela. O risco
  não é o lock, é o **código de terceiros** que assume a forma da tabela.
- **Git no Windows:** `core.autocrlf` pode transformar o diff inteiro em ruído no primeiro commit.
  Definir antes, não depois.

---

## 12. Comandos prontos

**Iniciar a execução (por fase):**
```
Leia o WAR-GAME.md completo. Não replaneje. Execute somente a Fase 0.
Não avance sem autorização. Se encontrar falha, consulte a tabela de riscos (§9)
antes de improvisar. Pare ao final e entregue relatório curto.
```

**Próxima fase:**
```
Execute somente a próxima fase aprovada. Não pule critérios de saída.
Não altere decisões arquiteturais sem aprovação. Pare ao final.
```

**Travamento:**
```
A execução travou. Consulte WAR-GAME.md §9 e ledger.md. Explique:
qual risco ocorreu, qual sinal apareceu, qual contra-ação recomenda,
e se devemos continuar / abortar / voltar ao estrategista.
```

**Auditoria (revisor, postura adversarial):**
```
Audite o que foi implementado contra o WAR-GAME.md. Não reescreva.
Tente REFUTAR cada critério de saída declarado verde: a prova exercita
a ponta que o usuário usa, ou só o endpoint? Procure riscos faltantes
e pontos de loop. Proponha ajustes pontuais.
```

**Frase de controle ao fim de toda fase:**
```
Não implemente ainda. Não replaneje do zero.
Atualize ledger e README. Pare ao final da fase.
```

---

## 13. Próxima ação — **humana**

Este plano está **parado no gate**. Nada será executado até você responder, no formato:

```
Aprovo D-XX conforme recomendação (a). Registre no ledger. Não implemente ainda.
```

Bloqueiam o início: **D-05** (Fase 0) e **D-06** (Fase 1). As demais podem ser respondidas
quando a fase chegar.

---

## Histórico
| Versão | Data | Autor | Alteração |
|---|---|---|---|
| v1 | 2026-08-11 | Opus 5 (esforço alto) | War game inicial. Nasce da auditoria do protótipo + grounding contra o Corpus (SHC-000 Art. 3/7/9, CODEX, STD-001, PLY-001/004/005/006/008, CAT-001). Achados próprios do war game: **F3-A** (`senha_hash` criada no banco/tabela que o login não usa) e **F4-A** (dois caminhos de SSL divergentes). |
