import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Google calendar creation is not reported successful without a provider event id', () => {
  const calendar = read('../src/services/calendar.ts');
  assert.match(calendar, /if \(!id\) throw new Error\('GOOGLE_EVENT_ID_MISSING'\)/);
  assert.match(calendar, /google_event_id=\$1 where id=\$2 and organization_id=\$3/);
});

test('calendar feedback distinguishes agenda synchronization from client notification delivery', () => {
  const core = read('../../assets/js/pages/dash/core.js');
  assert.match(core, /c\.client==='failed'/);
  assert.match(core, /c\.client==='skipped'/);
  assert.match(core, /clientError/);
  assert.match(core, /agenda n’a pas été mis à jour/);
});

test('agenda setup explains direct Google sync versus iCalendar email invitations', () => {
  const agenda = read('../../assets/js/pages/dash/other.js');
  const mailbox = read('../../assets/js/pages/mailbox.js');
  assert.match(agenda, /S\.mail\?\.google\?\.connected/);
  assert.match(agenda, /invitations iCalendar/);
  assert.match(mailbox, /Ajoutez la pièce jointe pour l’ajouter à votre agenda/);
});
