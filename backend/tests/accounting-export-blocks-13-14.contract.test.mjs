import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const documents = readFileSync(path.resolve(here, '../src/routes/documents.ts'), 'utf8');
const business = readFileSync(path.resolve(here, '../src/routes/business.ts'), 'utf8');

test('accounting summary uses the same bounded reporting year as the exports', () => {
  const start = business.indexOf("app.get('/accounting/summary'");
  assert.ok(start >= 0, 'accounting summary route should exist');
  const route = business.slice(start, business.indexOf("\n  });", start));
  assert.match(route, /Number\.isInteger\(requestedYear\)&&requestedYear>=1900&&requestedYear<=2100/);
});

test('full export manifest states whether the archive is complete or partial', () => {
  assert.match(documents, /const exportHasOmissions=Object\.values\(exportOmissions\)\.some\(count=>count>0\)\|\|!accountingReportPdfIncluded/);
  assert.match(documents, /const exportCompleteness=exportHasOmissions\?'partial':'complete'/);
  assert.match(documents, /completion:\{status:exportCompleteness,hasOmissions:exportHasOmissions\}/);
});
