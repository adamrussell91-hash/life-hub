// tests/unit/sprint-decide.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { sprintAction, setSprintClock } from '../../netlify/functions/_shared/sprint.mjs';
import { storeFor, who, INITIALS, CONFIG } from './helpers/sprint-store.js';

const act = (store, n, action, extra = {}) => sprintAction(store, 'sp1', { action, ...who(n), ...extra });
const card = (id, title) => ({ id, title, idea: `What if ${title}?`, answers: 'It answers it well enough.', evidence: 'For example, Source B.', criteria: { c1: 'Source B' }, requirements: {}, value_answer: 'It takes a different angle.' });

/** Both Kestrel students get through Understand and Sketch; returns the store at Decide. */
async function atDecide(config = CONFIG()) {
  setSprintClock(() => Date.parse('2026-11-01T00:00:00Z'));
  const store = storeFor(config);
  for (const n of [1, 2]) await act(store, n, 'claim', { initials: INITIALS[n] });
  const s = await act(store, 1, 'save', { phase: 'understand', payload: { notes: ['How might we a?'], star: '', stretch: '' } });
  const star = s.notes[0].id;
  for (const n of [1, 2]) await act(store, n, 'submit', { phase: 'understand', payload: { notes: [`How might we ${n}?`], star, stretch: '' } });
  await act(store, 1, 'submit', { phase: 'sketch', payload: { cards: [card('k1', 'Ash'), card('k2', 'Streets')], strongest: 'k2', strongest_why: 'It compares then and now.' } });
  await act(store, 2, 'submit', { phase: 'sketch', payload: { cards: [card('k1', 'Baker')], strongest: 'k1', strongest_why: 'One person’s day.' } });
  return store;
}

test('the gallery shows every set with no authors, strongest first', async () => {
  const store = await atDecide();
  const s = await act(store, 1, 'status');
  assert.equal(s.gallery.length, 2);
  const titles = s.gallery.flatMap((set) => set.ideas.map((i) => i.title)).sort();
  assert.deepEqual(titles, ['Ash', 'Baker', 'Streets']);
  const mine = s.gallery.find((set) => set.ideas.some((i) => i.title === 'Ash'));
  assert.equal(mine.ideas[0].title, 'Streets');
  assert.equal(JSON.stringify(s.gallery).match(/st_|student|owner/), null);
});

/** One student's head-to-heads over the pool: `win` beats every other idea, stronger in `stronger`. */
const duelsFor = (s, win, stronger = ['c1']) => {
  const ids = s.pool.map((i) => i.id);
  const w = s.pool.find((i) => i.title === win).id;
  const out = [];
  ids.forEach((a, n) => ids.slice(n + 1).forEach((b) => out.push({ a, b, winner: a === w || b === w ? w : a, stronger, why: '' })));
  return { duels: out };
};

test('the head-to-heads use each member’s strongest idea only, with no authors', async () => {
  const store = await atDecide();
  const s = await act(store, 1, 'status');
  assert.deepEqual(s.pool.map((i) => i.title).sort(), ['Baker', 'Streets']);
  assert.equal(JSON.stringify(s.pool).match(/st_|student|owner/), null);
});

test('head-to-heads must name pool ideas, and the winner must be one of the pair', async () => {
  const store = await atDecide();
  const s = await act(store, 1, 'status');
  const [x, y] = s.pool.map((i) => i.id);
  const ash = s.gallery.flatMap((g) => g.ideas).find((i) => i.title === 'Ash').id;
  await assert.rejects(act(store, 1, 'save', { phase: 'decide', payload: { duels: [{ a: x, b: ash, winner: x, stronger: [] }] } }), { code: 'bad_vote' });
  await assert.rejects(act(store, 1, 'save', { phase: 'decide', payload: { duels: [{ a: x, b: y, winner: ash, stronger: [] }] } }), { code: 'bad_vote' });
  const saved = await act(store, 1, 'save', { phase: 'decide', payload: { duels: [{ a: x, b: y, winner: x, stronger: ['c1', 'c9'] }, { a: y, b: x, winner: y, stronger: ['c2'] }] } });
  assert.deepEqual(saved.mine.decide.duels.map((d) => [d.winner, d.stronger]), [[y, ['c2']]]);
});

