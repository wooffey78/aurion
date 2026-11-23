import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const ui = readFileSync(new URL('assets/js/pages/dash/other.js', root), 'utf8');
const admin = readFileSync(new URL('backend/src/routes/admin.ts', root), 'utf8');
const migration = readFileSync(new URL('backend/migrations/087_admin_guest_invite_delivery.sql', root), 'utf8');

test('chaque section admin se charge isolément et conserve la dernière réponse en cas d’erreur', () => {
  assert.match(ui, /await Promise\.all\(keys\.map\(async key/);
  assert.match(ui, /adminCache\.values\[key\] = value/);
  assert.match(ui, /adminCache\.errors\[key\] = error/);
  assert.match(ui, /const stale = loadedAt/);
  assert.match(ui, /admin-section-retry/);
  assert.match(ui, /admin\.bind\(button\.dataset\.section\)/);
  assert.match(ui, /addEventListener\('online'/);
  assert.doesNotMatch(ui, /location\.reload\(/);
});

test('les erreurs d’administration distinguent session, droits, route, limitation, serveur et réseau', () => {
  for (const status of [401, 403, 404, 429]) {
    assert.match(ui, new RegExp(`status === ${status}`));
  }
  assert.match(ui, /status >= 500/);
  assert.match(ui, /status === 0/);
});

test('les invitations VIP enregistrent le statut réel de délivrance sans supprimer le lien en cas d’échec', () => {
  assert.match(admin, /email_sent_at/);
  assert.match(admin, /email_error_code/);
  assert.match(admin, /emailSent=false,emailError:string\|null=null/);
  assert.match(admin, /emailError=String\(error/);
  assert.match(admin, /inviteUrl:link,emailSent,emailError/);
  assert.match(ui, /result\.emailSent \? null : \(result\.inviteUrl \|\| null\)/);
});

test('la migration de suivi d’e-mail est additive et idempotente', () => {
  assert.match(migration, /alter table admin_guest_invites add column if not exists email_sent_at timestamptz/i);
  assert.match(migration, /alter table admin_guest_invites add column if not exists email_error_code varchar\(80\)/i);
  assert.doesNotMatch(migration, /drop table|drop column|rename column/i);
});


test('les métriques admin classent les organisations sans mélanger utilisateurs, abonnements et accès gratuits', () => {
  const stats = admin.slice(admin.indexOf("app.get('/admin/stats'"), admin.indexOf("app.get('/admin/billing/pending'"));
  assert.match(stats, /with org_access as/);
  assert.match(stats, /platform_admins/);
  assert.match(stats, /vip_guest_accounts/);
  assert.match(stats, /admin_and_vip/);
  assert.match(stats, /cancel_at_period_end/);
  assert.match(stats, /count\(\*\)::int as organizations/);
  assert.match(stats, /count\(\*\) filter\(where category='expired'\)/);
  assert.match(stats, /trial_ends_at<=now\(\) or s\.status<>'trialing'/);
  assert.match(stats, /conversionCohort/);
  assert.match(stats, /from organizations/);
  assert.match(stats, /count\(o\.id\)::int n/);
  assert.match(stats, /count\(\*\) filter\(where completed and converted\)/);
  assert.doesNotMatch(stats, /from subscription_events where kind in \('activated','payment_succeeded'\) and created_at>=now\(\)-interval '6 months'/);
});
