# ledger.md — bloqueios, indefinições e decisões

> Tudo que **não sei** e que muda o plano se a resposta for outra. Nada aqui vira palpite.
> Regra: `[INDEFINIDO]` só sai daqui com resposta humana ou com leitura que produza evidência E2.

---

## Decisões já tomadas (gate humano — 2026-08-11)

| ID | Decisão | Resposta do Hamilton | Impacto |
|---|---|---|---|
| **D-01** | Nome canônico do produto na Frota | **Kuatiá** | Slot no Corpus = `products/kuatia/`. Código e exports já usam esse nome — zero renomeação. |
| **D-02** | Escopo da rodada | **Blindagem crítica + entrada no Corpus** | Fases 0–5. Lacunas funcionais (planilha, cancelamento, fluxo real) ficam fora desta rodada. |
| **D-03** | Senha em texto puro | **Confinar ao Financeiro** (dupla leitura) | Nenhum outro produto é tocado. O texto puro sobrevive em `user_nomes.senha` como dívida registrada com condição de saída. |
| **D-04** | Papel do `Z:\video-explicativo` | **É o manual do produto** | `products/kuatia/manual/*.md` é a fonte única; o vídeo é uma superfície dela, gerado depois. |

---

## Resolvidas em 2026-08-11 (durante a execução)

| ID | Como foi resolvida |
|---|---|
| **D-05** | Instrução do Hamilton: usar `T:\Financeiro` como repositório até existir git. Espelho criado, 114/114 arquivos. |
| **D-06** | Resolvida por procedimento em vez de pergunta: `.env` original preservado em `checkpoints/` antes de editar. Rollback é copiar de volta. |
| **D-07** | **Medida, não perguntada.** `db_nome` é o discriminador — 14 bancos, um por produto. O Kuatiá é `financeiro` (tenant 120, schema `pinheirao`). Filtro aplicado no login e no roteamento de pool. |
| **D-08** | Risco esvaziado pelo contexto: pré-produção, 1 usuário cadastrado, coluna nullable no fim via `ADD COLUMN IF NOT EXISTS`. Aplicada. |

> ⚠️ **Correção de moldura.** Eu tinha planejado como se o app estivesse em produção — janela
> de manutenção, risco de derrubar cliente, migração gradual de senha. O Hamilton corrigiu:
> **o Pinheirão não está em produção.** Boa parte do peso que eu colocara em D-05/D-07/D-08
> não existia. Registrado porque é o tipo de erro que se repete: presumir produção viva
> encarece o plano e atrasa a execução.

---

## Resolvidas em 2026-09-22 (Fases 9, 10, 11 e 12 — Retomada, Projeção, Cancelamento, Planilhas e DRE)

