// 15.4.52 — Correctifs runtime prouvés par reproduction : exécuteur SQL (endpoints 500),
// création de chantier (location:null rejetée, garde FK), comptes catalogue cohérents
// (notification = compteur), moteur de calcul étendu et cycle de vie chantier.
// Modèle v50 : assertions statiques sur les sources + unitaires purs sur le dist.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
process.env.DATABASE_URL ||= 'postgres://x:y@127.0.0.1:1/z';
process.env.JWT_SECRET ||= 'x'.repeat(40);
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('15.4.52 — plus aucun exécuteur SQL improvisé : la fonction query n\u2019est plus coulée en SqlExecutor', () => {
  const dir = new URL('../src/routes/', import.meta.url);
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.ts')) continue;
    const s = read(`../src/routes/${f}`);
    assert.ok(!/query as unknown as SqlExecutor/.test(s), `${f} coule encore la fonction query en SqlExecutor (500 runtime)`);
  }
  const db = read('../src/db.ts');
  assert.match(db, /export const sqlExecutor: SqlExecutor/, 'db.ts doit exporter un exécuteur conforme ({ query })');
});

test('15.4.52 — création de chantier : schéma tolérant aux null, message précis, garde d\u2019appartenance', () => {
  const s = read('../src/routes/chantiers.ts');
  assert.match(s, /location: z\.string\(\)\.trim\(\)\.max\(300\)\.nullish\(\)/, 'location doit accepter null (payload réel de l\u2019interface)');
  assert.match(s, /notes: z\.string\(\)\.max\(4000\)\.nullish\(\)/, 'notes doit accepter null');
  assert.match(s, /chantierInputError/, 'message d\u2019erreur champ par champ (plus de « nom requis » trompeur)');
  assert.match(s, /async function validateReferences/, 'garde d\u2019appartenance activité/client');
  assert.match(s, /Identifiant d\\u2019activité invalide ignoré|activité introuvable dans cette organisation/i, 'les identifiants inconnus sont ignorés et signalés, jamais un 500');
  assert.match(s, /import \{ sqlExecutor \} from '\.\.\/db\.js'/, 'la route utilise l\u2019exécuteur conforme');
  assert.match(s, /chantierProfitability\(sqlExecutor, org, id, rate\)/, 'rentabilité branchée sur sqlExecutor');
});

