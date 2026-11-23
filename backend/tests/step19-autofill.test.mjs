import assert from 'node:assert/strict';
import { mergeRegistryFields, normalizeWebsite } from '../../assets/js/core/registry-fill.js';

const manual={name:'Mon entreprise',activity:'Réparation informatique',custom_activity:'Réparation de cartes mères',address:'12 rue A',website:'https://mon-site.fr'};
const detected={legalName:'Autre société',activity:'Commerce de détail',address:'99 rue B',postalCode:'33000',city:'Bordeaux',website:'www.registre.fr',legalForm:'SAS'};
const previousAuto={name:'Ancienne société',activity:'Ancienne activité',custom_activity:'',address:'Ancienne adresse',website:'https://ancienne.fr'};
const merged=mergeRegistryFields(manual,detected,previousAuto);
assert.equal(merged.name,'Mon entreprise');
assert.equal(merged.activity,'Réparation informatique');
assert.equal(merged.custom_activity,'Réparation de cartes mères');
assert.equal(merged.address,'12 rue A');
assert.equal(merged.website,'https://mon-site.fr');
assert.equal(merged.postal_code,'33000');
assert.equal(merged.city,'Bordeaux');
assert.equal(merged.legal_form,'SAS');
assert.equal(normalizeWebsite('www.registre.fr'),'https://www.registre.fr');

const blank=mergeRegistryFields({},detected,{});
assert.equal(blank.name,'Autre société');
assert.equal(blank.activity,'Commerce de détail');
assert.equal(blank.custom_activity,undefined);
assert.equal(Object.hasOwn(blank,'custom_activity'),false);
assert.equal(blank.website,'https://www.registre.fr');
console.log('step19 autofill: 2/2');
