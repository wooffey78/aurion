// 15.4.49 — Bloc 06 (prompt 06) : CRM — instantanés client des documents, suppression
// encadrée, archivage réversible, fusion de doublons contrôlée et auditée.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('migration 107 : instantanés client, archivage, merged_into et piste d\u2019audit de fusion', () => {
  const m = read('../migrations/107_client_lifecycle.sql');
  assert.match(m, /alter table quotes add column if not exists client_name_snapshot varchar\(240\)/);
  assert.match(m, /alter table quotes add column if not exists client_email_snapshot varchar\(254\)/);
  assert.match(m, /alter table quotes add column if not exists client_phone_snapshot varchar\(80\)/);
  assert.match(m, /alter table clients add column if not exists archived_at timestamptz/);
  assert.match(m, /alter table clients add column if not exists merged_into uuid/);
  assert.match(m, /create table if not exists client_merges/);
  assert.match(m, /reason varchar\(400\) not null/);
  assert.match(m, /policy tenant_isolation on public\.client_merges/);
});

test('instantanés écrits À LA CRÉATION du document ; le rendu lit l\u2019instantané d\u2019abord', () => {
  const b = read('../src/routes/business.ts');
  assert.match(b, /update quotes set client_name_snapshot=\$1,client_email_snapshot=\$2,client_phone_snapshot=\$3 where id=\$4 and organization_id=\$5/);
  const r = read('../src/services/document-renderer.ts');
  assert.match(r, /coalesce\(q\.client_name_snapshot,c\.name\) client_name/);
  assert.match(r, /coalesce\(q\.client_email_snapshot,c\.email\) client_email/);
  assert.match(r, /coalesce\(q\.client_phone_snapshot,c\.phone\) client_phone/);
});

test('suppression encadrée : refus 409 dès qu\u2019une facture envoyée est rattachée, archivage proposé', () => {
  const b = read('../src/routes/business.ts');
  assert.match(b, /select 1 from quotes where client_id=\$1 and organization_id=\$2 and document_type='invoice' and sent_at is not null limit 1/);
  assert.match(b, /CLIENT_HAS_SENT_DOCUMENTS/);
  assert.match(b, /app\.post\('\/clients\/:id\/archive'/);
  assert.match(b, /app\.post\('\/clients\/:id\/unarchive'/);
  assert.match(b, /archived_at=coalesce\(archived_at,now\(\)\),archived_by=\$3/);
});

test('fusion : JAMAIS automatique (confirm + motif), re-pointage complet, fiche absorbée conservée, audité', () => {
  const b = read('../src/routes/business.ts');
  assert.match(b, /if\(b\.confirm!==true\)return reply\.code\(400\)\.send\(\{error:'CONFIRM_REQUIRED'/);
  assert.match(b, /if\(!reason\|\|reason\.length<3\)return reply\.code\(400\)\.send\(\{error:'REASON_REQUIRED'/);
  assert.match(b, /if\(absorbed\.merged_into\)return \{ok:false as const,status:409,error:'ALREADY_MERGED'/);
  for (const table of ['quotes', 'appointments', 'devices', 'sav_cases', 'warranties', 'client_time_sessions', 'client_intervention_addresses']) {
    assert.match(b, new RegExp('update ' + table + ' set client_id=\\$1 where client_id=\\$2 and organization_id=\\$3'));
  }
  assert.match(b, /update document_links set entity_id=\$1 where entity_type='client' and entity_id=\$2 and organization_id=\$3/);
  assert.match(b, /insert into client_merges\(organization_id,survivor_id,absorbed_id,reason,actor_id,payload\)/);
  assert.match(b, /merged_into=\$1,archived_at=coalesce\(archived_at,now\(\)\),archived_by=\$2/);
  assert.match(b, /type:'client_merged',idempotencyKey:`client-merged:\$\{absorbedId\}`/);
});

test('listes : les fiches archivées sont exclues par défaut, réaffichables explicitement', () => {
  const b = read('../src/routes/business.ts');
  assert.match(b, /\(\$3::boolean or archived_at is null\) order by name/);
  assert.match(b, /\(archived_at is not null\) as archived,archived_at,merged_into/);
});
