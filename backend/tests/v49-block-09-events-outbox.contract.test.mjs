// 15.4.49 — Bloc 09 (prompt 05) : fondation de l'outbox transactionnel — publication dans la
// transaction métier, idempotence par clé unique, backoff et lettre morte, boucle impossible,
// points d'émission sur les opérations sensibles, rejeu contrôlé.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('migration 109 : outbox avec clé d\u2019idempotence unique, états contrôlés, RLS et réplication', () => {
  const m = read('../migrations/109_events_outbox.sql');
  assert.match(m, /create table if not exists business_events_outbox/);
  assert.match(m, /idempotency_key varchar\(160\) not null/);
  assert.match(m, /unique\(organization_id, idempotency_key\)/);
  assert.match(m, /status in \('pending', 'processing', 'processed', 'failed', 'dead_lettered'\)/);
  assert.match(m, /create index if not exists business_events_outbox_dispatch_idx/);
  assert.match(m, /policy tenant_isolation on public\.business_events_outbox/);
  assert.match(m, /aurion_sync_journal_write_orgkey/);
});

test('service : publication idempotente, backoff exponentiel plafonné, lettre morte au 5e essai', () => {
  const s = read('../src/services/events-outbox.ts');
  assert.match(s, /export async function publishInTransaction\(exec: Executor, organizationId: string, input: OutboxEventInput\): Promise<boolean>/);
  assert.match(s, /on conflict \(organization_id,idempotency_key\) do nothing returning id/);
  assert.match(s, /export const OUTBOX_MAX_ATTEMPTS = 5/);
  assert.match(s, /export function outboxNextDelayMs/);
  assert.match(s, /OUTBOX_BASE_DELAY_MS \* Math\.pow\(2, a\)/);
  assert.match(s, /export async function processOutboxQueue/);
  assert.match(s, /for update skip locked/); // revendication atomique multi-instances
  assert.match(s, /status=case when \$2 then 'dead_lettered' else 'pending' end/);
  // BOUCLE IMPOSSIBLE : la livraison n'utilise QUE emitOrgEvent, jamais l'outbox.
  assert.match(s, /import \{ emitOrgEvent \} from '\.\/events\.js'/);
  const deliver = s.slice(s.indexOf('async function deliverToJournal'), s.indexOf('export interface OutboxSweepResult'));
  assert.doesNotMatch(deliver, /publishInTransaction/);
});

test('points d\u2019émission sur les opérations sensibles (partage externe, paiement, clôture, fusion)', () => {
  assert.match(read('../src/routes/documents.ts'), /type:'document_shared',idempotencyKey:`share-created:\$\{row\.id\}`/);
  assert.match(read('../src/services/payments/webhook.ts'), /type: 'invoice_payment_confirmed',\s*\n\s*idempotencyKey: `payment-confirmed:\$\{paymentId\}`/);
  const b = read('../src/routes/business.ts');
  assert.match(b, /type:'accounting_period_closed',idempotencyKey:`period-closed:\$\{year\}:\$\{crypto\.randomUUID\(\)\}`/);
  assert.match(b, /type:'accounting_period_reopened',idempotencyKey:`period-reopened:\$\{year\}:\$\{crypto\.randomUUID\(\)\}`/);
  assert.match(b, /type:'client_merged',idempotencyKey:`client-merged:\$\{absorbedId\}`/);
});

test('worker planifié et observabilité : balayage dans le scheduler, rejeu contrôlé avec motif', () => {
  const s = read('../src/services/scheduler.ts');
  assert.match(s, /import \{ processOutboxQueue \} from '\.\/events-outbox\.js'/);
  assert.match(s, /const ob=await processOutboxQueue\(log\)/);
  const o = read('../src/routes/outbox.ts');
  assert.match(o, /app\.get\('\/journal\/outbox'/);
  assert.match(o, /app\.post\('\/journal\/outbox\/:id\/replay'/);
  assert.match(o, /error: 'REASON_REQUIRED'/);
  assert.match(o, /\['owner', 'admin'\]\.includes\(r\.auth!\.role\)/);
  const svc = read('../src/services/events-outbox.ts');
  assert.match(svc, /export async function replayDeadLetteredEvent/);
  assert.match(svc, /status='dead_lettered' returning id/);
});

test('rejeu hors ligne : les nouvelles décisions et l\u2019agenda sont rejouables via les routes réelles', () => {
  const sync = read('../src/services/sync-ops.ts');
  assert.match(sync, /\/quotes\\\/\[A-Za-z0-9-\]\+\\\/\(accept\|reject\|cancel\)\$/);
  assert.match(sync, /\/clients\\\/\[A-Za-z0-9-\]\+\\\/\(archive\|unarchive\|merge\)\$/);
  assert.match(sync, /\/agenda\\\/unavailabilities/);
});
