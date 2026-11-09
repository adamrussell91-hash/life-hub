import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAPS, ORGANISER_LIMITS, OrganiserError, addDays, applyChange, applyResult, joinedSections, buildCards, lineText, releasedSheet, studentSheet, sydneyDay, todaysCards, upgradeOrganiser
} from '../../netlify/functions/_shared/organiser-model.mjs';

const T = '2026-11-10';

test('Sydney days and day arithmetic', () => {
  assert.equal(sydneyDay(new Date('2026-11-09T14:30:00Z')), '2026-11-10');
  assert.equal(sydneyDay(new Date('2026-11-09T12:30:00Z')), '2026-11-09');
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

const plain = ({ h: _h, ...rest }) => rest;

test('each Leitner move', () => {
  assert.deepEqual(GAPS, [1, 3, 7, 14, 28]);
  // New card: Got it goes to box 2, due in 3 days.
  assert.deepEqual(plain(applyResult(undefined, 'got', T)), { box: 2, due: '2026-11-13', last: T });
  assert.deepEqual(plain(applyResult({ box: 2, due: T, last: '2026-11-07' }, 'got', T)), { box: 3, due: '2026-11-17', last: T });
  assert.deepEqual(plain(applyResult({ box: 3, due: T, last: '2026-11-03' }, 'got', T)), { box: 4, due: '2026-11-24', last: T });
  assert.deepEqual(plain(applyResult({ box: 4, due: T, last: '2026-10-27' }, 'got', T)), { box: 5, due: '2026-12-08', last: T });
  // Not yet goes back to box 1 from anywhere and comes back tomorrow, never today.
  assert.deepEqual(plain(applyResult(undefined, 'again', T)), { box: 1, due: '2026-11-11', last: T });
  assert.deepEqual(plain(applyResult({ box: 4, due: T, last: '2026-11-01' }, 'again', T)), { box: 1, due: '2026-11-11', last: T });
});

test('the top box stays at 5', () => {
  assert.deepEqual(plain(applyResult({ box: 5, due: T, last: '2026-10-01' }, 'got', T)), { box: 5, due: '2026-12-08', last: T });
});

test('Again then Got it keeps box 1, due tomorrow', () => {
  const again = applyResult({ box: 3, due: T, last: '2026-11-01' }, 'again', T);
  assert.deepEqual(plain(applyResult(again, 'got', T)), { box: 1, due: '2026-11-11', last: T });
});

test('a card moves up once a day: a resent Got it changes nothing', () => {
  const first = applyResult({ box: 2, due: T, last: '2026-11-07' }, 'got', T);
  assert.equal(first.box, 3);
  assert.deepEqual(applyResult(first, 'got', T), first);
});

test('late cards just wait and move up one box', () => {
  assert.deepEqual(plain(applyResult({ box: 2, due: '2026-10-01', last: '2026-09-28' }, 'got', T)), { box: 3, due: '2026-11-17', last: T });
});

const table = [{ id: 'c1', label: 'Term', hide: false }, { id: 'c2', label: 'Meaning', hide: true }, { id: 'c3', label: 'Example', hide: false }];
const cardsFor = (n, from = '') =>
  buildCards([{ id: 's', name: 'Words', kind: 'table', columns: table, lines: Array.from({ length: n }, (_, i) => ({ id: `l${i}`, cells: [`term ${i}`, `meaning ${i}`, `ex ${i}`], ...(from ? { released_on: addDays(from, -1) } : {}) })) }]);

test('cards: cue is the first shown column, answer the first hidden, the rest on the back', () => {
  const [card] = cardsFor(1);
  assert.equal(card.cue_label, 'Term');
  assert.equal(card.cue, 'term 0');
  assert.equal(card.answer_label, 'Meaning');
  assert.equal(card.answer, 'meaning 0');
  assert.deepEqual(card.more, [{ label: 'Example', text: 'ex 0' }]);
});

test('cards need a hidden and a shown column, and text on both sides', () => {
  const sections = (columns, cells) => [{ id: 's', name: 'X', kind: 'table', columns, lines: [{ id: 'l', cells }] }];
  assert.equal(buildCards(sections(table.map((c) => ({ ...c, hide: false })), ['a', 'b', 'c'])).length, 0);
  assert.equal(buildCards(sections(table.map((c) => ({ ...c, hide: true })), ['a', 'b', 'c'])).length, 0);
  assert.equal(buildCards(sections(table, ['', 'b', 'c'])).length, 0);
  assert.equal(buildCards(sections(table, ['a', '', 'c'])).length, 0);
  assert.equal(buildCards([{ id: 's', name: 'L', kind: 'list', lines: [{ id: 'l', cells: ['x'] }] }]).length, 0);
});

test('a card carries its big idea, its box and its history', () => {
  const sections = [{ id: 's', name: 'W', kind: 'table', columns: table, lines: [{ id: 'l', cells: ['a', 'b', 'c'], piece_id: 'kp_1' }] }];
  const [card] = buildCards(sections, new Map([['kp_1', 'A big idea.']]));
  assert.equal(card.builds, 'A big idea.');
  assert.equal(todaysCards([card], {}, T).cards[0].box, 1);
  assert.deepEqual(todaysCards([card], {}, T).cards[0].history, []);
  const yesterday = applyResult(undefined, 'again', '2026-11-09');
  const [back] = todaysCards([card], { l: yesterday }, T).cards;
  assert.deepEqual(back.history, [{ d: '2026-11-09', ok: false }]);
  assert.equal(back.box, 1);
});

test('the history keeps one result a day, newest last', () => {
  const first = applyResult(undefined, 'got', '2026-11-09');
  const second = applyResult(first, 'again', T);
  assert.deepEqual(second.h, [{ d: '2026-11-09', ok: true }, { d: T, ok: false }]);
  assert.deepEqual(applyResult(second, 'got', T).h, [{ d: '2026-11-09', ok: true }, { d: T, ok: true }]);
});

test('only lines of ticked-off lessons, and lines no lesson holds, make cards', () => {
  const lines = [{ id: 'a', cells: ['a', 'b', ''], lesson_ids: ['done'] }, { id: 'b', cells: ['a', 'b', ''], lesson_ids: ['other'] }, { id: 'c', cells: ['a', 'b', ''], lesson_ids: ['other', 'done'] }, { id: 'd', cells: ['a', 'b', ''] }];
  const cards = buildCards(joinedSections([{ id: 's', name: 'W', kind: 'table', columns: table, lines }], new Set(['done'])));
  assert.deepEqual(cards.map((c) => c.line_id), ['a', 'c', 'd']);
});

test('daily set of 15: oldest due first, then new cards in sheet order', () => {
  const cards = cardsFor(30);
  const boxes = {
    l25: { box: 2, due: '2026-11-08', last: '2026-11-05' },
    l26: { box: 3, due: '2026-11-01', last: '2026-10-25' },
    l27: { box: 1, due: T, last: '2026-11-09' }
  };
  const { cards: today, next, boxes: counts } = todaysCards(cards, boxes, T);
  assert.equal(today.length, 15);
  assert.deepEqual(today.slice(0, 3).map((c) => c.line_id), ['l26', 'l25', 'l27']);
  assert.deepEqual(today.slice(3, 6).map((c) => c.line_id), ['l0', 'l1', 'l2']);
  assert.equal(next.date, '2026-11-11');
  assert.equal(next.count, 15);
  assert.deepEqual(counts, [28, 1, 1, 0, 0]);
});

test('next never promises more than a day\'s set', () => {
  const { next } = todaysCards(cardsFor(100), {}, T);
  assert.deepEqual(next, { date: '2026-11-11', count: 15 });
});

test('a card answered today never comes back today, and answers use up the 15', () => {
  const cards = cardsFor(30);
  const boxes = {};
  for (let i = 0; i < 10; i += 1) boxes[`l${i}`] = { box: 2, due: '2026-11-13', last: T };
  boxes.l10 = { box: 1, due: '2026-11-11', last: T };
  // An older record: Again used to leave a card due the same day.
  boxes.l11 = { box: 1, due: T, last: T };
  const { cards: today } = todaysCards(cards, boxes, T);
  assert.equal(today.length, 3);
  assert.deepEqual(today.map((c) => c.line_id), ['l12', 'l13', 'l14']);
});

test('late cards come before new ones and nothing moves down for waiting', () => {
  const cards = cardsFor(3);
  const { cards: today } = todaysCards(cards, { l2: { box: 4, due: '2026-10-01', last: '2026-09-01' } }, T);
  assert.deepEqual(today.map((c) => c.line_id), ['l2', 'l0', 'l1']);
});

test('nothing due says when the next cards are', () => {
  const cards = cardsFor(2);
  const boxes = { l0: { box: 2, due: '2026-11-13', last: T }, l1: { box: 3, due: '2026-11-17', last: T } };
  const out = todaysCards(cards, boxes, T);
  assert.deepEqual(out.cards, []);
  assert.deepEqual(out.next, { date: '2026-11-13', count: 1 });
  assert.equal(todaysCards([], {}, T).next, null);
});

const organiser = () => ({ sections: [] });
const withTable = () => {
  let o = applyChange(organiser(), { op: 'add_section', name: 'Words', kind: 'table', columns: [{ label: 'Term' }, { label: 'Meaning', hide: true }] });
  o = applyChange(o, { op: 'add_lines', section_id: o.sections[0].id, lines: [{ cells: ['alpha', 'first'] }, { cells: ['beta', 'second'], lesson_id: 'lesson1', piece_id: 'kp_1' }] });
  return o;
};

test('release: published, future date, no date, no lesson, unpublished, deleted', () => {
  let o = applyChange(organiser(), { op: 'add_section', name: 'Facts', kind: 'list' });
  const sid = o.sections[0].id;
  const texts = { pub: 'published fact', future: 'future fact', nodate: 'undated fact', none: 'free fact', unpub: 'unpublished fact', gone: 'deleted fact' };
  o = applyChange(o, {
    op: 'add_lines',
    section_id: sid,
    lines: [
      { cells: [texts.pub], lesson_id: 'pub' },
      { cells: [texts.future], lesson_id: 'future' },
      { cells: [texts.nodate], lesson_id: 'nodate' },
      { cells: [texts.none] },
      { cells: [texts.unpub], lesson_id: 'unpub' },
      { cells: [texts.gone], lesson_id: 'gone' }
    ]
  });
  // Written before lessons ticked, so students already have it.
  o.sections[0].lines[3].open = true;
  const releases = {
    pub: { state: 'released', day: '2026-11-01' },
    future: { state: 'waiting' },
    nodate: { state: 'released', day: '2026-11-09' },
    unpub: { state: 'waiting' },
    gone: { state: 'gone' }
  };
  const sheet = releasedSheet(o, releases, T);
  assert.deepEqual(sheet.sections[0].lines.map((l) => l.cells[0]), [texts.pub, texts.nodate, texts.none]);
  const sent = JSON.stringify(studentSheet(sheet));
  for (const hidden of [texts.future, texts.unpub, texts.gone]) assert.equal(sent.includes(hidden), false);
  for (const id of ['lesson_id', 'piece_id', 'released_on']) assert.equal(sent.includes(id), false);
  // Fresh means released in the last 7 days; a line with no lesson is never fresh.
  assert.deepEqual(sheet.sections[0].lines.map((l) => l.fresh), [false, true, false]);
});

test('a section with nothing released is left out, and so is the week banner for it', () => {
  let o = applyChange(organiser(), { op: 'add_section', name: 'Hidden section name', kind: 'list' });
  o = applyChange(o, { op: 'add_lines', section_id: o.sections[0].id, lines: [{ cells: ['x'], lesson_id: 'later' }] });
  o = applyChange(o, { op: 'set_week', week: { section_id: o.sections[0].id, due: '2026-11-12', reason: 'Quiz' } });
  const sheet = releasedSheet(o, { later: { state: 'waiting' } }, T);
  assert.deepEqual(sheet, { sections: [] });
});

test('the week banner shows until its day', () => {
  let o = applyChange(organiser(), { op: 'add_section', name: 'Facts', kind: 'list' });
  o = applyChange(o, { op: 'add_lines', section_id: o.sections[0].id, lines: [{ cells: ['x'] }] });
  o.sections[0].lines[0].open = true;
  o = applyChange(o, { op: 'set_week', week: { section_id: o.sections[0].id, due: T, reason: 'Review quiz' } });
  assert.equal(releasedSheet(o, {}, T).week.reason, 'Review quiz');
  assert.equal(releasedSheet(o, {}, addDays(T, 1)).week, undefined);
});

test('changes keep ids stable through edits and moves', () => {
  let o = withTable();
  const ids = o.sections[0].lines.map((l) => l.id);
  o = applyChange(o, { op: 'update_line', line_id: ids[0], cells: ['ALPHA', 'one'] });
  o = applyChange(o, { op: 'move_line', line_id: ids[0], to: 1 });
  assert.deepEqual(o.sections[0].lines.map((l) => l.id), [ids[1], ids[0]]);
  assert.deepEqual(o.sections[0].lines[1].cells, ['ALPHA', 'one']);
  o = applyChange(o, { op: 'update_line', line_id: ids[1], lesson_id: null, piece_id: null });
  assert.equal('lesson_id' in o.sections[0].lines[0], false);
  for (const prefix of ['os_', 'oc_', 'ol_']) assert.ok(JSON.stringify(o).includes(`"${prefix}`));
});

test('table columns: removed drop their cell, new add an empty one, reorder follows ids', () => {
  let o = withTable();
  const [c1, c2] = o.sections[0].columns;
  o = applyChange(o, { op: 'update_section', section_id: o.sections[0].id, columns: [{ id: c2.id, label: 'Meaning', hide: true }, { id: c1.id, label: 'Term' }, { label: 'Example' }] });
  assert.deepEqual(o.sections[0].lines[0].cells, ['first', 'alpha', '']);
  o = applyChange(o, { op: 'update_section', section_id: o.sections[0].id, columns: [{ id: c1.id, label: 'Term' }, { label: 'Extra' }] });
  assert.deepEqual(o.sections[0].lines[0].cells, ['alpha', '']);
});

test('table to list joins non-empty cells; list to table gets two columns, the second hidden', () => {
  let o = withTable();
  const sid = o.sections[0].id;
  o = applyChange(o, { op: 'update_section', section_id: sid, kind: 'list' });
  assert.equal(o.sections[0].columns, undefined);
  assert.deepEqual(o.sections[0].lines[0].cells, ['alpha - first']);
  o = applyChange(o, { op: 'update_section', section_id: sid, kind: 'table' });
  assert.equal(o.sections[0].columns.length, 2);
  assert.deepEqual(o.sections[0].columns.map((c) => c.hide), [false, true]);
  assert.deepEqual(o.sections[0].lines[0].cells, ['alpha - first', '']);
});

test('moving a line into another kind of section recasts its cells', () => {
  let o = withTable();
  o = applyChange(o, { op: 'add_section', name: 'Facts', kind: 'list' });
  o = applyChange(o, { op: 'move_line', line_id: o.sections[0].lines[0].id, section_id: o.sections[1].id, to: 0 });
  assert.deepEqual(o.sections[1].lines[0].cells, ['alpha - first']);
});

test('deleting a section clears its week; sections and lines move', () => {
  let o = withTable();
  o = applyChange(o, { op: 'add_section', name: 'B', kind: 'list' });
  o = applyChange(o, { op: 'set_week', week: { section_id: o.sections[1].id, due: T, reason: '' } });
  o = applyChange(o, { op: 'move_section', section_id: o.sections[1].id, to: 0 });
  assert.equal(o.sections[0].name, 'B');
  o = applyChange(o, { op: 'delete_section', section_id: o.sections[0].id });
  assert.equal(o.week, undefined);
  o = applyChange(o, { op: 'delete_line', line_id: o.sections[0].lines[0].id });
  assert.equal(o.sections[0].lines.length, 1);
  o = applyChange(o, { op: 'set_week', week: null });
});

const fails = (fn, code) => assert.throws(fn, (e) => e instanceof OrganiserError && e.code === code);

test('limits', () => {
  let o = organiser();
  for (let i = 0; i < ORGANISER_LIMITS.sections; i += 1) o = applyChange(o, { op: 'add_section', name: `S${i}`, kind: 'list' });
  fails(() => applyChange(o, { op: 'add_section', name: 'one more', kind: 'list' }), 'too_many_sections');
  const sid = o.sections[0].id;
  fails(() => applyChange(organiser(), { op: 'add_section', name: 'x'.repeat(ORGANISER_LIMITS.name + 1) }), 'too_long');
  fails(() => applyChange(o, { op: 'add_lines', section_id: sid, lines: [{ cells: ['x'.repeat(ORGANISER_LIMITS.cell + 1)] }] }), 'too_long');
  fails(() => applyChange(o, { op: 'add_lines', section_id: sid, lines: [{ cells: ['a', 'b'] }] }), 'bad_cells');
  fails(() => applyChange(o, { op: 'set_week', week: { section_id: sid, due: T, reason: 'r'.repeat(ORGANISER_LIMITS.reason + 1) } }), 'too_long');
  fails(() => applyChange(o, { op: 'set_week', week: { section_id: sid, due: 'soon', reason: '' } }), 'bad_date');
  fails(() => applyChange(organiser(), { op: 'add_section', name: 'T', kind: 'table', columns: [{ label: 'a' }] }), 'bad_columns');
  fails(() => applyChange(organiser(), { op: 'add_section', name: 'T', kind: 'table', columns: Array.from({ length: 5 }, () => ({ label: 'a' })) }), 'bad_columns');
  fails(() => applyChange(o, { op: 'nope' }), 'bad_action');
  fails(() => applyChange(o, { op: 'delete_line', line_id: 'ol_missing' }), 'not_found');
  const full = applyChange(organiser(), { op: 'add_section', name: 'Facts', kind: 'list' });
  const lines = Array.from({ length: ORGANISER_LIMITS.lines }, (_, i) => ({ cells: [`fact ${i}`] }));
  const filled = applyChange(full, { op: 'add_lines', section_id: full.sections[0].id, lines });
  fails(() => applyChange(filled, { op: 'add_lines', section_id: full.sections[0].id, lines: [{ cells: ['more'] }] }), 'too_many_lines');
});

test('each section role starts with its own columns, so its lines make the right cards', () => {
  let o = applyChange(null, { op: 'add_section', role: 'concept', name: 'Perspective', concept_key: 'PERS', sentence: ' A sentence  for the unit. ' });
  o = applyChange(o, { op: 'add_section', role: 'vocab', name: 'Vocabulary' });
  o = applyChange(o, { op: 'add_section', role: 'facts', name: 'Facts and topics' });
  o = applyChange(o, { op: 'add_section', role: 'story', name: 'Story order' });
  const [concept, vocab, facts, story] = o.sections;
  assert.equal(concept.sentence, 'A sentence for the unit.');
  assert.deepEqual(concept.columns.map((c) => [c.label, c.hide]), [['Prompt', false], ['What to know', true], ['Example', false]]);
  assert.deepEqual(vocab.columns.map((c) => [c.label, c.hide]), [['Word', false], ['Meaning', true], ['In a sentence', false]]);
  assert.deepEqual(facts.columns.map((c) => [c.label, c.hide]), [['Label', false], ['Detail', true]]);
  assert.equal(story.kind, 'sequence');
  assert.throws(() => applyChange(o, { op: 'add_section', role: 'concept', name: 'Again', concept_key: 'PERS' }), (e) => e.status === 409);
  assert.throws(() => applyChange(o, { op: 'add_section', role: 'nope', name: 'x' }), OrganiserError);

  o = applyChange(o, { op: 'add_lines', section_id: concept.id, lines: [{ cells: ['What does a frame do?', 'It shapes belief.', ''] }, { cells: ['', 'No prompt yet.', ''] }] });
  o = applyChange(o, { op: 'add_lines', section_id: vocab.id, lines: [{ cells: ['Hubris', 'Overreaching pride', ''], tier: 3 }] });
  o = applyChange(o, { op: 'add_lines', section_id: facts.id, lines: [{ cells: ['Author', 'An invented writer'] }] });
  const out = releasedSheet({ ...o, sections: o.sections.map((s) => ({ ...s, lines: s.lines.map((l) => ({ ...l, open: true })) })) }, {}, T);
  const cards = buildCards(out.sections);
  assert.deepEqual(cards.map((c) => [c.section, c.cue, c.answer]), [
    ['Perspective', 'What does a frame do?', 'It shapes belief.'],
    ['Vocabulary', 'Hubris', 'Overreaching pride'],
    ['Facts and topics', 'Author', 'An invented writer']
  ]);
  const sent = studentSheet(out);
  assert.equal(sent.sections[0].sentence, 'A sentence for the unit.');
  assert.equal(sent.sections[0].role, 'concept');
  assert.equal(sent.sections[1].lines[0].tier, 3);
  assert.equal('concept_key' in sent.sections[0], false);
  assert.equal('dot_points' in sent.sections[0], false);
});

test('a tick clears open, tier and dot points are checked, and a section ticked off stays home', () => {
  let o = applyChange(null, { op: 'add_section', role: 'key_lines', name: 'Key lines' });
  const id = o.sections[0].id;
  o = applyChange(o, { op: 'add_lines', section_id: id, lines: [{ cells: ['A line', 'Someone', ''] }] });
  const line = o.sections[0].lines[0];
  assert.equal(line.open, undefined);
  assert.equal(releasedSheet(o, {}, T).sections.length, 0);

  o.sections[0].lines[0].open = true;
  assert.equal(releasedSheet(o, {}, T).sections.length, 1);
  o = applyChange(o, { op: 'update_section', section_id: id, off: true });
  assert.equal(releasedSheet(o, {}, T).sections.length, 0);
  o = applyChange(o, { op: 'update_section', section_id: id, off: false });
  assert.equal(o.sections[0].off, undefined);

  o = applyChange(o, { op: 'update_line', line_id: line.id, lesson_id: 'lesson_a' });
  assert.equal(o.sections[0].lines[0].open, undefined);
  assert.equal(releasedSheet(o, { lesson_a: { state: 'waiting' } }, T).sections.length, 0);

  o = applyChange(o, { op: 'update_line', line_id: line.id, tier: 2 });
  assert.equal(o.sections[0].lines[0].tier, 2);
  o = applyChange(o, { op: 'update_line', line_id: line.id, tier: null });
  assert.equal(o.sections[0].lines[0].tier, undefined);
  assert.throws(() => applyChange(o, { op: 'update_line', line_id: line.id, tier: 4 }), OrganiserError);
  assert.deepEqual(applyChange(o, { op: 'update_section', section_id: id, dot_points: [2, 2, 5] }).sections[0].dot_points, [2, 5]);
  assert.throws(() => applyChange(o, { op: 'update_section', section_id: id, dot_points: ['x'] }), OrganiserError);
});

test('upgrade: usual names get roles, no-lesson lines stay open, and it only runs once', () => {
  const up = upgradeOrganiser({
    sections: [
      { id: 'a', name: 'Key ideas', kind: 'table', columns: [], lines: [{ id: 'l1', cells: [] }, { id: 'l2', cells: [], lesson_id: 'x' }] },
      { id: 'b', name: 'Vocabulary', kind: 'table', columns: [], lines: [] },
      { id: 'c', name: 'Key lines', kind: 'list', lines: [] },
      { id: 'd', name: 'Timeline', kind: 'sequence', lines: [] }
    ]
  });
  assert.equal(up.v, 2);
  assert.deepEqual(up.sections.map((s) => s.role), ['ideas', 'vocab', undefined, undefined]);
  assert.equal(up.sections[0].lines[0].open, true);
  assert.equal(up.sections[0].lines[1].open, undefined);
  const added = { ...up, sections: [{ ...up.sections[0], lines: [{ id: 'l3', cells: [] }] }] };
  assert.equal(upgradeOrganiser(added).sections[0].lines[0].open, undefined);
  assert.deepEqual(upgradeOrganiser(null), { sections: [], v: 2 });
});

test('lineText: a key idea says what to know, others say both sides', () => {
  const columns = [{ label: 'Word', hide: false }, { label: 'Meaning', hide: true }];
  assert.equal(lineText({ kind: 'table', role: 'concept', columns }, { cells: ['Prompt', 'What to know'] }), 'What to know');
  assert.equal(lineText({ kind: 'table', role: 'concept', columns }, { cells: ['Prompt', ''] }), 'Prompt');
  assert.equal(lineText({ kind: 'table', role: 'vocab', columns }, { cells: ['Hubris', 'Pride'] }), 'Hubris: Pride');
  assert.equal(lineText({ kind: 'sequence' }, { cells: ['A step'] }), 'A step');
});

test('answered counts the cards already done today, so a page can tell done from nothing due', () => {
  const cards = cardsFor(3);
  assert.equal(todaysCards(cards, {}, T).answered, 0);
  const boxes = { l0: { box: 2, due: '2026-11-12', last: T }, l1: { box: 1, due: '2026-11-11', last: T }, l2: { box: 2, due: '2026-11-12', last: '2026-11-08' } };
  const out = todaysCards(cards, boxes, T);
  assert.equal(out.answered, 2);
  assert.equal(out.cards.length, 0);
});
