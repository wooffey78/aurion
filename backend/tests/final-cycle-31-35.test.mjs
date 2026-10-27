import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join,relative} from 'node:path';

const root=fileURLToPath(new URL('../../', import.meta.url));
const read=p=>readFileSync(join(root,p),'utf8');

const dashboard=read('assets/js/pages/dashboard.js');
const catalog=read('assets/js/pages/dash/catalog.js');
const other=read('assets/js/pages/dash/other.js');
const settings=read('assets/js/pages/dash/settings.js');
const docs=read('assets/js/pages/dash/docs.js');
const core=read('assets/js/pages/dash/core.js');

assert.match(dashboard,/\['suppliers','Fournisseurs'/,'Étape 31: fournisseurs dans la sidebar');
assert.match(dashboard,/S\.isPlatformAdmin\?`<button[^`]*data-view="admin"/s,'Étape 31: administration conditionnée au rôle');
assert.match(catalog,/api\.createSupply\(/,'Étape 32: création fourniture');
assert.match(catalog,/api\.updateSupply\(/,'Étape 32: modification fourniture');
assert.match(catalog,/api\.deleteSupply\(/,'Étape 32: suppression fourniture');
assert.match(settings,/api\.updateOrganization\(/,'Étape 33: paramètres persistés');
assert.match(settings,/api\.supplierLookup\(/,'Étape 33: auto-détection entreprise');
assert.match(docs,/api\.createSav\(/,'Étape 34: création SAV');
assert.match(docs,/api\.updateSav\(/,'Étape 34: modification SAV');
assert.match(docs,/api\.deleteSav\(/,'Étape 34: suppression SAV');
assert.match(core,/await hooks\.refresh\(\)/,'Étape 35: rafraîchissement après mutation');
assert.match(other,/value="__all__">Toutes les activités/,'Étape 35: choix Toutes les activités non ambigu');
assert.match(other,/selectedActivity==='__all__'\?''\:selectedActivity/,'Étape 35: Toutes les activités conserve le contrat API');
console.log('final-cycle-31-35: 5/5 OK');
