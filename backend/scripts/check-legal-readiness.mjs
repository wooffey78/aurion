// Pré-vol juridique — miroir exécutable de la porte de publication de l'application
// (backend/src/services/account.ts : ensureLegalDocuments). Affiche EXACTEMENT ce qui
// empêche la publication de chaque document juridique : approbation de version, variables
// d'identité manquantes (valeurs masquées), placeholders non résolus avec numéro de ligne.
// L'outil ne décide rien et ne modifie rien : il liste les blocages à lever (coordonnées
// hébergeur/médiateur après souscription et adhésion — documents/RAPPORT-15.4.22.md).
// Usage : node scripts/check-legal-readiness.mjs [--strict]
//   --strict : code de sortie 1 si au moins un document n'est pas publiable (sinon 0).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_ROOT = path.resolve(BACKEND_ROOT, '..');
const strict = process.argv.includes('--strict');
const mask = (v) => (v ? `${String(v).slice(0, 2)}***${String(v).slice(-2)}` : '(absent)');

// La liste des documents et des variables obligatoires est extraite DIRECTEMENT de la source
// services/account.ts (LEGAL_SEEDS) pour ne jamais diverger de la porte réellement appliquée.
const seeds = (() => {
  const src = readFileSync(path.join(BACKEND_ROOT, 'src', 'services', 'account.ts'), 'utf8');
  const block = src.slice(src.indexOf('const LEGAL_SEEDS'), src.indexOf('const legalTokenLabel'));
  const out = [];
  const re = /\{\s*kind:\s*'([^']+)',\s*title:\s*'([^']+)',\s*file:\s*'([^']+)',\s*requiredEnv:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    out.push({
      kind: m[1],
      title: m[2],
      file: m[3],
      requiredEnv: [...m[4].matchAll(/'([A-Z0-9_]+)'/g)].map(x => x[1]),
    });
  }
  return out;
})();

// Motifs de blocage identiques à ceux du code applicatif (échec fermé côté application).
const UNRESOLVED_RE = /\{\{[A-Z0-9_]+\}\}|\[(?:À compléter|À confirmer|À valider|À choisir|À désigner|À renseigner)[^\]]*\]|PROJET DE DOCUMENT|PROJET DE PAGE|PROJET À COMPLÉTER|DOSSIER DE PRÉPARATION|NE PAS PUBLIER/i;
const APPROVAL_EXPECTED = '4.0';

const approval = process.env.AURION_LEGAL_PUBLICATION_APPROVAL || '';
console.log('== Pré-vol juridique (miroir de la porte de publication 4.0) ==');
console.log(`AURION_LEGAL_PUBLICATION_APPROVAL = ${approval ? `'${approval}'` : '(absent)'} — valeur attendue : '${APPROVAL_EXPECTED}'`);
if (approval !== APPROVAL_EXPECTED) console.log(`  ⚠ approbation ${approval === '' ? 'absente' : `'${approval}' incorrecte`} → tous les documents resteraient en brouillon`);

let ready = 0;
for (const s of seeds) {
  const f = path.join(PROJECT_ROOT, 'docs', s.file);
  console.log(`\n— ${s.kind} (${s.file}) : ${s.title}`);
  if (!existsSync(f)) {
    console.log('  ✖ fichier introuvable');
    continue;
  }
  const lines = readFileSync(f, 'utf8').split(/\r?\n/);
  const missing = s.requiredEnv.filter(k => !String(process.env[k] || '').trim());
  for (const k of missing) console.log(`  • variable obligatoire absente : ${k}`);
  const hits = [];
  lines.forEach((line, i) => {
    const re = new RegExp(UNRESOLVED_RE.source, 'gi');
    let mm;
    while ((mm = re.exec(line)) !== null) hits.push({ line: i + 1, text: mm[0].slice(0, 90) });
  });
  for (const h of hits) console.log(`  • placeholder non résolu (ligne ${h.line}) : ${h.text}`);
  const ok = missing.length === 0 && hits.length === 0;
  console.log(ok ? '  ✔ publiable dès l\'approbation de version' : `  ✖ bloqué : ${missing.length} variable(s) + ${hits.length} placeholder(s)`);
  if (ok) ready++;
}

const allVars = seeds.flatMap(s => s.requiredEnv);
const configured = allVars.filter(k => String(process.env[k] || '').trim());
console.log('\n== Variables d\'identité présentes ==');
for (const k of [...new Set(allVars)]) console.log(`  ${k} = ${configured.includes(k) ? mask(process.env[k]) : '(absent)'}`);

console.log(`\n== Bilan : ${ready}/${seeds.length} documents prêts ; approbation : ${approval === APPROVAL_EXPECTED ? 'OK' : 'à compléter'} ==`);
console.log('La publication effective est ensuite effectuée par l\'application au démarrage (statut brouillon échoué fermé tant que ces blocages existent).');
if (strict && (ready !== seeds.length || approval !== APPROVAL_EXPECTED)) process.exit(1);
