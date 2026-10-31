/**
 * Written work in a lesson: what a student types into question sets, their
 * frames and lenses, sent as they write so the teacher sees it whether or not
 * the student finishes.
 *
 *   work/{lesson}/{owner}   { blocks: { [block]: { [part]: { [field]: text } } }, at, class_id, student_id }
 *
 * `part` names the piece of the block the page keeps (answers, format.*,
 * lens.*, kaplan.*, step.N); each save replaces that one part. A `step.N`
 * part is question N's next-step pick, one JSON field `pick`:
 * `{ code_id, line, start, end }` (the sentence the student tapped) or
 * `{ code_id, line, skipped: true }`. Hand-in freezes it with the answers. Students are known the
 * way the quiz knows them (class initials); `owner` is the same hash. A class
 * with no list records nothing, since nobody can be told apart. No model is
 * called here.
 */
import { isSafeId } from './class-examples.mjs';
import { publishedLessonKey } from './teaching-blobs.mjs';
import { listBlobKeys, mapBounded } from './blobs-list.mjs';
import { claimFor, claimInitials, loadRoster } from './class-claims.mjs';
import { deviceHash, read, reject, walkBlocks } from './question-drop.mjs';
import { readBook } from './markbook.mjs';
import { cleanStepPick } from './next-steps.mjs';

export const WORK_LIMITS = { blocks: 60, parts: 6, steps: 60, fields: 60, field: 80, text: 4000 };
const PART = /^(answers|step\.\d{1,3}|(format|lens|kaplan)\.[A-Za-z0-9_-]{1,60})$/;
const STEP_PART = /^step\.(\d{1,3})$/;
const FIELD = /^[A-Za-z0-9_.:-]{1,80}$/;

const workPrefix = (lesson) => `work/${lesson}/`;
const workKey = (lesson, owner) => `work/${lesson}/${owner}`;
export const handinKey = (lesson, block, student) => `work_handins/${lesson}/${block}/${student}`;
export const pieceId = (lesson, block) => `w:${lesson}:${block}`;
export const workOwner = (classId, studentId) => deviceHash(`student:${classId}:${studentId}`);

/** Blocks in this lesson that the class's Markbook links to an assessment column. */
async function handinBlocks(store, classId, lessonId) {
  const { book } = await readBook(store, classId);
  return book.columns.filter((c) => c.kind === 'assessment' && c.piece?.lesson_id === lessonId).map((c) => c.piece.block_id);
}

/** Blocks a student can see in the published lesson, by id. */
async function studentBlocks(store, lessonId) {
  if (!isSafeId(lessonId)) reject(404, 'not_found', 'Lesson not found.');
  const lesson = await read(store, publishedLessonKey(lessonId));
  if (!lesson) reject(404, 'not_found', 'Lesson not found.');
  const blocks = new Map();
  for (const b of walkBlocks(lesson.blocks)) {
    if (typeof b.id === 'string' && b.visibility !== 'teacher_only') blocks.set(b.id, b);
  }
  return { lesson, blocks };
}

/** The fields of one part: text only, trimmed to size. Null when there is nothing to keep. */
function cleanFields(fields) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return null;
  const out = {};
  for (const [name, value] of Object.entries(fields)) {
    if (Object.keys(out).length >= WORK_LIMITS.fields) break;
    if (!FIELD.test(name) || typeof value !== 'string') continue;
    const text = value.slice(0, WORK_LIMITS.text);
    if (text.trim()) out[name] = text;
  }
  return out;
}

/**
 * A next-step pick for question `index` of a block, checked against the answer
 * it points into (when that is saved). Returns the fields to keep, or refuses.
 */
function cleanStepFields(block, index, fields, answers) {
  const question = Array.isArray(block?.content?.questions) ? block.content.questions[index] : null;
  if (!question || typeof question.id !== 'string') reject(400, 'bad_part', 'That answer can’t be saved.');
  const keys = Object.keys(fields);
  // An empty part clears the pick, as with any other part.
  if (!keys.length) return {};
  let raw = null;
  try { raw = keys.length === 1 && typeof fields.pick === 'string' ? JSON.parse(fields.pick) : null; } catch { raw = null; }
  const answer = typeof answers?.[question.id] === 'string' ? answers[question.id] : null;
  const pick = cleanStepPick(raw, answer, WORK_LIMITS.text);
  if (!pick) reject(400, 'bad_step', 'That step can’t be saved.');
  return { pick: JSON.stringify(pick) };
}

