// Isolation multi-tenant par RLS PostgreSQL (bloc 2, migration 074).
// Prérequis : « npm run build », DATABASE_URL pointant vers le RÔLE APPLICATIF (jamais le propriétaire)
// sur une base de test migrée, et AURION_ADMIN_DATABASE_URL vers un rôle membre de « aurion_admin ».
// Sinon les tests sont ignorés avec la raison affichée — jamais déclarés réussis sans exécution.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const distDb = fileURLToPath(new URL('../dist/db.js', import.meta.url));
const ready = existsSync(distDb) && Boolean(process.env.DATABASE_URL) && process.env.AURION_INTEGRATION_TESTS === '1';
const skip = ready ? false : 'dist/ absent, AURION_INTEGRATION_TESTS≠1 ou DATABASE_URL non défini';
const adminReady = ready && Boolean(process.env.AURION_ADMIN_DATABASE_URL);
// Import unique : les pools PostgreSQL du module sont partagés par tous les tests du fichier
// (le cache de modules ESM renverrait de toute façon la même instance).
let db = null;
if (ready) db = await import(distDb);
test.after(async () => { if (db) { await db.db.end().catch(() => {}); if (db.adminDb) await db.adminDb.end().catch(() => {}); } });

const uuid = () => crypto.randomUUID();

test('RLS 074 : la migration installe les politiques d’isolation sur les tables métier', { skip }, async () => {
  try {
    const policies = await db.query("select tablename from pg_policies where schemaname='public' and policyname='tenant_isolation' order by tablename");
    const names = policies.rows.map(r => r.tablename);
    for (const expected of ['clients', 'quotes', 'quote_items', 'suppliers', 'support_tickets', 'support_messages', 'subscriptions', 'cloud_documents', 'expense_reports', 'activity_contributions']) {
      assert.ok(names.includes(expected), `politique manquante sur ${expected}`);
    }
    assert.ok(names.length >= 61, `attendu au moins 61 tables protégées, trouvé ${names.length}`);
    const rls = await db.query("select count(*)::int n from pg_class c join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='public' and c.relrowsecurity=true and c.relkind='r'");
    assert.ok(rls.rows[0].n >= 61, `RLS active attendue sur au moins 61 tables, trouvé ${rls.rows[0].n}`);
  } catch (e) { throw e; }
});

test('RLS 074 : le rôle applicatif ne contourne pas la RLS (ni superuser, ni propriétaire, ni BYPASSRLS)', { skip }, async () => {
  try {
    const me = (await db.query('select current_user as u, (select rolsuper from pg_roles where rolname=current_user) as super, (select rolbypassrls from pg_roles where rolname=current_user) as bypass')).rows[0];
    if (process.env.AURION_RUNTIME_DB_ROLE) assert.equal(me.u, process.env.AURION_RUNTIME_DB_ROLE, 'DATABASE_URL doit utiliser le rôle applicatif, pas le rôle de migration');
    assert.equal(me.super, false, 'le rôle applicatif ne doit pas être superuser');
    assert.equal(me.bypass, false, 'le rôle applicatif ne doit pas avoir BYPASSRLS');
    const owned = await db.query("select count(*)::int n from pg_tables where tableowner=current_user and tableowner<>'postgres'");
    assert.equal(owned.rows[0].n, 0, 'le rôle applicatif ne doit posséder aucune table');
  } catch (e) { throw e; }
});

