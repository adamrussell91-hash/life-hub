import test from 'node:test';
import assert from 'node:assert/strict';
import { claimInitials, loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';
import { OrganiserError, organiserStudentAction, organiserTeacherAction } from '../../netlify/functions/_shared/organiser.mjs';
import { ORGANISER_LIMITS } from '../../netlify/functions/_shared/organiser-model.mjs';

// Store with etags, so the teacher endpoint's compare-and-set is exercised.
function storeFixture(entries = []) {
  const data = new Map(entries.map(([k, v]) => [k, structuredClone(v)]));
  const versions = new Map();
  const bump = (key) => versions.set(key, (versions.get(key) ?? 0) + 1);
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: String(versions.get(key) ?? 0) } : null; },
    async setJSON(key, value, options) {
      if (options?.onlyIfNew && data.has(key)) return { modified: false };
      if (options?.onlyIfMatch !== undefined && String(versions.get(key) ?? 0) !== options.onlyIfMatch) return { modified: false };
      data.set(key, structuredClone(value));
      bump(key);
      return { modified: true };
    },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}

const NOW = new Date('2026-11-10T01:00:00Z'); // 10 Nov, Sydney
const token = (n) => n.toString(16).repeat(48).slice(0, 48);
const lesson = (id, extra = {}, published = '2026-11-01T01:00:00Z') => [
  [`lessons/${id}`, { id, title: id, unit_id: 'unit1', ...extra }],
  ...(published ? [[`published/lessons/${id}`, { lesson_id: id, unit_id: 'unit1', published_at: published }]] : [])
];
const row = (id, lesson_id, date, extra = {}) => [`scheduled_lessons/${id}`, { id, class_id: 'class1', lesson_id, date, ...extra }];

const SECRET = {
  future: 'FUTURE-SECRET-TEXT', nodate: 'NODATE-TEXT', unpub: 'UNPUBLISHED-SECRET', gone: 'DELETED-SECRET', skipped: 'SKIPPED-ROW-TEXT'
};

async function fixture(extra = []) {
  const store = storeFixture([
    ['classes/class1', { id: 'class1', type: 'class', status: 'active', title: '9 English', current_unit_id: 'unit1', students: [{ name: 'Bob Brown' }, { name: 'Tom Tills' }] }],
    ['units/unit1', {
      id: 'unit1', title: 'Invented unit', lesson_ids: ['past', 'future', 'nodate', 'unpub', 'gone'],
      deep_understandings: [{ id: 'du_aaaa', claim: 'Invented claim about weather.', pieces: [{ id: 'kp_rain', text: 'Rain falls.' }] }]
    }],
    ...lesson('past'), ...lesson('future'), ...lesson('nodate'), ...lesson('unpub', {}, null),
    ...lesson('gone', { status: 'trashed', deleted_at: '2026-11-02T00:00:00Z' }),
    row('r1', 'past', '2026-11-03'),
    row('r2', 'future', '2026-11-20'),
    row('r3', 'gone', '2026-11-03'),
    ...extra
  ]);
  const roster = await loadRoster(store, 'class1');
  await claimInitials(store, roster, token(1), 'BB');
  return store;
}

const teacher = (store, body, method = 'POST') => organiserTeacherAction(store, 'unit1', method, body, { now: NOW });
const student = (store, body) => organiserStudentAction(store, 'class1', body, { now: NOW });

async function seeded(store) {
  let out = await teacher(store, { op: 'add_section', name: 'Words', kind: 'table', columns: [{ label: 'Term' }, { label: 'Meaning', hide: true }] });
  const sid = out.organiser.sections[0].id;
  out = await teacher(store, {
    op: 'add_lines',
    section_id: sid,
    lines: [
      { cells: ['past term', 'past meaning'], lesson_id: 'past', piece_id: 'kp_rain' },
      { cells: [SECRET.future, 'x'], lesson_id: 'future' },
      { cells: [SECRET.nodate, 'y'], lesson_id: 'nodate' },
      { cells: ['free term', 'free meaning'] },
      { cells: [SECRET.unpub, 'z'], lesson_id: 'unpub' },
      { cells: [SECRET.gone, 'w'], lesson_id: 'gone' }
    ]
  });
  return { sid, lines: out.organiser.sections[0].lines };
}