test('most wins goes through once everyone has finished; students see the top three and the strongest in each criterion, never counts', async () => {
  const store = await atDecide();
  const s = await act(store, 1, 'status');
  await act(store, 1, 'save', { phase: 'decide', payload: duelsFor(s, 'Baker', ['c1', 'c2']) });
  const before = await act(store, 1, 'status');
  assert.equal(before.results, null);
  await act(store, 2, 'save', { phase: 'decide', payload: duelsFor(s, 'Baker', ['c2']) });
  const after = await act(store, 1, 'status');
  assert.equal(after.votes_closed, true);
  assert.equal(after.chosen.title, 'Baker');
  assert.equal(after.results.unanimous, true);
  assert.deepEqual(after.results.ranking.map((r) => r.title), ['Baker']);
  assert.deepEqual(after.results.best_at.map((b) => [b.criterion, b.ideas.map((i) => i.title)]), [['c1', ['Baker']], ['c2', ['Baker']]]);
  assert.equal(JSON.stringify(after.results).match(/"(count|wins|totals)"/), null);
  // Once closed, a changed ballot keeps the head-to-heads as they were.
  const kept = await act(store, 1, 'save', { phase: 'decide', payload: duelsFor(s, 'Streets') });
  assert.equal(kept.mine.decide.duels[0].winner, s.pool.find((i) => i.title === 'Baker').id);
});

test('a level finish on wins goes to the teacher', async () => {
  const store = await atDecide();
  const s = await act(store, 1, 'status');
  await act(store, 1, 'save', { phase: 'decide', payload: duelsFor(s, 'Baker') });
  await act(store, 2, 'save', { phase: 'decide', payload: duelsFor(s, 'Streets') });
  const after = await act(store, 1, 'status');
  assert.equal(after.votes_closed, true);
  assert.equal(after.chosen, null);
  assert.deepEqual(after.awaiting, { kind: 'idea' });
  assert.equal(after.results.unanimous, false);
});

test('submitting Decide needs a winner in every match-up', async () => {
  const store = await atDecide();
  await assert.rejects(act(store, 1, 'submit', { phase: 'decide', payload: { duels: [] } }), { code: 'need_duels' });
});

test('with the teacher as decider the group waits', async () => {
  const store = await atDecide({ ...CONFIG(), decider: 'teacher' });
  const s1 = await act(store, 1, 'status');
  assert.equal(s1.question, null);
  assert.deepEqual(s1.awaiting, { kind: 'question' });
});

test('parts: written once the idea is chosen, one claim each, then Decide can be submitted', async () => {
  const store = await atDecide();
  const s = await act(store, 1, 'status');
  const ballot = duelsFor(s, 'Baker');
  await assert.rejects(act(store, 1, 'parts', { parts: [{ id: 'p1', text: 'Panel text', shows: '', criterion: 'c1' }] }), { code: 'no_idea_yet' });
  for (const n of [1, 2]) await act(store, n, 'save', { phase: 'decide', payload: ballot });
  const withParts = await act(store, 1, 'parts', { parts: [{ id: 'p1', text: 'Panel text', shows: 'The morning', criterion: 'c1' }, { id: 'p2', text: 'Artefact list', shows: '', criterion: 'c2' }] });
  assert.equal(withParts.parts.length, 2);
  await act(store, 1, 'claim_part', { part_id: 'p1' });
  await assert.rejects(act(store, 2, 'claim_part', { part_id: 'p1' }), { code: 'part_taken' });
  const claimed = await act(store, 2, 'claim_part', { part_id: 'p2' });
  assert.deepEqual(claimed.parts.map((p) => [p.id, p.claimed, p.mine]), [['p1', 1, false], ['p2', 1, true]]);
  const sent = await act(store, 2, 'submit', { phase: 'decide', payload: ballot });
  assert.equal(sent.phases[2].state, 'in');
});

