/**
 * Split a lesson: the teacher moves some top-level sections of lesson L into
 * one to three new lessons. Block ids stay the same, and everything students
 * and the teacher saved against the moved blocks is copied to the new lesson.
 * Nothing is deleted from L, so a split can be undone.
 *
 *   lesson_splits/{lesson}/{split}   { id, lesson_id, at, parts, original_blocks, moved_ids, new_lesson_ids,
 *                                      new_lessons, quiz_moved_to, markbook_before, published, undone }
 *
 * Per-block data lives under `{root}/{lesson}/{block}/…` for every root in
 * BLOCK_DATA below; add a row there when a new block keeps its own records.
 */
import { createLessonRecord } from '../lessons.mjs';
import { publishLessonDraft } from '../lesson-publish.mjs';
import { listBlobKeys, mapBounded } from './blobs-list.mjs';
import { classesForLesson, loadRoster } from './class-claims.mjs';
import { ENTRIES_PREFIX, isSafeId, slotsKey } from './class-examples.mjs';
import { discernTailPrefix } from './discern.mjs';
import { pulseTapPrefix } from './block-pulse.mjs';
import { draftKey, handinKey, pieceId, redraftKey } from './lesson-work.mjs';
import { MarkbookSchema } from './markbook-schema.mjs';
import { organiserKey } from './organiser.mjs';
import { pieceKey } from './piece-feedback.mjs';
import { quadrantBoardKey, quadrantQuestionPrefix } from './quadrant-questions.mjs';
import { answerPiece } from './quiz-again.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { CLASS_PREFIX, draftLessonKey, newId, publishedLessonKey, setJSON, unitKey } from './teaching-blobs.mjs';
import { thinkingPrefix } from './thinking-responses.mjs';
import { voiceKeys } from './voice-submissions.mjs';
import { walkBlocks } from './question-drop.mjs';

export class SplitError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const reject = (status, code, message) => {
  throw new SplitError(status, code, message);
};

const STRONG = { type: 'json', consistency: 'strong' };
const read = (store, key) => store.get(key, STRONG);

export const SPLIT_ROLES = ['core', 'support', 'extension', 'optional'];
export const SPLIT_LIMITS = { parts: 3, name: 120 };
export const MESSAGES = {
  mode: 'This kind of lesson runs as one piece, so it can’t be split.',
  quiz: 'The quiz questions have to move together, so the quiz isn’t cut in two.',
  calendar: 'New lessons aren’t on the calendar yet. Drag them onto a day in the planner.',
  transcribing: 'Some viva recordings in these sections are still being transcribed. Try again in a few minutes.',
  markbook: (title) => `The markbook for ${title} couldn\u2019t be read, so its columns can\u2019t follow the moved sections.`,
  anonymous: 'Anonymous answers (like What, How, Why and hinge votes) come across for you to see, but students won’t see their own as theirs in the new lesson.'
};

/** Lesson types that run as one piece. Their settings mark them even if the mode was changed. */
const WHOLE_MODES = ['design_sprint', 'case_study', 'station_rotation', 'game', 'tutorial', 'lecture', 'quiz'];
// A plain lesson's `quiz` is only its settings for in-lesson questions; the quiz rule in splitProblems keeps those together.
const WHOLE_CONFIGS = ['sprint', 'case', 'rotation', 'game', 'tutorial'];

/** Lesson fields a new part takes from the lesson it came from (createLessonRecord leaves them out). */
const COPIED_FIELDS = ['line_stops', 'line_off', 'dot_points', 'focus_pieces', 'syllabus_outcomes', 'outcome_ids', 'focus_skills', 'tags', 'cover', 'feedback_off', 'conditions_off', 'end_questions', 'quiz'];

/**
 * The root of a `{root}/{lesson}/{block}/…` key, read from the module's own key helper,
 * so a renamed key is picked up here too.
 */
function rootOf(helper) {
  const sample = helper('LESSON', 'BLOCK');
  const at = sample.indexOf('LESSON/BLOCK');
  if (at < 0) throw new Error(`Split: ${sample} is not a lesson/block key.`);
  return sample.slice(0, at);
}

/**
 * Every record kept per block, as `{root}/{lesson}/{block}/…`. `anonymous`: keyed by device,
 * so a student won't see theirs as their own in the new lesson. Sources:
 * lesson-work.mjs, redraft.mjs, voice-submissions.mjs, hinge.mjs, brainstorm.mjs,
 * continuum-line.mjs, peer-feedback.mjs, lesson-why.mjs, thinking-responses.mjs,
 * quadrant-questions.mjs, discern.mjs, block-pulse.mjs, comparative-judgement.mjs.
 */
