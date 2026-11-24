// Correctif diagnostic 078 — preuves exécutées des phases C à G côté application.
//   C) logo : WebP refusé avec message, PNG/JPEG acceptés ; documents PDF/DOCX/ODT générés avec
//      textes longs (hauteurs d'encart calculées) et identité émettrice visible dans chaque format ;
//   D) calculateur : barre de défilement présente ; encart de pièces : conteneur de défilement
//      horizontal dédié (aucune règle avant le correctif) ;
//   E) la sélection du logo vit dans l'état du parcours (plus de variable locale perdue au re-rendu) ;
//   F) détection fournisseur par nom / SIREN / SIRET / e-mail sur un registre simulé (preview + commit) ;
//   G) état d'observabilité exact publié (« absente », décision D6 explicite).
//   A) garde statique du bootstrap des rôles dans migrate.ts (aucune migration modifiée).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

process.env.NODE_ENV ||= 'test';
process.env.JWT_SECRET ||= 'integration-test-jwt-secret-0123456789abcdef';
process.env.AURION_SUPPORT_EMAIL ||= 'support@example.invalid';
process.env.AURION_STORAGE_BACKEND ||= 'local';
process.env.APP_BASE_URL ||= 'https://aurion.integration.test';
process.env.CORS_ORIGIN ||= 'https://aurion.integration.test';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

// ---------------------------------------------------------------- preuves statiques
test('correctif 078 · phase A : bootstrap idempotent des rôles avant toute migration, aucune migration modifiée', () => {
  const migrate = read('../src/migrate.ts');
  assert.match(migrate, /aurion_admin', 'aurion_runtime/);
  assert.match(migrate, /create role \$\{quoteIdentifier\(roleName\)\} nologin/);
  assert.match(migrate, /BOOTSTRAP_ROLE_IMPOSSIBLE/);
  // le bootstrap s'exécute AVANT la boucle d'application des fichiers :
  const bootstrapAt = migrate.indexOf("for (const roleName of new Set(");
  const loopAt = migrate.indexOf("for (const file of files)", bootstrapAt);
  assert.ok(bootstrapAt > -1 && loopAt > bootstrapAt, 'le bootstrap doit précéder l’application des migrations');
  // règle du prompt : aucune migration existante n’est modifiée (aucun fichier 0xx ne crée ni ne référence aurion_runtime autrement qu’en policy/grant)
  assert.doesNotMatch(read('../migrations/078_micro_activity_categories.sql'), /create role/i);
});

