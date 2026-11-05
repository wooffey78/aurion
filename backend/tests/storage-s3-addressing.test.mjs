import test from 'node:test';
import assert from 'node:assert/strict';
import { s3ObjectUrl } from '../dist/services/storage.js';

const base = {
  bucket: 'aurion-private',
  accessKey: 'test-access',
  secretKey: 'test-secret',
  endpoint: new URL('https://br-example.storage.c-8.eu-central-1.aws.neon.tech'),
  region: 'eu-central-1',
};

test('Neon S3 uses path-style addressing and preserves endpoint host', () => {
  const url = s3ObjectUrl({ ...base, forcePathStyle: true }, 'private/org-id/document name.pdf');
  assert.equal(url.hostname, 'br-example.storage.c-8.eu-central-1.aws.neon.tech');
  assert.equal(url.pathname, '/aurion-private/private/org-id/document%20name.pdf');
});

test('OVH S3 keeps virtual-host addressing by default', () => {
  const url = s3ObjectUrl({ ...base, endpoint: new URL('https://s3.de.io.cloud.ovh.net'), forcePathStyle: false }, 'private/org-id/file.pdf');
  assert.equal(url.hostname, 'aurion-private.s3.de.io.cloud.ovh.net');
  assert.equal(url.pathname, '/private/org-id/file.pdf');
});
