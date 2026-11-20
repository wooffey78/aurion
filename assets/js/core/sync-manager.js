// Blocs 1+2 — intégration complète de la synchronisation hors connexion côté appareil.
// Identité résolue UNE seule fois via la promesse partagée du Bloc 1 (session-identity.js) ;
// espaces de noms identiques à ceux de la file outbox et du magasin des documents.
// Cohérence du premier chargement (Bloc 2) : le CURSEUR DE DÉPART est capturé AVANT les
// instantanés paginés ; les deltas depuis ce curseur sont ensuite appliqués — tout changement
// (création, modification, suppression/tombstone) survenu PENDANT le snapshot est réappliqué
// de façon idempotente, rien n'est perdu. Les données répliquées vivent UNIQUEMENT dans le
// stockage local versionné (magasin `replicas`) — jamais localStorage.
import { openLocalStore } from './local-store.js';
import { getIdentity } from './session-identity.js';
import { processOutbox } from './outbox.js';

let store = null, identity = null, bootstrapped = false, running = false;
const status = (phase, extra = {}) => window.dispatchEvent(new CustomEvent('aurion:sync-status', { detail: { phase, at: Date.now(), ...extra } }));
const metaKey = k => `sync:${k}`;

/** Associe la synchronisation au compte connecté (identité partagée du Bloc 1). */
export async function setSyncOwner(identityArg = null) {
  if (running) return;
  identity = identityArg || await getIdentity();
  if (!identity?.organizationId || !identity?.userId) return;
  store = await openLocalStore(identity);
  if (!bootstrapped) {
    bootstrapped = true;
    window.addEventListener('online', () => { syncNow().catch(() => {}); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pullDeltas().catch(() => {}); });
    setInterval(() => { pullDeltas().catch(() => {}); }, 300_000);
    window.addEventListener('aurion:outbox-applied', () => { pullDeltas().catch(() => {}); });
  }
  status('idle', { owner: true });
  pullDeltas().catch(() => {});
}

export async function clearSyncOwner() { if (store) { const { wipeLocalStore } = await import('./local-store.js'); await wipeLocalStore(store); store = null; identity = null; } }

async function getCursor() { const row = await store.get('meta', metaKey('cursor')); return Number(row?.cursor ?? 0); }
async function setCursor(v) { await store.put('meta', metaKey('cursor'), { cursor: Number(v), updatedAt: new Date().toISOString() }); }

async function applyDeltaBatch(body) {
  for (const c of body.changes || []) {
    if (c.op === 'delete') await store.delete('replicas', `${c.entity}:${c.entityId}`);
    else await putReplica(c.entity, c.data);
  }
}

/** Premier arrivage d'un appareil : curseur de départ → instantané paginé → deltas du curseur. */
export async function pullAll() {
  if (!store || !navigator.onLine) return;
  running = true; status('pull', { full: true });
  const { api } = await import('./api.js');
  try {
    const reg = await api.authFetch('/sync/registry');
    if (!reg.ok) return;
    const { schemaVersion, entities } = await reg.json();
    const localSchema = (await store.get('meta', metaKey('schemaVersion')))?.version ?? 0;
    if (localSchema !== Number(schemaVersion)) { const { wipeLocalStore } = await import('./local-store.js'); await wipeLocalStore(store); await store.put('meta', metaKey('schemaVersion'), { version: Number(schemaVersion), updatedAt: new Date().toISOString() }); }
    // 1) CURSEUR DE DÉPART AVANT tout instantané : aucun changement entre ce curseur et les
    //    snapshots ne peut être perdu (il sera rejoué en deltas à l'étape 3, idempotent).
    const c0 = await api.authFetch('/sync/cursor');
    if (!c0.ok) return;
    const initialCursor = Number((await c0.json()).cursor);
    // 2) Instantané complet paginé de chaque entité du registre (reprise : pages idempotentes).
    let done = 0;
    for (const entity of entities) {
      status('pull', { entity, done, total: entities.length });
      for (let page = 1; page <= 1000; page++) {
        const r = await api.authFetch(`/sync/snapshot/${encodeURIComponent(entity)}?page=${page}&limit=200`);
        if (!r.ok) break;
        const body = await r.json();
        for (const row of body.rows || []) await putReplica(entity, row);
        if (!body.hasMore) break;
      }
      done++;
    }
    // 3) Deltas depuis le curseur de départ : la course snapshot/concurrent est refermée.
    await applyDeltasSince(api, initialCursor);
    status('pull-done', { entities: entities.length });
  } finally { running = false; }
}

async function putReplica(entity, row) {
  if (!row?.id) return;
  await store.put('replicas', `${entity}:${row.id}`, { ...row, __entity: entity, sortKey: String(row.id), updatedAt: String(row.updated_at || row.created_at || '') });
}

/** Boucle de deltas incrémentaux depuis un curseur donné (tombstones et upserts idempotents). */
async function applyDeltasSince(api, since) {
  for (let round = 0; round < 100; round++) {
    status('pull', { since });
    const r = await api.authFetch(`/sync/delta?since=${since}&limit=500`);
    if (!r.ok) return;
    const body = await r.json();
    await applyDeltaBatch(body);
    if (!body.hasMore || !body.changes?.length) { await setCursor(Math.max(since, Number(body.cursor ?? since))); return; }
    since = Number(body.cursor ?? since);
  }
}

/** Deltas incrémentaux depuis le curseur local ; premier chargement complet si nécessaire. */
export async function pullDeltas() {
  if (!store || !navigator.onLine || running) return;
  running = true;
  try {
    const { api } = await import('./api.js');
    if (!(await store.get('meta', metaKey('cursor')))) { running = false; await pullAll(); return; }
    await applyDeltasSince(api, await getCursor());
  } finally { running = false; status('idle'); }
}

/** Rejeu des décisions hors connexion puis pull des vérités serveur (reconnexion, événements). */
export async function syncNow() {
  if (!store || !navigator.onLine) return;
  status('push');
  await processOutbox();
  await pullDeltas();
  try { const { ensureRecentDocuments } = await import('./recent-documents.js'); await ensureRecentDocuments(); } catch {}
  status('done');
}

/** Lectures locales pour les vues métier (Bloc 3) : liste et fiche répliquées. */
export async function getLocalList(entity) { if (!store) return []; return (await store.getAll('replicas')).filter(r => r.__entity === entity); }
export async function getLocalEntity(entity, id) { if (!store) return null; return store.get('replicas', `${entity}:${id}`); }
export async function localStoreReady() { return Boolean(store); }
