import test from 'node:test';
import assert from 'node:assert/strict';
import { materialIsFresh } from '../src/learn/materialCache.js';

const now = 100000;
const material = remaining => ({ url: 'https://example.test/private.pdf', expiresAt: new Date(now + remaining).toISOString() });

test('reuse a signed URL only with more than a minute remaining', () => {
  assert.equal(materialIsFresh(material(61000), now), true);
  assert.equal(materialIsFresh(material(60000), now), false);
  assert.equal(materialIsFresh(material(-1), now), false);
});

test('older backends and invalid expiry cannot populate a usable cache entry', () => {
  assert.equal(materialIsFresh({ url: 'fixture' }, now), false);
  assert.equal(materialIsFresh({ url: 'fixture', expiresAt: 'invalid' }, now), false);
  assert.equal(materialIsFresh({ ...material(61000), url: '' }, now), false);
  assert.equal(materialIsFresh(null, now), false);
});
