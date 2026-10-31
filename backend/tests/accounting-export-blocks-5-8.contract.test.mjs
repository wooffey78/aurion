import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const documents = readFileSync(path.resolve(here, '../src/routes/documents.ts'), 'utf8');
const accounting = readFileSync(path.resolve(here, '../src/services/accounting-report.ts'), 'utf8');

test('CSV export neutralizes formula prefixes only in textual columns', () => {
  assert.match(accounting, /const escText=/);
  assert.match(accounting, /const textFields=new Set\(\[0,1,2,3,4,15,16,20\]\)/);
  assert.match(accounting, /textFields\.has\(index\)\?escText\(value\):esc\(value\)/);
});

test('full ZIP export bounds the accounting report year', () => {
  assert.match(documents, /requestedYear>=1900&&requestedYear<=2100/);
});

test('full ZIP export records actual PDF and stored-file inclusion', () => {
  assert.match(documents, /clientPdfsIncluded\+\+/);
  assert.match(documents, /quotePdfsIncluded\+\+/);
  assert.match(documents, /supplierPdfsIncluded\+\+/);
  assert.match(documents, /includedDocumentIds\.has\(String\(row\.id\)\)/);
  assert.match(documents, /omissions:exportOmissions,warnings:exportWarnings/);
});

test('full ZIP export rejects unsafe archive paths rather than rewriting them', () => {
  assert.match(documents, /normalizedName\.startsWith\('\/'\)/);
  assert.match(documents, /part==='\.\.'/);
});

test('15.3.20 export does not restore removed onboarding or visual-identity modules', () => {
  assert.doesNotMatch(documents, /identite-visuelle\.zip|brandBundleReadme|onboarding_journeys/);
});
