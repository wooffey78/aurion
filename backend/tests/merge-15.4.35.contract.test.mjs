// Contrats de la version fusionnée 15.4.35 (15.4.34-consolidée + apports 15.4.25 + consignes éditeur).
// Lecture du code livré : aucun environnement PostgreSQL requis.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = p => readFileSync(join(root, p), 'utf8');

const migrateTs = read('backend/src/migrate.ts');
const accountTs = read('backend/src/routes/account.ts');
const adminTs = read('backend/src/routes/admin.ts');
const appTs = read('backend/src/app.ts');
const businessTs = read('backend/src/routes/business.ts');
const deletionService = read('backend/src/services/account-deletion.ts');
const otherJs = read('assets/js/pages/dash/other.js');
const accountJs = read('assets/js/pages/dash/account.js');
const quoteJs = read('assets/js/pages/dash/quote.js');
const apiJs = read('assets/js/core/api.js');
const profilesTs = read('backend/src/services/profiles.ts');
const fiscalTs = read('backend/src/services/fiscal-detection.ts');
const microDetectionTs = read('backend/src/services/micro-detection.ts');
const registryFillJs = read('assets/js/core/registry-fill.js');
const css = read('assets/css/app.css');

// ---------------------------------------------------------------- §3 migrations fusionnées
test('séquence de migrations fusionnée : réplication 084-086 conservée, 087 conservée, suppression 088/089 ajoutées', () => {
  const migrations = readdirSync(join(root, 'backend/migrations')).sort();
  for (const expected of ['084_sync_replication.sql', '085_sync_replication_extension.sql', '086_sync_replication_completeness.sql',
    '087_admin_guest_invite_delivery.sql', '088_account_deletion_requests.sql', '089_account_deletion_processing.sql']) {
    assert.ok(migrations.includes(expected), `migration manquante : ${expected}`);
  }
  assert.ok(!migrations.includes('084_admin_free_access_invite_delivery.sql'), '084 de la 15.4.25 ne doit pas doubler la 087 équivalente');
  // Aucune nouvelle collision de préfixe hors dérogations historiques 042/044.
  const prefixes = new Map();
  for (const f of migrations) {
    const p = f.match(/^(\d+)_/)?.[1];
    if (p) prefixes.set(p, (prefixes.get(p) || 0) + 1);
  }
  for (const [p, n] of prefixes) {
    if (p === '042' || p === '044') continue;
    assert.equal(n, 1, `préfixe ${p} utilisé ${n} fois : collision de migrations`);
  }
});

