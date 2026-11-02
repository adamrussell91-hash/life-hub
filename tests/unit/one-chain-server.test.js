import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';
import { classDeepAction } from '../../netlify/functions/_shared/class-deep.mjs';
import { markbookAction } from '../../netlify/functions/_shared/markbook.mjs';
import { pieceKey, piecesAction } from '../../netlify/functions/_shared/piece-feedback.mjs';
import { pieceFor, progressFor } from '../../netlify/functions/_shared/profile-feedback.mjs';
import { filterBlocksForStudent } from '../../netlify/functions/_shared/teaching-student.mjs';
import { toMarkAction } from '../../netlify/functions/_shared/to-mark-flow.mjs';
import { readingQuestion, saveVoiceMarking } from '../../netlify/functions/_shared/voice-submissions.mjs';
import { readRubricLedger } from '../../netlify/functions/_shared/rubric.mjs';
import { createLessonHandler } from '../../netlify/functions/lesson.mjs';
import { createLessonPublishHandler } from '../../netlify/functions/lesson-publish.mjs';
import { createPublishedLessonHandler } from '../../netlify/functions/published-lesson.mjs';
import { createPublishedUnitHandler } from '../../netlify/functions/published-unit.mjs';

/* An invented class and unit only: this repository is public. */

const ORIGIN = 'https://life-hub.adam-russell.com';

function storeFixture(entries = []) {
  const data = new Map(entries.map(([k, v]) => [k, structuredClone(v)]));
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: 'e0' } : null; },
    async setJSON(key, value) { data.set(key, structuredClone(value)); return { modified: true }; },
    async delete(key) { data.delete(key); },
    async list({ prefix } = {}) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix ?? '')).map((key) => ({ key })) }; }
  };
}

const piece = { id: 'kp_aa11bb', text: 'The tide table', tier: 'essential', dot_point: 'harbours:U1' };
const missed = { id: 'kp_cc22dd', text: 'The old pier', tier: 'strong', dot_point: 'harbours:U1' };
const unit = { id: 'unit1', type: 'unit', title: 'Harbours', lesson_ids: ['lesson1'], deep_understandings: [{ id: 'du_ab12cd', claim: 'Tides keep time', dot_points: ['harbours:U1'], concept_bullets: [], pieces: [piece, missed], shared_piece_ids: [], steps: [] }, { id: 'du_cd34ef', claim: 'Piers remember', dot_points: ['harbours:U1'], concept_bullets: [], pieces: [], shared_piece_ids: [], steps: [] }] };
const column = { id: 'column001', kind: 'assessment', title: 'Tide paragraph', date: '2026-10-27', weight: 0, piece: { lesson_id: 'lesson1', block_id: 'block1' }, criteria: [{ id: 'crit0001', label: 'Analysis', max: 10, outcomes: ['out_a'], concepts: [] }] };

async function setup() {
  const store = storeFixture([
    ['classes/class1', { id: 'class1', type: 'class', title: '12 English', active_unit_ids: [], students: [{ name: 'Pip Quill' }, { name: 'Wren Hale' }] }],
    ['markbook/class1', { columns: [column], marks: {}, hidden_quizzes: [], focus: {}, took: {}, groups: [], history: [] }],
    ['feedback_codes/library', { codes: [] }],
    ['lessons/lesson1', { id: 'lesson1', type: 'lesson', unit_id: 'unit1', title: 'Tides', blocks: [] }],
    ['units/unit1', unit]
  ]);
  const roster = await loadRoster(store, 'class1');
  const [pip] = roster.students;
  store.data.set(`work_handins/lesson1/block1/${pip.id}`, { class_id: 'class1', student_id: pip.id, text: { answers: { q1: 'The tide keeps time.' } }, handed_in_at: '2026-10-28T00:00:00Z' });
  return { store, roster, pip };
}

const fullRubric = {
  skills: { 'arguing.thesis': 'accomplished', 'arguing.evidence': 'below' },
  pieces: { kp_aa11bb: 'used', kp_cc22dd: 'missed' },
  steps: { 'du_ab12cd:2a': { checks: [true, true], pass: true }, 'du_cd34ef:2a': { checks: [true], pass: true } },
  next_step: { text: 'Quote the line you mean.' }
};

