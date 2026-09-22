# Relatório — Fases 0 a 4

**Data:** 2026-08-11 · **Estado:** fechadas, com prova por efeito · **Nível:** E2/E3

---

## Mudança de contexto que reordenou o plano

O Hamilton informou que **o Pinheirão não está em produção** — o app ainda está em
desenvolvimento. Isso derrubou a moldura de risco que eu tinha montado: não há janela de
manutenção a respeitar, não há "cliente sem sistema", e DDL pode ser aplicado direto. As
decisões D-05 (backup) e D-07 (discriminador) foram resolvidas por instrução e por medição.

**Repositório:** até existir git, `T:\Financeiro` é o espelho (D-05 resolvido).

---

## 🔴 F0-A — O RLS não estava sendo aplicado

> **Evidência: E3** — medido por execução em 2026-08-11, não por leitura.

```
current_user = webadmin · rolsuper = true · rolbypassrls = true
SET app.tenant_id = 999999 (inexistente) → SELECT public.empresas → 2 linhas
```

As policies existem, estão corretas e têm `FORCE ROW LEVEL SECURITY`. Nenhuma é aplicada:
o PostgreSQL **não aplica RLS a superuser**, por desenho, sem erro e sem aviso.

O isolamento multiempresa — que o spec original chamou de inegociável, e por causa do qual a
IA anterior escolheu RLS em vez de schema-por-empresa — **estava inativo**. Os `WHERE
tenant_id = $1` do código continuam filtrando; a rede que existia para pegar o `WHERE`
esquecido tinha efeito zero.

### ✅ CORRIGIDO no mesmo dia — papel `kuatia_adm`

