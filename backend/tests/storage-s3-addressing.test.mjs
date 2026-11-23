import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/services/storage.ts', import.meta.url), 'utf8');

test('Neon S3 expose le path-style sans modifier l’hôte du endpoint', () => {
  assert.ok(source.includes('AURION_S3_FORCE_PATH_STYLE'));
  assert.ok(source.includes('if (config.forcePathStyle)'));
  assert.ok(source.includes('url.pathname = `/${encodeKey(config.bucket)}/${encodeKey(key)}`;'));
  assert.ok(source.includes('Neon Object Storage requires path-style addressing'));
});

test('OVH S3 conserve l’adressage virtual-host par défaut', () => {
  assert.ok(source.includes("AURION_S3_FORCE_PATH_STYLE || ''"));
  assert.ok(source.includes('url.hostname = `${config.bucket}.${url.hostname}`;'));
  assert.ok(source.includes('OVHcloud supports virtual-host bucket addressing'));
});
