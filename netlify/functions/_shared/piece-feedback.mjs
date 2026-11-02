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
import { draftKey, handinKey, pieceId, stepPicks, writingParts } from './lesson-work.mjs';
import { publishedLessonKey } from './teaching-blobs.mjs';
import { listBlobKeys } from './blobs-list.mjs';
import { recordRubric } from './rubric.mjs';

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
export function cleanTags(raw, text, codes) {
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

/** Every code on a piece across its drafts: for each code and sign, the most it appeared on any one draft. */
export function unionTags(row) {
  const most = new Map();
  for (const list of [row?.earlier_tags ?? [], row?.tags ?? []]) {
    const here = new Map();
    for (const t of list) {
      const key = `${t.code_id}|${Boolean(t.positive)}`;
      here.set(key, (here.get(key) ?? 0) + 1);
    }
    for (const [key, n] of here) most.set(key, Math.max(most.get(key) ?? 0, n));
  }
  return [...most].flatMap(([key, n]) => {
    const [code_id, positive] = key.split('|');
    return Array.from({ length: n }, () => ({ code_id, positive: positive === 'true' }));
  });
}

const WORD = /[\p{L}\p{N}'’]/u;

/** A redraft's scope: 'whole', or a section grown to the whole words it touches. Refuses a range off the frozen text. */
export function cleanScope(raw, text) {
  if (raw === 'whole') return 'whole';
  const body = typeof raw?.part === 'string' && !raw.part.startsWith('step.') ? text?.[raw.part]?.[raw.field] : undefined;
  let start = Math.floor(Number(raw?.start));
  let end = Math.floor(Number(raw?.end));
  if (typeof body !== 'string' || !(start >= 0) || !(end > start) || end > body.length) reject(400, 'bad_section', 'That section can’t be used. Select it again.');
  while (start > 0 && WORD.test(body[start - 1])) start -= 1;
  while (end < body.length && WORD.test(body[end])) end += 1;
  return { part: raw.part, field: raw.field, start, end };
}

/** The drafts before `upTo`, oldest first. */
export async function readDrafts(store, lessonId, blockId, studentId, upTo) {
  const rows = [];
  for (let n = 1; n < upTo; n += 1) {
    const row = await read(store, draftKey(lessonId, blockId, studentId, n));
    if (row) rows.push({ n, ...row, text: writingParts(row.text) });
  }
  return rows;
}

/** The growth codes on each of a student's returned pieces, oldest first, for the "come up again" warning. */
export async function recentCodes(store, classId, studentId, exceptKey) {
  const recent = [];
  for (const k of await listBlobKeys(store, piecePrefix(classId, studentId))) {
    const row = await read(store, k);
    if ((row?.status === 'returned' || row?.draft > 1) && k !== exceptKey) recent.push({ at: row.returned_at ?? row.first?.returned_at, codes: [...new Set(unionTags(row).filter((t) => !t.positive).map((t) => t.code_id))] });
  }
  recent.sort((a, b) => (a.at < b.at ? -1 : 1));
  return recent;
}

const statusOf = (handin, feedback) => {
  if (!handin) return 'not_in';
  if (feedback?.status === 'returned') return feedback.redraft ? 'redraft_asked' : 'returned';
  if (!feedback) return 'waiting';
  // A redraft just sent has no marking on it yet.
  return feedback.sent_at && feedback.sent_at === feedback.updated_at ? 'waiting' : 'marking';
};

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
      students.push({ id: s.id, initials: s.initials, name: s.name, handed_in_at: handin?.handed_in_at ?? null, status: statusOf(handin, feedback), seen_at: feedback?.seen_at ?? null, draft: feedback?.draft ?? 1, asked_at: feedback?.redraft?.asked_at ?? null, sent_scope: feedback?.sent_scope ?? null });
    }
    return { column, students };
  }

  const student = studentOf(roster, body.student_id);
  const key = pieceKey(classId, student.id, piece);
  const [handin, feedback, codes] = await Promise.all([read(store, handinKey(lesson_id, block_id, student.id)), read(store, key), readFeedbackCodes(store).then((all) => all.filter((c) => codeApplies(c, { kind: 'written' })))]);
  if (!handin) reject(409, 'not_in', 'This student hasn’t handed this in yet.');

  if (action === 'load') {
    const recent = await recentCodes(store, classId, student.id, key);
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
    const draft = feedback?.draft ?? 1;
    const drafts = draft > 1 ? await readDrafts(store, lesson_id, block_id, student.id, draft) : [];
    return { column: named, student: { id: student.id, initials: student.initials, name: student.name }, text: writingParts(handin.text), ...(steps.length ? { steps } : {}), handed_in_at: handin.handed_in_at, feedback, mark: book.marks?.[column.id]?.[student.id] ?? null, codes, recent_codes: recent.map((r) => r.codes), draft, drafts: drafts.map(({ n, text, tags, comment, returned_at, steps, scope }) => ({ n, text, tags: tags ?? [], comment: comment ?? '', returned_at, steps: steps ?? {}, scope: scope ?? null })), ...(feedback?.redraft ? { redraft: feedback.redraft } : {}) };
  }

  const now = new Date().toISOString();
  if (action === 'save') {
    // Left out of the body, a rubric stays as it was.
    const saved = body.rubric === undefined
      ? { rubric: feedback?.rubric ?? null, deep: null, blocked: [] }
      : await recordRubric(store, { class_id: classId, student_id: student.id, piece, lesson_id, title: column.title, column_id: column.id, writing_key: block_id, raw: body.rubric, prior: feedback?.rubric ?? null, today: body.today });
    const next = {
      kind: 'written', title: column.title, ...(column.piece.short ? { short: column.piece.short } : {}), lesson_id, block_id, column_id: column.id,
      tags: cleanTags(body.tags, handin.text, codes),
      comment: typeof body.comment === 'string' ? body.comment.trim().slice(0, MAX_COMMENT) : '',
      ...(saved.rubric ? { rubric: saved.rubric } : {}),
      status: feedback?.status === 'returned' ? 'returned' : 'draft',
      ...(feedback?.returned_at ? { returned_at: feedback.returned_at } : {}),
      ...(feedback?.seen_at ? { seen_at: feedback.seen_at } : {}),
      ...(feedback?.redraft ? { redraft: feedback.redraft } : {}),
      ...(feedback?.draft ? { draft: feedback.draft } : {}),
      ...(feedback?.first ? { first: feedback.first } : {}),
      ...(feedback?.earlier_tags ? { earlier_tags: feedback.earlier_tags } : {}),
      ...(feedback?.sent_at ? { sent_at: feedback.sent_at } : {}),
      ...(feedback?.sent_scope ? { sent_scope: feedback.sent_scope } : {}),
      updated_at: now
    };
    await store.setJSON(key, next);
    if (body.steps && typeof body.steps === 'object') {
      const mark = book.marks?.[column.id]?.[student.id] ?? { criteria: {} };
      await markbookAction(store, classId, { action: 'set_mark', column_id: column.id, student_id: student.id, mark: { ...mark, steps: body.steps } });
    }
    return { feedback: next, ...(saved.deep ? { deep: saved.deep } : {}), ...(saved.blocked.length ? { blocked: saved.blocked } : {}) };
  }

  if (!feedback) reject(409, 'not_marked', 'Mark this piece before you return it.');
  const { redraft: _asked, ...kept } = feedback;
  if (action === 'return') {
    const ask = body.redraft ? { redraft: { scope: cleanScope(body.redraft.scope, handin.text), asked_at: now } } : {};
    const next = { ...kept, ...ask, status: 'returned', returned_at: now, updated_at: now };
    await store.setJSON(key, next);
    return { feedback: next };
  }
  const { returned_at: _at, seen_at: _seen, ...rest } = kept;
  const next = { ...rest, status: 'draft', updated_at: now };
  await store.setJSON(key, next);
  return { feedback: next };
}
