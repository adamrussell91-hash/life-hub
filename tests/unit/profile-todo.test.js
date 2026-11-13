import test from 'node:test';
import assert from 'node:assert/strict';
import { claimInitials, loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';
import { profileAction, teacherProfileAction } from '../../netlify/functions/_shared/profile.mjs';
import { piecesAction } from '../../netlify/functions/_shared/piece-feedback.mjs';
import { workOwner } from '../../netlify/functions/_shared/lesson-work.mjs';
import { activitiesOf, anchorOf, announcementsFrom, boxesFor, countdownsFrom, dayPhrase, plainText } from '../../netlify/functions/_shared/profile-todo.mjs';

function storeFixture(entries = []) {
  const data = new Map(entries.map(([k, v]) => [k, structuredClone(v)]));
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: 'e' } : null; },
    async setJSON(key, value, options) {
      if (options?.onlyIfNew && data.has(key)) return { modified: false };
      data.set(key, structuredClone(value)); return { modified: true };
    },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}

const DEVICE = 'a'.repeat(48);
const feedback = (todo) => todo.boxes.flatMap((b) => b.items.filter((i) => i.kind === 'feedback').map((i) => ({ box: b.key, ...i })));
const OTHER = 'b'.repeat(48);
const NOW = new Date('2026-11-09T01:00:00Z'); // Monday 9 Nov, midday in Sydney
const qset = (id, title, qs, extra = {}) => ({ id, type: 'block', block_type: 'question_set', visibility: 'student_teacher', content: { title, questions: qs.map((q) => ({ id: q, prompt: `Prompt ${q}` })) }, ...extra });
const countdown = (id, due_date, extra = {}) => ({ id, type: 'block', block_type: 'countdown', visibility: 'student_teacher', content: { title: '', due_date, due_time: '15:00', set_date: '2026-11-01', note: '', ...extra } });
const column = { id: 'column001', kind: 'assessment', title: 'Ghost poem draft', date: '2026-11-05', weight: 0, criteria: [{ id: 'crit0001', label: 'Craft', max: 10, outcomes: ['out_a'], concepts: [] }], piece: { lesson_id: 'l1', block_id: 'q1' } };

function lessonEntries(id, title, blocks, extra = {}) {
  return [[`lessons/${id}`, { id, title, ...extra }], [`published/lessons/${id}`, { id, title, blocks }]];
}

async function setup({ announcements = [], columns = [] } = {}) {
  const store = storeFixture([
    ['classes/class1', { id: 'class1', type: 'class', status: 'active', title: '9 English', current_unit_id: 'unit1', students: [{ name: 'Ana Ames' }, { name: 'Ben Bolt' }], homepage: { announcements, resources: [], custom: [] } }],
    ['units/unit1', { id: 'unit1', title: 'Poetry', lesson_ids: ['l1', 'l2', 'l3', 'l4'] }],
    ['markbook/class1', { columns, marks: {}, hidden_quizzes: [], focus: {}, took: {}, groups: [], history: [] }],
    ['feedback_codes/library', { codes: [{ id: 'ts', code: 'TS', label: 'Topic sentence', group: 'composition', criterion: 1, colour: 'peach', descriptor: 'Open with the claim.' }] }],
    ...lessonEntries('l1', 'Ghost poem', [qset('q1', 'Draft', ['a'])]),
    ...lessonEntries('l2', 'Speaker and voice', [qset('q2', 'Warm-up', ['a', 'b']), qset('q3', '', ['a']), { id: 'sec', type: 'block', block_type: 'section', visibility: 'teacher_only', content: { blocks: [qset('q9', 'Teacher copy', ['a'])] } }]),
    ...lessonEntries('l3', 'Sound and rhythm', []),
    ...lessonEntries('l4', 'Poem task', [countdown('cd1', '2026-11-21')], { pedagogical_mode: 'assessment' })
  ]);
  const roster = await loadRoster(store, 'class1');
  const [ana, ben] = roster.students;
  await claimInitials(store, roster, DEVICE, ana.initials);
  await claimInitials(store, roster, OTHER, ben.initials);
  const write = (lesson, student, blocks) => store.data.set(`work/${lesson}/${workOwner('class1', student.id)}`, { blocks, at: '2026-11-08T00:00:00Z', class_id: 'class1', student_id: student.id });
  const progress = (device = DEVICE, now = NOW) => profileAction(store, 'class1', { action: 'progress', class_token: device }, { now });
  return { store, ana, ben, write, progress };
}

