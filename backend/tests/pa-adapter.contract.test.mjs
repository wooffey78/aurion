// Bloc 3 — tests de contrat de l'adaptateur PA générique (AUCUNE PA réelle connectée).
//
// Ces tests exercent le contrat d'authentification (signature HMAC, horodatage, anti-rejeu) et
// de décodage (enveloppe + charge utile) de l'adaptateur « generic », ainsi que l'isolement du
// registre d'adaptateurs. Ils ne contactent aucun service externe : c'est un contrat de
// référence, PAS une recette sandbox. La réception n'est pas déclarée opérationnelle en
// production tant qu'aucune PA contractuelle n'a été connectée et validée (bloc 3 du cahier
// des charges).
// Prérequis : « npm run build » ; sinon ignorés avec la raison affichée — jamais déclarés
// réussis sans exécution.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const genericPath = fileURLToPath(new URL('../dist/services/pa/generic.js', import.meta.url));
const registryPath = fileURLToPath(new URL('../dist/services/pa/index.js', import.meta.url));
const ready = existsSync(genericPath) && existsSync(registryPath);
const skip = ready ? false : 'dist/ absent : exécuter après « npm run build »';

const SECRET = 'pa-contract-test-secret-32-characters-minimum-!';

// Le registre d'adaptateurs importe la configuration (zod) : variables obligatoires fournies
// sans aucune connexion réelle (aucune requête exécutée par ces tests, pools paresseux).
process.env.NODE_ENV ||= 'test';
process.env.DATABASE_URL ||= 'postgresql://contract-test:unused@localhost:5432/unused';
process.env.JWT_SECRET ||= 'contract-test-jwt-secret-0123456789abcdef';

function makeAdapter() {
  // Import unique par fichier (le registre importe l'adaptateur) — cache ESM partagé.
  return import(pathToFileURL(genericPath).href).then(generic => import(pathToFileURL(registryPath).href).then(registry => ({ generic, registry })));
}
const modules = ready ? await makeAdapter() : null;

const pdfBytes = Buffer.from('%PDF-1.7 facture de test bloc 3\n', 'utf8');
function baseEnvelope(overrides = {}) {
  return {
    eventId: `evt-${crypto.randomUUID()}`,
    type: 'invoice.received',
    occurredAt: new Date().toISOString(),
    invoice: {
      invoiceId: `PA-INV-${crypto.randomUUID().slice(0, 8)}`,
      number: 'FA-2026-0142',
      issueDate: '2026-11-13',
      dueDate: '2026-12-13',
      currency: 'EUR',
      supplier: { name: 'Fournisseur Exemple', siren: '123456789', siret: '12345678900011', email: 'compta@fournisseur.example', vatNumber: 'FR32123456789' },
      totals: { net: 100, tax: 20, gross: 120 },
      items: [{ label: 'Prestation de maintenance', quantity: 2, unitPrice: 50, total: 100 }],
      document: { filename: 'facture-FA-2026-0142.pdf', contentType: 'application/pdf', contentBase64: pdfBytes.toString('base64') },
    },
    ...overrides,
  };
}
function signBody(body, timestamp = Math.floor(Date.now() / 1000)) {
  const v1 = crypto.createHmac('sha256', SECRET).update(`${timestamp}.`, 'utf8').update(body).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

test('contrat PA generic : signature valide acceptée, charge utile décodée intégralement', { skip }, async () => {
  const { generic } = modules;
  const body = Buffer.from(JSON.stringify(baseEnvelope()));
  const headers = { 'x-aurion-pa-signature': signBody(body) };
  assert.equal(generic.genericPaAdapter.verifySignature(body, headers, SECRET), true, 'signature correcte acceptée');
  const parsed = await generic.genericPaAdapter.parseEvent(body, 10 * 1024 * 1024);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.event.type, 'invoice.received');
  assert.equal(parsed.event.invoice.number, 'FA-2026-0142');
  assert.equal(parsed.event.invoice.supplier.siren, '123456789');
  assert.equal(parsed.event.invoice.totals.gross, 120);
  assert.ok(Buffer.isBuffer(parsed.event.invoice.document.bytes), 'fichier original décodé en Buffer');
  assert.equal(parsed.event.invoice.document.bytes.toString('utf8'), pdfBytes.toString('utf8'), 'octets identiques à l’original');
});

test('contrat PA generic : signature invalide, corps altéré, secret différent et rejeu refusés', { skip }, async () => {
  const { generic } = modules;
  const body = Buffer.from(JSON.stringify(baseEnvelope()));
  const headers = { 'x-aurion-pa-signature': signBody(body) };
  assert.equal(generic.genericPaAdapter.verifySignature(body, headers, 'autre-secret-tres-long-au-moins-32-caracteres!!'), false, 'mauvais secret refusé');

  const tampered = Buffer.from(JSON.stringify(baseEnvelope()), 'utf8').slice(0, -2) + Buffer.from('"}}', 'utf8');
  assert.equal(generic.genericPaAdapter.verifySignature(tampered, headers, SECRET), false, 'corps modifié après signature refusé');

  const stale = Math.floor(Date.now() / 1000) - 3600;
  assert.equal(generic.genericPaAdapter.verifySignature(body, { 'x-aurion-pa-signature': signBody(body, stale) }, SECRET), false, 'horodatage trop ancien (rejeu) refusé');

  const future = Math.floor(Date.now() / 1000) + 3600;
  assert.equal(generic.genericPaAdapter.verifySignature(body, { 'x-aurion-pa-signature': signBody(body, future) }, SECRET), false, 'horodatage futur refusé');

  assert.equal(generic.genericPaAdapter.verifySignature(body, { 'x-aurion-pa-signature': 'garbage' }, SECRET), false, 'en-tête mal formé refusé');
  assert.equal(generic.genericPaAdapter.verifySignature(body, {}, SECRET), false, 'en-tête absent refusé');
});