| ID | Como foi resolvida |
|---|---|
| **D-05** | **Git Oficial Ativo e Pareado:** Repositório inicializado em `e:\Sistemas_ia\Financeiro`, `.gitignore` blindado protegendo credenciais e `.env*`, pareado com `https://github.com/SoftHam-704/kuatia.git` (`main`). Espelho local em `T:\Financeiro` preservado. |
| **B-01 (Fronteira §7)** | **Projeção de Saldo Acumulado no Fluxo de Caixa (Fase 9):** Resolvida a lacuna funcional de liquidez. O backend calcula saldo inicial das caixas/bancos antes de `desde` e projeta o saldo acumulado corrido dia a dia por moeda (PYG/USD/BRL separados). Front-end e exportações (Excel/PDF) atualizados com cartões de saldo inicial e coluna de saldo acumulado. Relatório em `outputs/fases/F9-flujo-caja-saldo-acumulado.md`. |
| **B-02 (Fronteira §7)** | **Cancelamento de Contas com Auditoria (Fase 10):** Resolvida a lacuna funcional de cancelamento de contas a pagar e receber. Criado domínio puro de regras (`cancellation.ts`), endpoints `POST /:id/cancelar` em `payables.routes.ts` e `receivables.routes.ts`, gravação de auditoria em `auditoria_eventos`, trava de segurança impedindo cancelamento de contas com baixas ativas e impedindo baixas em contas canceladas. Frontend atualizado com badge `.ds-badge--cancelado`, filtro por canceladas e botão de cancelar conta com prompt de motivo. Corpus atualizado em `contexto.md` (§7) e manuais 03 e 04. Relatório em `outputs/fases/F10-cancelamento-de-contas.md`. |
| **B-03 (Fronteira §7)** | **Carga Inicial em Lote por Planilha CSV / Excel (Fase 11):** Resolvida a lacuna funcional de implantação em lote de clientes/fornecedores e contas abertas com saldos legados. Suporte a CSV e pastas de trabalho Excel (.xlsx) via backend `ExcelJS`, endpoint de download de modelos com dados de exemplo (`GET /planilla/plantilla`), conferência prévia linha a linha no Cockpit MDI com badges de erro/válida sem frear linhas boas, proteção idempotente por hash de arquivo e auditoria formal em `auditoria_eventos`. Corpus atualizado em `contexto.md` (§7) e manual 07. Relatório em `outputs/fases/F11-importacao-planilhas.md`. |
| **B-04 (Fronteira §7)** | **Resultado Gerencial com Movimentos de Caixa (Fase 12):** Resolvida a lacuna funcional onde despesas e receitas diretas de caixa não apareciam no DRE. Backend integra movimentos manuais (`movimientos_caja` com `origen = 'MA'` e `cuenta_plan_id IS NOT NULL`) ponderados pela natureza da conta contábil (`D` vs `R`), calculando totalizadores isolados por moeda (`PYG`, `USD`, `BRL`). Cockpit MDI enriquecido com cards de KPI (Ingresos, Egresos, Resultado neto) por moeda ativa. Exportações (Excel/PDF) e Corpus alinhados. Relatório em `outputs/fases/F12-resultado-gerencial-com-caixa.md`. |
| **P-01 (Deprecation)** | **Concorrência de Query no PoolClient:** Resolvido o `DeprecationWarning: Calling client.query() when the client is already executing a query`. Chamadas concorrentes `Promise.all` sobre o mesmo cliente no tenant context foram convertidas para sequenciais. |

---

## Decisões PENDENTES (bloqueiam a fase indicada)

### ✅ D-11 — RESOLVIDA em 2026-08-11 · papel `kuatia_adm` criado e provado

Instrução do Hamilton: *"remova isso imediatamente, crie um usuário adm pra mim, siga as mesmas
regras do RepOne"*. Ele dispensou o arranjo de "o dono cunha o segredo" — decisão dele, executada.

Papel `kuatia_adm` (`NOSUPERUSER NOBYPASSRLS`), senha gerada na aplicação e escrita no `.env`,
grants mínimos nos dois bancos. Teste de vazamento refeito **depois** da troca: 0 linhas em
5 tabelas com tenant inexistente; o tenant certo segue enxergando; login e painel a 200.

Efeito colateral da instrução: ao ler a referência do RepOne apareceu o
`knowledge/PADRAO-login-master-tenant.md`, que corrigiu meu enquadramento do filtro `db_nome` —
o risco não é ambiguidade (`cnpj` é UNIQUE na tabela inteira), é **admissão indevida**. O código
e o comentário foram alinhados à referência (`RepOne V2 postgres-gateways.ts:60-88`).

*Texto original da decisão preservado abaixo como histórico.*

<details><summary>D-11 (como estava aberta)</summary>
- **O que falta:** uma senha sua e a execução de `backend-financeiro/infra/001_role_app.sql`.
- **Por que importa:** medido em 2026-08-11 — `webadmin` é `rolsuper` **e** `rolbypassrls`.
  Com `app.tenant_id=999999` (inexistente), a consulta devolveu **2 empresas**. Todo o
  isolamento multiempresa do produto está inativo enquanto o app conectar assim.
- **Fase que depende:** nenhuma — é transversal. Sem isso, o RLS é enfeite.
- **Assumível temporariamente:** só porque é pré-produção. **Bloqueia o aceite de produção.**
- **Pergunta:** rodo o script com uma senha que você me passe, ou você prefere rodar e colar
  no `.env`? O procedimento manda o segredo nascer com o dono (PLY-006 §5), então minha
  recomendação é a segunda.

</details>

### D-05 — Backup: commit local basta, ou precisa de remoto privado antes?
- **O que falta:** o CAT-001 `X4` marca "4 de 9 produtos sem repositório git" como risco **alto**,
  e a razão é *"sem histórico nem backup"*. Um `git init` local dá histórico; **não dá backup**.
