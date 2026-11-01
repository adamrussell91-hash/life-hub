/**
 * The teacher's feedback on one handed-in piece: codes on the student's
 * words, a comment, and the return. Rubric steps go on the Markbook mark, so
 * the Markbook stays the gradebook.
 *
 *   piece_feedback/{class}/{student}/{piece}   piece = w:{lesson}:{block} | v:{lesson}
 */
import { randomBytes } from 'node:crypto';
import { loadRoster } from './class-claims.mjs';
import { markbookAction, readBook } from './markbook.mjs';
import { readFeedbackCodes } from './feedback-codes.mjs';
import { codeApplies } from './progress-patterns.mjs';
import { readStoredSkills } from './skills-continuum.mjs';
import { read, reject, walkBlocks } from './question-drop.mjs';
import { handinKey, pieceId, stepPicks, writingParts } from './lesson-work.mjs';
import { publishedLessonKey } from './teaching-blobs.mjs';
import { listBlobKeys } from './blobs-list.mjs';

export const pieceKey = (classId, studentId, piece) => `piece_feedback/${classId}/${studentId}/${piece}`;
export const piecePrefix = (classId, studentId) => `piece_feedback/${classId}/${studentId}/`;
const MAX_TAGS = 60;
const MAX_NOTE = 300;
const MAX_COMMENT = 2000;

async function context(store, classId, body) {
  const roster = await loadRoster(store, classId);
  if (!roster) reject(404, 'not_found', 'Class not found.');
  const { book } = await readBook(store, classId);
  const column = book.columns.find((c) => c.id === body.column_id && c.kind === 'assessment' && c.piece);
  if (!column) reject(404, 'no_column', 'That task isn’t linked to a lesson.');
  return { roster, book, column, piece: pieceId(column.piece.lesson_id, column.piece.block_id) };
}

function studentOf(roster, id) {
  return roster.students.find((s) => s.id === id) ?? reject(404, 'no_student', 'That student isn’t on this class list.');
}

/** Tags that land inside the frozen text, with known codes. */
function cleanTags(raw, text, codes) {
  if (!Array.isArray(raw)) return [];
  const known = new Set(codes.map((c) => c.id));
  const out = [];
  for (const t of raw.slice(0, MAX_TAGS)) {
    const body = text?.[t?.part]?.[t?.field];
    const start = Math.floor(Number(t?.start));
    const end = Math.floor(Number(t?.end));
    if (typeof body !== 'string' || !known.has(t?.code_id) || !(start >= 0) || !(end > start) || end > body.length) continue;
    const tag = { id: typeof t.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(t.id) ? t.id : `t_${randomBytes(4).toString('hex')}`, code_id: t.code_id, positive: t.positive === true, part: t.part, field: t.field, start, end, quote: body.slice(start, end) };
    const note = typeof t.note === 'string' ? t.note.trim().slice(0, MAX_NOTE) : '';
    if (note) tag.note = note;
    out.push(tag);
  }
  return out;
}

const statusOf = (handin, feedback) => (!handin ? 'not_in' : feedback?.status === 'returned' ? 'returned' : feedback ? 'marking' : 'waiting');

export async function piecesAction(store, classId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action;
  if (!['list', 'load', 'save', 'return', 'take_back'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const { roster, book, column, piece } = await context(store, classId, body);
  const { lesson_id, block_id } = column.piece;

  if (action === 'list') {
    const students = [];
    for (const s of roster.students) {
      const [handin, feedback] = await Promise.all([read(store, handinKey(lesson_id, block_id, s.id)), read(store, pieceKey(classId, s.id, piece))]);
      students.push({ id: s.id, initials: s.initials, name: s.name, handed_in_at: handin?.handed_in_at ?? null, status: statusOf(handin, feedback), seen_at: feedback?.seen_at ?? null });
    }
    return { column, students };
  }

  const student = studentOf(roster, body.student_id);
  const key = pieceKey(classId, student.id, piece);
  const [handin, feedback, codes] = await Promise.all([read(store, handinKey(lesson_id, block_id, student.id)), read(store, key), readFeedbackCodes(store).then((all) => all.filter((c) => codeApplies(c, { kind: 'written' })))]);
  if (!handin) reject(409, 'not_in', 'This student hasn’t handed this in yet.');

  if (action === 'load') {
    const recent = [];
    for (const k of await listBlobKeys(store, piecePrefix(classId, student.id))) {
      const row = await read(store, k);
      if (row?.status === 'returned' && k !== key) recent.push({ at: row.returned_at, codes: [...new Set((row.tags ?? []).filter((t) => !t.positive).map((t) => t.code_id))] });
    }
    recent.sort((a, b) => (a.at < b.at ? -1 : 1));
    // Skill criteria show the continuum's name for the sub-strand, not its id.
    const continuum = column.criteria.some((c) => c.skill) ? await readStoredSkills(store).catch(() => null) : null;
    const skillName = (ref) => {
      const [strandId, subId] = String(ref).split('.');
      return continuum?.strands.find((s) => s.strand === strandId)?.sub_strands.find((s) => s.id === subId)?.name ?? ref;
    };
    const named = { ...column, criteria: column.criteria.map((c) => (c.skill ? { ...c, skill_name: skillName(c.skill) } : c)) };
    // The student's own next-step picks, placed on their answers by the lesson's questions.
    const hasSteps = Object.keys(handin.text ?? {}).some((p) => p.startsWith('step.'));
    const lesson = hasSteps ? await read(store, publishedLessonKey(lesson_id)) : null;
    const block = lesson ? [...walkBlocks(lesson.blocks)].find((b) => b.id === block_id) : null;
    const steps = block ? stepPicks(handin.text, block) : [];
    return { column: named, student: { id: student.id, initials: student.initials, name: student.name }, text: writingParts(handin.text), ...(steps.length ? { steps } : {}), handed_in_at: handin.handed_in_at, feedback, mark: book.marks?.[column.id]?.[student.id] ?? null, codes, recent_codes: recent.map((r) => r.codes) };
  }

  const now = new Date().toISOString();
  if (action === 'save') {
    const next = {
      kind: 'written', title: column.title, ...(column.piece.short ? { short: column.piece.short } : {}), lesson_id, block_id, column_id: column.id,
      tags: cleanTags(body.tags, handin.text, codes),
      comment: typeof body.comment === 'string' ? body.comment.trim().slice(0, MAX_COMMENT) : '',
      status: feedback?.status === 'returned' ? 'returned' : 'draft',
      ...(feedback?.returned_at ? { returned_at: feedback.returned_at } : {}),
      ...(feedback?.seen_at ? { seen_at: feedback.seen_at } : {}),
      updated_at: now
    };
    await store.setJSON(key, next);
    if (body.steps && typeof body.steps === 'object') {
      const mark = book.marks?.[column.id]?.[student.id] ?? { criteria: {} };
      await markbookAction(store, classId, { action: 'set_mark', column_id: column.id, student_id: student.id, mark: { ...mark, steps: body.steps } });
    }
    return { feedback: next };
  }

  if (!feedback) reject(409, 'not_marked', 'Mark this piece before you return it.');
  const next = action === 'return'
    ? { ...feedback, status: 'returned', returned_at: now, updated_at: now }
    : (({ returned_at, seen_at, ...rest }) => ({ ...rest, status: 'draft', updated_at: now }))(feedback);
  await store.setJSON(key, next);
  return { feedback: next };
}
