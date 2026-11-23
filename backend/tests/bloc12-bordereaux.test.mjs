// Bloc 12 — Lecture des bordereaux professionnels et préparation de facture.
// Chaîne 100 % déterministe (extraction de texte pdftotext/LibreOffice, analyse de tableaux,
// formats numériques français, correspondance catalogue) — SANS service distant de génération de contenu.
// Chaque valeur porte sa source et sa confiance ; champs manquants signalés ; l'utilisateur
// modifie tout ; le module ne crée JAMAIS un document ni un client par lui-même ; le brouillon
// n'est pas émis (statut devis modifiable, la facture définitive passe par la conversion).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

process.env.NODE_ENV ||= 'test';
process.env.JWT_SECRET ||= 'integration-test-jwt-secret-0123456789abcdef';
process.env.AURION_SUPPORT_EMAIL ||= 'support@example.invalid';
process.env.AURION_STORAGE_BACKEND ||= 'local';
process.env.APP_BASE_URL ||= 'https://aurion.integration.test';
process.env.CORS_ORIGIN ||= 'https://aurion.integration.test';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('bloc12: unitaire — analyse déterministe complète (accents, formats français, confiance, cohérence)', async () => {
  const bp = await import(new URL('../dist/services/bordereau-parser.js', import.meta.url).pathname);
  // Nombres français : espaces insécables, virgule décimale, point milliers.
  assert.equal(bp.parseFrenchNumber('1 234,56'), 1234.56);
  assert.equal(bp.parseFrenchNumber('1.234,56'), 1234.56);
  assert.equal(bp.parseFrenchNumber('1 234.56'), 1234.56);
  assert.equal(bp.parseFrenchNumber('abc'), null);
  assert.equal(bp.parseFrenchNumber(''), null);

  const text = `BORDEREAU DE LIVRAISON
Référence : BL-2026-0142
Client : Garage Dupont
SIRET : 123 456 789 00011
Date : 14/11/2026
Bon de commande : BC-7788
Adresse : 1 rue du Commerce 44000 Nantes

Écran iPhone 13    2 x 89,90 €
Nappe bouton/volume  1 x 12,50
Main-d’œuvre    1,5 x 45,00

Total HT : 246,30 €
TVA : 0,00 €
Total TTC : 246,30 €`;
  const parsed = bp.parseBordereau(text);
  const f = k => parsed.fields.find(x => x.key === k);
  assert.equal(f('reference')?.value, 'BL-2026-0142');
  assert.equal(f('reference')?.confidence, 'labeled');
  assert.equal(f('client')?.value, 'Garage Dupont');
  assert.equal(f('client')?.confidence, 'labeled');
  assert.equal(f('siret')?.value, '12345678900011', 'espaces normalisés, valeur d\u2019origine conservée dans le document final');
  assert.equal(f('date')?.value, '14/11/2026');
  assert.equal(f('orderRef')?.value, 'BC-7788');
  // Lignes : quantités décimales françaises (« 1,5 »), deux formats de séparateur.
  assert.equal(parsed.items.length, 3);
  assert.equal(parsed.items[0].label, 'Écran iPhone 13');
  assert.equal(parsed.items[0].quantity, 2);
  assert.equal(parsed.items[0].unitPrice, 89.9);
  assert.equal(parsed.items[2].quantity, 1.5);
  assert.equal(parsed.items[2].unitPrice, 45);
  assert.equal(parsed.totals.ht, 246.3);
  assert.equal(parsed.totals.ttc, 246.3);
  // Somme des lignes = 2×89,90 + 1×12,50 + 1,5×45 = 249,80 ≠ total HT affiché (246,30) → écart signalé.
  assert.ok(parsed.warnings.some(w => /différente du total HT/.test(w)));
  // Correspondance catalogue déterministe (accents/casse/espaces normalisés).
  const matches = bp.matchCatalogItems(parsed.items, [{ id: 'p1', name: 'Écran iPhone 13' }, { id: 'p2', name: 'nappe bouton volume' }]);
  assert.equal(matches[0].matchKind, 'exact');
  assert.equal(matches[0].partId, 'p1');
  // Ponctuation (barre oblique) normalisée → correspondance EXACTE après normalisation.
  assert.equal(matches[1].matchKind, 'exact');
  assert.equal(matches[1].partId, 'p2');
  // Aucun article catalogue « Main-d’œuvre » → aucune correspondance (jamais inventée).
  assert.equal(matches[2].matchKind, 'none');
  assert.equal(matches[2].partId, null);
  // Aucune IA : fonction pure, déterministe.
  assert.deepEqual(bp.parseBordereau(text).items, parsed.items);
  // Bordereau incomplet : champs manquants signalés, jamais inventés.
  const sparse = bp.parseBordereau('Bonjour,\n\nMerci de votre passage.');
  assert.ok(sparse.missing.includes('Date'));
  assert.ok(sparse.missing.includes('SIRET/SIREN'));
  assert.equal(sparse.items.length, 0);
  assert.ok(sparse.warnings.some(w => /Aucune ligne/.test(w)));
  // Aucun service distant de génération de contenu dans le code du service :
  const src = read('../src/services/bordereau-parser.ts');
  assert.doesNotMatch(src, /api\.openai\.com|api\.anthropic\.com|generativelanguage/i);
});

