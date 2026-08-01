import test from 'node:test';
import assert from 'node:assert/strict';
import {
  diffManifest,
  SyncError,
  syncRepository
} from '../../js/app/sync-repository.js';

const SHA = {
  a: 'a'.repeat(40),
  b: 'b'.repeat(40),
  c: 'c'.repeat(40),
  d: 'd'.repeat(40)
};
const file = (path, sha, size = 10) => ({ path, sha, size });
const manifest = (manifestId, files, commitSha = SHA.c) => ({ manifestId, commitSha, files });
const json = (data, status = 200) => Response.json({ ok: status < 400, data }, { status });

function memoryCache(previous = null) {
  let value = previous;
  const writes = [];
  return {
    read: async () => value,
    write: async next => {
      value = structuredClone(next);
      writes.push(structuredClone(next));
    },
    get value() { return value; },
    writes
  };
}

test('manifest diff downloads only new or changed blobs and drops removed paths', () => {
  const previous = manifest('old', [file('a.md', SHA.a), file('gone.md', SHA.d)]);
  const next = manifest('new', [file('a.md', SHA.a), file('b.md', SHA.b)]);

  assert.deepEqual(diffManifest(previous, next), {
    changed: [file('b.md', SHA.b)],
    removed: ['gone.md'],
    unchanged: [file('a.md', SHA.a)]
  });
});

