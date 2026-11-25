// 15.4.50 — Chantiers (B1) : migration 110 additive, rentabilité réelle déterministe, dérive
// devis→coûts avant facturation, routes enregistrées, interface branchée. Modèle v49.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
process.env.DATABASE_URL ||= 'postgres://x:y@127.0.0.1:1/z';
process.env.JWT_SECRET ||= 'x'.repeat(40);
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('migration 110 : chantiers et liens additifs, RLS et réplication', () => {
  const m = read('../migrations/110_chantiers.sql');
  assert.match(m, /create table if not exists chantiers/);
  assert.match(m, /create table if not exists chantier_links/);
  assert.match(m, /unique\(organization_id, chantier_id, object_type, object_id\)/);
  assert.match(m, /'quote','appointment','intervention','sav_case','time_session','expense','document'/);
  assert.match(m, /policy tenant_isolation on public\.chantiers/);
  assert.match(m, /aurion_sync_chantiers_trigger/);
});

test('migration 111 : emplacements de stock — dimension portée par les mouvements, aucune quantité parallèle', () => {
  const m = read('../migrations/111_stock_locations.sql');
  assert.match(m, /create table if not exists stock_locations/);
  assert.match(m, /alter table stock_movements add column if not exists location_id uuid/);
  assert.match(m, /policy tenant_isolation on public\.stock_locations/);
});

// ── Unitaires purs (aucune base requise) ────────────────────────────────────────────────
const dist = p => existsSync(fileURLToPath(new URL(p, import.meta.url))) ? fileURLToPath(new URL(p, import.meta.url)) : false;
const chantiersPath = dist('../dist/services/chantiers.js');

test('unitaire — rentabilité réelle : coûts, marge, dérive et alertes honnêtes', { skip: !chantiersPath }, async () => {
  const { computeChantierProfitability } = await import(pathToFileURL(chantiersPath).href);
  const base = { quoteTotalHt: 10000, quoteTotalTtc: 12000, invoicedTotalHt: 0, invoicedTotalTtc: 0, expensesTotalTtc: 4000, savTotalTtc: 1000, totalMinutes: 240, hourlyRateCents: 5000, vatRateBps: 2000 };
  // Main-d'œuvre : 4 h × 50 € HT = 200 € HT → 240 € TTC ; coûts = 4000 + 1000 + 240 = 5240.
  const r = computeChantierProfitability(base);
  assert.equal(r.costsTtc, 5240);
  assert.equal(r.laborCostTtc, 240);
  assert.equal(r.driftVsQuotePct, Math.round(5240 / 12000 * 1000) / 10);
  assert.equal(r.alertLevel, 'none'); // 43,7 % — sous le seuil de surveillance (80 %)
  const watch = computeChantierProfitability({ ...base, expensesTotalTtc: 9000 });
  assert.equal(watch.alertLevel, 'watch');
  assert.match(watch.reasons.join(' '), /surveiller la fin d'ouvrage/);
  // Dérive : coûts au-delà du devis → alerte « drift » avec raison explicite.
  const drift = computeChantierProfitability({ ...base, expensesTotalTtc: 12000 });
  assert.equal(drift.alertLevel, 'drift');
  assert.match(drift.reasons.join(' '), /dépassent le devis accepté/);
  // Temps non valorisé : le rapport le dit, jamais un coût inventé.
  const noRate = computeChantierProfitability({ ...base, hourlyRateCents: 0 });
  assert.match(noRate.reasons.join(' '), /NON valorisée/);
  // Aucun devis rattaché : la dérive est avouée incalculable, pas devinée.
  const noQuote = computeChantierProfitability({ ...base, quoteTotalTtc: 0, quoteTotalHt: 0 });
  assert.equal(noQuote.driftVsQuotePct, null);
  assert.match(noQuote.reasons.join(' '), /Aucun devis accepté rattaché/);
});

test('routes et shell : rentabilité scopée, dérive-route, enregistrement app.ts, écran chantiers', () => {
  const routes = read('../src/routes/chantiers.ts');
  assert.match(routes, /app\.get\('\/chantiers\/:id\/profitability'/);
  assert.match(routes, /app\.post\('\/deviation-check'/);
  const app = read('../src/app.ts');
  assert.match(app, /import \{ chantierRoutes, deviationRoutes \} from "\.\/routes\/chantiers\.js"/);
  assert.match(app, /await app\.register\(chantierRoutes\)/);
  const fe = read('../../assets/js/pages/dash/chantiers.js');
  assert.match(fe, /profitability/);
  assert.match(fe, /chartToolbar/); // représentation au choix
});
