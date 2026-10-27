// tests/unit/change-book-families.test.js
// The Change Book's own chart families on the real machine: time_value (Multitasking's split
// star: shares that overlap, values 1 to 10, history, gap flags) and attribution ((Un)Happiness's
// table of forces: 1 to 5 everywhere, the feeling word, own forces, the arrows, the summary).
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyScores, checkNode, isComplete, newRun, nextSlots, placeNode } from '../../packages/problem-solver/machine.mjs';
import { CHANGE_TOOLS } from '../../packages/change-book/tools/index.mjs';
import { GAP_WORDS, gapFlags, latestProfile, profileHistory, timeTotal, timeValueTool, totalWords } from '../../packages/change-book/families/time-value.mjs';
import { attributionTool, cleanFeeling, covers, drift, forcesOf, latestAttribution, selfShare, selfWords } from '../../packages/change-book/families/attribution.mjs';

const MT = CHANGE_TOOLS.ch_multitasking;
const UH = CHANGE_TOOLS.ch_unhappiness;
const AT = (n) => `2026-10-${String(n).padStart(2, '0')}T09:00:00.000Z`;
let k = 0;
const place = (run, slot, text = `Answer for ${slot}`, tag) => placeNode(run, { id: `n${(k += 1)}`, slot, text, title: text, ...(tag ? { tag } : {}), state: 'accepted', skills: [], turnId: null });
const modes = ['a', 'b', 'c', 'd'];
const profile = (time, value) => ({ time: Object.fromEntries(modes.map((m, i) => [m, time[i]])), value: Object.fromEntries(modes.map((m, i) => [m, value[i]])) });

// ---------------------------------------------------------------- time_value

test('time_value: whole times 0 to 100 with no sum rule, whole values 1 to 10, every mode', () => {
  const run = newRun('ch_multitasking', 'm');
  assert.equal(MT.validateScores(run, profile([0, 0, 0, 0], [1, 1, 1, 1])), null, 'nothing counted is allowed');
  assert.equal(MT.validateScores(run, profile([60, 70, 50, 40], [10, 10, 10, 10])), null, '220% is allowed: switching overlaps');
  assert.match(MT.validateScores(run, profile([101, 0, 0, 0], [5, 5, 5, 5])), /0 to 100/);
  assert.match(MT.validateScores(run, profile([10, 10, 10, 10], [0, 5, 5, 5])), /1 to 10/);
  assert.match(MT.validateScores(run, profile([10.5, 10, 10, 10], [5, 5, 5, 5])), /whole number/);
  assert.match(MT.validateScores(run, { time: { a: 1, b: 1, c: 1 }, value: { a: 1, b: 1, c: 1, d: 1 } }), /every mode/);
  assert.match(MT.validateScores(run, { time: { a: 1, b: 1, c: 1, d: 1 } }), /every mode/);
  assert.deepEqual(MT.pickScores({ time: { a: 1 }, value: { a: 2 }, series: 'x', runId: 'r' }), { time: { a: 1 }, value: { a: 2 } });
});