test('§3.4 le runner échoue sur une nouvelle collision de préfixe et tolère 042/044', () => {
  assert.match(migrateTs, /historicalDuplicatePrefixes = new Set\(\['042', '044'\]\)/);
  assert.match(migrateTs, /throw new Error\(`MIGRATION_PREFIX_COLLISION/);
  assert.match(migrateTs, /ATTENTION prefixe historique/);
});

// ---------------------------------------------------------------- §5 suppression de compte
test('§5.2 demande de suppression avec confirmation forte (mot de passe revérifié)', () => {
  assert.match(accountTs, /password: z\.string\(\)\.min\(1\)\.max\(256\)/);
  assert.match(accountTs, /verifyPassword\(me\.password_hash/);
  assert.match(accountJs, /deletionPassword/);
  assert.match(apiJs, /requestAccountDeletion:\(reason,password\)/);
});

test('§5.3 page publique servie et endpoint public neutre rate-limité', () => {
  assert.ok(existsSync(join(root, 'public/account-deletion.html')), 'page publique manquante');
  const page = read('public/account-deletion.html');
  assert.match(page, /Demander la suppression de votre compte Aurion/);
  assert.match(page, /Ce qui est conservé/);
  assert.match(page, /\/public\/account-deletion\.css/);
  assert.doesNotMatch(page, /<script>|<style|style=/);
  assert.match(accountTs, /app\.get\('\/legal\/suppression-compte'/);
  assert.match(accountTs, /app\.post\('\/public\/account-deletion-requests'/);
  assert.match(appTs, /allowedPath.*public/);
  const neutralUses = (accountTs.match(/reply\.code\(202\)\.send\(neutral\)/g) || []).length;
  assert.ok(neutralUses >= 3, `réponse neutre incomplète (${neutralUses} usages)`);
});

test('§5.4 console admin : section indépendante avec loader, traiter et rejeter motivé', () => {
  assert.match(adminTs, /app\.get\('\/admin\/account-deletions'/);
  assert.match(adminTs, /app\.post\('\/admin\/account-deletions\/:id\/process'/);
  assert.match(adminTs, /app\.post\('\/admin\/account-deletions\/:id\/reject'/);
  assert.match(adminTs, /Un motif de rejet est requis/);
  assert.match(otherJs, /deletions: \(\) => api\.adminAccountDeletions\(\)/);
  assert.match(otherJs, /Demandes de suppression de compte/);
  assert.match(otherJs, /admin-del-process/);
  assert.match(otherJs, /admin-del-reject/);
  assert.match(otherJs, /Historique des traitements/);
  assert.match(apiJs, /adminProcessAccountDeletion/);
  assert.match(apiJs, /adminRejectAccountDeletion/);
});

test('§5.5 service de traitement réel, idempotent, preuve conservée avant effacement', () => {
  assert.match(deletionService, /update native_sessions set revoked_at=now\(\) where user_id=\$1 and revoked_at is null/);
  assert.match(deletionService, /bumpSessions\(userId\)/);
  assert.match(deletionService, /delete from google_connections where organization_id=\$1/);
  assert.match(deletionService, /delete from mail_accounts where organization_id=\$1/);
  assert.match(deletionService, /delete from organization_members where organization_id=\$1 and user_id=\$2/);
  const auditIdx = deletionService.indexOf('insert into account_deletion_audit');
  const userIdx = deletionService.indexOf('delete from users where id=$1');
  assert.ok(auditIdx >= 0 && userIdx > auditIdx, 'l\'audit doit précéder la suppression du compte');
  assert.match(deletionService, /alreadyProcessed: true/);
  assert.match(deletionService, /set status='pending' where id=\$1 and status='processing'/);
  assert.match(deletionService, /createHash\('sha256'\)/);
  assert.match(deletionService, /update vip_guest_accounts set invited_by=\$2 where invited_by=\$1/);
});

// ---------------------------------------------------------------- consignes éditeur 15.4.35
test('métiers : au moins 19 profils, chaque profil a une catégorie micro par défaut', () => {
  const defsStart = profilesTs.indexOf('const DEFS: Record<string, Def> = {');
  const rulesStart = profilesTs.indexOf('const RULES:');
  assert.ok(defsStart >= 0 && rulesStart > defsStart);
  const defsBlock = profilesTs.slice(defsStart, rulesStart);
  const defCodes = [...defsBlock.matchAll(/^  '?([a-z][a-z-]*)'?: \{\s*$/gm)].map(m => m[1]);
  assert.ok(defCodes.length >= 19, `profils métier : ${defCodes.length} (attendu ≥ 19)`);
  for (const code of defCodes) {
    assert.ok(fiscalTs.includes(`'${code}':`), `PROFILE_MICRO_CATEGORY ne couvre pas « ${code} »`);
  }
});

test('suggestions : mots-clés élargis + indices NAF → métier, jamais imposés', () => {
  for (const code of ['catering', 'couture', 'transport', 'pets', 'lessons', 'sport', 'handcraft', 'events']) {
    assert.match(profilesTs, new RegExp(`\\['${code}', /`), `règle de suggestion manquante pour ${code}`);
  }
  assert.match(microDetectionTs, /NAF_PROFILE_HINTS/);
  assert.match(microDetectionTs, /export function proposeProfileFromNaf/);
  assert.match(businessTs, /proposeProfileFromNaf\(b\.nafCode/);
  // Le métier proposé reste modifiable dans l'interface (aucune imposition).
  const onboardingJs = read('assets/js/pages/onboarding.js');
  assert.match(onboardingJs, /Métier proposé : .* Vous pouvez le modifier/);
});

test('détection automatique : la TVA dérivée du SIREN remplit le champ vide', () => {
  assert.match(registryFillJs, /export function frenchVatFromSiren\(/);
  assert.match(registryFillJs, /const detectedVat\s*=\s*clean\(detected\.vatNumber \?\? detected\.vat_number\)\s*\|\|\s*frenchVatFromSiren\(/);
  assert.match(registryFillJs, /vat_number: detectedVat/);
});

test('cotisations : détection par catégorie micro avec micro-social + CFP pour tout profil', () => {
  assert.match(fiscalTs, /PROFILE_MICRO_CATEGORY/);
  assert.match(fiscalTs, /export function detectContributionPresets\(/);
  // CFP différenciée commerce / artisanat et branche CIPAV distincte (15.4.37).
  assert.match(fiscalTs, /services_bic_commercial/);
  assert.match(fiscalTs, /services_bic_artisan/);
  assert.match(fiscalTs, /services_bnc_cipav/);
  assert.match(fiscalTs, /23\.2/);
  // Les taux de référence restent officiels et distincts de l'impôt (bloc 8).
  const referentialTs = read('backend/src/services/micro-referential.ts');
  assert.match(referentialTs, /socialRate: 12\.3/);
  assert.match(referentialTs, /socialRate: 21\.2/);
  assert.match(referentialTs, /socialRate: 25\.6/);
  assert.match(referentialTs, /socialRate: 23\.2/);
});

test('validation des devis/factures par un dialogue Aurion (aucune alerte native)', () => {
  assert.match(quoteJs, /Valider \$\{editing\?`les modifications de ce \$\{docLabel\}`:`la création de ce \$\{docLabel\}`\} \?/);
  assert.match(quoteJs, /Total HT : \$\{money\(r\.totalHt\)\}/);
  // Aucun appel natif alert/confirm/prompt dans le CODE (les commentaires sont ignorés).
  const stripComments = t => t.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [file, text] of [['quote', quoteJs], ['other', otherJs], ['account', accountJs]]) {
    assert.doesNotMatch(stripComments(text), /(?<![.\w])alert\(|(?<![.\w])confirm\(|(?<![.\w])prompt\(/, `dialogue natif dans ${file}.js`);
  }
});

test('curseur sombre à contour clair appliqué à la coquille et aux champs', () => {
  assert.match(css, /Curseur de souris sombre/);
  assert.match(css, /html\{cursor:url\("data:image\/svg\+xml/);
  assert.match(css, /\[contenteditable="true"\]\{cursor:url\(/);
});

test('accueil : compteur serveur des rendez-vous programmés raccordé', () => {
  assert.match(businessTs, /upcomingAppointmentsResult/);
  assert.match(businessTs, /upcomingAppointments:/);
  assert.match(otherJs, /dashboardCounters\?\.upcomingAppointments\?\?/);
});

// ---------------------------------------------------------------- déploiement GitHub + Render
test('config GitHub/Render : autodeploy activé et CI conservée', () => {
  assert.ok(existsSync(join(root, '.github/workflows/aurion-ci.yml')), 'workflow CI manquant');
  const render = read('render.yaml');
  assert.match(render, /autoDeploy: true/);
  assert.match(render, /Les secrets ne sont JAMAIS écrits ici/);
  const ci = read('.github/workflows/aurion-ci.yml');
  assert.match(ci, /postgres:17-alpine/);
  assert.match(ci, /npm audit/);
});

test('documents juridiques : révision technique 4.0 du 20 novembre 2026 sur les cinq documents publiés', () => {
  for (const doc of ['docs/CGU-CGV.md', 'docs/COOKIES.md', 'docs/LEGAL-NOTICE.md', 'docs/DECLARATION-ACCESSIBILITE.md', 'docs/POLITIQUE-CONFIDENTIALITE.md']) {
    assert.match(read(doc), /révision du 20 novembre 2026 pour Aurion 15\.4\.35/);
  }
  assert.match(read('docs/POLITIQUE-CONFIDENTIALITE.md'), /Droit à l'effacement en ligne \(15\.4\.35\)/);
  assert.match(read('docs/POLITIQUE-CONFIDENTIALITE.md'), /legal\/suppression-compte/);
});

test('versions harmonisées 15.4.38 partout (manifestes, lockfiles, service worker)', () => {
  const pkg = JSON.parse(read('package.json'));
  const bpkg = JSON.parse(read('backend/package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  const block = JSON.parse(read('backend/package-lock.json'));
  for (const [name, v] of [['package.json', pkg.version], ['backend/package.json', bpkg.version], ['package-lock.json', lock.version], ['backend/package-lock.json', block.version]]) {
    assert.equal(v, '15.4.38', `${name} : version ${v}`);
  }
  assert.equal(lock.packages[''].version, '15.4.38', 'package-lock.json : packages[""].version');
  assert.equal(block.packages[''].version, '15.4.38', 'backend/package-lock.json : packages[""].version');
  assert.equal(read('VERSION.txt').trim(), '15.4.38');
  assert.equal(read('backend/VERSION.txt').trim(), '15.4.38', 'backend/VERSION.txt');
  assert.match(read('sw.js'), /aurion-shell-v15\.4\.38-r1/);
  assert.match(read('index.html'), /v=15\.4\.38-r1/);
});
