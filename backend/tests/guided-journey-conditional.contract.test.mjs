import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('le parcours affiche la route conditionnelle et ne persiste que les étapes canoniques', () => {
  const route = read('../../assets/js/core/journey-route.js');
  const frontend = read('../../assets/js/pages/guided-onboarding.js');
  assert.match(route, /status === 'to_create' \? \[1, 3, 4, 5, 6, 7\]/);
  assert.match(frontend, /stepsData\(\)\[String\(step\)\]/);
  assert.match(frontend, /safeJourneyStep\(preferredStep,businessStatus\(\)\)/);
  assert.match(frontend, /nextJourneyStep\(currentStep,businessStatus\(\)\)/);
  assert.match(frontend, /previousJourneyStep\(currentStep,businessStatus\(\)\)/);
});

test('l’identification et l’absorption sont réservées au statut existant, la situation inconnue reste modifiable', () => {
  const frontend = read('../../assets/js/pages/guided-onboarding.js');
  const backendRoute = read('../src/routes/journey.ts');
  assert.match(frontend, /if\(businessStatus\(\)==='unknown'\)[\s\S]*?Cette étape sert à choisir la suite/);
  assert.match(frontend, /if\(currentStep===2&&businessStatus\(\)==='unknown'\)/);
  assert.match(frontend, /currentStep===2&&businessStatus\(\)==='existing'\)renderAbsorptionPreview/);
  assert.match(frontend, /data-journey-status/);
  assert.match(backendRoute, /businessStatus === 'to_create' \? !valuePresent\(activity\) : true/);
});

test('l’analyse IA générique est limitée à l’activité et aucun traitement IA ne part au rendu du logo', () => {
  const frontend = read('../../assets/js/pages/guided-onboarding.js');
  assert.match(frontend, /currentStep===3\?aiIntelligencePanel\(currentStep\):''/);
  assert.match(frontend, /if\(currentStep===3\)installAiIntelligenceHandlers\(\)/);
  assert.match(frontend, /api\.generateBrandLogo\(\{provider,prompt/);
  assert.match(frontend, /j-logo-create/);
  assert.doesNotMatch(frontend, /renderStep\(\)[\s\S]{0,100}api\.analyzeOnboardingStep/);
});

test('la raison sociale n’est ni reprise dans le prompt logo sans confirmation ni écrasée depuis le naming', () => {
  const frontend = read('../../assets/js/pages/guided-onboarding.js');
  assert.match(frontend, /const brandName=checked\('j-brand-name-confirm'\)/);
  assert.match(frontend, /brandNameTarget:value\('j-brand-name-target'\)/);
  assert.match(frontend, /La raison sociale reste inchangée/);
  assert.doesNotMatch(frontend, /saveOrganizationPatch\(\{name:s\.brandName/);
});

test('le fond, les curseurs et les barres de défilement ont leurs règles globales et leurs ressources', () => {
  const css = read('../../assets/css/app.css');
  const sw = read('../../sw.js');
  assert.match(css, /linear-gradient\(145deg,#eaf2fc 0%,#dfeafa 58%,#d8e5f6 100%\)/);
  assert.match(css, /arrow-dark\.svg/);
  assert.match(css, /pointer-dark\.svg/);
  assert.match(css, /::-webkit-scrollbar\{width:14px;height:14px\}/);
  assert.match(sw, /assets\/cursors\/arrow-dark\.svg/);
});