test('time_value: subject first, then notes tagged with a mode; the reflection opens once scored; complete needs all three', () => {
  let run = newRun('ch_multitasking', 'm');
  assert.deepEqual(nextSlots(run), ['subject']);
  assert.equal(MT.awaiting(run), null, 'the workday comes before the scores');
  run = place(run, 'subject', 'Last Tuesday at the office');
  assert.deepEqual(nextSlots(run), ['note:1']);
  assert.match(MT.awaiting(run), /chart's controls/);
  assert.match(checkNode(run, { slot: 'note:1', text: 'x', tag: 'e' }), /needs a tag/);
  run = place(run, 'note:1', 'Mostly the standup and two calls', 'a');
  run = applyScores(run, profile([30, 45, 20, 35], [8, 3, 9, 2]), AT(1));
  assert.equal(MT.awaiting(run), null);
  assert.deepEqual(nextSlots(run), ['note:2', 'reflection']);
  assert.equal(isComplete(run), false);
  run = place(run, 'reflection', 'Email eats the day and gives little back');
  assert.deepEqual(nextSlots(run), []);
  assert.equal(isComplete(run), true);
});

test('time_value: the latest save wins and the earlier ones stay, newest first', () => {
  let run = place(newRun('ch_multitasking', 'm'), 'subject', 'A workday');
  run = applyScores(run, profile([30, 45, 20, 35], [8, 3, 9, 2]), AT(1));
  run = applyScores(run, profile([30, 25, 40, 20], [8, 4, 9, 3]), AT(8));
  assert.deepEqual(latestProfile(run).time, { a: 30, b: 25, c: 40, d: 20 });
  const [now, before] = profileHistory(run, 2);
  assert.equal(now.at, AT(8));
  assert.equal(before.at, AT(1));
  assert.equal(before.time.b, 45);
  assert.match(MT.scoreLine(run), /Saved 2 times; the chart shows the previous profile faintly/);
});

test('time_value: gap flags, the total and its readout', () => {
  const snap = profile([30, 25, 10, 15], [4, 2, 8, 9]);
  assert.deepEqual(gapFlags(snap, modes), [{ mode: 'a', kind: 'costly' }, { mode: 'b', kind: 'costly' }, { mode: 'c', kind: 'starved' }, { mode: 'd', kind: 'starved' }]);
  assert.deepEqual(gapFlags(profile([24, 25, 16, 15], [4, 5, 8, 7]), modes), [], 'just short of each threshold');
  assert.deepEqual(GAP_WORDS, { costly: 'Takes a lot, worth little', starved: 'Worth a lot, gets little' });
  assert.equal(timeTotal(snap, modes), 80);
  assert.equal(totalWords(80), '20% of the day not counted');
  assert.equal(totalWords(130), 'Adds up to 130% — switching overlaps the other three, so this can pass 100');
  assert.equal(totalWords(100), 'Adds up to 100% of the day');
  let run = place(newRun('ch_multitasking', 'm'), 'subject', 'A workday');
  run = applyScores(run, snap, AT(1));
  assert.match(MT.scoreLine(run), /Time adds up to 80% \(overlap allowed\)\. Gaps: a: Takes a lot, worth little; b: Takes a lot, worth little; c: Worth a lot, gets little; d: Worth a lot, gets little\./);
});

test('time_value: a config needs a subject and three modes', () => {
  const base = { id: 'ch_x', name: 'X', when: 'For a test of the family.', steps: [{ id: 's', title: 'S', prompt: 'P' }] };
  assert.throws(() => timeValueTool({ ...base, chart: { modes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }] } }), /subject/);
  assert.throws(() => timeValueTool({ ...base, chart: { subject: 'S', modes: [{ id: 'a', label: 'A' }] } }), /three modes/);
});

// ---------------------------------------------------------------- attribution

const BOOK = UH.chart.forces.map((f) => f.id);
const table = (ids, now, later, extra = {}) => ({
  feeling: 'happy', now: 3, later: 4,
  influenceNow: Object.fromEntries(ids.map((id, i) => [id, typeof now === 'function' ? now(id, i) : now])),
  influenceLater: Object.fromEntries(ids.map((id, i) => [id, typeof later === 'function' ? later(id, i) : later])),
  ...extra
});

test('attribution: 1 to 5 everywhere, a feeling word, every force in both columns', () => {
  const run = newRun('ch_unhappiness', 'u');
  const pick = (payload) => UH.pickScores(payload);
  assert.equal(UH.validateScores(run, pick(table(BOOK, 3, 3))), null);
  assert.match(UH.validateScores(run, pick(table(BOOK, 3, 3, { now: 6 }))), /1 to 5/);
  assert.match(UH.validateScores(run, pick(table(BOOK, 3, 3, { later: 0 }))), /1 to 5/);
  assert.match(UH.validateScores(run, pick(table(BOOK, (id) => (id === 'luck' ? 6 : 3), 3))), /1 to 5/);
  assert.match(UH.validateScores(run, pick(table(BOOK.slice(1), 3, 3))), /every force/);
  assert.match(UH.validateScores(run, pick(table(BOOK, 3, 3, { feeling: '42!' }))), /feeling/);
  assert.equal(pick(table(BOOK, 3, 3, { feeling: '  Lonely ' })).feeling, 'lonely');
  assert.equal(cleanFeeling('at peace'), 'at peace');
  assert.equal(cleanFeeling(''), null);
});

