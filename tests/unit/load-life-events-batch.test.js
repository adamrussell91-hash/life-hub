import test from 'node:test';
import assert from 'node:assert/strict';
import {
  batchLifeFileRequests,
  loadLifeCalendarEvents
} from '../../packages/design-kit/js/calendar/load-life-events.js';

test('batchLifeFileRequests splits at 50 files (repo/files MAX_FILES)', () => {
  const wanted = Array.from({ length: 51 }, (_, i) => ({
    path: `data/fitness/2026/09/2026-09-${String((i % 28) + 1).padStart(2, '0')}-log-${i}.md`,
    sha: 'a'.repeat(40),
    size: 100
  }));
  const batches = batchLifeFileRequests(wanted);
  assert.equal(batches.length, 2);
  assert.equal(batches[0].length, 50);
  assert.equal(batches[1].length, 1);
});

test('batchLifeFileRequests splits when cumulative size exceeds 1 MiB', () => {
  const wanted = [
    { path: 'a.md', sha: 'a'.repeat(40), size: 600_000 },
    { path: 'b.md', sha: 'b'.repeat(40), size: 600_000 }
  ];
  const batches = batchLifeFileRequests(wanted);
  assert.equal(batches.length, 2);
  assert.equal(batches[0].length, 1);
  assert.equal(batches[1].length, 1);
});

test('loadLifeCalendarEvents posts multiple /api/repo/files batches when needed', async () => {
  const posts = [];
  const files = Array.from({ length: 51 }, (_, i) => ({
    path: `data/mind/2026/09/2026-09-01-note-${i}.md`,
    sha: String(i).padStart(40, '0'),
    size: 80
  }));
  const apiFetch = async (path, init) => {
    if (path.includes('/api/repo/manifest')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: { commitSha: 'c'.repeat(40), files }
        })
      };
    }
    if (path === '/api/repo/files') {
      const body = JSON.parse(init.body);
      posts.push(body.files.length);
      assert.ok(body.files.length <= 50, 'each batch must honour MAX_FILES');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            commitSha: body.commitSha,
            files: body.files.map((f) => ({
              path: f.path,
              sha: f.sha,
              content: '---\ntype: mind_note\nid: x\ndate: 2026-09-01\n---\n'
            }))
          }
        })
      };
    }
    throw new Error(`unexpected ${path}`);
  };

  const result = await loadLifeCalendarEvents(apiFetch, {
    today: '2026-09-18',
    from: '2026-09-01',
    to: '2026-09-30'
  });
  assert.deepEqual(posts, [50, 1]);
  assert.equal(result.events.length, 51);
});

test('loadLifeCalendarEvents fails visibly when a files batch is rejected', async () => {
  const files = Array.from({ length: 3 }, (_, i) => ({
    path: `data/mind/2026/09/2026-09-01-note-${i}.md`,
    sha: String(i).padStart(40, '0'),
    size: 80
  }));
  const apiFetch = async (path) => {
    if (path.includes('/api/repo/manifest')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, data: { commitSha: 'c'.repeat(40), files } })
      };
    }
    return {
      ok: false,
      status: 413,
      json: async () => ({ ok: false, error: { code: 'batch_too_large' } })
    };
  };
  await assert.rejects(() => loadLifeCalendarEvents(apiFetch, { today: '2026-09-18' }), /request_failed/);
});
