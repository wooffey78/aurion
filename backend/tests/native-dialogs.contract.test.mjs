import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const jsRoot = path.join(root, 'assets', 'js');

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (/\.(?:js|mjs)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const files = [...walk(jsRoot), path.join(root, 'sw.js')].sort();

// Le cahier des charges impose les composants Aurion (askConfirm, askFields,
// confirmDelete, toast) : aucun alert/confirm/prompt natif du navigateur.
// Les méthodes homonymes (window.__aurionDeferredInstall.prompt, askConfirm,
// confirmDelete) ne sont pas des appels natifs et restent autorisées.
const nativeCall = /(?<![.\w$])(?:window\s*\.\s*)?(alert|confirm|prompt)\s*\(/g;

test('aucune alerte, confirmation ou saisie native du navigateur dans le front-end', () => {
  const offenders = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(nativeCall)) {
      const line = source.slice(0, match.index).split('\n').length;
      offenders.push(`${path.relative(root, file)}:${line} → ${match[0].trim()}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'Utilisez les composants Aurion (askConfirm, askFields, confirmDelete, toast) : ' + offenders.join(' | '),
  );
});

test('les dialogues Aurion de confirmation et de saisie sont exportés et réellement utilisés', () => {
  const core = readFileSync(path.join(jsRoot, 'pages', 'dash', 'core.js'), 'utf8');
  assert.match(core, /export function askConfirm\(/);
  assert.match(core, /export function askFields\(/);
  assert.match(core, /role="dialog" aria-modal="true"/);
  const other = readFileSync(path.join(jsRoot, 'pages', 'dash', 'other.js'), 'utf8');
  assert.match(other, /askFields\(\{title:'Modifier l’adresse d’intervention'/);
  assert.match(other, /askConfirm\(\{title:'Archiver cette adresse \?'/);
  const dashboard = readFileSync(path.join(jsRoot, 'pages', 'dashboard.js'), 'utf8');
  assert.match(dashboard, /askConfirm\(\{title:'Remplacer le brouillon synchronisé \?'/);
});