test('teacher: two changes in a row keep both lines, with stable ids', async () => {
  const store = await fixture();
  let out = await teacher(store, { op: 'add_section', name: 'Facts', kind: 'list' });
  const sid = out.organiser.sections[0].id;
  const a = await teacher(store, { op: 'add_lines', section_id: sid, lines: [{ cells: ['first'] }] });
  const b = await teacher(store, { op: 'add_lines', section_id: sid, lines: [{ cells: ['second'] }] });
  const lines = b.organiser.sections[0].lines;
  assert.deepEqual(lines.map((l) => l.cells[0]), ['first', 'second']);
  assert.equal(lines[0].id, a.organiser.sections[0].lines[0].id);
  assert.deepEqual((await teacher(store, {}, 'GET')).organiser.sections[0].lines.map((l) => l.id), lines.map((l) => l.id));
});

test('teacher: a write that lost the race reloads and applies on top', async () => {
  const store = await fixture();
  await teacher(store, { op: 'add_section', name: 'Facts', kind: 'list' });
  const sid = (await teacher(store, {}, 'GET')).organiser.sections[0].id;
  const set = store.setJSON.bind(store);
  let raced = false;
  store.setJSON = async (key, value, options) => {
    if (!raced && key === 'unit_organisers/unit1') {
      raced = true;
      // Another tab writes first.
      const other = structuredClone(store.data.get(key));
      other.sections[0].lines.push({ id: 'ol_other', cells: ['theirs'] });
      await set(key, other, {});
    }
    return set(key, value, options);
  };
  const out = await teacher(store, { op: 'add_lines', section_id: sid, lines: [{ cells: ['mine'] }] });
  assert.deepEqual(out.organiser.sections[0].lines.map((l) => l.cells[0]), ['theirs', 'mine']);
});

test('teacher: limits reach the endpoint as 400s; unknown unit is 404', async () => {
  const store = await fixture();
  await assert.rejects(teacher(store, { op: 'add_section', name: 'x'.repeat(ORGANISER_LIMITS.name + 1) }), (e) => e instanceof OrganiserError && e.status === 400);
  await assert.rejects(organiserTeacherAction(store, 'nope', 'GET', {}), (e) => e.status === 404);
});

test('teacher: status shows released, waiting and lesson_gone', async () => {
  const store = await fixture();
  const { lines } = await seeded(store);
  const { status } = await teacher(store, {}, 'GET');
  const by = (i) => status[lines[i].id];
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(by), ['released', 'waiting', 'released', 'released', 'waiting', 'lesson_gone']);
});

test('teacher: GET with a class returns the released sheet for Run and Print', async () => {
  const store = await fixture();
  await seeded(store);
  const out = await teacher(store, { class: 'class1' }, 'GET');
  assert.deepEqual(out.sheet.sections[0].lines.map((l) => l.cells[0]), ['past term', SECRET.nodate, 'free term']);
  assert.equal(out.sheet.sections[0].lines[0].lesson_id, 'past');
  await assert.rejects(teacher(store, { class: 'missing' }, 'GET'), (e) => e.status === 404);
  assert.equal((await teacher(store, {}, 'GET')).sheet, undefined);
});

test('student load: only released lines; unreleased text is absent from the response', async () => {
  const store = await fixture([row('r5', 'unpub', '2026-11-03'), row('r6', 'nodate', '2026-11-04', { delivery_status: 'skipped' })]);
  await seeded(store);
  const out = await student(store, { action: 'load', class_token: token(1) });
  assert.equal(out.need, null);
  const [sheet] = out.sheets;
  assert.equal(sheet.title, 'Invented unit');
  assert.equal(sheet.current, true);
  // The skipped row doesn't count as a date, so the undated lesson stays released.
  assert.deepEqual(sheet.sections[0].lines.map((l) => l.cells[0]), ['past term', SECRET.nodate, 'free term']);
  const sent = JSON.stringify(out);
  for (const text of [SECRET.future, SECRET.unpub, SECRET.gone, 'x"', 'FUTURE']) assert.equal(sent.includes(text), false, text);
});

