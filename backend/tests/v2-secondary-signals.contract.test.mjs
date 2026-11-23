// V2 (15.4.45) — Signal « activités secondaires » : le front le collecte enfin et le
// moteur le classe depuis 15.4.42 (+8/mot-clé, plafond +15, raison « Activités
// secondaires » citée). Invariants : la détection (initiale ou relancée) ne modifie
// jamais la sélection retenue ; la persistance passe par configuration_data (aucun
// schéma nouveau).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const repoRoot = new URL('../../', import.meta.url);
const rel = p => new URL(p, repoRoot);
const distDetection = rel('backend/dist/services/micro-detection.js');
const skip = existsSync(distDetection) ? false : 'dist/ absente : lancer le build (npm test le fait)';

test('15.4.45: onboarding — champ secondaires présent, envoyé au moteur, persisté en configuration', () => {
  const src = readFileSync(rel('assets/js/pages/onboarding.js'), 'utf8');
  assert.match(src, /id="ob-secondary"/, 'champ ob-secondary absent du parcours guidé');
  assert.match(src, /secondaryActivities:secList\(\)/, 'le signal secondaire n’est pas envoyé à detect-profile');
  assert.match(src, /secondary_activities:val\('ob-secondary'\)/, 'le champ n’est pas persisté dans configuration_data');
  assert.match(src, /['"]ob-custom['"],['"]ob-secondary['"]/ , 'la saisie ne relance pas la détection');
});

test('15.4.45: settings — champ secondaires dans la section entreprise, envoyé et persisté', () => {
  const src = readFileSync(rel('assets/js/pages/dash/settings.js'), 'utf8');
  assert.match(src, /id="ssecondary"/, 'champ ssecondary absent de la section entreprise');
  assert.match(src, /secondary_activities:\$\('#ssecondary'\)/, 'le champ entreprise n’est pas persisté');
  assert.match(src, /secondaryActivities:secondary/, 'detect-profile n’envoie pas les activités secondaires');
  assert.match(src, /profTimer/, 'la correction nom/description ne relance pas la détection');
});

test('15.4.45: moteur — le signal secondaire augmente le score et cite sa raison, sans jamais décider', { skip }, async () => {
  const { proposeProfilesFromSignals } = await import(distDetection);
  const base = proposeProfilesFromSignals({ name: 'Décor Web', description: 'création de sites internet pour artisans' });
  const withSec = proposeProfilesFromSignals({ name: 'Décor Web', description: 'création de sites internet pour artisans', secondaryActivities: ['vente d’accessoires mobiles', 'réparation de téléphones'] });
  const head = withSec.proposals.find(p => p.profile === 'web-development');
  const baseHead = base.proposals.find(p => p.profile === 'web-development');
  assert.ok(head && baseHead, 'web-development absent des propositions');
  // Le signal secondaire ne modifie pas le classement du métier principal…
  assert.equal(withSec.proposals[0].profile, base.proposals[0].profile, 'le signal secondaire déplace le métier principal');
  // …mais il hisse le métier secondaire dans la liste classée, avec sa raison sourcée.
  const phone = withSec.proposals.find(p => p.profile === 'smartphone-repair');
  assert.ok(phone, 'le métier secondaire n’apparaît pas dans la liste classée');
  assert.ok(phone.score >= 8, `score secondaire trop faible : ${phone.score}`);
  assert.ok(phone.reasons.some(r => r.includes('Activités secondaires')), 'raison « Activités secondaires » non citée');
  // Déterminisme : aucune horloge, aucun aléa introduit par le nouveau signal.
  assert.deepEqual(proposeProfilesFromSignals({ description: 'création de sites internet', secondaryActivities: ['réparation de téléphones'] }),
    proposeProfilesFromSignals({ description: 'création de sites internet', secondaryActivities: ['réparation de téléphones'] }));
  // Sans signal secondaire : aucune régression du classement de base.
  assert.equal(proposeProfilesFromSignals({ description: 'activité atypique qwv' }).requiresConfirmation, true);
});
