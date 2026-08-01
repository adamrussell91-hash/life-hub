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
  from: '2026-07-01',
  to: '2026-07-31',
  files
});

test('private cache whitelists nested repository fields at the private cache key', async () => {
  const storage = new MemoryCacheStorage();
  const cache = createRepositoryCache(storage);
  const record = {
    manifest: {
      ...manifest('range-id', [{
        path: 'config/targets.yml',
        sha: 'a'.repeat(40),
        size: 16,
        headers: { authorization: 'Bearer nested-manifest-secret' }
      }]),
      treeSha: 'd'.repeat(40),
      debug: { authorization: 'Bearer unexpected-manifest-field' },
      headers: { cookie: 'life_hub_session=nested-manifest-secret' }
    },
    files: [{
      path: 'config/targets.yml',
      sha: 'a'.repeat(40),
      content: 'target_sets: []\n',
      fallback: {
        contentSha: 'b'.repeat(40),
        code: 'invalid_targets',
        providerDetail: 'private fallback detail'
      },
      request: { headers: { authorization: 'Bearer nested-file-secret' } }
    }],
    warnings: [{
      path: 'config/targets.yml',
      code: 'invalid_targets',
      providerDetail: 'private warning detail'
    }],
    headers: { cookie: 'life_hub_session=secret' },
    request: { headers: { authorization: 'Bearer secret' } }
  };

  await cache.write(record);

  assert.deepEqual(await cache.read({ from: '2026-07-01', to: '2026-07-31' }), {
    manifest: {
      manifestId: 'range-id',
      commitSha: 'c'.repeat(40),
      treeSha: 'd'.repeat(40),
      from: '2026-07-01',
      to: '2026-07-31',
      files: [{
        path: 'config/targets.yml',
        sha: 'a'.repeat(40),
        size: 16
      }]
    },
    files: [{
      path: 'config/targets.yml',
      sha: 'a'.repeat(40),
      content: 'target_sets: []\n',
      fallback: { contentSha: 'b'.repeat(40), code: 'invalid_targets' }
    }],
    warnings: [{ path: 'config/targets.yml', code: 'invalid_targets' }]
  });
  assert.deepEqual([...storage.caches.keys()], ['life-hub-private-v1']);
  const stored = storage.caches.get('life-hub-private-v1');
  assert.deepEqual([...stored.keys()], [
    '/__life-hub-private-cache__/repository?from=2026-07-01&to=2026-07-31'
  ]);
  const cached = await cache.read({ from: '2026-07-01', to: '2026-07-31' });
  assert.equal(JSON.stringify(cached).includes('life_hub_session'), false);
  assert.equal(JSON.stringify(cached).includes('Bearer'), false);
  assert.equal(JSON.stringify(cached).includes('private'), false);
});

test('private cache keeps disjoint exact ranges and clear deletes only its named cache', async () => {
  const storage = new MemoryCacheStorage();
  const cache = createRepositoryCache(storage);
  const july = manifest('july-range');
  const august = {
    ...manifest('august-range'),
    from: '2026-08-01',
    to: '2026-08-31'
  };

  assert.equal(await cache.read({ from: july.from, to: july.to }), null);
  await cache.write({ manifest: july, files: [], warnings: [] });
  await cache.write({ manifest: august, files: [], warnings: [] });
  storage.caches.set('other-cache', new Map());

  assert.equal((await cache.read({ from: july.from, to: july.to })).manifest.manifestId, 'july-range');
  assert.equal((await cache.read({ from: august.from, to: august.to })).manifest.manifestId, 'august-range');

  assert.equal(await cache.clear(), true);
  assert.equal(await cache.read({ from: july.from, to: july.to }), null);
  assert.equal(await cache.read({ from: august.from, to: august.to }), null);
  assert.equal(storage.caches.has('other-cache'), true);
});
