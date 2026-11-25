// 15.4.69 — contrat du classeur, bornes anti-abus et estimation des cotisations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePricing } from '../../assets/js/core/pricing.js';
// Le moteur importe ses modules en « .js » (sortie compilée) : le contrat se vérifie sur dist/,
// garanti par « pretest » (npm test construit toujours le backend avant d'exécuter les tests).
import { inspectWorkbookContract } from '../../backend/dist/services/calc-engine/engine.js';

test('15.4.69 — le classeur livré couvre tout le contrat, contrôles compris', async () => {
  const contract = await inspectWorkbookContract();
  assert.equal(contract.controls, 17, 'les 17 contrôles du classeur doivent être exposés');
  assert.ok(contract.outputs >= 157, `sorties mappées insuffisantes : ${contract.outputs}`);
  assert.deepEqual(contract.missingOutputs, [], 'sorties mappées absentes du classeur');
  assert.deepEqual(contract.missingInputs, [], 'entrées mappées absentes du classeur');
});

test('15.4.69 — le nombre de cotisations est borné', () => {
  const contributions = Array.from({ length: 33 }, () => ({ name: 'C', rate: 1, basis: 'ca_ht' }));
  assert.throws(
    () => computePricing({ partCost: 100, targetTtc: 240, vatRate: 20, contributions }),
    /32 au maximum/,
  );
  const allowed = Array.from({ length: 32 }, () => ({ name: 'C', rate: 1, basis: 'ca_ht' }));
  assert.equal(computePricing({ partCost: 100, targetTtc: 240, vatRate: 20, contributions: allowed }).totalTtc, 240);
});

test('15.4.69 — une saisie démesurée est refusée avant analyse', () => {
  assert.throws(
    () => computePricing({ partCost: '1'.repeat(65), targetTtc: 240, vatRate: 20 }),
    /Valeur invalide/,
  );
  // 64 caractères restent acceptés : la borne ne change pas les saisies légitimes.
  const padded = '1.' + '0'.repeat(62);
  assert.equal(padded.length, 64);
  assert.equal(computePricing({ partCost: padded, targetTtc: 240, vatRate: 20 }).totalTtc, 240);
});

test('15.4.69 — l’estimation de cotisations additionne toutes les lignes', () => {
  const r = computePricing({
    targetTtc: 240,
    vatRate: 20,
    urssafRate: 0,
    contributions: [
      { name: 'Maladie', rate: 12, basis: 'ca_ht', mandatory: true },
      { name: 'Retraite', rate: 10, basis: 'ca_ht', mandatory: true },
    ],
  });
  // Base HT = 200 : 24 € + 20 € = 44 €, et non la seule première ligne (24 €).
  assert.equal(r.contributionsTotal, 44);
  assert.equal(r.urssafEstimate, 44);
});
