import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { PoolClient } from 'pg';
import { migrationPool as pool } from '../config/database.js';

/**
 * Migrador de dois alvos.
 *
 *   npm run migrate:public              → migrations/public/  (uma vez por banco)
 *   npm run migrate:tenant -- pinheirao → migrations/tenant/  (uma vez por schema)
 *
 * Por que dois: `public` guarda o que é comum a todos os tenants; cada cliente
 * tem o próprio schema. Misturar os dois foi o que fez o protótipo nascer com
 * tudo em `public` — sem lugar para o segundo cliente.
 *
 * 🔴 O controle fica DENTRO do alvo (`<schema>.schema_migrations`). Um controle
 *    global faria um schema novo herdar "já aplicado" das migrations do vizinho:
 *    o migrador diria "nada a fazer" e sairia com sucesso sobre um schema vazio.
 *    Schema vazio com mensagem de sucesso é o pior resultado possível — ninguém
 *    investiga um processo que disse que deu certo.
 */

/** Nome de schema aceito ou recusado, nunca "corrigido". Identificador não entra
 *  como parâmetro em DDL: é interpolação, e interpolação sem validação é injeção. */
function ident(nome: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(nome)) {
    throw new Error(`Nome de schema inválido: ${JSON.stringify(nome)}. Use [a-z_][a-z0-9_]* até 63 caracteres.`);
  }
  return `"${nome}"`;
}

async function aplicar(pasta: string, schema: string): Promise<void> {
  const diretorio = resolve(process.cwd(), 'migrations', pasta);
  const alvo = ident(schema);

  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${alvo}`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${alvo}.schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  const arquivos = (await readdir(diretorio)).filter((f) => f.endsWith('.sql')).sort();
  if (!arquivos.length) throw new Error(`Nenhuma migration em migrations/${pasta}.`);

  let aplicadas = 0;
  for (const nome of arquivos) {
    const jaEsta = await pool.query(`SELECT 1 FROM ${alvo}.schema_migrations WHERE name = $1`, [nome]);
    if (jaEsta.rowCount) continue;

    const sql = await readFile(resolve(diretorio, nome), 'utf8');
    const client: PoolClient = await pool.connect();
    try {
      await client.query('BEGIN');
      /* O `search_path` é o que decide onde o objeto nasce — e por isso as
         migrations de tenant não qualificam nada. `public` fica no fim, para
         alcançar o que é compartilhado. */
      await client.query(`SET LOCAL search_path TO ${alvo}, public`);
      await client.query(sql);
      await client.query(`INSERT INTO ${alvo}.schema_migrations (name) VALUES ($1)`, [nome]);
      await client.query('COMMIT');
      console.log(`  aplicada: ${nome}`);
      aplicadas += 1;
    } catch (erro) {
      await client.query('ROLLBACK');
      throw erro;
    } finally {
      client.release();
    }
  }
  console.log(aplicadas ? `${aplicadas} migration(s) em ${schema}.` : `${schema}: nada novo a aplicar.`);
}

/** O papel da aplicação não é dono das tabelas; sem GRANT ele não enxerga o
 *  schema recém-criado. Roda depois das migrations, não antes. */
async function liberarParaAplicacao(schema: string): Promise<void> {
  const papel = process.env.DB_USER;
  if (!papel || papel === process.env.DB_ADMIN_USER) return;
  const alvo = ident(schema);
  const p = ident(papel);
  for (const sql of [
    `GRANT USAGE ON SCHEMA ${alvo} TO ${p}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${alvo} TO ${p}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${alvo} TO ${p}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${alvo} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${p}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${alvo} GRANT USAGE, SELECT ON SEQUENCES TO ${p}`,
    `GRANT EXECUTE ON FUNCTION ${alvo}.puede_acceder_empresa(BIGINT, BIGINT) TO ${p}`,
    `GRANT EXECUTE ON FUNCTION ${alvo}.es_admin_tenant(BIGINT) TO ${p}`,
  ]) await pool.query(sql);
  console.log(`grants de ${schema} para ${papel}: ok`);
}

async function principal(): Promise<void> {
  const modo = process.argv[2];

  if (modo === 'public') {
    console.log('migrations do banco (public):');
    await aplicar('public', 'public');
    return;
  }

  if (modo === 'tenant') {
    const schema = process.argv[3];
    if (!schema) throw new Error('Informe o schema: npm run migrate:tenant -- <schema>');
    console.log(`migrations do tenant "${schema}":`);
    await aplicar('tenant', schema);
    await liberarParaAplicacao(schema);
    return;
  }

  throw new Error('Uso: migrate.ts public | migrate.ts tenant <schema>');
}

principal()
  .then(() => pool.end())
  .catch(async (erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    await pool.end();
    process.exitCode = 1;
  });
