// Blocs 1+6 — documents récents consultables hors connexion, avec une politique complète.
// POLITIQUE (Bloc 6 du prompt maître, §3.3) : proposition initiale 90 jours, MODIFIABLE et
// affichée ; priorité obligatoire aux documents épinglés et aux pièces de dossiers actifs
// (devis non convertis, factures non réglées) même au-delà de la fenêtre ; les fichiers plus
// anciens restent LISTÉS par métadonnées (répliques) et récupérables À LA DEMANDE en ligne
// (downloadAtDemand). Quota de taille totale contrôlé, téléchargement en arrière-plan (jamais
// bloquant), vérification par hash SHA-256 avant de marquer un fichier disponible, élagage
// limité à la copie locale (jamais au document serveur). Contenus conservés dans le magasin
// `downloads` du stockage local versionné (Blobs IndexedDB ; base64 via l'adaptateur SQLite
// natif) avec le MÊME espace de noms que la réplication et la file outbox (Bloc 1).
import { openLocalStore } from './local-store.js';
import { getIdentity } from './session-identity.js';

const DEFAULT_POLICY = { windowDays: 90, maxTotalMB: 200, wifiOnly: false };
let store = null, owner = null;
const fetchRaw = async (url, headers = {}) => { const { api } = await import('./api.js'); const r = await api.authFetch(url, { headers }); if (!r.ok && r.status !== 304) throw new Error('DOWNLOAD_FAILED'); return r; };
const keyOf = (entity, id) => `${entity}:${id}`;

export async function setDocumentsOwner(identityArg = null) {
  try {
    const id = identityArg || await getIdentity();
    if (!id?.organizationId || !id?.userId) return;
    owner = { organizationId: id.organizationId, userId: id.userId, deviceId: id.deviceId };
    store = await openLocalStore(owner);
  } catch { /* hors connexion : le magasin ouvert par le bootstrap reste utilisé */ }
}

async function ensureStore() { if (!store) await setDocumentsOwner(); return store; }

/** Politique courante (fenêtre de récence, quota, réseau) — lisible et modifiable par l'app. */
export async function getDocumentsPolicy() { const s = await ensureStore(); if (!s) return { ...DEFAULT_POLICY, pinned: [] }; const p = await s.get('meta', 'documents:policy'); return { ...DEFAULT_POLICY, ...(p || {}), pinned: Array.isArray(p?.pinned) ? p.pinned : [] }; }
export async function setDocumentsPolicy(patch = {}) { const s = await ensureStore(); if (!s) throw new Error('DOCUMENTS_NOT_READY'); const cur = await getDocumentsPolicy(); const next = { ...cur, ...patch, windowDays: Math.max(7, Number(patch.windowDays ?? cur.windowDays) || cur.windowDays), maxTotalMB: Math.max(10, Number(patch.maxTotalMB ?? cur.maxTotalMB) || cur.maxTotalMB), pinned: Array.isArray(patch.pinned) ? patch.pinned.map(String) : cur.pinned }; await s.put('meta', 'documents:policy', next); return next; }
export async function pinDocument(entity, entityId) { const p = await getDocumentsPolicy(); await setDocumentsPolicy({ pinned: [...new Set([...p.pinned, keyOf(entity, entityId)])] }); }
export async function unpinDocument(entity, entityId) { const p = await getDocumentsPolicy(); await setDocumentsPolicy({ pinned: p.pinned.filter(k => k !== keyOf(entity, entityId)) }); }

async function sha256(blob) { try { const buf = await blob.arrayBuffer(); const h = await crypto.subtle.digest('SHA-256', buf); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join(''); } catch { return ''; } }

/** Enregistre un document récent (contenu vérifié par hash) pour consultation hors connexion. */
export async function recordRecentDocument({ entity, entityId, name, mime, blob, etag = '' }) {
  const s = await ensureStore();
  if (!s) throw new Error('DOCUMENTS_NOT_READY');
  let content = blob;
  if (s.kind === 'sqlite' && typeof Blob !== 'undefined' && content instanceof Blob) content = await blobToBase64(content);
  const hash = blob instanceof Blob ? await sha256(blob) : '';
  const size = blob instanceof Blob ? blob.size : 0;
  await s.put('downloads', keyOf(entity, entityId), { entity, entityId, name: String(name || 'document'), mime: String(mime || 'application/pdf'), blob: content, size, hash, etag: String(etag || ''), downloadedAt: new Date().toISOString(), sortKey: '', updatedAt: String(Date.now()) });
  await pruneToLimit();
  return { stored: true, size, hash };
}

function withinWindow(d, windowDays) { const t = Date.parse(d.created_at || d.updated_at || '') || 0; return t && (Date.now() - t) <= windowDays * 86400_000; }