export const BLOCK_DATA = [
  { name: 'handins', root: rootOf((l, b) => handinKey(l, b, '')) },
  { name: 'drafts', root: rootOf((l, b) => draftKey(l, b, '', '')) },
  { name: 'redrafts', root: rootOf((l, b) => redraftKey(l, b, '')) },
  { name: 'voice_claims', root: rootOf((l, b) => voiceKeys.claim(l, b, '')) },
  { name: 'voice_submissions', root: rootOf(voiceKeys.submissions) },
  { name: 'voice_ai', root: rootOf((l, b) => voiceKeys.aiRead(l, b, '')) },
  { name: 'voice_owner', root: rootOf((l, b) => voiceKeys.owner(l, b, '', '')) },
  { name: 'voice_starts', root: rootOf(voiceKeys.starts) },
  { name: 'voice_start_owner', root: rootOf((l, b) => voiceKeys.startOwner(l, b, '', '')) },
  // hinge.mjs, brainstorm.mjs, continuum-line.mjs, peer-feedback.mjs, lesson-why.mjs and
  // comparative-judgement.mjs keep their key builders private: `${root}${lesson}/${block}` is their base.
  { name: 'hinge', root: 'hinge/', anonymous: true },
  { name: 'brainstorm', root: 'brainstorm/' },
  { name: 'continuum', root: 'continuum/' },
  { name: 'peer_feedback', root: 'peer_feedback/' },
  { name: 'lesson_why', root: 'lesson-why/', anonymous: true },
  { name: 'comparative_judgement', root: 'cj/' },
  { name: 'thinking', root: rootOf(thinkingPrefix), anonymous: true },
  { name: 'quadrant_questions', root: rootOf(quadrantQuestionPrefix), anonymous: true },
  { name: 'quadrant_board', root: rootOf(quadrantBoardKey), anonymous: true },
  { name: 'discern', root: rootOf(discernTailPrefix), anonymous: true },
  { name: 'block_pulse', root: rootOf(pulseTapPrefix), anonymous: true }
];

const VOICE_DUE_ROOT = 'voice_audio_due/';
const WORK_ROOT = 'work/';
const QUIZ_ROOT = 'quiz/';
const SPLIT_ROOT = 'lesson_splits/';
const splitKey = (lesson, split) => `${SPLIT_ROOT}${lesson}/${split}`;
const markbookKey = (classId) => `markbook/${classId}`;
const ledgerKey = (classId) => `rubric_evidence/${classId}`;
const teacherMarksKey = (classId) => `profile/${classId}/teacher-marks`;
const doneMark = (lesson) => `/done/${lesson}`;

/* ── Reading the lesson ───────────────────────────────────────────── */

const isSection = (b) => b && typeof b === 'object' && b.block_type === 'section' && typeof b.id === 'string';
const sectionTitle = (b) => (typeof b.content?.title === 'string' && b.content.title.trim()) || 'Untitled section';
const quizIdsIn = (blocks) => [...walkBlocks(blocks)].filter((b) => b.block_type === 'quiz_question' && typeof b.id === 'string').map((b) => b.id);

export function wholeLessonKind(lesson) {
  if (WHOLE_MODES.includes(lesson?.pedagogical_mode)) return true;
  return WHOLE_CONFIGS.some((field) => lesson?.[field] && typeof lesson[field] === 'object' && Object.keys(lesson[field]).length > 0);
}

async function loadLesson(store, id) {
  if (!isSafeId(id)) reject(404, 'not_found', 'Lesson not found');
  const row = typeof store.getWithMetadata === 'function'
    ? await store.getWithMetadata(draftLessonKey(id), STRONG)
    : { data: await read(store, draftLessonKey(id)), etag: null };
  const lesson = row?.data;
  if (!lesson || typeof lesson !== 'object' || Array.isArray(lesson) || isDeletedRecord(lesson)) reject(404, 'not_found', 'Lesson not found');
  return { lesson, etag: row?.etag ?? null };
}

function cleanParts(raw) {
  if (!Array.isArray(raw)) reject(400, 'bad_request', 'parts must be a list.');
  return raw.slice(0, 10).map((p) => ({
    name: typeof p?.name === 'string' ? p.name.trim() : '',
    role: typeof p?.role === 'string' ? p.role : '',
    section_ids: Array.isArray(p?.section_ids) ? p.section_ids.filter((s) => typeof s === 'string') : [],
    whole_class: p?.whole_class === true
  }));
}

/** What would stop this split, in the teacher's words. Empty means it can go ahead. */
export function splitProblems(lesson, parts) {
  if (wholeLessonKind(lesson)) return [MESSAGES.mode];
  const problems = [];
  const add = (m) => { if (!problems.includes(m)) problems.push(m); };
  const blocks = Array.isArray(lesson.blocks) ? lesson.blocks : [];
  const sections = new Map(blocks.filter(isSection).map((b) => [b.id, b]));
  if (parts.length === 0) add('Pick at least one section to move.');
  if (parts.length > SPLIT_LIMITS.parts) add(`Split into at most ${SPLIT_LIMITS.parts} new lessons.`);
  const seen = new Set();
  for (const part of parts) {
    if (!part.name) add('Give each new lesson a name.');
    if (part.name.length > SPLIT_LIMITS.name) add(`Keep each name to ${SPLIT_LIMITS.name} characters.`);
    if (!SPLIT_ROLES.includes(part.role)) add('Choose core, support, extension or optional for each new lesson.');
    if (part.section_ids.length === 0) add('Pick at least one section for each new lesson.');
    for (const id of part.section_ids) {
      if (!sections.has(id)) add('Only whole sections of this lesson can move. One of the picks isn’t one.');
      if (seen.has(id)) add('A section can only go to one new lesson.');
      seen.add(id);
    }
  }
  const moved = [...seen].filter((id) => sections.has(id));
  if (sections.size > 0 && blocks.filter((b) => !(isSection(b) && seen.has(b.id))).filter(isSection).length === 0) {
    add('Leave at least one section in this lesson.');
  }
  // Quiz questions: all of them move into the same part, or none does.
  const allQuiz = quizIdsIn(blocks);
  if (allQuiz.length > 0 && moved.length > 0) {
    const partsWithQuiz = parts.filter((p) => quizIdsIn(p.section_ids.map((id) => sections.get(id)).filter(Boolean)).length > 0);
    const movedQuiz = quizIdsIn(moved.map((id) => sections.get(id)));
    if (movedQuiz.length > 0 && (movedQuiz.length !== allQuiz.length || partsWithQuiz.length > 1)) add(MESSAGES.quiz);
  }
  return problems;
}

