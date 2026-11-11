// tests/unit/games.test.js
// Game lessons server: publish split, solo play, evidence, organiser box 1, results and the markbook push.
// Every class, student, character and quote is invented (helpers/game-fixture.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { gameKeys, gameStudentAction, gameTeacherAction, prepareGamePublish, storeGameKeys } from '../../netlify/functions/_shared/games.mjs';
import { markbookAction } from '../../netlify/functions/_shared/markbook.mjs';
import { organiserKey } from '../../netlify/functions/_shared/organiser.mjs';
import { workOwner } from '../../netlify/functions/_shared/lesson-work.mjs';
import { isPublicStudentApi } from '../../netlify/functions/_shared/public-student-routes.mjs';
import { classKey, draftLessonKey, publishedLessonKey, unitKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createLessonPublishHandler } from '../../netlify/functions/lesson-publish.mjs';
import { storeFor, who, INITIALS } from './helpers/sprint-store.js';
import { GAME_ROSTER, gameLesson, mcq } from './helpers/game-fixture.mjs';

const NOW = Date.parse('2026-11-11T01:00:00.000Z');
/** Secrets that must never reach a student's page or reply (the answers in the fixture). */
const SECRETS = ['Pathetic fallacy', 'Alliteration', 'Hyperbole', 'Oxymoron', 'Sound devices', 'Comparisons', 'Mara never leaves', 'Chapter 1', '"correct"'];

async function setup(over = {}) {
  const store = storeFor();
  store.data.set(classKey('class1'), { id: 'class1', status: 'active', title: '9 English', students: GAME_ROSTER, current_unit_id: 'unit1' });
  store.data.set(unitKey('unit1'), { id: 'unit1', title: 'Harbour Lights', lesson_ids: ['gl1', 'ql1'] });
  store.data.set(organiserKey('unit1'), {
    v: 2,
    sections: [
      { id: 'os_vocab', name: 'Vocabulary', kind: 'table', role: 'vocab', columns: [], lines: [
        { id: 'ol_simile', cells: ['Simile', 'A comparison using like or as', 'Her voice was like gravel'], piece_id: 'kp_sim1', open: true },
        { id: 'ol_other', cells: ['Irony', 'Saying the opposite of what is meant', ''], open: true }
      ] },
      { id: 'os_ideas', name: 'Key ideas', kind: 'table', role: 'ideas', columns: [], lines: [{ id: 'ol_idea', cells: ['Isolation', 'Being cut off'], open: true }] }
    ]
  });
  const draft = gameLesson(over);
  store.data.set(draftLessonKey('gl1'), draft);
  const pub = prepareGamePublish(draft);
  assert.deepEqual(pub.problems, []);
  store.data.set(publishedLessonKey('gl1'), { lesson_id: 'gl1', pedagogical_mode: 'game', blocks: [], game: pub.snapshot });
  await storeGameKeys(store, 'gl1', pub.record);
  return { store, pub };
}
const replies = [];
const act = async (store, n, action, extra = {}) => {
  const reply = await gameStudentAction(store, 'gl1', { action, ...who(n), ...extra }, { now: NOW });
  replies.push(reply);
  return reply;
};
const claim = (store, n) => act(store, n, 'claim', { initials: INITIALS[n] });
const teach = (store, action, extra = {}) => gameTeacherAction(store, 'gl1', { action, ...extra });
const rejects = (p, code) => assert.rejects(p, (e) => e.code === code);

test('publish keeps every answer off the public snapshot and stores keys by version', async () => {
  const { pub } = await setup();
  const text = JSON.stringify(pub.snapshot);
  for (const s of SECRETS) assert.ok(!text.includes(s), s);
  assert.deepEqual(pub.snapshot.games.map((g) => [g.id, g.solo]), [['g_cross', true], ['g_who', true], ['g_wall', true], ['g_wager', false]]);
  assert.equal(pub.snapshot.games[3].items, undefined, 'live-only games ship no content');
  assert.deepEqual(pub.record.order, ['g_cross', 'g_who', 'g_wall', 'g_wager']);
  assert.deepEqual(pub.record.games.g_cross.items.t2.answers, ['Pathetic fallacy']);
  assert.equal(pub.snapshot.version, pub.record.version);
});