test('RLS 074 : organisations A et B strictement isolées (lecture, écriture, suppression, recherche)', { skip }, async () => {
  const orgA = uuid(), orgB = uuid(), userA = uuid(), userB = uuid();
  const clientA = uuid(), clientB = uuid(), quoteA = uuid(), quoteB = uuid();
  try {
    // Identité : tables non RLS (accès pré-tenant par conception).
    for (const [o, u, n] of [[orgA, userA, 'a'], [orgB, userB, 'b']]) {
      await db.query(`insert into organizations(id,name,activity) values($1,$2,'Test RLS')`, [o, `Organisation ${n.toUpperCase()}`]);
      await db.query(`insert into users(id,email,password_hash) values($1,$2,'x')`, [u, `rls-${n}-${o.slice(0, 8)}@example.test`]);
      await db.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')`, [o, u]);
    }
    // Données métier créées dans le contexte de CHAQUE organisation.
    await db.withTenant(orgA, async () => {
      await db.query(`insert into clients(id,organization_id,name,email) values($1,$2,'Client Alpha','alpha@example.test')`, [clientA, orgA]);
      await db.query(`insert into quotes(id,organization_id,client_id,number,document_type,intervention,total_ttc) values($1,$2,$3,'DEV-2026-A1','quote','Intervention A',100)`, [quoteA, orgA, clientA]);
      await db.query(`insert into quote_items(quote_id,position,label,quantity,unit_price) values($1,1,'Prestation A',1,100)`, [quoteA]);
    });
    await db.withTenant(orgB, async () => {
      await db.query(`insert into clients(id,organization_id,name,email) values($1,$2,'Client Beta','beta@example.test')`, [clientB, orgB]);
      await db.query(`insert into quotes(id,organization_id,client_id,number,document_type,intervention,total_ttc) values($1,$2,$3,'DEV-2026-B1','quote','Intervention B',200)`, [quoteB, orgB, clientB]);
      await db.query(`insert into quote_items(quote_id,position,label,quantity,unit_price) values($1,1,'Prestation B',1,200)`, [quoteB]);
    });

    // --- Organisation A : ne voit QUE ses données, jamais celles de B.
    await db.withTenant(orgA, async () => {
      const clients = await db.query('select id from clients');
      assert.deepEqual(clients.rows.map(r => r.id), [clientA], 'A ne doit voir que son client');
      const byId = await db.query('select id from clients where id=$1', [clientB]);
      assert.equal(byId.rowCount, 0, 'A ne doit pas lire le client de B par identifiant');
      const quotes = await db.query('select id,number from quotes');
      assert.deepEqual(quotes.rows.map(r => r.id), [quoteA], 'A ne doit voir que son devis');
      const items = await db.query('select qi.* from quote_items qi join quotes q on q.id=qi.quote_id');
      assert.equal(items.rowCount, 1, 'les lignes de B sont invisibles via la table de jointure');
      const search = await db.query("select id from clients where name ilike '%Beta%'");
      assert.equal(search.rowCount, 0, 'A ne doit pas déduire l’existence de B par recherche');

      // Écriture croisée : les lignes de B sont invisibles (USING) → zéro ligne affectée,
      // et la création au nom de B est rejetée par WITH CHECK.
      const updB = await db.query('update clients set name=$1 where id=$2', ['Détourné', clientB]);
      assert.equal(updB.rowCount, 0, 'A ne doit pouvoir modifier aucune ligne de B');
      const delB = await db.query('delete from quotes where id=$1', [quoteB]);
      assert.equal(delB.rowCount, 0, 'A ne doit pouvoir supprimer aucune ligne de B');
      await assert.rejects(
        db.query('insert into clients(id,organization_id,name) values($1,$2,$3)', [uuid(), orgB, 'Infiltration']),
        /row-level security/i,
        'A ne doit pas pouvoir créer une ligne au nom de B'
      );
      // La modification de SES propres lignes reste possible (non-régression).
      const upd = await db.query('update clients set name=$1 where id=$2 returning id', ['Client Alpha renommé', clientA]);
      assert.equal(upd.rowCount, 1, 'A doit pouvoir modifier son propre client');
    });

    // --- Symétrie : B ne voit pas A, et ses données n'ont pas été altérées par les tentatives de A.
    await db.withTenant(orgB, async () => {
      const clients = await db.query('select id,name from clients');
      assert.deepEqual(clients.rows.map(r => r.id), [clientB], 'B ne doit voir que son client');
      assert.equal(clients.rows[0].name, 'Client Beta', 'le nom du client de B doit être intact');
      const byId = await db.query('select id from quotes where id=$1', [quoteA]);
      assert.equal(byId.rowCount, 0, 'B ne doit pas lire le devis de A');
      const quoteStillThere = await db.query('select id from quotes where id=$1', [quoteB]);
      assert.equal(quoteStillThere.rowCount, 1, 'le devis de B doit exister malgré la tentative de suppression par A');
    });
  } finally {
    // Nettoyage : les cascades traversent la RLS via le contexte de chaque organisation.
    await db.withTenant(orgA, async () => { await db.query('delete from organizations where id=$1', [orgA]).catch(() => {}); });
    await db.withTenant(orgB, async () => { await db.query('delete from organizations where id=$1', [orgB]).catch(() => {}); });
  }
});

test('RLS 074 : sans contexte tenant, les tables protégées échouent fermé', { skip }, async () => {
  const org = uuid();
  try {
    await db.query(`insert into organizations(id,name,activity) values($1,'Fail Closed','Test')`, [org]);
    // Aucun withTenant : aucune donnée métier lisible ni insérable.
    const clients = await db.query('select count(*)::int n from clients');
    assert.equal(clients.rows[0].n, 0, 'sans contexte, aucun client lisible');
    const quotes = await db.query('select count(*)::int n from quotes');
    assert.equal(quotes.rows[0].n, 0, 'sans contexte, aucun devis lisible');
    await assert.rejects(
      db.query('insert into clients(id,organization_id,name) values($1,$2,$3)', [uuid(), org, 'Sans contexte']),
      /row-level security/i,
      'sans contexte, aucune insertion possible même avec un organization_id valide'
    );
  } finally {
    await db.query('delete from organizations where id=$1', [org]).catch(() => {});
  }
});

