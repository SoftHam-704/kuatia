# Relatório — F6: dados do tenant saem de `public`

**Data:** 2026-08-11 · **Origem:** achado do Hamilton · **Estado:** fechada, provada por efeito

---

## O erro

O protótipo guardava **todas as 21 tabelas de negócio em `public`**. O `public` é do banco, não
de um cliente: ele serve o que é comum a todos os tenants. Com tudo lá:

- **o segundo tenant não teria onde morar** — duas empresas do mesmo grupo cabem por `tenant_id`,
  mas dois grupos diferentes colidiriam na mesma tabela;
- o `db_schema` do master já apontava para `pinheirao`, e esse schema só tinha `user_nomes` —
  o roteamento existia e não levava a lugar nenhum;
- o isolamento dependia **inteiramente** do RLS. Com o `webadmin` superuser que o app usava até
  hoje de manhã, isso significava **zero isolamento**.

## O que foi feito

| Fica em `public` (comum) | Vai para `pinheirao` (do tenant) |
|---|---|
| `schema_migrations` | 21 tabelas de negócio |
| `plantillas_plan_cuentas` + `_items` | 6 funções (2 de policy, 4 de trigger) |
| `tenants` | 5 triggers de integridade |

`migrations/015_tenant_schema.sql`, dirigida por `tenants.login_schema` — sem nome de schema
escrito no código.

**Duas armadilhas que a migration teve que tratar:**

1. **Mover função não reescreve o corpo.** `ALTER FUNCTION ... SET SCHEMA` leva a função, mas
   `FROM public.cuotas_pagar` continua dizendo `public`. As 6 foram **recriadas** sem qualificar
   schema, com `search_path` fixo no schema do tenant.
2. **A policy guarda a referência resolvida.** Mover a tabela leva a policy junto — apontando
   para a função **antiga**, cujo corpo procura tabelas que já não estão lá. As 16 policies
   foram recriadas. E a subconsulta dentro da policy precisa de tabela **qualificada**: o
   `search_path` de quem roda a migration não vale na hora de usá-la.

## Mudança de código

`withTenantContext` passou a fixar `SET LOCAL search_path TO "<schema>", public` na transação, com
o schema vindo do `db_schema` do master a cada requisição — nunca do token (invariante 2 do
`PADRAO-login-master-tenant`). `resolveTenantPool` virou `resolveTenantRoute`, devolvendo pool
**e** schema; `AuthContext` carrega os dois.

**143 referências** perderam o prefixo `public.` em 14 arquivos. As que ficaram são as que devem
ficar: `public.empresas` do **master** (outro banco), `public.tenants`, `public.plantillas_*` e o
controle de migrations.

De quebra saiu a segunda fonte de verdade do schema: `users.routes.ts` buscava
`tenants.login_schema` para montar o próprio `search_path`, enquanto o roteamento vinha do master.
Agora há um lugar só.

## Credencial de DDL

A migration falhou na primeira tentativa com erro de permissão — **e isso estava certo**:
`kuatia_adm` não é dono das tabelas, então não faz DDL. Entrou `DB_ADMIN_USER`/`DB_ADMIN_PASSWORD`,
usados **só** por `npm run migrate`. Quem serve requisição não muda estrutura.

## Provas

```
public tem só as 4 comuns                              PASSA
22 tabelas em pinheirao (21 + user_nomes)              PASSA
6 funções no schema do tenant, search_path correto     PASSA
5 triggers de integridade no schema do tenant          PASSA
dados preservados: 2 empresas, 1 usuário, 35 contas    PASSA
tenant inexistente → 0 linhas em 4 tabelas             PASSA
login → 200 · 11 rotas autenticadas → 200              PASSA
```

`npm run build` limpo · `npm test` 12/12.

## O que isto NÃO resolveu

**Provisionar um tenant novo continua sem receita.** A migration 015 **move** o que existe; ela
não **cria** a estrutura num schema vazio. Hoje o segundo tenant tem onde morar, mas ninguém tem
como construir a casa dele. Isso é trabalho próprio — um script de provisionamento que crie o
schema, as tabelas, as funções, os triggers e as policies a partir de um molde.

Registrado no ledger como **L-04**, não escondido atrás do "resolvido".
