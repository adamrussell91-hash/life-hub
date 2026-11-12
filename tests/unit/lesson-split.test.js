import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createLessonSplitHandler } from '../../netlify/functions/lesson-split.mjs';
import { BLOCK_DATA, MESSAGES, splitProblems } from '../../netlify/functions/_shared/lesson-split.mjs';
import { draftLessonKey, publishedLessonKey, unitKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';
import { deleteVoiceSubmission } from '../../netlify/functions/_shared/voice-submissions.mjs';

const ORIGIN = 'https://life-hub.adam-russell.com';
const SECRET = 'x'.repeat(32);
const ENV = { SITE_ORIGIN: ORIGIN, SESSION_SECRET: SECRET, LIFE_HUB_PASSPHRASE_HASH: 'configured' };

function storeFixture(entries = []) {
  const data = new Map(entries.map(([k, v]) => [k, structuredClone(v)]));
  const etags = new Map();
  let n = 0;
  const bump = (key) => etags.set(key, `e${++n}`);
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: etags.get(key) ?? 'e0' } : null; },
    async setJSON(key, value, options) {
      if (options?.onlyIfNew && data.has(key)) return { modified: false };
      if (options?.onlyIfMatch && (etags.get(key) ?? 'e0') !== options.onlyIfMatch) return { modified: false };
      data.set(key, structuredClone(value)); bump(key); return { modified: true };
    },
    async set(key, value) { data.set(key, typeof value === 'string' ? JSON.parse(value) : value); bump(key); },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}

const stamp = { created_at: '2026-11-01T00:00:00.000Z', updated_at: '2026-11-01T00:00:00.000Z', schema_version: 1 };
const block = (id, block_type, content) => ({ id, type: 'block', block_type, variant: 'medium', visibility: 'student_teacher', content, layout: {}, print: {}, ...stamp });
const heading = (id, text) => block(id, 'heading', { text });
const section = (id, title, blocks) => block(id, 'section', { title, blocks });
const quizQ = (id) => block(id, 'quiz_question', { question: { id, kind: 'short_answer', prompt: 'Name the river.', marks: 1, accepted: ['Murray'] } });

/** An invented lesson: warm-up stays; "Writing" and "Check" move. */
function lessonBlocks() {
  return [
    section('s_warm', 'Warm-up', [heading('h_warm', 'Rivers'), heading('b_why_stay', 'Why')]),
    section('s_write', 'Writing', [heading('b_task', 'Explain the delta'), block('b_voice', 'voice', { prompt: 'Say it aloud', mode: 'practice' }), heading('b_hinge', 'Hinge'), block('b_cj', 'comparative_judgement', { source: { lesson_id: '', block_id: 'b_why_stay', question_id: 'q1' } })]),
    section('s_check', 'Check', [quizQ('qq1'), quizQ('qq2')])
  ];
}

const CLASS = 'class_a';
const UNIT = 'unit_rivers';
const L = 'lesson_rivers';

