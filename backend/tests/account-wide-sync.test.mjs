import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('synchronisation globale du compte : les tables métier autorisées font évoluer une révision serveur',()=>{
  const migration=read('../migrations/056_account_wide_sync.sql');
  const route=read('../src/routes/settings.ts');
  const sync=read('../../assets/js/account-sync.js');
  const whitelist=read('../migrations/058_account_sync_trigger_whitelist.sql');
  assert.match(migration,/CREATE TABLE IF NOT EXISTS account_sync_versions/);
  assert.match(migration,/AFTER INSERT OR UPDATE OR DELETE ON/);
  assert.match(migration,/organization_id/);
  assert.match(whitelist,/'activities','activity_contributions/);
  assert.doesNotMatch(whitelist,/billing_webhook_events|subscription_events|notification_jobs/);
  assert.match(route,/app\.get\('\/sync\/version'/);
  assert.match(sync,/\/sync\/version/);
  assert.match(sync,/aurion\.accountSyncRevision:/);
  assert.match(sync,/window\.aurionSyncAcknowledge/);
  assert.match(route,/organizationId: r\.auth!\.organizationId, userId: r\.auth!\.userId/);
  assert.match(read('../../assets/js/core/api.js'),/window\.aurionSyncAcknowledge/);
  assert.match(sync,/aurion:account-sync-changed/);
  assert.doesNotMatch(sync,/location\.reload\(\)/);
  assert.doesNotMatch(sync,/window\.fetch=async/);
});

test('synchronisation inter-appareils sans barre ni rechargement complet',()=>{
  const sync=read('../../assets/js/account-sync.js');
  assert.doesNotMatch(sync,/window\.fetch=async|aurionLoading|Chargement…|location\.reload\(\)/);
  assert.match(sync,/aurion:account-sync-changed/);
});
