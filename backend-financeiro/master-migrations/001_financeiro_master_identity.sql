ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS senha_hash TEXT;
COMMENT ON COLUMN public.usuarios.senha_hash IS 'Hash bcrypt usado pelo Financeiro. O campo senha legado permanece temporariamente para compatibilidade com outros produtos.';

INSERT INTO auth.products (code, name, active)
VALUES ('financeiro-paraguai', 'Financeiro Paraguai', TRUE)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, active = TRUE, updated_at = NOW();
