import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepositoryCache } from '../../apps/life/js/app/repository-cache.js';

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
  assert.deepEqual([...storage.caches.keys()], ['life-hub-private-v2']);
  const stored = storage.caches.get('life-hub-private-v2');
  const blobKey = `/__life-hub-private-cache__/blob/${'a'.repeat(40)}`;
  const rangeKey = '/__life-hub-private-cache__/repository?from=2026-07-01&to=2026-07-31';
  assert.deepEqual([...stored.keys()], [blobKey, rangeKey]);
  const memo = await stored.get(rangeKey).clone().json();
  assert.equal(Object.hasOwn(memo, 'files'), false);
  assert.equal(JSON.stringify(memo).includes('target_sets'), false);
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

test('readBlob returns a file by sha across ranges and write stores blobs plus a range memo', async () => {
  const storage = new MemoryCacheStorage();
  const cache = createRepositoryCache(storage);
  const sha = 'a'.repeat(40);
  const file = { path: 'config/targets.yml', sha, content: 'target_sets: []\n' };

  await cache.write({
    manifest: manifest('july-range', [{ path: file.path, sha, size: 16 }]),
    files: [file],
    warnings: []
  });

  assert.deepEqual(await cache.readBlob(sha), {
    path: 'config/targets.yml',
    sha,
    content: 'target_sets: []\n'
  });
  assert.equal((await cache.read({ from: '2026-07-01', to: '2026-07-31' })).files[0].content, file.content);

  await cache.write({
    manifest: {
      ...manifest('august-range', [{ path: file.path, sha, size: 16 }]),
      from: '2026-08-01',
      to: '2026-08-07'
    },
    files: [file],
    warnings: []
  });

  assert.equal(await cache.readBlob(sha).then(value => value.content), file.content);
});

test('opening v2 deletes leftover v1 range records', async () => {
  const storage = new MemoryCacheStorage();
  storage.caches.set('life-hub-private-v1', new Map([['old', true]]));
  const cache = createRepositoryCache(storage);
  await cache.read({ from: '2026-07-01', to: '2026-07-31' });
  assert.equal(storage.caches.has('life-hub-private-v1'), false);
  assert.equal(storage.caches.has('life-hub-private-v2'), true);
});

test('read returns null when a range memo is missing a blob', async () => {
  const storage = new MemoryCacheStorage();
  const cache = createRepositoryCache(storage);
  const sha = 'a'.repeat(40);
  const file = { path: 'config/targets.yml', sha, content: 'target_sets: []\n' };
  const range = { from: '2026-07-01', to: '2026-07-31' };

  await cache.write({
    manifest: manifest('july-range', [{ path: file.path, sha, size: 16 }]),
    files: [file],
    warnings: []
  });

  storage.caches.get('life-hub-private-v2').delete(`/__life-hub-private-cache__/blob/${sha}`);
  assert.equal(await cache.read(range), null);
});
