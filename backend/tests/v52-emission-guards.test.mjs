// 15.4.51/53 (PROMPT B2/B3 + C2) — gardes d'émission : unitaires (moteurs purs) + contrat de
// source du branchement dans l'émission de facture. Les unitaires importent le dist compilé
// (gabarit v50 : skip si absent) ; le contrat de source est exécutable sans PostgreSQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
process.env.DATABASE_URL ||= 'postgres://x:y@127.0.0.1:1/z';
process.env.JWT_SECRET ||= 'x'.repeat(40);
const dist = (p) => { try { return existsSync(fileURLToPath(new URL(p, import.meta.url))) ? fileURLToPath(new URL(p, import.meta.url)) : false; } catch { return false; } };

const business = readFileSync(new URL('../src/routes/business.ts', import.meta.url), 'utf8');
const mentions = readFileSync(new URL('../src/services/mentions.ts', import.meta.url), 'utf8');
const gate = dist('../dist/services/mention-gate.js');
const chain = dist('../dist/services/integrity-chain.js');

test('unitaire — porte des mentions (révisé 15.4.54) : seules identity/insurance bloquent ; le médiateur devient un rappel non bloquant', { skip: !gate }, async () => {
  const { blockingMentionGaps, mentionReminders } = await import(pathToFileURL(gate).href);
  const M = (key, source) => ({ key, text: source === 'auto' ? 'x' : '', source });
  const gaps = blockingMentionGaps([
    M('identity', 'needs_confirmation'), M('insurance', 'needs_confirmation'),
    M('mediator', 'needs_confirmation'), M('vat', 'auto'), M('payment', 'auto'),
    M('legal-warranty', 'auto'), M('validity', 'auto'),
  ]);
  // Le médiateur ne bloque PLUS l'émission : il sort des gaps bloquants…
  assert.deepEqual(gaps.map(g => g.key).sort(), ['identity', 'insurance']);
  assert.equal(blockingMentionGaps([M('identity', 'provided'), M('mediator', 'needs_confirmation')]).length, 0);
  assert.equal(blockingMentionGaps([]).length, 0);
  // …et devient un rappel informatif (configurable, jamais refusé).
  assert.deepEqual(mentionReminders([M('mediator', 'needs_confirmation')]).map(g => g.key), ['mediator']);
  assert.equal(mentionReminders([M('identity', 'needs_confirmation'), M('insurance', 'needs_confirmation')]).length, 0);
  assert.equal(mentionReminders([]).length, 0);
});

test('unitaire — contenu canonique de facture : stable, sensible aux montants et aux lignes', { skip: !chain }, async () => {
  const { canonicalInvoiceContent, sha256Hex } = await import(pathToFileURL(chain).href);
  const base = { documentId: 'd1', number: 'FAC-1', clientId: 'c1', totalHt: '100.00', totalVat: '20.00', totalTtc: '120.00', dueAt: '2026-12-01', items: [{ label: 'Main d’œuvre', quantity: 2, unitPrice: '50.00' }] };
  const a = sha256Hex(canonicalInvoiceContent(base));
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, sha256Hex(canonicalInvoiceContent({ ...base })), 'deux sérialisations du même document → même empreinte');
  assert.notEqual(a, sha256Hex(canonicalInvoiceContent({ ...base, totalTtc: '121.00' })), 'un montant altéré change l\u2019empreinte');
  assert.notEqual(a, sha256Hex(canonicalInvoiceContent({ ...base, items: [{ label: 'Main d’œuvre', quantity: 3, unitPrice: '50.00' }] })), 'une ligne altérée change l\u2019empreinte');
  assert.notEqual(a, sha256Hex(canonicalInvoiceContent({ ...base, dueAt: null })), 'une échéance altérée change l\u2019empreinte');
});

test('contrat — porte des mentions branchée à l\u2019émission : 422 avant toute écriture, snapshot persisté', () => {
  // Le contrôle de mentions s'exécute AVANT la transaction d'émission (source de vérité serveur).
  const order = business.indexOf('blockingMentionGaps(invoiceMentions)');
  const tx = business.indexOf('const converted=await withTransaction');
  assert.ok(order > 0 && tx > order, 'le contrôle de mentions doit précéder la transaction d\u2019émission');
  assert.match(business, /MENTIONS_INCOMPLETES/);
  assert.match(business, /mentionsSnapshot=JSON\.stringify\(invoiceMentions\)/);
  assert.match(business, /update quotes set mentions_snapshot=\$1::jsonb/);
  // Grandfathering documenté : aucun re-contrôle rétroactif.
  assert.match(business, /PROMPT C2/);
});

test('contrat — garde-fou de dérive recalculé côté serveur : 422 si dérive sans justification', () => {
  assert.match(business, /quoteRubrics/);
  assert.match(business, /DEVIATION_JUSTIFICATION_REQUIRED/);
  assert.match(business, /detectDeviation\(quoteRubrics,invoiceRubrics\)/);
  assert.match(business, /deviationJustification/);
  // Persistance auditable (migration 119) dans la transaction d'émission.
  assert.match(business, /deviation_justified_at=now\(\)/);
  const m119 = readFileSync(new URL('../migrations/119_deviation_justification.sql', import.meta.url), 'utf8');
  assert.match(m119, /deviation_justification text null/);
  assert.match(m119, /deviation_rubrics jsonb null/);
});

test('contrat — maillon de chaîne d\u2019intégrité écrit à l\u2019émission (idempotent, échec non bloquant)', () => {
  // 15.4.52 — l\u2019exécuteur conforme { query } (sqlExecutor) remplace le cast improvisé de la
  // fonction query (qui provoquait un 500 réel sur ce maillon en conditions runtime).
  assert.match(business, /recordDocumentIntegrity\(sqlExecutor,org,id,'invoice'/);
  assert.match(business, /canonicalInvoiceContent/);
  assert.match(business, /integrityRecorded/);
  // Le service est la source unique (déplacé de routes/maintenance.ts) et reste réexporté.
  assert.match(readFileSync(new URL('../src/services/integrity-chain.ts', import.meta.url), 'utf8'), /export async function recordDocumentIntegrity/);
  assert.match(readFileSync(new URL('../src/routes/maintenance.ts', import.meta.url), 'utf8'), /export \{ recordDocumentIntegrity \} from '\.\.\/services\/integrity-chain\.js'/);
});

test('contrat — moteur de mentions : les mentions bloquantes sont déjà des needs_confirmation explicites', () => {
  // SIRET/SIREN, assurance travaux, médiateur grand public : le moteur n'invente rien.
  assert.match(mentions, /needs_confirmation/);
  assert.match(mentions, /Assurance professionnelle \/ décennale non renseignée/);
  assert.match(mentions, /Médiateur de la consommation non renseigné/);
});

test('contrat — pré-vérification UI : route GET /mentions/blocking avec la même source de vérité', () => {
  assert.match(business, /app\.get\('\/mentions\/blocking'/);
  assert.match(business, /ALREADY_INVOICE/);
});
