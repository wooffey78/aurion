import test from 'node:test';
import assert from 'node:assert/strict';

test('le registre public ne fabrique jamais de logo hébergé chez un tiers', async () => {
  const { companyLogoUrl } = await import('../dist/services/public-registry.js');
  assert.equal(companyLogoUrl('https://example.com'), null);
  assert.equal(companyLogoUrl('example.com'), null);
  assert.equal(companyLogoUrl(null), null);
});
