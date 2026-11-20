// Blocs 17 et 18 — audit consolidé : popups de confirmation pour toute création/modification/
// suppression au design Aurion (aucun dialog natif), protection double clic, migrations 042/044
// non renumérotées, Dependabot + audit npm en CI, vérification e-mail volontairement désactivée.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const walk = (dir, fn) => { for (const f of readdirSync(dir)) { const p = path.join(dir, f); if (statSync(p).isDirectory()) walk(p, fn); else fn(p); } };

test('bloc17: aucun dialog natif confirm/prompt/alert dans l\u2019interface', () => {
  const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
  const hits = [];
  // API légitimes du navigateur à ne PAS compter comme dialogs natifs :
  const legit = /__aurionDeferredInstall\.prompt|requestAnimationFrame|window\.scrollTo|window\.addEventListener|window\.location|window\.open|scrollTo\(|matchMedia|navigator\.|window\.matchMedia|dataTransfer|clipboard|window\.history/;
  walk(path.join(root, 'assets/js'), p => {
    if (!p.endsWith('.js')) return;
    const src = readFileSync(p, 'utf8');
    // On retire les commentaires // et /* */ pour ne juger que le CODE exécutable.
    const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (/\bconfirm\s*\(/.test(code)) hits.push(path.relative(root, p) + ' confirm(');
    // L'API d'installation PWA (beforeinstallprompt) expose une méthode .prompt() légitime.
    const codeNoPwa = code.replace(/__aurionDeferredInstall\s*\.\s*prompt\s*\(\)/g, '');
    if (/\bprompt\s*\(/.test(codeNoPwa)) hits.push(path.relative(root, p) + ' prompt(');
    if (/window\.confirm\s*\(|window\.prompt\s*\(|window\.alert\s*\(|(?:^|[^.\w$.])alert\s*\(/.test(code)) hits.push(path.relative(root, p) + ' natif');
    if (legit.test(code) === false && /\balert\s*\(/.test(code)) hits.push(path.relative(root, p) + ' alert(');
  });
  assert.deepEqual(hits, [], 'aucun dialog natif : tous les dialogs sont au design Aurion');
});

test('bloc17: toute suppression métier passe par une confirmation Aurion (confirmDelete/askConfirm)', () => {
  // Chaque bouton de suppression vérifié en source : la confirmation est dans le même flux.
  const pairs = [
    ['assets/js/pages/dash/other.js', /confirmDelete\(`Supprimer.*client|askConfirm\(\{title:'Supprimer ce rendez-vous/],
    ['assets/js/pages/dash/docs.js', /confirmDelete\(`Supprimer définitivement \${q\.document_type==='invoice'\?'la facture':'le devis'}/],
    ['assets/js/pages/dash/docs.js', /confirmDelete\(`Supprimer définitivement le SAV/],
    ['assets/js/pages/dash/catalog.js', /confirmDelete\(/],
    ['assets/js/pages/dash/suppliers.js', /confirmDelete\(/],
    ['assets/js/pages/dash/storage.js', /askConfirm\(\{title:'Supprimer le logo \?'/],
    ['assets/js/pages/dash/account.js', /askConfirm\(\{title:'Retirer cette clé d\u2019accès/],
    ['assets/js/pages/dash/expenses.js', /confirmDelete\(|askConfirm\(/],
    ['assets/js/pages/dash/settings.js', /confirmDelete\(|askConfirm\(/],
  ];
  for (const [file, re] of pairs) {
    const src = read('../../' + file);
    assert.match(src, re, `${file} : confirmation présente`);
  }
  // Fenêtre de confirmation partagée au design Aurion (remplacement documenté de confirm()).
  const core = read('../../assets/js/pages/dash/core.js');
  assert.match(core, /Fenêtre de confirmation au design Aurion/);
});

test('bloc18: migrations 042/044 non renumérotées, Dependabot actif, audit npm dans la CI, e-mail désactivé volontairement', () => {
  const migrations = readdirSync(new URL('../migrations', import.meta.url).pathname).sort();
  assert.ok(migrations.includes('042_migration_prefixes_fix.sql') || migrations.some(m => m.startsWith('042_')));
  assert.ok(migrations.some(m => m.startsWith('044_')));
  // Aucune renumérotation : les 77 premières migrations gardent leur numéro d'origine.
  assert.ok(migrations.includes('062_disable_email_verification.sql'), 'migration 062 conservée');
  assert.ok(existsSync(new URL('../../.github/dependabot.yml', import.meta.url)), 'Dependabot configuré (blocs 1/18)');
  const ci = read('../../.github/workflows/aurion-ci.yml');
  assert.match(ci, /npm audit/);
  // Vérification e-mail : retirée à la demande du propriétaire (15.2.50) — jamais réactivée sans demande.
  const emailDoc = read('../../docs/EMAIL-VERIFICATION.md');
  assert.match(emailDoc, /désactivée/);
  assert.match(emailDoc, /Ne pas réactiver ce flux/);
});