test('Sketch keeps the inspiration and rapid ideas private; only the starred cards reach the gallery', async () => {
  setSprintClock(() => Date.parse('2026-11-01T00:00:00Z'));
  const store = storeFor();
  for (const n of [1, 2]) await act(store, n, 'claim', { initials: INITIALS[n] });
  const s = await act(store, 1, 'save', { phase: 'understand', payload: { notes: ['How might we a?'], star: '', stretch: '' } });
  for (const n of [1, 2]) await act(store, n, 'submit', { phase: 'understand', payload: { notes: [`How might we ${n}?`], star: s.notes[0].id, stretch: '' } });
  const sketch = { inspiration: [{ from: 'A museum audio guide', borrow: 'One voice talking to you' }], rapid: ['Ash', 'Streets', 'A private rough idea'], rapid_started_at: '2026-11-03T10:00:00.000Z', cards: [{ ...card('k1', 'Ash'), seed: 'Ash' }], strongest: 'k1', strongest_why: 'Only one.' };
  const saved = await act(store, 1, 'submit', { phase: 'sketch', payload: sketch });
  assert.deepEqual(saved.mine.sketch.rapid, sketch.rapid);
  assert.equal(saved.mine.sketch.rapid_started_at, sketch.rapid_started_at);
  await act(store, 2, 'submit', { phase: 'sketch', payload: { cards: [card('k1', 'Baker')], strongest: 'k1', strongest_why: 'One person’s day.' } });
  const decide = await act(store, 2, 'status');
  const gallery = JSON.stringify(decide.gallery);
  assert.deepEqual(decide.gallery.flatMap((set) => set.ideas.map((i) => i.title)).sort(), ['Ash', 'Baker']);
  assert.ok(!gallery.includes('A private rough idea') && !gallery.includes('museum audio guide'));
});

test('parts are given to group members by their initials: one person a part unless there are more people than parts, and someone can take two parts', async () => {
  const store = await atDecide();
  const s = await act(store, 1, 'status');
  const ballot = duelsFor(s, 'Baker');
  for (const n of [1, 2]) await act(store, n, 'save', { phase: 'decide', payload: ballot });
  let v = await act(store, 1, 'parts', { parts: [{ id: 'p1', text: 'Panel text', shows: '', how: 'Draw it in Canva.', criterion: 'c1' }, { id: 'p2', text: 'Artefact list', shows: '', criterion: 'c2' }] });
  assert.deepEqual(v.parts.map((p) => p.how), ['Draw it in Canva.', '']);
  assert.equal((await act(store, 2, 'status')).parts[0].how, 'Draw it in Canva.');
  await assert.rejects(act(store, 1, 'parts', { parts: [{ id: 'p1', text: 'Panel text', how: 'x'.repeat(401), criterion: 'c1' }] }), { code: 'bad_parts' });
  assert.deepEqual(v.members.map((m) => [m.initials, m.me]), [['AB', true], ['CD', false]]);
  assert.ok(!JSON.stringify(v.members).includes('st_'));
  const [ann, cy] = v.members.map((m) => m.key);
  await assert.rejects(act(store, 2, 'submit', { phase: 'decide', payload: ballot }), { code: 'need_part' });
  await assert.rejects(act(store, 1, 'assign', { part_id: 'p1', keys: [ann, cy] }), { code: 'too_many' });
  await assert.rejects(act(store, 1, 'assign', { part_id: 'p1', keys: ['stranger'] }), { code: 'bad_member' });
  await act(store, 1, 'assign', { part_id: 'p1', keys: [cy] });
  v = await act(store, 2, 'assign', { part_id: 'p2', keys: [ann] });
  assert.deepEqual(v.parts.map((p) => [p.id, p.assigned, p.mine]), [['p1', [cy], true], ['p2', [ann], false]]);
  v = await act(store, 2, 'assign', { part_id: 'p2', keys: [cy] });
  assert.deepEqual(v.parts.map((p) => p.assigned), [[cy], [cy]]);
  const sent = await act(store, 2, 'submit', { phase: 'decide', payload: ballot });
  assert.equal(sent.phases[2].state, 'in');
});

