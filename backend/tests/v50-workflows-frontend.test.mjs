// 15.4.50 — Workflows étendus (A5) : nouveaux déclencheurs, préavis de garantie piloté par la
// règle, simulation à blanc sur fenêtre historique ; interface graphiques et visibilité métier.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
process.env.DATABASE_URL ||= 'postgres://x:y@127.0.0.1:1/z';
process.env.JWT_SECRET ||= 'x'.repeat(40);
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const dist = p => existsSync(fileURLToPath(new URL(p, import.meta.url))) ? fileURLToPath(new URL(p, import.meta.url)) : false;
const wfPath = dist('../dist/services/workflows.js');

test('service workflows : quatre déclencheurs additionnels avec libellés, préavis de garantie', () => {
  const s = read('../src/services/workflows.ts');
  for (const t of ['quote_accepted', 'intervention_completed', 'warranty_expiring', 'document_shared']) {
    assert.match(s, new RegExp(`'${t}'`));
  }
  assert.match(s, /quote_accepted: 'Devis accepté/);
  assert.match(s, /warranty_expiring: 'Garantie arrivant à expiration'/);
  assert.match(s, /expiringInDays/);
  assert.match(s, /simulateRuleWindow/);
  // La simulation n'écrit rien : elle n'appelle ni runRule ni insert.
  const sim = s.slice(s.indexOf('export async function simulateRuleWindow'));
  assert.doesNotMatch(sim, /insert into/);
  assert.match(sim, /windowDays/);
});

test('routes automation : dry-run en lecture seule sur fenêtre (défaut 90 jours)', () => {
  const routes = read('../src/routes/automation.ts');
  assert.match(routes, /\/automation\/rules\/:id\/dry-run/);
  assert.match(routes, /simulateRuleWindow/);
  assert.match(routes, /windowDays/);
  assert.match(routes, /Lecture seule/);
});

test('routes agenda : occurrences dérivées en lecture seule (aucun rendez-vous dupliqué)', () => {
  const routes = read('../src/routes/agenda.ts');
  assert.match(routes, /app\.get\('\/agenda\/occurrences'/);
  assert.match(routes, /parseRecurrenceRule/);
  assert.match(routes, /aucun rendez-vous dupliqué en base/);
});

test('unitaire — configuration des nouveaux déclencheurs : préavis borné, réactions pures acceptées', { skip: !wfPath }, async () => {
  const { normalizeRuleConfig, WorkflowError, TRIGGER_LABELS } = await import(wfPath);
  for (const t of ['quote_accepted', 'intervention_completed', 'document_shared']) {
    const cfg = normalizeRuleConfig(t, { actions: [{ type: 'create_task', title: 'Tâche {client}' }] });
    assert.equal(cfg.actions.length, 1);
  }
  const w = normalizeRuleConfig('warranty_expiring', { expiringInDays: 21, actions: [{ type: 'journal_alert', title: 'Garantie {warranty} expire le {endDate}' }] });
  assert.equal(w.overdueDays, 21);
  assert.throws(() => normalizeRuleConfig('warranty_expiring', { expiringInDays: 0, actions: [{ type: 'journal_alert', title: 'x' }] }), WorkflowError);
  assert.throws(() => normalizeRuleConfig('warranty_expiring', { expiringInDays: 400, actions: [{ type: 'journal_alert', title: 'x' }] }), WorkflowError);
  assert.equal(TRIGGER_LABELS.document_shared.length > 0, true);
});

test('interface : charts.js quatre types, barre de commutation, refus honnête des types mensongers', () => {
  const charts = read('../../assets/js/core/charts.js');
  for (const t of ['bar', 'line', 'candle', 'pie']) assert.match(charts, new RegExp(`id: '${t}'`));
  assert.match(charts, /chartToolbar/);
  assert.match(charts, /bindChartToolbar/);
  assert.match(charts, /Un camembert ne représente pas une série temporelle/);
  assert.match(charts, /pas des bougies financières/);
  assert.doesNotMatch(charts, /import\s+.*from\s+['"][a-z@][^']*node_modules/); // aucune dépendance externe
  const nav = read('../../assets/js/core/navigation.js');
  assert.match(nav, /\{id:'chantiers',label:'Chantiers',icon:'▣'\}/);
  // 15.4.59 — la section Chantiers redevient toujours visible (demande utilisateur) :
  // plus aucune règle de masquage par profil pour cette entrée de menu.
  assert.doesNotMatch(nav, /features\.features\.chantiers===false/);
  const dash = read('../../assets/js/pages/dashboard.js');
  assert.match(dash, /import\{chantiers\}from'\.\/dash\/chantiers\.js'/);
  assert.match(dash, /loadProfileFeatures/);
  assert.match(dash, /features:cachedFlags\(\)/);
  const other = read('../../assets/js/pages/dash/other.js');
  assert.match(other, /home-visual-analysis/);
  assert.match(other, /chartToolbar\('chart-home-ca'/);
  const pf = read('../../assets/js/core/profile-features.js');
  assert.match(pf, /Repli conservateur/);
  assert.match(pf, /chantiers: true/);
  assert.match(pf, /loadProfileFeatures/);
});
