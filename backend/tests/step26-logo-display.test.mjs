import fs from 'node:fs';
import assert from 'node:assert/strict';
import {test} from 'node:test';

if(!globalThis.location) globalThis.location={hostname:'localhost'};
if(!globalThis.window) globalThis.window={AURION_API_URL:'http://localhost:4000'};
if(!globalThis.localStorage) globalThis.localStorage={getItem:()=>'',setItem:()=>{},removeItem:()=>{}};

const {S}=await import('../../assets/js/pages/dash/core.js');
const {view}=await import('../../assets/js/pages/dash/settings.js');
const previous={...S.company};

test('step26: no logo keeps the upload placeholder',()=>{
  S.company={...previous,logo_key:null};
  const html=view();
  assert.match(html,/Aucun logo/);
});

test('step26: uploaded logo replaces the textual placeholder with a preview container',()=>{
  S.company={...previous,logo_key:'private/org/logo.png'};
  const html=view();
  assert.match(html,/id="company-logo-preview"/);
  assert.match(html,/class="settings-logo has-logo"/);
  assert.doesNotMatch(html,/Logo enregistré/);
  assert.match(html,/Remplacer le logo/);
});

test('step26: authenticated logo endpoint and frontend API helper exist',()=>{
  const apiSource=fs.readFileSync('assets/js/core/api.js','utf8');
  const routeSource=fs.readFileSync('backend/src/routes/documents.ts','utf8');
  assert.match(apiSource,/companyLogo:\(\)=>api\.authFetch\('\/documents\/logo'\)/);
  assert.match(routeSource,/app\.get\('\/documents\/logo'/);
  assert.match(routeSource,/fileFromKey\(key\)/);
  assert.match(routeSource,/Cache-Control/);
});