test('one marking pass records every skill, piece and step on written work', async () => {
  const { store, roster, pip } = await setup();
  const body = { action: 'save', column_id: 'column001', student_id: pip.id, tags: [], comment: 'Good.', steps: {}, rubric: fullRubric, today: '2026-10-29' };
  const out = await piecesAction(store, 'class1', body);
  assert.deepEqual(out.feedback.rubric.skills, fullRubric.skills);
  assert.deepEqual(out.deep.writing.block1[pip.id], { used: ['kp_aa11bb'], missed: ['kp_cc22dd'], at: '2026-10-29' });
  assert.equal(out.deep.steps[pip.id].du_ab12cd.step, '2a');
  assert.equal(out.deep.steps[pip.id].du_cd34ef.step, '2a');

  // The rungs reach the markbook's evidence as rows, one read for the class.
  const view = await markbookAction(store, 'class1', { action: 'load', skip_done: true });
  assert.deepEqual(view.rubrics.map((r) => [r.student, r.piece, r.skills, r.column_id]), [[pip.id, 'w:lesson1:block1', fullRubric.skills, 'column001']]);

  // Saving again with no rubric keeps it; a save without the pass moves the step back.
  const kept = await piecesAction(store, 'class1', { action: 'save', column_id: 'column001', student_id: pip.id, tags: [], comment: 'Better.', steps: {} });
  assert.deepEqual(kept.feedback.rubric.skills, fullRubric.skills);
  const back = await piecesAction(store, 'class1', { ...body, rubric: { ...fullRubric, steps: { 'du_cd34ef:2a': { checks: [true], pass: true } } } });
  assert.equal(back.deep.steps[pip.id].du_ab12cd, undefined);
  assert.equal(back.deep.steps[pip.id].du_cd34ef.step, '2a');

  // The student reads their rungs, used pieces and next step, and nothing else of it.
  await piecesAction(store, 'class1', { action: 'return', column_id: 'column001', student_id: pip.id });
  const seen = await pieceFor(store, roster, pip, 'w:lesson1:block1');
  assert.deepEqual(seen.rubric.skills.map((s) => [s.ref, s.rung]), [['arguing.thesis', 'accomplished'], ['arguing.evidence', 'below']]);
  assert.deepEqual(seen.rubric.pieces_used, [{ id: 'kp_aa11bb', text: 'The tide table' }]);
  assert.equal(seen.rubric.next_step, 'Quote the line you mean.');
  for (const hidden of ['kp_cc22dd', 'The old pier', 'steps', 'checks', 'dot_point', 'harbours:U1']) assert.ok(!JSON.stringify(seen.rubric).includes(hidden), hidden);
  const progress = await progressFor(store, roster, pip);
  assert.ok(progress.skills.flatMap((g) => g.rows).some((r) => r.key === 'skill:arguing.thesis' && r.now === 'accomplished'));
});

test('a step that isn’t next stays practice, and is stored unpassed', async () => {
  const { store, pip } = await setup();
  const out = await piecesAction(store, 'class1', { action: 'save', column_id: 'column001', student_id: pip.id, tags: [], comment: '', steps: {}, rubric: { steps: { 'du_ab12cd:3': { checks: [true], pass: true } } } });
  assert.deepEqual(out.blocked, ['du_ab12cd:3']);
  assert.equal(out.feedback.rubric.steps['du_ab12cd:3'].pass, false);
  assert.equal((await classDeepAction(store, 'class1', { action: 'load', unit_id: 'unit1' })).steps[pip.id]?.du_ab12cd, undefined);
});

test('a written quiz answer keeps its rungs in the ledger, tied to its attempt, and marks its insight stale', async () => {
  const { store, pip } = await setup();
  const out = await toMarkAction(store, { action: 'answer_save', class_id: 'class1', student_id: pip.id, piece: 'q:lesson1:q9', lesson_id: 'lesson1', title: 'Check', text: { answers: { q9: 'x' } }, tags: [], comment: '', attempt_id: 'att1', rubric: { skills: { 'arguing.thesis': 'skilled' }, pieces: { kp_aa11bb: 'used' } }, today: '2026-10-29' });
  assert.deepEqual(out.deep.writing.q9[pip.id].used, ['kp_aa11bb']);
  assert.equal((await readRubricLedger(store, 'class1'))[pip.id]['q:lesson1:q9'].attempt_id, 'att1');
  assert.ok(store.data.has('quiz/lesson1/evidence-stamp'));
  assert.deepEqual(store.data.get(pieceKey('class1', pip.id, 'q:lesson1:q9')).rubric.skills, { 'arguing.thesis': 'skilled' });
  const view = await markbookAction(store, 'class1', { action: 'load', skip_done: true });
  assert.equal(view.rubrics, undefined, 'a quiz answer reaches evidence through its own items');
});

