-- ============================================================================
-- kuatia_adm — o papel de banco com que a aplicação conecta
-- ============================================================================
--
-- ✅ APLICADO EM 2026-08-11. Este arquivo é o registro do que foi feito e a
--    receita para refazer noutro ambiente. A senha real não está aqui — ela foi
--    gerada na aplicação e escrita direto no `.env` (`PLY-006` §5: segredo mora
--    com quem detém, nunca no repositório).
--
-- POR QUE ESTE PAPEL EXISTE
--
-- Antes, o app conectava como `webadmin`. Medido em 2026-08-11:
--
--     current_user = webadmin · rolsuper = true · rolbypassrls = true
--     SET app.tenant_id = 999999 (inexistente) → SELECT empresas → 2 linhas
--
-- As policies estavam escritas e com FORCE ROW LEVEL SECURITY. Nenhuma era
-- aplicada: o PostgreSQL não aplica RLS a superuser — por desenho, sem erro e
-- sem aviso. Todo o isolamento multiempresa do produto dependia disto.
--
-- Depois da troca, o mesmo teste:
--
--     current_user = kuatia_adm · rolsuper = false · rolbypassrls = false
--     tenant inexistente → 0 linhas em empresas, cuentas_pagar, cuentas_cobrar,
--                          movimientos_caja, cajas
--     tenant 120 com usuário 1 → 2 empresas (continua enxergando o que é dele)
--
-- Padrão da casa: knowledge/PADRAO-usuario-banco-readonly.md — a defesa
-- estrutural que não depende de nenhum código nosso estar certo.
--
-- ⚠️ NÃO conceder SUPERUSER nem BYPASSRLS a este papel, nunca. Fazer isso
--    desliga o isolamento inteiro em silêncio.
--
-- REFAZER NOUTRO AMBIENTE
--   1. Trocar <SENHA> por uma senha forte (não versionar).
--   2. psql -h <host> -p <porta> -U <superuser> -d <master> -f 001_role_app.sql
--   3. Apontar DB_USER/DB_PASSWORD e MASTER_DB_USER/MASTER_DB_PASSWORD no .env.
--   4. Provar — este passo é o único que prova alguma coisa:
--        SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname='kuatia_adm';
--        -- os dois têm que dar false
--      e refazer o teste de vazamento com um tenant_id inexistente: 0 linhas.
--      Trocar o .env sem reprovar é acreditar na rotação, não prová-la.
-- ============================================================================

CREATE ROLE kuatia_adm
  LOGIN PASSWORD '<SENHA>'
  NOSUPERUSER
  NOBYPASSRLS
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  CONNECTION LIMIT 20;

-- ── Master: roteamento e sessões ────────────────────────────────────────────
-- Só leitura no cadastro da Frota. O Kuatiá nunca escreve em `empresas`.
\connect salesmasters_master

GRANT CONNECT ON DATABASE salesmasters_master TO kuatia_adm;
GRANT USAGE ON SCHEMA public TO kuatia_adm;
GRANT USAGE ON SCHEMA auth TO kuatia_adm;

GRANT SELECT ON public.empresas TO kuatia_adm;
GRANT SELECT ON auth.products TO kuatia_adm;

-- Sessões são do produto. Sem DELETE: revogar é UPDATE em `revoked_at`.
GRANT SELECT, INSERT, UPDATE ON auth.sessions TO kuatia_adm;

-- ── Tenant: dados financeiros ───────────────────────────────────────────────
\connect financeiro

GRANT CONNECT ON DATABASE financeiro TO kuatia_adm;
GRANT USAGE ON SCHEMA public TO kuatia_adm;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kuatia_adm;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kuatia_adm;

-- Tabelas de migrations futuras herdam os mesmos privilégios.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kuatia_adm;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO kuatia_adm;

-- Diretório de login do tenant. Sem DELETE: o Kuatiá nunca apaga usuário.
GRANT USAGE ON SCHEMA pinheirao TO kuatia_adm;
GRANT SELECT, INSERT, UPDATE ON pinheirao.user_nomes TO kuatia_adm;

-- Nota: o DELETE concedido em `public` não abre buraco no livro de baixas —
-- `bajas_pagar` e `bajas_cobrar` têm trigger BEFORE UPDATE OR DELETE que recusa
-- a mutação. Verificado presente e habilitado em 2026-08-11 (pg_trigger,
-- tgenabled='O'); não exercitado contra linha real, porque a tabela está vazia.
