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
const manifest = (manifestId, files, commitSha = SHA.c, range = {
  from: '2026-07-01',
  to: '2026-07-31'
}) => ({ manifestId, commitSha, ...range, files });
const json = (data, status = 200) => Response.json({ ok: status < 400, data }, { status });

function memoryCache(previous = null) {
  const blobs = new Map();
  const memos = new Map();
  if (previous) {
    memos.set(`${previous.manifest.from}\0${previous.manifest.to}`, previous);
    for (const file of previous.files ?? []) blobs.set(file.sha, file);
  }
  const writes = [];
  const cache = {
    async readBlob(sha) { return blobs.get(sha) ?? null; },
    async read(range) {
      const key = `${range.from}\0${range.to}`;
      const memo = memos.get(key);
      if (!memo) return null;
      const files = [];
      for (const entry of memo.manifest.files) {
        const blob = blobs.get(entry.sha);
        if (!blob) return null;
        files.push(blob);
      }
      return { ...memo, files };
    },
    async write(next) {
      const copy = structuredClone(next);
      memos.set(`${copy.manifest.from}\0${copy.manifest.to}`, copy);
      for (const file of copy.files ?? []) blobs.set(file.sha, file);
      writes.push(copy);
    },
    get value() { return [...memos.values()].at(-1) ?? null; },
    writes
  };
  return cache;
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
    changed: false,
    freshness: 'confirmed'
  });
  assert.equal(cache.writes.length, 0);
});

test('a cached manifest from another range is never sent as a conditional', async () => {
  const cachedManifest = manifest('june-range', [file('a.md', SHA.a)], SHA.c, {
    from: '2026-06-01',
    to: '2026-06-30'
  });
  const nextManifest = manifest('july-range', [file('a.md', SHA.a)]);
  const cache = memoryCache({
    manifest: cachedManifest,
    files: [{ path: 'a.md', sha: SHA.a, content: 'cached' }]
  });
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return json(nextManifest);
  };

  const result = await syncRepository({
    fetchImpl,
    cache,
    from: '2026-07-01',
    to: '2026-07-31',
    validateFile: () => ({ valid: true })
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].init.headers, {});
  assert.equal(result.manifestId, 'july-range');
  assert.equal(result.freshness, 'confirmed');
  assert.deepEqual(cache.value.manifest, nextManifest);
});

test('a second range does not POST files whose sha is already cached', async () => {
  const cachedFile = { path: 'config/targets.yml', sha: SHA.a, content: 'cached' };
  const cache = memoryCache({
    manifest: manifest('july', [file('config/targets.yml', SHA.a)], SHA.c, {
      from: '2026-07-01', to: '2026-07-31'
    }),
    files: [cachedFile]
  });
  const julyManifest = manifest('july', [file('config/targets.yml', SHA.a)]);
  const weekManifest = manifest('week', [
    file('config/targets.yml', SHA.a),
    file('data/nutrition/2026/08/2026-08-01-breakfast.md', SHA.b)
  ], SHA.c, { from: '2026-07-26', to: '2026-08-01' });
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (String(url).includes('/api/repo/manifest')) {
      const to = new URL(url, 'https://life.example').searchParams.get('to');
      return json(to === '2026-08-01' ? weekManifest : julyManifest);
    }
    return json({
      commitSha: SHA.c,
      files: [{ path: 'data/nutrition/2026/08/2026-08-01-breakfast.md', sha: SHA.b, content: 'meal' }]
    });
  };

  await syncRepository({
    fetchImpl, cache, from: '2026-07-26', to: '2026-08-01',
    validateFile: () => ({ valid: true })
  });

  const filePosts = calls.filter(call => call.url === '/api/repo/files');
  assert.equal(filePosts.length, 1);
  const body = JSON.parse(filePosts[0].init.body);
  assert.equal(body.commitSha, SHA.c);
  assert.deepEqual(body.files, [
    { path: 'data/nutrition/2026/08/2026-08-01-breakfast.md', sha: SHA.b }
  ]);
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
    commitSha: SHA.c,
    files: [{ path: 'b.md', sha: SHA.b }]
  });
  assert.deepEqual(result.files, [
    { path: 'a.md', sha: SHA.a, content: 'A' },
    { path: 'b.md', sha: SHA.b, content: 'B' }
  ]);
  assert.equal(result.changed, true);
  assert.equal(result.freshness, 'confirmed');
  assert.equal(cache.writes.length, 1);
  assert.deepEqual(cache.value, { manifest: nextManifest, files: result.files, warnings: [] });
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
    changed: false,
    freshness: 'fallback'
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

  assert.deepEqual(result.files, [{
    path: 'a.md',
    sha: SHA.b,
    content: 'valid old content',
    fallback: { contentSha: SHA.a, code: 'invalid_event' }
  }]);
  assert.deepEqual(result.warnings, [{ path: 'a.md', code: 'invalid_event' }]);
  assert.equal(result.freshness, 'fallback');
  assert.equal(fileCalls, 1);
  assert.deepEqual(cache.value, {
    manifest: nextManifest,
    files: result.files,
    warnings: [{ path: 'a.md', code: 'invalid_event' }]
  });
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
  assert.equal(result.freshness, 'fallback');
  assert.equal(cache.writes.length, 0);
});

