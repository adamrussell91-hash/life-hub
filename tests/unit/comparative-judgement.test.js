import test from 'node:test';
import assert from 'node:assert/strict';
import { cjStudentAction, cjTeacherAction } from '../../netlify/functions/_shared/comparative-judgement.mjs';
import { workOwner } from '../../netlify/functions/_shared/lesson-work.mjs';
import { loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';
import { isPublicStudentApi } from '../../netlify/functions/_shared/public-student-routes.mjs';
import { createPublishedComparativeJudgementHandler } from '../../netlify/functions/published-comparative-judgement.mjs';

function storeFixture(entries = []) {
  const data = new Map(entries.map(([k, v]) => [k, structuredClone(v)]));
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: 'e0' } : null; },
    async setJSON(key, value, options) {
      if (options?.onlyIfNew && data.has(key)) return { modified: false };
      data.set(key, structuredClone(value));
      return { modified: true };
    },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}

// Invented class and synthetic answers about an invented poem, "The Salt Gate".
const NAMES = ['Ada Lane', 'Tom Tills', 'Mia Fern', 'Raj Oakes', 'Zoe Quill', 'Ben Hollow'];
const ANSWERS = {
  'Ada Lane': 'the gate stands for memory; the salt image shows how grief preserves and stings at once, and the final line turns it outward.',
  'Tom Tills': 'the poem is about a gate. it is sad.',
  'Mia Fern': 'the salt suggests tears and the gate a threshold, so the speaker is stuck between staying and leaving.',
  'Raj Oakes': 'the speaker uses imagery of salt to show sadness about the past.',
  'Zoe Quill': 'repetition of the gate creaking builds a rhythm of hesitation that mirrors the speaker refusing to move on.'
};
const QUALITY = { 'Ada Lane': 5, 'Zoe Quill': 4, 'Mia Fern': 3, 'Raj Oakes': 2, 'Tom Tills': 1 };
const ANCHOR_HIGH = 'a model answer: the salt and the gate together hold grief still, and the turn in the last stanza releases it.';
const ANCHOR_LOW = 'there is a gate and some salt in the poem.';

const question = { id: 'qset1', block_type: 'question_set', visibility: 'student_teacher', content: { title: 'The Salt Gate', questions: [{ id: 'q1', kind: 'short_answer', prompt: 'What does the gate stand for?' }] } };
const draftContent = {
  title: 'Which reading is stronger?',
  source: { lesson_id: '', block_id: 'qset1', question_id: 'q1' },
  criterion: 'Which answer is stronger overall?',
  chips: ['Precise quote', 'Clear argument', 'Analyses effect'],
  calibration: [
    { id: 'cal1', left: 'the gate is old.', right: 'the gate marks a choice the speaker keeps putting off.', better: 'right', reason: 'It explains what the image does.' },
    { id: 'cal2', left: 'salt preserves and wounds, so grief is kept fresh.', right: 'salt is mentioned twice.', better: 'left', reason: 'It reads the image, not just spots it.' }
  ],
  anchors: [{ id: 'anc1', text: ANCHOR_HIGH, mark: 16 }, { id: 'anc2', text: ANCHOR_LOW, mark: 6 }, { id: 'anc3', text: '   ', mark: 3 }],
  per_student: 4,
  show_third: true,
  teacher_weight: 2,
  downweight_misfits: true,
  out_of: 20
};
const publishedContent = { ...draftContent, calibration: draftContent.calibration.map(({ id, left, right }) => ({ id, left, right })) };
delete publishedContent.anchors;
delete publishedContent.teacher_weight;
delete publishedContent.downweight_misfits;
delete publishedContent.out_of;
const cjBlock = (content) => ({ id: 'cj1', block_type: 'comparative_judgement', visibility: 'student_teacher', content });

const token = (i) => (i + 1).toString(16).repeat(48).slice(0, 48);

