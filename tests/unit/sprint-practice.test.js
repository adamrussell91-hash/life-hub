// tests/unit/sprint-practice.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { sprintAction, setSprintClock } from '../../netlify/functions/_shared/sprint.mjs';
import { sprintPracticeAction } from '../../netlify/functions/_shared/sprint-practice.mjs';
import { storeFor, who, INITIALS, DRAFT } from './helpers/sprint-store.js';

const draft = () => {
  const d = DRAFT();
  return { ...d, blocks: [], sprint: { ...d.sprint, reflection_criteria: [{ id: 'reflect', text: 'Reflects' }], requirements: [{ id: 'r1', text: 'Has a title', phases: ['sketch'] }], idea_guide: { checklist: ['It answers our question.'], model: { topic: 'Bridges', text: 'One bolt’s story.', notes: [] } } } };
};
const practice = (store, op, extra = {}) => sprintPracticeAction(store, 'sp1', { op, ...extra });

test('a practice run starts at 9 am on Understand’s close day with two pretend students', async () => {
  const store = storeFor();
  const s = await practice(store, 'start', { draft: draft() });
  assert.equal(new Date(s.now).toISOString(), '2026-11-01T22:00:00.000Z');
  assert.deepEqual(s.summary.groups[0].students.map((x) => x.initials), ['S1', 'S2']);
  assert.equal(s.students.s1.identity.initials, 'S1');
  assert.equal(s.lesson.sprint.criteria.length, 2);
  assert.equal(s.next.label, 'Understand closing (Mon 3:00 pm)');
});

test('practice work stays apart from the class and its clock', async () => {
  setSprintClock(() => Date.parse('2026-11-01T00:00:00Z'));
  const store = storeFor();
  await practice(store, 'start', { draft: draft() });
  await practice(store, 'student', { as: 's1', body: { action: 'save', phase: 'understand', payload: { notes: ['How might we a?'], star: '', stretch: '' } } });
  await practice(store, 'skip');
  assert.ok([...store.data.keys()].filter((k) => k.startsWith('sprint/sp1/')).every((k) => k === 'sprint/sp1/config'));
  // The class still runs on the real clock: Understand is open, nothing else.
  await sprintAction(store, 'sp1', { action: 'claim', ...who(1), initials: INITIALS[1] });
  const real = await sprintAction(store, 'sp1', { action: 'status', ...who(1) });
  assert.deepEqual(real.phases.filter((p) => p.open).map((p) => p.key), ['understand']);
  setSprintClock();
});

test('skip moves the practice clock and opens the next phase; start wipes the run', async () => {
  const store = storeFor();
  await practice(store, 'start', { draft: draft() });
  const s = await practice(store, 'skip');
  assert.equal(new Date(s.now).toISOString(), '2026-11-02T04:00:00.000Z');
  assert.deepEqual(s.summary.groups[0].open, ['understand', 'sketch']);
  const again = await practice(store, 'start', { draft: draft() });
  assert.deepEqual(again.summary.groups[0].open, ['understand']);
});

test('a missing close stops the run before it starts', async () => {
  const store = storeFor();
  const d = draft();
  d.sprint.phases[2].due_date = '';
  await assert.rejects(practice(store, 'start', { draft: d }), { code: 'need_closes' });
  await assert.rejects(practice(store, 'state'), { code: 'not_started' });
  const one = draft();
  one.sprint.criteria = one.sprint.criteria.slice(0, 1);
  await assert.rejects(practice(store, 'start', { draft: one }), { code: 'need_criteria' });
});
