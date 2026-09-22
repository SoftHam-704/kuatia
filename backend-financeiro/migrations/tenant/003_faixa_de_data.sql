-- ============================================================================
-- Faixa de data no BANCO — a regra sai de dentro do TypeScript
-- ============================================================================
--
-- `assertBusinessDate` recusa ano fora de 2000–2100, e mora só na aplicação.
-- Medido em 2026-08-11: `INSERT ... fecha = '0006-01-01'` foi ACEITO pelo banco.
--
-- Isso é assimetria, não detalhe. As regras de dinheiro *estão* no banco — a
-- baixa não excede o saldo, o movimento casa com a caja, o livro é append-only.
-- A regra de data, não. Qualquer caminho que não passe pela rota Express (um
-- script, um `psql`, a importação de planilha que ainda vai ser construída)
-- escreve lixo sem resistência.
--
-- O spec original nomeia o incidente: alguém digitou "6" em vez de "2026" e o
-- registro ficou inutilizável por dois meses sem ninguém perceber. E fecha com
-- "guarda de interface não é guarda".
--
-- Alcance: TODA coluna `date` do schema do tenant, descoberta por catálogo em
-- vez de lista escrita à mão — coluna de data nova nasce coberta se esta
-- migration for reaplicada. `NULL` passa (CHECK não reprova nulo), então
-- colunas opcionais como `fecha_pago` continuam podendo ficar vazias.
-- ============================================================================

DO $$
DECLARE
  esquema CONSTANT TEXT := current_schema();
  col     RECORD;
  nome    TEXT;
  sujas   BIGINT;
BEGIN
  FOR col IN
    SELECT c.relname AS tabela, a.attname AS coluna
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = esquema
      AND c.relkind = 'r'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND format_type(a.atttypid, a.atttypmod) = 'date'
    ORDER BY c.relname, a.attnum
  LOOP
    nome := format('%s_%s_faixa_chk', col.tabela, col.coluna);

    IF EXISTS (
      SELECT 1 FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = esquema AND c.relname = col.tabela AND con.conname = nome
    ) THEN CONTINUE; END IF;

    /* Uma linha fora da faixa faria o ALTER falhar e derrubaria a migration
       inteira. Melhor avisar qual tabela precisa de limpeza antes do que
       deixar o erro cru do Postgres explicar. */
    EXECUTE format('SELECT count(*) FROM %I.%I WHERE %I < DATE ''2000-01-01'' OR %I > DATE ''2100-12-31''',
      esquema, col.tabela, col.coluna, col.coluna) INTO sujas;
    IF sujas > 0 THEN
      RAISE EXCEPTION 'Há % linha(s) em %.% com data fora de 2000–2100. Corrija o dado antes de aplicar a faixa.',
        sujas, col.tabela, col.coluna;
    END IF;

    EXECUTE format(
      'ALTER TABLE %I.%I ADD CONSTRAINT %I CHECK (%I IS NULL OR (%I >= DATE ''2000-01-01'' AND %I <= DATE ''2100-12-31''))',
      esquema, col.tabela, nome, col.coluna, col.coluna, col.coluna);
  END LOOP;
END $$;
