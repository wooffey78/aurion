// Blocs 1+4 (partie appareil) — file persistante des décisions hors connexion et rejeu automatique.
// Exigences du prompt maître (§3.3, §4-BLOC 1 et BLOC 4) :
//   - toute décision de l'utilisateur prise hors connexion est ENREGISTRÉE DURABLEMENT AVANT tout
//     envoi (magasin `outbox` du stockage local versionné, jamais localStorage pour les données
//     métier) ; l'initialisation attend l'identité authentifiée (promesse partagée du Bloc 1) et
//     `outboxReady()` permet à l'interception de n'accepter une écriture offline que la file est
//     réellement ouverte — aucune perte silencieuse ;
//   - au retour de la connexion, les opérations sont REJOUÉES AUTOMATIQUEMENT dans l'ordre du
//     graphe de dépendances puis de la décision (decidedAt) — jamais de seconde confirmation ;
//   - opérations laissées en `sending` par un arrêt brutal : BAIL horodaté ; au démarrage et à
//     chaque cycle, les baux expirés repassent `pending` — l'idempotence serveur (opId unique,
//     sync_applied_ops) interdit tout doublon malgré la réponse perdue ;
//   - dépendances déterministes : chaque référence locale utilisée dans un payload ou un chemin
//     est associée à son opération créatrice (`dependsOn`) dès l'enregistrement ; les références
//     deviennent `@ref:<localRef>` et le serveur les substitue par les identifiants réels ;
//   - statuts honnêtes (pending/sending/applied/conflict/blocked/error), trace décision+exécution
//     conservée 30 jours, verrou inter-onglets (navigator.locks).
import { openLocalStore } from './local-store.js';
import { getIdentity, deviceId } from './session-identity.js';

const RETRY_DELAYS_MS = [5_000, 30_000, 60_000, 120_000, 240_000, 480_000]; // 1re relance rapide (réseau instable à la reconnexion), puis backoff
const PRUNE_AFTER_MS = 30 * 86400_000;
const LEASE_MS = 120_000; // bail d'exclusivité d'une opération en cours d'envoi
let store = null, owner = null, processing = false, bootstrapped = false, readyResolve = null;
const readyPromise = new Promise(r => { readyResolve = r; });
const notify = async () => window.dispatchEvent(new CustomEvent('aurion:outbox-changed', { detail: await awaitCounts() }));
const listeners = () => { Promise.resolve(notify()).catch(() => {}); };
async function awaitCounts() { const all = await store.getAll('outbox'); return { pending: all.filter(x => x.status === 'pending').length, sending: all.filter(x => x.status === 'sending').length, applied: all.filter(x => x.status === 'applied').length, conflict: all.filter(x => x.status === 'conflict').length, blocked: all.filter(x => x.status === 'blocked').length, error: all.filter(x => x.status === 'error').length }; }
const newOpId = () => 'op' + (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`).replace(/-/g, '');
const newLocalRef = () => 'loc' + (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`).replace(/-/g, '');

/**
 * Associe la file au compte connecté. Sans argument, l'identité est résolue via la promesse
 * partagée du Bloc 1 (/auth/me résolue une seule fois). Renvoie true si la file est ouverte.
 */
export async function setOutboxOwner(identity = null) {
  const id = identity || await getIdentity();
  if (!id?.organizationId || !id?.userId) return false;
  owner = { organizationId: id.organizationId, userId: id.userId, deviceId: id.deviceId || deviceId() };
  store = await openLocalStore(owner);
  readyResolve(true);
  // Récupération sûre des opérations interrompues (crash pendant `sending`) : baux expirés →
  // `pending`. Le serveur dédoublonne par opId : aucun doublon même si l'exécution a réussi.
  const all = await store.getAll('outbox');
  for (const o of all) if (o.status === 'sending' && (o.leaseUntil || 0) < Date.now()) { o.status = 'pending'; o.leaseUntil = 0; await store.put('outbox', o.opId, o); }
  if (!bootstrapped) {
    bootstrapped = true;
    // Reconnexion : le réseau vient de se rétablir — les délais de backoff courants sont
    // annulés (la perte réseau entre le test et le fetch ne doit pas pénaliser 30 s) et le
    // rejeu part après un court délai de stabilisation.
    window.addEventListener('online', async () => { try { const all = await store.getAll('outbox'); for (const o of all) if (o.status === 'pending' && (o.nextAttemptAt || 0) > Date.now()) { o.nextAttemptAt = 0; await store.put('outbox', o.opId, o); } } catch {} scheduleProcess(1200); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleProcess(0); });
    setInterval(() => scheduleProcess(0), 60_000);
  }
  scheduleProcess(0);
  listeners();
  return true;
}