test('a viva take holds its rubric, and old single-step blocks still read', async () => {
  const { store, pip } = await setup();
  const lesson = 'lesson1';
  store.data.set(`voice_submissions/${lesson}/block2/sub1`, { id: 'sub1', lesson_id: lesson, device_hash: 'abcdefghij', status: 'new', class_id: 'class1', student_id: pip.id, prompt: 'Why the tide?', submitted_at: '2026-10-28T00:00:00Z' });
  const out = await saveVoiceMarking(store, lesson, 'block2', 'sub1', { rubric: { skills: { 'arguing.thesis': 'skilled' }, steps: { 'du_ab12cd:2a': { checks: [], pass: true } } }, today: '2026-10-29' });
  assert.equal(out.rubric.skills['arguing.thesis'], 'skilled');
  assert.equal(out.deep.steps[pip.id].du_ab12cd.step, '2a');
  assert.equal(out.status, 'marked');
  const view = await markbookAction(store, 'class1', { action: 'load', skip_done: true });
  assert.equal(view.rubrics[0].piece, 'v:lesson1:block2');

  const old = { content: { prompt: 'p' }, settings: { deep_step: { du: 'du_ab12cd', step: '3' }, deep_checks: ['Names two'], deep_targets: ['kp_aa11bb'] } };
  assert.deepEqual(readingQuestion(old, unit).checks, ['Names two']);
  const both = { content: { prompt: 'p' }, settings: { deep_step: [{ du: 'du_ab12cd', step: '3', checks: ['One'] }, { du: 'du_cd34ef', step: '4', checks: ['Two'] }] } };
  assert.deepEqual(readingQuestion(both, unit).checks, ['One', 'Two']);
  assert.equal(readingQuestion({ settings: { deep_checks: ['x'] } }, unit), null);
});

test('the student payload has no focus picks, deep settings or piece dot points', async () => {
  const stamp = '2026-10-29T00:00:00.000Z';
  const blocks = [{
    id: 'b1', type: 'block', block_type: 'heading', variant: 'medium', visibility: 'student_teacher', content: { text: 'Tides' }, layout: {}, print: {}, created_at: stamp, updated_at: stamp, schema_version: 1,
    settings: { deep_skills: ['arguing.thesis'], deep_step: [{ du: 'du_ab12cd', step: '3', checks: ['Compares'] }], deep_targets: ['kp_aa11bb'], deep_taught: ['kp_aa11bb'], deep_checks: ['x'], keep: 1 }
  }];
  assert.deepEqual(filterBlocksForStudent(blocks)[0].settings, { keep: 1 });

  const secret = 'x'.repeat(32);
  const env = { SITE_ORIGIN: ORIGIN, SESSION_SECRET: secret, LIFE_HUB_PASSPHRASE_HASH: 'configured' };
  const session = createSessionToken({ now: Date.parse('2026-10-29T00:00:00Z'), randomBytes: () => Buffer.alloc(16, 4) }, secret).token;
  const store = storeFixture([
    ['lessons/lesson1', { id: 'lesson1', type: 'lesson', unit_id: 'unit1', title: 'Tides', blocks, dot_points: ['harbours:U1'], focus_pieces: ['kp_aa11bb'], focus_skills: ['arguing.thesis'], created_at: stamp, updated_at: stamp, schema_version: 1 }],
    ['units/unit1', unit]
  ]);
  const publish = createLessonPublishHandler({ env, now: () => Date.parse('2026-10-29T01:00:00Z'), getContentStore: async () => store });
  const published = await publish(new Request('https://api.adam-russell.com/api/lessons/lesson1/publish', {
    method: 'POST',
    headers: { cookie: `life_hub_session=${session}`, origin: ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({})
  }));
  assert.equal(published.status, 200);

  const fetchIt = async (handler, url) => {
    const res = await handler(new Request(url, { headers: { origin: ORIGIN } }), {});
    assert.equal(res.status, 200);
    return JSON.stringify(await res.json());
  };
  const lessonBody = await fetchIt(createPublishedLessonHandler({ getContentStore: async () => store, env }), 'https://api.adam-russell.com/api/published/lessons/lesson1');
  const unitBody = await fetchIt(createPublishedUnitHandler({ getContentStore: async () => store, env }), 'https://api.adam-russell.com/api/published/units/unit1');
  assert.ok(lessonBody.includes('Tides'));
  for (const body of [lessonBody, unitBody]) {
    for (const hidden of ['focus_pieces', 'focus_skills', 'dot_point', 'deep_', 'kp_aa11bb']) assert.ok(!body.includes(hidden), hidden);
  }
});

test('the lesson route persists the picks', async () => {
  const secret = 'x'.repeat(32);
  const env = { SITE_ORIGIN: ORIGIN, SESSION_SECRET: secret, LIFE_HUB_PASSPHRASE_HASH: 'configured' };
  const session = createSessionToken({ now: Date.now(), randomBytes: () => Buffer.alloc(16, 4) }, secret).token;
  const store = storeFixture([['lessons/lesson1', { id: 'lesson1', type: 'lesson', unit_id: 'unit1', title: 'Tides', blocks: [] }]]);
  const handler = createLessonHandler({ env, getContentStore: async () => store });
  const res = await handler(new Request('https://api.adam-russell.com/api/lessons/lesson1', {
    method: 'PATCH',
    headers: { cookie: `life_hub_session=${session}`, origin: ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ focus_pieces: ['kp_aa11bb'], focus_skills: ['arguing.thesis'] })
  }), { params: { id: 'lesson1' } });
  assert.equal(res.status, 200);
  assert.deepEqual(store.data.get('lessons/lesson1').focus_pieces, ['kp_aa11bb']);
  assert.deepEqual(store.data.get('lessons/lesson1').focus_skills, ['arguing.thesis']);
});
