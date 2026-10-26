import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('../../', import.meta.url).pathname);
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('deep: onboarding preserves manual fields and falls back to legal-form detection', () => {
  const s = read('assets/js/pages/onboarding.js');
  assert.match(s, /let\s+detectedLegal=[^;]*;if\(!detectedLegal\)\{try\{const lf=await api\.detectLegalForm/);
  assert.match(s, /custom_activity:val\('custom'\)/);
  assert.match(s, /mergeRegistryFields\(current,next,previous\)/);
});

test('deep: settings fiscal auto-fill respects manual VAT/social edits', () => {
  const s = read('assets/js/pages/dash/settings.js');
  assert.match(s, /dataset\.autoValue/);
  assert.match(s, /vatInput\?\.addEventListener\(['"]input['"]/);
  assert.match(s, /socialInput\?\.addEventListener\(['"]input['"]/);
  assert.match(s, /\(!vatInput\.value\|\|vatInput\.dataset\.autoValue===vatInput\.value\)/);
  assert.match(s, /\(!socialInput\.value\|\|socialInput\.dataset\.autoValue===socialInput\.value\)/);
});

test('deep: backend activity updates preserve previously manual fiscal fields', () => {
  const s = read('backend/src/routes/business.ts');
  assert.match(s, /a\.social_auto_detected===false&&b\.urssafRate!==undefined/);
  assert.match(s, /a\.vat_auto_detected===false&&b\.vatRate!==undefined/);
  assert.match(s, /social_auto_detected=\$6,vat_auto_detected=\$7/);
});

test('deep: quote item catalog price is constrained to the quote activity', () => {
  const s = read('backend/src/routes/business.ts');
  assert.match(s, /select id,sale_coefficient_percent,selling_price,photo_key from parts where id=\$1 and organization_id=\$2 and activity_id=\$3/);
  assert.match(s, /async function saveItems\(executor:SqlExecutor,quoteId:string,org:string,activityId:string/);
});

test('deep: organization sync returns fresh persisted organization data', () => {
  const s = read('backend/src/routes/organizations.ts');
  const getPos = s.indexOf('app.get("/organization"');
  const syncPos = s.indexOf('await syncPrimaryActivityFromOrganization(request.auth!.organizationId);', getPos);
  const selectPos = s.indexOf('const r = await query(', getPos);
  assert.ok(syncPos > getPos && syncPos < selectPos);
  assert.match(s, /await syncPrimaryActivityFromOrganization\(request\.auth!\.organizationId, \{ forceIdentity: true \}\);/);
});

test('deep: document renderer propagates custom activity precisely', () => {
  const s = read('backend/src/services/document-renderer.ts');
  assert.match(s, /company_custom_activity/);
  assert.match(s, /effectiveCompanyActivity\s*=\s*x\.company_custom_activity/);
  assert.match(s, /COMPANY_ACTIVITY:\s*effectiveCompanyActivity/);
});

test('deep: catalog-driven quote state survives drafts and rejects cross-activity catalog parts', () => {
  const quote = read('assets/js/pages/dash/quote.js');
  const business = read('backend/src/routes/business.ts');
  assert.match(quote, /catalogPricing\s*=.*q\?\(\(q\.catalogPricing\?\?q\.catalog_pricing\)!==false\):true/);
  assert.match(quote, /catalogPricing:catalogPricing/);
  assert.match(quote, /catalogPricing,.*finalPriceTtc/);
  assert.match(quote, /catalogPricing=Boolean\(detectedService\)/);
  assert.match(business, /if\(item\.partId&&!part\)\{[\s\S]*throw new AurionError\('INVALID_INPUT'/);
  assert.match(business, /catalogPricing=Boolean\(firstDefined\(body,'catalogPricing','catalog_pricing'\)/);
  assert.match(business, /q\.catalog_pricing as \"catalogPricing\"/);
  assert.match(business, /from interventions where organization_id=\$1 and activity_id=\$2/);
  assert.match(business, /app\.get\('\/activities'.*syncPrimaryActivityFromOrganization/s);
  assert.match(business, /lower\(trim\(name\)\)=lower\(trim\(\$3\)\) limit 1/);
});
