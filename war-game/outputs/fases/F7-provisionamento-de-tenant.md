# Relatório — F7: provisionar tenant vira um comando

**Data:** 2026-08-11 · **Origem:** `RECADO-SCHEMA-DO-TENANT.md` (Claude, sessão do RepOne)
**Estado:** fechada, provada por comparação de schemas

---

## O recado estava certo nas três acusações

Verifiquei cada uma antes de executar:

| Acusação | Verificação |
|---|---|
| DDL fixa `public.` no nome | **269** ocorrências nas 15 migrations (o recado contou 259; a `015` cresceu depois) |
| A `015` escolhe o tenant errado, para sempre | `015_tenant_schema.sql:41` e `:257` — `ORDER BY id LIMIT 1` |
| Controle de migrations global | `migrate.ts:9,16,24` — `public.schema_migrations` |

E a consequência que o recado descreve — **schema vazio com mensagem de sucesso** — segue do
terceiro item: para um tenant novo, as 001–015 constam aplicadas, o migrador diz "nada a fazer"
e sai com código 0.

Também procede o diagnóstico de que `SET SCHEMA` **move e não copia**: depois da `015`, `public`
está vazio e o laço não teria o que mover.

---

## O que mudou

### Migrations em duas pastas, por ciclo de vida

```
migrations/public/     001_shared.sql            tenants, plantillas
                       002_seed_plan_inicial_py.sql
migrations/tenant/     001_baseline.sql          as 22 tabelas
                       002_integridade_e_rls.sql funções, triggers, policies
migrations/_historico/ 001..015 + _LEIA.md       preservadas, não rodam
```

**Zero `public.` no DDL de tenant** — exceto sete FKs para `public.tenants`, cada uma com
comentário na própria linha dizendo por que fica qualificada. Sem o comentário, alguém
"padroniza" isso em seis meses e a FK passa a procurar tabela inexistente.

### Migrador com alvo

```
npm run migrate:public
npm run migrate:tenant -- pinheirao
```

O schema passa por `ident()` — `^[a-z_][a-z0-9_]{0,62}$` — **antes** de ser interpolado.
Identificador não entra como `$1` em DDL; é interpolação, e interpolação sem validação é injeção.

**O controle foi para dentro do alvo:** `<schema>.schema_migrations`. Cada tenant tem a própria
contagem, e um schema novo não herda "já aplicado" do vizinho.

Os grants para o papel da aplicação rodam **depois** das migrations, dentro do mesmo comando —
senão o schema nasce e o app não o enxerga.

---

## Um defeito que a comparação revelou

As policies de `usuarios_tenants`, `usuarios_empresas` e `reportes_consolidados` diziam:

```sql
EXISTS (SELECT 1 FROM usuarios u WHERE u.id = usuario_id AND u.tenant_id = tenant_id AND ...)
```

Dentro da subconsulta, `tenant_id` sem qualificação resolve para a coluna de `u`. O predicado
virava **`u.tenant_id = u.tenant_id`** — tautologia sempre verdadeira. Parecia conferir o tenant
e não conferia nada.

Vem da migration 008 do protótipo, e eu **reproduzi na 015** ao recriar as policies. Corrigido na
baseline com o nome da tabela externa (`u.tenant_id = usuarios_tenants.tenant_id`), e verificado:
zero policies do `pinheirao` ainda contêm o padrão.

*Impacto real era baixo — o schema já isola clientes e o `tenant_id = app.tenant_id` externo
continua valendo. Mas um predicado que não faz nada e parece fazer é pior que a ausência dele.*

---

## A prova (o passo que o recado chama de não-opcional)

Criei `tenant_teste` do zero com os dois comandos e comparei **objeto a objeto** contra o
`pinheirao`: colunas com tipo, nulidade, identidade e default; constraints; índices; policies com
as expressões `USING`/`WITH CHECK`; estado do RLS; triggers; e o corpo das funções.

```
22 x 22 tabelas                                     PASSA
nenhuma tabela só de um lado                        PASSA
0 tabelas com diferença estrutural                  PASSA
6 x 6 funções, 0 com corpo diferente                PASSA
18 x 18 sequences                                   PASSA
nenhum default de tenant_teste referencia pinheirao PASSA
```

> ⚠️ A primeira rodada acusou "6 funções diferentes" — era o **meu normalizador**, que trocava
> `pinheirao.` mas não o nome sem ponto em `SET search_path TO pinheirao`. Corrigido o
> comparador, não o código. Vale registrar: um diff mal escrito acusa problema que não existe, e
> isso queima tanto tempo quanto o problema real.

E depois, no `pinheirao` já em uso:

```
dados intactos: 2 empresas, 1 usuário, 35 contas    PASSA
nenhuma policy com a tautologia                     PASSA
tenant inexistente vê 0 linhas em 4 tabelas         PASSA
login + 11 rotas autenticadas → 200                 PASSA
```

`tenant_teste` removido ao fim. `npm run build` limpo, `npm test` 12/12.

---

## Uma colisão que apareceu no caminho

`migrate:public` aplicou `001_shared.sql` e **pulou** `002_seed_plan_template.sql`: o nome batia
com um registro do conjunto antigo em `public.schema_migrations`. O dado já estava lá, então não
houve dano — mas é exatamente o salto silencioso que o recado descreve. Renomeado para
`002_seed_plan_inicial_py.sql`, e agora o conjunto novo está honestamente registrado.

---

## O que segue aberto

- **A 015 continua no histórico** com um `_LEIA.md` explicando que é reparo único do Pinheirão e
  por que não serve para criar o tenant 3.
- **`getRoutedTenantPool` cria um pool `max: 8` por tenant roteado** — o recado avisa: com 5
  tenants são 40 conexões no Pgpool compartilhado. Os pools já são cacheados por destino, mas o
  total precisa de vigilância conforme a base crescer. **Não mexer no `max` sem falar com a infra**
  (foi proliferação de conexão que derrubou o cluster em junho).
- **O `.env` aponta para o nó fixo** `node254556-salesmaster:12998`. O recado registra que 55 das
  68 empresas do master já apontam para o Pgpool interno `10.100.33.74:5432`. Quando este app
  gravar destino por tenant, o alvo é o Pgpool — em failover, quem está preso ao nó fala com um
  standby read-only e quebra de um jeito que não parece problema de banco.
