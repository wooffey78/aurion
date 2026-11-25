import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join,relative} from 'node:path';

const root=fileURLToPath(new URL('../../', import.meta.url));
const read=p=>readFileSync(join(root,p),'utf8');

const dashboard=read('assets/js/pages/dashboard.js');
const navigation=read('assets/js/core/navigation.js');
const catalog=read('assets/js/pages/dash/catalog.js');
const other=read('assets/js/pages/dash/other.js');
const settings=read('assets/js/pages/dash/settings.js');
const docs=read('assets/js/pages/dash/docs.js');
const core=read('assets/js/pages/dash/core.js');

assert.match(navigation,/\{id:'suppliers',label:'Fournisseurs',icon:'▱'\}/,'Étape 31: fournisseurs dans la sidebar');
assert.match(navigation,/\{id:'admin',label:'Administration',icon:'⚙',admin:true\}/,'Étape 31: administration conditionnée au rôle');
assert.match(dashboard,/S\.isPlatformAdmin/,'Étape 31: le rôle plateforme est résolu avant la navigation');
assert.match(catalog,/api\.createSupply\(/,'Étape 32: création fourniture');
assert.match(catalog,/api\.updateSupply\(/,'Étape 32: modification fourniture');
assert.match(catalog,/supplies:api\.deleteSupply/,'Étape 32: suppression fourniture via le dispatcher de catégorie');
assert.match(catalog,/await confirmDelete\([\s\S]*?fn\(id\)/,'Étape 32: suppression confirmée avant appel API');
assert.match(settings,/api\.updateOrganization\(/,'Étape 33: paramètres persistés');
// D4 (15.4.0) : détection au clic via l'implémentation partagée company-detect.js.
assert.match(settings,/detectCompany\(identifier,/,'Étape 33: détection entreprise par SIRET/SIREN');
assert.match(docs,/api\.createSav\(/,'Étape 34: création SAV');
assert.match(docs,/api\.updateSav\(/,'Étape 34: modification SAV');
assert.match(docs,/api\.deleteSav\(/,'Étape 34: suppression SAV');
assert.match(core,/await hooks\.refresh\(\)/,'Étape 35: rafraîchissement après mutation');
// 15.4.67 : le mode ambigu « Toutes les activités » a été retiré du sélecteur ; une activité
// réelle est toujours active (aucune requête sans x-aurion-activity-id). On verrouille ce choix.
assert.doesNotMatch(other,/__all__/,'Étape 35: aucun mode agrégé ambigu dans les vues métier');
assert.match(dashboard,/S\.activities\.map\(a=>`<button class="activity-choice/,'Étape 35: le sélecteur ne propose que de vraies activités');
console.log('final-cycle-31-35: 5/5 OK');
