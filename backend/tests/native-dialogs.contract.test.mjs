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
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/gm, '$1');
}
const files = [...walk(jsRoot), path.join(root, 'sw.js')].sort();
const nativeCall = /(?<![.\w$])(?:window\s*\.\s*)?(alert|confirm|prompt)\s*\(/g;

test('aucun appel natif alert/confirm/prompt ne subsiste dans le frontend', () => {
  const offenders = [];
  for (const file of files) {
    const source = stripComments(readFileSync(file, 'utf8'));
    for (const match of source.matchAll(nativeCall)) {
      const line = source.slice(0, match.index).split('\n').length;
      offenders.push(`${path.relative(root, file)}:${line} → ${match[0].trim()}`);
    }
  }
  assert.deepEqual(offenders, [], 'Utilisez les dialogues Aurion : ' + offenders.join(' | '));
});

test('les formulaires et confirmations métier utilisent les composants Aurion', () => {
  const core = readFileSync(path.join(jsRoot, 'pages', 'dash', 'core.js'), 'utf8');
  const other = readFileSync(path.join(jsRoot, 'pages', 'dash', 'other.js'), 'utf8');
  const dashboard = readFileSync(path.join(jsRoot, 'pages', 'dashboard.js'), 'utf8');
  assert.match(core, /export function askConfirm\(/);
  assert.match(other, /modalForm\('Modifier l’adresse d’intervention'/);
  assert.match(other, /askConfirm\(\{title:'Archiver cette adresse/);
  assert.match(dashboard, /askConfirm\(/);
});
