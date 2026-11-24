import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync, copyFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATABASE_URL ||= 'postgres://x:y@127.0.0.1:1/z';
process.env.JWT_SECRET ||= 'x'.repeat(40);

const modelPath = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\/?)/, '/')), '../assets/engine/aurion-moteur-calcul.xlsx');
const mappingPath = path.resolve(path.dirname(modelPath), 'engine-mapping.json');
const modelExists = existsSync(modelPath);
const soffice = ['/usr/bin/soffice', '/usr/bin/libreoffice', '/usr/local/bin/soffice'].some(p => existsSync(p))
  || (process.env.AURION_SOFFICE_PATH && existsSync(process.env.AURION_SOFFICE_PATH));

const { calculate, CalcEngineError, getCalculationStatus } = await import('../dist/services/calc-engine/engine.js');

test('classeur absent : erreur explicite WORKBOOK_MISSING, jamais de valeur par défaut', async t => {
  if (!modelExists) return t.skip('modèle absent dans cet environnement');
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'aurion-missing-'));
  process.env.AURION_CALC_MODEL_PATH = path.join(tmp, 'introuvable.xlsx');
  await assert.rejects(() => calculate({ IN_DOC_TARGET_TTC: 100 }), (error) => {
    assert.ok(error instanceof CalcEngineError);
    assert.equal(error.code, 'WORKBOOK_MISSING');
    return true;
  });
  delete process.env.AURION_CALC_MODEL_PATH;
});

test('classeur corrompu : erreur explicite WORKBOOK_CORRUPT', async t => {
  if (!modelExists) return t.skip('modèle absent dans cet environnement');
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'aurion-corrupt-'));
  const corrupt = path.join(tmp, 'corrompu.xlsx');
  writeFileSync(corrupt, Buffer.from('ceci n\'est pas un classeur', 'utf8'));
  process.env.AURION_CALC_MODEL_PATH = corrupt;
  await assert.rejects(() => calculate({ IN_DOC_TARGET_TTC: 100 }), (error) => {
    assert.ok(error instanceof CalcEngineError);
    assert.equal(error.code, 'WORKBOOK_CORRUPT');
    return true;
  });
  delete process.env.AURION_CALC_MODEL_PATH;
});

test('version de classeur incompatible : erreur explicite WORKBOOK_INCOMPATIBLE', async t => {
  if (!modelExists) return t.skip('modèle absent dans cet environnement');
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'aurion-incompat-'));
  copyFileSync(modelPath, path.join(tmp, 'model.xlsx'));
  const mapping = JSON.parse((await import('node:fs')).readFileSync(mappingPath, 'utf8'));
  mapping.engineRequires = '9.9.9';
  const incompatibleMapping = path.join(tmp, 'engine-mapping.json');
  writeFileSync(incompatibleMapping, JSON.stringify(mapping));
  process.env.AURION_CALC_MODEL_PATH = path.join(tmp, 'model.xlsx');
  process.env.AURION_CALC_MAPPING_PATH = incompatibleMapping;
  await assert.rejects(() => calculate({}), (error) => {
    assert.ok(error instanceof CalcEngineError);
    assert.equal(error.code, 'WORKBOOK_INCOMPATIBLE');
    return true;
  });
  delete process.env.AURION_CALC_MODEL_PATH;
  delete process.env.AURION_CALC_MAPPING_PATH;
});

test('entrée inconnue : erreur explicite UNKNOWN_INPUT (protection du contrat de mapping)', async t => {
  if (!modelExists || !soffice) return t.skip('modèle ou LibreOffice absent');
  await assert.rejects(() => calculate({ IN_DOMAINE_INVENTE: 42 }), (error) => {
    assert.ok(error instanceof CalcEngineError);
    assert.equal(error.code, 'UNKNOWN_INPUT');
    return true;
  });
});

test('entrée non numérique : erreur explicite INVALID_INPUT (comme le moteur applicatif)', async t => {
  if (!modelExists || !soffice) return t.skip('modèle ou LibreOffice absent');
  await assert.rejects(() => calculate({ IN_DOC_PART_COST: 'abc' }), (error) => {
    assert.ok(error instanceof CalcEngineError);
    assert.equal(error.code, 'INVALID_INPUT');
    return true;
  });
});

test('statut du moteur : diagnostic complet sans lancer de calcul', async t => {
  const status = await getCalculationStatus();
  assert.equal(typeof status.engineVersion, 'string');
  assert.equal(status.modelPath.includes('aurion-moteur-calcul.xlsx'), true);
  assert.equal(['legacy', 'dual', 'xlsx'].includes(status.mode), true);
  if (modelExists) {
    assert.equal(status.workbookPresent, true);
    assert.ok(status.workbookVersion);
    assert.equal(status.engineRequires, status.engineVersion === '1.0.0' ? '1.0.0' : status.engineRequires);
  }
});
