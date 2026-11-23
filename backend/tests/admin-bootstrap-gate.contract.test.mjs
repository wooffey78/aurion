// Amorçage administrateur (15.4.38) — la promotion automatique est réservée au mode local /
// non-production. Une insertion refusée (RLS, privilège, contrainte) doit produire un refus
// propre : jamais d'exception dans /admin/me, jamais de promotion supposée.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV ||= 'test';
process.env.DATABASE_URL ||= 'postgresql://verify:verify@127.0.0.1:5432/aurion_verify';
process.env.JWT_SECRET ||= 'admin-bootstrap-test-secret-0123456789abcdef';
process.env.AURION_SUPPORT_EMAIL ||= 'support@example.invalid';
process.env.AURION_STORAGE_BACKEND ||= 'local';

const support = await import('../dist/routes/support.js');

test('production : aucune promotion automatique, quelle que soit la variable', () => {
  for (const flag of [undefined, '', 'true', 'false']) {
    assert.equal(support.adminBootstrapAllowed('production', flag), false, `production + ${String(flag)}`);
  }
});

test('local / test : amorçage actif par défaut, désactivé uniquement par false', () => {
  assert.equal(support.adminBootstrapAllowed('development'), true);
  assert.equal(support.adminBootstrapAllowed('test', ''), true);
  assert.equal(support.adminBootstrapAllowed('development', 'true'), true);
  assert.equal(support.adminBootstrapAllowed('development', ' FALSE '), false);
});

test('production : isAdmin vérifie le rôle existant sans jamais tenter de promotion', async () => {
  const calls = [];
  const runner = { query: async sql => { calls.push(sql); return { rowCount: 0, rows: [] }; } };
  assert.equal(await support.isAdmin('u-1', runner, () => false), false);
  assert.equal(calls.length, 1, 'aucune requête d’amorçage après le refus de mode');
  assert.match(calls[0], /platform_admins/);
  assert.doesNotMatch(calls[0], /^insert/i);
});

test('local : le propriétaire est promu une fois, puis reconnu directement', async () => {
  const admins = new Set();
  const calls = [];
  const runner = {
    query: async (sql, values) => {
      calls.push(sql.trim());
      if (/^select 1 from users u/.test(sql)) return { rowCount: admins.has(values[0]) ? 1 : 0, rows: [] };
      if (/^select 1 from organization_members/.test(sql)) return { rowCount: 1, rows: [{ ok: 1 }] };
      if (/^insert into platform_admins/.test(sql)) {
        if (admins.has(values[0])) return { rowCount: 0, rows: [] };
        admins.add(values[0]);
        return { rowCount: 1, rows: [{ user_id: values[0] }] };
      }
      if (/^select 1 from platform_admins/.test(sql)) return { rowCount: admins.has(values[0]) ? 1 : 0, rows: [] };
      return { rowCount: 0, rows: [] };
    },
  };
  assert.equal(await support.isAdmin('owner-1', runner, () => true), true);
  assert.equal(await support.isAdmin('owner-1', runner, () => true), true);
  assert.equal(calls.filter(sql => /^insert/i.test(sql)).length, 1, 'la seconde vérification ne réinsère pas');
});

test('insertion refusée : refus propre, sans exception ni promotion supposée', async () => {
  const messages = [];
  const failing = {
    query: async () => {
      const error = new Error('new row violates row-level security policy');
      error.code = '42501';
      throw error;
    },
  };
  const granted = await support.insertPlatformAdmin(failing, '00000000-0000-4000-8000-000000000000', message => messages.push(message));
  assert.equal(granted, false, 'aucun droit administrateur accordé');
  assert.equal(messages.length, 1, 'l’échec est journalisé');
  assert.match(messages[0], /42501/);
  assert.match(messages[0], /refusé/);
});

test('insertion réussie ou déjà existante : vrai dans les deux cas', async () => {
  const rows = new Set();
  const runner = {
    query: async (sql, values) => {
      const userId = values?.[0];
      if (/^insert/i.test(sql.trim())) {
        if (rows.has(userId)) return { rowCount: 0, rows: [] };
        rows.add(userId);
        return { rowCount: 1, rows: [{ user_id: userId }] };
      }
      return { rowCount: rows.has(userId) ? 1 : 0, rows: rows.has(userId) ? [{ user_id: userId }] : [] };
    },
  };
  assert.equal(await support.insertPlatformAdmin(runner, 'u-1'), true);
  assert.equal(await support.insertPlatformAdmin(runner, 'u-1'), true, 'conflit idempotent');
});