test('student load: no piece or lesson ids, but the big idea rides on the card', async () => {
  const store = await fixture();
  const { lines } = await seeded(store);
  // Day after release: the lesson was published 1 Nov, class date 3 Nov.
  const out = await student(store, { action: 'load', class_token: token(1) });
  const sent = JSON.stringify(out);
  for (const id of ['kp_rain', '"past"', 'lesson_id', 'piece_id', 'released_on', 'unit_organisers']) assert.equal(sent.includes(id), false, id);
  const card = out.practice.cards.find((c) => c.cue === 'past term');
  assert.equal(card.builds, 'Invented claim about weather.');
  assert.equal(card.answer, 'past meaning');
  assert.ok(out.sheets[0].sections[0].lines.some((l) => l.id === lines[0].id));
});

test('student load: no claim shows the sheet without practice; a class with no list says so', async () => {
  const store = await fixture();
  await seeded(store);
  const out = await student(store, { action: 'load', class_token: token(9) });
  assert.equal(out.need, 'initials');
  assert.equal(out.practice, null);
  assert.equal(out.sheets[0].sections[0].lines.length, 3);
  assert.equal(JSON.stringify(out).includes('"cards"'), false);

  const bare = await fixture();
  await seeded(bare);
  bare.data.set('classes/class1', { ...bare.data.get('classes/class1'), students: [] });
  const none = await student(bare, { action: 'load', class_token: token(9) });
  assert.equal(none.need, 'no_list');
  assert.equal(none.practice, null);
  assert.equal(none.sheets.length, 1);
});

test('student load: the line released today joins practice tomorrow, and is fresh', async () => {
  const store = await fixture([row('r7', 'nodate', '2026-11-10')]);
  await seeded(store);
  const out = await student(store, { action: 'load', class_token: token(1) });
  assert.equal(out.sheets[0].sections[0].lines.find((l) => l.cells[0] === SECRET.nodate).fresh, true);
  assert.equal(out.practice.cards.some((c) => c.cue === SECRET.nodate), false);
  assert.deepEqual(out.practice.next, { date: '2026-11-11', count: 1 });
});

test('student load: a trashed unit gives nothing', async () => {
  const store = await fixture();
  await seeded(store);
  store.data.set('units/unit1', { ...store.data.get('units/unit1'), status: 'trashed', deleted_at: '2026-11-02T00:00:00Z' });
  const out = await student(store, { action: 'load', class_token: token(1) });
  assert.deepEqual(out.sheets, []);
});

test('student load: the week banner appears with its section name and goes the day after', async () => {
  const store = await fixture();
  const { sid } = await seeded(store);
  await teacher(store, { op: 'set_week', week: { section_id: sid, due: '2026-11-12', reason: 'Review quiz' } });
  const out = await student(store, { action: 'load', class_token: token(1) });
  assert.deepEqual(out.sheets[0].week, { section_id: sid, section_name: 'Words', due: '2026-11-12', reason: 'Review quiz' });
  const later = await organiserStudentAction(store, 'class1', { action: 'load', class_token: token(1) }, { now: new Date('2026-11-12T20:00:00Z') });
  assert.equal(later.sheets[0].week, undefined);
});

test('review: needs a claim, moves boxes on the server, once a day', async () => {
  const store = await fixture();
  const { lines } = await seeded(store);
  const past = lines[0].id;
  await assert.rejects(student(store, { action: 'review', class_token: token(9), results: [{ line_id: past, result: 'got' }] }), (e) => e.status === 403 && e.code === 'need_initials');

  let out = await student(store, { action: 'review', class_token: token(1), results: [{ line_id: past, result: 'got' }] });
  assert.equal(out.today, 2); // the other two released cards are left
  const key = [...store.data.keys()].find((k) => k.startsWith('organiser_practice/class1/'));
  assert.deepEqual(store.data.get(key).boxes[past], { box: 2, due: '2026-11-13', last: '2026-11-10' });
  // A resend the same day changes nothing.
  await student(store, { action: 'review', class_token: token(1), results: [{ line_id: past, result: 'got' }] });
  assert.equal(store.data.get(key).boxes[past].box, 2);
  // Again repeats it today; Got it on the repeat keeps box 1.
  out = await student(store, { action: 'review', class_token: token(1), results: [{ line_id: past, result: 'again' }] });
  assert.equal(out.today, 3);
  await student(store, { action: 'review', class_token: token(1), results: [{ line_id: past, result: 'got' }] });
  assert.deepEqual(store.data.get(key).boxes[past], { box: 1, due: '2026-11-11', last: '2026-11-10' });
  assert.equal(JSON.stringify(store.data.get(key)).includes('past term'), false);
});

