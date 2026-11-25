// 15.4.50 — Modularité métier côté interface : les fonctionnalités sont PROPOSÉES uniquement
// lorsque le métier de l'activité active les rend pertinentes (moteur serveur profile-features.ts,
// catalogue versionné). Cache de session : un seul appel par chargement de coquille ; en cas
// d'échec réseau, le repli est conservateur (core seul visible, aucune fonctionnalité
// métier poussée) — jamais de proposition hors de propos.
let CACHE = null;
let INFLIGHT = null;

export function cachedFlags() { return CACHE; }

export function enabled(key) {
  if (!CACHE) return false;
  return Boolean(CACHE.features?.[key]);
}

export function hiddenReasons() { return CACHE?.hidden || []; }

/** Charge (ou recharge) les fonctionnalités du profil actif. Résilient : jamais d'exception. */
export async function loadProfileFeatures(force = false) {
  if (CACHE && !force) return CACHE;
  if (INFLIGHT && !force) return INFLIGHT;
  INFLIGHT = (async () => {
    try {
      // 15.4.70 — les fonctionnalités doivent suivre l'ACTIVITÉ ACTIVE : sans cet en-tête, le
      // serveur répondait pour la dernière activité modifiée et Chantiers restait visible.
      const activeId = localStorage.getItem('aurion.activeActivityId') || '';
      const headers = activeId ? { 'x-aurion-activity-id': activeId } : {};
      const res = await (await import('./api.js')).api.authFetch('/profile-features', { headers });
      if (!res.ok) throw new Error(String(res.status));
      CACHE = await res.json();
    } catch {
      // Repli conservateur documenté : core uniquement, rien de métier-spécifique n'est proposé.
      // 15.4.61 — retour au masquage d'avant 15.4.59 : Chantiers réapparaît à la reconnexion
      // selon le profil de métier (demande utilisateur).
      CACHE = CACHE || {
        profileCode: '', profileTitle: '',
        features: { chantiers: false, maintenance: false, stock_locations: false, client_portal: true, warranty_workflows: false, time_tracking: false, device_tracking: false },
        hidden: [{ key: 'chantiers', reason: 'Fonctionnalités métier indisponibles hors connexion pour cette activité : elles réapparaîtront à la reconnexion.' }],
      };
    } finally { INFLIGHT = null; }
    return CACHE;
  })();
  return INFLIGHT;
}

/** Panneau de transparence : ce que le métier actif masque, et pourquoi (jamais silencieux). */
export function hiddenPanelMarkup() {
  const list = hiddenReasons();
  if (!list.length) return '';
  return `<details class="profile-features-hidden"><summary>Ce que ce métier n'affiche pas (et pourquoi)</summary><ul>${list.map(h => `<li><b>${e(String(h.key))}</b> — ${e(String(h.reason))}</li>`).join('')}</ul></details>`;
}
const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
