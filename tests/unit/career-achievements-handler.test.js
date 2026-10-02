import test from 'node:test';
import assert from 'node:assert/strict';
import { createCareerAchievementsHandler } from '../../netlify/functions/career-achievements.mjs';

function setup() {
  const records = new Map();
  const store = {
    get: async key => records.get(key) ?? null,
    setJSON: async (key, value) => records.set(key, structuredClone(value)),
    list: async ({ prefix }) => ({ blobs: [...records.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) })
  };
  const handler = createCareerAchievementsHandler({
    env: { LIFE_HUB_PASSPHRASE_HASH: 'test-only', SESSION_SECRET: 'x'.repeat(32) },
    verifySessionToken: () => ({ valid: true }),
    getContentStore: async () => store,
    now: () => '2026-10-02T12:00:00.000Z'
  });
  const request = (method, body, id = '') => new Request(
    'https://life-hub.adam-russell.com/api/career-achievements' + (id ? '?id=' + id : ''),
    { method, headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
  return { handler, request, records };
}

test('manual card POST persists entered title and evidence and GET returns it', async () => {
  const { handler, request, records } = setup();
  const response = await handler(request('POST', { title: 'Curriculum design and implementation',
    occurred_on: '2026-10-02', date_precision: 'day', origin: 'manual',
    skills: ['Curriculum design'], star: { situation: 'New subjects', task: 'Develop programs',
      action: 'Introduced Psychology', result: 'Programs implemented' } }));
  assert.equal(response.status, 201, await response.clone().text());
  const { data: { achievement } } = await response.json();
  assert.equal(achievement.title, 'Curriculum design and implementation');
  assert.equal(achievement.star.action, 'Introduced Psychology');
  assert.deepEqual(achievement.skills, ['Curriculum design']);
  assert.equal(achievement.origin, 'manual');
  const fetched = await handler(request('GET', undefined, achievement.id));
  assert.equal(fetched.status, 200);
  assert.deepEqual((await fetched.json()).data.achievement, achievement);
  const patched = await handler(request('PATCH', { title: 'Updated curriculum design' }, achievement.id));
  assert.equal(patched.status, 200, await patched.clone().text());
  assert.equal((await patched.json()).data.achievement.title, 'Updated curriculum design');
});

for (const [body, code] of [['{', 'invalid_json'], ['[]', 'validation_error']]) {
  test('rejects invalid manual card body: ' + code, async () => {
    const { handler, request, records } = setup();
    const response = await handler(request('POST', body));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, code);
    assert.equal(records.size, 0);
  });
}

test('deleted skill cards disappear from list and direct reads', async () => {
  const { handler, request } = setup();
  const created = await handler(request('POST', { title: 'Remove this', occurred_on: '2026-10-02', date_precision: 'day' }));
  const { data: { achievement } } = await created.json();
  const deleted = await handler(request('PATCH', { lifecycle_status: 'deleted' }, achievement.id));
  assert.equal(deleted.status, 200, await deleted.clone().text());
  const listed = await handler(request('GET'));
  assert.deepEqual((await listed.json()).data.achievements, []);
  assert.equal((await handler(request('GET', undefined, achievement.id))).status, 404);
  assert.equal((await handler(request('PATCH', { title: 'Restore accidentally' }, achievement.id))).status, 404);
});
