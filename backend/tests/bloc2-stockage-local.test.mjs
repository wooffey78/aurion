// Bloc 2 — Interface de persistance locale structurée : contrats, migrations déclaratives,
// séparation A/B par espace de noms compte/organisation/appareil, adaptateur SQLite à driver
// injecté (testé ici avec un pilote factice ; le test sur appareil natif réel reste à faire
// au Bloc 8/15 — déclaré comme tel). La file de fichiers existante `aurion-cloud-queue`
// doit rester strictement intacte.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

async function loadModule() {
  const source = read('../../assets/js/core/local-store.js');
  const context = vm.createContext({ console, URL, JSON, Math, Date });
  context.exports = {};
  vm.runInContext('void 0', context);
  // Charge le module ES dans le contexte : window/navigator n'y existent pas → adaptateurs importables.
  const mod = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  return mod;
}

test('bloc2: interface mémoire — CRUD, getAll trié, clearStore, close', async () => {
  const { MemoryAdapter } = await loadModule();
  const a = new MemoryAdapter();
  a._ns = 'org1\u0000user1\u0000dev1';
  await a.open(null, [], 1);
  await a.put('replicas', 'c1', { sortKey: '0002', updatedAt: '2026-11-14T10:00:00Z', name: 'Client un' });
  await a.put('replicas', 'c0', { sortKey: '0001', updatedAt: '2026-11-14T09:00:00Z', name: 'Client zéro' });
  assert.equal((await a.get('replicas', 'c1')).name, 'Client un');
  const all = await a.getAll('replicas');
  assert.deepEqual(all.map(x => x.sortKey), ['0001', '0002']);
  await a.delete('replicas', 'c1');
  assert.equal(await a.get('replicas', 'c1'), null);
  await a.clearStore('replicas');
  assert.deepEqual(await a.getAll('replicas'), []);
  await a.close();
});

test('bloc2: séparation A/B stricte par espace de noms (compte/organisation/appareil)', async () => {
  const { openLocalStore } = await loadModule();
  const a = await openLocalStore({ organizationId: 'orgA', userId: 'u1', deviceId: 'd1' });
  const b = await openLocalStore({ organizationId: 'orgB', userId: 'u1', deviceId: 'd1' });
  const b2 = await openLocalStore({ organizationId: 'orgB', userId: 'u1', deviceId: 'd2' });
  assert.notEqual(a.namespace, b.namespace);
  assert.notEqual(b.namespace, b2.namespace);
  await a.put('replicas', 'client1', { sortKey: 'k', updatedAt: '', name: 'Client A' });
  await b.put('replicas', 'client1', { sortKey: 'k', updatedAt: '', name: 'Client B' });
  assert.equal((await a.get('replicas', 'client1')).name, 'Client A');
  assert.equal((await b.get('replicas', 'client1')).name, 'Client B');
  assert.deepEqual(await b.getAll('replicas').then(r => r.map(x => x.name)), ['Client B'], 'B ne voit jamais A');
  await wipeA(a);
  assert.equal(await a.get('replicas', 'client1'), null, 'effacement contrôlé de l\'espace A uniquement');
  assert.equal((await b.get('replicas', 'client1')).name, 'Client B');
  async function wipeA(s) { const { wipeLocalStore } = await loadModule(); await wipeLocalStore(s); }
});

test('bloc2: adaptateur SQLite à driver injecté — DDL versionné, CRUD, requêtes à l\'espace de noms', async () => {
  const { SqliteAdapter } = await loadModule();
  const execLog = [];
  const rows = new Map();
  const driver = {
    async exec(sql, params) { execLog.push({ sql, params }); const m = /CREATE TABLE IF NOT EXISTS "(\w+)"/.exec(sql); if (m) rows.set(m[1], new Map()); const ins = /INSERT INTO "(\w+)" \(ns, store, key, sortKey, updatedAt, value\) VALUES \(\?,\?,\?,\?,\?,\?\)/.exec(sql); if (ins) { const [, t] = ins; const [ns, store, key, , , value] = params; rows.get(t).set(`${ns}\u0000${store}\u0000${key}`, { ns, store, key, value }); } const del = /DELETE FROM "(\w+)" WHERE ns=\? AND store=\? AND key=\?/.exec(sql); if (del) rows.get(del[1]).delete(params.join('\u0000')); const clr = /DELETE FROM "(\w+)" WHERE ns=\?$/.exec(sql); if (clr) for (const k of [...rows.get(clr[1]).keys()]) if (k.startsWith(params[0] + '\u0000')) rows.get(clr[1]).delete(k); },
    async query(sql, params) { const m = /SELECT value FROM "(\w+)" WHERE ns=\? AND store=\? AND key=\?/.exec(sql); if (m) { const row = rows.get(m[1])?.get(params.join('\u0000')); return row ? { values: [{ value: row.value }] } : { values: [] }; } const g = /SELECT value FROM "(\w+)" WHERE ns=\? ORDER BY sortKey ASC/.exec(sql); if (g) return { values: [...(rows.get(g[1])?.values() || [])].filter(r => r.ns === params[0]).map(r => ({ value: r.value })) }; return { values: [] }; },
  };
  const s = new SqliteAdapter(driver);
  s._ns = 'orgA\u0000u1\u0000d1';
  const { SCHEMA } = await loadModule();
  await s.open(SCHEMA, [], 1);
  assert.ok(execLog.some(e => /CREATE TABLE IF NOT EXISTS "replicas"/.test(e.sql)), 'DDL déclaratif appliqué');
  await s.put('replicas', 'x1', { sortKey: 'k1', updatedAt: '2026-11-14T00:00:00Z', name: 'X un' });
  assert.equal((await s.get('replicas', 'x1')).name, 'X un');
  assert.deepEqual(await s.getAll('replicas'), [{ sortKey: 'k1', updatedAt: '2026-11-14T00:00:00Z', name: 'X un' }]);
  const insert = execLog.find(e => /INSERT INTO "replicas"/.test(e.sql));
  assert.deepEqual(insert.params.slice(0, 3), ['orgA\u0000u1\u0000d1', 'replicas', 'x1'], 'tout enregistrement porte l\'espace de noms');
  await s.delete('replicas', 'x1');
  assert.equal(await s.get('replicas', 'x1'), null);
});