test('contrat PA generic : enveloppe invalide ou charge utile non conforme rejetées avec code précis', { skip }, async () => {
  const { generic } = modules;
  const cases = [
    ['JSON illisible', Buffer.from('not-json'), 'INVALID_WEBHOOK_PAYLOAD'],
    ['eventId manquant', Buffer.from(JSON.stringify({ type: 'invoice.received', occurredAt: new Date().toISOString() })), 'INVALID_WEBHOOK_PAYLOAD'],
    ['SIREN non numérique', Buffer.from(JSON.stringify(baseEnvelope({ invoice: { ...baseEnvelope().invoice, supplier: { ...baseEnvelope().invoice.supplier, siren: 'abc' } } }))), 'INVALID_WEBHOOK_PAYLOAD'],
    ['date d’émission invalide (regex)', Buffer.from(JSON.stringify(baseEnvelope({ invoice: { ...baseEnvelope().invoice, issueDate: '31-02-2026' } }))), 'INVALID_WEBHOOK_PAYLOAD'],
    ['date d’émission inexistante (31 février)', Buffer.from(JSON.stringify(baseEnvelope({ invoice: { ...baseEnvelope().invoice, issueDate: '2026-02-31' } }))), 'INVALID_WEBHOOK_PAYLOAD'],
    ['type MIME non pris en charge', Buffer.from(JSON.stringify(baseEnvelope({ invoice: { ...baseEnvelope().invoice, document: { ...baseEnvelope().invoice.document, contentType: 'application/x-fake' } } }))), 'UNSUPPORTED_EVENT_CONTENT'],
    ['base64 illisible', Buffer.from(JSON.stringify(baseEnvelope({ invoice: { ...baseEnvelope().invoice, document: { ...baseEnvelope().invoice.document, contentBase64: '@@@pas-base64@@@' } } }))), 'INVALID_WEBHOOK_PAYLOAD'],
    ['fichier vide', Buffer.from(JSON.stringify(baseEnvelope({ invoice: { ...baseEnvelope().invoice, document: { ...baseEnvelope().invoice.document, contentBase64: '' } } }))), 'INVALID_WEBHOOK_PAYLOAD'],
  ];
  for (const [label, body, expectedCode] of cases) {
    const parsed = await generic.genericPaAdapter.parseEvent(body, 10 * 1024 * 1024);
    assert.equal(parsed.ok, false, label + ' : doit être rejeté');
    assert.equal(parsed.code, expectedCode, label + ' : code de refus précis');
  }
  const oversized = Buffer.from(JSON.stringify(baseEnvelope()));
  const parsed = await generic.genericPaAdapter.parseEvent(oversized, 16);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.code, 'UNSUPPORTED_EVENT_CONTENT', 'dépassement AURION_PA_MAX_FILE_BYTES refusé');
});

test('contrat PA generic : type d’événement inconnu acquitté sans facture (pas de boucle de re-tentatives)', { skip }, async () => {
  const { generic } = modules;
  const body = Buffer.from(JSON.stringify({ eventId: `evt-${crypto.randomUUID()}`, type: 'invoice.status.changed', occurredAt: new Date().toISOString(), detail: { x: 1 } }));
  const parsed = await generic.genericPaAdapter.parseEvent(body, 10 * 1024 * 1024);
  assert.equal(parsed.ok, true, 'type inconnu accepté pour acquittement');
  assert.equal(parsed.event.invoice, null, 'aucune facture déduite');
});

test('registre d’adaptateurs : « generic » résolu, provider inconnu refusé, aucun endpoint réel codé en dur', { skip }, async () => {
  const { registry, generic } = modules;
  assert.equal(registry.resolvePaAdapter('generic').provider, 'generic');
  assert.equal(registry.resolvePaAdapter('plateforme-inconnue'), null, 'provider inconnu → null (aucune connexion silencieuse)');
  assert.ok(registry.genericPaAdapter.eventTypes.includes('invoice.received'), 'type contractuel déclaré');
  // Garde-fou statique : le contrat générique ne contient AUCUN endpoint réseau (PA réelle = adaptateur dédié).
  const source = readFileSync(fileURLToPath(new URL('../src/services/pa/generic.ts', import.meta.url)), 'utf8');
  assert.doesNotMatch(source, /https:\/\/(?!impots\.gouv\.fr|economie\.gouv\.fr)/, 'aucun endpoint de PA réelle codé en dur');
});

test('documentation bloc 3 : le contrat PA est documenté et explicitement marqué non connecté', { skip }, async () => {
  const docPath = fileURLToPath(new URL('../../docs/PLATEFORME-AGREEE.md', import.meta.url));
  assert.equal(existsSync(docPath), true, 'docs/PLATEFORME-AGREEE.md doit exister');
  const doc = readFileSync(docPath, 'utf8');
  assert.match(doc, /non connectée|non connecté|PAS encore connectée/i, 'le document doit expliciter qu’aucune PA réelle n’est connectée');
  assert.match(doc, /X-Aurion-PA-Signature/, 'le schéma de signature doit être documenté');
  assert.match(doc, /impots\.gouv\.fr/, 'les références DGFiP doivent être citées');
});
