import test from 'node:test';
import assert from 'node:assert/strict';
import { capacityForDates } from '../../packages/design-kit/js/calendar/capacity-model.js';
import {
  batchLifeFileRequests,
  loadLifeCalendarEvents
} from '../../packages/design-kit/js/calendar/load-life-events.js';

test('batchLifeFileRequests stays small enough for a 10s serial blob walk', () => {
  const wanted = Array.from({ length: 51 }, (_, i) => ({
    path: `data/fitness/2026/09/2026-09-${String((i % 28) + 1).padStart(2, '0')}-log-${i}.md`,
    sha: 'a'.repeat(40),
    size: 100
  }));
  const batches = batchLifeFileRequests(wanted);
  assert.equal(batches.length, 4);
  assert.equal(batches[0].length, 16);
  assert.equal(batches[1].length, 16);
  assert.equal(batches[2].length, 16);
  assert.equal(batches[3].length, 3);
  assert.ok(batches.every((batch) => batch.length <= 16));
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
  assert.deepEqual(posts, [16, 16, 16, 3]);
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

test('a diary in the life window moves that day off 80% no logs', async () => {
  const diary = [
    '---',
    'type: diary',
    'id: diary-2026-10-01',
    'date: "2026-10-01"',
    'energy: low',
    'mood_score: 2',
    'symptoms: ["exhaustion","nausea"]',
    '---',
    'Yesterday was rough.'
  ].join('\n');
  const meal = [
    '---',
    'type: meal',
    'id: meal-2026-10-02',
    'date: "2026-10-02"',
    'meal: breakfast',
    '---',
    'Coffee.'
  ].join('\n');
  const files = [
    { path: 'data/mind/2026/10/2026-10-01-diary-1704.md', sha: 'a'.repeat(40), content: diary },
    { path: 'data/nutrition/2026/10/2026-10-02-breakfast-0800.md', sha: 'b'.repeat(40), content: meal }
  ];
  const apiFetch = async (path, init) => {
    if (String(path).includes('/api/repo/manifest')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            commitSha: 'c'.repeat(40),
            files: files.map(({ path: filePath, sha }) => ({ path: filePath, sha, size: 120 }))
          }
        })
      };
    }
    const body = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        data: {
          commitSha: body.commitSha,
          files: body.files.map((requested) => files.find((file) => file.path === requested.path))
        }
      })
    };
  };

  const { events } = await loadLifeCalendarEvents(apiFetch, {
    today: '2026-10-02',
    from: '2026-09-07',
    to: '2026-11-23'
  });
  const week = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
  const cap = capacityForDates(events, week, { isHoliday: () => true });
  const thursday = cap.get('2026-10-01');
  const friday = cap.get('2026-10-02');
  assert.ok(thursday.pct < 80);
  assert.equal(thursday.forecast, false);
  assert.notEqual(thursday.note, 'no logs');
  // Meals are vitals, not a capacity log. Friday forecasts on from Thursday's diary.
  assert.equal(friday.note, 'forecast');
  assert.equal(friday.forecast, true);
  assert.ok(friday.pct < 80);
});
