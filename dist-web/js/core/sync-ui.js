// Bloc 7 — interface de synchronisation : rendre le moteur visible et compréhensible.
// Exploite les événements EXISTANTS (aurion:sync-status du sync-manager, aurion:outbox-changed
// de la file, aurion:offline-view des vues) — aucun deuxième bus. Affiche : en ligne/hors
// connexion, synchronisation en cours, dernier succès, progression du premier chargement,
// compteurs d'opérations (attente, appliquées, conflits, bloquées, erreurs) et panneau détaillé
// avec relance appropriée (syncNow / retryFailedOps). Une intervention n'est demandée que pour
// corriger des données invalides ou un vrai conflit — JAMAIS une seconde confirmation d'une
// décision déjà prise hors connexion. Accessible clavier/lecteur d'écran, sans alert().
let root = null, pill = null, panel = null, listEl = null, counts = {}, lastPhase = 'idle', lastPullAt = 0, built = false;
const escapeSync = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const fmtTime = ts => { if (!ts) return '—'; try { return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch { return '—'; } };

function build() {
  if (built) return; const anchor = document.querySelector('.sidebar-bottom'); if (!anchor) return;
  built = true;
  root = document.createElement('div'); root.className = 'sync-status'; root.id = 'sync-status-root';
  root.innerHTML = `
    <button id="sync-status-pill" type="button" class="sync-pill" aria-expanded="false" aria-controls="sync-panel" title="État de synchronisation et file hors connexion">
      <i aria-hidden="true"></i><span id="sync-status-text">Synchronisation…</span><small id="sync-status-count"></small>
    </button>
    <div id="sync-panel" class="sync-panel" role="region" aria-label="Synchronisation et opérations hors connexion" hidden>
      <p class="sync-line"><strong>État :</strong> <span id="sync-line-state">—</span></p>
      <p class="sync-line"><strong>Dernière synchronisation :</strong> <span id="sync-line-last">—</span></p>
      <p class="sync-line" id="sync-line-progress" hidden><strong>Progression :</strong> <span id="sync-progress-text">—</span></p>
      <p class="sync-line" id="sync-line-offview" hidden><strong>Vues affichées hors connexion :</strong> <span id="sync-offview-text">—</span></p>
      <ul class="sync-counts" id="sync-counts"></ul>
      <div class="sync-actions">
        <button type="button" class="btn secondary small" id="sync-retry">Relancer les opérations en erreur</button>
        <button type="button" class="btn secondary small" id="sync-now">Synchroniser maintenant</button>
      </div>
      <h4 class="sync-h">Opérations hors connexion (décisions conservées, rejeu automatique)</h4>
      <ul class="sync-ops" id="sync-ops-list" aria-live="polite"></ul>
      <p class="sync-note">Les décisions prises hors connexion sont rejouées automatiquement à la reconnexion, dans l'ordre de leurs dépendances, sans nouvelle validation. Seules les opérations refusées par le serveur demandent une correction.</p>
    </div>`;
  anchor.prepend(root);
  pill = root.querySelector('#sync-status-pill'); panel = root.querySelector('#sync-panel');
  pill.addEventListener('click', () => { const open = panel.hidden; panel.hidden = !open; pill.setAttribute('aria-expanded', String(open)); if (open) refreshPanel(); });
  root.querySelector('#sync-retry').addEventListener('click', async () => { const ob = await import('./outbox.js'); await ob.retryFailedOps(); refreshPanel(); });
  root.querySelector('#sync-now').addEventListener('click', async () => { const sm = await import('./sync-manager.js'); await sm.syncNow(); refreshPanel(); });
  listEl = root.querySelector('#sync-ops-list');
}

const STATE_LABELS = { idle: 'À jour', pull: 'Réplication…', 'pull-done': 'Réplication terminée', push: 'Rejeu des décisions…', done: 'Synchronisé' };
function renderStatus(detail = {}) {
  if (!pill) return;
  lastPhase = detail.phase || lastPhase;
  if (['pull-done', 'done', 'idle'].includes(lastPhase) && navigator.onLine) lastPullAt = detail.at || Date.now();
  const offline = !navigator.onLine;
  const dot = pill.querySelector('i'); const txt = pill.querySelector('#sync-status-text');
  pill.classList.toggle('offline', offline); pill.classList.toggle('busy', ['pull', 'push'].includes(lastPhase));
  dot.setAttribute('aria-hidden', 'true');
  txt.textContent = offline ? 'Hors connexion — décisions conservées' : (STATE_LABELS[lastPhase] || 'À jour');
  const pending = (counts.pending || 0) + (counts.sending || 0);
  pill.querySelector('#sync-status-count').textContent = pending ? ` (${pending} en attente)` : '';
  const ls = root.querySelector('#sync-line-state'), ll = root.querySelector('#sync-line-last'), lp = root.querySelector('#sync-line-progress'), pt = root.querySelector('#sync-progress-text');
  if (ls) ls.textContent = offline ? 'Hors connexion' : (STATE_LABELS[lastPhase] || 'À jour');
  if (ll) ll.textContent = `${fmtTime(lastPullAt)}${offline ? ' — rejeu à la reconnexion' : ''}`;
  if (lp && pt) { if (lastPhase === 'pull' && detail.entity) { lp.hidden = false; pt.textContent = `${detail.entity} (${(detail.done || 0)}/${detail.total || '?'} entités)`; } else lp.hidden = true; }
}

function renderCounts() {
  const ul = root?.querySelector('#sync-counts'); if (!ul) return;
  const labels = { pending: 'En attente de rejeu', sending: 'En cours d\'envoi', applied: 'Appliquées (rejouées)', conflict: 'Conflits', blocked: 'Refusées par le serveur', error: 'Erreurs temporaires' };
  ul.innerHTML = Object.entries(labels).map(([k, l]) => `<li><span>${l}</span><strong>${counts[k] || 0}</strong></li>`).join('');
}

async function refreshPanel() {
  if (!panel || panel.hidden) return;
  const ob = await import('./outbox.js');
  const snap = await ob.outboxSnapshot();
  counts = snap.counts; renderCounts();
  const rows = snap.ops.filter(o => o.status !== 'applied').slice(0, 30);
  const statusLabel = { pending: 'En attente', sending: 'Envoi en cours', conflict: 'Conflit', blocked: 'Refusée — correction nécessaire', error: 'Erreur temporaire — reprise auto' };
  // Bloc 5 — conflit de données modifiées sur deux appareils : comparaison champ par champ
  // (valeur locale décidée hors connexion vs valeur serveur actuelle), dates d'origine affichées.
  // Factures émises, paiements, écritures et événements réglementaires ne sont JAMAIS réécrits
  // silencieusement : ils restent listés comme conflits jusqu'à décision explicite.
  const conflictRows = [];
  for (const o of rows.filter(x => x.status === 'conflict')) {
    const m = /\/(clients|suppliers)\/([A-Za-z0-9-]+)/.exec(o.path || '');
    if (o.method === 'PATCH' && m) {
      try {
        const apiMod = await import('../core/api.js');
        const server = (await apiMod.api[m[1] === 'clients' ? 'clients' : 'suppliers']());
        const cur = Array.isArray(server) ? server.find(x => x.id === m[2]) : null;
        const fields = [['name', 'Nom / raison sociale'], ['email', 'E-mail'], ['phone', 'Téléphone'], ['address', 'Adresse']];
        const cmp = fields.map(([k, l]) => {
          const local = o.payload?.[k]; const srv = cur?.[k];
          if (local === undefined || (String(local ?? '') === String(srv ?? ''))) return '';
          return `<tr><th scope="row">${l}</th><td><b>${escapeSync(local ?? '—')}</b><small>votre décision du ${fmtTime(Date.parse(o.decidedAt) || 0)}</small></td><td><b>${escapeSync(srv ?? '—')}</b><small>version serveur${cur?.updated_at ? ' du ' + String(cur.updated_at).slice(0, 10) : ''}</small></td></tr>`;
        }).join('');
        if (cmp) conflictRows.push(`<details class="sync-conflict-detail"><summary>Détail du conflit — ${m[1] === 'clients' ? 'client' : 'fournisseur'} (${m[2].slice(0, 8)}…)</summary><table class="conflict-table"><thead><tr><th>Champ</th><th>Votre valeur</th><th>Valeur serveur</th></tr></thead><tbody>${cmp}</tbody></table><small>Pour conserver votre valeur, corrigez la fiche puis rejouez la décision ; la version serveur reste toujours consultable.</small></details>`);
      } catch { /* hors connexion : la comparaison sera disponible à la reconnexion */ }
    }
  }
  listEl.innerHTML = rows.length ? rows.map(o => `<li class="sync-op sync-${o.status}"><div><code>${o.method} ${o.path}</code><small>${statusLabel[o.status] || o.status} · décision ${fmtTime(Date.parse(o.decidedAt) || 0)}${o.lastError ? ` · ${o.lastError}` : ''}</small></div>${o.status === 'conflict' ? conflictRows.shift() || '' : ''}</li>`).join('') : '<li class="sync-op"><small>Aucune opération en attente — tout est synchronisé.</small></li>';
}

/** Installe l'interface (une seule fois par page) et branché sur les événements existants. */
/** Bloc 3 — horodatage de la dernière réplication complète (affiché par les vues hors connexion). */
export function lastPullTime() { return lastPullAt || 0; }
export function initSyncUi() {
  build(); if (!root) return;
  window.addEventListener('aurion:sync-status', e => renderStatus(e.detail || {}));
  window.addEventListener('aurion:outbox-changed', e => { counts = (e.detail && typeof e.detail === 'object') ? { ...counts, ...e.detail } : counts; renderCounts(); renderStatus({}); if (panel && !panel.hidden) refreshPanel(); });
  window.addEventListener('aurion:offline-view', e => { const line = root.querySelector('#sync-line-offview'), txt = root.querySelector('#sync-offview-text'); if (!line || !txt) return; line.hidden = false; txt.textContent = `${String(e.detail?.dataset || '')} (${e.detail?.count || 0} fiches locales)`; });
  window.addEventListener('online', () => renderStatus({ phase: 'push' }));
  window.addEventListener('offline', () => renderStatus({}));
  renderStatus({ phase: 'idle' });
  // Premier état connu de la file (au cas où elle était déjà remplie avant l'installation).
  import('./outbox.js').then(m => m.outboxSnapshot()).then(s => { counts = s.counts; renderCounts(); renderStatus({}); }).catch(() => {});
}
