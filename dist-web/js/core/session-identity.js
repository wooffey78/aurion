// Bloc 1 — fournisseur unique d'identité et d'identifiant d'appareil.
// Une seule résolution de /auth/me par session (promesse partagée) : le sync-manager, la file
// outbox et le magasin des documents ouvrent TOUS leurs espaces de noms avec le même couple
// organisation/utilisateur/appareil — jamais de mélange entre comptes ou entre modules.
// L'identifiant d'appareil est une donnée technique locale (localStorage), jamais une donnée
// métier ; les données métier restent exclusivement dans le stockage local versionné (Bloc 2).
let identityPromise = null;
export function deviceId() {
  let d = localStorage.getItem('aurion.deviceId');
  if (!d) { d = (crypto.randomUUID ? crypto.randomUUID() : 'dev' + Date.now() + Math.random().toString(16).slice(2)).replace(/[^A-Za-z0-9-]/g, ''); localStorage.setItem('aurion.deviceId', d); }
  return d;
}
/** Identité authentifiée (promesse partagée) : { userId, organizationId, role, deviceId } ou null. */
export function getIdentity() {
  if (!identityPromise) {
    identityPromise = (async () => {
      try {
        const { api } = await import('./api.js');
        const me = await api.me();
        if (!me?.organizationId || !me?.userId) return null;
        return { ...me, deviceId: deviceId() };
      } catch { return null; }
    })();
  }
  return identityPromise;
}
/** Force une nouvelle résolution (connexion d'un autre compte, retour de session). */
export function resetIdentity() { identityPromise = null; }