function fixture({ published = true } = {}) {
  const lesson = { id: L, type: 'lesson', title: 'Rivers', unit_id: UNIT, sequence: 2, status: 'active', pedagogical_mode: 'direct', blocks: lessonBlocks(), dot_points: ['geo:U1'], focus_pieces: ['kp_aa11bb'], tags: ['rivers'], feedback_off: true, ...stamp };
  const entries = [
    [draftLessonKey(L), lesson],
    [draftLessonKey('lesson_before'), { id: 'lesson_before', type: 'lesson', title: 'Before', unit_id: UNIT, sequence: 1, blocks: [], status: 'active', ...stamp }],
    [draftLessonKey('lesson_after'), { id: 'lesson_after', type: 'lesson', title: 'After', unit_id: UNIT, sequence: 3, blocks: [], status: 'active', ...stamp }],
    [unitKey(UNIT), { id: UNIT, type: 'unit', title: 'Rivers unit', lesson_ids: ['lesson_before', L, 'lesson_after'], ...stamp }],
    [`classes/${CLASS}`, { id: CLASS, title: 'Class A', status: 'active', current_unit_id: UNIT, students: [{ id: 'st_pat', name: 'Pat Example' }, { id: 'st_sam', name: 'Sam Sample' }] }],
    // Written work: Pat has moved and staying entries; Sam only staying ones.
    [`work/${L}/owner_pat`, { class_id: CLASS, student_id: 'st_pat', at: 'x', blocks: { b_task: { answers: { a: 'The delta forms…' } }, h_warm: { answers: { a: 'warm' } } } }],
    [`work/${L}/owner_sam`, { class_id: CLASS, student_id: 'st_sam', at: 'x', blocks: { h_warm: { answers: { a: 'only warm' } } } }],
    [`work_handins/${L}/b_task/st_pat`, { class_id: CLASS, student_id: 'st_pat', text: { answers: { a: 'The delta forms…' } }, handed_in_at: 'x' }],
    [`work_handins/${L}/h_warm/st_sam`, { class_id: CLASS, student_id: 'st_sam', text: {}, handed_in_at: 'x' }],
    [`work_drafts/${L}/b_task/st_pat/1`, { text: {} }],
    [`work_redraft/${L}/b_task/st_pat`, { scope: {} }],
    [`voice_submissions/${L}/b_voice/take1`, { id: 'take1', lesson_id: L, block_id: 'b_voice', class_id: CLASS, student_id: 'st_sam', audio_key: 'aud1', device_hash: 'dev1', audio_delete_after: '2026-12-01T00:00:00.000Z' }],
    [`voice_claims/${L}/b_voice/dev1`, { id: 'take1' }],
    [`voice_owner/${L}/b_voice/${CLASS}/st_sam`, { id: 'take1' }],
    [`voice_audio_due/202612010000/${L}/b_voice/take1`, {}],
    [`voice_ai/${L}/b_voice/take1`, { read: 'ok' }],
    [`hinge/${L}/b_hinge/active`, { session: 's1' }],
    [`hinge/${L}/b_hinge/s1/answers/dev1`, { pick: 'a' }],
    [`lesson-why/${L}/b_why_stay/whys/w1`, { text: 'stays' }],
    [`thinking/${L}/b_task/dev2`, { text: 'thought' }],
    [`cj/${L}/b_cj/${CLASS}/round`, { open: true }],
    ['class_examples/slots/' + L, { lesson_id: L, slots: [{ id: 'cx_1', block_id: 'b_task', label: 'Good' }, { id: 'cx_2', block_id: 'h_warm', label: 'Warm' }] }],
    [`class_examples/entries/${L}/direct/cx_1`, { text: 'example' }],
    [`class_examples/entries/${L}/direct/cx_2`, { text: 'warm example' }],
    [`piece_feedback/${CLASS}/st_pat/w:${L}:b_task`, { kind: 'written', lesson_id: L, block_id: 'b_task', status: 'returned' }],
    [`piece_feedback/${CLASS}/st_sam/v:${L}`, { kind: 'viva', lesson_id: L, status: 'returned' }],
    [`piece_feedback/${CLASS}/st_pat/q:${L}:qq1`, { kind: 'quiz', lesson_id: L }],
    [`rubric_evidence/${CLASS}`, { st_pat: { [`w:${L}:b_task`]: { lesson_id: L, title: 'Delta', at: 'x', skills: {} }, [`q:${L}:qq1`]: { lesson_id: L, title: 'Quiz', at: 'x', skills: {} } }, st_sam: { [`v:${L}:b_voice`]: { lesson_id: L, title: 'Viva', at: 'x', skills: {} } } }],
    [`quiz/${L}/attempts/dev1/1`, { score: 1 }],
    [`quiz/${L}/current`, { v: 'k1' }],
    [`profile/${CLASS}/st_pat/done/${L}`, { at: 'x', via: 'tick' }],
    [`profile/${CLASS}/teacher-marks`, { st_sam: { [L]: { at: 'x', via: 'teacher' } } }],
    [`markbook/${CLASS}`, { columns: [{ id: 'colrivers1', kind: 'assessment', title: 'Delta task', date: '2026-11-02', weight: 10, criteria: [{ id: 'critclar1', label: 'Clarity', max: 4 }], piece: { lesson_id: L, block_id: 'b_task' } }], hidden_quizzes: [L], marks: {}, took: { st_pat: [L] }, updated_at: '' }],
    [`unit_organisers/${UNIT}`, { v: 2, sections: [{ id: 'sec1', name: 'Ideas', kind: 'table', lines: [{ id: 'ln1', cells: ['delta'], lesson_id: L }] }] }]
  ];
  if (published) entries.push([publishedLessonKey(L), { lesson_id: L, title: 'Rivers', unit_id: UNIT, blocks: [] }]);
  return storeFixture(entries);
}