- **Por que importa:** se a máquina falhar durante as fases 1–4, o ponto de retorno vai junto.
- **Fase que depende:** Fase 0 (é o critério de saída dela).
- **Assumível temporariamente:** sim — `git init` local, remoto depois.
- **Risco de assumir errado:** baixo (perda só em falha de disco durante a rodada).
- **Pergunta:** crio só o repo local, ou você quer um remoto privado (`SoftHam-704/...`) já na
  Fase 0? Se sim, quem cria — você tem a credencial.

### D-06 — O `.env` da raiz é exclusivo deste projeto?
- **O que falta:** não sei se `e:\Sistemas_ia\Financeiro\.env` é lido por algum outro processo
  seu. Ele contém chaves de IA e da Evolution API que **nenhuma linha deste repo importa**
  (verificado: zero import de IA no `src/`).
- **Por que importa:** se for compartilhado, reduzi-lo quebra o vizinho — e isso é fronteira
  de produto, onde eu paro por regra do CODEX.
- **Fase que depende:** Fase 1 (é o critério de aborto dela).
- **Assumível temporariamente:** **não**. Reduzir um `.env` compartilhado é destrutivo e silencioso.
- **Pergunta:** esse `.env` foi copiado de outro projeto e é só deste, ou algo mais lê dele?

### D-07 — Qual coluna do master discrimina o produto?  🔴 **maior indefinição do plano**
- **O que falta:** o PLY-006 manda filtrar `db_nome='<produto>'` no roteamento de tenant, porque
  `master.public.empresas` é compartilhado por toda a Frota. **Eu não li o master.** Não sei que
  colunas existem, se há coluna de produto/sistema, nem qual valor corresponde ao Kuatiá.