test('unchanged range-specific manifest uses its manifestId and makes zero file calls', async () => {
  const cachedManifest = manifest('range-specific-id', [file('a.md', SHA.a)]);
  const cachedFile = { path: 'a.md', sha: SHA.a, content: 'cached' };
  const cache = memoryCache({ manifest: cachedManifest, files: [cachedFile] });
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(null, { status: 304 });
  };

  const result = await syncRepository({
    fetchImpl,
    cache,
    from: '2026-07-01',
    to: '2026-07-31',
    validateFile: () => ({ valid: true })
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/repo/manifest?from=2026-07-01&to=2026-07-31');
  assert.deepEqual(calls[0].init.headers, { 'if-none-match': '"range-specific-id"' });
  assert.deepEqual(result, {
    files: [cachedFile],
    warnings: [],
    commitSha: SHA.c,
    manifestId: 'range-specific-id',
    changed: false
  });
  assert.equal(cache.writes.length, 0);
});

test('changed manifest requests one exact pair and atomically replaces the cache', async () => {
  const oldManifest = manifest('old-range', [file('a.md', SHA.a), file('gone.md', SHA.d)]);
  const nextManifest = manifest('new-range', [file('a.md', SHA.a), file('b.md', SHA.b)]);
  const cache = memoryCache({
    manifest: oldManifest,
    files: [
      { path: 'a.md', sha: SHA.a, content: 'A' },
      { path: 'gone.md', sha: SHA.d, content: 'gone' }
    ]
  });
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    if (url.startsWith('/api/repo/manifest')) return json(nextManifest);
    return json({ commitSha: SHA.c, files: [{ path: 'b.md', sha: SHA.b, content: 'B' }] });
  };

  const result = await syncRepository({
    fetchImpl,
    cache,
    from: '2026-07-01',
    to: '2026-07-31',
    validateFile: candidate => ({ valid: candidate.content === 'A' || candidate.content === 'B' })
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[1].url, '/api/repo/files');
  assert.deepEqual(JSON.parse(requests[1].init.body), {
    from: '2026-07-01',
    to: '2026-07-31',
    files: [{ path: 'b.md', sha: SHA.b }]
  });
  assert.deepEqual(result.files, [
    { path: 'a.md', sha: SHA.a, content: 'A' },
    { path: 'b.md', sha: SHA.b, content: 'B' }
  ]);
  assert.equal(result.changed, true);
  assert.equal(cache.writes.length, 1);
  assert.deepEqual(cache.value, { manifest: nextManifest, files: result.files });
});

test('changed files are split into batches of at most fifty files and one MiB', async () => {
  const entries = Array.from({ length: 70 }, (_, index) => (
    file(`file-${index}.md`, index.toString(16).padStart(40, '0'), 30 * 1024)
  ));
  const nextManifest = manifest('batched', entries);
  const requestBodies = [];
  const fetchImpl = async (url, init) => {
    if (url.startsWith('/api/repo/manifest')) return json(nextManifest);
    const body = JSON.parse(init.body);
    requestBodies.push(body);
    return json({
      commitSha: SHA.c,
      files: body.files.map(item => ({ ...item, content: item.path }))
    });
  };

  const result = await syncRepository({
    fetchImpl,
    cache: memoryCache(),
    from: '2026-07-01',
    to: '2026-07-31',
    validateFile: () => ({ valid: true })
  });

  assert.deepEqual(requestBodies.map(body => body.files.length), [34, 34, 2]);
  for (const body of requestBodies) {
    const bytes = body.files.reduce(
      (total, item) => total + nextManifest.files.find(entry => entry.path === item.path).size,
      0
    );
    assert.ok(body.files.length <= 50);
    assert.ok(bytes <= 1024 * 1024);
  }
  assert.equal(result.files.length, 70);
});

test('provider failure returns prior content with a stable warning and does not replace cache', async () => {
  const previous = {
    manifest: manifest('old-range', [file('a.md', SHA.a)]),
    files: [{ path: 'a.md', sha: SHA.a, content: 'A' }]
  };
  const cache = memoryCache(previous);

  const result = await syncRepository({
    fetchImpl: async () => new Response(null, { status: 503 }),
    cache,
    from: '2026-07-01',
    to: '2026-07-31',
    validateFile: () => ({ valid: true })
  });

  assert.deepEqual(result, {
    files: previous.files,
    warnings: [{ code: 'github_unavailable' }],
    commitSha: SHA.c,
    manifestId: 'old-range',
    changed: false
  });
  assert.equal(cache.writes.length, 0);
});

test('invalid changed content retains prior valid content under the new remote SHA marker', async () => {
  const oldManifest = manifest('old-range', [file('a.md', SHA.a)]);
  const nextManifest = manifest('new-range', [file('a.md', SHA.b)]);
  const cache = memoryCache({
    manifest: oldManifest,
    files: [{ path: 'a.md', sha: SHA.a, content: 'valid old content' }]
  });
  let fileCalls = 0;
  const fetchImpl = async url => {
    if (url.startsWith('/api/repo/manifest')) return json(nextManifest);
    fileCalls += 1;
    return json({
      commitSha: SHA.c,
      files: [{ path: 'a.md', sha: SHA.b, content: 'invalid new content' }]
    });
  };

  const result = await syncRepository({
    fetchImpl,
    cache,
    from: '2026-07-01',
    to: '2026-07-31',
    validateFile: candidate => candidate.content.startsWith('valid')
      ? { valid: true }
      : { valid: false, code: 'invalid_event' }
  });

  assert.deepEqual(result.files, [{ path: 'a.md', sha: SHA.b, content: 'valid old content' }]);
  assert.deepEqual(result.warnings, [{ path: 'a.md', code: 'invalid_event' }]);
  assert.equal(fileCalls, 1);
  assert.deepEqual(cache.value, { manifest: nextManifest, files: result.files });
});

test('mismatched file response falls back without partially replacing the cache', async () => {
  const previous = {
    manifest: manifest('old-range', [file('a.md', SHA.a)]),
    files: [{ path: 'a.md', sha: SHA.a, content: 'A' }]
  };
  const cache = memoryCache(previous);
  const fetchImpl = async url => url.startsWith('/api/repo/manifest')
    ? json(manifest('new-range', [file('b.md', SHA.b)]))
    : json({ commitSha: SHA.c, files: [{ path: 'b.md', sha: SHA.d, content: 'wrong pair' }] });

  const result = await syncRepository({
    fetchImpl,
    cache,
    from: '2026-07-01',
    to: '2026-07-31',
    validateFile: () => ({ valid: true })
  });

  assert.deepEqual(result.files, previous.files);
  assert.deepEqual(result.warnings, [{ code: 'github_invalid_response' }]);
  assert.equal(cache.writes.length, 0);
});

test('unauthenticated responses raise a stable session-expired error', async () => {
  await assert.rejects(
    syncRepository({
      fetchImpl: async () => new Response(null, { status: 401 }),
      cache: memoryCache(),
      from: '2026-07-01',
      to: '2026-07-31',
      validateFile: () => ({ valid: true })
    }),
    error => error instanceof SyncError && error.code === 'session_expired'
  );
});

test('same-range refreshes share one request while a superseding range aborts the old request', async () => {
  const cache = memoryCache();
  let calls = 0;
  let firstSignal;
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const fetchImpl = async (url, init) => {
    calls += 1;
    if (calls === 1) {
      firstSignal = init.signal;
      await blocked;
    }
    return json(manifest(`range-${calls}`, []));
  };
  const common = { fetchImpl, cache, validateFile: () => ({ valid: true }) };
  const first = syncRepository({ ...common, from: '2026-07-01', to: '2026-07-31' });
  const shared = syncRepository({ ...common, from: '2026-07-01', to: '2026-07-31' });

  await Promise.resolve();
  assert.equal(calls, 1);
  const superseding = syncRepository({ ...common, from: '2026-06-01', to: '2026-07-31' });
  assert.equal(firstSignal.aborted, true);
  release();

  await Promise.allSettled([first, shared]);
  await superseding;
  assert.equal(calls, 2);
});