test('15.4.52 — moteur de gestion : PATCH de statut avec transitions fermées et journal', () => {
  const s = read('../src/services/chantiers.ts');
  assert.match(s, /export const CHANTIER_TRANSITIONS/, 'transitions exportées');
  assert.match(s, /active'\s*,\s*to: 'completed'/, 'active→completed');
  assert.match(s, /completed'\s*,\s*to: 'archived'/, 'completed→archived');
  assert.match(s, /completed'\s*,\s*to: 'active'/, 'réouverture');
  assert.match(s, /CHANTIER_TRANSITION_INVALID/, 'transition interdite = erreur explicite');
  assert.match(s, /export async function updateChantierStatus/, 'service de mise à jour');
  assert.match(s, /chantier_completed|chantier_archived|chantier_reopened/, 'événements de journal par transition');
  const r = read('../src/routes/chantiers.ts');
  assert.match(r, /app\.patch\('\/chantiers\/:id'/, 'route PATCH présente');
  assert.match(r, /allowed\.includes\(status\) \? status : null/, 'filtre de statut de liste validé côté serveur');
});

test('15.4.52 — moteur de calcul : reste à facturer, budget restant, encaissement, valorisation du temps', () => {
  const s = read('../src/services/chantiers.ts');
  assert.match(s, /restToInvoiceTtc: number \| null/);
  assert.match(s, /remainingBudgetTtc: number \| null/);
  assert.match(s, /collectedTtc: number/);
  assert.match(s, /laborValued: boolean/);
  assert.match(s, /invoice_payments p/, 'encaissement réel depuis les règlements (source de vérité)');
});

const computePath = existsSync(fileURLToPath(new URL('../dist/services/chantiers.js', import.meta.url)))
  ? fileURLToPath(new URL('../dist/services/chantiers.js', import.meta.url)) : false;

test('unitaire — indicateurs de gestion (golden)', { skip: !computePath }, async () => {
  const { computeChantierProfitability } = await import(computePath);
  const base = { quoteTotalHt: 10000, quoteTotalTtc: 12000, invoicedTotalHt: 6667, invoicedTotalTtc: 8000, collectedTtc: 5000, expensesTotalTtc: 4000, savTotalTtc: 1000, totalMinutes: 240, hourlyRateCents: 5000, vatRateBps: 2000 };
  const r = computeChantierProfitability(base);
  assert.equal(r.laborCostTtc, 240);
  assert.equal(r.costsTtc, 5240);
  assert.equal(r.restToInvoiceTtc, 4000);
  assert.equal(r.remainingBudgetTtc, 6760);
  assert.equal(r.collectionPct, 62.5);
  assert.equal(r.laborValued, true);
  assert.equal(r.alertLevel, 'none');
  assert.match(r.reasons.join(' '), /Reste à facturer/);
  assert.match(r.reasons.join(' '), /Encaissé à 62\.5/);
  // Sans devis : les indicateurs dépendants avouent n/a (null) — jamais 0 inventé.
  const noQuote = computeChantierProfitability({ ...base, quoteTotalHt: 0, quoteTotalTtc: 0 });
  assert.equal(noQuote.restToInvoiceTtc, null);
  assert.equal(noQuote.remainingBudgetTtc, null);
  // Sans facture : pas de taux de recouvrement.
  const noInvoice = computeChantierProfitability({ ...base, invoicedTotalTtc: 0 });
  assert.equal(noInvoice.collectionPct, null);
  // Temps non valorisé : le moteur le dit et le flag passe à false.
  const noRate = computeChantierProfitability({ ...base, hourlyRateCents: 0 });
  assert.equal(noRate.laborValued, false);
  assert.match(noRate.reasons.join(' '), /NON valorisée/);
  // Encaissement à zéro : raison explicite.
  const unpaid = computeChantierProfitability({ ...base, collectedTtc: 0 });
  assert.match(unpaid.reasons.join(' '), /Encaissé à 0/);
});

test('15.4.52 — authFetch envoie Content-Type application/json pour les corps texte (cause racine des 400 « nom requis »)', () => {
  const api = read('../../assets/js/core/api.js');
  assert.match(api, /options\.body&&!\(options\.body instanceof FormData\)&&!headers\.has\('Content-Type'\)\)headers\.set\('Content-Type','application\/json'\)/,
    'authFetch doit déclarer le Content-Type JSON (sinon Fastify ne parse pas le corps : r.body undefined → 400)');
  const ch = read('../../assets/js/pages/dash/chantiers.js');
  assert.match(ch, /function refreshList/, 'liste rafraîchie sans re-rendu récursif (fin de la boucle bind→loadList→bind)');
  assert.ok(!/loadList\(\)\.then\(\(\)/.test(ch), 'plus de re-rendu récursif après chargement de liste');
});

test('15.4.52 — comptes catalogue : ajouté / déjà présent / total, détection depuis les documents réels', () => {
  const s = read('../src/services/catalog-detection.ts');
  assert.match(s, /export function splitSuggested/, 'répartition pure ajouté/déjà présent');
  assert.match(s, /export function normalizeLabel/, 'comparaison insensible casse/accents');
  assert.match(s, /quote_items/, 'détection automatique depuis les libellés réellement émis');
  assert.match(s, /alreadyPresent/, 'compte de doublons');
  assert.match(s, /totals/, 'totaux après enrichissement');
  assert.match(s, /emitCatalogEnrichedEvent/, 'événement de journal aligné sur les mêmes chiffres');
  const b = read('../src/routes/business.ts');
  assert.match(b, /seedCatalogFromProfile\(org,id,profile,\{detectFromHistory:true\}\)/, 'seed-catalog passe par le service dédié');
  assert.match(b, /seedCatalogFromProfile\(r\.auth!\.organizationId,id,profile,\{detectFromHistory:false\}\)/, 'la création d\u2019activité amorce aussi le catalogue (dédoublonné)');
  assert.match(b, /alreadyPresent:outcome\.alreadyPresent,totals:outcome\.totals/, 'réponse exhaustive pour l\u2019interface');
  const cat = read('../../assets/js/pages/dash/catalog.js');
  assert.match(cat, /déjà présents/, 'le toast annonce aussi les doublons ignorés');
  assert.match(cat, /catalogue désormais/, 'et les totaux réels du catalogue');
});

// ── Unitaires purs — détection automatique des données ──────────────────────────────────
const detectPath = existsSync(fileURLToPath(new URL('../dist/services/catalog-detection.js', import.meta.url)))
  ? fileURLToPath(new URL('../dist/services/catalog-detection.js', import.meta.url)) : false;

test('unitaire — splitSuggested : casse, accents, doublons et compte exact', { skip: !detectPath }, async () => {
  const { splitSuggested } = await import(detectPath);
  const existing = new Set(['reparation de fuite', 'mitigeur']);
  const r = splitSuggested(['Réparation de fuite', 'réparation de fuite', 'Mitigeur', 'Pose de siphon', '  ', ''], existing);
  assert.deepEqual(r.toAdd, ['Pose de siphon']);
  assert.deepEqual(r.alreadyPresent, ['Réparation de fuite', 'Mitigeur']);
  const none = splitSuggested([], new Set());
  assert.deepEqual(none.toAdd, []);
  assert.deepEqual(none.alreadyPresent, []);
});

test('unitaire — normalizeLabel : accents, casse et espaces', { skip: !detectPath }, async () => {
  const { normalizeLabel } = await import(detectPath);
  assert.equal(normalizeLabel('Réparation de  FUITE '), 'reparation de fuite');
  assert.equal(normalizeLabel('Mécanisme de chasse d\u2019eau'), 'mecanisme de chasse d\u2019eau');
  assert.equal(normalizeLabel(null), '');
});
