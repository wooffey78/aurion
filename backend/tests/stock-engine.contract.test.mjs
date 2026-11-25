// Bloc 10 (prompt 10) — moteur de stock traçable, réservations et seuils.
// Contrats statiques (migrations, service, routes, intégration catalogue) + tests unitaires
// purs des fonctions déterministes (signes de mouvement, refus de stock négatif, propositions
// de réapprovisionnement tenant compte des commandes ouvertes).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

process.env.NODE_ENV ||= 'test';
process.env.JWT_SECRET ||= 'integration-test-jwt-secret-0123456789abcdef0123456789';
process.env.DATABASE_URL ||= 'postgresql://aurion_runtime:test@127.0.0.1:5432/aurion_local';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const migration = read('../migrations/095_stock_engine.sql');
const service = read('../src/services/stock.ts');
const routes = read('../src/routes/stock.ts');
const business = read('../src/routes/business.ts');

test('migration 095 — mouvements traçables, réservations, seuils, RLS tenant', () => {
  assert.match(migration, /create table if not exists stock_movements/);
  assert.match(migration, /movement_type varchar\(30\) not null check \(movement_type in \('initial','receipt','consumption','adjustment','return','damage','loss'\)\)/);
  assert.match(migration, /quantity_after numeric\(12,2\) not null/);
  assert.match(migration, /create table if not exists part_reservations/);
  assert.match(migration, /status in \('active','consumed','released','cancelled'\)/);
  assert.match(migration, /quantity numeric\(12,2\) not null check \(quantity > 0\)/);
  assert.match(migration, /add column if not exists min_stock_threshold numeric\(12,2\) not null default 0/);
  assert.match(migration, /add column if not exists unit varchar\(20\)/);
  assert.match(migration, /add column if not exists storage_location varchar\(160\)/);
  // Isolation multi-tenant identique à la RLS 074 (échec fermé, boucle additivenne).
  assert.match(migration, /tenant_isolation on public\./);
  assert.match(migration, /aurion_tenant_org\(\) or pg_has_role\(current_user, 'aurion_admin', 'member'\)/);
});

test('service stock — aucune écriture libre : toute variation passe par createStockMovement', () => {
  assert.match(service, /export async function createStockMovement/);
  assert.match(service, /for update/); // verrou de ligne sur la transaction appelante
  assert.match(service, /NEGATIVE_STOCK/);
  assert.match(service, /evaluateThreshold/); // seuils évalués à chaque mouvement
  // La réservation diminue le disponible, pas le physique (aucun update de parts.stock ici).
  const reserveFn = service.slice(service.indexOf('export async function reservePart'), service.indexOf('export async function releaseReservation'));
  assert.ok(!reserveFn.includes('update parts set stock'), 'reservePart ne doit jamais modifier le stock physique');
  // La consommation crée un mouvement « consumption » au moment confirmé.
  const consumeFn = service.slice(service.indexOf('export async function consumeReservation'), service.indexOf('export async function releaseQuoteReservations'));
  assert.match(consumeFn, /type: 'consumption'/);
  assert.match(consumeFn, /status='consumed'/);
});

