import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const accounting = readFileSync(path.resolve(here, '../src/services/accounting-report.ts'), 'utf8');
const documents = readFileSync(path.resolve(here, '../src/routes/documents.ts'), 'utf8');

test('CSV protects text cells against spreadsheet formula injection without rewriting numeric values', () => {
  assert.match(accounting, /const escText=/);
  assert.match(accounting, /textFields=new Set\(\[0,1,2,3,4,15,16,20\]\)/);
  assert.match(accounting, /textFields\.has\(index\)\?escText\(value\):esc\(value\)/);
  assert.match(accounting, /\^\[\\t\\r\\n \]\*\[=\+\\-@\]/);
});

test('full data export reports actual file inclusion and omissions', () => {
  assert.match(documents, /formatVersion:4/);
  assert.match(documents, /clientPdfsIncluded/);
  assert.match(documents, /quotePdfsIncluded/);
  assert.match(documents, /supplierPdfsIncluded/);
  assert.match(documents, /templateFilesExpected/);
  assert.match(documents, /generatedDocumentFilesExpected/);
  assert.match(documents, /omissions:exportOmissions/);
  assert.match(documents, /warnings:exportWarnings/);
});

test('stored document index only marks bytes actually added to the ZIP', () => {
  assert.match(documents, /includedDocumentIds\.has\(String\(row\.id\)\)/);
  assert.match(documents, /includedDocumentIds\.add\(String\(d\.id\)\)/);
});

test('stored-file archive paths are rejected if they could escape the intended tree', () => {
  assert.match(documents, /Unsafe archive entry path rejected/);
  assert.match(documents, /normalizedName\.startsWith\('\/'\)/);
});

test('accounting PDF export validates year and records omission', () => {
  assert.match(documents, /requestedYear>=1900&&requestedYear<=2100/);
  assert.match(documents, /accountingReportPdfIncluded=true/);
  assert.match(documents, /Accounting PDF omitted from data export/);
});