/** Each part's sections, the block ids that move with it, and where the quiz goes. */
function plan(lesson, parts) {
  const sections = new Map((lesson.blocks ?? []).filter(isSection).map((b) => [b.id, b]));
  const out = parts.map((p) => {
    const blocks = p.section_ids.map((id) => sections.get(id)).filter(Boolean);
    const ids = new Set([...walkBlocks(blocks)].map((b) => b.id).filter((id) => typeof id === 'string'));
    return { ...p, blocks, ids, quiz: quizIdsIn(blocks) };
  });
  const quizPart = out.findIndex((p) => p.quiz.length > 0);
  return { parts: out, quizPart };
}

/* ── Finding the data that moves ──────────────────────────────────── */

async function listClassIds(store) {
  const keys = await listBlobKeys(store, CLASS_PREFIX);
  const ids = keys.map((k) => k.slice(CLASS_PREFIX.length)).filter((id) => id && !id.includes('/') && isSafeId(id));
  const records = await mapBounded(ids, 8, (id) => read(store, `${CLASS_PREFIX}${id}`));
  return ids.filter((_, i) => records[i] && !isDeletedRecord(records[i]));
}

/**
 * What the store says stops a split right now: a viva take still waiting for its transcript
 * (the queue isn't copied, so the new lesson's copy would never be transcribed), or a markbook
 * that can't be read (its hand-in columns couldn't follow the moved sections).
 */
async function storeProblems(store, lessonId, planned) {
  const problems = [];
  const moved = new Set(planned.parts.flatMap((p) => [...p.ids]));
  const queueRoot = rootOf(voiceKeys.queuePrefix);
  const queuePrefix = `${queueRoot}${lessonId}/`;
  if ((await listBlobKeys(store, queuePrefix)).some((k) => moved.has(k.slice(queuePrefix.length).split('/')[0]))) {
    problems.push(MESSAGES.transcribing);
  }
  for (const classId of await listClassIds(store)) {
    const raw = await read(store, markbookKey(classId));
    if (raw == null || MarkbookSchema.safeParse(raw).success) continue;
    const cls = await read(store, `${CLASS_PREFIX}${classId}`);
    problems.push(MESSAGES.markbook(cls?.display_name || cls?.title || cls?.code || 'a class'));
  }
  return problems;
}

/**
 * Every per-block key for blocks that move, mapped to its key in the new lesson.
 * `blockOf(id)` gives the part index a block moves with, or -1.
 */
async function blockDataMoves(store, lessonId, blockPart, newIds) {
  const moves = [];
  await mapBounded(BLOCK_DATA, 6, async (row) => {
    const prefix = `${row.root}${lessonId}/`;
    for (const key of await listBlobKeys(store, prefix)) {
      const block = key.slice(prefix.length).split('/')[0];
      const part = blockPart.get(block);
      if (part === undefined) continue;
      moves.push({ group: row.name, anonymous: Boolean(row.anonymous), block, part, from: key, to: newIds ? `${row.root}${newIds[part]}/${key.slice(prefix.length)}` : null });
    }
  });
  // voice_audio_due/{stamp}/{lesson}/{block}/{id}: the audio's deletion date, so the copy's audio_key is cleared too.
  for (const key of await listBlobKeys(store, VOICE_DUE_ROOT)) {
    const [, stamp, lesson, block, ...rest] = key.split('/');
    if (lesson !== lessonId || !blockPart.has(block)) continue;
    const part = blockPart.get(block);
    moves.push({ group: 'voice_due', block, part, from: key, to: newIds ? `${VOICE_DUE_ROOT}${stamp}/${newIds[part]}/${block}/${rest.join('/')}` : null });
  }
  return moves;
}

/** Copies one record. A record's own `lesson_id` becomes the new lesson. Returns false when it was gone. */
async function copyRecord(store, from, to, fromLesson, toLesson, extra = null) {
  let value;
  try {
    value = await store.get(from, STRONG);
  } catch {
    const raw = await store.get(from, { type: 'arrayBuffer', consistency: 'strong' });
    if (raw == null) return false;
    await store.set(to, raw);
    return true;
  }
  if (value == null) return false;
  const isRecord = value && typeof value === 'object' && !Array.isArray(value);
  let next = isRecord && value.lesson_id === fromLesson ? { ...value, lesson_id: toLesson } : value;
  if (isRecord && extra) next = { ...next, ...extra };
  await setJSON(store, to, next);
  return true;
}

