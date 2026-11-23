// D3 (15.4.0) : plus aucune IA. L'import de données d'une entreprise existante est conservé en mode déterministe.
// Ce fichier remplace les contrats « absorption IA » par le contrat d'import local et un test d'absence de l'IA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const root = fileURLToPath(new URL('../../', import.meta.url));

test('l’import d’une entreprise existante se trouve dans les paramètres (sans IA)', () => {
  const settings=read('../../assets/js/pages/dash/settings.js');
  const component=read('../../assets/js/pages/data-import.js');
  assert.match(settings,/settings-data-import/);
  assert.match(settings,/renderDataImport/);
  assert.match(component,/api\.previewDataImport\(files\)/);
  assert.match(component,/api\.commitDataImport\(records\)/);
  assert.match(component,/askConfirm/);
  assert.doesNotMatch(component,/data-import-ai-consent|useAI|analyse IA/i);
});

test('les données sont prévisualisées et modifiables, puis importées après confirmation explicite', () => {
  const component=read('../../assets/js/pages/data-import.js');
  const route=read('../src/routes/data-import.ts');
  assert.match(component,/Données reconnues — JSON modifiable/);
  assert.match(component,/data-import-include/);
  assert.match(component,/Confirmer l’import des données/);
  assert.match(route,/app.post\('\/data-import\/preview'/);
  assert.match(route,/app.post\('\/data-import\/commit'/);
  assert.match(route,/savepoint absorption_item_/);
  assert.match(route,/deterministicImportCandidates\(sources\)/);
});

test('les anciennes interfaces d’identité visuelle, de formalités et d’IA ne sont plus exposées', () => {
  const api=read('../../assets/js/core/api.js');
  const main=read('../../assets/js/main.js');
  const app=read('../src/app.ts');
  assert.doesNotMatch(api,/administrativeFormalities|administrativeMail|downloadBrandBundle|generateBrandLogo|analyzeOnboardingStep|\/ai\//);
  assert.doesNotMatch(main,/renderGuidedOnboarding|journeyEntryState/);
  assert.doesNotMatch(app,/journeyRoutes|aiAssistanceRoutes/);
  assert.equal(existsSync(join(root,'backend/src/routes/ai-assistance.ts')),false);
  assert.equal(existsSync(join(root,'backend/src/services/local-ai.ts')),false);
});

test('porte de validation D3 : aucune référence IA dans les chemins d’exécution', () => {
  const forbidden=/api\.anthropic\.com|api\.openai\.com|api\.x\.ai|generativelanguage\.googleapis\.com|ollama|ANTHROPIC_API_KEY|OPENAI_API_KEY|XAI_API_KEY|GEMINI_API_KEY|AURION_AI_|AURION_LOCAL_LLM/i;
  const roots=['backend/src','assets/js','scripts','tools','render.yaml','backend/.env.example','index.html','sw.js'];
  const hits=[];
  const walk=p=>{const abs=join(root,p);if(!existsSync(abs))return;if(statSync(abs).isDirectory()){for(const f of readdirSync(abs))walk(join(p,f));return}if(!/\.(ts|js|mjs|ps1|bat|ya?ml|html|example)$/.test(p))return;if(forbidden.test(readFileSync(abs,'utf8')))hits.push(p)};
  roots.forEach(walk);
  assert.deepEqual(hits,[]);
});
