import test from 'node:test';
import assert from 'node:assert/strict';
import { claimInitials, loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';
import { mapRows, profileAction, teacherProfileAction } from '../../netlify/functions/_shared/profile.mjs';

function storeFixture(entries = []) {
  const data = new Map(entries.map(([k, v]) => [k, structuredClone(v)]));
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: 'e' } : null; },
    async setJSON(key, value, options) {
      if (options?.onlyIfNew && data.has(key)) return { modified: false };
      data.set(key, structuredClone(value)); return { modified: true };
    },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}
const cls = (students) => ({ id: 'class1', type: 'class', status: 'active', title: '9 English', current_unit_id: 'unit1', students });
const token = (n) => n.toString(16).repeat(48).slice(0, 48);
const lesson = (id, title, extra = {}) => [`lessons/${id}`, { id, title, ...extra }];

async function fixture() {
  const s = storeFixture([
    ['classes/class1', cls([{ name: 'Bob Brown' }, { name: 'Tom Tills' }])],
    ['units/unit1', { id: 'unit1', title: 'Poetry', lesson_ids: ['l1', 'l2', 'l3'] }],
    lesson('l1', 'Ghost poem'), lesson('l2', 'Tutorial', { route_role: 'support' }), lesson('l3', 'Stretch', { route_role: 'extension' })
  ]);
  const roster = await loadRoster(s, 'class1');
  await claimInitials(s, roster, token(1), 'BB');
  return s;
}

test('an unclaimed device gets need=initials and no profile', async () => {
  const s = await fixture();
  const out = await profileAction(s, 'class1', { action: 'status', class_token: token(9) });
  assert.equal(out.need, 'initials');
  assert.equal(out.map, undefined);
});

test('done is create-only and a claimed device can only write its own record', async () => {
  const s = await fixture();
  await profileAction(s, 'class1', { action: 'done', class_token: token(1), lesson_id: 'l1' });
  const first = [...s.data.entries()].find(([k]) => k.startsWith('profile/class1/') && k.endsWith('/done/l1'));
  assert.ok(first);
  const at = first[1].at;
  await new Promise((r) => setTimeout(r, 5));
  await profileAction(s, 'class1', { action: 'done', class_token: token(1), lesson_id: 'l1' });
  assert.equal(s.data.get(first[0]).at, at, 'a second tick does not rewrite the record');
});

test('done by an unclaimed device is refused', async () => {
  const s = await fixture();
  await assert.rejects(profileAction(s, 'class1', { action: 'done', class_token: token(9), lesson_id: 'l1' }), { code: 'need_initials' });
});

test('the profile lists lessons in unit order with roles and which are done', async () => {
  const s = await fixture();
  await profileAction(s, 'class1', { action: 'done', class_token: token(1), lesson_id: 'l1' });
  const out = await profileAction(s, 'class1', { action: 'status', class_token: token(1) });
  assert.deepEqual(out.map.lessons.map((l) => [l.id, l.role, l.done]), [['l1', 'core', true], ['l2', 'support', false], ['l3', 'extension', false]]);
  assert.equal(out.map.next, null, 'with no core lessons left there is nothing next');
});

test('next is the first core lesson not yet done', async () => {
  const s = storeFixture([
    ['classes/class1', cls([{ name: 'Bob Brown' }])],
    ['units/unit1', { id: 'unit1', title: 'Poetry', lesson_ids: ['l1', 'l2'] }],
    lesson('l1', 'One'), lesson('l2', 'Two')
  ]);
  await claimInitials(s, await loadRoster(s, 'class1'), token(1), 'BB');
  await profileAction(s, 'class1', { action: 'done', class_token: token(1), lesson_id: 'l1' });
  assert.equal((await profileAction(s, 'class1', { class_token: token(1) })).map.next, 'l2');
});

