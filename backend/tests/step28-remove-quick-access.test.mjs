import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const file = fs.readFileSync(new URL('../../assets/js/pages/dash/other.js', import.meta.url), 'utf8');
const nav = fs.readFileSync(new URL('../../assets/js/pages/dashboard.js', import.meta.url), 'utf8');

test('étape 28 - le tableau de bord ne contient plus l’encart Accès rapide', () => {
  assert.equal(file.includes('<h2>Accès rapide</h2>'), false);
});

test('étape 28 - la navigation vers Agenda reste disponible dans la sidebar', () => {
  assert.equal(nav.includes("['agenda','Agenda','◷']"), true);
});