test('publish problems in the teacher’s words', () => {
  assert.deepEqual(prepareGamePublish({ game: { games: [] } }).problems, ['Add at least one game.']);
  assert.match(prepareGamePublish({ game: { games: 'nope' } }).problems[0], /too long or missing/);
});

test('the student route is public and namespaced', () => {
  assert.ok(isPublicStudentApi('POST', '/api/published/game/gl1'));
  assert.ok(!isPublicStudentApi('POST', '/api/lessons/gl1/game'));
});

test('arcade: initials first, then games with no results yet', async () => {
  const { store } = await setup();
  const first = await act(store, 1, 'load');
  assert.equal(first.identity.need, 'initials');
  await rejects(act(store, 1, 'solo_start', { game_id: 'g_cross' }), 'need_initials');
  const arcade = await claim(store, 1);
  assert.equal(arcade.identity.initials, 'AB');
  assert.equal(arcade.games.length, 4);
  assert.deepEqual(arcade.results, {});
  assert.equal(arcade.closed, false);
});

test('live-only games can’t start solo; homework closes', async () => {
  const { store } = await setup();
  await claim(store, 1);
  await rejects(act(store, 1, 'solo_start', { game_id: 'g_wager' }), 'live_only');
  await rejects(act(store, 1, 'solo_start', { game_id: 'nope' }), 'bad_game');
  const closed = await setup({ homework_closes_at: '2026-11-10T00:00:00.000Z' });
  const arcade = await claim(closed.store, 1);
  assert.equal(arcade.closed, true);
  await rejects(act(closed.store, 1, 'solo_start', { game_id: 'g_cross' }), 'closed');
});

test('solo crossword: the server marks each batch, finish scores, box 1 and summary', async () => {
  const { store } = await setup();
  await claim(store, 1);
  const { play_id, game } = await act(store, 1, 'solo_start', { game_id: 'g_cross' });
  assert.match(play_id, /^[a-f0-9]{16}$/);
  assert.equal(game.items.length, 6);
  // A phone can't say it was right or found a group.
  const batch = await act(store, 1, 'solo_event', { game_id: 'g_cross', play_id, events: [
    { item: 't1', move: 'answer', response: { text: 'metaphor' }, time_ms: 4000, extra: { group: 'x', hints: 0 } },
    { item: 't2', move: 'answer', response: { text: 'the  pathetic-fallacy' }, time_ms: 9000 },
    { item: 't3', move: 'hint', extra: { level: 1 } }
  ] });
  assert.deepEqual(batch.results, [{ item: 't1', correct: false, decoy: true }, { item: 't2', correct: true }, { item: 't3' }]);
  const owner = workOwner('class1', 'st_ann');
  const events = store.data.get(gameKeys('gl1').events('g_cross', play_id, owner));
  assert.deepEqual(events.map((e) => [e.seq, e.item, e.correct ?? null, e.strength]), [[0, 't1', false, 'self_paced'], [1, 't2', true, 'self_paced'], [2, 't3', null, 'self_paced']]);
  assert.equal(events[0].extra.confused_with, 'Metaphor');
  assert.equal(events[0].extra.group, undefined);
  assert.equal(events[0].student_id, 'st_ann');

  await rejects(act(store, 1, 'solo_event', { game_id: 'g_cross', play_id, events: Array.from({ length: 21 }, () => ({ item: 't4', move: 'answer', response: { text: 'x' } })) }), 'too_many');
  await rejects(act(store, 1, 'solo_event', { game_id: 'g_cross', play_id, events: [{ item: 'zz', move: 'answer' }] }), 'bad_item');
  await claim(store, 2);
  await rejects(act(store, 2, 'solo_event', { game_id: 'g_cross', play_id, events: [{ item: 't4', move: 'answer' }] }), 'bad_play');

  const done = await act(store, 1, 'solo_finish', { game_id: 'g_cross', play_id });
  assert.deepEqual(done.score, { right: 1, answered: 2, total: 6 });
  assert.equal(done.boxed, 1);
  assert.deepEqual(done.best, { play_id, right: 1, answered: 2, at: new Date(NOW).toISOString() });
  // Missed simile → its organiser line back to box 1, due tomorrow; nothing else moves.
  const boxes = store.data.get(`organiser_practice/class1/${owner}`).boxes;
  assert.deepEqual(boxes, { ol_simile: { box: 1, due: '2026-11-12' } });
  // Finish again: same answer, no second write.
  assert.deepEqual((await act(store, 1, 'solo_finish', { game_id: 'g_cross', play_id })).score, done.score);
  await rejects(act(store, 1, 'solo_event', { game_id: 'g_cross', play_id, events: [{ item: 't4', move: 'answer' }] }), 'ended');
  // The arcade shows best and latest.
  const arcade = await act(store, 1, 'load');
  assert.deepEqual(arcade.results.g_cross, { best: done.best, latest: done.latest, plays: 1 });
  const summary = store.data.get(gameKeys('gl1').summary('g_cross', 'class1'));
  assert.deepEqual(summary.students.st_ann.evidence.map((e) => [e.item, e.share, e.source, e.strength]), [['t1', 0, 'game', 'self_paced'], ['t2', 1, 'game', 'self_paced']]);
});

