import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const quote=fs.readFileSync(path.join(root,'assets/js/pages/dash/quote.js'),'utf8');
const business=fs.readFileSync(path.join(root,'backend/src/routes/business.ts'),'utf8');

test('enregistrement devis : la vente à perte est autorisée uniquement après confirmation explicite',()=>{
  assert.match(quote,/let allowLoss=false;if\(r\.loss\)\{if\(!await askConfirm\(/);
  assert.match(quote,/finalPriceTtc:num\('#targetTtc'\),mileageMode:/);
  assert.match(business,/if\(!b\.allowLoss&&p\.belowMinimumPrice\)return reply\.code\(400\)\.send\(\{error:'MARGIN_GUARD'/);
  assert.match(business,/mileageMode/);
  assert.match(business,/final_price_ttc/);
  assert.match(business,/requiredNumber\(b\.vatRate,'TVA'/);
});

console.log('quote-save-confirmation: OK');
