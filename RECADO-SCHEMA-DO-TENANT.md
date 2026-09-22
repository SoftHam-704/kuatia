# RECADO — como sair do `public` e criar o schema do 2º tenant

> Deixado por Claude (sessão do RepOne) a pedido do Hamilton, 11/08/2026.
> Li as 15 migrations, o `src/scripts/migrate.ts` e o `.env`. Tudo abaixo é sobre
> **este** projeto, não teoria — os números citados vieram dos próprios arquivos.

---

## 1. O diagnóstico: por que tudo caiu no `public`

Não foi descuido em uma migration. São **duas causas somadas**, e as duas precisam
ser resolvidas — corrigir uma só não adianta:

**Causa A — o migrador não sabe o que é schema.** O `src/scripts/migrate.ts` abre
uma conexão e roda o SQL cru, sem nunca tocar em `search_path`. Não existe
parâmetro de destino. Onde quer que o `search_path` da conexão aponte, é ali que
o objeto nasce — e o padrão é `public`.

**Causa B — o DDL fixa `public.` no nome.** Isso é o mais grave, porque anula
qualquer correção no migrador:

```
001_multitenant_core.sql        68 ocorrências de "public."
003_company_access_rls.sql      32
010_financial_integrity.sql     23
…                               ────
TOTAL das 15 migrations:        259
```

`CREATE TABLE IF NOT EXISTS public.tenants (…)` vai para `public` mesmo com o
`search_path` apontando para outro lugar. **O nome qualificado ganha do
`search_path`, sempre.** Então mexer só no migrador não muda nada: as 259
referências continuam mandando tudo para `public`.

---

## 2. A armadilha do `015`: ele conserta o 1º tenant e deixa o 2º quebrado

A migration `015_tenant_schema.sql` está bem escrita e bem comentada — o autor
entendeu o problema e acertou o `ALTER TABLE … SET SCHEMA`, inclusive a parte
sutil de que **funções precisam ser recriadas** porque mover não reescreve o corpo.

Mas ela resolve **um caso só**, e por dois motivos independentes:

**(a) `SET SCHEMA` MOVE, não COPIA.** Depois que as 21 tabelas saíram de `public`,
elas não estão mais lá. Rodar o `015` de novo para o tenant 2 encontra `public`
vazio, o `to_regclass` devolve NULL, o loop não faz nada — e o tenant 2 fica com
um **schema vazio, sem nenhum erro na tela**.

**(b) Ele escolhe o tenant errado, para sempre.** Nas linhas 41 e 257:

```sql
SELECT login_schema INTO esquema FROM public.tenants ORDER BY id LIMIT 1;
```

`ORDER BY id LIMIT 1` é **sempre o primeiro tenant cadastrado**. Não é "o tenant
que estou provisionando" — é o Pinheirão, hoje e daqui a dois anos.

**(c) O controle de migrations é global.** O `migrate.ts` grava em
`public.schema_migrations` e pula o que já está lá. Para um tenant novo, as 001–014
constam como aplicadas — então o migrador olha, diz "nada a fazer", e sai com
sucesso. **Schema vazio + mensagem de sucesso** é o pior resultado possível: ninguém
vai investigar um processo que disse que deu certo.

> Resumindo: hoje o sistema consegue atender o Pinheirão. O segundo cliente entra
> com um schema vazio e sem nenhum sintoma até alguém tentar usar.

---

## 3. A resposta à pergunta ("como clono a estrutura?")

**Neste projeto, não clone. Rode as migrations no schema novo.**

Clonar estrutura a partir do catálogo do banco é técnica de sistema **legado** —
serve quando o schema só existe dentro do banco e não há migration que o descreva
(foi o caso do Mastercount, onde precisei reconstruir o DDL lendo `pg_attribute`).

Aqui é o contrário: **as migrations são a fonte da verdade** e estão versionadas no
git. Clonar de um schema vivo troca uma fonte confiável por uma cópia — e a cópia
carrega junto todo defeito que o schema de origem tiver acumulado, inclusive os
que você ainda não descobriu.

### O que precisa mudar

**1. Separar as migrations em duas pastas**, porque elas têm ciclos de vida diferentes:

```
migrations/public/    → o que é do BANCO, existe uma vez só
                        schema_migrations, tenants,
                        plantillas_plan_cuentas(_items)

migrations/tenant/    → o que é de CADA cliente, roda uma vez por schema
                        empresas, usuarios, cuentas_pagar, cuotas_pagar,
                        bajas_pagar, cajas, movimientos_caja, … (as 21)
```

**2. Tirar o `public.` do DDL do tenant.** As 259 ocorrências: as que apontam para
tabela de tenant ficam **sem qualificar** (quem resolve é o `search_path`); as que
apontam para tabela compartilhada (`public.tenants`, `public.plantillas_*`) **continuam
qualificadas de propósito** — e vale um comentário na linha dizendo por quê, senão
alguém "padroniza" isso depois e quebra tudo.

**3. O migrador recebe o schema de destino:**

```ts
// npm run migrate:tenant -- pinheirao
const schema = process.argv[2];
await client.query(`CREATE SCHEMA IF NOT EXISTS ${ident(schema)}`);
await client.query(`SET LOCAL search_path TO ${ident(schema)}, public`);
```