/** La file est-elle prête à enregistrer (borne de temps pour l'interception hors connexion). */
export function outboxReady(timeoutMs = 4000) {
  if (store) return Promise.resolve(true);
  return Promise.race([readyPromise, new Promise(r => setTimeout(() => r(Boolean(store)), timeoutMs))]);
}

/** Efface l'espace de noms local du compte (déconnexion/révocation) — opérations incluses. */
export async function clearOutboxOwner() { if (store) { const { wipeLocalStore } = await import('./local-store.js'); await wipeLocalStore(store); store = null; owner = null; } }

/**
 * Enregistre une décision hors connexion AVANT toute autre action. Les valeurs de payload ou de
 * chemin égales à une référence locale déjà en file sont converties en '@ref:<localRef>' ; la
 * première référence rencontrée définit `dependsOn` si non fourni — l'ordre de rejeu suit alors
 * un graphe déterministe (dépendance → créations dépendantes), pas seulement decidedAt.
 */
export async function recordOp({ method, path, payload, kind, dependsOn, decidedAt } = {}) {
  if (!store) throw new Error('OUTBOX_NOT_READY');
  const opId = newOpId(), localRef = newLocalRef();
  const pendingOps = (await store.getAll('outbox')).filter(o => o.localRef && ['pending', 'sending', 'error'].includes(o.status));
  const pendingRefs = new Set(pendingOps.map(o => o.localRef));
  const markRefs = v => (typeof v === 'string' && pendingRefs.has(v) ? `@ref:${v}` : v);
  const rewrite = v => { if (Array.isArray(v)) return v.map(rewrite); if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = rewrite(x); return o; } return markRefs(v); };
  const cleanPayload = payload === undefined ? undefined : rewrite(JSON.parse(JSON.stringify(payload)));
  const cleanPath = pendingRefs.size ? String(path).split('/').map(s => (pendingRefs.has(s) ? `@ref:${s}` : s)).join('/') : String(path);
  if (!dependsOn) {
    const m = /@ref:([A-Za-z0-9_-]+)/.exec(`${cleanPath} ${JSON.stringify(cleanPayload || {})}`);
    if (m && m[1] !== localRef) dependsOn = m[1];
  }
  const op = { opId, ns: store.namespace, kind: String(kind || path.split('/')[1] || 'op'), method: String(method).toUpperCase(), path: cleanPath, payload: cleanPayload, localRef, dependsOn: dependsOn || '', decidedAt: decidedAt || new Date().toISOString(), status: 'pending', attempts: 0, nextAttemptAt: 0, leaseUntil: 0, lastError: '', resultRef: '', appliedAt: 0, decidedOffline: true };
  await store.put('outbox', opId, op);
  listeners();
  return { queued: true, opId, localRef };
}

/** Ordre de rejeu : dépendances d'abord (tri topologique déterministe), puis décision la plus ancienne. */
function orderOps(ops) {
  const byId = new Map(ops.map(o => [o.opId, o]));
  const depth = new Map();
  const visit = (o, guard) => { if (depth.has(o.opId)) return depth.get(o.opId); if (guard.has(o.opId)) return 0; guard.add(o.opId); const dep = o.dependsOn && byId.get(o.dependsOn); const d = dep ? visit(dep, guard) + 1 : 0; depth.set(o.opId, d); return d; };
  for (const o of ops) visit(o, new Set());
  return [...ops].sort((a, b) => (depth.get(a.opId) - depth.get(b.opId)) || String(a.decidedAt).localeCompare(String(b.decidedAt)));
}

/** Rejeu automatique : à la reconnexion, au retour de visibilité, au chargement et toutes les 60 s. */
export function scheduleProcess(delayMs = 0) { if (!store || processing) return; setTimeout(() => { processOutbox().catch(() => {}); }, delayMs); }

