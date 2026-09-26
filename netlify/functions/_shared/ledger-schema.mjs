import { createHash, randomUUID } from 'node:crypto';
import { parseEntityRef } from './entity-ref.mjs';

/**
 * People redesign Phase 4 — Clare ledger items.
 * Derived you_owe / they_owe from tasks are not stored; this schema is for
 * Clare-authored (and Adam-edited) durable items.
 */

export const LEDGER_SCHEMA_VERSION = 1;

export const LEDGER_DIRECTIONS = new Set(['you_owe', 'they_owe']);
export const LEDGER_AUTHORS = new Set(['clare', 'adam']);
export const LEDGER_STATUSES = new Set(['open', 'done', 'dismissed']);

const LEDGER_ID_PATTERN = /^ledger_[0-9a-f-]{36}$/;

export function generateLedgerItemId() {
  return `ledger_${randomUUID()}`;
}

export function isValidLedgerItemId(id) {
  return typeof id === 'string' && LEDGER_ID_PATTERN.test(id);
}

function validationError(code, message) {
  return Object.assign(new Error(message), { status: 400, code });
}

function isIsoTimestamp(value) {
  if (typeof value !== 'string' || !value) return false;
  return Number.isFinite(Date.parse(value));
}

function parseSources(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s) => s && typeof s === 'object')
    .map((s) => ({
      ref: typeof s.ref === 'string' ? s.ref : null,
      excerpt: typeof s.excerpt === 'string' ? s.excerpt.trim() : ''
    }))
    .filter((s) => s.excerpt || s.ref);
}

/** Stable key so a dismissed Clare item is not re-proposed from the same source. */
export function ledgerSourceKey({ person_ref, direction, text, source_ref }) {
  const payload = {
    direction,
    person_ref,
    source_ref: source_ref ?? null,
    text: String(text || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

const STORED_KEYS = new Set([
  'schema_version',
  'id',
  'person_ref',
  'direction',
  'text',
  'sources',
  'task_ref',
  'comm_ref',
  'author',
  'status',
  'source_key',
  'created_at',
  'updated_at'
]);

export function parseLedgerItemRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  for (const key of Object.keys(raw)) {
    if (!STORED_KEYS.has(key)) return null;
  }
  if (raw.schema_version !== LEDGER_SCHEMA_VERSION) return null;
  if (!isValidLedgerItemId(raw.id)) return null;
  if (typeof raw.person_ref !== 'string' || !parseEntityRef(raw.person_ref)) return null;
  if (!LEDGER_DIRECTIONS.has(raw.direction)) return null;
  if (typeof raw.text !== 'string' || !raw.text.trim()) return null;
  if (!LEDGER_AUTHORS.has(raw.author)) return null;
  if (!LEDGER_STATUSES.has(raw.status)) return null;
  if (typeof raw.source_key !== 'string' || !raw.source_key) return null;
  if (raw.task_ref !== null && (typeof raw.task_ref !== 'string' || !parseEntityRef(raw.task_ref))) return null;
  if (raw.comm_ref !== null && (typeof raw.comm_ref !== 'string' || !parseEntityRef(raw.comm_ref))) return null;
  if (!isIsoTimestamp(raw.created_at) || !isIsoTimestamp(raw.updated_at)) return null;
  return { ...raw, sources: parseSources(raw.sources) };
}

export function validateLedgerItemCreateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('invalid_input', 'Ledger item creation requires a body object.');
  }
  const person_ref = typeof input.person_ref === 'string' ? input.person_ref.trim() : '';
  if (!parseEntityRef(person_ref)) {
    throw validationError('invalid_person_ref', 'person_ref must be a shared:person reference.');
  }
  if (!LEDGER_DIRECTIONS.has(input.direction)) {
    throw validationError('invalid_direction', 'direction must be you_owe or they_owe.');
  }
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (!text) throw validationError('invalid_text', 'text must be a non-empty string.');
  if (text.length > 500) throw validationError('text_too_long', 'text must be at most 500 characters.');
  if (!LEDGER_AUTHORS.has(input.author ?? 'clare')) {
    throw validationError('invalid_author', 'author must be clare or adam.');
  }
  const task_ref = input.task_ref ?? null;
  const comm_ref = input.comm_ref ?? null;
  if (task_ref !== null && !parseEntityRef(task_ref)) {
    throw validationError('invalid_task_ref', 'task_ref must be a well-formed entity reference.');
  }
  if (comm_ref !== null && !parseEntityRef(comm_ref)) {
    throw validationError('invalid_comm_ref', 'comm_ref must be a well-formed entity reference.');
  }
  const sources = parseSources(input.sources);
  const primarySource = sources[0]?.ref ?? task_ref ?? null;
  return {
    person_ref,
    direction: input.direction,
    text,
    sources,
    task_ref,
    comm_ref,
    author: input.author ?? 'clare',
    source_key: ledgerSourceKey({
      person_ref,
      direction: input.direction,
      text,
      source_ref: primarySource
    })
  };
}

export function validateLedgerItemPatchInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('invalid_input', 'Ledger patch requires a body object.');
  }
  const patch = {};
  if (input.text !== undefined) {
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    if (!text) throw validationError('invalid_text', 'text must be a non-empty string.');
    if (text.length > 500) throw validationError('text_too_long', 'text must be at most 500 characters.');
    patch.text = text;
  }
  if (input.direction !== undefined) {
    if (!LEDGER_DIRECTIONS.has(input.direction)) {
      throw validationError('invalid_direction', 'direction must be you_owe or they_owe.');
    }
    patch.direction = input.direction;
  }
  if (input.status !== undefined) {
    if (!LEDGER_STATUSES.has(input.status)) {
      throw validationError('invalid_status', 'status must be open, done, or dismissed.');
    }
    patch.status = input.status;
  }
  if (input.task_ref !== undefined) {
    if (input.task_ref !== null && !parseEntityRef(input.task_ref)) {
      throw validationError('invalid_task_ref', 'task_ref must be a well-formed entity reference.');
    }
    patch.task_ref = input.task_ref;
  }
  return patch;
}

export function projectLedgerItem(record) {
  if (!record) return null;
  const sourceLabel =
    record.sources?.[0]?.excerpt ||
    (record.task_ref ? 'task' : record.author === 'clare' ? 'Clare' : 'note');
  return {
    id: record.id,
    person_ref: record.person_ref,
    direction: record.direction,
    text: record.text,
    sources: record.sources,
    source_label: sourceLabel,
    task_ref: record.task_ref,
    comm_ref: record.comm_ref,
    author: record.author,
    status: record.status,
    source_key: record.source_key,
    derived: false,
    created_at: record.created_at,
    updated_at: record.updated_at
  };
}
