-- Guarda o bcrypt ao lado da senha legada, no schema de login de cada tenant.
--
-- A migration 001 do master criou `senha_hash` em `master.public.usuarios` —
-- tabela que o fluxo de login nunca toca. A senha mora em
-- `<login_schema>.user_nomes`, no banco do tenant, e é lá que o hash precisa
-- estar.
--
-- A coluna `senha` (texto puro) NÃO é removida: outros produtos da Frota leem
-- esse diretório. Coluna nova é nullable e vai no fim — `SELECT *` e `INSERT`
-- com lista de colunas continuam funcionando.

DO $$
DECLARE esquema TEXT;
BEGIN
  FOR esquema IN
    SELECT DISTINCT login_schema FROM public.tenants WHERE login_schema IS NOT NULL
  LOOP
    IF to_regclass(format('%I.user_nomes', esquema)) IS NULL THEN
      RAISE NOTICE 'Schema % não tem user_nomes; ignorado.', esquema;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I.user_nomes ADD COLUMN IF NOT EXISTS senha_hash TEXT', esquema);
    EXECUTE format(
      'COMMENT ON COLUMN %I.user_nomes.senha_hash IS %L',
      esquema,
      'Hash bcrypt usado pelo Kuatiá. A coluna `senha` segue em texto puro por compatibilidade com os outros produtos da Frota; sai quando o último migrar.'
    );
  END LOOP;
END $$;