/** Read, change, write only if nobody wrote in between; a few tries, then a 409. `fn` returns null for no change. */
async function swapJSON(store, key, fn) {
  for (let i = 0; i < 5; i += 1) {
    const row = typeof store.getWithMetadata === 'function' ? await store.getWithMetadata(key, STRONG) : { data: await read(store, key), etag: null };
    const current = row?.data ?? null;
    const next = fn(current == null ? null : structuredClone(current));
    if (next == null) return current;
    const options = row?.etag ? { onlyIfMatch: row.etag } : current == null ? { onlyIfNew: true } : undefined;
    const written = options ? await store.setJSON(key, next, options) : await setJSON(store, key, next);
    if (written?.modified !== false) return next;
  }
  reject(409, 'changed', 'Something changed while splitting. Reload and try again.');
}

const PIECE_OF_LESSON = (lessonId) => {
  const w = `w:${lessonId}:`;
  const v = `v:${lessonId}:`;
  const q = `q:${lessonId}:`;
  return { w, v, q, voiceSet: `v:${lessonId}` };
};

/** The feedback records in a class that belong to moved blocks (written work, viva sets, quiz answers). */
async function feedbackMoves(store, classIds, lessonId, ctx) {
  const { blockPart, voicePartSet, quizPart, newIds } = ctx;
  const p = PIECE_OF_LESSON(lessonId);
  const moves = [];
  await mapBounded(classIds, 4, async (classId) => {
    for (const key of await listBlobKeys(store, `piece_feedback/${classId}/`)) {
      const [, , studentId, piece] = key.split('/');
      if (!piece) continue;
      if (piece.startsWith(p.w)) {
        const block = piece.slice(p.w.length);
        if (!blockPart.has(block)) continue;
        const part = blockPart.get(block);
        moves.push({ kind: 'written', classId, studentId, part, from: key, to: newIds && pieceKey(classId, studentId, pieceId(newIds[part], block)) });
      } else if (piece === p.voiceSet) {
        // A viva set is one record per lesson (voice-submissions.mjs returnVoiceSubmission): each part with a voice block gets a copy.
        for (const part of voicePartSet) moves.push({ kind: 'voice', classId, studentId, part, from: key, to: newIds && pieceKey(classId, studentId, `v:${newIds[part]}`) });
      } else if (piece.startsWith(p.q) && quizPart >= 0) {
        const question = piece.slice(p.q.length);
        moves.push({ kind: 'quiz', classId, studentId, part: quizPart, from: key, to: newIds && pieceKey(classId, studentId, answerPiece(newIds[quizPart], question)) });
      }
    }
  });
  return moves;
}

async function workBlobs(store, lessonId, blockPart) {
  const prefix = `${WORK_ROOT}${lessonId}/`;
  const keys = (await listBlobKeys(store, prefix)).filter((k) => !k.slice(prefix.length).includes('/'));
  const rows = await mapBounded(keys, 8, (k) => read(store, k));
  return keys.map((key, i) => ({ owner: key.slice(prefix.length), record: rows[i] }))
    .filter((r) => r.record && typeof r.record.blocks === 'object' && r.record.blocks)
    .map((r) => ({ ...r, moved: Object.keys(r.record.blocks).filter((b) => blockPart.has(b)) }))
    .filter((r) => r.moved.length > 0);
}

async function doneRecords(store, classIds, lessonId) {
  const out = [];
  await mapBounded(classIds, 4, async (classId) => {
    for (const key of await listBlobKeys(store, `profile/${classId}/`)) {
      if (key.endsWith(doneMark(lessonId))) out.push({ classId, key });
    }
  });
  return out;
}

/** Everything the split touches, gathered once so preview and split count the same way. */
async function inventory(store, lesson, planned, newIds = null) {
  const blockPart = new Map();
  planned.parts.forEach((p, i) => { for (const id of p.ids) blockPart.set(id, i); });
  const voicePartSet = planned.parts.map((p, i) => ([...walkBlocks(p.blocks)].some((b) => b.block_type === 'voice') ? i : -1)).filter((i) => i >= 0);
  const classIds = await listClassIds(store);
  const [blockMoves, feedback, work, done, teacherMarks] = await Promise.all([
    blockDataMoves(store, lesson.id, blockPart, newIds),
    feedbackMoves(store, classIds, lesson.id, { blockPart, voicePartSet, quizPart: planned.quizPart, newIds }),
    workBlobs(store, lesson.id, blockPart),
    doneRecords(store, classIds, lesson.id),
    mapBounded(classIds, 4, async (classId) => ({ classId, marks: (await read(store, teacherMarksKey(classId))) ?? {} }))
  ]);
  return { blockPart, classIds, blockMoves, feedback, work, done, teacherMarks };
}

function counts(inv) {
  const students = new Set();
  for (const w of inv.work) students.add(w.record.class_id && w.record.student_id ? `${w.record.class_id}:${w.record.student_id}` : `owner:${w.owner}`);
  const handins = inv.blockMoves.filter((m) => m.group === 'handins');
  for (const h of handins) students.add(`handin:${h.from.split('/').pop()}`);
  // A hand-in names the student, not the class; fold those into students already known by id.
  const known = new Set([...inv.work].map((w) => w.record.student_id).filter(Boolean));
  for (const h of handins) if (known.has(h.from.split('/').pop())) students.delete(`handin:${h.from.split('/').pop()}`);
  const teacherDone = inv.teacherMarks.reduce((n, t) => n + Object.values(t.marks).filter((m) => m && typeof m === 'object' && m[inv.lessonId]).length, 0);
  return {
    students_with_work: students.size,
    handins: handins.length,
    marked: inv.feedback.filter((f) => f.kind === 'written' || f.kind === 'voice').length,
    done_marks: inv.done.length + teacherDone
  };
}

