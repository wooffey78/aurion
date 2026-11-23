// 15.4.49 — Bloc 05 (prompt 07) : cycle commercial explicite — acceptation, refus,
// annulation, expiration, historique des statuts, immuabilité des factures réglées.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('migration 106 : décisions horodatées et historique des transitions (RLS + réplication)', () => {
  const m = read('../migrations/106_document_lifecycle.sql');
  assert.match(m, /alter table quotes add column if not exists accepted_at timestamptz/);
  assert.match(m, /alter table quotes add column if not exists rejected_at timestamptz/);
  assert.match(m, /alter table quotes add column if not exists rejection_reason varchar\(400\)/);
  assert.match(m, /alter table quotes add column if not exists expired_at timestamptz/);
  assert.match(m, /alter table quotes add column if not exists canceled_at timestamptz/);
  assert.match(m, /create table if not exists document_status_history/);
  assert.match(m, /policy tenant_isolation on public\.document_status_history/);
  assert.match(m, /aurion_sync_journal_write_orgkey/);
});

test('routes de décision : transactionnelles, verrouillées, refus déterministes des re-décisions', () => {
  const b = read('../src/routes/business.ts');
  for (const route of ["app.post('/quotes/:id/accept'", "app.post('/quotes/:id/reject'", "app.post('/quotes/:id/cancel'"]) {
    assert.match(b, new RegExp(route.replace(/[()]/g, m => '\\' + m)));
  }
  assert.match(b, /ALREADY_CLOSED/);
  assert.match(b, /NOT_A_QUOTE/);
  assert.match(b, /HAS_PAYMENTS/);
  assert.match(b, /QUOTE_ACCEPTED/);
  assert.match(b, /ALREADY_CANCELED/);
  assert.match(b, /insert into document_status_history\(organization_id,document_id,from_status,to_status,reason,actor_id\)/);
  // Annulation d'une facture : les liens de paiement actifs sont invalidés (jamais payables après annulation).
  assert.match(b, /update payment_links set status='cancelled',updated_at=now\(\) where invoice_id=\$1 and organization_id=\$2 and status in \('active','partially_paid'\)/);
  // Annulation : les réservations liées sont libérées avec le document (prompt 08).
  assert.match(b, /await releaseQuoteReservations\(client,org,id,'Document annulé'\)/);
});

test('immuabilité : une facture AVEC règlements n\u2019est plus modifiable ; la facture envoyée non réglée reste éditable (fonctionnalité step14 conservée)', () => {
  const b = read('../src/routes/business.ts');
  assert.match(b, /if\(cur\.document_type==='invoice'&&cur\.payment_status!=='unpaid'\)\{\s*return reply\.code\(409\)\.send\(\{error:'DOCUMENT_LOCKED'/);
  const step14 = read('step14-invoice-independent-edit.test.mjs');
  assert.match(step14, /Le bouton Modifier doit être disponible pour tous les documents/);
});

test('expiration automatique : devis ouverts seulement, créés à partir de la 15.4.49 (aucun état rétroactif), historisée', () => {
  const s = read('../src/services/scheduler.ts');
  assert.match(s, /q\.created_at>=make_date\(2026,11,21\)/);
  assert.match(s, /q\.accepted_at is null/);
  assert.match(s, /greatest\(1,coalesce\(a\.quote_validity_days,30\)\)/);
  assert.match(s, /set status='expired',expired_at=now\(\)/);
  assert.match(s, /insert into document_status_history\(organization_id,document_id,from_status,to_status,reason\) values\(\$1,\$1,\$2,'expired'/);
});

test('relances : un paiement webhook confirmé neutralise la relance planifiée comme le règlement manuel', () => {
  const w = read('../src/services/payments/webhook.ts');
  assert.match(w, /next_reminder_at=case when \$2::varchar\(20\)='paid' then null else next_reminder_at end/);
});

test('statuts partagés : expired est un état de clôture, décisions explicites référencées', () => {
  const s = read('../src/services/statuses.ts');
  assert.match(s, /export const EXPIRED_DOCUMENT_STATUSES = \['expired'\] as const/);
  assert.match(s, /\.\.\.EXPIRED_DOCUMENT_STATUSES\] as const/);
  assert.match(s, /export const QUOTE_DECISION_STATUSES = \['accepted', 'rejected', 'expired', 'canceled'\] as const/);
});
