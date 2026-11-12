import test from 'node:test';
import assert from 'node:assert/strict';
import { claimInitials, loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';
import { recordDone } from '../../netlify/functions/_shared/profile-done.mjs';
import { bigIdeaFor, lessonRouteAction, reasonSentence, shortTitle, whenPhrase } from '../../netlify/functions/_shared/lesson-route.mjs';

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
const NOW = new Date('2026-11-09T01:00:00Z'); // Monday 9 Nov in Sydney
const countdown = (id, due_date) => ({ id, type: 'block', block_type: 'countdown', visibility: 'student_teacher', content: { title: '', due_date, due_time: '09:00', set_date: '', note: '' } });
const lessonEntries = (id, title, blocks = [], extra = {}) => [[`lessons/${id}`, { id, title, ...extra }], [`published/lessons/${id}`, { id, title, blocks }]];
const DU = { id: 'du_abcd', claim: 'Setting carries a poem\'s meaning', why: '', dot_points: [], concept_bullets: [], pieces: [{ id: 'kp_aaaa', text: 'Imagery', tier: 'essential' }], shared_piece_ids: ['kp_shrd'], steps: [] };

async function setup({ unit = {}, l2 = {}, l5Blocks = [countdown('cd1', '2026-11-13')], schedule = [] } = {}) {
  const store = storeFixture([
    ['classes/class1', { id: 'class1', type: 'class', status: 'active', title: '9 English', current_unit_id: 'unit1', students: [{ name: 'Ana Ames' }, { name: 'Ben Bolt' }] }],
    ['units/unit1', { id: 'unit1', title: 'Poetry', lesson_ids: ['l1', 'l2', 'l3', 'side1', 'l4', 'l5', 'l6'], deep_understandings: [DU], ...unit }],
    ['markbook/class1', { columns: [], marks: {}, hidden_quizzes: [], focus: {}, took: {}, groups: [], history: [] }],
    ...lessonEntries('l1', 'Ghost poem'),
    ...lessonEntries('l2', 'Speaker and voice', [], l2),
    ...lessonEntries('l3', 'Sound and rhythm'),
    ...lessonEntries('side1', 'Extra reading', [], { route_role: 'extension' }),
    ...lessonEntries('l4', 'Final stanza'),
    ...lessonEntries('l5', 'Monthly Review', l5Blocks, { pedagogical_mode: 'assessment' }),
    ...lessonEntries('l6', 'Next poem'),
    ...schedule
  ]);
  const roster = await loadRoster(store, 'class1');
  const [ana] = roster.students;
  await claimInitials(store, roster, DEVICE, ana.initials);
  const ask = (lesson_id, device = DEVICE) => lessonRouteAction(store, roster, { action: 'lesson_route', lesson_id, class_token: device }, { now: NOW });
  return { store, roster, ana, ask };
}

test('route: done before, you are here, lessons left to the next assessment; side lessons not ticked are not counted', async () => {
  const { store, ana, ask } = await setup();
  await recordDone(store, 'class1', ana.id, 'l1', 'tick');
  const out = await ask('l3');
  assert.deepEqual(out.route, { before: 2, done: 1, here_index: 2, remaining: 1, assessment: { title: 'Monthly Review', short: 'Monthly Review', due_date: '2026-11-13', due_time: '09:00' } });
  assert.equal(out.reason, 'You\'ll need this for the Monthly Review on Friday.');
  assert.equal(out.big_idea, null);
});

test('route: the big idea joins the sentence when a focus piece belongs to a deep understanding (own or shared)', async () => {
  const { ask } = await setup({ l2: { focus_pieces: ['kp_shrd'] } });
  const out = await ask('l2');
  assert.equal(out.big_idea, 'Setting carries a poem\'s meaning');
  assert.equal(out.reason, 'You\'ll need this for the Monthly Review on Friday. It builds this big idea: Setting carries a poem\'s meaning.');
});

test('route: no assessment after the lesson and no big idea means no reason, so no button', async () => {
  const { ask } = await setup();
  const out = await ask('l6');
  assert.equal(out.reason, null);
  assert.equal(out.route.assessment, null);
});

test('route: a past countdown is skipped; the calendar day of an assessment lesson counts', async () => {
  const schedule = [['scheduled_lessons/s1', { id: 's1', class_id: 'class1', lesson_id: 'l5', date: '2026-11-24', start_time: '' }]];
  const { ask } = await setup({ l5Blocks: [countdown('cd1', '2026-11-01')], schedule });
  const again = await ask('l1');
  // The past block is gone; the lesson's day on the class calendar stands in.
  assert.equal(again.route.assessment?.due_date, '2026-11-24');
  assert.equal(again.route.remaining, 3);
  assert.equal(again.reason, 'You\'ll need this for the Monthly Review on Tuesday 24 November.');
});

test('route: a lesson outside the unit or unpublished gets nothing; a bad id is refused', async () => {
  const { store, ask } = await setup();
  assert.deepEqual(await ask('zz9'), { route: null, reason: null, big_idea: null });
  store.data.delete('published/lessons/l2');
  assert.deepEqual(await ask('l2'), { route: null, reason: null, big_idea: null });
  await assert.rejects(ask('../x'), /Unknown lesson/);
});

test('route: without a claim the core route still shows, nothing done', async () => {
  const { store, ana, ask } = await setup();
  await recordDone(store, 'class1', ana.id, 'l1', 'tick');
  const out = await ask('l3', 'c'.repeat(48));
  assert.equal(out.route.done, 0);
  assert.equal(out.route.before, 2);
});

test('helpers: short titles, when phrases, sentences, DU match by kp: tag', () => {
  assert.equal(shortTitle('Monthly Review'), 'Monthly Review');
  assert.equal(shortTitle('Week 3 Poetry Review'), 'Review');
  assert.equal(whenPhrase('2026-11-09', '2026-11-09'), 'today');
  assert.equal(whenPhrase('2026-11-10', '2026-11-09'), 'tomorrow');
  assert.equal(whenPhrase('2026-11-13', '2026-11-09'), 'on Friday');
  assert.equal(reasonSentence(null, 'Form shapes meaning.', '2026-11-09'), 'This builds a big idea: Form shapes meaning.');
  assert.equal(reasonSentence(null, null, '2026-11-09'), null);
  assert.equal(bigIdeaFor({ deep_understandings: [DU] }, { tags: ['kp:kp_aaaa'] }), DU.claim);
  assert.equal(bigIdeaFor({ deep_understandings: [DU] }, { focus_pieces: ['kp_zzzz'] }), null);
});
