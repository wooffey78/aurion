// 15.4.50 — Fiabilité de paiement (B3) : statistiques déterministes sur l'historique RÉEL,
// barème documenté, aucune prédiction. Modèle de tests purs des moteurs v49.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
process.env.DATABASE_URL ||= 'postgres://x:y@127.0.0.1:1/z';
process.env.JWT_SECRET ||= 'x'.repeat(40);
const dist = p => existsSync(fileURLToPath(new URL(p, import.meta.url))) ? fileURLToPath(new URL(p, import.meta.url)) : false;
const path = dist('../dist/services/payment-reliability.js');

const obs = (issued, due, settled) => ({ totalTtc: 100, issuedAt: issued, dueAt: due, settledAt: settled });

test('unitaire — client toujours à l\u2019heure : score maximal, bande « fiable », raisons explicites', { skip: !path }, async () => {
  const { computePaymentReliability } = await import(path);
  const r = computePaymentReliability([
    obs('2026-01-01', '2026-01-31', '2026-01-05'),
    obs('2026-02-01', '2026-02-28', '2026-02-04'),
    obs('2026-03-01', '2026-03-31', '2026-03-05'),
  ]);
  assert.equal(r.settledCount, 3);
  assert.equal(r.lateRate, 0);
  assert.equal(r.band, 'fiable');
  assert.ok(r.score >= 95, `score ${r.score}`);
  assert.ok(r.reasons.some(x => x.includes('+10 points de stabilité')));
});

test('unitaire — retards systématiques : pénalités cumulées, bande dégradée, médiane robuste', { skip: !path }, async () => {
  const { computePaymentReliability } = await import(path);
  const r = computePaymentReliability([
    obs('2026-01-01', '2026-01-31', '2026-03-15'), // 59 j après émission, ~43 j de retard
    obs('2026-02-01', '2026-02-28', '2026-04-10'), // ~41 j de retard
    obs('2026-03-01', '2026-03-31', '2026-05-10'), // ~40 j de retard
  ]);
  assert.equal(r.lateRate, 1);
  assert.ok(r.score <= 40, `score ${r.score}`);
  assert.equal(r.band, 'retards-systematiques');
  assert.ok(r.averageDelayDays >= 60 && r.averageDelayDays <= 80, `délai moyen ${r.averageDelayDays}`);
});

test('unitaire — aucune facture réglée : « inconnu », jamais une supposition', { skip: !path }, async () => {
  const { computePaymentReliability } = await import(path);
  const r = computePaymentReliability([obs('2026-10-01', '2026-11-30', null)]);
  assert.equal(r.score, null);
  assert.equal(r.band, 'inconnu');
  assert.match(r.reasons[0], /inconnue/);
});