async function setup() {
  const store = storeFixture([
    ['classes/class1', { id: 'class1', type: 'class', status: 'active', title: '11 English', active_unit_ids: ['unit1'], students: NAMES.map((name) => ({ name })) }],
    ['classes/class2', { id: 'class2', type: 'class', status: 'active', title: 'Open class', active_unit_ids: [], students: [] }],
    ['lessons/lesson1', { id: 'lesson1', title: 'Salt Gate', unit_id: 'unit1', blocks: [question, { id: 'sec', block_type: 'section', content: { blocks: [cjBlock(draftContent)] } }] }],
    ['published/lessons/lesson1', { lesson_id: 'lesson1', title: 'Salt Gate', blocks: [question, cjBlock(publishedContent)] }]
  ]);
  const roster = await loadRoster(store, 'class1');
  const students = roster.students.map((s, i) => ({ ...s, device: { class_id: 'class1', class_token: token(i) } }));
  for (const s of students) {
    const answer = ANSWERS[s.name];
    if (!answer) continue;
    if (s.name === 'Mia Fern') {
      // Saved work and a hand-in: the hand-in wins (D2).
      store.data.set(`work/lesson1/${workOwner('class1', s.id)}`, { blocks: { qset1: { answers: { q1: 'an early draft.' } } }, class_id: 'class1', student_id: s.id });
      store.data.set(`work_handins/lesson1/qset1/${s.id}`, { class_id: 'class1', student_id: s.id, text: { answers: { q1: answer } } });
    } else {
      store.data.set(`work/lesson1/${workOwner('class1', s.id)}`, { blocks: { qset1: { answers: { q1: answer } } }, class_id: 'class1', student_id: s.id });
    }
  }
  return { store, students };
}

const student = (store, s, body) => cjStudentAction(store, 'lesson1', 'cj1', { ...s.device, ...body });
const teacher = (store, body) => cjTeacherAction(store, 'lesson1', 'cj1', { class_id: 'class1', ...body });
const qualityOf = (text) => {
  if (text === ANCHOR_HIGH) return 4.5;
  if (text === ANCHOR_LOW) return 0;
  return QUALITY[Object.keys(ANSWERS).find((n) => ANSWERS[n] === text)] ?? 0;
};

test('the student route is public', () => {
  assert.equal(isPublicStudentApi('POST', '/api/published/comparative-judgement/lesson1/cj1'), true);
  assert.equal(isPublicStudentApi('GET', '/api/published/comparative-judgement/lesson1/cj1'), false);
  assert.equal(isPublicStudentApi('POST', '/api/lessons/lesson1/comparative-judgement/cj1'), false);
});

