import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const service = readFileSync(new URL('backend/src/services/document-forecast.ts', root), 'utf8');
const routes = readFileSync(new URL('backend/src/routes/business.ts', root), 'utf8');
const ui = readFileSync(new URL('assets/js/pages/dash/other.js', root), 'utf8');

test('accueil et trésorerie partagent le même calcul de devis TTC et SAV financiers', () => {
  assert.match(service, /sum\(total_ttc\)/);
  assert.match(service, /document_type='quote'/);
  // 15.4.66 (consigne éditeur) : un devis NON signé n'est pas pris en compte dans les
  // calculs — seuls les devis acceptés par le client (statut 'accepted', horodaté) entrent
  // dans les entrées prévisionnelles.
  assert.match(service, /lower\(coalesce\(status,''\)\)='accepted' and accepted_at is not null/);
  assert.match(service, /lower\(coalesce\(status,''\)\) not in/);
  assert.match(service, /'rejected','refused','expired','void','deleted'/);
  assert.match(service, /sum\(amount_ttc\)/);
  assert.match(service, /sav_type='financial'/);
  assert.match(service, /entries: quotesTtc \+ savTtc/);
  assert.equal((routes.match(/documentForecastEntries\(org,aid\)/g) || []).length, 2);
  assert.match(routes, /forecastEntries:cashForecast\.entries/);
  // La trésorerie sépare les deux populations : potentiel = devis NON signés uniquement.
  assert.match(routes, /potentialIn=rows\.filter\(\(x:any\)=>x\.document_type==='quote'&&String\(x\.status\|\|''\)\.toLowerCase\(\)!=='accepted'\)/);
  assert.match(routes, /signedIn:cashForecast\.quotesTtc/);
  // 15.4.67 — l'encart « Entrées prévues » de l'accueil disparaît ; le moteur partagé
  // (accueil ⇄ trésorerie) reste unique via le panneau « Horizon de facturation ».
  assert.doesNotMatch(ui, /id="home-entries-caption"/);
  assert.match(ui, /Horizon de facturation/);
  assert.match(ui, /Devis SIGNÉS \(acceptés par le client\) TTC diminués des SAV financiers/);
});


test('les hypothèses de coûts fixes persistées sont exposées avec leur état de configuration', () => {
  const route = readFileSync(new URL('../src/routes/business.ts', import.meta.url), 'utf8');
  const section = route.slice(route.indexOf("app.get('/forecast/assumptions'"), route.indexOf("app.get('/treasury/summary'"));
  assert.match(section, /configured:false/);
  assert.match(section, /configured:true/);
  assert.match(section, /fixed_monthly_costs/);
  assert.match(section, /updatedAt:row\.updated_at/);
});