test('the group picks an assembler in Decide; in Prototype everyone sees every part, and only the assembler sets the finished prototype', async () => {
  const store = await atDecide({ ...CONFIG(), assemble: true });
  const s = await act(store, 1, 'status');
  const ballot = duelsFor(s, 'Baker');
  for (const n of [1, 2]) await act(store, n, 'save', { phase: 'decide', payload: ballot });
  let v = await act(store, 1, 'parts', { parts: [{ id: 'p1', text: 'Panel text', shows: '', criterion: 'c1' }, { id: 'p2', text: 'Artefact list', shows: '', criterion: 'c2' }] });
  const [ann, cy] = v.members.map((m) => m.key);
  await act(store, 1, 'assign', { part_id: 'p1', keys: [ann] });
  await act(store, 1, 'assign', { part_id: 'p2', keys: [cy] });
  assert.equal(v.assemble, true);
  await assert.rejects(act(store, 1, 'submit', { phase: 'decide', payload: ballot }), { code: 'need_assembler' });
  v = await act(store, 2, 'assembler', { key: cy });
  assert.deepEqual(v.assembler, { key: cy, initials: 'CD', me: true });
  for (const n of [1, 2]) await act(store, n, 'submit', { phase: 'decide', payload: ballot });
  await act(store, 1, 'save', { phase: 'prototype', payload: { text: 'The baker’s morning, in 80 words.', link: 'https://example.com/panel' } });
  v = await act(store, 2, 'status');
  assert.deepEqual(v.group_parts.map((r) => [r.part, r.who, r.started, r.in]), [['Panel text', 'AB', true, false], ['Artefact list', 'CD', false, false]]);
  assert.equal(v.group_parts[0].text, 'The baker’s morning, in 80 words.');
  await assert.rejects(act(store, 1, 'pitch', { link: 'https://example.com/finished' }), { code: 'not_assembler' });
  v = await act(store, 2, 'pitch', { link: 'https://example.com/finished' });
  assert.equal(v.pitch.link, 'https://example.com/finished');
});

test('members say who has finished their head-to-heads', async () => {
  const store = await atDecide({ ...CONFIG(), decider: 'teacher' });
  const s = await act(store, 1, 'status');
  assert.equal(s.decider, 'teacher');
  const v = await act(store, 1, 'save', { phase: 'decide', payload: duelsFor(s, 'Baker') });
  assert.deepEqual(v.members.map((m) => [m.initials, m.done]), [['AB', true], ['CD', false]]);
});

test('switching to students choose settles groups already waiting on the teacher with a clear winner', async () => {
  const store = await atDecide({ ...CONFIG(), decider: 'teacher' });
  const s1 = await act(store, 1, 'status');
  assert.deepEqual(s1.awaiting, { kind: 'question' });
  const { sprintKeys } = await import('../../netlify/functions/_shared/sprint-keys.mjs');
  const key = sprintKeys('sp1').config;
  store.data.set(key, { ...store.data.get(key), decider: 'top_vote' });
  const s2 = await act(store, 1, 'status');
  assert.ok(s2.question?.text);
  assert.equal(s2.awaiting, null);
  for (const n of [1, 2]) await act(store, n, 'save', { phase: 'decide', payload: duelsFor(s2, 'Baker') });
  const s3 = await act(store, 1, 'status');
  assert.equal(s3.chosen.title, 'Baker');
});

test('a group waiting on the teacher for its idea goes through once the teacher switches to students choose', async () => {
  const store = await atDecide();
  const { sprintKeys } = await import('../../netlify/functions/_shared/sprint-keys.mjs');
  const key = sprintKeys('sp1').config;
  const s = await act(store, 1, 'status');
  store.data.set(key, { ...store.data.get(key), decider: 'teacher' });
  for (const n of [1, 2]) await act(store, n, 'save', { phase: 'decide', payload: duelsFor(s, 'Baker') });
  const waiting = await act(store, 1, 'status');
  assert.deepEqual(waiting.awaiting, { kind: 'idea' });
  assert.equal(waiting.chosen, null);
  store.data.set(key, { ...store.data.get(key), decider: 'top_vote' });
  const after = await act(store, 1, 'status');
  assert.equal(after.chosen.title, 'Baker');
  assert.equal(after.awaiting, null);
});
