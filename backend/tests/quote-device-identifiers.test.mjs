import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
const frontend = read('assets/js/pages/dash/quote.js');
const routes = read('backend/src/routes/business.ts');
const renderer = read('backend/src/services/document-renderer.ts');
const layout = read('backend/src/services/document-layout.ts');
const migration = read('backend/migrations/064_quote_device_identifiers.sql');

test('les références appareil sont facultatives et limitées aux profils de réparation électronique', () => {
  assert.ok(frontend.includes("deviceFieldsEnabled=['smartphone-repair','computer-repair']"));
  assert.ok(frontend.includes('id="deviceSerialNumber"'));
  assert.ok(frontend.includes('id="deviceImei"'));
  assert.ok(frontend.includes("serial_number:$('#deviceSerialNumber')"));
  assert.ok(frontend.includes("imei:$('#deviceImei')"));
  assert.ok(frontend.includes("serialNumber:$('#deviceSerialNumber')"));
});

test('les références appareil sont persistées sur le devis ou la facture sans écraser les champs absents d’un PATCH', () => {
  assert.ok(routes.includes("imei: z.string().max(80).nullable().optional()"));
  assert.ok(routes.includes("serialNumber: z.string().max(160).nullable().optional()"));
  assert.ok(routes.includes('calculation_version,imei,serial_number'));
  assert.ok(routes.includes('imei=case when $39::boolean then $40::varchar(80) else imei end'));
  assert.ok(routes.includes('serial_number=case when $41::boolean then $42::varchar(160) else serial_number end'));
  assert.ok(migration.includes('ADD COLUMN IF NOT EXISTS imei varchar(80)'));
  assert.ok(migration.includes('ADD COLUMN IF NOT EXISTS serial_number varchar(160)'));
});

test('les documents natifs et les modèles personnalisés prennent en charge le numéro de série et l’IMEI', () => {
  assert.ok(renderer.includes("device:{serialNumber:x.serial_number||'',imei:x.imei||''}"));
  assert.ok(renderer.includes("SERIAL_NUMBER:x.serial_number||''"));
  assert.ok(renderer.includes("IMEI:x.imei||''"));
  assert.ok(renderer.includes("'SERIAL_NUMBER','IMEI'"));
  assert.ok(layout.includes('N° de série :'));
  assert.ok(layout.includes('IMEI :'));
  assert.ok(layout.includes("serialNumber: '{{SERIAL_NUMBER}}'"));
  assert.ok(layout.includes("imei: '{{IMEI}}'"));
});