test('review: unknown, unreleased and non-card line ids are ignored; 40 is the limit', async () => {
  const store = await fixture();
  const { lines } = await seeded(store);
  const results = [
    { line_id: 'ol_nope', result: 'got' },
    { line_id: lines[1].id, result: 'got' }, // future lesson
    { line_id: lines[0].id, result: 'maybe' },
    null
  ];
  await student(store, { action: 'review', class_token: token(1), results });
  assert.equal([...store.data.keys()].some((k) => k.startsWith('organiser_practice/')), false);
  const forty = Array.from({ length: 40 }, () => ({ line_id: 'ol_nope', result: 'got' }));
  await student(store, { action: 'review', class_token: token(1), results: forty });
  await assert.rejects(student(store, { action: 'review', class_token: token(1), results: [...forty, forty[0]] }), (e) => e.status === 400 && e.code === 'too_many');
});

test('review: a withdrawn line keeps its box; a deleted line drops out', async () => {
  const store = await fixture();
  const { lines } = await seeded(store);
  await student(store, { action: 'review', class_token: token(1), results: [{ line_id: lines[0].id, result: 'got' }, { line_id: lines[3].id, result: 'got' }] });
  const key = [...store.data.keys()].find((k) => k.startsWith('organiser_practice/class1/'));
  // Unpublish the lesson: the line is withdrawn, not served, still boxed.
  store.data.delete('published/lessons/past');
  let out = await student(store, { action: 'load', class_token: token(1) });
  assert.equal(out.sheets[0].sections[0].lines.some((l) => l.id === lines[0].id), false);
  await student(store, { action: 'review', class_token: token(1), results: [{ line_id: lines[3].id, result: 'again' }] });
  assert.ok(store.data.get(key).boxes[lines[0].id]);
  // Delete the free line: its box is pruned on the next review.
  await teacher(store, { op: 'delete_line', line_id: lines[3].id });
  store.data.set('published/lessons/past', { lesson_id: 'past', unit_id: 'unit1', published_at: '2026-11-01T01:00:00Z' });
  await student(store, { action: 'review', class_token: token(1), results: [{ line_id: lines[0].id, result: 'got' }] });
  assert.equal(store.data.get(key).boxes[lines[3].id], undefined);
});

test('lesson: the first cell of each released line from that lesson, no claim needed', async () => {
  const store = await fixture();
  await seeded(store);
  assert.deepEqual(await student(store, { action: 'lesson', class_token: token(9), lesson_id: 'past' }), { lines: ['past term'], joining: false });
  assert.deepEqual(await student(store, { action: 'lesson', lesson_id: 'future' }), { lines: [], joining: false });
  await assert.rejects(student(store, { action: 'lesson', lesson_id: '../x' }), (e) => e.status === 400);
});

test('the daily cap and order reach the endpoint', async () => {
  const store = await fixture();
  let out = await teacher(store, { op: 'add_section', name: 'Words', kind: 'table', columns: [{ label: 'Term' }, { label: 'Meaning', hide: true }] });
  const lines = Array.from({ length: 30 }, (_, i) => ({ cells: [`term ${i}`, `meaning ${i}`] }));
  out = await teacher(store, { op: 'add_lines', section_id: out.organiser.sections[0].id, lines: lines.slice(0, 30) });
  const load = await student(store, { action: 'load', class_token: token(1) });
  assert.equal(load.practice.today, 20);
  assert.equal(load.practice.cards[0].cue, 'term 0');
  assert.deepEqual(load.practice.next, { date: '2026-11-11', count: 10 });
});

test('the student endpoint rejects bad bodies and unknown classes', async () => {
  const store = await fixture();
  await assert.rejects(student(store, null), (e) => e.status === 400);
  await assert.rejects(student(store, { action: 'wipe' }), (e) => e.code === 'bad_action');
  await assert.rejects(organiserStudentAction(store, 'nope', { action: 'load' }, { now: NOW }), (e) => e.status === 404);
});