/* ── Actions ──────────────────────────────────────────────────────── */

async function listSplits(store, lessonId) {
  const keys = await listBlobKeys(store, `${SPLIT_ROOT}${lessonId}/`);
  const rows = (await mapBounded(keys, 8, (k) => read(store, k))).filter(Boolean);
  return rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

export async function splitStatus(store, lessonId) {
  const { lesson } = await loadLesson(store, lessonId);
  const sections = (lesson.blocks ?? []).filter(isSection).map((b) => ({ id: b.id, title: sectionTitle(b), has_quiz_questions: quizIdsIn([b]).length > 0 }));
  const whole = wholeLessonKind(lesson);
  const reason = whole ? MESSAGES.mode : sections.length < 2 ? 'This lesson needs at least two sections to split.' : null;
  const splits = (await listSplits(store, lessonId)).map((s) => ({ split_id: s.id, at: s.at, new_lessons: s.new_lessons ?? [], undone: s.undone === true }));
  return { sections, mode: lesson.pedagogical_mode ?? 'direct', can_split: !reason, ...(reason ? { reason } : {}), splits };
}

export async function splitPreview(store, lessonId, body) {
  const { lesson } = await loadLesson(store, lessonId);
  const parts = cleanParts(body?.parts);
  const planned = plan(lesson, parts);
  const problems = splitProblems(lesson, parts);
  if (problems.length === 0) problems.push(...(await storeProblems(store, lesson.id, planned)));
  const out = planned.parts.map((p) => ({ name: p.name, role: p.role, sections: p.blocks.map((b) => ({ id: b.id, title: sectionTitle(b) })) }));
  if (problems.length > 0) return { problems, parts: out, counts: { students_with_work: 0, handins: 0, marked: 0, done_marks: 0 }, notes: [] };
  const inv = await inventory(store, lesson, planned);
  inv.lessonId = lesson.id;
  const notes = [MESSAGES.calendar];
  if (inv.blockMoves.some((m) => m.anonymous)) notes.push(MESSAGES.anonymous);
  return { problems, parts: out, counts: counts(inv), notes };
}

/** Where the new lessons sit: straight after L, in part order, sequences between L and the next lesson. */
async function placeInUnit(store, lesson, newIds) {
  let sequences = [];
  await swapJSON(store, unitKey(lesson.unit_id), (unit) => {
    if (!unit) reject(404, 'not_found', 'Unit not found');
    const rest = (unit.lesson_ids ?? []).filter((id) => !newIds.includes(id));
    const at = rest.indexOf(lesson.id);
    const ids = at < 0 ? [...rest, ...newIds] : [...rest.slice(0, at + 1), ...newIds, ...rest.slice(at + 1)];
    return { ...unit, lesson_ids: ids, updated_at: new Date().toISOString() };
  });
  const unit = await read(store, unitKey(lesson.unit_id));
  const others = await mapBounded((unit?.lesson_ids ?? []).filter((id) => id !== lesson.id && !newIds.includes(id)), 8, (id) => read(store, draftLessonKey(id)));
  const from = typeof lesson.sequence === 'number' ? lesson.sequence : 0;
  const later = others.map((l) => l?.sequence).filter((s) => typeof s === 'number' && s > from);
  const to = later.length ? Math.min(...later) : from + 1;
  sequences = newIds.map((_, i) => from + ((to - from) * (i + 1)) / (newIds.length + 1));
  return sequences;
}

export async function splitLesson(store, lessonId, body, { env, deps = {}, now = () => Date.now() } = {}) {
  const { lesson, etag } = await loadLesson(store, lessonId);
  const parts = cleanParts(body?.parts);
  const planned = plan(lesson, parts);
  const problems = splitProblems(lesson, parts);
  if (problems.length === 0) problems.push(...(await storeProblems(store, lesson.id, planned)));
  if (problems.length > 0) reject(400, 'validation_error', problems[0]);
  const at = new Date(now()).toISOString();
  const splitId = newId('split');
  const wasPublished = Boolean(await read(store, publishedLessonKey(lesson.id)));
  const movedSections = new Set(parts.flatMap((p) => p.section_ids));
  const record = {
    id: splitId,
    lesson_id: lesson.id,
    at,
    parts: parts.map(({ name, role, section_ids, whole_class }) => ({ name, role, section_ids, whole_class })),
    original_blocks: lesson.blocks,
    moved_ids: planned.parts.map((p) => [...p.ids]),
    new_lesson_ids: [],
    new_lessons: [],
    quiz_moved: planned.quizPart >= 0,
    markbook_before: {},
    took_added: {},
    published: wasPublished,
    state: 'started',
    undone: false
  };
  const saveRecord = () => setJSON(store, splitKey(lesson.id, splitId), record);

  // 1. Take the sections out of L, only if nobody saved L since it was read.
  const remaining = lesson.blocks.filter((b) => !(isSection(b) && movedSections.has(b.id)));
  const nextLesson = { ...lesson, blocks: remaining, updated_at: at };
  await saveRecord();
  const wrote = etag ? await store.setJSON(draftLessonKey(lesson.id), nextLesson, { onlyIfMatch: etag }) : await setJSON(store, draftLessonKey(lesson.id), nextLesson);
  if (wrote?.modified === false) {
    await store.delete(splitKey(lesson.id, splitId));
    reject(409, 'changed', 'The lesson changed while splitting. Reload and try again.');
  }

  // 2. The new lessons, each straight after the last.
  for (const part of planned.parts) {
    const created = await createLessonRecord(store, { title: part.name, unit_id: lesson.unit_id, pedagogical_mode: lesson.pedagogical_mode ?? 'direct', after_lesson_id: lesson.id });
    record.new_lesson_ids.push(created.id);
    record.new_lessons.push({ id: created.id, title: created.title, role: part.role });
    await saveRecord();
  }
  const newIds = record.new_lesson_ids;
  const sequences = await placeInUnit(store, lesson, newIds);
  for (const [i, part] of planned.parts.entries()) {
    const created = await read(store, draftLessonKey(newIds[i]));
    const copied = Object.fromEntries(COPIED_FIELDS.filter((f) => lesson[f] !== undefined && lesson[f] !== null).map((f) => [f, structuredClone(lesson[f])]));
    const blocks = structuredClone(part.blocks).map((b) => fixComparativeSource(b, lesson.id, part.ids));
    await setJSON(store, draftLessonKey(newIds[i]), {
      ...created,
      ...copied,
      blocks,
      sequence: sequences[i],
      route_role: part.role,
      split_from: lesson.id,
      ...(part.role === 'core' ? {} : { branch_from: lesson.id }),
      updated_at: at
    });
  }

  // 3–6. Copy everything kept against the moved blocks.
  const inv = await inventory(store, lesson, planned, newIds);
  // A copied take shares its audio with the original; the delete path keeps shared audio (voice-submissions.mjs audioShared).
  await mapBounded(inv.blockMoves, 8, (m) => copyRecord(store, m.from, m.to, lesson.id, newIds[m.part], m.group === 'voice_submissions' ? { audio_shared_from: lesson.id } : null));
  await mapBounded(inv.feedback, 8, (m) => copyRecord(store, m.from, m.to, lesson.id, newIds[m.part]));
  await mapBounded(inv.work, 8, async (w) => {
    for (const [i, part] of planned.parts.entries()) {
      const mine = w.moved.filter((b) => part.ids.has(b));
      if (!mine.length) continue;
      await setJSON(store, `${WORK_ROOT}${newIds[i]}/${w.owner}`, { ...w.record, blocks: Object.fromEntries(mine.map((b) => [b, w.record.blocks[b]])) });
    }
  });
  await copyClassExamples(store, lesson.id, inv.blockPart, newIds);
  if (planned.quizPart >= 0) {
    const prefix = `${QUIZ_ROOT}${lesson.id}/`;
    const target = newIds[planned.quizPart];
    await mapBounded(await listBlobKeys(store, prefix), 8, (key) => copyRecord(store, key, `${QUIZ_ROOT}${target}/${key.slice(prefix.length)}`, lesson.id, target));
  }
  await copyRubricLedgers(store, inv.classIds, lesson.id, inv.blockPart, newIds, planned.quizPart);

  // 7. Done marks: a student who finished L has finished the new lessons too.
  await mapBounded(inv.done, 8, async ({ key }) => {
    const held = await read(store, key);
    if (!held) return;
    for (const id of newIds) await store.setJSON(key.slice(0, -lesson.id.length) + id, { ...held, split_from: lesson.id }, { onlyIfNew: true });
  });
  for (const { classId, marks } of inv.teacherMarks) {
    if (!Object.values(marks).some((m) => m?.[lesson.id])) continue;
    await swapJSON(store, teacherMarksKey(classId), (current) => {
      if (!current) return null;
      let changed = false;
      for (const mine of Object.values(current)) {
        if (!mine?.[lesson.id]) continue;
        for (const id of newIds) if (!mine[id]) { mine[id] = { ...mine[lesson.id] }; changed = true; }
      }
      return changed ? current : null;
    });
  }

  // 8. Markbooks.
  const wholeClass = planned.parts.map((p, i) => (p.whole_class && p.role !== 'core' ? i : -1)).filter((i) => i >= 0);
  const rosters = new Map();
  if (wholeClass.length) {
    for (const cls of await classesForLesson(store, lesson.id)) {
      const roster = await loadRoster(store, cls.id);
      if (roster) rosters.set(cls.id, roster.students.map((s) => s.id));
    }
  }
  for (const classId of inv.classIds) {
    const before = [];
    const added = [];
    const exists = await read(store, markbookKey(classId));
    if (!exists && !rosters.has(classId)) continue;
    await swapJSON(store, markbookKey(classId), (current) => {
      before.length = 0;
      added.length = 0;
      const parsed = MarkbookSchema.safeParse(current ?? {});
      // Checked before the split started; one broken since then stops here rather than leave columns behind.
      if (!parsed.success) reject(409, 'markbook_unreadable', MESSAGES.markbook('a class'));
      const book = parsed.data;
      let changed = false;
      for (const column of book.columns) {
        if (column.kind !== 'assessment' || column.piece?.lesson_id !== lesson.id || !inv.blockPart.has(column.piece.block_id)) continue;
        before.push({ column_id: column.id, piece: { ...column.piece } });
        column.piece = { ...column.piece, lesson_id: newIds[inv.blockPart.get(column.piece.block_id)] };
        changed = true;
      }
      for (const [student, took] of Object.entries(book.took)) {
        if (!took.includes(lesson.id)) continue;
        const more = newIds.filter((id) => !took.includes(id));
        if (more.length && took.length + more.length <= 200) { book.took[student] = [...took, ...more]; added.push(...more.map((id) => [student, id])); changed = true; }
      }
      for (const i of wholeClass) {
        for (const student of rosters.get(classId) ?? []) {
          const took = book.took[student] ?? [];
          if (took.includes(newIds[i]) || took.length >= 200) continue;
          book.took[student] = [...took, newIds[i]];
          added.push([student, newIds[i]]);
          changed = true;
        }
      }
      if (planned.quizPart >= 0 && book.hidden_quizzes.includes(lesson.id) && !book.hidden_quizzes.includes(newIds[planned.quizPart])) {
        book.hidden_quizzes = [...book.hidden_quizzes, newIds[planned.quizPart]];
        changed = true;
      }
      if (!changed) return null;
      book.updated_at = at;
      return book;
    });
    if (before.length) record.markbook_before[classId] = before;
  }

  // 9. Knowledge organiser: lines L ticked count for the new lessons too.
  await swapJSON(store, organiserKey(lesson.unit_id), (organiser) => {
    if (!organiser || !Array.isArray(organiser.sections)) return null;
    let changed = false;
    for (const section of organiser.sections) {
      for (const line of section?.lines ?? []) {
        if (line.lesson_id !== lesson.id && !(line.also_lesson_ids ?? []).includes(lesson.id)) continue;
        const more = newIds.filter((id) => id !== line.lesson_id && !(line.also_lesson_ids ?? []).includes(id));
        if (more.length) { line.also_lesson_ids = [...(line.also_lesson_ids ?? []), ...more]; changed = true; }
      }
    }
    return changed ? { ...organiser, updated_at: at } : null;
  });

  record.state = 'copied';
  await saveRecord();

  // 11. Republish if students had L.
  let published = false;
  if (wasPublished) {
    const results = [];
    for (const id of [lesson.id, ...newIds]) results.push(await publishLessonDraft(store, id, { env, deps }));
    published = results.every((r) => r.ok);
    record.publish_problems = results.filter((r) => !r.ok).map((r) => r.message);
  }
  record.state = 'done';
  await saveRecord();
  return { split_id: splitId, new_lessons: record.new_lessons, published };
}

/** A moved Comparative Judgement block that judged "this lesson": its source stayed in L, so it now names L. */
function fixComparativeSource(block, lessonId, movedIds) {
  for (const b of walkBlocks([block])) {
    if (b.block_type !== 'comparative_judgement') continue;
    const source = b.content?.source;
    if (!source || typeof source !== 'object') continue;
    if ((source.lesson_id ?? '') === '' && source.block_id && !movedIds.has(source.block_id)) source.lesson_id = lessonId;
  }
  return block;
}

/** Slots for moved blocks go to the new lesson's slot list; their answers in every teaching context come too. */
async function copyClassExamples(store, lessonId, blockPart, newIds) {
  const doc = await read(store, slotsKey(lessonId));
  const slots = Array.isArray(doc?.slots) ? doc.slots.filter((s) => s && blockPart.has(s.block_id)) : [];
  if (!slots.length) return;
  const slotPart = new Map(slots.map((s) => [s.id, blockPart.get(s.block_id)]));
  for (const [i, id] of newIds.entries()) {
    const mine = slots.filter((s) => slotPart.get(s.id) === i);
    if (mine.length) await setJSON(store, slotsKey(id), { ...doc, lesson_id: id, slots: mine, updated_at: new Date().toISOString() });
  }
  const prefix = `${ENTRIES_PREFIX}${lessonId}/`;
  await mapBounded(await listBlobKeys(store, prefix), 8, async (key) => {
    const [context, slotId] = key.slice(prefix.length).split('/');
    if (!slotPart.has(slotId)) return;
    const target = newIds[slotPart.get(slotId)];
    await copyRecord(store, key, `${ENTRIES_PREFIX}${target}/${context}/${slotId}`, lessonId, target);
  });
}

/** The markbook's rubric ledger: each moved piece gets an entry under the new lesson too. */
async function copyRubricLedgers(store, classIds, lessonId, blockPart, newIds, quizPart) {
  const p = PIECE_OF_LESSON(lessonId);
  const target = (piece) => {
    for (const prefix of [p.w, p.v]) {
      if (!piece.startsWith(prefix)) continue;
      const block = piece.slice(prefix.length);
      return blockPart.has(block) ? `${prefix[0]}:${newIds[blockPart.get(block)]}:${block}` : null;
    }
    if (piece.startsWith(p.q) && quizPart >= 0) return answerPiece(newIds[quizPart], piece.slice(p.q.length));
    return null;
  };
  for (const classId of classIds) {
    await swapJSON(store, ledgerKey(classId), (ledger) => {
      if (!ledger) return null;
      let changed = false;
      for (const pieces of Object.values(ledger)) {
        for (const [piece, entry] of Object.entries(pieces ?? {})) {
          const to = target(piece);
          if (!to || pieces[to]) continue;
          pieces[to] = { ...entry, lesson_id: to.split(':')[1] };
          changed = true;
        }
      }
      return changed ? ledger : null;
    });
  }
}

export async function undoSplit(store, lessonId, body, { env, deps = {}, now = () => Date.now() } = {}) {
  const splitId = typeof body?.split_id === 'string' ? body.split_id : '';
  if (!isSafeId(splitId)) reject(400, 'bad_request', 'Which split should be undone?');
  const record = await read(store, splitKey(lessonId, splitId));
  if (!record) reject(404, 'not_found', 'That split wasn’t found.');
  if (record.undone) reject(409, 'already_undone', 'That split has already been undone.');
  const { lesson, etag } = await loadLesson(store, lessonId);
  const movedSections = new Set(record.parts.flatMap((p) => p.section_ids));
  if ((lesson.blocks ?? []).some((b) => isSection(b) && movedSections.has(b.id))) {
    reject(409, 'conflict', 'This lesson already has those sections back, so the split can’t be undone.');
  }
  const at = new Date(now()).toISOString();
  const newIds = record.new_lesson_ids ?? [];

  // The moved sections go back where they were, taken from the new lesson if it still has them (edits made there come back).
  const latest = new Map();
  for (const id of newIds) {
    const draft = await read(store, draftLessonKey(id));
    for (const b of draft?.blocks ?? []) if (isSection(b) && movedSections.has(b.id)) latest.set(b.id, b);
  }
  const blocks = [...(lesson.blocks ?? [])];
  const original = record.original_blocks ?? [];
  for (const [i, b] of original.entries()) {
    if (!isSection(b) || !movedSections.has(b.id)) continue;
    let pos = 0;
    for (let j = i - 1; j >= 0; j -= 1) {
      const found = blocks.findIndex((x) => x?.id === original[j]?.id);
      if (found >= 0) { pos = found + 1; break; }
    }
    blocks.splice(pos, 0, latest.get(b.id) ?? b);
  }
  const wrote = etag ? await store.setJSON(draftLessonKey(lessonId), { ...lesson, blocks, updated_at: at }, { onlyIfMatch: etag }) : await setJSON(store, draftLessonKey(lessonId), { ...lesson, blocks, updated_at: at });
  if (wrote?.modified === false) reject(409, 'changed', 'The lesson changed while undoing. Reload and try again.');

  // The new lessons go to the trash (restorable), and out of the unit order.
  for (const id of newIds) {
    const draft = await read(store, draftLessonKey(id));
    if (!draft || draft.status === 'trashed') continue;
    await setJSON(store, draftLessonKey(id), { ...draft, status: 'trashed', previous_status: draft.status === 'archived' ? 'archived' : 'active', trashed_at: at, trash_reason: 'Split undone', updated_at: at });
  }
  await swapJSON(store, unitKey(lesson.unit_id), (unit) => {
    if (!unit || !(unit.lesson_ids ?? []).some((id) => newIds.includes(id))) return null;
    return { ...unit, lesson_ids: unit.lesson_ids.filter((id) => !newIds.includes(id)), updated_at: at };
  });

  // Markbooks: columns point back, the new lessons leave took and hidden quizzes.
  for (const classId of await listClassIds(store)) {
    if (!(await read(store, markbookKey(classId)))) continue;
    const before = record.markbook_before?.[classId] ?? [];
    await swapJSON(store, markbookKey(classId), (current) => {
      const parsed = MarkbookSchema.safeParse(current ?? {});
      if (!parsed.success) return null;
      const book = parsed.data;
      let changed = false;
      for (const { column_id, piece } of before) {
        const column = book.columns.find((c) => c.id === column_id);
        if (column?.kind === 'assessment' && column.piece && newIds.includes(column.piece.lesson_id) && column.piece.block_id === piece.block_id) {
          column.piece = piece;
          changed = true;
        }
      }
      for (const [student, took] of Object.entries(book.took)) {
        if (!took.some((id) => newIds.includes(id))) continue;
        book.took[student] = took.filter((id) => !newIds.includes(id));
        changed = true;
      }
      if (book.hidden_quizzes.some((id) => newIds.includes(id))) {
        book.hidden_quizzes = book.hidden_quizzes.filter((id) => !newIds.includes(id));
        changed = true;
      }
      if (!changed) return null;
      book.updated_at = at;
      return book;
    });
  }
  await swapJSON(store, organiserKey(lesson.unit_id), (organiser) => {
    if (!organiser || !Array.isArray(organiser.sections)) return null;
    let changed = false;
    for (const section of organiser.sections) {
      for (const line of section?.lines ?? []) {
        if (!(line.also_lesson_ids ?? []).some((id) => newIds.includes(id))) continue;
        line.also_lesson_ids = line.also_lesson_ids.filter((id) => !newIds.includes(id));
        if (!line.also_lesson_ids.length) delete line.also_lesson_ids;
        changed = true;
      }
    }
    return changed ? { ...organiser, updated_at: at } : null;
  });

  if (await read(store, publishedLessonKey(lessonId))) await publishLessonDraft(store, lessonId, { env, deps });
  await setJSON(store, splitKey(lessonId, splitId), { ...record, undone: true, undone_at: at });
  return { restored: true };
}

export async function lessonSplitAction(store, lessonId, body, options = {}) {
  const action = body?.action;
  if (action === 'status') return splitStatus(store, lessonId);
  if (action === 'preview') return splitPreview(store, lessonId, body);
  if (action === 'split') return splitLesson(store, lessonId, body, options);
  if (action === 'undo') return undoSplit(store, lessonId, body, options);
  reject(400, 'bad_request', 'Unknown action.');
}
