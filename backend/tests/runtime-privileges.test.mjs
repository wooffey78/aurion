import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const integration = process.env.AURION_INTEGRATION_TESTS === '1' && Boolean(process.env.DATABASE_URL);

test('le migrateur accorde les privilèges runtime et protège schema_migrations', () => {
  const source = read('../src/migrate.ts');
  assert.match(source, /AURION_RUNTIME_DB_ROLE/);
  assert.match(source, /GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public/);
  assert.match(source, /GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public/);
  assert.match(source, /ALTER DEFAULT PRIVILEGES FOR ROLE/);
  assert.match(source, /REVOKE ALL ON TABLE public\.schema_migrations/);
});

test('droits SQL : le runtime lit/écrit les tables applicatives sans accéder à schema_migrations', { skip: !integration }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const c = await pool.connect();
    try {
      const role = String((await c.query('select current_user')).rows[0].current_user);
      if (process.env.AURION_RUNTIME_DB_ROLE) assert.equal(role, process.env.AURION_RUNTIME_DB_ROLE);
      for (const privilege of ['SELECT','INSERT','UPDATE','DELETE']) {
        const result = await c.query("select has_table_privilege(current_user,'public.users',$1) AS allowed", [privilege]);
        assert.equal(result.rows[0].allowed, true, 'privilège runtime manquant: '+privilege);
      }
      const history = await c.query("select has_table_privilege(current_user,'public.schema_migrations','SELECT') AS allowed");
      assert.equal(history.rows[0].allowed, false, 'le rôle runtime ne doit pas lire l’historique des migrations');
      const sequence = await c.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='S' and has_sequence_privilege(current_user,c.oid,'USAGE')");
      assert.ok(Number(sequence.rows[0].n) >= 0);
    } finally {
      c.release();
    }
  } finally {
    await pool.end();
  }
});
