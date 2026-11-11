// tests/unit/games-grids.test.js
// Game lessons, crossword and find-a-word on the server: grids built at publish, the public copy carrying
// no crossword letters and no answer coordinates, selections marked on the server, hint ladders counted on
// the server, retried batches stored once, and Best/Latest out of the same total as the finish card.
// Every class, student, term and clue is invented (helpers/game-fixture.mjs and below).
import test from 'node:test';
import assert from 'node:assert/strict';
import { gameKeys, gameStudentAction, prepareGamePublish, storeGameKeys } from '../../netlify/functions/_shared/games.mjs';
import { workOwner } from '../../netlify/functions/_shared/lesson-work.mjs';
import { classKey, draftLessonKey, publishedLessonKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';
import { storeFor, who, INITIALS } from './helpers/sprint-store.js';
import { GAME_ROSTER, connections, crossword, gameLesson, term } from './helpers/game-fixture.mjs';

const NOW = Date.parse('2026-11-11T01:00:00.000Z');

const findAWord = (over = {}) => ({
  id: 'g_find',
  title: 'Lantern House find-a-word',
  kind: 'find_a_word',
  items: [
    term('f1', 'Simile', 'The fog crept in like a slow grey tide.', { decoys: ['Metaphor'], pieces: ['kp_sim1'] }),
    term('f2', 'Hyperbole', 'The frost had sat on that roof for a thousand years.'),
    term('f3', 'Oxymoron', 'He smiled with a gentle cruelty.', { decoys: ['Paradox'] }),
    term('f4', 'Motif', 'Moths gather at the glass in every chapter.'),
    term('f5', 'Irony', 'She lights every lamp yet cannot find her way home.'),
    term('f6', 'Gothic', 'A locked wing, a stair that groans at night.')
  ],
  message: {
    text: 'The house remembers',
    question: { id: 'message_q', kind: 'multiple_choice', prompt: 'Which technique is this line using?', marks: 1, options: [{ id: 'mo1', text: 'Personification' }, { id: 'mo2', text: 'Metaphor' }], correct: ['mo1'] }
  },
  settings: { seed: 4, directions: 'all', hints: true },
  ...over
});

async function setup(games = [crossword(), findAWord()]) {
  const store = storeFor();
  store.data.set(classKey('class1'), { id: 'class1', status: 'active', title: '9 English', students: GAME_ROSTER });
  const draft = gameLesson({}, games);
  store.data.set(draftLessonKey('gl1'), draft);
  const pub = prepareGamePublish(draft);
  assert.deepEqual(pub.problems, []);
  store.data.set(publishedLessonKey('gl1'), { lesson_id: 'gl1', pedagogical_mode: 'game', blocks: [], game: pub.snapshot });
  await storeGameKeys(store, 'gl1', pub.record);
  return { store, pub };
}
const act = (store, n, action, extra = {}) => gameStudentAction(store, 'gl1', { action, ...who(n), ...extra }, { now: NOW });
const start = async (store, gameId) => {
  await act(store, 1, 'claim', { initials: INITIALS[1] });
  return act(store, 1, 'solo_start', { game_id: gameId });
};
const send = (store, gameId, play_id, events) => act(store, 1, 'solo_event', { game_id: gameId, play_id, events });
const eventsOf = (store, gameId, play) => store.data.get(gameKeys('gl1').events(gameId, play, workOwner('class1', 'st_ann'))) ?? [];
/** Start and end cells of a placement, as a phone would send them. */
const ends = (p) => ({ from: [p.x, p.y], to: [p.x + p.dx * (p.word.length - 1), p.y + p.dy * (p.word.length - 1)] });

test('publish builds both grids; the crossword ships no letters and the find-a-word no answer cells', async () => {
  const { pub } = await setup();
  const [cross, find] = pub.snapshot.games;
  assert.equal(cross.grid.kind, 'crossword');
  assert.ok(cross.grid.width <= 15 && cross.grid.height <= 15);
  assert.equal(cross.grid.entries.length, cross.items.length);
  for (const e of cross.grid.entries) assert.deepEqual(Object.keys(e).sort(), ['dir', 'item', 'length', 'number', 'x', 'y']);
  const crossText = JSON.stringify(cross);
  for (const w of ['SIMILE', 'PATHETICFALLACY', 'ALLITERATION', 'SIBILANCE', 'HYPERBOLE', 'OXYMORON', 'Simile', 'Hyperbole']) assert.ok(!crossText.includes(w), w);

  assert.deepEqual(Object.keys(find.grid).sort(), ['kind', 'rows', 'size']);
  assert.equal(find.grid.rows.length, find.grid.size);
  const findText = JSON.stringify(find);
  for (const s of ['placements', 'cells', '"x"', 'owner', 'Paradox', 'Simile', 'remembers']) assert.ok(!findText.includes(s), s);
  assert.deepEqual(find.message, { length: 'THEHOUSEREMEMBERS'.length, question: find.message.question });
  assert.equal(find.count, 7, 'six terms and the message question');

  // The keys hold the letters and every answer's cells.
  const keys = pub.record.games;
  assert.equal(keys.g_cross.grid.entries.find((e) => e.id === 't1').word, 'SIMILE');
  assert.ok(keys.g_find.grid.placements.some((p) => p.decoy && p.word === 'METAPHOR' && p.owner === 'f1' && p.label === 'Metaphor'));
  assert.equal(keys.g_find.grid.message.text, 'THEHOUSEREMEMBERS');
  assert.equal(keys.g_find.items.message, undefined, 'the message is shown, not answered');
});

test('words that don’t fit the crossword are left out of the game, public and keys', async () => {
  const long = Array.from({ length: 12 }, (_, i) => term(`long${i}`, 'ABCDEFGHIJKLMNO'.slice(0, 15 - (i % 3)).split('').reverse().join('') + '', 'clue'));
  const { pub } = await setup([crossword({ items: [...crossword().items, ...long] })]);
  const cross = pub.snapshot.games[0];
  const placed = new Set(cross.grid.entries.map((e) => e.item));
  assert.ok(placed.size < 18, 'not everything fits');
  assert.deepEqual(new Set(cross.items.map((i) => i.id)), placed);
  assert.deepEqual(new Set(Object.keys(pub.record.games.g_cross.items)), placed);
  assert.equal(cross.count, placed.size);
});

test('find-a-word selections: right either way, decoys, another clue’s word, stray drags and Any clue', async () => {
  const { store, pub } = await setup();
  const grid = pub.record.games.g_find.grid;
  const place = (word) => grid.placements.find((p) => p.word === word);
  const { play_id } = await start(store, 'g_find');
  const simile = ends(place('SIMILE'));
  const r = await send(store, 'g_find', play_id, [
    { item: 'f1', move: 'answer', response: { from: simile.to, to: simile.from } },
    { item: 'f3', move: 'answer', response: ends(place('PARADOX')) },
    { item: 'f3', move: 'answer', response: ends(place('HYPERBOLE')) },
    { item: 'f4', move: 'answer', response: { from: [0, 0], to: [0, 1] } },
    { item: 'f4', move: 'answer', response: { from: [0, 0], to: [2, 1] } },
    { item: 'any', move: 'answer', response: ends(place('MOTIF')) },
    { item: 'any', move: 'answer', response: ends(place('METAPHOR')) },
    { item: 'f1', move: 'answer', response: simile }
  ]);
  assert.deepEqual(r.results[0], { item: 'f1', correct: true });
  assert.deepEqual(r.results[1], { item: 'f3', correct: false, decoy: true });
  assert.deepEqual(r.results[2], { item: 'f3', correct: false, decoy: true });
  assert.deepEqual(r.results[3], { item: 'f4', correct: false });
  assert.deepEqual(r.results[4], { item: 'f4', correct: false }, 'not a straight line');
  assert.deepEqual(r.results[5], { item: 'f4', correct: true });
  assert.deepEqual(r.results[6], { item: 'f1', correct: false, decoy: true });
  assert.deepEqual(r.results[7], { item: 'f1', correct: true, again: true });
  const events = eventsOf(store, 'g_find', play_id);
  assert.deepEqual(events.map((e) => [e.item, e.correct ?? null, e.extra?.confused_with ?? null]).slice(0, 3), [['f1', true, null], ['f3', false, 'Paradox'], ['f3', false, 'Hyperbole']]);
  assert.ok(events.some((e) => e.item === 'f4' && e.correct === true), 'Any clue files the find under its clue');
  assert.ok(events.some((e) => e.item === 'f1' && e.correct === undefined && e.extra.confused_with === 'Metaphor'), 'a decoy with no clue picked is noted, unmarked');
  assert.equal(events.filter((e) => e.item === 'f1' && e.correct === true).length, 1, 'found again is not stored again');
  assert.ok(!events.some((e) => e.item === 'any'));
  assert.deepEqual(events[0].response, { from: simile.to, to: simile.from, text: [...'SIMILE'].reverse().join('') });
});

test('the last word found brings back the hidden message; its question is marked; totals agree', async () => {
  const { store, pub } = await setup();
  const grid = pub.record.games.g_find.grid;
  const { play_id } = await start(store, 'g_find');
  const answers = grid.placements.filter((p) => !p.decoy);
  const first = await send(store, 'g_find', play_id, answers.slice(0, -1).map((p) => ({ item: p.id, move: 'answer', response: ends(p) })));
  assert.ok(first.results.every((x) => x.correct === true && !x.reveal));
  const last = answers[answers.length - 1];
  const r = await send(store, 'g_find', play_id, [{ item: last.id, move: 'answer', response: ends(last) }]);
  assert.equal(r.results[0].reveal.message.text, 'THEHOUSEREMEMBERS');
  assert.equal(r.results[0].reveal.message.display, 'The house remembers');
  const spelled = r.results[0].reveal.message.cells.map(([x, y]) => grid.rows[y][x]).join('');
  assert.equal(spelled, 'THEHOUSEREMEMBERS');
  const optionId = pub.snapshot.games[1].message.question.options.find((o) => o.text === 'Personification').id;
  const q = await send(store, 'g_find', play_id, [{ item: 'message_q', move: 'answer', response: { selected: [optionId] } }]);
  assert.equal(q.results[0].correct, true);
  const done = await act(store, 1, 'solo_finish', { game_id: 'g_find', play_id });
  assert.deepEqual(done.score, { right: 7, answered: 7, total: 7 });
  assert.equal(done.best.total, 7);
  assert.equal(done.latest.total, 7);
});

test('hint ladders climb on the server: crossword letters, then crossings, then the word (counted as missed)', async () => {
  const { store, pub } = await setup();
  const grid = pub.record.games.g_cross.grid;
  const e = grid.entries.find((x) => x.id === 't1');
  const { play_id } = await start(store, 'g_cross');
  // The phone says it's on hint 3; the server counts for itself.
  const h1 = await send(store, 'g_cross', play_id, [{ item: 't1', move: 'hint', response: { letters: 'SX....' }, extra: { hints: 3 } }]);
  assert.equal(h1.results[0].reveal.step, 1);
  assert.deepEqual(h1.results[0].reveal.cells, [{ x: e.dir === 'across' ? e.x + 1 : e.x, y: e.dir === 'down' ? e.y + 1 : e.y, ch: 'I' }]);
  const h2 = await send(store, 'g_cross', play_id, [{ item: 't1', move: 'hint', response: { letters: 'SI....' } }]);
  assert.equal(h2.results[0].reveal.step, 2);
  const crossing = grid.entries.filter((x) => x.dir !== e.dir && Array.from(x.word).some((_, i) => {
    const cx = x.dir === 'across' ? x.x + i : x.x;
    const cy = x.dir === 'down' ? x.y + i : x.y;
    return e.dir === 'across' ? cy === e.y && cx >= e.x && cx < e.x + e.word.length : cx === e.x && cy >= e.y && cy < e.y + e.word.length;
  }));
  assert.deepEqual(h2.results[0].reveal.cells, crossing.map((x) => ({ x: x.x, y: x.y, ch: x.word[0] })));
  const h3 = await send(store, 'g_cross', play_id, [{ item: 't1', move: 'hint' }, { item: 't1', move: 'answer', response: { text: 'SIMILE' }, extra: { hints: 0 } }]);
  assert.equal(h3.results[0].reveal.cells.map((c) => c.ch).join(''), 'SIMILE');
  assert.equal(h3.results[1].correct, true);
  const events = eventsOf(store, 'g_cross', play_id);
  assert.deepEqual(events.filter((x) => x.move === 'hint').map((x) => x.extra.hints), [1, 2, 3]);
  assert.equal(events.find((x) => x.move === 'answer').extra.hints, 3, 'the answer carries the server’s count, not the phone’s');
  const done = await act(store, 1, 'solo_finish', { game_id: 'g_cross', play_id });
  assert.deepEqual(done.score, { right: 0, answered: 1, total: 6 }, 'a word shown by the last hint is not a word solved');

  const find = await start(store, 'g_find');
  const w = await send(store, 'g_find', find.play_id, [{ item: 'f2', move: 'hint' }, { item: 'f2', move: 'hint' }, { item: 'f2', move: 'hint' }]);
  assert.deepEqual(w.results.map((x) => x.reveal.step), [1, 2, 3]);
  assert.deepEqual(w.results[0].reveal, { step: 1, first: 'H' });
  assert.deepEqual(w.results[1].reveal, { step: 2, first: 'H', length: 9 });
  const line = w.results[2].reveal.line;
  const p = pub.record.games.g_find.grid.placements.find((x) => x.id === 'f2');
  assert.ok(line.dx > 0 || (line.dx === 0 && line.dy > 0), 'the line never says which way the word reads');
  assert.ok(Math.abs(line.dx) === Math.abs(p.dx) && Math.abs(line.dy) === Math.abs(p.dy));
});

test('hints switched off: the move is kept but nothing is revealed', async () => {
  const { store } = await setup([crossword({ settings: { seed: 3, locked: false, hints: false } })]);
  const { play_id } = await start(store, 'g_cross');
  const r = await send(store, 'g_cross', play_id, [{ item: 't2', move: 'hint' }]);
  assert.deepEqual(r.results[0], { item: 't2' });
});

test('a retried batch is stored once and answered the same way', async () => {
  const { store } = await setup();
  const { play_id } = await start(store, 'g_cross');
  const batch = [
    { cid: 'c_aaaaaa1', item: 't1', move: 'answer', response: { text: 'Simile' } },
    { cid: 'c_aaaaaa2', item: 't3', move: 'hint', response: { letters: '' } },
    { cid: 'c_aaaaaa3', item: 't2', move: 'answer', response: { text: 'nope' } }
  ];
  const first = await send(store, 'g_cross', play_id, batch);
  const again = await send(store, 'g_cross', play_id, batch);
  assert.deepEqual(again.results, first.results);
  const events = eventsOf(store, 'g_cross', play_id);
  assert.equal(events.length, 3);
  assert.deepEqual(events.map((e) => e.cid), ['c_aaaaaa1', 'c_aaaaaa2', 'c_aaaaaa3']);
  // A batch half new, half resent: only the new move is added, and the hint ladder isn't climbed twice.
  const mixed = await send(store, 'g_cross', play_id, [batch[1], { cid: 'c_aaaaaa4', item: 't3', move: 'hint', response: { letters: '' } }]);
  assert.equal(mixed.results[0].reveal.step, 1);
  assert.equal(mixed.results[1].reveal.step, 2);
  assert.equal(eventsOf(store, 'g_cross', play_id).length, 4);
  // A bad client id is refused like any unreadable move.
  await assert.rejects(send(store, 'g_cross', play_id, [{ cid: 'x', item: 't1', move: 'answer' }]), (e) => e.code === 'bad_event');
});

test('Best and Latest use the finish card’s denominator: right out of every item in the game', async () => {
  const { store } = await setup();
  const one = await start(store, 'g_cross');
  await send(store, 'g_cross', one.play_id, [{ item: 't1', move: 'answer', response: { text: 'Simile' } }]);
  const a = await act(store, 1, 'solo_finish', { game_id: 'g_cross', play_id: one.play_id });
  assert.deepEqual(a.score, { right: 1, answered: 1, total: 6 });
  assert.deepEqual([a.best.right, a.best.answered, a.best.total], [1, 1, 6]);
  const two = await act(store, 1, 'solo_start', { game_id: 'g_cross' });
  await send(store, 'g_cross', two.play_id, ['Simile', 'Pathetic fallacy', 'Alliteration', 'nope'].map((text, i) => ({ item: `t${i + 1}`, move: 'answer', response: { text } })));
  const b = await act(store, 1, 'solo_finish', { game_id: 'g_cross', play_id: two.play_id });
  assert.deepEqual(b.score, { right: 3, answered: 4, total: 6 });
  // 3/6 beats 1/6, even though 1/1 answered was "perfect".
  assert.equal(b.best.play_id, two.play_id);
  assert.deepEqual([b.best.right, b.best.total, b.latest.right, b.latest.total], [3, 6, 3, 6]);
  const arcade = await act(store, 1, 'load');
  assert.equal(arcade.results.g_cross.best.total, 6);
  assert.equal(arcade.results.g_cross.latest.total, 6);
});

test('Connections: a pass shows the hidden groups only once the wall is out of mistakes', async () => {
  const { store } = await setup([connections({ settings: { mistakes: 2 } })]);
  const { play_id, game } = await start(store, 'g_wall');
  const tiles = Object.fromEntries(game.walls[0].tiles.map((t) => [t.text, t.id]));
  const guess = (words) => ({ item: 'w1', move: 'guess', response: { tiles: words.map((w) => tiles[w]) } });
  const r1 = await send(store, 'g_wall', play_id, [guess(['Simile', 'Metaphor', 'Analogy', 'Conceit']), guess(['Sibilance', 'Assonance', 'Onomatopoeia', 'Simile']), { item: 'w1', move: 'pass' }]);
  assert.equal(r1.results[0].correct, true);
  assert.deepEqual(r1.results[2], { item: 'w1' }, 'one mistake of two: no peeking');
  const r2 = await send(store, 'g_wall', play_id, [guess(['Persona', 'Tone', 'Register', 'Volta']), { item: 'w1', move: 'pass' }]);
  const groups = r2.results[1].reveal.groups;
  assert.deepEqual(groups.map((g) => g.id).sort(), ['grp_sound', 'grp_struct', 'grp_voice']);
  assert.deepEqual(groups.find((g) => g.id === 'grp_sound').tiles.sort(), ['Sibilance', 'Assonance', 'Onomatopoeia', 'Plosives'].map((w) => tiles[w]).sort());
  assert.deepEqual(Object.keys(groups[0]).sort(), ['difficulty', 'id', 'label', 'tiles', 'why']);
});
