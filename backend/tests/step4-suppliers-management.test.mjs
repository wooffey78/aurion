import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const suppliers=fs.readFileSync(path.join(root,'assets/js/pages/dash/suppliers.js'),'utf8');
const business=fs.readFileSync(path.join(root,'backend/src/routes/business.ts'),'utf8');

 test('étape 4 : la fiche fournisseur utilise la détection registre et remplit tous les champs proposés',()=>{
  assert.match(suppliers,/registry-fill\.js/);
  for(const id of ['name','siret','siren','legalName','postalCode','city','legalForm','email','phone','website']) assert.ok(suppliers.includes(`F('${id}'`),`champ ${id}`);
  assert.match(suppliers,/textarea id="address"/);
  assert.match(suppliers,/mergeRegistryFields/);
  assert.match(suppliers,/\.value=merged\.address/);
  assert.match(suppliers,/\.value=merged\.postal_code/);
  assert.match(suppliers,/\.value=merged\.city/);
  assert.match(suppliers,/\.value=merged\.legal_form/);
 });

test('étape 4 : les fournisseurs sont consultables, modifiables, téléchargeables et supprimables',()=>{
  for(const token of ['Consulter','Modifier','Fiche PDF','Supprimer']) assert.match(suppliers,new RegExp(token));
  assert.match(suppliers,/openSupplierSheet/);
  assert.match(suppliers,/api\.supplierPdfUrl/);
  assert.match(suppliers,/api\.updateSupplier/);
  assert.match(suppliers,/api\.deleteSupplier/);
  assert.match(business,/app\.get\('\/suppliers\/:id\.pdf'/);
  assert.match(business,/app\.patch\('\/suppliers\/:id'/);
  assert.match(business,/app\.delete\('\/suppliers\/:id'/);
});

test('étape 4 : la fiche fournisseur reste rattachée à l’activité et à l’organisation',()=>{
  assert.match(business,/select \* from suppliers where organization_id=\$1 and activity_id=\$2/);
  assert.match(business,/organization_id=\$\d+ and activity_id=\$\d+/);
});
