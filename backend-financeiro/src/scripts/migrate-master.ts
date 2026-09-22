import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterPool } from '../config/database.js';

const migrationsDirectory = resolve(process.cwd(), 'master-migrations');

async function migrateMaster(): Promise<void> {
  await masterPool.query(`CREATE TABLE IF NOT EXISTS public.financeiro_master_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith('.sql')).sort();
  for (const name of files) {
    const applied = await masterPool.query('SELECT 1 FROM public.financeiro_master_migrations WHERE name = $1', [name]);
    if (applied.rowCount) continue;
    const sql = await readFile(resolve(migrationsDirectory, name), 'utf8');
    const client = await masterPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO public.financeiro_master_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      console.log(`Aplicada no master: ${name}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

migrateMaster().then(() => masterPool.end()).catch(async (error) => {
  console.error(error);
  await masterPool.end();
  process.exitCode = 1;
});