test('a whole round: calibrate, predict, judge, reflect; students only ever see anonymous answers', async () => {
  const { store, students } = await setup();
  const responses = [];
  const ask = async (s, body) => { const out = await student(store, s, body); responses.push(out); return out; };

  // Before anything: initials first, then a closed round.
  assert.deepEqual(await ask(students[0], { action: 'status' }), { need: 'initials' });
  for (const s of students) await ask(s, { action: 'claim', initials: s.initials });
  assert.equal((await ask(students[0], { action: 'status' })).phase, 'closed');
  await assert.rejects(student(store, students[0], { action: 'next' }), /hasn’t opened judging yet/);

  assert.deepEqual(await teacher(store, { action: 'classes' }), { classes: [{ id: 'class1', title: '11 English' }] });
  const started = await teacher(store, { action: 'start' });
  assert.equal(started.round.open, true);
  assert.equal(started.round.pool_size, 7, 'five answers and two anchors; the blank anchor and the student with no answer stay out');
  assert.equal(started.round.anchors, 2);
  await assert.rejects(teacher(store, { action: 'start' }), /already started/);
  const salt = store.data.get('cj/lesson1/cj1/class1/round').salt;

  // Who owns which item, from the teacher's view.
  const before = await teacher(store, { action: 'results' });
  const ownId = Object.fromEntries(before.items.filter((i) => i.kind === 'student').map((i) => [i.name, i.id]));
  assert.equal(before.items.find((i) => i.name === 'Mia Fern').text, ANSWERS['Mia Fern'], 'the hand-in is used over saved work');

  for (const s of students) {
    let state = await ask(s, { action: 'status' });
    assert.equal(state.phase, 'calibrate');
    assert.equal(state.calibration.total, 2);
    await assert.rejects(student(store, s, { action: 'next' }), /practice pairs first/);
    const first = await ask(s, { action: 'calibrate', index: 0, choice: 'left' });
    assert.deepEqual([first.teacher, first.reason], ['right', 'It explains what the image does.']);
    assert.equal(first.calibration.index, 1);
    state = await ask(s, { action: 'calibrate', index: 1, choice: 'left' });
    const hasAnswer = s.name in ANSWERS;
    assert.equal(state.has_answer, hasAnswer);
    if (hasAnswer) {
      assert.equal(state.phase, 'predict');
      await assert.rejects(student(store, s, { action: 'judge', left: 'x', right: 'y', winner: 'x' }), /prediction first/);
      state = await ask(s, { action: 'predict', third: 'top' });
    } else {
      await assert.rejects(student(store, s, { action: 'predict', third: 'top' }), /nothing to predict/);
    }
    assert.equal(state.phase, 'judge');
    assert.equal(state.target, 4);

    const seen = new Set();
    for (let k = 0; k < 8; k += 1) {
      const { pair, done_count: done } = await ask(s, { action: 'next' });
      assert.equal(done, k);
      assert.ok(pair, 'a pair is offered up to twice the target');
      assert.deepEqual(Object.keys(pair.left).sort(), ['id', 'text']);
      assert.ok(pair.left.id !== ownId[s.name] && pair.right.id !== ownId[s.name], 'never your own answer');
      const key = [pair.left.id, pair.right.id].sort().join('|');
      assert.ok(!seen.has(key), 'never the same pair twice');
      seen.add(key);
      const winner = qualityOf(pair.left.text) >= qualityOf(pair.right.text) ? pair.left.id : pair.right.id;
      state = await ask(s, { action: 'judge', left: pair.left.id, right: pair.right.id, winner, chips: { left: [0], right: [1, 2] }, reason: ' Sharper reading. ' });
      if (k === 0) await assert.rejects(student(store, s, { action: 'judge', left: pair.right.id, right: pair.left.id, winner }), /already judged/);
      if (k === 3) assert.equal(state.phase, 'reflect', 'reflect opens at the target');
    }
    assert.equal((await ask(s, { action: 'next' })).pair, null, 'stops at twice the target');
    if (ownId[s.name]) {
      await assert.rejects(student(store, s, { action: 'judge', left: ownId[s.name], right: before.items.find((i) => i.id !== ownId[s.name]).id, winner: ownId[s.name] }), /changed|judged all/);
    }
    state = await ask(s, { action: 'reflect', text: 'I would explain what the salt does, not just name it.' });
    assert.equal(state.phase, 'done');
    if (state.third !== undefined) assert.ok(['top', 'middle', 'bottom'].includes(state.third));
  }

  // Bad judgements are refused.
  const { store: other, students: fresh } = await setup();
  await student(other, fresh[0], { action: 'claim', initials: fresh[0].initials });
  await teacher(other, { action: 'start' });
  await student(other, fresh[0], { action: 'calibrate', index: 0, choice: 'right' });
  await student(other, fresh[0], { action: 'calibrate', index: 1, choice: 'left' });
  await student(other, fresh[0], { action: 'predict', third: 'middle' });
  const { pair } = await student(other, fresh[0], { action: 'next' });
  const good = { action: 'judge', left: pair.left.id, right: pair.right.id, winner: pair.left.id };
  await assert.rejects(student(other, fresh[0], { ...good, winner: 'aaaaaaaaaaaaa' }), /Pick one/);
  await assert.rejects(student(other, fresh[0], { ...good, chips: { left: [3] } }), /labels have changed/);
  await assert.rejects(student(other, fresh[0], { ...good, reason: 'x'.repeat(301) }), /300 characters/);
  await assert.rejects(student(other, fresh[0], { ...good, left: 'anotherid000' }), /changed/);
  await assert.rejects(student(other, fresh[0], { action: 'reflect', text: 'too soon' }), /Judge your pairs first/);

  // ANONYMISATION (D4): no names, other students' initials, ids, anchor flags, marks or salt.
  const dump = JSON.stringify(responses);
  for (const s of students) {
    assert.ok(!dump.includes(s.name), `name ${s.name}`);
    assert.ok(!dump.includes(s.id), `id ${s.id}`);
  }
  for (const out of responses) {
    const json = JSON.stringify(out);
    const own = students.find((s) => out.initials === s.initials);
    for (const s of students) if (s !== own) assert.ok(!json.includes(`"${s.initials}"`), `initials ${s.initials}`);
  }
  assert.ok(!/anchor/i.test(dump));
  assert.ok(!/"(mark|marks|rank|theta|kind|name|student_id|ref)"/.test(dump));
  assert.ok(!dump.includes('"16"') && !dump.includes(':16'));
  assert.ok(!dump.includes(salt));

  // Teacher: progress, results with names, anchors labelled, marks mapped.
  const status = await teacher(store, { action: 'status' });
  const ada = status.progress.find((p) => p.name === 'Ada Lane');
  assert.deepEqual({ ...ada, student_id: undefined, initials: undefined }, { student_id: undefined, name: 'Ada Lane', initials: undefined, has_answer: true, judged: 8, target: 4, calibrated: true, predicted: true, reflected: true });
  assert.equal(status.progress.find((p) => p.name === 'Ben Hollow').has_answer, false);

  await teacher(store, { action: 'next' }).then(async ({ pair: tp }) => {
    assert.ok(tp);
    const out = await teacher(store, { action: 'judge', left: tp.left.id, right: tp.right.id, winner: qualityOf(tp.left.text) >= qualityOf(tp.right.text) ? tp.left.id : tp.right.id });
    assert.equal(out.done_count, 1);
  });

  const results = await teacher(store, { action: 'results' });
  assert.equal(results.items.length, 7);
  assert.deepEqual(results.items.map((i) => i.rank), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(results.items.filter((i) => i.kind === 'anchor').length, 2);
  assert.equal(results.items.find((i) => i.text === ANCHOR_HIGH).anchor_mark, 16);
  const studentsRanked = results.items.filter((i) => i.kind === 'student').map((i) => i.name);
  assert.equal(studentsRanked[0], 'Ada Lane');
  assert.equal(studentsRanked.at(-1), 'Tom Tills');
  assert.ok(['keep', 'feedback', 'marks'].includes(results.reliability.level));
  assert.ok(results.reliability.split_half !== null, 'six judges: split-half is reported');
  assert.ok(results.judges.some((j) => j.key === 'teacher' && j.weight === 2 && j.name === 'Teacher'));
  assert.equal(results.chips[0].label, 'Precise quote');
  assert.equal(results.exemplars.length, 3);
  assert.equal(results.predictions.length, 5);
  assert.equal(results.predictions.find((p) => p.name === 'Ada Lane').actual, 'top');
  assert.equal(results.reflections.length, 6);
  assert.ok(results.contested);
  assert.ok(results.marks && results.marks.out_of === 20);
  assert.ok(results.marks.by_student[students.find((s) => s.name === 'Ada Lane').id] > results.marks.by_student[students.find((s) => s.name === 'Tom Tills').id]);
  for (const mark of Object.values(results.marks.by_student)) assert.ok(mark >= 0 && mark <= 20 && Number.isInteger(mark * 2));

  // Display: no names.
  const display = await teacher(store, { action: 'display' });
  assert.deepEqual(Object.keys(display).sort(), ['contested', 'exemplars']);
  const shown = JSON.stringify(display);
  for (const s of students) assert.ok(!shown.includes(s.name) && !shown.includes(s.id));
  assert.ok(!/anchor|"name"|"kind"|"rank"/.test(shown));

  // Push to Markbook.
  const pushed = await teacher(store, { action: 'push_marks', title: 'Salt Gate judging' });
  assert.equal(pushed.count, 5);
  const book = store.data.get('markbook/class1');
  const column = book.columns.find((c) => c.id === pushed.column_id);
  assert.equal(column.title, 'Salt Gate judging');
  assert.equal(column.weight, 0);
  assert.deepEqual(column.criteria.map((c) => [c.label, c.max]), [['Overall', 20]]);
  const adaId = students.find((s) => s.name === 'Ada Lane').id;
  assert.equal(book.marks[pushed.column_id][adaId].criteria[column.criteria[0].id], results.marks.by_student[adaId]);
  assert.ok(!(students.find((s) => s.name === 'Ben Hollow').id in book.marks[pushed.column_id]));

  // Close: students can't judge; reopen works.
  await teacher(store, { action: 'close' });
  assert.equal((await student(store, students[0], { action: 'status' })).phase, 'closed');
  await assert.rejects(student(store, students[0], { action: 'next' }), /closed/);
  assert.equal((await teacher(store, { action: 'open' })).round.open, true);
});

test('refresh adds late answers and keeps everyone’s id', async () => {
  const { store, students } = await setup();
  await teacher(store, { action: 'start' });
  const before = (await teacher(store, { action: 'results' })).items.map((i) => [i.id, i.text]);
  const late = students.find((s) => s.name === 'Ben Hollow');
  store.data.set(`work/lesson1/${workOwner('class1', late.id)}`, { blocks: { qset1: { answers: { q1: 'the gate is a border between two lives.' } } }, class_id: 'class1', student_id: late.id });
  // An existing answer edited after the snapshot keeps its snapshot text.
  const tom = students.find((s) => s.name === 'Tom Tills');
  store.data.set(`work/lesson1/${workOwner('class1', tom.id)}`, { blocks: { qset1: { answers: { q1: 'changed later.' } } }, class_id: 'class1', student_id: tom.id });
  const refreshed = await teacher(store, { action: 'refresh' });
  assert.equal(refreshed.round.pool_size, 8);
  const after = new Map((await teacher(store, { action: 'results' })).items.map((i) => [i.id, i.text]));
  for (const [id, text] of before) assert.equal(after.get(id), text);
});

test('no marks mapping without two marked anchors', async () => {
  const { store } = await setup();
  const draft = store.data.get('lessons/lesson1');
  draft.blocks[1].content.blocks[0].content.anchors = [{ id: 'anc1', text: ANCHOR_HIGH, mark: 16 }];
  store.data.set('lessons/lesson1', draft);
  await teacher(store, { action: 'start' });
  assert.equal((await teacher(store, { action: 'results' })).marks, null);
  await assert.rejects(teacher(store, { action: 'push_marks', title: 'x' }), /two anchors/);
});

test('a class with no list can’t take part', async () => {
  const { store } = await setup();
  const device = { class_id: 'class2', class_token: token(9) };
  assert.deepEqual(await cjStudentAction(store, 'lesson1', 'cj1', { ...device, action: 'status' }), { need: null, anonymous: true });
  await assert.rejects(cjStudentAction(store, 'lesson1', 'cj1', { ...device, action: 'next' }), /class list/);
  await assert.rejects(cjStudentAction(store, 'lesson1', 'cj1', { ...device, action: 'judge' }), /class list/);
  await assert.rejects(cjTeacherAction(store, 'lesson1', 'cj1', { class_id: 'class2', action: 'start' }), /class list/);
});

test('the block must be live in the draft and the published lesson', async () => {
  const { store, students } = await setup();
  store.data.set('published/lessons/lesson1', { blocks: [question] });
  await assert.rejects(student(store, students[0], { action: 'status' }), /Publish/);
  await assert.rejects(teacher(store, { action: 'status' }), /Publish/);
});

test('public entry answers status and refuses bad origins and oversize bodies', async () => {
  const { store } = await setup();
  const origin = 'https://life-hub.adam-russell.com';
  const handler = createPublishedComparativeJudgementHandler({ getContentStore: async () => store, env: { SITE_ORIGIN: origin } });
  const request = (body, from = origin) => new Request('https://api.example/api/published/comparative-judgement/lesson1/cj1', { method: 'POST', headers: { origin: from }, body });
  const response = await handler(request(JSON.stringify({ class_id: 'class1', class_token: token(0), action: 'status' })));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, { need: 'initials' });
  assert.equal((await handler(request('{}', 'https://evil.example'))).status, 403);
  assert.equal((await handler(request('x'.repeat(16001)))).status, 413);
});
