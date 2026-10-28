import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = p => readFileSync(resolve(process.cwd(), p), 'utf8');

test('migration 065 is additive and stores one server-side journey per organization', () => {
  const sql = read('backend/migrations/065_guided_journey_administrative_addresses.sql');
  assert.match(sql, /create table if not exists onboarding_journeys/i);
  assert.match(sql, /create table if not exists dashboard_journal_events/i);
  assert.match(sql, /create table if not exists administrative_formalities/i);
  assert.match(sql, /create table if not exists administrative_mail_send_locks/i);
  assert.match(sql, /create table if not exists administrative_mail_send_connections/i);
  assert.match(sql, /create table if not exists client_intervention_addresses/i);
  assert.match(sql, /add column if not exists intervention_address_snapshot/i);
  assert.match(sql, /on conflict\(organization_id,dedupe_key\) do nothing/i);
  assert.doesNotMatch(sql, /drop\s+table|truncate\s+/i);
});

test('guided journey has dashboard escape, persistence, explicit completion and OAuth state callback', () => {
  const js = read('assets/js/pages/guided-onboarding.js');
  const route = read('backend/src/routes/journey.ts');
  const auth = read('backend/src/routes/auth.ts');
  assert.match(js, /id="journey-dashboard"/);
  assert.match(js, /api\.saveJourneyState/);
  assert.match(js, /api\.completeJourney/);
  assert.match(route, /app\.put\('\/journey\/state'/);
  assert.match(route, /administrative_mail_oauth_states/);
  assert.match(route, /administrative_mail_send_connections/);
  assert.match(route, /administrative-mail\/send-oauth\/start/);
  assert.match(route, /administrative_mail_send_locks/);
  assert.match(route, /on conflict\(formality_id\) do nothing returning status/);
  assert.match(route, /gmail\.send/);
  assert.match(route, /gmail\.readonly/);
  assert.match(route, /purpose==='send'/);
  assert.match(route, /split\('\?'\)\[0\] === '\/administrative-mail\/oauth\/callback'/);
  assert.match(auth, /insert into onboarding_journeys/);
});

test('administrative email send requires confirmation and never converts a read sync to a final decision automatically', () => {
  const route = read('backend/src/routes/journey.ts');
  const js = read('assets/js/pages/guided-onboarding.js');
  assert.match(route, /if\(b\.confirm!==true\)/);
  assert.match(route, /gmailSendAdministrative/);
  assert.match(route, /EMAIL_SEND_ALREADY_ATTEMPTED/);
  assert.match(route, /administrative_mail_send_connections/);
  assert.match(route, /Gmail.*confirm/i);
  assert.match(route, /user_confirmed/);
  assert.match(js, /if\(!confirm\(`Envoyer réellement l’e-mail depuis Gmail/);
  assert.match(js, /Aucun statut n’a été modifié automatiquement/);
});

test('export includes real identity bundle, administrative state and files while omitting OAuth tokens', () => {
  const route = read('backend/src/routes/documents.ts');
  const body = route.slice(route.indexOf("app.get('/documents/export-all.zip'"), route.indexOf("app.get('/documents/logo'"));
  assert.match(body, /dossier-administratif\/parcours\.json/);
  assert.match(body, /dossier-administratif\/formalites\.json/);
  assert.match(body, /dossier-administratif\/messages-detectes\.json/);
  assert.match(body, /clients\/adresses-intervention\.json/);
  assert.match(body, /identite-visuelle\.zip/);
  assert.doesNotMatch(body, /access_token_enc|refresh_token_enc|accessToken|refreshToken/i);
  assert.match(body, /secretsIncluded:false/);
  assert.doesNotMatch(body, /select \* from administrative_mail_connections/i);
});

test('intervention addresses retain document snapshots and signature categories are selectable', () => {
  const migration = read('backend/migrations/065_guided_journey_administrative_addresses.sql');
  const business = read('backend/src/routes/business.ts');
  const pdf = read('backend/src/services/pdf.ts');
  const signature = read('backend/src/services/signature.ts');
  assert.match(migration, /intervention_address_snapshot/);
  assert.match(business, /intervention_address_id/);
  assert.match(pdf, /Adresse d’intervention/);
  assert.match(signature, /includeQuotes/);
  assert.match(signature, /includeInvoices/);
  assert.match(signature, /includeProfessional/);
});

test('mobile placeholder extensions are breakpoint-limited and service-worker cache is versioned', () => {
  const main = read('assets/js/main.js');
  const sw = read('sw.js');
  const html = read('index.html');
  assert.match(main, /matchMedia\('\(max-width: 700px\)'\)/);
  assert.match(main, /mobileOriginalPlaceholders/);
  assert.match(sw, /aurion-shell-v15\.3\.0-r1/);
  assert.match(html, /15\.3\.0-r1/);
});

test('dashboard checks only lightweight journey entry state and does not fetch the full draft', () => {
  const route = read('backend/src/routes/journey.ts');
  const main = read('assets/js/main.js');
  const api = read('assets/js/core/api.js');
  const endpoint = route.slice(route.indexOf("app.get('/journey/entry-state'"), route.indexOf("app.get('/journey/state'"));
  assert.match(endpoint, /select status,first_redirect_at from onboarding_journeys/);
  assert.doesNotMatch(endpoint, /select \*|data\s*:/i);
  assert.ok(api.includes("journeyEntryState:()=>request('/journey/entry-state')"));
  assert.match(main, /api\.journeyEntryState\(\)/);
  assert.doesNotMatch(main, /api\.journeyState\(\)/);
});

test('Gmail sync narrows nullable message ids before metadata lookup and persistence', () => {
  const route = read('backend/src/routes/journey.ts');
  assert.match(route, /if\(typeof msg\.id!=='string'\|\|msg\.id\.length===0\) continue;/);
  assert.match(route, /id:messageId,format:'metadata'/);
  assert.match(route, /org,formalityId,messageId,meta\.data\.threadId/);
  assert.match(route, /dedupe:`mail-detected:\$\{messageId\}`/);
});