export async function processOutbox() {
  if (!store || processing || !navigator.onLine) return;
  processing = true;
  const run = async () => {
    try {
      const all = await store.getAll('outbox');
      const now = Date.now();
      // `pending` dus + baux `sending` expirés (arrêt brutal, réponse perdue) — l'idempotence
      // serveur rend cette reprise sans doublon.
      const due = all.filter(o => (o.status === 'pending' && (o.nextAttemptAt || 0) <= now) || (o.status === 'sending' && (o.leaseUntil || 0) < now));
      if (!due.length) return;
      const ordered = orderOps(due).slice(0, 200);
      for (const o of ordered) { o.status = 'sending'; o.leaseUntil = now + LEASE_MS; await store.put('outbox', o.opId, o); }
      const { api } = await import('./api.js');
      const body = { ops: ordered.map(o => ({ opId: o.opId, kind: o.kind, method: o.method, path: o.path, payload: o.payload, localRef: o.localRef, dependsOn: o.dependsOn, decidedAt: o.decidedAt })) };
      let results = null;
      try { const r = await api.authFetch('/sync/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); results = r.ok ? (await r.json())?.results : null; }
      catch { results = null; }
      let touched = false;
      for (let i = 0; i < ordered.length; i++) {
        const o = ordered[i], res = results?.find(x => x.opId === o.opId);
        if (!res) { o.status = 'pending'; o.leaseUntil = 0; o.attempts++; o.nextAttemptAt = now + (RETRY_DELAYS_MS[Math.min(o.attempts - 1, RETRY_DELAYS_MS.length - 1)] || RETRY_DELAYS_MS[0]); o.lastError = 'SYNCHRONISATION IMPOSSIBLE : nouvelle tentative automatique.'; }
        else if (res.status === 'applied' || res.status === 'duplicate') { o.status = 'applied'; o.resultRef = res.resultRef || ''; o.appliedAt = Date.now(); o.leaseUntil = 0; o.lastError = ''; }
        else if (res.status === 'conflict') { o.status = 'conflict'; o.leaseUntil = 0; o.lastError = 'CONFLIT : versions conservées sur le serveur.'; o.resultRef = res.resultRef || ''; }
        else if (res.status === 'blocked') { o.status = 'blocked'; o.leaseUntil = 0; o.lastError = `Refusée par le serveur (${res.error || 'REJET'}). Votre décision est conservée : corrigez ou supprimez cette opération.`; }
        else { o.status = o.attempts >= RETRY_DELAYS_MS.length ? 'error' : 'pending'; o.leaseUntil = 0; o.attempts++; o.nextAttemptAt = now + (RETRY_DELAYS_MS[Math.min(o.attempts - 1, RETRY_DELAYS_MS.length - 1)] || RETRY_DELAYS_MS[0]); o.lastError = 'Erreur serveur temporaire : nouvelle tentative automatique.'; }
        await store.put('outbox', o.opId, o);
        if (o.status === 'applied') touched = true;
      }
      // Trace conservée 30 jours après exécution (décision + exécution serveur).
      for (const o of all) if (o.status === 'applied' && o.appliedAt && now - o.appliedAt > PRUNE_AFTER_MS) { await store.delete('outbox', o.opId); touched = true; }
      if (touched) window.dispatchEvent(new CustomEvent('aurion:outbox-applied'));
    } finally { processing = false; }
  };
  if (navigator.locks?.request) await navigator.locks.request('aurion-outbox-replay', run);
  else await run();
  listeners();
}

/** Lecture pour l'interface (Bloc 7) : comptes et opérations de l'espace courant. */
export async function outboxSnapshot() { if (!store) return { counts: { pending: 0, sending: 0, applied: 0, conflict: 0, blocked: 0, error: 0 }, ops: [] }; const ops = await store.getAll('outbox'); return { counts: await awaitCounts(), ops: ops.map(o => ({ opId: o.opId, kind: o.kind, method: o.method, path: o.path, status: o.status, decidedAt: o.decidedAt, lastError: o.lastError, resultRef: o.resultRef, appliedAt: o.appliedAt })) }; }

/** Réessaie manuellement les opérations en erreur/bloquées après correction par l'utilisateur. */
export async function retryFailedOps() { if (!store) return; const all = await store.getAll('outbox'); for (const o of all) if (['error', 'blocked'].includes(o.status)) { o.status = 'pending'; o.nextAttemptAt = 0; await store.put('outbox', o.opId, o); } scheduleProcess(0); listeners(); }
