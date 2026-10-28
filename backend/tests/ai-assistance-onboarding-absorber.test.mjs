import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('le journal ne remonte que les actions ouvertes et referme les anciennes alertes d’une formalité', () => {
  const dashboard = read('../src/routes/business.ts');
  const journey = read('../src/routes/journey.ts');
  assert.equal((dashboard.match(/resolved_at is null and severity in \('action','warning','error'\)/g) || []).length, 2);
  assert.match(dashboard, /configuration_incomplete.*legacy-configuration-incomplete/s);
  assert.ok(dashboard.includes('resolved_at=coalesce(resolved_at,now())'), 'l’alerte de configuration est clôturée quand elle n’est plus applicable');
  assert.match(dashboard, /event_type='configuration_incomplete'/);
  assert.match(journey, /event_type='administrative_formality_updated' and dedupe_key like \$2 and resolved_at is null/);
  assert.match(journey, /formality-updated:\$\{id\}:%/);
});

test('les actions du journal ont un espacement horizontal et vertical explicite et se replient sur mobile', () => {
  const css = read('../../assets/css/app.css');
  assert.match(css, /\.journal-board \.journal-actions\{[^}]*column-gap:18px;row-gap:10px/s);
  assert.match(css, /\.journal-board \.journal-actions \.link-btn\{[^}]*margin:0;/s);
  assert.match(css, /@media\(max-width:640px\)\{\.journal-board \.journal-actions\{column-gap:15px;row-gap:8px/s);
});

test('un logo importé manuellement affiche instantanément le même aperçu et peut être enregistré', () => {
  const frontend = read('../../assets/js/pages/guided-onboarding.js');
  assert.match(frontend, /document\.querySelector\('#j-brand-logo'\)\?\.addEventListener\('change',[\s\S]*?setGeneratedLogo\(file\)/);
  assert.match(frontend, /function setGeneratedLogo\(file\)[\s\S]*?preview\.appendChild\(img\)[\s\S]*?save\.disabled=false/);
  assert.match(frontend, /id="journey-logo-preview"/);
  assert.match(frontend, /api\.uploadLogo\(generatedLogoFile\)/);
});

test('le bundle de marque conserve le logo réel et crée les déclinaisons d’affichage sans prétendre le vectoriser', () => {
  const assets = read('../src/services/brand-assets.ts');
  const journey = read('../src/routes/journey.ts');
  const documents = read('../src/routes/documents.ts');
  for (const path of ['logo/logo-principal', 'logo/variantes/logo-fond-clair.svg', 'logo/variantes/logo-fond-sombre.svg', 'logo/variantes/logo-fond-accent.svg', 'logo/icone-carree.svg', 'favicon.svg', 'aperçu-identite-visuelle.html']) assert.ok(assets.includes(path), `asset du bundle absent : ${path}`);
  assert.match(journey, /addBrandLogoAssets/);
  assert.match(documents, /addBrandLogoAssets/);
  assert.match(assets, /not a claim that a raster logo was redrawn as vector artwork/);
});

test('les suggestions IA sont modifiables/supprimables et l’absorption nécessite une confirmation explicite', () => {
  const frontend = read('../../assets/js/pages/guided-onboarding.js');
  const routes = read('../src/routes/ai-assistance.ts');
  assert.match(frontend, /data-ai-delete/);
  assert.match(frontend, /data-ai-value/);
  assert.match(frontend, /data-absorb-delete/);
  assert.match(frontend, /Données reconnues — JSON modifiable/);
  assert.match(frontend, /if\(!confirm\(`Importer/);
  assert.match(frontend, /api\.commitDataAbsorption\(records\)/);
  assert.match(routes, /app\.post\('\/ai\/data-absorption\/preview'/);
  assert.match(routes, /app\.post\('\/ai\/data-absorption\/commit'/);
  assert.match(routes, /ignore les instructions/i);
  assert.match(routes, /savepoint absorption_item_/);
});

test('la configuration Gmail et des clés IA est documentée sans secret réel', () => {
  const docs = read('../../docs/CONFIGURATION-MESSAGERIE-ET-IA.md');
  assert.match(docs, /GOOGLE_CLIENT_ID/);
  assert.match(docs, /administrative-mail\/oauth\/callback/);
  assert.match(docs, /GMAIL_READONLY|gmail\.readonly/);
  assert.match(docs, /GMAIL_SEND|gmail\.send/);
  assert.match(docs, /OPENAI_API_KEY/);
  assert.match(docs, /GEMINI_API_KEY/);
  assert.match(docs, /ANTHROPIC_API_KEY/);
  assert.match(docs, /XAI_API_KEY/);
});