- **Por que importa:** hoje [master-auth.service.ts:55-63](../backend-financeiro/src/modules/auth/master-auth.service.ts#L55-L63)
  resolve só por `cnpj` + `status='ATIVO'`. Dois modos de falha: CNPJ em 2 produtos → login
  negado com mensagem errada; CNPJ de **outro** produto → o Kuatiá conecta no banco alheio.
- **Fase que depende:** Fase 2 inteira.
- **Assumível temporariamente:** **não.** Chutar o discriminador num banco compartilhado pela
  Frota é exatamente o "não inventar fato ausente".
- **Mitigação sem decisão:** a Fase 2 começa com **leitura read-only** do master (listar colunas
  de `public.empresas` + as linhas do CNPJ do Pinheirão). Leitura não é escrita — permitida. Só
  depois se escolhe o filtro.
- **Pergunta:** posso rodar esse SELECT read-only no master com as credenciais do `.env`? E você
  sabe de cabeça se há coluna de produto, ou se a convenção é mesmo pelo nome do banco?

### D-08 — Posso adicionar `senha_hash` em `<schema>.user_nomes`?  🔴 **fronteira de produto**
- **O que falta:** autorização para um `ALTER TABLE` numa tabela que **outros produtos leem**.
- **Por que importa (achado do war game, F3-A):** a migration
  [master-migrations/001](../backend-financeiro/master-migrations/001_financeiro_master_identity.sql#L1)
  criou `senha_hash` em `master.public.usuarios` — mas o login valida contra
  `<schema>.user_nomes` no banco do **tenant**
  ([master-auth.service.ts:89-95](../backend-financeiro/src/modules/auth/master-auth.service.ts#L89-L95)).
  **São tabelas diferentes em bancos diferentes.** A coluna existe onde ninguém a usa. Para o
  D-03 funcionar, o hash tem que morar onde a senha mora.
- **Fase que depende:** Fase 3.
- **Assumível temporariamente:** **não.** `ADD COLUMN NULL` no fim é aditivo e seguro para
  `SELECT *` e para `INSERT` com lista de colunas — mas **quebra `INSERT` posicional sem lista**,
  e eu não sei quem mais escreve em `user_nomes`.
- **Pergunta:** algum outro produto faz `INSERT INTO user_nomes VALUES (...)` sem nomear colunas?
  Se você não souber de cabeça, o plano manda testar em banco descartável primeiro (PLY-006 §3).

### ✅ D-09 — RESPONDIDA por medição em 2026-08-11 · **não é decisão nossa**

```
pg.Pool({ ssl: { rejectUnauthorized: false } })
→ "The server does not support SSL connections"
```

Não é questão de CA: **o Postgres do SaveInCloud não tem SSL habilitado**. Ligar
`DATABASE_SSL=true` derruba todas as conexões.

⇒ **TLS sai da lista de conserto e vira pedido de infra.** Ou o provedor habilita SSL no
`node254556-salesmaster:12998`, ou o app passa a falar com o Pgpool interno
(`10.100.33.74:5432`, ver `L-06`) se aquele endpoint aceitar. Enquanto isso, o dado financeiro
trafega em claro — e isso é limitação do ambiente, não dívida de código.

*Correção do meu próprio veredito: eu listei TLS como bloqueador que "são horas, não dias, e não
depende de código novo". Depende de terceiro. A frase estava errada.*

<details><summary>D-09 (como estava aberta)</summary>

#### D-09 — TLS: existe CA verificável, ou fica cifrado-sem-autenticar?
- **O que falta:** saber se o Postgres remoto apresenta certificado verificável.
- **Por que importa:** o código atual usa `rejectUnauthorized:false`
  ([database.ts:28,40,63](../backend-financeiro/src/config/database.ts#L28)) — cifra, mas não
  autentica o servidor. Ligar validação sem a CA derruba **todas** as conexões.
- **Fase que depende:** Fase 4.
- **Assumível temporariamente:** sim, com registro — `rejectUnauthorized:false` é pior que TLS
  real e **muito melhor** que o estado atual do pool de tenant (hoje sem TLS nenhum, porque
  `DATABASE_SSL` não existe no `.env`).
- **Pergunta:** você consegue o certificado/CA do provedor do banco? Se não, aprovo registrar
  como dívida com condição de saída em vez de fingir que está resolvido.

</details>

---

### D-12 — Desbloquear o tenant no master  🔴 **é sua, não minha**

O tenant do Kuatiá está com **`bloqueio_ativo = 'S'`** em `master.public.empresas` — o default da
coluna, que o provisionamento não trocou. É o mesmo achado que o DBA do QuickCash documenta:
*"todo INSERT novo precisa setar `bloqueio_ativo='N'` explicitamente, senão o tenant fica criado
mas ninguém consegue logar."*

Hoje ninguém percebe porque **o Kuatiá não lê a coluna** — e é justamente isso que a invariante 7
do `PADRAO-login-master-tenant` proíbe (*"empresa bloqueada perde novas sessões imediatamente"*).

**Os dois defeitos são entrelaçados:** corrigir só o código trancaria o Pinheirão para fora.
A ordem é: **primeiro o dado, depois o filtro.**

Tentei corrigir o dado e fui barrado — o `kuatia_adm` só tem `SELECT` em `empresas` (correto, por
desenho), e a escrita com credencial de administração num banco compartilhado por 14 produtos foi
recusada pelo classificador da estação. **A guarda está certa** e não contornei.

```sql
-- rodar como administrador no banco salesmasters_master
UPDATE public.empresas SET bloqueio_ativo = 'N'
 WHERE db_nome = 'financeiro' AND status = 'ATIVO'
   AND COALESCE(bloqueio_ativo,'N') = 'S';
-- deve afetar 1 linha (id 120). As 11 bloqueadas de outros produtos não são tocadas.
```

**O filtro no app está escrito e NÃO foi ligado**, para não deixar o sistema num estado
sabidamente quebrado. Assim que a linha estiver `'N'`, ligo nos dois gateways e provo.

### D-10 — Quem escreve a linha do Kuatiá no CAT-001?
- **O que falta:** o `CAT-001` vive em `softham-corpus/products/softham-adm/` — **produto privado**,
  que por desenho nunca sobe ao bucket. Escrever lá é cruzar fronteira.
- **Por que importa:** o Kuatiá não tem linha no catálogo, e acabou de acrescentar a 5ª cópia
  das chaves que o `A1` já marca como risco de frota.
- **Fase que depende:** Fase 5.
- **Assumível temporariamente:** sim — eu **proponho o texto**, você cola.
- **Pergunta:** confirma esse arranjo, ou prefere que eu escreva direto?

---

## Indefinições de fato (não bloqueiam, mas mudam a conclusão)

### ✅ L-04 — RESOLVIDA em 2026-08-11 · provisionar tenant virou um comando

`npm run migrate:tenant -- <schema>`. Migrations separadas em `public/` × `tenant/`, DDL do
tenant sem `public.`, schema de destino como argumento validado, e `<schema>.schema_migrations`
dentro do próprio alvo. **Provado** criando `tenant_teste` do zero e comparando objeto a objeto
contra o `pinheirao`: 0 diferenças estruturais, 0 funções divergentes, nenhum default apontando
para o schema de origem. Relatório: [`outputs/fases/F7-provisionamento-de-tenant.md`](outputs/fases/F7-provisionamento-de-tenant.md).

Nasceu do `RECADO-SCHEMA-DO-TENANT.md`, que também achou o defeito que eu não tinha visto: a
`015` escolhia o tenant por `ORDER BY id LIMIT 1` e o controle de migrations era global — juntos,
fariam um tenant novo nascer **vazio com mensagem de sucesso**.

*Texto original preservado abaixo.*

<details><summary>L-04 (como estava aberta)</summary>

#### L-04 — Não existe receita para provisionar um tenant novo
A migration `015` **move** o que existe de `public` para o schema do tenant; ela não **cria** a
estrutura num schema vazio. Depois dela, o segundo tenant tem onde morar — mas ninguém tem como
construir a casa dele: seriam necessárias as 21 tabelas, 6 funções, 5 triggers e 16 policies
recriadas a partir de um molde.

**Por que importa:** o produto se vende como multiempresa/multi-tenant. Hoje ele atende **um**
tenant e não sabe abrir o segundo sem trabalho manual de DBA.
**Assumível temporariamente:** sim — há um tenant só, em desenvolvimento.
**Condição de saída:** existir `infra/provisionar-tenant.sql` (ou script equivalente) que crie um
schema de tenant completo e seja **provado** criando um segundo schema descartável e conferindo
que ele isola do primeiro.

</details>

---

### L-05 — Pool por tenant roteado × Pgpool compartilhado  🟠 **vigiar**
`getRoutedTenantPool` cria um pool `max: 8` por destino. Com 5 tenants ativos são 40 conexões no
Pgpool que **toda a frota SoftHam** compartilha — e foi proliferação de conexão que derrubou o
cluster em junho de 2026. Os pools já são cacheados por destino (não por request), então o número
é limitado; mas cresce linearmente com tenants.
**Condição de saída:** medir o total sob 3+ tenants ativos e decidir com a infra se ajusta
`num_init_children` no Pgpool. **Não mexer no `max` do app** — é o erro que o `PADRAO-cluster-compartilhado`
registra.

### L-06 — O `.env` aponta para o nó fixo, não para o Pgpool  🟠 **aberto**
`DB_HOST=node254556-salesmaster…:12998` é o nó. O master já tem 55 das 68 empresas apontando
para o Pgpool interno `10.100.33.74:5432`. Em failover, quem está preso ao nó passa a falar com
um standby em read-only — e o app quebra de um jeito que não parece problema de banco.
**Condição de saída:** o destino gravado por tenant no master ser o Pgpool, e o `.env` do app
acompanhar. *(Levantado no `RECADO-SCHEMA-DO-TENANT.md`.)*

### L-01 — As chaves de IA daqui são as MESMAS dos outros 4 produtos?
O `CAT-001 §5` registra que isso **nunca foi confirmado** nem para os 4 produtos já catalogados
("o nome de variável idêntico sugere reuso, mas sugestão não é evidência"). Consequência prática:
**se forem as mesmas, limpar o `.env` daqui não reduz exposição nenhuma** — só a rotação no
provedor reduz. Se forem distintas, limpar já resolve. Não dá para responder sem os olhos do
Hamilton (o catálogo é explícito: comparar valores é tarefa humana).

### L-02 — A migration `007` roda numa base limpa?
[007_tenant_user_directory.sql](../backend-financeiro/migrations/007_tenant_user_directory.sql#L2)
faz `UPDATE ... WHERE id = 120` e `CREATE TABLE IF NOT EXISTS pinheirao.user_nomes` **sem
`CREATE SCHEMA`**. Minha leitura (E2) é que `npm run migrate` falha em base nova. **Não retestei**
— não rodei migration em banco descartável. É E2 de leitura, não E3 de execução. Fora do escopo
D-02, mas vira bloqueio no dia do segundo tenant.

### L-03 — O `git init` sem `.gitignore` correto é o risco mais subestimado da rodada
A Fase 0 parece a mais trivial e é a mais perigosa: o `.env` da raiz tem chaves **vivas de outros
produtos**. Entrar no primeiro commit as coloca no histórico permanentemente — e o `CAT-001 X2`
já registra a família desse erro (`.env` dentro de artefato de build, em 2 produtos). Por isso a
Fase 0 escreve o `.gitignore` **antes** do primeiro `git add`, e verifica antes de commitar.
