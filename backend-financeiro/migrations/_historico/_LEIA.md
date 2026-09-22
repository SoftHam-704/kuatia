# `_historico/` — as 15 migrations que trouxeram o banco até aqui

> **Não rode nada daqui.** Estão preservadas porque contam *como* o banco chegou
> ao estado atual — o `git log` recupera bytes, não a razão da mudança.
> O que vale hoje é `migrations/public/` e `migrations/tenant/`.

## O que aconteceu

As 001–014 nasceram com **269 ocorrências de `public.`** escritas no DDL. Nome
qualificado ganha do `search_path`, sempre — então **todo** objeto nascia em
`public`, mesmo que a conexão apontasse para outro schema. O resultado foi um
banco onde os dados do primeiro cliente ocupavam o espaço que é do banco, e o
segundo cliente não teria onde morar.

A **015** corrigiu isso para o Pinheirão, movendo 21 tabelas, 6 funções e 5
triggers para o schema do tenant.

## Por que a 015 não serve para criar o próximo tenant

Três motivos independentes, e cada um sozinho já bastaria:

1. **`ALTER TABLE ... SET SCHEMA` move, não copia.** Depois que as tabelas
   saíram de `public`, elas não estão mais lá. Rodar a 015 de novo encontraria
   `public` vazio, o `to_regclass` devolveria NULL, o laço não faria nada — e o
   tenant novo ficaria com um schema vazio, **sem erro na tela**.
2. **Ela escolhe o tenant errado, para sempre.** `SELECT login_schema FROM
   public.tenants ORDER BY id LIMIT 1` é sempre o primeiro tenant cadastrado —
   o Pinheirão, hoje e daqui a dois anos. Nunca "o tenant que estou criando".
3. **O controle de migrations era global.** Gravava em
   `public.schema_migrations`; para um schema novo, as 001–015 já constariam
   aplicadas e o migrador diria "nada a fazer". **Schema vazio com mensagem de
   sucesso** é o pior resultado possível: ninguém investiga um processo que
   disse que deu certo.

Os três foram corrigidos na estrutura nova: DDL sem `public.`, schema de destino
como argumento, e `<schema>.schema_migrations` dentro do próprio alvo.

## O que herdamos daqui e continua valendo

- O modelo de três níveis (conta → parcela → livro de baixas) e o livro
  append-only por trigger. A ideia estava certa desde a 001.
- As guardas de integridade da 010 — a melhor peça do protótipo.

## Um defeito que veio daqui e foi corrigido

As policies da 008/012 escreviam `u.tenant_id = tenant_id` dentro de uma
subconsulta em que `u` também tem a coluna. O nome não-qualificado resolve para
a coluna de `u`: virava `u.tenant_id = u.tenant_id`, tautologia sempre
verdadeira. O predicado parecia conferir o tenant e não conferia nada.
Na estrutura nova está qualificado (`u.tenant_id = <tabela>.tenant_id`).

---

*Diagnóstico das causas A e B por Claude (sessão do RepOne), 11/08/2026, em
`RECADO-SCHEMA-DO-TENANT.md` na raiz do projeto.*