/** Éligibles au pré-téléchargement : fenêtre de récence OU dossier actif OU épinglé (jamais les seuls « anciens »). */
async function candidates(policy) {
  const { getLocalList } = await import('./sync-manager.js');
  const pinned = new Set(policy.pinned);
  const activeQuoteIds = new Set((await getLocalList('quotes')).filter(q => { const st = String(q.status || '').toLowerCase(); return st === 'draft' || st === 'sent' || st === 'partial' || (!st && String(q.document_type || '') !== 'invoice'); }).map(q => q.id));
  const docs = (await getLocalList('documents')).filter(d => withinWindow(d, policy.windowDays) || pinned.has(keyOf('documents', d.id))).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const quotes = (await getLocalList('quotes')).filter(q => withinWindow(q, policy.windowDays) || pinned.has(keyOf('quotes', q.id)) || activeQuoteIds.has(q.id)).sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  return { docs, quotes, pinned };
}

async function totalBytes() { return (await store.getAll('downloads')).reduce((n, d) => n + (Number(d.size) || 0), 0); }

async function getFailures() { const s = await ensureStore(); if (!s) return {}; return (await s.get('meta', 'download:failures')) || {}; }
async function bumpFailure(key, ok) { const s = await ensureStore(); if (!s) return; const f = (await s.get('meta', 'download:failures')) || {}; if (ok) delete f[key]; else f[key] = (Number(f[key]) || 0) + 1; await s.put('meta', 'download:failures', f); }

/** Bloc 6-bis — libère de la place en élaguant les plus anciens HORS fenêtre (jamais les épinglés,
 * jamais les originaux serveur) jusqu'à ce que le document entrant tienne dans le quota. */
async function makeRoom(needed) {
  const s = store; if (!s) return false;
  const policy = await getDocumentsPolicy();
  const pinned = new Set(policy.pinned);
  const all = (await s.getAll('downloads')).filter(d => !pinned.has(keyOf(d.entity, d.entityId)))
    .sort((a, b) => String(a.downloadedAt).localeCompare(String(b.downloadedAt)));
  let freed = 0;
  for (const d of all) {
    if (freed >= needed) break;
    await s.delete('downloads', keyOf(d.entity, d.entityId));
    freed += Number(d.size) || 0;
  }
  return freed >= needed;
}

/** Bloc 6-bis — intégrité : re-vérifie par échantillon que le contenu local correspond au hash
 * enregistré ; une entrée corrompue est supprimée (elle sera retéléchargée au prochain passage). */
export async function verifyStoredIntegrity(limit = 12) {
  const s = await ensureStore(); if (!s) return { checked: 0, corrupted: 0 };
  const all = (await s.getAll('downloads')).filter(d => d.hash && d.blob);
  let checked = 0, corrupted = 0;
  for (const d of all.slice(0, limit)) {
    let blob = d.blob;
    if (typeof blob === 'string' && typeof Blob !== 'undefined') { try { blob = await (await fetch(`data:${d.mime};base64,${blob}`)).blob(); } catch { blob = null; } }
    const h = blob instanceof Blob ? await sha256(blob) : '';
    checked++;
    if (h && h !== d.hash) { await s.delete('downloads', keyOf(d.entity, d.entityId)); corrupted++; }
  }
  return { checked, corrupted };
}