test('plainText strips tags, decodes entities and collapses spaces', () => {
  assert.equal(plainText('<p>Bring a <b>printed</b> draft&nbsp;on Thursday.</p><p>Library &amp; quiet room open.</p>'), 'Bring a printed draft on Thursday. Library & quiet room open.');
  assert.equal(plainText(null), '');
});

test('announcements: text blocks only, teacher-only ones left out, newest first, clipped', () => {
  const out = announcementsFrom({ homepage: { announcements: [
    { id: 'a1', block_type: 'rich_text', visibility: 'student_teacher', content: { html: '<p>Older note</p>' }, created_at: '2026-11-02T00:00:00Z' },
    { id: 'a2', block_type: 'callout', visibility: 'student_teacher', content: { title: 'Thursday', body: 'Bring your draft.' }, created_at: '2026-11-08T00:00:00Z' },
    { id: 'a3', block_type: 'rich_text', visibility: 'teacher_only', content: { html: '<p>Private</p>' }, created_at: '2026-11-09T00:00:00Z' },
    { id: 'a4', block_type: 'image', visibility: 'student_teacher', content: { url: 'x' } },
    { id: 'a5', block_type: 'rich_text', visibility: 'student_teacher', content: { html: `<p>${'x'.repeat(400)}</p>` } }
  ] } });
  assert.deepEqual(out.map((a) => a.id), ['a2', 'a1', 'a5']);
  assert.equal(out[0].text, 'Thursday: Bring your draft.');
  assert.ok(out[2].text.length <= 280 && out[2].text.endsWith('…'));
});

test('countdowns: every one still due, soonest first, so two at once stack; past and teacher-only ones are skipped', () => {
  const lessons = [{ id: 'x', title: 'Sprint step 2' }, { id: 'y', title: 'Poem task', pedagogical_mode: 'assessment' }];
  const published = new Map([
    ['x', { blocks: [countdown('c1', '2026-11-01'), { ...countdown('c2', '2026-11-12'), visibility: 'teacher_only' }, countdown('c5', '2026-11-13')] }],
    ['y', { blocks: [countdown('c4', '2026-11-20', { title: 'Your own poem' })] }]
  ]);
  assert.deepEqual(countdownsFrom(lessons, published, '2026-11-09'), [
    { title: 'Sprint step 2', lesson_id: 'x', assessment: false, due_date: '2026-11-13', due_time: '15:00', set_date: '2026-11-01', published: true },
    { title: 'Your own poem', lesson_id: 'y', assessment: true, due_date: '2026-11-20', due_time: '15:00', set_date: '2026-11-01', published: true }
  ]);
  assert.deepEqual(countdownsFrom(lessons, published, '2026-12-01'), []);
});

test('countdowns: a planned assessment counts from its calendar day; a countdown block on the same lesson wins', () => {
  const lessons = [{ id: 'y', title: 'Poem task', pedagogical_mode: 'assessment' }];
  const published = new Map([['y', { blocks: [countdown('c4', '2026-11-20')] }]]);
  const planned = [
    { lesson_id: 'z', title: 'Viva task', published: false, date: '2026-11-24', start_time: '13:24' },
    { lesson_id: 'z', title: 'Viva task', published: false, date: '2026-11-30', start_time: '09:00' },
    { lesson_id: 'old', title: 'Last term', published: false, date: '2026-11-01', start_time: '' },
    { lesson_id: 'y', title: 'Poem task', published: true, date: '2026-11-18', start_time: '10:00' }
  ];
  assert.deepEqual(countdownsFrom(lessons, published, '2026-11-09', planned).map((c) => [c.lesson_id, c.due_date, c.due_time, c.assessment, c.published]), [
    ['y', '2026-11-20', '15:00', true, true],
    ['z', '2026-11-24', '13:24', true, false]
  ]);
  const sprints = new Map([['s', { blocks: ['a', 'b', 'c'].map((n, i) => countdown(n, `2026-11-1${i}`)) }]]);
  const kept = countdownsFrom([{ id: 's', title: 'Sprint' }], sprints, '2026-11-09', planned.slice(0, 1));
  assert.equal(kept.length, 3);
  assert.equal(kept.at(-1).lesson_id, 'z', 'the soonest assessment stays when sprint steps fill the list');
});

