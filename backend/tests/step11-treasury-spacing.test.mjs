import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const other = fs.readFileSync(path.join(root, 'assets/js/pages/dash/other.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/css/app.css'), 'utf8');

assert.match(other, /<section class="panel accounting-treasury-panel"><div class="section-title"><h2>Trésorerie prévisionnelle<\/h2>/);
assert.match(css, /\.dashboard-shell #view > \.accounting-treasury-panel\{margin-top:12px\}/);