async function call(store, body, id = L) {
  const session = createSessionToken({ now: Date.now(), randomBytes: () => Buffer.alloc(16, 4) }, SECRET).token;
  const handler = createLessonSplitHandler({ env: ENV, getContentStore: async () => store });
  const res = await handler(new Request(`https://api.adam-russell.com/api/lessons/${id}/split`, {
    method: 'POST',
    headers: { cookie: `life_hub_session=${session}`, origin: ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }), { params: { id } });
  return { status: res.status, body: await res.json() };
}

const PARTS = [
  { name: 'Rivers: writing', role: 'core', section_ids: ['s_write'] },
  { name: 'Rivers: check', role: 'support', section_ids: ['s_check'], whole_class: true }
];

test('every per-block root is a plain prefix', () => {
  for (const row of BLOCK_DATA) assert.match(row.root, /^[a-z_-]+\/([a-z_]+\/)?$/, row.name);
});

test('refusals: lesson kind, quiz cut in two, nothing left, bad ids', () => {
  const lesson = { blocks: lessonBlocks() };
  for (const mode of ['design_sprint', 'case_study', 'station_rotation', 'game', 'tutorial', 'lecture', 'quiz']) {
    assert.deepEqual(splitProblems({ ...lesson, pedagogical_mode: mode }, [{ name: 'A', role: 'core', section_ids: ['s_write'], whole_class: false }]), [MESSAGES.mode]);
  }
  assert.deepEqual(splitProblems({ ...lesson, rotation: { stations: [1] } }, [{ name: 'A', role: 'core', section_ids: ['s_write'] }]), [MESSAGES.mode]);
  const half = { ...lesson, blocks: [...lesson.blocks, quizQ('qq_top')] };
  assert.ok(splitProblems(half, [{ name: 'A', role: 'core', section_ids: ['s_check'] }]).includes(MESSAGES.quiz));
  const twoQuiz = { blocks: [section('s1', 'One', [quizQ('a1')]), section('s2', 'Two', [quizQ('a2')]), section('s3', 'Three', [])] };
  assert.ok(splitProblems(twoQuiz, [{ name: 'A', role: 'core', section_ids: ['s1'] }, { name: 'B', role: 'core', section_ids: ['s2'] }]).includes(MESSAGES.quiz));
  assert.deepEqual(splitProblems(twoQuiz, [{ name: 'A', role: 'core', section_ids: ['s1', 's2'] }]), []);
  assert.ok(splitProblems(lesson, [{ name: 'A', role: 'core', section_ids: ['s_warm', 's_write', 's_check'] }]).includes('Leave at least one section in this lesson.'));
  assert.ok(splitProblems(lesson, [{ name: 'A', role: 'core', section_ids: ['b_task'] }])[0].startsWith('Only whole sections'));
  assert.ok(splitProblems(lesson, [{ name: '', role: 'core', section_ids: ['s_write'] }]).includes('Give each new lesson a name.'));
  assert.ok(splitProblems(lesson, [{ name: 'A', role: 'core', section_ids: ['s_write'] }, { name: 'B', role: 'core', section_ids: ['s_write'] }]).includes('A section can only go to one new lesson.'));
  assert.ok(splitProblems(lesson, [1, 2, 3, 4].map((i) => ({ name: `P${i}`, role: 'core', section_ids: [] }))).some((p) => p.startsWith('Split into at most 3')));
});

test('status and preview through the route', async () => {
  const store = fixture();
  const status = await call(store, { action: 'status' });
  assert.equal(status.status, 200);
  assert.deepEqual(status.body.data.sections.map((s) => [s.id, s.has_quiz_questions]), [['s_warm', false], ['s_write', false], ['s_check', true]]);
  assert.equal(status.body.data.can_split, true);
  assert.equal(status.body.data.mode, 'direct');

  const preview = await call(store, { action: 'preview', parts: PARTS });
  assert.deepEqual(preview.body.data.problems, []);
  assert.deepEqual(preview.body.data.parts[0].sections, [{ id: 's_write', title: 'Writing' }]);
  assert.deepEqual(preview.body.data.counts, { students_with_work: 1, handins: 1, marked: 2, done_marks: 2 });
  assert.ok(preview.body.data.notes.includes(MESSAGES.calendar));
  assert.ok(preview.body.data.notes.includes(MESSAGES.anonymous));

  const refused = await call(store, { action: 'split', parts: [{ name: 'A', role: 'core', section_ids: ['s_check', 's_write', 's_warm'] }] });
  assert.equal(refused.status, 400);
  assert.equal(store.data.get(draftLessonKey(L)).blocks.length, 3);

  const sprint = fixture();
  sprint.data.set(draftLessonKey(L), { ...sprint.data.get(draftLessonKey(L)), pedagogical_mode: 'design_sprint' });
  const s = await call(sprint, { action: 'status' });
  assert.equal(s.body.data.can_split, false);
  assert.equal(s.body.data.reason, MESSAGES.mode);
});

test('a split copies every kind of data, and undo puts the lesson back', async () => {
  const store = fixture();
  const before = new Map([...store.data].map(([k, v]) => [k, structuredClone(v)]));
  const res = await call(store, { action: 'split', parts: PARTS });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const { split_id, new_lessons, published } = res.body.data;
  const [W, C] = new_lessons.map((l) => l.id);
  assert.deepEqual(new_lessons.map((l) => [l.title, l.role]), [['Rivers: writing', 'core'], ['Rivers: check', 'support']]);
  assert.equal(published, true);

  // Originals untouched, except L's draft/published and the records that gain the new lessons.
  const changedOnPurpose = new Set([draftLessonKey(L), publishedLessonKey(L), unitKey(UNIT), `markbook/${CLASS}`, `rubric_evidence/${CLASS}`, `profile/${CLASS}/teacher-marks`, `unit_organisers/${UNIT}`, `quiz/${L}/current`]);
  for (const [key, value] of before) if (!changedOnPurpose.has(key)) assert.deepEqual(store.data.get(key), value, key);

  // Blocks and lesson fields.
  const lesson = store.data.get(draftLessonKey(L));
  assert.deepEqual(lesson.blocks.map((b) => b.id), ['s_warm']);
  const w = store.data.get(draftLessonKey(W));
  const c = store.data.get(draftLessonKey(C));
  assert.deepEqual(w.blocks.map((b) => b.id), ['s_write']);
  assert.deepEqual(c.blocks.map((b) => b.id), ['s_check']);
  assert.equal(w.route_role, 'core');
  assert.equal(w.branch_from, undefined);
  assert.equal(c.route_role, 'support');
  assert.equal(c.branch_from, L);
  assert.deepEqual(w.dot_points, ['geo:U1']);
  assert.deepEqual(c.focus_pieces, ['kp_aa11bb']);
  assert.equal(w.feedback_off, true);
  assert.equal(w.pedagogical_mode, 'direct');
  assert.ok(w.sequence > 2 && w.sequence < c.sequence && c.sequence < 3);
  assert.deepEqual(store.data.get(unitKey(UNIT)).lesson_ids, ['lesson_before', L, W, C, 'lesson_after']);
  // A moved CJ block that judged "this lesson" now names L, where its source stayed.
  assert.equal(w.blocks[0].content.blocks.find((b) => b.id === 'b_cj').content.source.lesson_id, L);

  // Per-block copies.
  for (const key of [
    `work_handins/${W}/b_task/st_pat`, `work_drafts/${W}/b_task/st_pat/1`, `work_redraft/${W}/b_task/st_pat`,
    `voice_claims/${W}/b_voice/dev1`, `voice_owner/${W}/b_voice/${CLASS}/st_sam`, `voice_audio_due/202612010000/${W}/b_voice/take1`, `voice_ai/${W}/b_voice/take1`,
    `hinge/${W}/b_hinge/active`, `hinge/${W}/b_hinge/s1/answers/dev1`, `thinking/${W}/b_task/dev2`, `cj/${W}/b_cj/${CLASS}/round`,
    `class_examples/entries/${W}/direct/cx_1`, `quiz/${C}/attempts/dev1/1`
  ]) assert.ok(store.data.has(key), key);
  assert.equal(store.data.has(`work_handins/${W}/h_warm/st_sam`), false);
  assert.equal(store.data.has(`lesson-why/${W}/b_why_stay/whys/w1`), false);
  assert.equal(store.data.has(`class_examples/entries/${W}/direct/cx_2`), false);
  assert.equal(store.data.get(`voice_submissions/${W}/b_voice/take1`).lesson_id, W);
  assert.deepEqual(store.data.get(`class_examples/slots/${W}`).slots.map((s) => s.id), ['cx_1']);

  // Work blob: only the moved block; Sam had none.
  assert.deepEqual(store.data.get(`work/${W}/owner_pat`), { class_id: CLASS, student_id: 'st_pat', at: 'x', blocks: { b_task: { answers: { a: 'The delta forms…' } } } });
  assert.equal(store.data.has(`work/${W}/owner_sam`), false);
  assert.equal(store.data.has(`work/${C}/owner_pat`), false);

  // Feedback and the rubric ledger.
  assert.equal(store.data.get(`piece_feedback/${CLASS}/st_pat/w:${W}:b_task`).lesson_id, W);
  assert.equal(store.data.get(`piece_feedback/${CLASS}/st_sam/v:${W}`).lesson_id, W);
  assert.equal(store.data.get(`piece_feedback/${CLASS}/st_pat/q:${C}:qq1`).lesson_id, C);
  const ledger = store.data.get(`rubric_evidence/${CLASS}`);
  assert.equal(ledger.st_pat[`w:${W}:b_task`].lesson_id, W);
  assert.equal(ledger.st_pat[`q:${C}:qq1`].lesson_id, C);
  assert.equal(ledger.st_sam[`v:${W}:b_voice`].lesson_id, W);
  assert.ok(ledger.st_pat[`w:${L}:b_task`]);

  // Done marks.
  assert.equal(store.data.get(`profile/${CLASS}/st_pat/done/${W}`).via, 'tick');
  assert.ok(store.data.has(`profile/${CLASS}/st_pat/done/${C}`));
  assert.ok(store.data.get(`profile/${CLASS}/teacher-marks`).st_sam[W]);

  // Markbook: the column follows its block, took and hidden quizzes gain the new lessons, the support part is whole class.
  const book = store.data.get(`markbook/${CLASS}`);
  assert.deepEqual(book.columns[0].piece, { lesson_id: W, block_id: 'b_task' });
  assert.deepEqual(book.took.st_pat, [L, W, C]);
  assert.deepEqual(book.took.st_sam, [C]);
  assert.deepEqual(book.hidden_quizzes, [L, C]);

  // Organiser.
  assert.deepEqual(store.data.get(`unit_organisers/${UNIT}`).sections[0].lines[0].also_lesson_ids, [W, C]);

  // Published: L without the moved sections, both new lessons, the quiz on the check part.
  assert.ok(store.data.get(publishedLessonKey(W)));
  assert.ok(store.data.get(publishedLessonKey(C)).quiz);
  assert.equal(store.data.get(publishedLessonKey(L)).quiz, undefined);
  assert.equal(store.data.get(publishedLessonKey(L)).blocks.length, 1);

  // Status lists the split; undo restores.
  const status = await call(store, { action: 'status' });
  assert.equal(status.body.data.splits[0].split_id, split_id);
  assert.equal(status.body.data.splits[0].undone, false);

  const undo = await call(store, { action: 'undo', split_id });
  assert.equal(undo.status, 200, JSON.stringify(undo.body));
  assert.deepEqual(undo.body.data, { restored: true });
  assert.deepEqual(store.data.get(draftLessonKey(L)).blocks.map((b) => b.id), ['s_warm', 's_write', 's_check']);
  assert.equal(store.data.get(draftLessonKey(W)).status, 'trashed');
  assert.equal(store.data.get(draftLessonKey(C)).previous_status, 'active');
  assert.deepEqual(store.data.get(unitKey(UNIT)).lesson_ids, ['lesson_before', L, 'lesson_after']);
  const after = store.data.get(`markbook/${CLASS}`);
  assert.deepEqual(after.columns[0].piece, { lesson_id: L, block_id: 'b_task' });
  assert.deepEqual(after.took, { st_pat: [L], st_sam: [] });
  assert.deepEqual(after.hidden_quizzes, [L]);
  assert.equal(store.data.get(`unit_organisers/${UNIT}`).sections[0].lines[0].also_lesson_ids, undefined);
  assert.equal(store.data.get(publishedLessonKey(L)).blocks.length, 3);
  assert.ok(store.data.get(publishedLessonKey(L)).quiz);

  const again = await call(store, { action: 'undo', split_id });
  assert.equal(again.status, 409);
});

test('undo is refused once the moved sections are back in the lesson', async () => {
  const store = fixture({ published: false });
  const res = await call(store, { action: 'split', parts: [PARTS[0]] });
  assert.equal(res.body.data.published, false);
  const lesson = store.data.get(draftLessonKey(L));
  store.data.set(draftLessonKey(L), { ...lesson, blocks: [...lesson.blocks, lessonBlocks()[1]] });
  const undo = await call(store, { action: 'undo', split_id: res.body.data.split_id });
  assert.equal(undo.status, 409);
});

test('a viva take still being transcribed in a moved section stops the split', async () => {
  const store = fixture();
  store.data.set(`voice_transcribe_queue/${L}/b_voice/take1`, {});
  const preview = await call(store, { action: 'preview', parts: PARTS });
  assert.deepEqual(preview.body.data.problems, [MESSAGES.transcribing]);
  const split = await call(store, { action: 'split', parts: PARTS });
  assert.equal(split.status, 400);
  assert.equal(split.body.error.message, MESSAGES.transcribing);
  assert.equal(store.data.get(draftLessonKey(L)).blocks.length, 3);
  // A take waiting in a section that stays doesn't matter, and the queue is never copied.
  store.data.delete(`voice_transcribe_queue/${L}/b_voice/take1`);
  store.data.set(`voice_transcribe_queue/${L}/h_warm/take9`, {});
  const ok = await call(store, { action: 'split', parts: PARTS });
  assert.equal(ok.status, 200);
  assert.equal([...store.data.keys()].filter((k) => k.startsWith('voice_transcribe_queue/') && !k.includes(L)).length, 0);
});

test('a markbook that can\'t be read stops the split', async () => {
  const store = fixture();
  store.data.set(`markbook/${CLASS}`, { columns: [{ id: 'x', kind: 'nonsense' }] });
  const preview = await call(store, { action: 'preview', parts: PARTS });
  assert.deepEqual(preview.body.data.problems, [MESSAGES.markbook('Class A')]);
  assert.match(MESSAGES.markbook('Class A'), /^The markbook for Class A couldn’t be read/);
  const split = await call(store, { action: 'split', parts: PARTS });
  assert.equal(split.status, 400);
  assert.equal(store.data.get(draftLessonKey(L)).blocks.length, 3);
});

test('deleting a split take in either lesson keeps the audio the other copy uses', async () => {
  const store = fixture({ published: false });
  store.data.set('voice_audio/aud1', 'bytes');
  const res = await call(store, { action: 'split', parts: PARTS });
  const W = res.body.data.new_lessons[0].id;
  assert.equal(store.data.get(`voice_submissions/${W}/b_voice/take1`).audio_shared_from, L);
  assert.equal(store.data.get(`voice_submissions/${L}/b_voice/take1`).audio_shared_from, undefined);
  await deleteVoiceSubmission(store, W, 'b_voice', 'take1');
  assert.ok(store.data.has('voice_audio/aud1'));
  assert.ok(store.data.has(`voice_submissions/${L}/b_voice/take1`));
  await deleteVoiceSubmission(store, L, 'b_voice', 'take1');
  assert.ok(store.data.has('voice_audio/aud1'));
  // A take that was never split still loses its audio.
  store.data.set('voice_audio/aud2', 'bytes');
  store.data.set(`voice_submissions/${L}/h_warm/take2`, { id: 'take2', lesson_id: L, block_id: 'h_warm', audio_key: 'aud2', device_hash: 'dev9', audio_delete_after: '2026-12-01T00:00:00.000Z' });
  await deleteVoiceSubmission(store, L, 'h_warm', 'take2');
  assert.equal(store.data.has('voice_audio/aud2'), false);
});
