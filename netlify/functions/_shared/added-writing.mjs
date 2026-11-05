/**
 * Writing a student handed over outside the app (an emailed draft, a paper
 * copy), added by the teacher onto that student and marked like handed-in
 * writing. It hangs off the student, never a Markbook task, so ten drafts from
 * one student add no columns. It feeds the unit the teacher picks through the
 * rubric, the same way a tagged writing block does.
 *
 *   piece_feedback/{class}/{student}/t:{id}   id = aw_ + 8 hex
 *
 * The row keeps its own copy of the words, as quiz answers do (to-mark-flow.mjs),
 * so Returned work, the profile and Patterns read it with no changes.
 */
import { randomBytes } from 'node:crypto';
import { loadRoster } from './class-claims.mjs';
import { readFeedbackCodes } from './feedback-codes.mjs';
import { codeApplies } from './progress-patterns.mjs';
import { cleanTags, pieceKey, piecePrefix, recentCodes } from './piece-feedback.mjs';
import { read, reject } from './question-drop.mjs';
import { forgetRubric, recordRubric } from './rubric.mjs';
import { listBlobKeys } from './blobs-list.mjs';
import { unitKey } from './teaching-blobs.mjs';

export const ADDED_PREFIX = 't:';
const PIECE_ID = /^t:aw_[a-f0-9]{8}$/;
const UNIT_ID = /^[A-Za-z0-9_-]{1,160}$/;
export const MAX_TEXT = 20000;
const MAX_TITLE = 120;
const MAX_COMMENT = 2000;
const ACTIONS = ['context', 'add', 'list', 'load', 'save', 'return', 'take_back', 'delete'];

/* The deep tags a block carries (apps/teaching/src/deep/block-tags.ts), checked the same way. */
const PIECE = /^kp_[a-z0-9]{4,16}$/;
const DU = /^du_[a-z0-9]{4,16}$/;
const SKILL = /^[a-z]{3,20}\.[a-z-]{2,40}$/;
const PLACED = new Set(['2a', '2b', '3', '4']);
const STEPS_MAX = 8;
const CHECKS = { max: 6, length: 200 };

const uniq = (list, test, max = Infinity) => [...new Set((Array.isArray(list) ? list : []).filter((x) => typeof x === 'string' && test.test(x)))].slice(0, max);

/** Only the deep tags a rubric reads: the steps it is evidence for, the pieces it expects, its skills. */
export function cleanSettings(raw) {
  const s = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const steps = [];
  for (const row of Array.isArray(s.deep_step) ? s.deep_step : []) {
    if (steps.length >= STEPS_MAX || !DU.test(row?.du) || !PLACED.has(row?.step)) continue;
    if (steps.some((x) => x.du === row.du && x.step === row.step)) continue;
    const checks = (Array.isArray(row.checks) ? row.checks : []).filter((c) => typeof c === 'string' && c.trim()).map((c) => c.trim().slice(0, CHECKS.length)).slice(0, CHECKS.max);
    steps.push({ du: row.du, step: row.step, checks });
  }
  const out = {};
  if (steps.length) out.deep_step = steps;
  const targets = uniq(s.deep_targets, PIECE, 3);
  if (targets.length) out.deep_targets = targets;
  const skills = uniq(s.deep_skills, SKILL);
  if (skills.length) out.deep_skills = skills;
  return out;
}

async function rosterOf(store, classId) {
  return (await loadRoster(store, classId)) ?? reject(404, 'not_found', 'Class not found.');
}

const studentIn = (roster, id) => roster.students.find((s) => s.id === id) ?? reject(404, 'no_student', 'That student isn’t on this class list.');

function pieceOf(body) {
  const piece = String(body.piece ?? '');
  return PIECE_ID.test(piece) ? piece : reject(400, 'bad_piece', 'That piece can’t be found.');
}

/** The units this class teaches, current first, with titles. */
async function classUnits(store, cls) {
  const ids = [...new Set([cls.current_unit_id, ...(cls.active_unit_ids ?? [])].filter((id) => typeof id === 'string' && UNIT_ID.test(id)))];
  const units = await Promise.all(ids.map(async (id) => {
    const unit = await read(store, unitKey(id));
    return unit ? { id, title: unit.title || 'Unit' } : null;
  }));
  return units.filter(Boolean);
}

const writtenCodes = (store) => readFeedbackCodes(store).then((all) => all.filter((c) => codeApplies(c, { kind: 'written' })));

/** Every added piece in the class, oldest first. */
async function classPieces(store, roster) {
  const out = [];
  for (const student of roster.students) {
    const prefix = piecePrefix(roster.cls.id, student.id);
    const keys = (await listBlobKeys(store, prefix)).filter((k) => k.slice(prefix.length).startsWith(ADDED_PREFIX));
    for (const key of keys) {
      const row = await read(store, key);
      if (row?.added) out.push({ student, piece: key.slice(prefix.length), row });
    }
  }
  return out.sort((a, b) => String(a.row.added_at).localeCompare(String(b.row.added_at)));
}