⚠️ `ident()` = validar contra `^[a-z_][a-z0-9_]*$` **antes** de interpolar. Nome de
schema não entra como `$1` em DDL, então é interpolação de string — e interpolação
sem validação é injeção de SQL.

**4. O controle de migrations vai para dentro do schema do tenant:**
`<schema>.schema_migrations`, não `public.schema_migrations`. Cada tenant tem a
própria contagem. Sem isso, o problema (c) da seção 2 volta.

Feito isso, criar cliente novo vira **um comando**, e o schema nasce idêntico ao
que o git descreve — não parecido com o do vizinho.

### O `015` depois disso

Ele vira o que realmente é: **reparo único do Pinheirão**, não peça do fluxo de
provisionamento. Deixe isso escrito no cabeçalho dele, senão daqui a seis meses
alguém tenta usá-lo para criar o tenant 3 e cai no schema vazio silencioso.

---

## 4. Se um dia precisar clonar de verdade

Só há um caso legítimo: replicar no destino uma alteração feita **à mão** no banco,
que não está em migration nenhuma. (Se isso acontecer, o problema de verdade é a
alteração fora de migration — resolva a causa.)

Como não há `pg_dump` nem `psql` no servidor, o DDL sai do catálogo, **nesta ordem**:

1. `pg_sequences` → criar as sequences
2. `pg_attribute` + `format_type()` + `pg_get_expr()` → colunas e defaults
3. `pg_get_constraintdef()` → **PK, UNIQUE e CHECK primeiro**; FK só depois de todas
   as tabelas existirem
4. `pg_get_indexdef()` → índices
5. `ALTER SEQUENCE … OWNED BY` → religar sequence à coluna

### As três armadilhas que já custaram caro

**🚨 Default apontando para a sequence de origem.** É a pior. Ao reescrever
`origem.` → `destino.`, se um `nextval('origem.tabela_id_seq')` escapar, os dois
tenants passam a **compartilhar a numeração** — os IDs de um andam quando o outro
grava. Não dá erro, não aparece em teste, e quando alguém nota já há meses de dado.
**Confira default por default depois de clonar.**

**🚨 Reescrever com `split/join`, nunca com RegExp `\b`.** A barra invertida não
sobrevive à viagem shell → arquivo → driver, e o replace falha **em silêncio** —
parece que funcionou. Já perdi tempo com exatamente isso duas vezes no mesmo dia
(o outro caso foi `regexp_replace(x,'\D',…)`, que virou `[^0-9]`).

**🚨 `COMMIT` depois de erro é `ROLLBACK` respondendo "ok".** No PostgreSQL um erro
**aborta a transação inteira**. Capturar a exceção no JS com `.catch()` **não desfaz
o aborto** — o `COMMIT` seguinte devolve sucesso e não grava nada. Aconteceu comigo:
a operação disse "COMMIT ok" e criou **zero tabelas**. Dentro de transação, ou o
statement é obrigatório (deixe estourar), ou envolva em `SAVEPOINT`.

**Consequência prática:** nunca acredite na mensagem de sucesso. Confira no banco,
objeto a objeto — tabelas, colunas, sequences, PK/UNIQUE/FK, índices — comparando
as contagens entre origem e destino. Foi só a conferência que pegou o schema vazio.

---

## 5. Duas coisas que estão certas — não mexa

Confiro porque é fácil alguém "arrumar" e piorar:

**O pool está no tamanho certo.** `max: 8` (operacional), `max: 4` (master), com
`idleTimeoutMillis: 30_000`. Isso não é conservadorismo: **todos os sistemas SoftHam
batem no mesmo Pgpool**, e pool grande satura os child processes e derruba TODOS
juntos — já causou apagão geral. Se faltar conexão, ajusta-se `num_init_children` no
Pgpool com a infra, **nunca o `max` do app**.

⚠️ Um cuidado no `getRoutedTenantPool`: cada tenant roteado cria um pool novo de
`max: 8`. Com 5 tenants ativos são 40 conexões. Cachear o pool por destino (o RepOne
faz assim) e vigiar esse total conforme a base crescer.

**O `DB_HOST` está igual ao do RepOne** — `node254556-salesmaster…:12998`. É o padrão
da casa para o `.env` da aplicação, não é desvio.

Mas atenção ao que vier depois: o Master manda **55 empresas** apontarem para
`10.100.33.74:5432` (o Pgpool interno) e só 13 ainda usam o nó fixo. Quando este app
gravar destino de banco por tenant, **use o Pgpool**, não o nó — em failover, quem
está preso ao nó fixo fica falando com um standby em read-only e o app quebra de um
jeito que não parece problema de banco.

---

## 6. Ordem sugerida

1. Separar `migrations/public/` × `migrations/tenant/`
2. Limpar o `public.` do DDL de tenant (comentando os que ficam de propósito)
3. Migrador com schema de destino + `<schema>.schema_migrations`
4. **Provar com um tenant de teste**: criar `tenant_teste`, rodar, e conferir que
   nasceu com as 21 tabelas — e que **nenhum default aponta para `pinheirao`**
5. Marcar o `015` como reparo histórico
6. Só então provisionar o cliente real

O passo 4 não é opcional. É o único que distingue "funcionou" de "disse que
funcionou" — e a diferença entre os dois é a razão deste recado existir.