test('bloc2: sélection d\'adaptateur — mémoire sans indexedDB, base séparée de la file de fichiers', async () => {
  const mod = await loadModule();
  assert.equal(mod.LOCAL_STORE_NAME, 'aurion-local-store');
  assert.notEqual(mod.LOCAL_STORE_NAME, 'aurion-cloud-queue', 'nouvelle base distincte de la file existante');
  const store = await mod.openLocalStore({ organizationId: 'o', userId: 'u', deviceId: 'd' });
  assert.equal(store.kind, 'memory', 'sans indexedDB (contexte de test Node) ni driver injecté : adaptateur mémoire');
  const cloud = read('../../assets/js/core/cloud-sync.js');
  assert.match(cloud, /DB_NAME='aurion-cloud-queue',STORE='items',VERSION=1/);
  const ls = read('../../assets/js/core/local-store.js');
  assert.ok(!ls.includes('aurion-cloud-queue'), 'local-store ne touche jamais la base de la file de fichiers');
  assert.match(ls, /LOCAL_STORE_SCHEMA_VERSION = 1/);
  assert.match(ls, /AURION_SQLITE_DRIVER|driver/, 'le driver SQLite natif est injecté, jamais importé depuis un CDN');
});

test('bloc2: schéma déclaré — magasins requis pour les Blocs 3-6, migrations registre vide en v1', async () => {
  const { SCHEMA, SCHEMA_MIGRATIONS } = await loadModule();
  const stores = SCHEMA[1].map(d => d.store);
  for (const required of ['replicas', 'outbox', 'meta', 'downloads']) assert.ok(stores.includes(required), `magasin ${required} déclaré`);
  assert.equal(SCHEMA[1].find(d => d.store === 'outbox').indexes.some(i => i[0] === 'depKey'), true, 'index des dépendances pour l\'ordre de rejeu');
  assert.deepEqual(SCHEMA_MIGRATIONS, [], 'aucune migration locale en version 1 (les évolutions futures sont additives)');
  const memoryOnly = SCHEMA[1].every(d => d.keyPath === 'nsKey' || d.store === 'outbox');
  assert.equal(memoryOnly, true, 'clés stables côté client (nsKey pour les répliques, opId pour la file)');
});

test('bloc2: adaptateur IndexedDB — l\'enregistrement écrit porte la clé primaire nsKey (DataError sinon)', async () => {
  const { IndexedDbAdapter, SCHEMA, LOCAL_STORE_SCHEMA_VERSION } = await loadModule();
  // IDB factice : capture l'enregistrement transmis à store.put et complète la transaction.
  const captured = [];
  const storeStub = {
    put(rec) { captured.push(rec); return {}; },
    get() { return {}; }, getAll() { return {}; }, delete() { return {}; },
  };
  const dbStub = { close() {}, transaction() { const t = { objectStore: () => storeStub, oncomplete: null, onerror: null, onabort: null }; queueMicrotask(() => { if (t.oncomplete) t.oncomplete(); }); return t; } };
  const fakeIdb = { open() { const req = { onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null, result: dbStub }; queueMicrotask(() => { if (req.onsuccess) req.onsuccess(); }); return req; } };
  const a = new IndexedDbAdapter(fakeIdb);
  a._ns = 'orgA\u0000u1\u0000d1';
  await a.open(SCHEMA, [], LOCAL_STORE_SCHEMA_VERSION);
  await a.put('replicas', 'client1', { sortKey: 'k', updatedAt: '2026-11-14T00:00:00Z', name: 'Client A' });
  assert.equal(captured.length, 1);
  assert.equal(captured[0].nsKey, 'orgA\u0000u1\u0000d1\u0000replicas\u0000client1', 'nsKey = clé primaire keyPath, isolée par compte/organisation/appareil');
  assert.equal(captured[0].ns, a._ns);
  assert.equal(captured[0].key, 'client1');
  assert.equal(captured[0].value.name, 'Client A');
  // Magasin à clé naturelle : la file `outbox` porte sa clé sous son propre keyPath (opId),
  // pas sous nsKey — sinon IndexedDB rejette l'écriture (DataError) au premier enregistrement.
  await a.put('outbox', 'op123abc', { dependsOn: '', status: 'pending' });
  assert.equal(captured.length, 2);
  assert.equal(captured[1].opId, 'op123abc', 'clé primaire opId présente sur l\'enregistrement outbox');
  assert.ok(!('nsKey' in captured[1]), 'pas de nsKey parasite sur un magasin à clé naturelle');
});