test('box 1 keeps an earlier due day and never moves a card up', async () => {
  const { store } = await setup();
  const owner = workOwner('class1', 'st_ann');
  store.data.set(`organiser_practice/class1/${owner}`, { boxes: { ol_simile: { box: 1, due: '2026-11-09', last: '2026-11-08', h: [{ d: '2026-11-08', ok: false }] }, ol_other: { box: 4, due: '2026-12-01' } } });
  await claim(store, 1);
  const { play_id } = await act(store, 1, 'solo_start', { game_id: 'g_cross' });
  await act(store, 1, 'solo_event', { game_id: 'g_cross', play_id, events: [{ item: 't1', move: 'answer', response: { text: 'no' } }] });
  assert.equal((await act(store, 1, 'solo_finish', { game_id: 'g_cross', play_id })).boxed, 0);
  assert.deepEqual(store.data.get(`organiser_practice/class1/${owner}`).boxes.ol_simile, { box: 1, due: '2026-11-09', last: '2026-11-08', h: [{ d: '2026-11-08', ok: false }] });
});

test('who said it reveals the source after answering; Connections reveals a found group only', async () => {
  const { store } = await setup();
  await claim(store, 1);
  const who1 = await act(store, 1, 'solo_start', { game_id: 'g_who' });
  const reply = await act(store, 1, 'solo_event', { game_id: 'g_who', play_id: who1.play_id, events: [
    { item: 'q1', move: 'answer', response: { speaker: 'c_gull' } },
    { item: 'q5', move: 'answer', response: { speaker: 'fake' } }
  ] });
  assert.deepEqual(reply.results[0], { item: 'q1', correct: false, reveal: { speaker: 'c_keeper', source: 'Chapter 1' } });
  assert.equal(reply.results[1].correct, true);
  assert.match(reply.results[1].reveal.why_fake, /never leaves/);

  const wall = await act(store, 1, 'solo_start', { game_id: 'g_wall' });
  const tiles = Object.fromEntries(wall.game.walls[0].tiles.map((t) => [t.text, t.id]));
  const guess = (words) => ({ item: 'w1', move: 'guess', response: { tiles: words.map((w) => tiles[w]) } });
  const r = await act(store, 1, 'solo_event', { game_id: 'g_wall', play_id: wall.play_id, events: [guess(['Sibilance', 'Assonance', 'Onomatopoeia', 'Simile']), guess(['Simile', 'Metaphor', 'Analogy', 'Conceit'])] });
  assert.deepEqual(r.results[0], { item: 'w1', correct: false, one_away: true });
  assert.equal(r.results[1].reveal.group.label, 'Comparisons');
  const done = await act(store, 1, 'solo_finish', { game_id: 'g_wall', play_id: wall.play_id });
  assert.deepEqual(done.score, { right: 1, answered: 4, total: 4 });
  // grp_sound has kp_sound1 but no organiser line, so nothing moves.
  assert.equal(done.boxed, 0);
});