test('an unpublished assessment on the class calendar shows as a countdown, and nothing else of it goes out', async () => {
  const { store, progress } = await setup();
  store.data.set('units/unit1', { id: 'unit1', title: 'Poetry', lesson_ids: ['l1', 'l2', 'l3', 'l4', 'l5'] });
  store.data.set('lessons/l5', { id: 'l5', title: 'Viva task', pedagogical_mode: 'assessment', blocks: [{ id: 'secret', block_type: 'rich_text', content: { html: 'DRAFT QUESTIONS' } }] });
  store.data.set('scheduled_lessons/s1', { id: 's1', class_id: 'class1', lesson_id: 'l5', date: '2026-11-24', start_time: '13:24' });
  store.data.set('scheduled_lessons/s2', { id: 's2', class_id: 'other', lesson_id: 'l5', date: '2026-11-12', start_time: '09:00' });
  store.data.set('scheduled_lessons/s3', { id: 's3', class_id: 'class1', lesson_id: 'l5', date: '2026-11-13', start_time: '09:00', delivery_status: 'skipped' });
  const out = await progress();
  assert.deepEqual(out.todo.countdowns.find((c) => c.lesson_id === 'l5'), { title: 'Viva task', lesson_id: 'l5', assessment: true, due_date: '2026-11-24', due_time: '13:24', set_date: '', published: false });
  assert.ok(!JSON.stringify(out).includes('DRAFT QUESTIONS'));
  assert.ok(!out.map.lessons.some((l) => l.id === 'l5'), 'the unpublished lesson stays off the map');
});

test('activities: every question answered, or anything written in a format or lens, counts as done', () => {
  const lesson = { blocks: [qset('q1', 'Warm-up', ['a', 'b']), qset('q2', '', ['a']), qset('q3', 'Chart', ['a'])] };
  const out = activitiesOf(lesson, { q1: { answers: { a: 'yes', b: ' ' } }, q3: { 'format.reasoning_chart': { c: 'x' } } });
  assert.deepEqual(out, [{ id: 'q1', title: 'Warm-up', done: false }, { id: 'q2', title: 'Questions (1)', done: false }, { id: 'q3', title: 'Chart', done: true }]);
});

test('progress carries the student’s own To do: started lessons, what is left, countdown and announcements', async () => {
  const { write, ana, ben, progress } = await setup({ announcements: [{ id: 'n1', block_type: 'rich_text', visibility: 'student_teacher', content: { html: '<p>Bring your draft.</p>' }, created_at: '2026-11-09T00:00:00Z' }] });
  write('l2', ana, { q2: { answers: { a: 'one', b: 'two' } } });
  write('l3', ben, { x: { answers: { a: 'Ben only' } } });
  const { todo } = await progress();
  assert.deepEqual(todo.boxes.map((b) => b.key), ['now'], 'every lesson sits before or at the assessment');
  const [started, ...rest] = todo.boxes[0].items;
  assert.deepEqual(started, { id: 'l2', title: 'Speaker and voice', kind: 'lesson', role: 'core', done: false, reason: 'Pick up where you left off', started: { activities: [{ id: 'q2', title: 'Warm-up', done: true }, { id: 'q3', title: 'Questions (1)', done: false }] } });
  assert.deepEqual(rest.map((t) => [t.id, t.kind, t.done, t.reason]), [
    ['l1', 'lesson', false, 'Before the Poem task on 21 Nov'],
    ['l3', 'lesson', false, 'Before the Poem task on 21 Nov'],
    ['l4', 'assessment', false, 'Due on 21 Nov']
  ], 'Ben’s writing does not start l3 for Ana');
  assert.deepEqual(todo.countdowns.map((c) => [c.lesson_id, c.assessment]), [['l4', true]]);
  assert.equal(todo.practice, null, 'no organiser released, so no Today row');
  assert.deepEqual(todo.announcements.map((a) => a.text), ['Bring your draft.']);
  assert.deepEqual([todo.waiting, todo.more], [[], 0]);
  assert.ok(!('back' in todo) && !('started' in todo) && !('todo' in todo), 'the old groups are gone');
  assert.ok(!JSON.stringify(todo).includes('Teacher copy'), 'teacher-only blocks never count as activities');
});

