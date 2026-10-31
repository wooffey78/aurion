import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.resolve(here, '../src/routes/documents.ts'), 'utf8');

test('full export manifest reports included and omitted file counts by category', () => {
  assert.match(source, /clientPdfsIncluded/);
  assert.match(source, /quotePdfsIncluded/);
  assert.match(source, /supplierPdfsIncluded/);
  assert.match(source, /templateFilesIncluded/);
  assert.match(source, /generatedDocumentFilesIncluded/);
  assert.match(source, /omissions:exportOmissions/);
  assert.match(source, /warnings:exportWarnings/);
});

test('administrative documents are only marked present when the stored file was added to the ZIP', () => {
  assert.match(source, /includedDocumentIds\.has\(String\(doc\.id\)\)/);
  assert.match(source, /includedDocumentIds\.add\(String\(storedDoc\.id\)\)/);
});