export async function addedWritingAction(store, classId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const { action } = body;
  if (!ACTIONS.includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const roster = await rosterOf(store, classId);

  if (action === 'context') {
    return {
      class: { id: roster.cls.id, title: roster.cls.display_name || roster.cls.title || 'Class' },
      students: roster.students.map(({ id, initials, name }) => ({ id, initials, name })),
      units: await classUnits(store, roster.cls),
      current_unit_id: roster.cls.current_unit_id ?? roster.cls.active_unit_ids?.[0] ?? null
    };
  }

  if (action === 'list') {
    const rows = await classPieces(store, roster);
    return {
      pieces: rows.filter(({ row }) => row.status !== 'returned').map(({ student, piece, row }) => ({
        piece, student_id: student.id, initials: student.initials, title: row.title, status: row.status, added_at: row.added_at
      }))
    };
  }

  const student = studentIn(roster, body.student_id);
  const now = new Date().toISOString();

  if (action === 'add') {
    const title = typeof body.title === 'string' ? body.title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE) : '';
    if (!title) reject(400, 'no_title', 'Give the piece a title.');
    const text = typeof body.text === 'string' ? body.text.replace(/\r\n?/g, '\n').trim() : '';
    if (!text) reject(400, 'no_text', 'Paste the writing first.');
    if (text.length > MAX_TEXT) reject(400, 'too_long', `That’s too long. Paste up to ${MAX_TEXT.toLocaleString('en-AU')} characters.`);
    const unitId = typeof body.unit_id === 'string' && UNIT_ID.test(body.unit_id) ? body.unit_id : '';
    if (!unitId || !(await read(store, unitKey(unitId)))) reject(400, 'no_unit', 'Pick the unit this counts towards.');
    const piece = `${ADDED_PREFIX}aw_${randomBytes(4).toString('hex')}`;
    const row = {
      kind: 'written', added: true, title, unit_id: unitId, settings: cleanSettings(body.settings),
      text: { writing: { text } }, tags: [], comment: '', status: 'in', added_at: now, updated_at: now
    };
    await store.setJSON(pieceKey(roster.cls.id, student.id, piece), row);
    return { piece, feedback: row };
  }

  const piece = pieceOf(body);
  const key = pieceKey(roster.cls.id, student.id, piece);
  const row = await read(store, key);
  if (!row?.added) reject(404, 'not_found', 'That piece isn’t here.');

  if (action === 'load') {
    const [codes, recent] = await Promise.all([writtenCodes(store), recentCodes(store, roster.cls.id, student.id, key)]);
    return {
      piece, title: row.title, unit_id: row.unit_id, settings: row.settings ?? {}, added_at: row.added_at,
      student: { id: student.id, initials: student.initials, name: student.name },
      text: row.text,
      feedback: row.status === 'in' ? null : { tags: row.tags ?? [], comment: row.comment ?? '', status: row.status, ...(row.rubric ? { rubric: row.rubric } : {}) },
      codes,
      recent_codes: recent.map((r) => r.codes)
    };
  }

  if (action === 'save') {
    const codes = await writtenCodes(store);
    // Left out of the body, a rubric stays as it was.
    const saved = body.rubric === undefined
      ? { rubric: row.rubric ?? null, deep: null, blocked: [] }
      : await recordRubric(store, { class_id: roster.cls.id, student_id: student.id, piece, unit_id: row.unit_id, title: row.title, writing_key: piece.slice(ADDED_PREFIX.length), raw: body.rubric, prior: row.rubric ?? null, today: body.today });
    const { rubric: _old, ...kept } = row;
    const next = {
      ...kept,
      tags: cleanTags(body.tags, row.text, codes),
      comment: typeof body.comment === 'string' ? body.comment.trim().slice(0, MAX_COMMENT) : '',
      ...(saved.rubric ? { rubric: saved.rubric } : {}),
      status: row.status === 'returned' ? 'returned' : 'draft',
      updated_at: now
    };
    await store.setJSON(key, next);
    return { feedback: next, ...(saved.deep ? { deep: saved.deep } : {}), ...(saved.blocked.length ? { blocked: saved.blocked } : {}) };
  }

  if (action === 'return') {
    if (row.status === 'in') reject(409, 'not_marked', 'Mark this piece before you return it.');
    const next = { ...row, status: 'returned', returned_at: now, updated_at: now };
    await store.setJSON(key, next);
    return { feedback: next };
  }

  if (action === 'take_back') {
    const { returned_at: _at, seen_at: _seen, ...rest } = row;
    const next = { ...rest, status: row.status === 'in' ? 'in' : 'draft', updated_at: now };
    await store.setJSON(key, next);
    return { feedback: next };
  }

  // delete
  if (row.rubric) await forgetRubric(store, roster.cls.id, student.id, piece);
  await store.delete(key);
  return { piece, deleted: true };
}