test('invalid fallback provenance and warning survive 304 and offline refreshes', async () => {
  const oldManifest = manifest('old-range', [file('a.md', SHA.a)]);
  const nextManifest = manifest('new-range', [file('a.md', SHA.b)]);
  const cache = memoryCache({
    manifest: oldManifest,
    files: [{ path: 'a.md', sha: SHA.a, content: 'valid old content' }],
    warnings: []
  });
  let phase = 'invalid';
  const fetchImpl = async url => {
    if (phase === 'offline') throw new TypeError('offline');
    if (url.startsWith('/api/repo/manifest')) {
      return phase === 'unchanged' ? new Response(null, { status: 304 }) : json(nextManifest);
    }
    return json({
      commitSha: SHA.c,
      files: [{ path: 'a.md', sha: SHA.b, content: 'invalid new content' }]
    });
  };
  const options = {
    fetchImpl,
    cache,
    from: '2026-07-01',
    to: '2026-07-31',
    validateFile: candidate => candidate.content.startsWith('valid')
      ? { valid: true }
      : { valid: false, code: 'invalid_event' }
  };

  const invalid = await syncRepository(options);
  phase = 'unchanged';
  const unchanged = await syncRepository(options);
  phase = 'offline';
  const offline = await syncRepository(options);

  assert.deepEqual(cache.value.files, [{
    path: 'a.md',
    sha: SHA.b,
    content: 'valid old content',
    fallback: { contentSha: SHA.a, code: 'invalid_event' }
  }]);
  assert.deepEqual(cache.value.warnings, [{ path: 'a.md', code: 'invalid_event' }]);
  assert.deepEqual(invalid.warnings, [{ path: 'a.md', code: 'invalid_event' }]);
  assert.deepEqual(unchanged.warnings, [{ path: 'a.md', code: 'invalid_event' }]);
  assert.deepEqual(offline.warnings, [
    { path: 'a.md', code: 'invalid_event' },
    { code: 'github_unavailable' }
  ]);
  assert.equal(invalid.freshness, 'fallback');
  assert.equal(unchanged.freshness, 'fallback');
  assert.equal(unchanged.changed, false);
  assert.equal(offline.freshness, 'fallback');
});

test('retained fallback warnings survive a later 200 manifest for an unrelated file', async () => {
  const oldManifest = manifest('old-range', [file('a.md', SHA.a)]);
  const invalidManifest = manifest('invalid-range', [file('a.md', SHA.b)]);
  const unrelatedManifest = manifest('unrelated-range', [
    file('a.md', SHA.b),
    file('c.md', SHA.c)
  ], SHA.d);
  const cache = memoryCache({
    manifest: oldManifest,
    files: [{ path: 'a.md', sha: SHA.a, content: 'valid old content' }],
    warnings: []
  });
  let phase = 'invalid';
  const fetchImpl = async url => {
    if (url.startsWith('/api/repo/manifest')) {
      return json(phase === 'invalid' ? invalidManifest : unrelatedManifest);
    }
    return phase === 'invalid'
      ? json({
          commitSha: SHA.c,
          files: [{ path: 'a.md', sha: SHA.b, content: 'invalid new content' }]
        })
      : json({
          commitSha: SHA.d,
          files: [{ path: 'c.md', sha: SHA.c, content: 'valid unrelated content' }]
        });
  };
  const options = {
    fetchImpl,
    cache,
    from: '2026-07-01',
    to: '2026-07-31',
    validateFile: candidate => candidate.content.startsWith('valid')
      ? { valid: true }
      : { valid: false, code: 'invalid_event' }
  };

  await syncRepository(options);
  phase = 'unrelated';
  const result = await syncRepository(options);

  assert.deepEqual(result.files, [
    {
      path: 'a.md',
      sha: SHA.b,
      content: 'valid old content',
      fallback: { contentSha: SHA.a, code: 'invalid_event' }
    },
    { path: 'c.md', sha: SHA.c, content: 'valid unrelated content' }
  ]);
  assert.deepEqual(result.warnings, [{ path: 'a.md', code: 'invalid_event' }]);
  assert.equal(result.freshness, 'fallback');
  assert.deepEqual(cache.value.warnings, [{ path: 'a.md', code: 'invalid_event' }]);
});