test('attribution: score first (own forces may be added), then the two arrows, then notes and the reflection', () => {
  let run = newRun('ch_unhappiness', 'u');
  assert.deepEqual(nextSlots(run), ['force:1']);
  assert.match(UH.awaiting(run), /rich, lonely/);
  run = place(run, 'force:1', 'My commute');
  assert.deepEqual(forcesOf(run, UH.chart).map((f) => f.id), [...BOOK, 'own_1']);
  assert.match(UH.validateScores(run, UH.pickScores(table(BOOK, 3, 3))), /own_1/, 'an added force has to be scored too');
  run = applyScores(run, table([...BOOK, 'own_1'], 3, 2), AT(1));
  assert.equal(UH.awaiting(run), null);
  assert.deepEqual(nextSlots(run), ['got_here', 'get_there']);
  run = place(run, 'got_here', 'A steady job and good friends');
  assert.deepEqual(nextSlots(run), ['get_there']);
  run = place(run, 'get_there', 'Moving closer to family');
  assert.deepEqual(nextSlots(run), ['note:1', 'force:2', 'reflection']);
  assert.equal(checkNode(run, { slot: 'note:1', text: 'x', tag: 'own_1' }), null);
  assert.match(checkNode(run, { slot: 'note:1', text: 'x', tag: 'own_2' }), /no own 2 force/);
  assert.equal(isComplete(run), false);
  run = place(run, 'reflection', 'I give myself less credit for the future');
  assert.equal(isComplete(run), true);
  assert.deepEqual(nextSlots(run), []);
});

test('attribution: a force added after a save sends the table back for scoring', () => {
  let run = applyScores(newRun('ch_unhappiness', 'u'), table(BOOK, 3, 3), AT(1));
  run = place(place(run, 'got_here', 'Work'), 'get_there', 'Rest');
  run = place(run, 'force:1', 'The weather');
  assert.equal(covers(latestAttribution(run), [...BOOK, 'own_1']), false);
  assert.match(UH.awaiting(run), /chart's controls/);
  assert.equal(isComplete(run), false);
  assert.match(UH.scoreLine(run), /needs scoring again/);
  run = applyScores(run, table([...BOOK, 'own_1'], 3, 3, { feeling: 'rich' }), AT(2));
  assert.equal(latestAttribution(run).feeling, 'rich', 'the latest save wins');
  assert.equal(UH.awaiting(run), null);
});

test('attribution: drift between the columns and the share given to your own thoughts and actions', () => {
  const snap = table(BOOK, (id) => (['thoughts', 'actions'].includes(id) ? 5 : 1), (id) => (id === 'thoughts' ? 2 : id === 'luck' ? 3 : 1));
  assert.equal(drift(snap, 'thoughts'), 'down');
  assert.equal(drift(snap, 'luck'), 'up');
  assert.equal(drift(snap, 'politics'), 'same');
  assert.equal(drift(null, 'luck'), null);
  const self = ['thoughts', 'actions'];
  assert.deepEqual(selfShare(snap, 'influenceNow', self, BOOK), { self: 10, total: 18, share: 10 / 18 });
  assert.equal(selfWords(snap, self, BOOK), 'Your own thoughts and actions take 6 of every 10 points of influence now, and 2 of 10 in three years; the other forces share the rest.');
  let run = applyScores(newRun('ch_unhappiness', 'u'), snap, AT(1));
  assert.match(UH.scoreLine(run), /Feeling: happy\. Now 3\/5, in three years 4\/5\./);
  assert.match(UH.scoreLine(run), /Your thoughts 5->2/);
  run = place(run, 'got_here', 'x');
  assert.ok(run);
});

test('attribution: a config marks its own forces and keeps the own_ ids free', () => {
  const base = { id: 'ch_x', name: 'X', when: 'For a test of the family.', steps: [{ id: 's', title: 'S', prompt: 'P' }] };
  assert.throws(() => attributionTool({ ...base, chart: { forces: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] } }), /self/);
  assert.throws(() => attributionTool({ ...base, chart: { forces: [{ id: 'own_1', label: 'A', self: true }, { id: 'b', label: 'B' }] } }), /force own_1/);
});