Por instrução do Hamilton ("remova isso imediatamente, crie um usuário adm pra mim, siga as
mesmas regras do RepOne"), o papel foi criado e aplicado, não deixado como script pendente.

`kuatia_adm` · `NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION` ·
`CONNECTION LIMIT 20`. Senha gerada na aplicação e escrita direto no `.env`. Grants mínimos:
leitura em `master.public.empresas` e `auth.products`, escrita só em `auth.sessions`; CRUD no
`public` do tenant; `SELECT/INSERT/UPDATE` (sem DELETE) em `pinheirao.user_nomes`.

**Prova depois da troca:**

```
current_user = kuatia_adm · rolsuper = false · rolbypassrls = false
tenant inexistente → 0 linhas em empresas, cuentas_pagar, cuentas_cobrar,
                     movimientos_caja, cajas
tenant 120 / usuário 1 → 2 empresas (continua enxergando o que é dele)
master.empresas → escrita recusada
login real → 200 · GET /empresas → 200 · GET /panel → 200
```

> **Inconclusivo, registrado como tal:** tentei provar o trigger append-only de `bajas_pagar`
> com um `UPDATE`, mas a tabela tem 0 linhas — o `BEFORE UPDATE` nunca disparou. O trigger
> existe e está habilitado (`pg_trigger`, `tgenabled='O'`, E2 por leitura), mas **não foi
> exercitado contra linha real**. Não é falha do código; é prova que não aconteceu.

---

## F0 — Rede de segurança ✅

- `T:\Financeiro` espelha o projeto: **114/114 arquivos** (exclui `node_modules`, `dist`).
- `.env` original preservado em `war-game/checkpoints/.env.original`.

---

## F1 — Descontaminação do `.env` ✅

Levantamento fechado de `process.env` no `src/`: 15 variáveis usadas. O `.env` tinha 10 a mais.

**Removidas** (nenhuma linha do repo as importa): `GEMINI_API_KEY`, `OPENAI_API_KEY`,
`ANTHROPIC_API_KEY`, `AI_PROVIDER_ORDER`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`,
`EVOLUTION_WEBHOOK_SECRET`, `JWT_EXPIRES_IN` (a expiração é fixa em `12h` no código).

**Acrescentadas:** `CORS_ORIGINS`, `MASTER_PRODUCT_DB`, `DATABASE_SSL` explícito.

`.env.example` reescrito: documentava 3 variáveis e omitia `JWT_SECRET` e todas as
`MASTER_DB_*` — ninguém subia o ambiente por ele.

> ⚠️ **Isto é higiene, não segurança.** Se as chaves removidas forem as mesmas dos outros
> 4 produtos do `CAT-001 A1`, apagá-las daqui não reduz exposição nenhuma — só a rotação no
> provedor reduz. Fica como pedido ao dono (L-01).

> ⚠️ **Achado adicional:** `JWT_SECRET` vale `salesmasters-v2-super-secret-key-2026` — herdado
> do SalesMasters. Segredo compartilhado entre produtos faz um token servir nos dois. Marcado
> no `.env`; a troca é do dono.

---

## F2 — Discriminador de produto ✅

**D-07 respondido por medição.** `master.public.empresas` não tem coluna de produto; as
`modulo_*` são flags de feature. O discriminador é **`db_nome`**: 14 bancos, um por produto —
`basesales` (37 empresas), `salesspot` (8), `base_dfe` (4), `quickcash` (4)… e `financeiro` (1).

Tenant do Kuatiá: **id 120 · COLORADO EXPORTADORA - FILIAL PINHEIRÃO · `db_nome=financeiro` ·
`db_schema=pinheirao`**. Nenhum CNPJ ativo duplicado hoje — o furo não estava vivo, mas
estava a uma linha de distância.

Filtro aplicado nos **dois** pontos: `authenticateInMaster` (login) e `resolveTenantPool`
(cada request autenticado).

---

## F3 — Senha com bcrypt e dupla leitura ✅

Confirmado o achado **F3-A**: `pinheirao.user_nomes` não tinha `senha_hash`. A coluna criada
pela master-migration está em `master.public.usuarios`, tabela que o login nunca toca.

`migrations/014_login_password_hash.sql` cria a coluna no schema de login de **cada** tenant,
lendo `public.tenants.login_schema` — idempotente, sem hardcode. Aplicada.

Login aceita os dois formatos e migra o usuário no primeiro acesso. `PUT/POST /usuarios`
grava os dois. A coluna `senha` **não** foi removida: outros produtos leem esse diretório.
Acrescentado hash-dummy para senhas de usuário inexistente, senão o tempo de resposta
denunciava quem está cadastrado.

> 🔑 **Dívida com condição de saída:** enquanto `senha` seguir em texto puro, um dump ainda
> entrega as senhas. Sai quando o último produto da Frota migrar para `senha_hash`.

---

## F4 — TLS e perímetro ⚠️ parcial

- **SSL unificado.** Havia duas regras: o pool padrão olhava `DATABASE_SSL ?? MASTER_DB_SSL`,
  o pool de tenant olhava só `DATABASE_SSL`. Agora é uma função só, com suporte a
  `DATABASE_CA`/`MASTER_DB_CA` para validar de fato o certificado.
- **`helmet()`** e **allowlist de CORS** (`cors()` sem argumento liberava qualquer origem).
- **Rate limit** no login: 10 tentativas / 15 min, chaveado por **IP + documento**, com
  `trust proxy` configurado junto — sem isso, atrás de proxy o primeiro a errar bloquearia
  todos.

> ⚠️ **TLS continua desligado** (`ssl=false` medido na conexão real). Ligar é `DATABASE_SSL=true`
> + `MASTER_DB_SSL=true`; sem CA, cifra sem autenticar o servidor. **D-09 segue aberta.**
> Pré-produção, então não bloqueia hoje — bloqueia o dia da publicação.

---

## Provas (por efeito, não por variável)

Servidor real no ar, `POST` de verdade:

| | Prova | Resultado |
|---|---|---|
| A | senha em texto puro → 200, e bcrypt gravado | ✅ |
| B | legado corrompido + hash válido → 200 (usa o hash) | ✅ |
| C | senha errada → 401 | ✅ |
| D | documento do banco `basesales` → 401 | ✅ |
| E | `evil.example` sem `Access-Control-Allow-Origin` | ✅ |
| E | origem da allowlist recebe o cabeçalho | ✅ |
| F | 11ª tentativa de login → 429 | ✅ |
| G | `x-content-type-options` presente, `x-powered-by` removido | ✅ |

`npm run build` limpo · `npm test` 12/12 · frontend build limpo.

**Correção de rota:** o frontend apontava para `localhost:3000` e o backend roda em `3001` —
batia em porta vazia ou, pior, no app de outro produto na mesma máquina (Lei 9 do PLY-008).

---

## Próximo passo

1. 🔴 **Rodar `infra/001_role_app.sql`** com uma senha sua e apontar o `.env` para `kuatia_app`.
   Sem isso, o RLS segue decorativo. Depois, **refazer o teste de vazamento** — trocar o `.env`
   sem reprovar é acreditar na rotação, não prová-la.
2. **F5 — entrada no Corpus** (`products/kuatia/contexto.md` + `manual/`).
3. Aberto: D-09 (CA do banco), L-01 (rotação das chaves de IA), troca do `JWT_SECRET`.