test('student replies never carry an answer key', () => {
  const crossword = replies.filter((r) => JSON.stringify(r).includes('g_cross') || JSON.stringify(r).includes('"t1"'));
  assert.ok(crossword.length > 3);
  for (const r of crossword) {
    const text = JSON.stringify(r);
    for (const s of ['Pathetic fallacy', 'Alliteration', 'Hyperbole', 'Oxymoron', '"answers"', '"decoys"']) assert.ok(!text.includes(s), s);
  }
});

test('teacher results: per item and per student, with names and strength; markbook push; markbook evidence', async () => {
  const { store } = await setup();
  for (const [n, text] of [[1, 'Simile'], [2, 'metaphor']]) {
    await claim(store, n);
    const { play_id } = await act(store, n, 'solo_start', { game_id: 'g_cross' });
    await act(store, n, 'solo_event', { game_id: 'g_cross', play_id, events: [{ item: 't1', move: 'answer', response: { text }, time_ms: n * 1000 }] });
    await act(store, n, 'solo_finish', { game_id: 'g_cross', play_id });
  }
  await rejects(teach(store, 'nope'), 'bad_action');
  const out = await teach(store, 'results', { class_id: 'class1', game_id: 'g_cross' });
  const [cross] = out.games;
  assert.equal(cross.plays, 2);
  assert.deepEqual(cross.items.find((i) => i.id === 't1'), { id: 't1', label: 'Simile', answered: 2, right: 1, accuracy: 0.5, median_ms: 1500, wrong: [{ text: 'metaphor', count: 1 }] });
  assert.deepEqual(cross.items.find((i) => i.id === 't2'), { id: 't2', label: 'Pathetic fallacy', answered: 0, right: 0, accuracy: null, median_ms: null, wrong: [] });
  assert.deepEqual(cross.students.map((s) => [s.initials, s.accuracy, s.missed, s.strength]), [['AB', 1, [], ['self_paced']], ['CD', 0, ['Simile'], ['self_paced']], ['EF', null, [], []]]);
  const all = await teach(store, 'results', {});
  assert.equal(all.games.length, 4);

  const pushed = await teach(store, 'markbook_push', { class_id: 'class1', game_id: 'g_cross' });
  assert.equal(pushed.count, 2);
  const book = store.data.get('markbook/class1');
  const column = book.columns.find((c) => c.id === pushed.column_id);
  assert.equal(column.title, 'Crossword: Technique crossword');
  const crit = column.criteria[0].id;
  assert.deepEqual(book.marks[column.id], { st_ann: { criteria: { [crit]: 100 } }, st_cy: { criteria: { [crit]: 0 } } });
  await rejects(teach(store, 'markbook_push', { game_id: 'g_cross' }), 'need_class');

  // The markbook load carries game evidence for the class evidence and profile readers.
  const view = await markbookAction(store, 'class1', { action: 'load', skip_done: true });
  assert.deepEqual(view.games.map((g) => [g.game_id, Object.keys(g.students)]), [['g_cross', ['st_ann', 'st_cy']]]);
  assert.deepEqual(view.games[0].students.st_cy.evidence.map((e) => [e.item, e.share, e.tags]), [['t1', 0, ['kp:kp_sim1']]]);
});

test('Build from this unit: organiser vocabulary, auto-marked questions and quotes', async () => {
  const { store } = await setup();
  const block = (id, block_type, content) => ({ id, type: 'block', block_type, visibility: 'student_teacher', content });
  store.data.set(draftLessonKey('ql1'), {
    id: 'ql1', title: 'Week 2 quiz', blocks: [
      block('qq1', 'quiz_question', { question: mcq('qq1', 'Which is a simile?', ['Like a storm', 'The storm'], 0).question }),
      block('qq2', 'quiz_question', { question: { id: 'qq2', kind: 'extended_response', prompt: 'Write about the sea', marks: 4 } }),
      block('sec', 'section', { blocks: [block('qt1', 'quote', { quote: 'The fog took the harbour whole.', attribution: 'The Keeper', reference: 'Chapter 3' })] })
    ]
  });
  const src = await teach(store, 'sources');
  assert.equal(src.unit_id, 'unit1');
  assert.deepEqual(src.terms.map((t) => [t.item.id, t.item.term, t.item.pieces, t.item.clues.map((c) => c.kind)]), [['t_ol_simile', 'Simile', ['kp_sim1'], ['definition', 'example']], ['t_ol_other', 'Irony', [], ['definition']]]);
  assert.deepEqual(src.questions.map((q) => [q.block_id, q.item.id, q.item.question.kind]), [['qq1', 'q_qq1', 'multiple_choice']]);
  assert.deepEqual(src.quotes.map((q) => [q.item.text, q.item.source, q.attribution]), [['The fog took the harbour whole.', 'Chapter 3', 'The Keeper']]);
});

