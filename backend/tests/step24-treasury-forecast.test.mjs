import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync(new URL('../src/routes/business.ts', import.meta.url), 'utf8');
const other = fs.readFileSync(new URL('../../assets/js/pages/dash/other.js', import.meta.url), 'utf8');
const treasuryRoute = route.slice(route.indexOf("app.get('/treasury/summary'"));
const treasuryView = other.slice(other.indexOf('export const treasury='));

test('trésorerie : potentiel/engagé/sorties séparés, reste dû des factures non soldées (Bloc 4)', () => {
  // Contrat mis à jour par le prompt « fiabilisation » (Bloc 4) : les devis ouverts sont un
  // POTENTIEL présenté séparément, les factures non soldées entrent pour leur RESTE DÛ
  // (total TTC + majorations − paiements reçus), les notes de frais à rembourser sont des
  // sorties engagées — jamais de mélange sans libellé, jamais de double comptage.
  assert.match(treasuryRoute, /q\.document_type='quote'\s+and\s+lower\(coalesce\(q\.status,''\)\) not in/);
  assert.match(treasuryRoute, /'rejected','refused','expired','void','deleted'/);
  assert.doesNotMatch(treasuryRoute, /document_type in \('quote','invoice'\)/);
  assert.match(treasuryRoute, /q\.amount_paid/);
  assert.match(treasuryRoute, /total_penalty_amount/);
  assert.match(treasuryRoute, /potentialIn/);
  assert.match(treasuryRoute, /committedIn/);
  assert.match(treasuryRoute, /committedOut/);
  assert.match(treasuryRoute, /committedNet/);
  assert.match(treasuryRoute, /savTotal/);
  assert.match(treasuryRoute, /aucun module d/);
  assert.match(treasuryView, /Créances restantes \(engagé\)/);
  assert.match(treasuryView, /Devis ouverts \(potentiel\)/);
  assert.match(treasuryView, /Sorties prévues/);
  assert.match(treasuryView, /Solde engagé \(hors potentiel\)/);
  assert.match(treasuryView, /Aucun devis prévisionnel/);
});