test('a lesson done today stays ticked until the day ends, then drops off', async () => {
  const { store, progress } = await setup();
  await profileAction(store, 'class1', { action: 'done', class_token: DEVICE, lesson_id: 'l1' });
  const today = (await progress(DEVICE, new Date())).todo;
  const ticked = today.boxes.flatMap((b) => b.items).find((t) => t.id === 'l1');
  assert.deepEqual([ticked.title, ticked.kind, ticked.done], ['Ghost poem', 'lesson', true]);
  const tomorrow = (await progress(DEVICE, new Date(Date.now() + 86_400_000))).todo;
  assert.ok(!tomorrow.boxes.flatMap((b) => b.items).some((t) => t.id === 'l1'));
});

test('a handed-in piece waits with the teacher, then comes back new, or as a redraft', async () => {
  const { store, ana, progress } = await setup({ columns: [column] });
  store.data.set(`work_handins/l1/q1/${ana.id}`, { class_id: 'class1', student_id: ana.id, text: { answers: { a: 'My poem' } }, handed_in_at: '2026-11-06T00:00:00Z' });
  let { todo } = await progress();
  assert.deepEqual(todo.waiting, [{ title: 'Ghost poem draft', lesson_id: 'l1', at: '2026-11-06T00:00:00Z' }]);
  assert.deepEqual(feedback(todo), []);

  const teacher = (action, extra = {}) => piecesAction(store, 'class1', { action, column_id: 'column001', student_id: ana.id, ...extra });
  await teacher('save', { tags: [{ code_id: 'ts', positive: false, part: 'answers', field: 'a', start: 0, end: 2 }], comment: 'Good start.' });
  await teacher('return');
  ({ todo } = await progress());
  assert.deepEqual(todo.waiting, []);
  assert.deepEqual(feedback(todo).map((b) => [b.box, b.id, b.feedback.state, b.done]), [['now', 'w:l1:q1', 'new', false]], 'new feedback moves into Do now');

  await profileAction(store, 'class1', { action: 'seen', class_token: DEVICE, item: 'w:l1:q1' });
  ({ todo } = await progress(DEVICE, new Date()));
  assert.deepEqual(feedback(todo).map((b) => [b.feedback.state, b.done]), [['read', true]], 'opened today: ticked for the rest of the day');
  ({ todo } = await progress(DEVICE, new Date(Date.now() + 86_400_000)));
  assert.deepEqual(feedback(todo), [], 'and gone the next day');
});

test('a redraft the teacher asks for shows as Have another go', async () => {
  const { store, ana, progress } = await setup({ columns: [column] });
  store.data.set(`work_handins/l1/q1/${ana.id}`, { class_id: 'class1', student_id: ana.id, text: { answers: { a: 'My poem' } }, handed_in_at: '2026-11-06T00:00:00Z' });
  const teacher = (action, extra = {}) => piecesAction(store, 'class1', { action, column_id: 'column001', student_id: ana.id, ...extra });
  await teacher('save', { tags: [], comment: 'Try again.' });
  await teacher('return', { redraft: { scope: 'whole' } });
  const { todo } = await progress();
  assert.deepEqual(feedback(todo).map((b) => [b.box, b.feedback.state, b.reason]), [['now', 'redraft', 'Your teacher asked for another go']]);
  assert.deepEqual(todo.waiting, []);
});

