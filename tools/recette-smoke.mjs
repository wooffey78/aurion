// Fumée API de la recette 15.4.45 : moteur de propositions (avec signal secondaire),
// confirmation explicite, traçabilité complète. Exécuté par tools/recette-e2e.sh.
// Nécessite un serveur démarré sur PORT (4000) et un compte de recette inscrit.
const BASE = `http://127.0.0.1:${process.env.PORT || 4000}`;

async function j(method, path, body, token) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

const assert = (ok, label) => { if (!ok) throw new Error(`ÉCHEC : ${label}`); console.log(`  ✓ ${label}`); };

const login = await j('POST', '/auth/login', { email: 'recette@example.test', password: 'Recette-2026-Aurion!' });
const token = login.accessToken;
assert(!!token, 'connexion du compte de recette');

const org = login.organizationId;
const acts = await j('GET', '/activities', null, token);
let activity = (acts.activities || acts)[0] || (await j('POST', '/activities', { name: 'Atelier recette' }, token));
const activityId = activity.id;
assert(!!activityId, 'activité de recette disponible');

const detect = await j('POST', '/activities/detect-profile', {
  name: 'Décor Web',
  description: 'création de sites internet pour artisans',
  nafCode: '62.01A',
  secondaryActivities: ['réparation de téléphones'],
  activityId,
}, token);
assert(detect.proposals?.length >= 2, `propositions classées : ${detect.proposals.map(p => p.profile).join(', ')}`);
assert(detect.proposals[0].profile === 'web-development', 'métier principal en tête');
const phone = detect.proposals.find(p => p.profile === 'smartphone-repair');
assert(!!phone && phone.reasons.some(x => x.includes('Activités secondaires')), 'signal secondaire cité dans les raisons');
assert(detect.proposals[0].confidence === 'tres-eleve', 'confiance très élevée (NAF précis + description + nom)');

const choice = await j('POST', `/activities/${activityId}/profile-choice`, { profileCode: 'web-development', confirmProposalId: 'web-development' }, token);
assert(choice.origin === 'confirmed' && !!choice.chosenAt, `origine confirmée et datée (${choice.chosenAt?.slice(0, 10)})`);

const profile = await j('GET', `/activities/${activityId}/profile`, null, token);
assert(profile.retainedCode === 'web-development' && profile.origin === 'confirmed' && !!profile.chosenFromProposal, 'triplet de traçabilité complet (retenu, origine, proposition d\'origine)');

console.log('Fumée API : tous les contrôles passent.');
