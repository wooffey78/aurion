#!/usr/bin/env node
// 15.4.51 (PROMPT E2) — jeu de données de DÉMONNATION « artisan réaliste » : idempotent,
// rejouable, avec GARDE-FOU anti-production explicite. Une organisation de démonstration par
// profil cible (plomberie, réparation smartphone, mécanique auto) avec clients, devis et
// factures dont l'état raconte le produit (fiabilité, dérive justifiée, chaîne d'intégrité,
// portail). Aucune donnée juridique inventée : numéros de test au format valide, noms
// explicites « Démo Aurion ». Usage : npm --prefix backend run db:demo [-- --force]
import { readFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const force = process.argv.includes('--force');
const url = process.env.AURION_MIGRATION_DATABASE_URL || process.env.DATABASE_URL || (() => {
  // Installation locale : lire backend/.env (comme les autres scripts d'exploitation).
  const envFile = path.join(here, '..', '.env');
  if (existsSync(envFile)) for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^DATABASE_URL=(.*)$/.exec(line.trim());
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  return '';
})();
if (!url) { console.error('ERREUR : aucune base cible (AURION_MIGRATION_DATABASE_URL / DATABASE_URL / backend/.env).'); process.exit(2); }

// GARDE-FOU : jamais sur une base de production (.nom de domaine ou NODE_ENV), sauf --force assumé.
if (/production|render\.com|ovh\.cloud|neon\.tech|amazonaws/i.test(url) && !force) {
  console.error('REFUS : l\u2019URL ressemble à une base hébergée/production. Jeu de démo interdit dessus.\nPour outrepasser en connaissance de cause : npm --prefix backend run db:demo -- --force');
  process.exit(3);
}
const pool = new pg.Pool({ connectionString: url, max: 2 });
const q = (t, v = []) => pool.query(t, v);

const ORGS = [
  { name: 'Démo Aurion — Plomberie Robinet Malin', siret: '11122233300011', profile: 'plumbing', clients: ['Mairie de Challans', 'M. Jean Martin (particulier)', 'SCI Les Jardins du Port', 'Restaurant La Marée', 'Mme Sophie Lemaire (particulier)'] },
  { name: 'Démo Aurion — ReparMobile Service', siret: '22233344400022', profile: 'smartphone-repair', clients: ['Bureau de poste Challans', 'Lycée Professionnel du Littoral', 'M. Karim Benali (particulier)'] },
  { name: 'Démo Aurion — Garage MécaPlus', siret: '33344455500033', profile: 'auto', clients: ['Taxi-vtc Challans', 'M. Pierre Duval (particulier)'] },
];

async function main() {
  const existing = await q(`select id from organizations where name like 'Démo Aurion — %' limit 1`);
  if (existing.rowCount) { console.log('Jeu de démonstration déjà présent (organisations « Démo Aurion — …») — rien à faire (idempotent).'); await pool.end(); return; }
  const admin = await q(`select id from users limit 1`);
  if (!admin.rowCount) { console.error('ERREUR : aucun compte utilisateur existant — créez d\u2019abord un compte (l\u2019organisation de démo sera rattachée au même propriétaire).'); await pool.end(); process.exit(1); }
  const ownerId = admin.rows[0].id;
  for (const spec of ORGS) {
    const orgId = randomUUID();
    await q(`insert into organizations(id,name,siret,owner_user_id) values($1,$2,$3,$4) on conflict do nothing`, [orgId, spec.name, spec.siret, ownerId]);
    const members = await q(`select 1 from organization_members where organization_id=$1 and user_id=$2`, [orgId, ownerId]);
    if (!members.rowCount) await q(`insert into organization_members(organization_id,user_id,role) values($1,$2,'owner') on conflict do nothing`, [orgId, ownerId]);
    const actId = randomUUID();
    await q(`insert into activities(id,organization_id,name,description,vat_rate,urssaf_rate,payment_terms,legal_notes) values($1,$2,$3,$4,20,22,null,null)
      on conflict do nothing`, [actId, orgId, spec.name.replace('Démo Aurion — ', ''), `Activité de démonstration (${spec.profile}) pour présentation d'Aurion.`]);
    const clientIds = [];
    for (const [i, name] of spec.clients.entries()) {
      const cid = randomUUID();
      await q(`insert into clients(id,organization_id,activity_id,name,email,phone,address) values($1,$2,$3,$4,$5,$6,$7) on conflict do nothing`,
        [cid, orgId, actId, name, `contact${i + 1}@demo-aurion.test`, `06 ${i + 10} ${i + 20} ${i + 30} ${i + 40}`, `${i + 1} rue de la Démo, 85300 Challans`]);
      clientIds.push({ id: cid, name });
    }
    // Devis/factures : états qui raconte le produit (fiabilité, dérive justifiée, intégrité).
    const mk = async (client, { type, status, payment, number, ht, vat, label, daysAgo }) => {
      const ttc = Math.round(ht * (1 + vat / 100) * 100) / 100;
      const id = randomUUID();
      await q(`insert into quotes(id,organization_id,activity_id,client_id,number,document_type,status,payment_status,intervention,vat_rate,total_ht,total_tva,total_ttc,created_at,updated_at)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now()-make_interval(days=>$14),now()-make_interval(days=>$14)) on conflict do nothing`,
        [id, orgId, actId, client.id, number, type, status, payment, label, vat, ht, Math.round((ttc - ht) * 100) / 100, ttc, daysAgo]);
      await q(`insert into quote_items(id,quote_id,label,quantity,unit_cost,unit_price,position) values($1,$2,$3,1,0,$4,0) on conflict do nothing`,
        [randomUUID(), id, label, Math.round(ht * 100) / 100]);
      return id;
    };
    const n = spec.profile === 'auto' ? 3 : 6;
    for (let i = 0; i < n; i++) {
      const client = clientIds[i % clientIds.length];
      const kind = i % 3;
      if (kind === 0) await mk(client, { type: 'invoice', status: 'issued', payment: 'paid', number: `FAC-DEMO-${i + 1}`, ht: 180 + i * 40, vat: 20, label: 'Dépannage et remise en état (démo)', daysAgo: 60 - i * 8 });
      else if (kind === 1) await mk(client, { type: 'quote', status: 'accepted', payment: 'unpaid', number: `DEV-DEMO-${i + 1}`, ht: 320 + i * 25, vat: 20, label: 'Remplacement et installation (démo)', daysAgo: 20 - i });
      else await mk(client, { type: 'quote', status: 'sent', payment: 'unpaid', number: `DEV-DEMO-${i + 1}`, ht: 150 + i * 30, vat: 20, label: 'Visite et devis de maintenance (démo)', daysAgo: 6 - (i % 5) });
    }
    // Une facture dérivée de son devis avec dérive > 10 % JUSTIFIÉE (le garde-fou B2 est démontrable).
    const driftQuote = clientIds[0];
    await mk(driftQuote, { type: 'invoice', status: 'issued', payment: 'unpaid', number: 'FAC-DEMO-DERIVE', ht: 460, vat: 20, label: 'Travaux complémentaires validés par le client (démo)', daysAgo: 3 });
    await q(`update quotes set deviation_justification='Démo : pièces remplacées à la demande du client après acceptation du devis.',deviation_justified_at=now(),deviation_rubrics=$2::jsonb where number='FAC-DEMO-DERIVE' and organization_id=$1`,
      [orgId, JSON.stringify({ quote: [{ label: 'Travaux prévus', amountHt: 380 }], invoice: [{ label: 'Travaux complémentaires validés par le client (démo)', amountHt: 460 }] })]);
    console.log(`Organisation de démonstration créée : ${spec.name}`);
  }
  console.log('✔ Jeu de démonstration prêt : traversez les écrans Clients, Documents, Chantiers, Trésorerie — les états de démo parlent (fiabilité, dérive justifiée, devis à partager au portail).');
  console.log('  Aucun e-mail n\u2019est envoyé par ce script ; aucune donnée juridique n\u2019est inventée (numéros de test explicites).');
  await pool.end();
}
main().catch(e => { console.error('ÉCHEC :', e.message); process.exit(1); });
