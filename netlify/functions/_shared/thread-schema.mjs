import { randomUUID } from 'node:crypto';

// A thread groups comms, meetings and events about the same people and purpose.
// Membership is a Universal Link (`in_thread`), never an id stored here.

export const THREAD_SCHEMA_VERSION = 1;
export const THREAD_KINDS = new Set(['general', 'case']);
export const THREAD_STATUSES = new Set(['open', 'closed']);
const THREAD_ID_PATTERN = /^thread_[0-9a-f-]{36}$/;

export function generateThreadId() {
  return `thread_${randomUUID()}`;
}

export function isValidThreadId(id) {
  return typeof id === 'string' && THREAD_ID_PATTERN.test(id);
}

function validationError(code, message) {
  return Object.assign(new Error(message), { status: 400, code });
}

function readTitle(value) {
  const title = typeof value === 'string' ? value.trim() : '';
  if (!title || title.length > 120) throw validationError('invalid_title', 'title must be 1–120 characters.');
  return title;
}

function readPurposeTag(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > 60) {
    throw validationError('invalid_purpose_tag', 'purpose_tag must be at most 60 characters.');
  }
  return value.trim().toLowerCase() || null;
}

function readGoals(value, kind) {
  if (!Array.isArray(value) || value.length > 12) throw validationError('invalid_goals', 'goals must be at most 12 items.');
  if (value.length && kind !== 'case') throw validationError('goals_need_case', 'Only case threads have goals.');
  return value.map((goal) => {
    const progress = goal?.progress ?? null;
    if (!goal || typeof goal.id !== 'string' || typeof goal.text !== 'string' || !goal.text.trim()
      || (progress !== null && (!Number.isFinite(progress) || progress < 0 || progress > 100))) {
      throw validationError('invalid_goals', 'goals need id, text and progress 0–100 or null.');
    }
    return {
      id: goal.id,
      text: goal.text.trim().slice(0, 200),
      progress,
      note: typeof goal.note === 'string' ? goal.note.trim().slice(0, 120) : null
    };
  });
}

const STORED_KEYS = new Set(['schema_version', 'id', 'kind', 'title', 'purpose_tag', 'goals', 'status', 'created_at', 'updated_at']);

export function parseThreadRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  for (const key of Object.keys(raw)) if (!STORED_KEYS.has(key)) return null;
  if (raw.schema_version !== THREAD_SCHEMA_VERSION || !isValidThreadId(raw.id)) return null;
  if (!THREAD_KINDS.has(raw.kind) || !THREAD_STATUSES.has(raw.status)) return null;
  if (typeof raw.title !== 'string' || !Array.isArray(raw.goals)) return null;
  return { ...raw };
}

export function validateThreadCreateInput(input) {
  if (!input || typeof input !== 'object') throw validationError('invalid_input', 'Thread creation requires a body object.');
  if (!THREAD_KINDS.has(input.kind)) throw validationError('invalid_kind', 'kind must be general or case.');
  return {
    kind: input.kind,
    title: readTitle(input.title),
    purpose_tag: readPurposeTag(input.purpose_tag),
    goals: readGoals(input.goals ?? [], input.kind)
  };
}

export function validateThreadPatchInput(input, currentKind) {
  if (!input || typeof input !== 'object') throw validationError('invalid_input', 'Thread patch requires a body object.');
  const patch = {};
  const kind = input.kind ?? currentKind;
  if (input.kind !== undefined) {
    if (!THREAD_KINDS.has(input.kind)) throw validationError('invalid_kind', 'kind must be general or case.');
    patch.kind = input.kind;
  }
  if (input.title !== undefined) patch.title = readTitle(input.title);
  if (input.purpose_tag !== undefined) patch.purpose_tag = readPurposeTag(input.purpose_tag);
  if (input.goals !== undefined) patch.goals = readGoals(input.goals, kind);
  if (input.status !== undefined) {
    if (!THREAD_STATUSES.has(input.status)) throw validationError('invalid_status', 'status must be open or closed.');
    patch.status = input.status;
  }
  if (!Object.keys(patch).length) throw validationError('empty_update', 'Update has no fields.');
  return patch;
}

export function threadDisplayLabel(record) {
  return record?.title || 'Thread';
}

export function projectThread(record) {
  return { ...record };
}
