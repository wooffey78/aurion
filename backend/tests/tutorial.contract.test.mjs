import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFileSync(path.join(root, file), 'utf8');

test('le tutoriel Aurion est facultatif, accessible et relançable depuis l’accueil', () => {
  const home = read('assets/js/pages/dash/other.js');
  const tutorial = read('assets/js/pages/dash/tutorial.js');
  const css = read('assets/css/app.css');
  assert.match(home, /id="start-aurion-guided-tour"/);
  assert.match(home, /openAurionTutorial/);
  assert.match(tutorial, /aria-modal="true"/);
  assert.match(tutorial, /Passer le tutoriel/);
  assert.match(tutorial, /aurion\.tutorial\.completed\.v1/);
  assert.match(tutorial, /event\.key === "Escape"/);
  assert.match(tutorial, /aurion-tour-previous/);
  assert.match(css, /\.aurion-tour-dialog/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});