// ------------------------------------------------------------------ recette d'intégration
const appPath = fileURLToPath(new URL('../dist/app.js', import.meta.url));
const dbPath = fileURLToPath(new URL('../dist/db.js', import.meta.url));
const authPath = fileURLToPath(new URL('../dist/plugins/auth.js', import.meta.url));
const ready = existsSync(appPath) && existsSync(dbPath) && Boolean(process.env.DATABASE_URL)
  && process.env.AURION_INTEGRATION_TESTS === '1' && Boolean(process.env.AURION_ADMIN_DATABASE_URL);
const skip = ready ? false : 'dist/ absent, AURION_INTEGRATION_TESTS≠1, DATABASE_URL ou AURION_ADMIN_DATABASE_URL non défini';

test.after(async () => { if (modules) { await modules.db.db.end().catch(() => {}); if (modules.db.adminDb) await modules.db.adminDb.end().catch(() => {}); } });
const modules = ready ? { app: null, db: null, signAccessToken: null } : null;
async function boot() {
  if (!modules.app) {
    const [{ buildApp }, db, auth] = await Promise.all([import(appPath), import(dbPath), import(authPath)]);
    modules.app = await buildApp(); modules.db = db; modules.signAccessToken = auth.signAccessToken;
  }
  return modules;
}
const uuid = () => crypto.randomUUID();
async function seedAccount(mod) {
  const userId = uuid(), organizationId = uuid();
  await mod.db.query(`insert into organizations(id,name,activity) values($1,$2,'Test bloc 12')`, [organizationId, `Micro ${organizationId.slice(0, 8)}`]);
  await mod.db.query(`insert into users(id,email,password_hash) values($1,$2,'x')`, [userId, `bloc12-${crypto.randomUUID()}@example.test`]);
  await mod.db.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')`, [organizationId, userId]);
  await mod.db.withTenant(organizationId, async () => {
    await mod.db.query(`insert into activities(organization_id,code,name,description) values($1,'principale','Activité principale','Fixture bloc 12')`, [organizationId]);
    await mod.db.query(`insert into subscriptions(organization_id,status,trial_started_at,trial_ends_at) values($1,'trialing',now(),now()+interval '60 days')`, [organizationId]);
  });
  const sv = Number((await mod.db.query('select session_version from users where id=$1', [userId])).rows[0]?.session_version || 0);
  const token = await mod.signAccessToken({ userId, organizationId, role: 'owner', sv });
  return { token, userId, organizationId };
}