test('the teacher’s read of a student’s page carries the same To do', async () => {
  const { store, ana, write, progress } = await setup();
  write('l2', ana, { q2: { answers: { a: 'one', b: 'two' } } });
  const out = await teacherProfileAction(store, 'class1', { action: 'progress', student_id: ana.id }, { now: NOW });
  assert.equal(out.name, 'Ana Ames');
  assert.deepEqual(out.todo, (await progress()).todo);
});

const row = (id, role = 'core', kind = 'lesson', done = false) => ({ id, title: `Lesson ${id}`, role, kind, done });
const keys = (out) => out.boxes.map((b) => [b.key, b.items.map((i) => i.id)]);

test('dayPhrase: today, tomorrow, a weekday within the week, else a date', () => {
  assert.equal(dayPhrase('2026-11-09', '2026-11-09'), 'today');
  assert.equal(dayPhrase('2026-11-10', '2026-11-09'), 'tomorrow');
  assert.equal(dayPhrase('2026-11-13', '2026-11-09'), 'on Fri');
  assert.equal(dayPhrase('2026-11-20', '2026-11-09'), 'on 20 Nov');
});

test('boxes: core before the next assessment is Do now, the rest Do next; optional is Extra practice, extension Challenge', () => {
  const lessons = ['a', 'b', 'test', 'c', 'opt', 'ext'].map((id) => ({ id }));
  const rows = [row('a'), row('b', 'core', 'quiz'), row('test', 'core', 'assessment'), row('c'), row('opt', 'optional'), row('ext', 'extension')];
  const out = boxesFor({ unit: { lesson_ids: lessons.map((l) => l.id) }, lessons, rows, countdowns: [{ title: 'Sprint step', lesson_id: 'a', assessment: false, due_date: '2026-11-10' }, { title: 'Monthly Review', lesson_id: 'test', assessment: true, due_date: '2026-11-13' }], today: '2026-11-09' });
  assert.deepEqual(keys(out), [['now', ['a', 'b', 'test']], ['next', ['c']], ['extra', ['opt']], ['challenge', ['ext']]]);
  assert.equal(out.boxes[0].items[0].reason, 'Before the Monthly Review on Fri');
  assert.equal(out.boxes[0].items[2].reason, 'Due on Fri');
  assert.deepEqual([out.boxes[1].items[0].reason, out.boxes[2].items[0].reason, out.boxes[3].items[0].reason], ['Next in the unit', 'Optional', 'Challenge lesson']);
  const none = boxesFor({ lessons, rows: [row('a', 'core', 'lesson', true), ...rows.slice(1)], doneToday: new Set(['a']), today: '2026-11-09' });
  assert.deepEqual(keys(none), [['now', ['a', 'b']], ['next', ['test', 'c']], ['extra', ['opt']], ['challenge', ['ext']]], 'no assessment due: the first core lesson not done is Do now');
  assert.deepEqual(none.boxes[0].items.map((i) => [i.done, i.reason]).slice(1), [[false, 'Next in the unit']]);
  assert.deepEqual(none.boxes[1].items.map((i) => i.reason), ['Later in the unit', 'Later in the unit']);
});

test('boxes: a support lesson waits in Do next until the lesson it branches from is done', () => {
  const unit = { lesson_ids: ['a', 'b', 'sup', 'pick'], blocks: [{ block_type: 'curriculum_lines', content: { version: 2, rail_stops: [{ lesson_id: 'pick', kind: 'support', after_lesson_id: 'a' }] } }] };
  const lessons = [{ id: 'a' }, { id: 'b' }, { id: 'sup', route_role: 'support' }, { id: 'pick', route_role: 'support' }];
  assert.equal(anchorOf(unit, lessons, lessons[2]), 'b', 'no pick: the core lesson before it');
  assert.equal(anchorOf(unit, lessons, lessons[3]), 'a', 'the side stop on the unit map');
  assert.equal(anchorOf(unit, lessons, { ...lessons[2], branch_from: 'a' }), 'a', 'branch_from wins');
  const waiting = boxesFor({ unit, lessons, rows: [row('a'), row('b'), row('sup', 'support'), row('pick', 'support')], today: '2026-11-09' });
  assert.deepEqual(keys(waiting), [['now', ['a']], ['next', ['b', 'sup', 'pick']]]);
  assert.deepEqual(waiting.boxes[1].items.slice(1).map((i) => i.reason), ['After Lesson b', 'After Lesson a']);
  const ready = boxesFor({ unit, lessons, rows: [row('a', 'core', 'lesson', true), row('b'), row('sup', 'support'), row('pick', 'support')], today: '2026-11-09' });
  assert.deepEqual(keys(ready), [['now', ['b', 'pick']], ['next', ['sup']]]);
  assert.equal(ready.boxes[0].items[1].reason, 'Your teacher picked this for you');
});