test('malformed manifest falls back visibly without replacing a warm cache', async () => {
  const previous = {
    manifest: manifest('old-range', [file('a.md', SHA.a)]),
    files: [{ path: 'a.md', sha: SHA.a, content: 'A' }],
    warnings: []
  };
  const cache = memoryCache(previous);
  const response = await syncRepository({
    fetchImpl: async () => Response.json({ ok: true, data: { malformed: true } }),
    cache,
    from: '2026-07-01',
    to: '2026-07-31',
    validateFile: () => ({ valid: true })
  });

  assert.deepEqual(response.files, previous.files);
  assert.deepEqual(response.warnings, [{ code: 'github_invalid_response' }]);
  assert.equal(response.changed, false);
  assert.equal(response.freshness, 'fallback');
  assert.equal(cache.writes.length, 0);
});

test('stale manifest replays the whole cycle once and commits only the current manifest', async () => {
  const firstManifest = manifest('first', [file('a.md', SHA.a)], SHA.c);
  const currentManifest = manifest('current', [file('b.md', SHA.b)], SHA.d);
  const cache = memoryCache();
  const calls = [];
  const responses = [
    json(firstManifest),
    Response.json({ ok: false, error: { code: 'stale_manifest' } }, { status: 409 }),
    json(currentManifest),
    json({ commitSha: SHA.d, files: [{ path: 'b.md', sha: SHA.b, content: 'B' }] })
  ];
  const result = await syncRepository({
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return responses.shift();
    },
    cache,
    from: '2026-07-01',
    to: '2026-07-31',
    validateFile: () => ({ valid: true })
  });

  assert.deepEqual(calls.map(call => call.url), [
    '/api/repo/manifest?from=2026-07-01&to=2026-07-31',
    '/api/repo/files',
    '/api/repo/manifest?from=2026-07-01&to=2026-07-31',
    '/api/repo/files'
  ]);
  assert.deepEqual(result.files, [{ path: 'b.md', sha: SHA.b, content: 'B' }]);
  assert.equal(result.manifestId, 'current');
  assert.equal(result.freshness, 'confirmed');
  assert.equal(cache.writes.length, 1);
});

test('a second stale manifest falls back visibly when warm and fails when cold', async () => {
  const cached = {
    manifest: manifest('cached', [file('a.md', SHA.a)]),
    files: [{ path: 'a.md', sha: SHA.a, content: 'A' }],
    warnings: []
  };
  const changingManifest = manifest('moving', [file('b.md', SHA.b)]);
  const fetchSequence = () => {
    const responses = [
      json(changingManifest),
      new Response(null, { status: 409 }),
      json(changingManifest),
      new Response(null, { status: 409 })
    ];
    return async () => responses.shift();
  };
  const common = {
    from: '2026-07-01',
    to: '2026-07-31',
    validateFile: () => ({ valid: true })
  };

  const warmCache = memoryCache(cached);
  const warm = await syncRepository({ ...common, cache: warmCache, fetchImpl: fetchSequence() });
  assert.deepEqual(warm.files, cached.files);
  assert.deepEqual(warm.warnings, [{ code: 'stale_manifest' }]);
  assert.equal(warm.freshness, 'fallback');
  assert.equal(warmCache.writes.length, 0);

  await assert.rejects(
    syncRepository({ ...common, cache: memoryCache(), fetchImpl: fetchSequence() }),
    error => error instanceof SyncError && error.code === 'stale_manifest'
  );
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
    const requestUrl = new URL(url, 'https://life.example');
    return json(manifest(`range-${calls}`, [], SHA.c, {
      from: requestUrl.searchParams.get('from'),
      to: requestUrl.searchParams.get('to')
    }));
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
