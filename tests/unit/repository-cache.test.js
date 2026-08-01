import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepositoryCache } from '../../js/app/repository-cache.js';

class MemoryCacheStorage {
  constructor() {
    this.caches = new Map();
  }

  async open(name) {
    if (!this.caches.has(name)) this.caches.set(name, new Map());
    const entries = this.caches.get(name);
    return {
      match: async key => entries.get(String(key))?.clone(),
      put: async (key, response) => entries.set(String(key), response.clone())
    };
  }

  async delete(name) {
    return this.caches.delete(name);
  }
}

const manifest = (manifestId, files = []) => ({
  manifestId,
  commitSha: 'c'.repeat(40),
  files
});

test('private cache stores one data-only repository record at the private cache key', async () => {
  const storage = new MemoryCacheStorage();
  const cache = createRepositoryCache(storage);
  const record = {
    manifest: manifest('range-id'),
    files: [{ path: 'config/targets.yml', sha: 'a'.repeat(40), content: 'target_sets: []\n' }],
    headers: { cookie: 'life_hub_session=secret' },
    request: { headers: { authorization: 'Bearer secret' } }
  };

  await cache.write(record);

  assert.deepEqual(await cache.read(), { manifest: record.manifest, files: record.files });
  assert.deepEqual([...storage.caches.keys()], ['life-hub-private-v1']);
  const stored = storage.caches.get('life-hub-private-v1');
  assert.deepEqual([...stored.keys()], ['/__life-hub-private-cache__/repository']);
  assert.equal(JSON.stringify(await cache.read()).includes('life_hub_session'), false);
  assert.equal(JSON.stringify(await cache.read()).includes('Bearer secret'), false);
});

test('private cache reads an empty cache as null and clear deletes only its named cache', async () => {
  const storage = new MemoryCacheStorage();
  const cache = createRepositoryCache(storage);

  assert.equal(await cache.read(), null);
  await cache.write({ manifest: manifest('range-id'), files: [] });
  storage.caches.set('other-cache', new Map());

  assert.equal(await cache.clear(), true);
  assert.equal(await cache.read(), null);
  assert.equal(storage.caches.has('other-cache'), true);
});
