import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const integration = process.env.AURION_INTEGRATION_TESTS === '1' && Boolean(process.env.DATABASE_URL);

test('057 remplace les accès record.id fragiles et protège les suppressions en cascade', () => {
  const sql = read('../migrations/057_account_sync_trigger_fixes.sql');
  assert.match(sql, /CREATE OR REPLACE FUNCTION touch_account_sync/);
  assert.match(sql, /NOT EXISTS\s*\(\s*SELECT 1 FROM organizations WHERE id = p_organization_id/s);
  assert.match(sql, /r := to_jsonb\(OLD\)/);
  assert.match(sql, /r := to_jsonb\(NEW\)/);
  assert.match(sql, /TG_TABLE_NAME = 'users'/);
  assert.match(sql, /r ->> 'user_id'/);
  assert.doesNotMatch(sql, /COALESCE\(NEW\.id, OLD\.id\)/);
});

test('057 : INSERT sur les tables user_id et DELETE organisation', { skip: !integration }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const c = await pool.connect();
  const org = 'd7e8a38e-1bb0-4f10-8b82-1fd05a4c0557';
  const user = 'd7e8a38e-1bb0-4f10-8b82-1fd05a4c0558';
  const guest = 'd7e8a38e-1bb0-4f10-8b82-1fd05a4c0563';
  const client = 'd7e8a38e-1bb0-4f10-8b82-1fd05a4c0559';
  const ticket = 'd7e8a38e-1bb0-4f10-8b82-1fd05a4c0560';
  const session = 'd7e8a38e-1bb0-4f10-8b82-1fd05a4c0561';
  const credential = 'd7e8a38e-1bb0-4f10-8b82-1fd05a4c0562';
  try {
    await c.query('BEGIN');
    await c.query('INSERT INTO organizations(id,name,activity) VALUES($1,$2,$3)', [org,'sync-test','test']);
    await c.query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)', [user, 'sync-test-057@example.invalid','not-a-real-password-hash']);
    await c.query('INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,$3)', [org,user,'owner']);
    let revision = Number((await c.query('SELECT revision FROM account_sync_versions WHERE organization_id=$1',[org])).rows[0]?.revision ?? 0);
    const assertBumped = async () => {
      const next = Number((await c.query('SELECT revision FROM account_sync_versions WHERE organization_id=$1',[org])).rows[0]?.revision ?? 0);
      assert.ok(next > revision, 'la révision doit progresser après insertion');
      revision = next;
    };
    await c.query("INSERT INTO user_drafts(organization_id,user_id,payload) VALUES($1,$2,'{}'::jsonb)", [org,user]); await assertBumped();
    await c.query('INSERT INTO platform_admins(user_id) VALUES($1)', [user]);
    const invite = (await c.query("INSERT INTO admin_guest_invites(invited_by,email,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 day') RETURNING id", [user,'guest-057@example.invalid','a'.repeat(64)])).rows[0].id;
    await c.query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)', [guest,'guest-057@example.invalid','not-a-real-password-hash']);
    await c.query('INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,$3)', [org,guest,'member']);
    revision = Number((await c.query('SELECT revision FROM account_sync_versions WHERE organization_id=$1',[org])).rows[0].revision);
    await c.query('INSERT INTO vip_guest_accounts(user_id,invited_by,invite_id) VALUES($1,$2,$3)', [guest,user,invite]);
    const doc = (await c.query("INSERT INTO legal_documents(kind,version,title,body,is_current,is_draft) VALUES('terms','test-057','Test 057','Test',false,true) RETURNING id")).rows[0].id;
    await c.query('INSERT INTO legal_acceptances(user_id,document_id) VALUES($1,$2)', [user,doc]);
    await c.query('INSERT INTO support_tickets(id,organization_id,user_id,number,category,message) VALUES($1,$2,$3,$4,$5,$6)', [ticket,org,user,'SYNC-057','test','test']); await assertBumped();
    await c.query('INSERT INTO clients(id,organization_id,name) VALUES($1,$2,$3)', [client,org,'Client test']);
    await c.query('INSERT INTO client_time_sessions(id,organization_id,user_id,client_id,manual_minutes,started_at) VALUES($1,$2,$3,$4,1,now())', [session,org,user,client]); await assertBumped();
    await c.query('INSERT INTO webauthn_credentials(id,user_id,credential_id,public_key) VALUES($1,$2,$3,$4)', [credential,user,Buffer.from('credential-057'),Buffer.from('public-key-057')]);
    await c.query('DELETE FROM organizations WHERE id=$1', [org]);
    assert.equal(Number((await c.query('SELECT count(*)::int n FROM organizations WHERE id=$1',[org])).rows[0].n), 0);
    await c.query('ROLLBACK');
  } catch (error) {
    await c.query('ROLLBACK').catch(()=>{});
    throw error;
  } finally {
    c.release();
    await pool.end();
  }
});
