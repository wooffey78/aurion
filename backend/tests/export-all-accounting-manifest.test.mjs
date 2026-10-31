import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.resolve(here, '../src/routes/documents.ts'), 'utf8');

test('full ZIP export discloses whether the accounting PDF was included', () => {
  assert.match(source, /accountingReportPdfIncluded/);
  assert.match(source, /accountingReportYear/);
  assert.match(source, /warnings:exportWarnings/);
  assert.match(source, /Accounting PDF omitted from data export/);
});
