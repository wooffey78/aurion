import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const docs=fs.readFileSync(`${root}/assets/js/pages/dash/docs.js`,'utf8');
const business=fs.readFileSync(`${root}/backend/src/routes/business.ts`,'utf8');
const scheduler=fs.readFileSync(`${root}/backend/src/services/scheduler.ts`,'utf8');
const migration=fs.readFileSync(`${root}/backend/migrations/043_allow_zero_reminder_interval.sql`,'utf8');

test('délai de relance 0 ou vide : aucune relance automatique programmée',()=>{
  assert.match(docs,/id="convertReminderInterval"[^>]*min="0"/);
  assert.match(docs,/id="convertReminderInterval"[^>]*placeholder="0"/);
  assert.doesNotMatch(docs,/id="convertReminderInterval"[^>]*required/);
  assert.match(docs,/rawInterval=.*===\x27\x27\?0/);
  assert.match(business,/Number\(b\.reminderIntervalDays\?\?0\)/);
  assert.match(business,/next_reminder_at=case when \$5::int > 0/);
  assert.match(business,/intervalDays>0\?new Date/);
  assert.match(scheduler,/intervalDays>0\?new Date/);
  assert.match(migration,/between 0 and 365/i);
});