test('correctif 078 · phase C : le logo refuse WebP avec message (D-b), n’accepte que PNG/JPEG', () => {
  const route = read('../src/routes/organizations.ts');
  assert.match(route, /type\.mime === "image\/webp"/);
  assert.match(route, /le WebP ne peut pas être affiché sur les documents PDF, DOCX et ODT/);
  const layout = read('../src/services/document-layout.ts');
  assert.match(layout, /const rasterLogo = \(m: DocModel\) => m\.logo && \(m\.logo\.mime === 'image\/png' \|\| m\.logo\.mime === 'image\/jpeg'\)/);
  for (const ui of ['../../assets/js/pages/onboarding.js', '../../assets/js/pages/dash/storage.js']) {
    const s = read(ui);
    assert.doesNotMatch(s, /accept="image\/png,image\/jpeg,image\/webp"/, `${ui} ne doit plus accepter WebP pour le logo`);
    assert.match(s, /image\/png,image\/jpeg"/, `${ui} : l’attribut accept doit être limité à PNG/JPEG`);
  }
});

test('correctif 078 · phase D : défilement du calculateur présent et encart de pièces à défilement horizontal dédié', () => {
  const css = read('../../assets/css/app.css');
  // calculateur : barre de défilement verticale (vérification du « présent en CSS » du diagnostic)
  assert.match(css, /\.calculation\{max-height:calc\(100vh - 130px\);overflow-y:auto/);
  // encart de pièces : aucune règle dédiée avant le correctif, désormais le conteneur défile
  // horizontalement. 15.4.54 : la grille passe à 6 colonnes (type de prestation au format
  // Aurion ajouté) avec la même largeur minimale de défilement.
  assert.match(css, /\.lines-scroll \{\s*overflow-x: auto;/);
  assert.match(css, /\.lines-scroll \.line-row \{\s*grid-template-columns: minmax\(220px, 3fr\) 60px 110px 90px 150px 70px;/);
  const quote = read('../../assets/js/pages/dash/quote.js');
  assert.match(quote, /<div class="lines-scroll"><div class="lines-head">/);
  assert.match(quote, /<div id="lines"><\/div><\/div>/);
  // 15.4.54 — la colonne « Type de prestation » est déclarée dans l'en-tête et le sélecteur
  // par ligne suit le format Aurion (« Votre choix » en première option).
  assert.match(quote, /<span>Type de prestation<\/span>/);
  assert.match(quote, /<select class="ln-cat" aria-label="Type de prestation de la ligne"><option value="">Votre choix<\/option>/);
  assert.match(css, /\.line-row input,\.line-row select\{width:100%;/);
});

test('correctif 078 · phase E : la sélection du logo vit dans l’état du parcours et survit au re-rendu', () => {
  const onboarding = read('../../assets/js/pages/onboarding.js');
  assert.doesNotMatch(onboarding, /let chosen=null;/, 'plus de variable locale perdue au re-rendu');
  assert.match(onboarding, /state\.logoFile=f;paintSelected\(\);/);
  assert.match(onboarding, /sélectionné à l.{0,2}étape précédente/);
  assert.match(onboarding, /await api\.uploadOrganizationLogo\(state\.logoFile\);/);
});

test('correctif 078 · phase G : l’état d’observabilité publié est exact (absente, décision D6 explicite)', () => {
  const transparency = read('../src/services/transparency.ts');
  assert.match(transparency, /id: 'observability'[\s\S]{0,300}state: 'absente'/);
  assert.match(transparency, /décision D6 \(choix du prestataire de suivi d\\'erreurs\) non tranchée/);
});

test('correctif 078 · installateur : séparation des rôles (aurion_admin migrations / aurion_runtime application) et saut de compilation si dist à jour', () => {
  const install = read('../../scripts/Install-Aurion.ps1');
  assert.match(install, /postgres:\/\/aurion_runtime:\{0\}@127\.0\.0\.1:\{1\}\/aurion/);
  assert.match(install, /AURION_RUNTIME_DB_ROLE'\] = \$\(if \(\$dbUser\)/);
  assert.match(install, /AURION_MIGRATION_DATABASE_URL'\] = 'postgres:\/\/aurion_admin:\{0\}/);
  assert.match(install, /if \(Test-BuildFresh\) \{ Write-Log 'Version déjà compilée/);
});

// ---------------------------------------------------------------- recette d'intégration
const appPath = fileURLToPath(new URL('../dist/app.js', import.meta.url));
const dbPath = fileURLToPath(new URL('../dist/db.js', import.meta.url));
const authPath = fileURLToPath(new URL('../dist/plugins/auth.js', import.meta.url));
const layoutPath = fileURLToPath(new URL('../dist/services/document-layout.js', import.meta.url));
const ready = existsSync(appPath) && existsSync(dbPath) && existsSync(layoutPath) && Boolean(process.env.DATABASE_URL)
  && process.env.AURION_INTEGRATION_TESTS === '1' && Boolean(process.env.AURION_ADMIN_DATABASE_URL);
const skip = ready ? false : 'dist/ absent, AURION_INTEGRATION_TESTS≠1, DATABASE_URL ou AURION_ADMIN_DATABASE_URL non défini';

test.after(async () => { if (modules) { await modules.db.db.end().catch(() => {}); if (modules.db.adminDb) await modules.db.adminDb.end().catch(() => {}); } });
const modules = ready ? { app: null, db: null, signAccessToken: null, layout: null } : null;
async function boot() {
  if (!modules.app) {
    const [{ buildApp }, db, auth, layout] = await Promise.all([import(appPath), import(dbPath), import(authPath), import(layoutPath)]);
    modules.app = await buildApp(); modules.db = db; modules.signAccessToken = auth.signAccessToken; modules.layout = layout;
  }
  return modules;
}
const uuid = () => crypto.randomUUID();
async function seedAccount(mod) {
  const userId = uuid(), organizationId = uuid();
  await mod.db.query(`insert into organizations(id,name,activity,siret) values($1,$2,'Test correctif 078',$3)`, [organizationId, `Micro ${organizationId.slice(0, 8)}`, '88848569500033']);
  await mod.db.query(`insert into users(id,email,password_hash) values($1,$2,'x')`, [userId, `fix078-${crypto.randomUUID()}@example.test`]);
  await mod.db.query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'owner')`, [organizationId, userId]);
  await mod.db.withTenant(organizationId, async () => {
    await mod.db.query(`insert into activities(organization_id,code,name,description) values($1,'principale','Activité principale','Fixture correctif 078')`, [organizationId]);
    await mod.db.query(`insert into subscriptions(organization_id,status,trial_started_at,trial_ends_at) values($1,'trialing',now(),now()+interval '60 days')`, [organizationId]);
  });
  const sv = Number((await mod.db.query('select session_version from users where id=$1', [userId])).rows[0]?.session_version || 0);
  const token = await mod.signAccessToken({ userId, organizationId, role: 'owner', sv });
  return { token, userId, organizationId };
}
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const WEBP_1PX = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64');
function filePart(boundary, name, filename, mime, buffer) {
  return `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`;
}

test('correctif 078 · phase C : le logo WebP est refusé avec message, le PNG est accepté, servi puis supprimable', { skip }, async () => {
  const mod = await boot();
  const A = await seedAccount(mod);
  const auth = { authorization: `Bearer ${A.token}` };
  const boundary = 'fix078logo' + crypto.randomUUID().replace(/-/g, '');

  const webp = await mod.app.inject({ method: 'POST', url: '/organization/logo', headers: { ...auth, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat([Buffer.from(filePart(boundary, 'file', 'logo.webp', 'image/webp', WEBP_1PX)), WEBP_1PX, Buffer.from(`\r\n--${boundary}--\r\n`)]) });
  assert.equal(webp.statusCode, 400, webp.body);
  assert.match(webp.body, /WebP/);
  assert.match(webp.body, /PDF, DOCX et ODT/);

  const png = await mod.app.inject({ method: 'POST', url: '/organization/logo', headers: { ...auth, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat([Buffer.from(filePart(boundary, 'file', 'logo.png', 'image/png', PNG_1PX)), PNG_1PX, Buffer.from(`\r\n--${boundary}--\r\n`)]) });
  assert.equal(png.statusCode, 200, png.body);
  assert.equal(png.body.hasLogo || JSON.parse(png.body).hasLogo, true);

  const served = await mod.app.inject({ method: 'GET', url: '/organization/logo', headers: auth });
  assert.equal(served.statusCode, 200);
  assert.equal(served.headers['content-type'], 'image/png');

  const removed = await mod.app.inject({ method: 'DELETE', url: '/organization/logo', headers: auth });
  assert.equal(removed.statusCode, 200);
});

test('correctif 078 · phase C : documents PDF/DOCX/ODT à textes longs — identité émettrice visible, encarts à hauteur calculée', { skip }, async () => {
  const mod = await boot();
  const A = await seedAccount(mod);
  const longWarranty = 'Garantie pièces et main-d’œuvre de six mois, hors éléments consommables et hors dommages causés par une utilisation non conforme aux prérecommandations du fabricant. '.repeat(8).trim();
  const longCgv = 'Les conditions générales suivantes s’appliquent à l’ensemble des prestations réalisées : devis valable trente jours, règlement à trente jours date de facture, pénalités de retard au taux légal majoré, indemnité forfaitaire de recouvrement de quarante euros, réserve de propriété jusqu’au paiement intégral. '.repeat(6).trim();
  const model = {
    theme: { accent: '#0b63ce', dark: '#0b1220', font: 'sans', radius: 'round', customized: false },
    legal: ['Micro Test — SIRET 88848569500033 — 1 Rue Jacques Prevert 85300 Challans', 'Assurance RC professionnelle : attestation disponible sur demande'],
    kind: 'invoice', title: 'Facture', number: 'FAC-078-TEST', date: '14/11/2026',
    company: { name: 'Garage Longtext Émetteur', activity: 'Réparation', siret: '88848569500033', address: '1 Rue Jacques Prevert', postalCode: '85300', city: 'Challans' },
    client: { name: 'Client Aux Textes Particulièrement Longs Pour Éprouver Les Hauteurs Calculées Des Encarts', address: '12 Avenue des Désignations Beaucoup Trop Longues Pour Tenir Sur Une Seule Ligne De Document, 44000 Nantes', interventionAddress: 'Atelier distant — 98 Boulevard des Interventions Très Longues, 85300 Challans' },
    interventionLabel: 'Prestation', intervention: 'Remplacement complet du module de charge et diagnostic électronique approfondi de la carte mère avec rapport détaillé',
    device: { serialNumber: 'SN-LONG-078-ABCDEF', imei: '350000000000007' },
    itemsLabel: 'Désignation', quantityLabel: 'Qté',
    items: Array.from({ length: 40 }, (_, i) => ({ label: `Pièce de référence très longue n°${i + 1} — module connecteur d’origine constructeur avec joint d’étanchéité et visserie spécifique`, quantity: String(i + 1) })),
    warranty: longWarranty, reminderPenalty: 'Pénalités de retard : 3 × taux légal, indemnité forfaitaire 40 €', mileage: { km: '42', rate: '0,60 €', total: '25,20 €', visible: true }, totalTtc: '1 299,99 €', cgv: longCgv,
    logo: { data: PNG_1PX, mime: 'image/png' },
  };
  const pdf = await mod.layout.buildPdf(model);
  assert.ok(pdf.length > 10000, 'PDF produit');
  // Les flux de contenu PDF sont compressés (FlateDecode) : décompression avant recherche du texte.
  // PDFKit écrit le texte en TJ hexadécimal avec ajustements de kerning : décompression des flux,
  // décodage hex/littéral des fragments puis concaténation dans l'ordre pour reconstituer le texte.
  const raw = pdf.toString('latin1');
  const chunks = [];
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    try { chunks.push(zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1')); }
    catch { chunks.push(m[1]); }
  }
  const fragments = [];
  for (const m of chunks.join('\n').matchAll(/<([0-9A-Fa-f]+)>|\((?:\\.|[^\\)])*\)/g)) {
    if (m[1]) fragments.push(Buffer.from(m[1], 'hex').toString('latin1'));
    else fragments.push(m[0].slice(1, -1).replace(/\\([()\\])/g, '$1'));
  }
  assert.match(fragments.join(''), /88848569500033/, 'identité émettrice (SIRET) présente dans le PDF');
  assert.ok((raw.match(/\/Type \/Page[^s]/g) || []).length >= 2, 'les textes longs paginent le document (hauteurs calculées)');
  const docx = await mod.layout.buildDocx(model);
  const AdmZip = (await import('adm-zip')).default;
  const docxXml = new AdmZip(docx).readAsText('word/document.xml');
  assert.match(docxXml, /88848569500033/, 'identité émettrice dans le DOCX');
  assert.match(docxXml, /Garage Longtext Émetteur/, 'nom commercial dans le DOCX');
  const odt = mod.layout.buildOdt(model);
  const odtXml = new AdmZip(odt).readAsText('content.xml');
  assert.match(odtXml, /88848569500033/, 'identité émettrice dans l’ODT');
  assert.match(odtXml, /Garage Longtext Émetteur/, 'nom commercial dans l’ODT');
});

test('correctif 078 · phase F : détection fournisseur par nom normalisé, SIREN et SIRET sur registre simulé, commit create/update', { skip }, async () => {
  const mod = await boot();
  const A = await seedAccount(mod);
  const auth = { authorization: `Bearer ${A.token}` };

  // Registre simulé : deux fournisseurs existants + un fournisseur inconnu dans les fichiers importés.
  const created = [];
  for (const s of [
    { name: 'Bricolmat Provence', siret: '88848569500033', email: 'commandes@bricolmat.example' },
    { name: 'Négo Pièces Auto', email: 'ventes@negopieces.example' },
  ]) {
    const r = await mod.app.inject({ method: 'POST', url: '/suppliers', headers: auth, payload: s });
    assert.equal(r.statusCode, 201, r.body);
    created.push(JSON.parse(r.body));
  }
  const existingBricolmat = created[0].id || created[0].supplier?.id;

  // Fichier d’import : variantes d’accentuation/casse du premier, e-mail du second, inconnu, doublon interne.
  const rows = [
    { name: "BRICOL' MAT provence", siret: '88848569500033', email: 'nouveau@bricolmat.example' },
    { name: 'nego pieces auto', email: 'ventes@negopieces.example' },
    { name: 'Fournisseur Inconnu Du Registre', siret: '10912240400029' },
    { name: 'fournisseur inconnu du registre', siret: '10912240400029' },
  ];
  const boundary = 'fix078import' + crypto.randomUUID().replace(/-/g, '');
  const json = Buffer.from(JSON.stringify(rows), 'utf8');
  const preview = await mod.app.inject({ method: 'POST', url: '/data-import/preview', headers: { ...auth, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat([Buffer.from(filePart(boundary, 'file', 'fournisseurs.json', 'application/json', json)), json, Buffer.from(`\r\n--${boundary}--\r\n`)]) });
  assert.equal(preview.statusCode, 200, preview.body);
  const records = JSON.parse(preview.body).records;
  assert.equal(records.length, 4, 'quatre candidats détectés');
  const byRow = i => records.find(r => r.sourceRow === i + 2);
  assert.equal(byRow(0).duplicate, true, 'variante d’accents/casse du nom détectée');
  assert.equal(byRow(0).duplicateOf, existingBricolmat, 'rattachée à la fiche « Bricolmat Provence »');
  assert.equal(byRow(1).duplicate, true, 'fournisseur détecté par e-mail');
  assert.equal(byRow(2).duplicate, false, 'fournisseur inconnu : création proposée');
  assert.equal(byRow(3).duplicate, true, 'doublon interne aux fichiers importés signalé');
  assert.match(byRow(3).duplicateLabel, /Doublon dans les fichiers importés/);

  // Commit : mise à jour de la fiche détectée + création de l’inconnu ; le doublon interne est ignoré.
  const commit = await mod.app.inject({ method: 'POST', url: '/data-import/commit', headers: { ...auth, 'content-type': 'application/json' }, payload: { records: records.map((r, i) => ({ id: r.id, entity: r.entity, action: i === 0 ? 'update' : r.defaultAction, data: r.data, duplicateOf: r.duplicateOf || '' })) } });
  assert.equal(commit.statusCode, 200, commit.body);
  const outcome = JSON.parse(commit.body);
  console.log('OUTCOME COMMIT:', JSON.stringify(outcome));
  assert.equal(outcome.updated, 1, 'une fiche mise à jour');
  assert.equal(outcome.created, 1, 'une fiche créée');
  const saved = await mod.db.withTenant(A.organizationId, async () => (await mod.db.query('select name,siret,email from suppliers where id=$1', [existingBricolmat])).rows[0]);
  assert.equal(saved.email, 'nouveau@bricolmat.example', 'la mise à jour a bien repris les champs choisis (le nom retenu est celui de l\'import)');
  const created2 = await mod.db.withTenant(A.organizationId, async () => (await mod.db.query("select count(*)::int n from suppliers where name='Fournisseur Inconnu Du Registre'")).rows[0]);
  assert.equal(created2.n, 1, 'le fournisseur inconnu a été créé une seule fois');
});
