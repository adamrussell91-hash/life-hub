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

test('votes must name gallery ideas and known criteria', async () => {
  const store = await atDecide();
  const s = await act(store, 1, 'status');
  await assert.rejects(act(store, 1, 'save', { phase: 'decide', payload: { votes: { c1: 'nope' }, reasons: {}, opened: [] } }), { code: 'bad_vote' });
  await assert.rejects(act(store, 1, 'save', { phase: 'decide', payload: { votes: { c9: s.gallery[0].ideas[0].id }, reasons: {}, opened: [] } }), { code: 'bad_vote' });
});

test('top vote goes through once everyone has voted; students see heat, never counts', async () => {
  const store = await atDecide();
  const s = await act(store, 1, 'status');
  const baker = s.gallery.flatMap((x) => x.ideas).find((i) => i.title === 'Baker').id;
  const ash = s.gallery.flatMap((x) => x.ideas).find((i) => i.title === 'Ash').id;
  const votes = (a, b) => ({ votes: { c1: a, c2: b }, reasons: { c1: 'It names a source.', c2: 'It says why.' }, opened: s.gallery.map((x) => x.id) });
  await act(store, 1, 'save', { phase: 'decide', payload: votes(baker, baker) });
  const before = await act(store, 1, 'status');
  assert.equal(before.heat, null);
  await act(store, 2, 'save', { phase: 'decide', payload: votes(baker, ash) });
  const after = await act(store, 1, 'status');
  assert.equal(after.votes_closed, true);
  assert.equal(after.chosen.title, 'Baker');
  assert.deepEqual(after.heat[baker], { c1: 3, c2: 3 });
  assert.equal(JSON.stringify(after.heat).includes('"2"'), false);
  await assert.rejects(act(store, 1, 'save', { phase: 'decide', payload: votes(ash, ash) }), { code: 'votes_closed' });
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
  const baker = s.gallery.flatMap((x) => x.ideas).find((i) => i.title === 'Baker').id;
  const ballot = { votes: { c1: baker, c2: baker }, reasons: { c1: 'It names a source.', c2: 'It says why it matters.' }, opened: s.gallery.map((x) => x.id) };
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

test('stand-out dots: all must be placed, only on gallery ideas, hidden until voting closes, then the most-dotted parts of ideas not chosen are worth borrowing', async () => {
  const store = await atDecide({ ...CONFIG(), dots: 2 });
  const s = await act(store, 1, 'status');
  assert.equal(s.dots, 2);
  const id = (t) => s.gallery.flatMap((x) => x.ideas).find((i) => i.title === t).id;
  const ballot = (dots) => ({ votes: { c1: id('Baker'), c2: id('Baker') }, reasons: { c1: 'It names a source.', c2: 'It says why it matters.' }, opened: s.gallery.map((x) => x.id), dots });
  const saved = await act(store, 1, 'save', { phase: 'decide', payload: ballot([{ idea: id('Ash'), part: 'evidence', note: 'Source B is strong' }, { idea: 'nope', part: 'idea' }]) });
  assert.deepEqual(saved.mine.decide.dots.map((d) => d.part), ['evidence']);
  assert.equal(saved.dot_counts, null);
  await assert.rejects(act(store, 1, 'submit', { phase: 'decide', payload: ballot([{ idea: id('Ash'), part: 'evidence' }]) }), { code: 'need_dots' });
  await act(store, 1, 'save', { phase: 'decide', payload: ballot([{ idea: id('Ash'), part: 'evidence', note: 'Source B is strong' }, { idea: id('Baker'), part: 'idea' }]) });
  await act(store, 2, 'save', { phase: 'decide', payload: ballot([{ idea: id('Ash'), part: 'evidence' }, { idea: id('Streets'), part: 'idea' }]) });
  const after = await act(store, 1, 'status');
  assert.equal(after.chosen.title, 'Baker');
  assert.deepEqual(after.dot_counts[id('Ash')], { idea: 0, answers: 0, evidence: 2 });
  assert.deepEqual(after.borrow.map((b) => [b.title, b.part, b.count]), [['Ash', 'evidence', 2], ['Streets', 'idea', 1]]);
  assert.deepEqual(after.borrow[0].notes, ['Source B is strong']);
  assert.ok(!JSON.stringify(after.borrow).includes('st_'));
});

test('parts are given to group members by their initials: one part each, one person a part unless there are more people than parts', async () => {
  const store = await atDecide();
  const s = await act(store, 1, 'status');
  const baker = s.gallery.flatMap((x) => x.ideas).find((i) => i.title === 'Baker').id;
  const ballot = { votes: { c1: baker, c2: baker }, reasons: { c1: 'It names a source.', c2: 'It says why it matters.' }, opened: s.gallery.map((x) => x.id) };
  for (const n of [1, 2]) await act(store, n, 'save', { phase: 'decide', payload: ballot });
  let v = await act(store, 1, 'parts', { parts: [{ id: 'p1', text: 'Panel text', shows: '', criterion: 'c1' }, { id: 'p2', text: 'Artefact list', shows: '', criterion: 'c2' }] });
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
  assert.deepEqual(v.parts.map((p) => p.assigned), [[], [cy]]);
  const sent = await act(store, 2, 'submit', { phase: 'decide', payload: ballot });
  assert.equal(sent.phases[2].state, 'in');
});

test('the group picks an assembler in Decide; in Prototype everyone sees every part, and only the assembler sets the finished prototype', async () => {
  const store = await atDecide({ ...CONFIG(), assemble: true });
  const s = await act(store, 1, 'status');
  const baker = s.gallery.flatMap((x) => x.ideas).find((i) => i.title === 'Baker').id;
  const ballot = { votes: { c1: baker, c2: baker }, reasons: { c1: 'It names a source.', c2: 'It says why it matters.' }, opened: s.gallery.map((x) => x.id) };
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