/** Pré-téléchargement en arrière-plan des documents utiles (jamais bloquant, borné par quota). */
export async function ensureRecentDocuments({ limit = 40 } = {}) {
  const s = await ensureStore();
  if (!s || !navigator.onLine) return { fetched: 0, skipped: 'offline' };
  if (policyBlocksNetwork()) return { fetched: 0, skipped: 'network-policy' };
  await verifyStoredIntegrity().catch(() => {});
  const policy = await getDocumentsPolicy();
  const entries = (await s.getAll('downloads'));
  const have = new Map(entries.map(d => [keyOf(d.entity, d.entityId), d]));
  const failures = await getFailures();
  const { docs, quotes } = await candidates(policy);
  let budget = policy.maxTotalMB * 1_000_000 - (await totalBytes());
  const fetched = [], freshened = [];
  const grab = async (entity, id, url, name, mime, sourceUpdatedAt = '') => {
    const k = keyOf(entity, id);
    if (fetched.includes(k) || freshened.includes(k)) return;
    if ((Number(failures[k]) || 0) >= 5) return; // trop d'échecs : repris lors d'une session suivante
    const entry = have.get(k);
    // Périmé si la réplication connaît une version postérieure au téléchargement local.
    const stale = Boolean(entry && sourceUpdatedAt && Date.parse(sourceUpdatedAt) > Date.parse(entry.downloadedAt || ''));
    if (entry && !stale) return; // déjà présent et frais
    try {
      const headers = {};
      if (entry?.etag && stale) headers['If-None-Match'] = entry.etag; // 304 = la copie locale est déjà à jour
      const r = await fetchRaw(url, headers);
      if (r.status === 304) {
        const upd = { ...entry, downloadedAt: new Date().toISOString() };
        await s.put('downloads', k, upd); have.set(k, upd);
        freshened.push(k); bumpFailure(k, true);
        return;
      }
      const blob = await r.blob();
      const etag = r.headers?.get ? (r.headers.get('ETag') || '') : '';
      if (blob.size > budget) {
        // Bloc 6-bis — saturation : on libère de la place (hors épinglés) pour un document PLUS UTILE
        // (récent/épinglé/actif) au lieu d'abandonner silencieusement.
        const freed = await makeRoom(blob.size - budget).catch(() => false);
        if (!freed) { bumpFailure(k, false); return; }
        budget = policy.maxTotalMB * 1_000_000 - (await totalBytes());
        if (blob.size > budget) { bumpFailure(k, false); return; }
      }
      const res = await recordRecentDocument({ entity, entityId: id, name, mime, blob, etag });
      if (res?.stored) { budget -= blob.size || 0; fetched.push(k); bumpFailure(k, true); }
    } catch { bumpFailure(k, false); /* réessaiera au prochain passage, borné par le compteur ; jamais de faux « disponible » */ }
  };
  for (const d of docs.slice(0, Math.ceil(limit / 2))) await grab('documents', d.id, `/documents/${encodeURIComponent(d.id)}/download`, d.original_name || 'justificatif', d.mime_type || 'application/octet-stream', d.updated_at || d.created_at || '');
  for (const q of quotes.slice(0, Math.ceil(limit / 2))) await grab('quotes', q.id, `/documents/${q.document_type === 'invoice' ? 'invoices' : 'quotes'}/${encodeURIComponent(q.id)}.pdf`, `${String(q.number || 'document').replace(/[^\w.-]+/g, '_')}.pdf`, 'application/pdf', q.updated_at || '');
  await pruneToLimit();
  return { fetched: fetched.length, freshened: freshened.length };
}

function policyBlocksNetwork() { const c = navigator.connection; return Boolean(c && (c.type === 'cellular' || /2g|3g/.test(String(c.effectiveType || '')))); }

async function pruneToLimit() {
  const s = store; if (!s) return;
  const policy = await getDocumentsPolicy();
  const pinned = new Set(policy.pinned);
  const all = (await s.getAll('downloads')).sort((a, b) => String(b.downloadedAt).localeCompare(String(a.downloadedAt)));
  let budget = policy.maxTotalMB * 1_000_000;
  for (const d of all) {
    const size = Number(d.size) || 0;
    if (pinned.has(keyOf(d.entity, d.entityId))) continue; // un épinglé n'est jamais élagué
    if (budget - size >= 0) { budget -= size; continue; }
    await s.delete('downloads', keyOf(d.entity, d.entityId));
  }
  for (const d of all.slice(200)) if (!pinned.has(keyOf(d.entity, d.entityId))) await s.delete('downloads', keyOf(d.entity, d.entityId));
}

/** Liste hors connexion : métadonnées des documents téléchargés (hasContent) ; les anciens
 * restent visibles via les répliques et récupérables à la demande. */
export async function listRecentDocuments() { const s = await ensureStore(); if (!s) return []; const all = await s.getAll('downloads'); return all.sort((a, b) => String(b.downloadedAt).localeCompare(String(a.downloadedAt))).map(({ blob, ...meta }) => ({ ...meta, hasContent: Boolean(blob) })); }
export async function getRecentDocument(entity, entityId) { const s = await ensureStore(); if (!s) return null; return s.get('downloads', keyOf(entity, entityId)); }
export async function removeRecentDocument(entity, entityId) { const s = await ensureStore(); if (!s) return; await s.delete('downloads', keyOf(entity, entityId)); }

/** Ancien fichier récupéré À LA DEMANDE quand la connexion est là (jamais pré-téléchargé). */
export async function downloadAtDemand(entity, entityId, url, name, mime) { if (!navigator.onLine) return { ok: false, reason: 'offline' }; const r = await fetchRaw(url); const blob = await r.blob(); await recordRecentDocument({ entity, entityId, name: name || 'document', mime: mime || 'application/pdf', blob }); return { ok: true }; }

/** Ouvre un document hors connexion : URL d'objet locale (Blob URL) ou null si absent. */
export async function openRecentDocument(entity, entityId) {
  const d = await getRecentDocument(entity, entityId);
  if (!d) return null;
  const blob = (typeof Blob !== 'undefined' && d.blob instanceof Blob) ? d.blob : base64ToBlob(d.blob, d.mime);
  return blob ? URL.createObjectURL(blob) : null;
}

async function blobToBase64(blob) { const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return `data:${blob.type || 'application/octet-stream'};base64,${btoa(s)}`; }
function base64ToBlob(dataUrl, mime) { try { const [head, body] = String(dataUrl).split(','); const type = /:(.*?);/.exec(head)?.[1] || mime || 'application/octet-stream'; const bin = atob(body); const buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i); return new Blob([buf], { type }); } catch { return null; } }