test('a play is marked against the keys it started with, even after a republish', async () => {
  const { store } = await setup();
  await claim(store, 1);
  const { play_id } = await act(store, 1, 'solo_start', { game_id: 'g_cross' });
  const changed = gameLesson();
  changed.game.games[0].items = changed.game.games[0].items.map((t) => (t.id === 't2' ? { ...t, term: 'Personification' } : t));
  const next = prepareGamePublish(changed);
  await storeGameKeys(store, 'gl1', next.record);
  const r = await act(store, 1, 'solo_event', { game_id: 'g_cross', play_id, events: [{ item: 't2', move: 'answer', response: { text: 'Pathetic fallacy' } }] });
  assert.equal(r.results[0].correct, true);
});

/* ── Through the publish handler ─────────────────────────────────── */

const SECRET = 's'.repeat(32);
const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET, SITE_ORIGIN: 'https://life-hub.adam-russell.com' };
const session = createSessionToken({ now: Date.parse('2026-08-01T00:00:00Z'), randomBytes: () => Buffer.alloc(16, 4) }, SECRET).token;
const publish = (store) => createLessonPublishHandler({ env, now: () => Date.parse('2026-08-01T01:00:00Z'), getContentStore: async () => store })(new Request('https://api.adam-russell.com/api/lessons/gl1/publish', {
  method: 'POST',
  headers: { cookie: `life_hub_session=${session}`, origin: 'https://life-hub.adam-russell.com', 'content-type': 'application/json' },
  body: JSON.stringify({})
}));

test('publishing a Game lesson stores the public games and the keys apart', async () => {
  const stamp = '2026-08-01T00:00:00.000Z';
  const store = storeFor();
  const full = (b) => ({ type: 'block', variant: 'medium', visibility: 'student_teacher', layout: {}, print: {}, settings: {}, created_at: stamp, updated_at: stamp, schema_version: 1, ...b });
  store.data.set(draftLessonKey('gl1'), { ...gameLesson(), blocks: [full({ id: 'h1', block_type: 'heading', content: { text: 'Before you play' } })], created_at: stamp, updated_at: stamp, schema_version: 1 });
  const response = await publish(store);
  assert.equal(response.status, 200);
  const published = store.data.get(publishedLessonKey('gl1'));
  assert.equal(published.pedagogical_mode, 'game');
  assert.deepEqual(published.blocks.map((b) => b.id), ['h1']);
  assert.equal(published.game.games.length, 4);
  const text = JSON.stringify(published);
  for (const s of SECRETS) assert.ok(!text.includes(s), s);
  const current = store.data.get(gameKeys('gl1').current);
  assert.equal(store.data.get(gameKeys('gl1').version(current.version)).games.g_cross.items.t1.answers[0], 'Simile');

  // A quiz question in the lesson's own blocks would never run: refused, with why.
  store.data.set(draftLessonKey('gl1'), { ...store.data.get(draftLessonKey('gl1')), blocks: [full({ id: 'qx', block_type: 'quiz_question', content: { question: mcq('qx', 'Stray?', ['Yes', 'No'], 0).question } })] });
  const refused = await publish(store);
  assert.equal(refused.status, 400);
  assert.match((await refused.json()).error.message, /Game plays through its own player/);
  // Unfinished games are refused too.
  store.data.set(draftLessonKey('gl1'), { ...store.data.get(draftLessonKey('gl1')), blocks: [], game: { games: [] } });
  const empty = await publish(store);
  assert.equal(empty.status, 400);
  assert.match((await empty.json()).error.message, /Add at least one game/);
});