test('bloc12: route d\'analyse (aucune écriture), PDF texte réel, brouillon non émis créé par le flux utilisateur', { skip }, async () => {
  const mod = await boot();
  const A = await seedAccount(mod);
  const auth = { authorization: `Bearer ${A.token}` };

  // Catalogue pour la correspondance déterministe.
  await mod.app.inject({ method: 'POST', url: '/parts', headers: auth, payload: { name: 'Écran iPhone 13', sellingPrice: 95 } });

  // PDF TEXTE RÉEL (généré par pdfkit — le même moteur que les documents Aurion).
  const pdfkitMod = await import('pdfkit').catch(() => null);
  let pdfBuffer;
  if (pdfkitMod) {
    const PDFDocument = pdfkitMod.default;
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks = [];
    doc.on('data', b => chunks.push(b));
    doc.font('Helvetica').fontSize(12)
      .text('BORDEREAU DE LIVRAISON').moveDown()
      .text('Référence : BL-2026-0777').text('Client : Atelier Sable').text('SIRET : 98765432100022')
      .text('Écran iPhone 13    2 x 89,90 €').text('Main-d’œuvre    1 x 45,00 €')
      .text('Total HT : 224,80 €').text('Total TTC : 224,80 €');
    await new Promise(res => { doc.on('end', () => res()); doc.end(); });
    pdfBuffer = Buffer.concat(chunks);
  } else {
    // pdftotext indisponible : recette sur TXT équivalent (extraction identique).
    pdfBuffer = Buffer.from('BORDEREAU DE LIVRAISON\nRéférence : BL-2026-0777\nClient : Atelier Sable\nSIRET : 98765432100022\nÉcran iPhone 13    2 x 89,90 €\nMain-d’œuvre    1 x 45,00 €\nTotal HT : 224,80 €\nTotal TTC : 224,80 €\n', 'utf8');
  }
  const isPdf = pdfBuffer.slice(0, 4).toString() === '%PDF';
  const filename = isPdf ? 'bordereau.pdf' : 'bordereau.txt';
  const mime = isPdf ? 'application/pdf' : 'text/plain';

  const beforeDocs = (await mod.db.withTenant(A.organizationId, () => mod.db.query('select count(*)::int n from quotes'))).rows[0].n;
  const beforeClients = (await mod.db.withTenant(A.organizationId, () => mod.db.query('select count(*)::int n from clients'))).rows[0].n;

  // 1) Analyse : AUCUNE écriture (ni document ni client).
  const boundary = `----bloc12${crypto.randomUUID().replace(/-/g, '')}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),
    pdfBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const parsed = await mod.app.inject({
    method: 'POST', url: '/documents/parse-bordereau',
    headers: { ...auth, 'content-type': `multipart/form-data; boundary=${boundary}`, 'x-aurion-activity-id': (await mod.db.withTenant(A.organizationId, () => mod.db.query("select id from activities where code='principale'"))).rows[0].id },
    payload: body,
  });
  assert.equal(parsed.statusCode, 200, parsed.body);
  const data = parsed.json();
  assert.equal(data.fields.find(f => f.key === 'client')?.value, 'Atelier Sable');
  assert.equal(data.fields.find(f => f.key === 'siret')?.value, '98765432100022');
  assert.ok(data.items.length >= 2, 'lignes détectées');
  assert.equal(data.items[0].matchKind, 'exact', 'correspondance catalogue « Écran iPhone 13 »');
  const afterDocs = (await mod.db.withTenant(A.organizationId, () => mod.db.query('select count(*)::int n from quotes'))).rows[0].n;
  const afterClients = (await mod.db.withTenant(A.organizationId, () => mod.db.query('select count(*)::int n from clients'))).rows[0].n;
  assert.equal(afterDocs, beforeDocs, 'aucune écriture par le module d\'analyse');
  assert.equal(afterClients, beforeClients, 'aucun client créé par le module d\'analyse');

  // 2) Format non pris en charge (scan image) : refus explicite 422 avec raison honnête (pas d'OCR local).
  const pngBoundary = `----bloc12${crypto.randomUUID().replace(/-/g, '')}`;
  const pngBody = Buffer.concat([
    Buffer.from(`--${pngBoundary}\r\nContent-Disposition: form-data; name="file"; filename="scan.png"\r\nContent-Type: image/png\r\n\r\n`),
    Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    Buffer.from(`\r\n--${pngBoundary}--\r\n`),
  ]);
  const scan = await mod.app.inject({
    method: 'POST', url: '/documents/parse-bordereau',
    headers: { ...auth, 'content-type': `multipart/form-data; boundary=${pngBoundary}` },
    payload: pngBody,
  });
  assert.equal(scan.statusCode, 422);
  assert.match(scan.body, /OCR local/);

  // 3) Le flux UTILISATEUR crée le brouillon non émis (statut devis modifiable) avec le client.
  const draft = await mod.app.inject({
    method: 'POST', url: '/quotes', headers: auth,
    payload: { documentType: 'quote', intervention: 'Bordereau BL-2026-0777',
      newClient: { name: 'Atelier Sable', siret: '98765432100022' },
      items: [
        { label: 'Écran iPhone 13', quantity: 2, unitCost: 0, unitPrice: 89.9, partId: data.items[0].partId },
        { label: 'Main-d’œuvre', quantity: 1, unitCost: 0, unitPrice: 45 },
      ],
      vatRate: 0, urssafRate: 0, allowLoss: true, catalogPricing: false },
  });
  assert.equal(draft.statusCode, 201, draft.body);
  const docs = (await mod.app.inject({ method: 'GET', url: '/quotes', headers: auth })).json();
  const created = docs.find(x => x.id === draft.json().id);
  assert.ok(created);
  assert.equal(created.document_type, 'quote', 'brouillon non émis (la facture définitive passe par la conversion)');
  assert.equal(created.status, 'draft');
  assert.match(created.intervention, /BL-2026-0777/);
  assert.ok(created.client_id);
  assert.equal(created.items.length, 2);
  // Isolation A/B.
  const B = await seedAccount(mod);
  const parsedB = (await mod.app.inject({ method: 'GET', url: '/clients/matches?q=Atelier%20Sable', headers: { authorization: `Bearer ${B.token}` } })).json();
  assert.equal(parsedB.matches.length, 0);
});