export async function workAction(store, lessonId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action ?? 'status';
  if (!['status', 'claim', 'save', 'handin'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const { blocks } = await studentBlocks(store, lessonId);
  const roster = await loadRoster(store, body.class_id);
  if (!roster) reject(404, 'need_class', 'Open this lesson from your class page.');
  // A class with no list: nobody can be told apart, so nothing is recorded (it could be flooded).
  if (!roster.students.length) {
    if (action === 'save') reject(403, 'no_list', 'Your teacher hasn’t added a class list yet.');
    return { need: null, anonymous: true };
  }
  const student = action === 'claim'
    ? await claimInitials(store, roster, body.class_token, body.initials)
    : await claimFor(store, roster, body.class_token);
  if (!student) {
    if (action === 'save') reject(403, 'need_initials', 'Type your initials first.');
    return { need: 'initials' };
  }
  const identity = { need: null, initials: student.initials };
  const marked = await handinBlocks(store, roster.cls.id, lessonId);
  if (action === 'status' || action === 'claim') return { ...identity, ...(marked.length ? { handin_blocks: marked } : {}) };

  if (action === 'handin') {
    if (typeof body.block_id !== 'string' || !marked.includes(body.block_id)) reject(400, 'not_marked', 'This part of the lesson isn’t set to be handed in.');
    const feedback = await read(store, `piece_feedback/${roster.cls.id}/${student.id}/${pieceId(lessonId, body.block_id)}`);
    if (feedback?.status === 'returned') reject(409, 'returned', 'This has already been returned. Ask your teacher to take it back first.');
    const kept = await read(store, workKey(lessonId, workOwner(roster.cls.id, student.id)));
    const text = kept?.blocks?.[body.block_id];
    if (!text || !Object.keys(text).length) reject(400, 'empty', 'Write something before you hand it in.');
    const handed_in_at = new Date().toISOString();
    await store.setJSON(handinKey(lessonId, body.block_id, student.id), { class_id: roster.cls.id, student_id: student.id, text, handed_in_at });
    return { ...identity, handed_in_at };
  }

  if (typeof body.block_id !== 'string' || !blocks.has(body.block_id)) reject(400, 'bad_block', 'That part of the lesson has changed. Reload the page.');
  if (typeof body.part !== 'string' || !PART.test(body.part)) reject(400, 'bad_part', 'That answer can’t be saved.');
  let fields = cleanFields(body.fields);
  if (!fields) reject(400, 'bad_request', 'That answer can’t be saved.');

  const key = workKey(lessonId, workOwner(roster.cls.id, student.id));
  const kept = (await read(store, key)) ?? {};
  const saved = kept.blocks && typeof kept.blocks === 'object' ? { ...kept.blocks } : {};
  const parts = { ...(saved[body.block_id] ?? {}) };
  const stepIndex = STEP_PART.exec(body.part)?.[1];
  if (stepIndex !== undefined) fields = cleanStepFields(blocks.get(body.block_id), Number(stepIndex), fields, parts.answers);
  if (Object.keys(fields).length) parts[body.part] = fields;
  else delete parts[body.part];
  if (!Object.keys(parts).length) delete saved[body.block_id];
  else {
    if (!(body.block_id in saved) && Object.keys(saved).length >= WORK_LIMITS.blocks) reject(400, 'too_many', 'This lesson has as much saved as it can hold.');
    // Step picks, one per question, are counted apart from the writing parts.
    const stepParts = Object.keys(parts).filter((p) => STEP_PART.test(p)).length;
    if (Object.keys(parts).length - stepParts > WORK_LIMITS.parts || stepParts > WORK_LIMITS.steps) reject(400, 'too_many', 'That answer can’t be saved.');
    saved[body.block_id] = parts;
  }
  const at = new Date().toISOString();
  await store.setJSON(key, { blocks: saved, at, class_id: roster.cls.id, student_id: student.id });
  return { ...identity, saved: true, at };
}

/** What the teacher needs to read a block's fields: its title, and question prompts by id. */
function blockLabels(block) {
  const c = block.content ?? {};
  const title = typeof c.title === 'string' && c.title.trim() ? c.title.trim() : '';
  const prompts = {};
  for (const q of Array.isArray(c.questions) ? c.questions : []) {
    if (q && typeof q.id === 'string' && typeof q.prompt === 'string') prompts[q.id] = q.prompt;
  }
  return { id: block.id, block_type: block.block_type, title, prompts };
}

/**
 * One lesson's written work for the students on a class list, for the
 * markbook. Null when nobody has written anything. Blocks keep lesson order.
 */
export async function classWork(store, lessonId, classId, studentIds) {
  if (!studentIds.length || !isSafeId(lessonId)) return null;
  const owners = new Map(studentIds.map((id) => [workOwner(classId, id), id]));
  const keys = (await listBlobKeys(store, workPrefix(lessonId))).filter((key) => owners.has(key.slice(workPrefix(lessonId).length)));
  if (!keys.length) return null;
  const rows = await mapBounded(keys, 8, async (key) => [owners.get(key.slice(workPrefix(lessonId).length)), await read(store, key)]);
  const students = {};
  const used = new Set();
  for (const [studentId, row] of rows) {
    // A record stamped for someone else, or with nothing in it, is skipped.
    if (!row?.blocks || row.class_id !== classId || row.student_id !== studentId || !Object.keys(row.blocks).length) continue;
    students[studentId] = { at: row.at, blocks: row.blocks };
    for (const id of Object.keys(row.blocks)) used.add(id);
  }
  if (!Object.keys(students).length) return null;
  const lesson = await read(store, publishedLessonKey(lessonId));
  const blocks = [];
  for (const b of walkBlocks(lesson?.blocks)) if (used.has(b.id)) blocks.push(blockLabels(b));
  const first = Object.values(students).reduce((min, s) => (!min || s.at < min ? s.at : min), null);
  return { lesson_id: lessonId, title: typeof lesson?.title === 'string' && lesson.title ? lesson.title : 'Lesson', first_at: first, blocks, students };
}
