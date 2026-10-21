import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGroups } from '../../netlify/functions/_shared/brainstorm-groups.mjs';
import { brainstormAction } from '../../netlify/functions/_shared/brainstorm.mjs';
import { createBrainstormHandler } from '../../netlify/functions/brainstorm.mjs';
import { createPublishedBrainstormHandler } from '../../netlify/functions/published-brainstorm.mjs';
import { isPublicStudentApi } from '../../netlify/functions/_shared/public-student-routes.mjs';

const block = {
  id: 'bs1', type: 'block', block_type: 'brainstorm', variant: 'medium', visibility: 'student_teacher',
  content: { question: 'Why the storm?', safety: 'instant', per_student: 3, max_length: 140, layout: 'groups' },
  created_at: '2026-10-18T00:00:00.000Z', updated_at: '2026-10-18T00:00:00.000Z', schema_version: 1
};
function storeFixture() {
  const data = new Map([['lessons/lesson1', { blocks: [block] }], ['published/lessons/lesson1', { blocks: [block] }]]);
  return {
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async setJSON(key, value, options) {
      if (options?.onlyIfNew && data.has(key)) return { modified: false };
      data.set(key, structuredClone(value)); return { modified: true };
    }
  };
}
const token = c => c.repeat(48);

test('parseGroups keeps known ids once, sweeps leftovers into Other, and caps at six', () => {
  const raw = '```json\n{"groups":[{"name":"Inner turmoil","ids":["a","b","zz"]},{"name":"Nature","ids":["b","c"]},{"name":"","ids":["d"]}]}\n```';
  assert.deepEqual(parseGroups(raw, ['a', 'b', 'c', 'd']), [
    { id: 'g1', name: 'Inner turmoil', answer_ids: ['a', 'b'] },
    { id: 'g2', name: 'Nature', answer_ids: ['c'] },
    { id: 'g3', name: 'Other', answer_ids: ['d'] }
  ]);
  const many = JSON.stringify({ groups: Array.from({ length: 9 }, (_, i) => ({ name: `G${i}`, ids: [`x${i}`] })) });
  assert.equal(parseGroups(many, Array.from({ length: 9 }, (_, i) => `x${i}`)).filter(g => g.name !== 'Other').length, 6);
  assert.throws(() => parseGroups('not json', ['a']), /bad_json/);
  assert.throws(() => parseGroups('{"groups":[{"name":"X","ids":["nope"]}]}', ['a']), /no_groups/);
});

test('grouping sends Claude only shown answer text, saves it, and lets the teacher move and rename', async () => {
  const store = storeFixture();
  const teach = (body, opts = {}) => brainstormAction(store, 'lesson1', 'bs1', body, { teacher: true, ...opts });
  const learn = body => brainstormAction(store, 'lesson1', 'bs1', body);
  const round = await teach({ action: 'start' });
  const [a, b] = [token('a'), token('b')].map(t => ({ token: t, session: round.session }));
  for (const s of [a, b]) await learn({ ...s, action: 'join', code: round.code });
  await learn({ ...a, action: 'submit', text: 'Guilt' });
  await learn({ ...b, action: 'submit', text: 'Chaos' });
  await learn({ ...b, action: 'submit', text: 'Madness' });
  await learn({ ...a, action: 'submit', text: 'you moron' });
  const before = await teach({});
  await teach({ action: 'remove', id: before.answers.find(x => x.text === 'Madness').id });

  let sent;
  const fetchImpl = async (_url, init) => {
    sent = JSON.parse(init.body);
    const ids = JSON.parse(sent.messages[0].content).answers.map(x => x.id);
    return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ groups: [{ name: 'Feelings', ids }] }) }] }), { status: 200 });
  };
  await assert.rejects(teach({ action: 'group' }, { env: {} }), /isn’t available/);
  const grouped = await teach({ action: 'group' }, { env: { ANTHROPIC_API_KEY: 'k' }, fetchImpl });
  const payload = JSON.parse(sent.messages[0].content);
  assert.deepEqual(payload.answers.map(x => x.text).sort(), ['Chaos', 'Guilt']);
  assert.equal(payload.question, 'Why the storm?');
  assert.ok(!sent.messages[0].content.match(/\d-\d"|moron|Madness/), 'no symbols, held or removed text');
  assert.equal(grouped.groups[0].name, 'Feelings');

  const renamed = await teach({ action: 'rename_group', group: 'g1', name: 'Inner storm' });
  assert.equal(renamed.groups[0].name, 'Inner storm');
  await assert.rejects(teach({ action: 'rename_group', group: 'g9', name: 'x' }), /Unknown group/);
  const chaos = grouped.answers.find(x => x.text === 'Chaos').id;
  await teach({ action: 'move', id: chaos, group: 'g1' });
  assert.equal((await teach({})).groups[0].answer_ids.at(-1), chaos);

  await teach({ action: 'students_see', value: 'all' });
  assert.equal((await learn(a)).board.groups, null, 'groups reach students only after reveal');
  await teach({ action: 'reveal' });
  assert.equal((await learn(a)).board.groups[0].name, 'Inner storm');
});

test('routes: student route is public, teacher route needs the operator session', async () => {
  assert.equal(isPublicStudentApi('POST', '/api/published/brainstorm/lesson1/bs1'), true);
  assert.equal(isPublicStudentApi('POST', '/api/lessons/lesson1/brainstorm/bs1'), false);
  const store = storeFixture(); const origin = 'https://life-hub.adam-russell.com';
  const deps = { getContentStore: async () => store, env: { SITE_ORIGIN: origin, SESSION_SECRET: 'x'.repeat(32), LIFE_HUB_PASSPHRASE_HASH: 'y' }, verifySessionToken: () => ({ valid: true }) };
  const req = () => new Request('https://api.example/api/lessons/lesson1/brainstorm/bs1', { method: 'POST', headers: { origin, cookie: 'umbrella_session=ok' }, body: JSON.stringify({ action: 'start' }) });
  const started = await createBrainstormHandler(deps)(req());
  assert.equal(started.status, 200); assert.match((await started.json()).data.code, /^\d{6}$/);
  assert.equal((await createBrainstormHandler({ ...deps, verifySessionToken: () => ({ valid: false }) })(req())).status, 401);
  const pub = createPublishedBrainstormHandler({ getContentStore: async () => store, env: { SITE_ORIGIN: origin } });
  const preq = (body, from = origin) => new Request('https://api.example/api/published/brainstorm/lesson1/bs1', { method: 'POST', headers: { origin: from }, body });
  const status = await pub(preq('{}'));
  assert.equal(status.status, 200); assert.equal((await status.json()).data.open, true);
  assert.equal((await pub(preq('{}', 'https://evil.example'))).status, 403);
  assert.equal((await pub(preq('null'))).status, 400);
  assert.equal((await pub(preq(JSON.stringify({ action: 'start' })))).status, 400, 'students cannot start a round');
});
