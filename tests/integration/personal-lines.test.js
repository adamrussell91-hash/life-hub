import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { isPublicStudentApi } from '../../netlify/functions/_shared/public-student-routes.mjs';
import { createPersonalLinesHandler } from '../../netlify/functions/personal-lines.mjs';
import { createPublishedLineHandler } from '../../netlify/functions/published-line.mjs';
import { newLineSlug, sanitizeLineSnapshot } from '../../netlify/functions/_shared/personal-lines.mjs';

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com'
};
const session = createSessionToken({ now: Date.parse('2026-10-16T00:00:00Z'), randomBytes: () => Buffer.alloc(16, 4) }, SECRET).token;

function memoryStore() {
  const map = new Map();
  return {
    map,
    async get(key) { return map.get(key) ?? null; },
    async setJSON(key, value) { map.set(key, value); },
    async delete(key) { map.delete(key); },
    async list({ prefix }) { return { blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) }; }
  };
}

function request({ cookie = true, url, method = 'GET', body } = {}) {
  return new Request(url, {
    method,
    headers: {
      ...(cookie ? { cookie: `life_hub_session=${session}` } : {}),
      origin: 'https://life-hub.adam-russell.com',
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

const snapshot = {
  version: 1,
  year: 2026,
  student_year: 9,
  student_name: 'Mia Example',
  subjects: ['Debating', 'Psychology'],
  lines: ['J', 'R'],
  items: [
    {
      id: 'prog_ibo',
      name: 'International Business Olympiad (IBO)',
      type: 'Competition',
      on: ['R'],
      matched: ['Economics'],
      years: [9, 10],
      run: { start: '2026-07-25', end: '2026-08-14', precision: 'day' },
      due: null,
      close: { on: '2026-07-15', precision: 'day' },
      description: 'Global olympiad.',
      link: 'https://example.org/ibo',
      notes: 'private note that must not be published',
      planning: 'active'
    }
  ],
  undated: [],
  terms: [{ id: 'T1', start: '2026-02-02', end: '2026-04-02' }],
  secret: 'never stored'
};

test('published lines are a public route, the builder API is not', () => {
  assert.equal(isPublicStudentApi('GET', '/api/published/lines/abc123defg'), true);
  assert.equal(isPublicStudentApi('GET', '/api/personal-lines'), false);
  assert.equal(isPublicStudentApi('POST', '/api/published/lines/abc123defg'), false);
});

test('publish, list, read publicly, unpublish', async () => {
  const store = memoryStore();
  const deps = { env, now: () => Date.parse('2026-10-16T01:00:00Z'), getContentStore: async () => store, newSlug: () => 'k7q2mpx4wd9z' };
  const operator = createPersonalLinesHandler(deps);
  const publicLine = createPublishedLineHandler({ env, getContentStore: async () => store });

  const anonymous = await operator(request({ cookie: false, url: 'https://api.adam-russell.com/api/personal-lines', method: 'POST', body: snapshot }));
  assert.equal(anonymous.status, 401);

  const created = await operator(request({ url: 'https://api.adam-russell.com/api/personal-lines', method: 'POST', body: snapshot }));
  assert.equal(created.status, 201);
  const summary = (await created.json()).data;
  assert.deepEqual(summary, {
    slug: 'k7q2mpx4wd9z',
    student_name: 'Mia',
    student_year: 9,
    subjects: ['Debating', 'Psychology'],
    year: 2026,
    created_at: summary.created_at
  });

  const listed = (await (await operator(request({ url: 'https://api.adam-russell.com/api/personal-lines' }))).json()).data.lines;
  assert.equal(listed.length, 1);

  const read = await publicLine(request({ cookie: false, url: 'https://api.adam-russell.com/api/published/lines/k7q2mpx4wd9z' }));
  assert.equal(read.status, 200);
  const line = (await read.json()).data;
  assert.equal(line.student_name, 'Mia');
  assert.equal(line.items[0].run.start, '2026-07-25');
  assert.equal(line.items[0].close.on, '2026-07-15');
  const stored = JSON.stringify(store.map.get('personal_lines/k7q2mpx4wd9z'));
  assert.doesNotMatch(stored, /private note|planning|never stored/);

  const missing = await publicLine(request({ cookie: false, url: 'https://api.adam-russell.com/api/published/lines/nothinghere1' }));
  assert.equal(missing.status, 404);

  const removed = await operator(request({ url: 'https://api.adam-russell.com/api/personal-lines?slug=k7q2mpx4wd9z', method: 'DELETE' }));
  assert.equal(removed.status, 200);
  const gone = await publicLine(request({ cookie: false, url: 'https://api.adam-russell.com/api/published/lines/k7q2mpx4wd9z' }));
  assert.equal(gone.status, 404);
});

test('sanitising keeps a first name only and refuses an empty line', () => {
  assert.equal(sanitizeLineSnapshot({ ...snapshot, student_name: '  Ada   Lovelace ' }).snapshot.student_name, 'Ada');
  assert.equal(sanitizeLineSnapshot({ ...snapshot, items: [], undated: [] }).error, 'Nothing on this line to publish yet.');
  const bad = sanitizeLineSnapshot({ ...snapshot, items: [{ ...snapshot.items[0], link: 'javascript:alert(1)', on: ['X'] }] });
  assert.equal(bad.error, 'Nothing on this line to publish yet.');
  assert.match(newLineSlug(), /^[a-z0-9]{12}$/);
});