test('RLS 074 : tenant falsifié et connexions recyclées du pool ne fuient aucune donnée', { skip }, async () => {
  const orgA = uuid(), fakeOrg = uuid();
  const clientA = uuid();
  try {
    await db.query(`insert into organizations(id,name,activity) values($1,'Pool A','Test')`, [orgA]);
    await db.withTenant(orgA, async () => {
      await db.query(`insert into clients(id,organization_id,name) values($1,$2,'Client Pool')`, [clientA, orgA]);
    });
    // Tenant falsifié (organisation inexistante) : zéro ligne, échec fermé.
    await db.withTenant(fakeOrg, async () => {
      const rows = await db.query('select id from clients');
      assert.equal(rows.rowCount, 0, 'un tenant falsifié ne doit rien voir');
    });
    // Après un contexte A sur une connexion puis restitution au pool, une requête sans contexte
    // sur la MÊME connexion ne doit rien voir (SET LOCAL disparaît au COMMIT).
    await db.withTenant(orgA, async () => { await db.query('select 1'); });
    const leaked = await db.query('select id from clients');
    assert.equal(leaked.rowCount, 0, 'aucune fuite après restitution de la connexion au pool');
    // Et un contexte B ultérieur ne voit toujours pas A.
    const otherOrg = uuid();
    await db.query(`insert into organizations(id,name,activity) values($1,'Pool B','Test')`, [otherOrg]);
    await db.withTenant(otherOrg, async () => {
      const rows = await db.query('select id from clients');
      assert.equal(rows.rowCount, 0, 'une autre organisation ne voit pas les clients de A');
    });
    await db.query('delete from organizations where id=$1', [otherOrg]).catch(() => {});
  } finally {
    await db.withTenant(orgA, async () => { await db.query('delete from organizations where id=$1', [orgA]).catch(() => {}); });
  }
});

test('RLS 074 : le pool d’administration journalisé accède explicitement aux données inter-entreprises', { skip: adminReady ? false : 'AURION_ADMIN_DATABASE_URL requis (rôle membre de aurion_admin)' }, async () => {
  const org = uuid();
  try {
    await db.query(`insert into organizations(id,name,activity) values($1,'Admin Scope','Test')`, [org]);
    await db.withTenant(org, async () => {
      await db.query(`insert into clients(id,organization_id,name) values($1,$2,'Client Admin')`, [uuid(), org]);
    });
    // Le rôle admin (chemin explicite journalisé) voit toutes les organisations.
    const all = await db.adminQuery('select count(*)::int n from clients');
    assert.ok(all.rows[0].n >= 1, 'le rôle admin doit voir les clients toutes organisations');
    const journal = await db.adminQuery("select count(*)::int n from platform_admin_access_log where operation='rls.test'");
    assert.equal(journal.rows[0].n, 0, 'journal vierge pour cette opération de test avant écriture');
    await db.logAdminAccess('rls.test', { organizationId: org });
    const after = await db.adminQuery("select count(*)::int n from platform_admin_access_log where operation='rls.test'");
    assert.equal(after.rows[0].n, 1, 'chaque accès administratif doit être journalisé');
    // Le rôle applicatif, lui, ne peut pas écrire dans le journal.
    await assert.rejects(db.query("insert into platform_admin_access_log(operation) values('usurpation')"), /permission denied/i, 'le rôle applicatif ne doit pas pouvoir écrire le journal');
  } finally {
    await db.adminQuery('delete from platform_admin_access_log where operation=$1', ['rls.test']).catch(() => {});
    await db.adminQuery('delete from organizations where id=$1', [org]).catch(() => {});
  }
});

test('RLS 074 : le code applicatif propage le contexte tenant (setRequestTenant, SET LOCAL, échec fermé)', () => {
  // Contrôles statiques : le plugin d'authentification inscrit l'organisation, query() pose un
  // SET LOCAL transactionnel, et le pool admin est le seul chemin inter-entreprises.
  const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
  const dbSource = read('../src/db.ts');
  assert.match(dbSource, /set_config\('app\.current_organization',\$1,true\)/, 'SET LOCAL transactionnel requis');
  assert.match(dbSource, /withTenant/, 'frontière withTenant requise');
  const authSource = read('../src/plugins/auth.ts');
  assert.match(authSource, /setRequestTenant\(payload\.organizationId\)/, 'l’organisation authentifiée doit devenir le contexte tenant');
  const appSource = read('../src/app.ts');
  assert.match(appSource, /tenantRequestScope\.run/, 'le cycle de vie HTTP doit être enveloppé dans le contexte');
  const migration = read('../migrations/074_multi_tenant_rls.sql');
  assert.match(migration, /with check \(organization_id = aurion_tenant_org\(\)/, 'WITH CHECK requis contre les écritures croisées');
  assert.match(migration, /pg_has_role\(current_user, 'aurion_admin', 'member'\)/, 'la délégation au rôle admin doit rester confinée aux politiques SQL');
  assert.match(migration, /security definer set search_path = public/, 'les triggers hors contexte tenant doivent être SECURITY DEFINER avec search_path verrouillé');
  assert.match(migration, /enable row level security/, 'RLS doit être activée');
});
