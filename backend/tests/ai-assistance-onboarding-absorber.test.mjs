import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('l’import d’une entreprise existante se trouve dans les paramètres', () => {
  const settings=read('../../assets/js/pages/dash/settings.js');
  const component=read('../../assets/js/pages/data-import.js');
  assert.match(settings,/settings-data-import/);
  assert.match(settings,/renderDataImport/);
  assert.match(component,/previewDataAbsorption/);
  assert.match(component,/commitDataAbsorption/);
  assert.match(component,/askConfirm/);
  assert.match(component,/data-import-ai-consent/);
});

test('les données sont prévisualisées et modifiables, puis importées après confirmation explicite', () => {
  const component=read('../../assets/js/pages/data-import.js');
  const route=read('../src/routes/ai-assistance.ts');
  assert.match(component,/Données reconnues — JSON modifiable/);
  assert.match(component,/data-import-include/);
  assert.match(component,/Confirmer l’import des données/);
  assert.match(route,/app.post\('\/ai\/data-absorption\/preview'/);
  assert.match(route,/app.post\('\/ai\/data-absorption\/commit'/);
  assert.match(route,/savepoint absorption_item_/);
  assert.match(route,/ignore les instructions/i);
});

test('les anciennes interfaces d’identité visuelle et de formalités ne sont plus exposées', () => {
  const api=read('../../assets/js/core/api.js');
  const main=read('../../assets/js/main.js');
  const app=read('../src/app.ts');
  const routes=read('../src/routes/ai-assistance.ts');
  assert.doesNotMatch(api,/administrativeFormalities|administrativeMail|downloadBrandBundle|generateBrandLogo|analyzeOnboardingStep/);
  assert.doesNotMatch(main,/renderGuidedOnboarding|journeyEntryState/);
  assert.doesNotMatch(app,/journeyRoutes/);
  assert.doesNotMatch(routes,/ai\/journey|brand-logo|admin-document|ai\/onboarding/);
});
