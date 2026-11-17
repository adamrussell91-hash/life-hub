import test from 'node:test';
import assert from 'node:assert/strict';
import { claimInitials, loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';
import { profileAction } from '../../netlify/functions/_shared/profile.mjs';
import { teacherShareAction } from '../../netlify/functions/_shared/progress-share.mjs';
import { burstsOf, tickRows, shareAction, shareProfile, SHARE_DROP, SHARE_PAGE_KEYS } from '../../netlify/functions/_shared/progress-share-page.mjs';

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

const DEVICE = 'a'.repeat(48);
const VIEWER = 'c'.repeat(48);
const NOW = new Date('2026-11-15T01:00:00Z');
const minute = (m) => new Date(Date.UTC(2026, 10, 10, 10, m)).toISOString();

test('burstsOf: 5 ticks on 5 lessons in 4 minutes is one burst', () => {
  const events = [0, 1, 2, 3, 4].map((m, i) => ({ lesson_id: `l${i}`, at: minute(m), kind: 'tick' }));
  assert.deepEqual(burstsOf(events), [{ from: minute(0), to: minute(4), count: 5 }]);
});

test('burstsOf: 2 ticks is no burst; quiz and untick never count; re-ticks of one lesson count once', () => {
  assert.deepEqual(burstsOf([{ lesson_id: 'l1', at: minute(0), kind: 'tick' }, { lesson_id: 'l2', at: minute(1), kind: 'tick' }]), []);
  assert.deepEqual(burstsOf([
    { lesson_id: 'l1', at: minute(0), kind: 'tick' }, { lesson_id: 'l2', at: minute(1), kind: 'quiz' }, { lesson_id: 'l3', at: minute(2), kind: 'untick' }
  ]), []);
  assert.deepEqual(burstsOf([
    { lesson_id: 'l1', at: minute(0), kind: 'tick' }, { lesson_id: 'l1', at: minute(1), kind: 'tick' }, { lesson_id: 'l2', at: minute(2), kind: 'tick' }
  ]), []);
});

test('burstsOf: ticks 11 minutes apart do not join', () => {
  const events = [0, 11, 22].map((m, i) => ({ lesson_id: `l${i}`, at: minute(m), kind: 'tick' }));
  assert.deepEqual(burstsOf(events), []);
});

test('tickRows: keeps the first tick time after untick and re-tick, reads an old tick with no record, adds the planned date', () => {
  const rows = tickRows({
    lessons: [{ id: 'l1', title: 'One' }, { id: 'l2', title: 'Two' }, { id: 'l3', title: 'Three' }],
    doneIds: new Set(['l1', 'l2', 'l3']),
    done: { l1: { at: minute(30), via: 'tick' }, l2: { at: minute(5), via: 'tick' }, l3: { at: minute(8), via: 'teacher' } },
    records: { l1: [{ at: minute(0), kind: 'tick' }, { at: minute(20), kind: 'untick' }, { at: minute(30), kind: 'tick' }] },
    submitted: {},
    planned: { l2: '2026-11-03' }
  });
  const byId = Object.fromEntries(rows.map((r) => [r.lesson_id, r]));
  assert.equal(byId.l1.at, minute(0));
  assert.equal(byId.l1.record.length, 3);
  assert.deepEqual(byId.l2.record, [{ at: minute(5), kind: 'tick' }]);
  assert.equal(byId.l2.planned, '2026-11-03');
  assert.equal(byId.l3.via, 'teacher');
  assert.deepEqual(rows.map((r) => r.lesson_id), ['l3', 'l2', 'l1']); // newest first: teacher mark at :08, tick at :05, first tick at :00
});

async function setup() {
  const store = storeFixture([
    ['classes/class1', { id: 'class1', type: 'class', status: 'active', title: '9 English', current_unit_id: 'unit1', students: [{ name: 'Ana Ames' }, { name: 'Ben Bolt' }] }],
    ['units/unit1', { id: 'unit1', title: 'Poetry', lesson_ids: ['l1', 'l2', 'l3'] }],
    ['markbook/class1', { columns: [], marks: {}, hidden_quizzes: [], focus: {}, took: {}, groups: [], history: [] }],
    ['lessons/l1', { id: 'l1', title: 'Ghost poem' }], ['published/lessons/l1', { id: 'l1', title: 'Ghost poem', blocks: [] }],
    ['lessons/l2', { id: 'l2', title: 'Speaker and voice' }], ['published/lessons/l2', { id: 'l2', title: 'Speaker and voice', blocks: [] }],
    ['lessons/l3', { id: 'l3', title: 'Sound and rhythm' }], ['published/lessons/l3', { id: 'l3', title: 'Sound and rhythm', blocks: [] }],
    ['scheduled_lessons/s1', { id: 's1', class_id: 'class1', lesson_id: 'l1', date: '2026-11-03' }]
  ]);
  const roster = await loadRoster(store, 'class1');
  const [ana] = roster.students;
  await claimInitials(store, roster, DEVICE, ana.initials);
  await profileAction(store, 'class1', { action: 'done', lesson_id: 'l1', class_token: DEVICE });
  const made = await teacherShareAction(store, 'class1', { action: 'add', student_id: ana.id, initials: 'PT' }, { now: NOW });
  const share = made.shares.find((s) => s.token === made.made);
  return { store, token: share.token, pin: share.pin };
}

const keysDeep = (value, out = new Set()) => {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { out.add(k); keysDeep(v, out); }
  return out;
};

test('page before sign-in asks for it and says nothing else', async () => {
  const { store, token } = await setup();
  assert.deepEqual(await shareAction(store, token, { action: 'page', device_token: VIEWER }, { now: NOW }), { need: 'sign_in' });
});

test('signed in, the page is the student’s own progress, cut for a viewer', async () => {
  const { store, token, pin } = await setup();
  const page = await shareAction(store, token, { action: 'sign_in', device_token: VIEWER, initials: 'PT', pin }, { now: NOW });
  const { profile, ...rest } = page;
  for (const key of keysDeep(rest)) assert.ok(SHARE_PAGE_KEYS.has(key), `unexpected key ${key}`);
  for (const banned of ['name', 'code', 'rubric', 'score', 'scores', 'text', 'feedback_text', 'marks', 'notes', 'announcements']) assert.equal(keysDeep(rest).has(banned), false, banned);
  for (const key of SHARE_DROP) assert.equal(key in profile, false, key);
  assert.equal(JSON.stringify(page).includes('Ana Ames'), false);
  assert.equal(page.student.first_name, 'Ana');
  assert.equal(page.viewer_initials, 'PT');
  // The same map and To do the student gets.
  const own = await profileAction(store, 'class1', { action: 'progress', class_token: DEVICE }, { now: NOW });
  assert.deepEqual(profile.map, own.map);
  assert.deepEqual(profile.todo, own.todo);
  assert.equal(profile.map.lessons.filter((l) => l.done).length, 1);
  assert.equal(page.ticks[0].lesson_id, 'l1');
  assert.equal(page.ticks[0].planned, '2026-11-03');
  assert.deepEqual(page.lesson_ids, ['l1', 'l2', 'l3']);
  // Later visits from the same browser need only the link.
  const again = await shareAction(store, token, { action: 'page', device_token: VIEWER }, { now: NOW });
  assert.equal(again.viewer_initials, 'PT');
});

test('shareProfile drops the returned-work hooks and every quoted word or comment', () => {
  const cut = shareProfile({ need: null, initials: 'AA', code: 'bird-88', pointer: true, unseen: 2, has_returned: true, next: [{ action: 'Quote more' }], feedback: { pieces: [{ id: 'p1' }], rows: [{ code_id: 'c1', label: 'Evidence', hit: 2, of: 3, positive: false, hits: [{ piece_id: 'p1', words: 'their sentence', note: 'teacher comment' }] }] } });
  assert.deepEqual(Object.keys(cut).sort(), ['feedback', 'need', 'next']);
  assert.deepEqual(cut.feedback.rows[0].hits, []);
  assert.equal(cut.feedback.rows[0].label, 'Evidence');
  assert.equal(JSON.stringify(cut).includes('teacher comment'), false);
});

test('sign out sends the browser back to the form', async () => {
  const { store, token, pin } = await setup();
  await shareAction(store, token, { action: 'sign_in', device_token: VIEWER, initials: 'PT', pin }, { now: NOW });
  assert.deepEqual(await shareAction(store, token, { action: 'sign_out', device_token: VIEWER }, { now: NOW }), { need: 'sign_in' });
  assert.deepEqual(await shareAction(store, token, { action: 'page', device_token: VIEWER }, { now: NOW }), { need: 'sign_in' });
});

test('the student’s own progress payload is unchanged by the tick record', async () => {
  const { store } = await setup();
  const own = await profileAction(store, 'class1', { action: 'progress', class_token: DEVICE }, { now: NOW });
  assert.equal(JSON.stringify(own).includes('"record"'), false);
  assert.equal(JSON.stringify(own).includes('"bursts"'), false);
});
