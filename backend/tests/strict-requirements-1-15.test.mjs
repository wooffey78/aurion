import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const dashboard=read('assets/js/pages/dashboard.js');
const catalog=read('assets/js/pages/dash/catalog.js');
const settings=read('assets/js/pages/dash/settings.js');
const onboarding=read('assets/js/pages/onboarding.js');
const docs=read('assets/js/pages/dash/docs.js');
const other=read('assets/js/pages/dash/other.js');
const organizations=read('backend/src/routes/organizations.ts');
const signature=read('backend/src/services/signature.ts');
const renderer=read('backend/src/services/document-renderer.ts');
const business=read('backend/src/routes/business.ts');
const quote=read('assets/js/pages/dash/quote.js');
const mailbox=read('assets/js/pages/mailbox.js');
const api=read('assets/js/core/api.js');

// Cahier 1, 7, 11, 12, 14.
test('requirement 1 keeps suppliers out of catalogue and in its own sidebar view',()=>{
  assert.doesNotMatch(catalog,/export const suppliers\s*=|<h1>Fournisseurs<\/h1>/);
  assert.match(dashboard,/import\{suppliers\}from'\.\/dash\/suppliers\.js';/);
  assert.match(dashboard,/const VIEWS=\{[^;]*suppliers,quote/s);
});

test('requirements 7/11/12/14 remain explicit in the implementation',()=>{
  assert.match(dashboard,/\['suppliers','Fournisseurs'/);
  assert.match(dashboard,/data-view="admin"/);
  assert.match(other,/Rendez-vous/);
  assert.match(other,/Journal de bord/);
  assert.match(other,/id="forecast-more" hidden/);
  assert.match(other,/Prévision de croissance/);
});

// Cahier 2.
test('requirement 2 quote submit uses the existing coefficientBasis field safely',()=>{
  assert.match(quote,/id="coefficientBasis"/);
  assert.match(quote,/const coefficientBasis=\$\('#coefficientBasis'\)\.value/);
});

test('requirement 2 opens a fresh quote without reusing state',()=>{
  assert.match(dashboard,/S\.editing=null;S\.quoteDraft=null;S\.prefillClient=null;S\.documentType='quote'/);
  assert.match(docs,/S\.editing=null;S\.quoteDraft=null;S\.documentType=b\.dataset\.newType/);
});

// Cahier 3/10.
test('requirements 3/10 keep spacing and a single Votre choix placeholder per select source',()=>{
  const css=read('assets/css/app.css');
  assert.match(css,/\.dashboard-shell main\{gap:var\(--aurion-card-gap\)\}/);
  for(const p of [settings,onboarding,other,docs,read('assets/js/pages/dash/catalog.js'),read('assets/js/pages/mailbox.js'),read('assets/js/pages/dash/quote.js')]){
    const perSelect=[...p.matchAll(/<select[\s\S]*?<\/select>/g)];
    for(const m of perSelect) assert.ok((m[0].match(/>Votre choix<\/option>/g)||[]).length<=1,`duplicate placeholder in select: ${m[0]}`);
  }
});

// Cahier 4.
test('requirement 4 derives journal entries from unresolved conditions on the server and keeps them across renders',()=>{
  assert.match(business,/const journal:any\[\]=\[\];/);
  assert.match(business,/if\(Number\(u\.rows\[0\]\?\.n\|\|0\)>0\)journal\.push\(\{kind:'unpaid'/);
  assert.match(business,/if\(warr\?\.next_end\)journal\.push\(\{kind:'warranty'/);
  assert.match(business,/for\(const a of appointments\)journal\.push\(\{kind:'appointment'/);
  assert.match(other,/S\.dashboardCounters\?\.journal/);
});

// Cahier 5/15: automatic detection and propagation.
test('requirement 6 synchronizes organization before activity collections are loaded',()=>{
  const orgPos=dashboard.indexOf("api.organization()");
  const actPos=dashboard.indexOf("api.activities()");
  assert.ok(orgPos>=0 && actPos>=0 && orgPos<actPos,'organization must be synchronized before activities are loaded');
});

test('requirement 15 preserves and reuses precise activity information in settings',()=>{
  assert.match(settings,/F\('scustom'/);
  assert.match(settings,/S\.company\.custom_activity/);
  assert.doesNotMatch(settings,/customActivity:''/);
  assert.match(settings,/customActivity:\$\('#scustom'\)\.value\.trim\(\)/);
});

test('requirement 5 detects activity profile and legal form immediately when an activity popup opens',()=>{
  assert.match(settings,/setTimeout\(detectProfile,0\)/);
  assert.match(settings,/setTimeout\(detectLegal,0\)/);
});

test('requirement 5 uses detected profile metadata to prefill configuration choices without overwriting choices',()=>{
  assert.match(business,/detect-profile'[\s\S]*modules:p\.modules/);
  assert.match(onboarding,/api\.detectProfile\(/);
  assert.match(onboarding,/configuration-detection-status/);
  assert.match(onboarding,/select&&\!select\.value/);
});

test('requirement 15 re-runs registry detection when saved identifiers already exist',()=>{
  assert.match(settings,/S\.company\?\.siret\s*\|\|\s*S\.company\?\.siren/);
  assert.match(onboarding,/val\('siret'\)\s*\|\|\s*val\('siren'\)/);
});

test('requirements 5/15 provide automatic registry and configuration detection seams',()=>{
  assert.match(settings,/api\.supplierLookup\(/);
  assert.match(onboarding,/api\.supplierLookup\(/);
  assert.match(settings,/api\.detectLegalForm\(/);
  assert.match(settings,/api\.detectProfile\(/);
  assert.match(settings,/api\.detectFiscal\(/);
  assert.match(settings,/addEventListener\('input'/);
  assert.match(business,/activities\/detect-profile/);
  assert.match(api,/detectProfile:b=>request/);
  assert.match(onboarding,/addEventListener\('input'/);
  assert.match(organizations,/configurationData === undefined \? null : JSON\.stringify/);
  assert.match(organizations,/syncPrimaryActivityFromOrganization/);
  assert.match(organizations,/configurationIncomplete === undefined \? null : d\.configurationIncomplete/);
  assert.match(signature,/r\.website \|\| r\.org_website/);
  assert.match(mailbox,/companyName/);
  assert.match(renderer,/COMPANY_WEBSITE/);
  assert.match(renderer,/COMPANY_ADDRESS/);
});

// Cahier 6: detected data must be available in other document/reporting surfaces.
test('requirement 6 invalidates cached documents when organization data changes',()=>{
  assert.match(renderer,/o\.updated_at organization_updated_at/);
  assert.match(renderer,/data\.row\.organization_updated_at/);
});

test('requirement 6 exposes detected organization data to document/template consumers',()=>{
  for(const key of ['COMPANY_NAME','COMPANY_ACTIVITY','SIRET','SIREN','LEGAL_FORM','COMPANY_ADDRESS','COMPANY_POSTAL_CODE','COMPANY_CITY','COMPANY_WEBSITE']) assert.match(renderer,new RegExp(key));
  assert.match(settings,/S\.company\?\.legal_form/);
  assert.match(onboarding,/configurationData/);
});

// Cahier 8/9.
test('requirements 8/9 keep editable per-quote coefficients and catalog prices',()=>{
  assert.match(quote,/id="coefficientBasis"/);assert.match(quote,/id="coefficientUnit"/);assert.match(quote,/id="coefficientValue"/);
  assert.match(quote,/default_price/);assert.match(quote,/default_price/);
  assert.match(business,/part_coefficient_percent/);assert.match(business,/labor_coefficient_percent/);
  assert.match(business,/selling_price/);
  assert.match(business,/item\.unitPrice!==null&&item\.unitPrice!==undefined\?Math\.max\(0,Number\(item\.unitPrice\)\):Math\.max\(0,Number\(item\.unitCost\|\|0\)\*\(1\+coefficient\/100\)\+euroCoefficient/);
  assert.match(quote,/const total=service;/);
});

// Cahier 13.
test('requirement 13 shows SAV on any sent invoice and reports SAV below',()=>{
  assert.match(docs,/q\.sent_at\?`<button class="btn secondary small sav-from-invoice"/);
  assert.match(docs,/<h2>SAV<\/h2>/);
  assert.doesNotMatch(docs,/q\.sent_at \&\& q\.warranties\?\.length \) await openSavForInvoice/);
  assert.match(docs,/if\(!warranties\.length\)/);
});
