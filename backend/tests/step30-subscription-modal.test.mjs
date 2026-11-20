import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');

const account = fs.readFileSync(path.join(root,'assets/js/pages/dash/account.js'), 'utf8');
const service = fs.readFileSync(path.join(root,'backend/src/services/account.ts'), 'utf8');

assert.equal(/confirm\('OK = paiement par carte sécurisé\\nAnnuler = virement bancaire'\)/.test(account), false, 'le confirm natif doit disparaître');
assert.match(account, /paymentMethods/,'le profil doit connaître les moyens de paiement disponibles');
assert.match(account, /payment-choice-modal|Choisissez votre mode de paiement/,'le choix doit utiliser une modale Aurion');
assert.match(service, /paymentMethods\s*:/,'subscriptionState doit exposer les moyens de paiement');
console.log('step30 subscription modal contract OK');