test('the payload never carries scores, bands, counts or another student', async () => {
  const s = await fixture();
  const out = JSON.stringify(await profileAction(s, 'class1', { action: 'status', class_token: token(1) }));
  for (const word of ['score', 'band', 'weak', 'secure', 'Tom', 'TT', 'student_id']) assert.ok(!out.includes(word), word);
});

test('the profile reads only the claiming device’s student, never a student id from the request', async () => {
  const s = await fixture();
  const roster = await loadRoster(s, 'class1');
  const tom = roster.students.find((x) => x.initials === 'TT');
  await profileAction(s, 'class1', { action: 'done', class_token: token(1), lesson_id: 'l1', student_id: tom.id });
  assert.ok(![...s.data.keys()].some((k) => k.includes(`/${tom.id}/done/`)));
});

test('claim: typed initials claim and unknown or taken ones are refused', async () => {
  const s = await fixture();
  const out = await profileAction(s, 'class1', { action: 'claim', class_token: token(2), initials: 'tt' });
  assert.equal(out.initials, 'TT');
  await assert.rejects(profileAction(s, 'class1', { action: 'claim', class_token: token(3), initials: 'zz' }), { code: 'not_in_class' });
  await assert.rejects(profileAction(s, 'class1', { action: 'claim', class_token: token(3), initials: 'BB' }), { code: 'taken' });
});

test('a released claim loses the profile', async () => {
  const s = await fixture();
  const roster = await loadRoster(s, 'class1');
  const { releaseClaim } = await import('../../netlify/functions/_shared/class-claims.mjs');
  await releaseClaim(s, 'class1', roster.students[0].id);
  assert.equal((await profileAction(s, 'class1', { class_token: token(1) })).need, 'initials');
});

test('a submitted quiz counts as done, and a took tick makes a support lesson assigned', () => {
  const lessons = [{ id: 'q1', title: 'Quiz' }, { id: 's1', title: 'Support', route_role: 'support' }, { id: 's2', title: 'Other', route_role: 'support' }];
  const view = { quizzes: [{ lesson_id: 'q1', scores: { st1: { submitted_at: '2026-10-01T00:00:00Z' } } }], markbook: { took: { st1: ['s1'] } } };
  const rows = mapRows(lessons, view, {}, 'st1');
  assert.deepEqual(rows.map((r) => [r.id, r.kind, r.done, r.assigned]), [['q1', 'quiz', true, true], ['s1', 'lesson', false, true], ['s2', 'lesson', false, false]]);
  assert.equal(mapRows(lessons, view, {}, 'st2')[0].done, false, 'another student has not submitted');
});

test('the teacher can list and remove a student\'s done records', async () => {
  const s = await fixture();
  await profileAction(s, 'class1', { action: 'done', class_token: token(1), lesson_id: 'l1' });
  const roster = await loadRoster(s, 'class1');
  const bob = roster.students.find((x) => x.initials === 'BB');
  const listed = await teacherProfileAction(s, 'class1', { action: 'list' });
  assert.deepEqual(Object.keys(listed.done[bob.id]), ['l1']);
  await teacherProfileAction(s, 'class1', { action: 'remove', student_id: bob.id, lesson_id: 'l1' });
  assert.deepEqual((await teacherProfileAction(s, 'class1', { action: 'list' })).done[bob.id] ?? {}, {});
});

test('the public endpoint answers JSON: need=initials for an unclaimed device, 404 for an unknown class', async () => {
  const { createPublishedProfileHandler } = await import('../../netlify/functions/published-profile.mjs');
  const s = await fixture();
  const handler = createPublishedProfileHandler({ env: {}, getContentStore: async () => s });
  const call = (id, body) => handler(new Request(`https://example.com/api/published/profile/${id}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
  const ok = await call('class1', { class_token: token(9) });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).data.need, 'initials');
  assert.equal((await call('nope', { class_token: token(9) })).status, 404);
  const bad = await handler(new Request('https://example.com/api/published/profile/class1', { method: 'POST', body: 'nope' }));
  assert.equal(bad.status, 400);
});