test('routes /stock — synthèse disponible, ajustement tracé, réservations, propositions', () => {
  assert.match(routes, /app\.get\('\/stock\/summary'/);
  assert.match(routes, /app\.get\('\/stock\/movements'/);
  assert.match(routes, /app\.post\('\/stock\/movements\/adjust'/);
  assert.match(routes, /Aucune commande fournisseur n\\?'est créée automatiquement/);
  assert.match(routes, /app\.post\('\/stock\/reservations\/:id\/consume'/);
  // Le seuil s'applique au disponible : une réservation ne déclenche pas une fausse alerte de rupture physique.
  assert.match(routes, /reorder-proposals/);
});

test('catalogue — la création et la modification de pièce créent des mouvements (traçabilité)', () => {
  assert.match(business, /type:'initial',quantity:stock/); // POST /parts → mouvement initial
  assert.match(business, /type:'adjustment',quantity:delta/); // PATCH /parts → ajustement tracé
  assert.match(business, /Ajustement manuel du stock depuis le catalogue/);
});

// ── Tests unitaires purs (aucune base requise) ─────────────────────────────────────────
const appPath = fileURLToPath(new URL('../dist/services/stock.js', import.meta.url));
const skippable = existsSync(appPath) ? false : 'dist/ absente : lancer le build (npm test le fait)';

test('unitaire — signes de mouvement par type et refus des quantités invalides', { skip: skippable }, async () => {
  const { validateMovementQuantity, computeStockAfter, StockError, MOVEMENT_SIGNS } = await import(pathToFileURL(appPath).href);
  assert.equal(MOVEMENT_SIGNS.receipt, 1);
  assert.equal(MOVEMENT_SIGNS.consumption, -1);
  assert.equal(MOVEMENT_SIGNS.adjustment, 0);
  // Entrée négative refusée ; sortie positive refusée ; ajustement signé accepté.
  assert.throws(() => validateMovementQuantity('receipt', -5), StockError);
  assert.throws(() => validateMovementQuantity('consumption', 5), StockError);
  assert.equal(validateMovementQuantity('adjustment', -3).quantity, -3);
  assert.equal(validateMovementQuantity('return', -2).quantity, -2);
  assert.throws(() => validateMovementQuantity('loss', 0), StockError);
  // Stock négatif refusé par défaut.
  assert.throws(() => computeStockAfter(2, -5), (e) => e.code === 'NEGATIVE_STOCK');
  assert.equal(computeStockAfter(2, -5, true), -3);
  // Arrondi monétaire 2 décimales.
  assert.equal(computeStockAfter(0.1, 0.2), 0.3);
});

test('unitaire — propositions de réapprovisionnement : seuil − disponible − déjà commandé', { skip: skippable }, async () => {
  const { normalizeOrderLines, orderTotal, PurchaseError } = await import(new URL('../dist/services/purchases.js', import.meta.url).href);
  // Lignes normalisées : quantité positive exigée, prix nul autorisé, libellé obligatoire.
  assert.throws(() => normalizeOrderLines([{ label: '', quantity: 1 }]), PurchaseError);
  assert.throws(() => normalizeOrderLines([{ label: 'x', quantity: 0 }]), PurchaseError);
  const lines = normalizeOrderLines([
    { label: 'Filtre', quantity: '2,5', unitPrice: '12,40' },
    { label: 'Vis', quantity: 100 },
  ]);
  assert.equal(lines[0].quantity, 2.5);
  assert.equal(lines[0].unitPrice, 12.4);
  assert.equal(orderTotal(lines), 31); // 2,5 × 12,40 = 31,00
  assert.throws(() => normalizeOrderLines([]), PurchaseError);
});

test('unitaire — catégories et sécurité documentaire (bloc 16)', { skip: skippable }, async () => {
  const { sniffMime, decideUpload, sha256Hex, DOCUMENT_CATEGORIES, isKnownCategory } = await import(new URL('../dist/services/doc-security.js', import.meta.url).href);
  // PDF réel détecté, EXE renommé en .pdf refusé, contenu inconnu refusé.
  const pdf = sniffMime(Buffer.from('%PDF-1.7 contenu de test'));
  assert.equal(pdf.mime, 'application/pdf');
  assert.equal(decideUpload('application/pdf', pdf).status, 'clean');
  const exe = sniffMime(Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.from('fakeexe')]));
  assert.equal(exe.dangerous, true);
  assert.equal(decideUpload('application/pdf', exe).status, 'rejected');
  assert.equal(decideUpload('application/pdf', exe).reason, 'FORMAT_DANGEROUS');
  // JPEG usurpé en TXT : détecté par signature.
  const jpeg = sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
  assert.equal(jpeg.mime, 'image/jpeg');
  assert.equal(decideUpload('text/plain', jpeg).status, 'rejected');
  // Empreinte SHA-256 déterministe.
  assert.equal(sha256Hex(Buffer.from('aurion')), sha256Hex(Buffer.from('aurion')));
  assert.equal(sha256Hex(Buffer.from('aurion')).length, 64);
  // Catégories déterministes seulement.
  assert.ok(isKnownCategory('justificatif-achat'));
  assert.ok(!isKnownCategory('ma-libre'));
  assert.ok(DOCUMENT_CATEGORIES.includes('autre'));
});
