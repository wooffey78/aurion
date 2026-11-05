import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRegistryFields, normalizeWebsite } from '../../assets/js/core/registry-fill.js';
const valid={legalName:'Nouvelle raison sociale',siret:'55210055400013',siren:'552100554',activity:'Commerce',website:'www.example.fr'};
test('une détection ne vide jamais une donnée déjà détectée ou saisie',()=>{
 const current={name:'Ancienne raison sociale',siret:'55210055400013',siren:'552100554',website:'https://ancien.example'};
 const merged=mergeRegistryFields(current,{legalName:'',siret:'',siren:null,website:''},{...current});
 assert.deepEqual(merged,current);
});
test('les valeurs manuelles restent prioritaires et les identifiants incohérents sont rejetés',()=>{
 const merged=mergeRegistryFields({name:'Nom saisi',activity:'Métier précis',custom_activity:'Précision'},valid,{});
 assert.equal(merged.name,'Nom saisi'); assert.equal(merged.activity,'Métier précis'); assert.equal(merged.custom_activity,'Précision');
 const invalid=mergeRegistryFields({}, {...valid,siret:'55210055400019'}, {});
 assert.equal(invalid.siret,undefined); assert.equal(invalid.siren,undefined);
});
test('les identifiants valides sont propagés et les URL non sûres rejetées',()=>{
 const merged=mergeRegistryFields({},valid,{});
 assert.equal(merged.siret,'55210055400013'); assert.equal(merged.siren,'552100554');
 assert.equal(merged.website,'https://www.example.fr'); assert.equal(normalizeWebsite('javascript:alert(1)'),'');
 assert.equal(normalizeWebsite('https://user:pass@example.fr'),'');
});