test('boxes: started lessons first, then redrafts and feedback, in Do now; a started optional stays in Extra practice', () => {
  const lessons = ['a', 'b', 'test', 'opt'].map((id) => ({ id }));
  const rows = [row('a'), row('b'), row('test', 'core', 'assessment'), row('opt', 'optional')];
  const started = new Map([['b', [{ id: 'q', title: 'Warm-up', done: true }]], ['opt', []]]);
  const back = [{ id: 'w:new', kind: 'written', title: 'Essay', date: '2026-11-05', state: 'new' }, { id: 'w:re', kind: 'answer', title: 'Hinge', date: '2026-11-04', state: 'redraft' }];
  const out = boxesFor({ unit: { lesson_ids: lessons.map((l) => l.id) }, lessons, rows, started, back, countdowns: [{ title: 'Task', lesson_id: 'test', assessment: true, due_date: '2026-11-20' }], today: '2026-11-09' });
  assert.deepEqual(keys(out), [['now', ['b', 'w:re', 'w:new', 'a', 'test']], ['extra', ['opt']]]);
  assert.deepEqual(out.boxes[0].items[0].started, { activities: [{ id: 'q', title: 'Warm-up', done: true }] });
  assert.deepEqual(out.boxes[0].items[1].feedback, { state: 'redraft', kind: 'answer', date: '2026-11-04' });
  assert.ok(out.boxes[1].items[0].started, 'started optional keeps its activities');
});

test('boxes: done-today rows stay and do not use a slot; the overflow past the box limit counts in more', () => {
  const ids = Array.from({ length: 16 }, (_, i) => `c${i}`);
  const lessons = ids.map((id) => ({ id }));
  const rows = ids.map((id, i) => row(id, 'core', 'lesson', i < 2));
  const out = boxesFor({ lessons, rows, doneToday: new Set(['c0']), today: '2026-11-09' });
  assert.deepEqual(out.boxes[0].items.map((i) => i.id), ['c0', 'c2'], 'no assessment: c2 is next, Do now');
  const items = out.boxes[1].items;
  assert.equal(out.boxes[0].items[0].done, true);
  assert.ok(!out.boxes.flatMap((b) => b.items).some((i) => i.id === 'c1'), 'done before today: gone');
  assert.equal(items.filter((i) => !i.done).length, 12, 'Do next keeps twelve of c3..c15');
  assert.equal(out.more, 1);
});

test('the practice Viva links come only while an assessment counts down, by lesson title', async () => {
  const { vivaPracticeFrom } = await import('../../netlify/functions/_shared/profile-todo.mjs');
  const lessons = [{ id: 'a', title: 'Viva Voce Practice 1' }, { id: 'b', title: ' viva voce practice 2 ' }, { id: 'c', title: 'Viva Voce Practice 3' }, { id: 'd', title: 'Ghost poem' }];
  const due = [{ assessment: true }];
  assert.deepEqual(vivaPracticeFrom(lessons, due), { prepared: { lesson_id: 'a', title: 'Viva Voce Practice 1' }, spontaneous: { lesson_id: 'b', title: 'viva voce practice 2' } });
  assert.equal(vivaPracticeFrom(lessons, [{ assessment: false }]), null);
  assert.equal(vivaPracticeFrom([{ id: 'd', title: 'Ghost poem' }], due), null);
  assert.deepEqual(vivaPracticeFrom([lessons[1]], due), { spontaneous: { lesson_id: 'b', title: 'viva voce practice 2' } });
});
