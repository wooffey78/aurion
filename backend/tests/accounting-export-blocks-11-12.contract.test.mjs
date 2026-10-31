import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const documents = readFileSync(path.resolve(here, '../src/routes/documents.ts'), 'utf8');
const accounting = readFileSync(path.resolve(here, '../src/services/accounting-report.ts'), 'utf8');

test('duplicate normalized quote and invoice PDF names are disambiguated without changing the first name', () => {
  assert.match(documents, /const quotePdfArchiveNames=new Set<string>\(\)/);
  assert.match(documents, /if\(quotePdfArchiveNames\.has\(archiveName\)\)/);
  assert.match(documents, /quotePdfFilenameCollisions\+\+/);
  assert.match(documents, /quotePdfFilenameCollisions,suppliers:suppliers\.length/);
  assert.match(documents, /archiveName=\`\$\{prefix\}-\$\{safeId\}\.pdf\`/);
});

test('CSV formula guard recognizes whitespace and BOM before formula markers', () => {
  assert.match(accounting, /\[\\s\\uFEFF\]\*/);
  assert.match(accounting, /textFields\.has\(index\)\?escText\(value\):esc\(value\)/);
});
