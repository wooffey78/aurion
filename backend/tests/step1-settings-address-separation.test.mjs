import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStreetAddress } from '../../assets/js/core/registry-fill.js';
import fs from 'node:fs';
import path from 'node:path';

test('étape 1: la détection sépare rue, code postal et ville',()=>{
  assert.equal(normalizeStreetAddress('12 RUE DES LILAS\n33000 BORDEAUX','33000','Bordeaux'),'12 RUE DES LILAS');
  assert.equal(normalizeStreetAddress('8 AVENUE DE PARIS','75001','Paris'),'8 AVENUE DE PARIS');
  assert.equal(normalizeStreetAddress('','33000','Bordeaux'),'');
});

test('étape 1: les paramètres utilisent cette normalisation pour la détection registre',()=>{
  const root=path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
  const source=fs.readFileSync(path.join(root,'assets/js/pages/dash/settings.js'),'utf8');
  assert.match(source,/import\{mergeRegistryFields\}from/);
  assert.match(fs.readFileSync(path.join(root,'assets/js/core/registry-fill.js'),'utf8'),/address: normalizeStreetAddress\(/);
});
