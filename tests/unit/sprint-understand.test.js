// tests/unit/sprint-understand.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { sprintAction, sprintTeacherAction, setSprintClock, prepareSprintPublish } from '../../netlify/functions/_shared/sprint.mjs';
import { storeFor, who, INITIALS, CONFIG, DRAFT } from './helpers/sprint-store.js';

const act = (store, n, action, extra = {}) => sprintAction(store, 'sp1', { action, ...who(n), ...extra });
const teach = (store, action, extra = {}) => sprintTeacherAction(store, 'sp1', { action, ...extra });
const work = (over = {}) => ({
  spot: ['viva'],
  audience: { who: 'Year 12 students', why: 'They need a fair go.' },
  dig: ['We need questions.', 'Some only test memory.'],
  say: 'Students need questions that make them think on the spot.',
  limits: { can_known: ['Which poems'], cant_known: ['Five minutes'], can_unknown: ['How hard the follow-ups are'], cant_unknown: ['What a Band 6 answer sounds like'] },
  ...over
});

async function start() {
  setSprintClock(() => Date.parse('2026-11-01T00:00:00Z'));
  const store = storeFor();
  for (const n of [1, 2]) await act(store, n, 'claim', { initials: INITIALS[n] });
  return store;
}

test('each problem statement goes up to the group without a name, and is what the group votes on', async () => {
  const store = await start();
  await act(store, 1, 'save', { phase: 'understand', payload: work() });
  const s = await act(store, 2, 'save', { phase: 'understand', payload: work({ say: 'Teachers need to mark everyone the same way.' }) });
  assert.deepEqual(s.notes.map((n) => n.text).sort(), ['Students need questions that make them think on the spot.', 'Teachers need to mark everyone the same way.'].sort());
  assert.ok(!JSON.stringify(s.notes).includes('st_'));
  const star = s.notes.find((n) => n.text.startsWith('Students')).id;
  for (const n of [1, 2]) await act(store, n, 'submit', { phase: 'understand', payload: work({ say: n === 1 ? 'Students need questions that make them think on the spot.' : 'Teachers need to mark everyone the same way.', star }) });
  const after = await act(store, 1, 'status');
  assert.equal(after.brief.problem, 'Students need questions that make them think on the spot.');
});

test('submitting needs the problem in their own words and a star, unless those steps are off', async () => {
  const store = await start();
  await assert.rejects(act(store, 1, 'submit', { phase: 'understand', payload: work({ say: '' }) }), { code: 'need_say' });
  await assert.rejects(act(store, 1, 'submit', { phase: 'understand', payload: work() }), { code: 'need_star' });
  const off = storeFor({ ...CONFIG(), understand: { say: false, vote: false } });
  for (const n of [1, 2]) await act(off, n, 'claim', { initials: INITIALS[n] });
  const sent = await act(off, 1, 'submit', { phase: 'understand', payload: work({ say: '' }) });
  assert.equal(sent.phases.find((p) => p.key === 'understand').state, 'in');
});

test('the shared space stacks everyone’s audiences and limits, and the group agrees one audience', async () => {
  const store = await start();
  await act(store, 1, 'save', { phase: 'understand', payload: work() });
  await act(store, 2, 'save', { phase: 'understand', payload: work({ audience: { who: 'year 12  students', why: 'Marks matter.' } }) });
  const s = await act(store, 1, 'status');
  assert.deepEqual(s.understand_group.who, [{ text: 'Year 12 students', count: 2 }]);
  assert.deepEqual(s.understand_group.limits.cant_unknown, [{ text: 'What a Band 6 answer sounds like', count: 2 }]);
  const agreed = await act(store, 2, 'audience', { who: 'Year 12 students sitting the viva', why: 'A fair chance to show what they understand.' });
  assert.deepEqual(agreed.understand_group.audience, { who: 'Year 12 students sitting the viva', why: 'A fair chance to show what they understand.' });
  assert.equal(agreed.brief.audience.who, 'Year 12 students sitting the viva');
});

test('questions come from the unknowns, the group stars up to 3 and sends them, and the teacher’s answer comes back', async () => {
  const store = await start();
  await act(store, 1, 'save', { phase: 'understand', payload: work() });
  let s = await act(store, 2, 'ask_add', { text: 'Can we use unseen lines?' });
  assert.deepEqual(s.understand_group.questions.map((q) => q.text), ['How hard the follow-ups are', 'What a Band 6 answer sounds like', 'Can we use unseen lines?']);
  for (const q of s.understand_group.questions) s = await act(store, 1, 'ask_pick', { id: q.id });
  await assert.rejects(act(store, 1, 'ask_add', { text: '  ' }), { code: 'empty' });
  s = await act(store, 2, 'ask_add', { text: 'A fourth one?' });
  const fourth = s.understand_group.questions.find((q) => q.text === 'A fourth one?');
  await assert.rejects(act(store, 1, 'ask_pick', { id: fourth.id }), { code: 'too_many' });
  s = await act(store, 1, 'ask_send');
  assert.equal(s.understand_group.sent.length, 3);
  assert.ok(s.understand_group.sent.every((q) => q.answer === null));
  const summary = await teach(store, 'summary');
  assert.equal(summary.groups[0].asked, 3);
  const board = await teach(store, 'board', { group_id: 'g1' });
  const band6 = board.understand.sent.find((q) => q.text.startsWith('What a Band 6'));
  await teach(store, 'answer', { group_id: 'g1', id: band6.id, text: 'It names the technique, quotes the line and explains the effect.' });
  s = await act(store, 2, 'status');
  assert.deepEqual(s.brief.answers, [{ question: 'What a Band 6 answer sounds like', answer: 'It names the technique, quotes the line and explains the effect.' }]);
  assert.equal((await teach(store, 'summary')).groups[0].asked, 2);
  await assert.rejects(teach(store, 'answer', { group_id: 'g1', id: 'nope', text: 'x' }), { code: 'not_found' });
});

test('a switched-off step refuses its group writes', async () => {
  const store = storeFor({ ...CONFIG(), understand: { merge: false, ask: false } });
  setSprintClock(() => Date.parse('2026-11-01T00:00:00Z'));
  await act(store, 1, 'claim', { initials: INITIALS[1] });
  await assert.rejects(act(store, 1, 'audience', { who: 'x', why: 'y' }), { code: 'step_off' });
  await assert.rejects(act(store, 1, 'ask_add', { text: 'x' }), { code: 'step_off' });
});

test('publishing carries the Understand layout to students and the steps to the server', () => {
  const draft = { ...DRAFT(), sprint: { ...DRAFT().sprint, support: 'standard', reflection_criteria: [], reflection_prompts: [], requirements: [], idea_guide: { checklist: ['x'], model: { topic: 't', text: 'm', notes: [] } }, understand: { layout: 'vertical', steps: { dig: false } } } };
  const { snapshot, config } = prepareSprintPublish(draft, []);
  assert.equal(snapshot.sprint.understand.layout, 'vertical');
  assert.equal(snapshot.sprint.understand.steps.dig, false);
  assert.equal(snapshot.sprint.understand.steps.spot, true);
  assert.equal(config.understand.dig, false);
});
