// 15.4.51 (PROMPT A4/A5/A6) — supervision opérationnelle : contrat de source des branchements
// de lettres mortes, d'alerte quotidienne, d'enrichissement /health et du script de sauvegarde
// nocturne. Contrat de source (gabarit legal-publication-version) : exécutable sans PostgreSQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const health = read('../src/routes/health.ts');
const scheduler = read('../src/services/scheduler.ts');
const admin = read('../src/routes/admin.ts');
const config = read('../src/config.ts');
const envExample = read('../.env.example');
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

test('A4 — /health expose uptime, compteur de lettres mortes et dernière sauvegarde (tolérant aux pannes)', () => {
  assert.match(health, /uptimeSeconds/);
  assert.match(health, /outboxDeadLettered/);
  assert.match(health, /lastBackupAt/);
  assert.match(health, /AURION_BACKUP_LOG_PATH/);
  assert.match(health, /AURION_ADMIN_DATABASE_URL/);
  // Aucun enrichissement ne doit faire échouer /health : les lectures sont tolérantes.
  assert.match(health, /catch\{return \{ lastBackupAt: null \}\}/);
});

test('A4 — alerte quotidienne des lettres mortes : dé-dupliquée par jour, via le mailer de plateforme', () => {
  assert.match(scheduler, /AURION_OPS_ALERT_EMAIL/);
  assert.match(scheduler, /lastDeadLetterAlertDay/);
  assert.match(scheduler, /status='dead_lettered'/);
  assert.match(scheduler, /sendConfiguredPlatformMail/);
  assert.match(scheduler, /platformMailerConfigured/);
});

test('A4 — route admin de supervision transverse (lecture seule, rejeu conservé côté organisant)', () => {
  assert.match(admin, /app\.get\('\/admin\/outbox\/dead-lettered'/);
  assert.match(admin, /where e\.status='dead_lettered'/);
  assert.match(read('../src/routes/outbox.ts'), /\/journal\/outbox\/:id\/replay/);
});

test('A5/A6 — variables d\u2019exploitation déclarées : config, .env.example, blueprint Render', () => {
  assert.match(config, /AURION_OPS_ALERT_EMAIL:z\.string\(\)\.email\(\)\.default\(''\)/);
  assert.match(config, /AURION_BACKUP_LOG_PATH:z\.string\(\)\.default\(''\)/);
  assert.match(envExample, /AURION_OPS_ALERT_EMAIL=/);
  const render = read('../../render.yaml');
  assert.match(render, /key: AURION_OPS_ALERT_EMAIL/);
});

test('A5 — script de sauvegarde nocturne présent : enveloppe backup-db, journal daté, copie secondaire', () => {
  const script = read('../scripts/backup-nightly.mjs');
  assert.match(script, /backup-db\.mjs/);
  assert.match(script, /lastSuccessAt/);
  assert.match(script, /sha256/);
  assert.match(script, /--secondary/);
  assert.match(script, /AURION_BACKUP_LOG_PATH/);
  assert.ok(existsSync(new URL('../scripts/backup-nightly.mjs', import.meta.url)), 'le script doit exister dans backend/scripts');
});

test('A2 — recette PostgreSQL réelle : test d\u2019intégration présent et correctement gated', () => {
  const recipe = read('./recipe-postgres-15.4.51.integration.mjs');
  assert.match(recipe, /AURION_PG_RECIPE/);
  assert.match(recipe, /DATABASE_URL/);
  // Sans gating explicite, la suite complète échouerait sans PostgreSQL : le skip est obligatoire.
  assert.match(recipe, /skip/);
});
