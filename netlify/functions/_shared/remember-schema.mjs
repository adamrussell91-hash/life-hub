import { randomUUID } from 'node:crypto';
import { parseEntityRef } from './entity-ref.mjs';

/**
 * People redesign Phase 5 — Remember facts (Ann).
 * Short lines ≤ 120 chars. Ann never overwrites Adam-authored facts.
 */

export const REMEMBER_SCHEMA_VERSION = 1;
export const REMEMBER_AUTHORS = new Set(['ann', 'adam']);
export const REMEMBER_STATUSES = new Set(['active', 'dismissed']);
export const REMEMBER_TEXT_MAX = 120;

const REMEMBER_ID_PATTERN = /^remember_[0-9a-f-]{36}$/;

export function generateRememberFactId() {
  return `remember_${randomUUID()}`;
}

export function isValidRememberFactId(id) {
  return typeof id === 'string' && REMEMBER_ID_PATTERN.test(id);
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
      kind: typeof s.kind === 'string' ? s.kind : 'note',
      excerpt: typeof s.excerpt === 'string' ? s.excerpt.trim() : '',
      at: typeof s.at === 'string' ? s.at : null
    }))
    .filter((s) => s.excerpt || s.ref);
}

const STORED_KEYS = new Set([
  'schema_version',
  'id',
  'person_ref',
  'text',
  'sources',
  'author',
  'status',
  'sort_order',
  'created_at',
  'updated_at'
]);

export function parseRememberFactRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  for (const key of Object.keys(raw)) {
    if (!STORED_KEYS.has(key)) return null;
  }
  if (raw.schema_version !== REMEMBER_SCHEMA_VERSION) return null;
  if (!isValidRememberFactId(raw.id)) return null;
  if (typeof raw.person_ref !== 'string' || !parseEntityRef(raw.person_ref)) return null;
  if (typeof raw.text !== 'string' || !raw.text.trim()) return null;
  if (raw.text.trim().length > REMEMBER_TEXT_MAX) return null;
  if (!REMEMBER_AUTHORS.has(raw.author)) return null;
  if (!REMEMBER_STATUSES.has(raw.status)) return null;
  if (!Number.isFinite(raw.sort_order)) return null;
  if (!isIsoTimestamp(raw.created_at) || !isIsoTimestamp(raw.updated_at)) return null;
  return { ...raw, sources: parseSources(raw.sources) };
}

export function validateRememberFactCreateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('invalid_input', 'Remember fact creation requires a body object.');
  }
  const person_ref = typeof input.person_ref === 'string' ? input.person_ref.trim() : '';
  if (!parseEntityRef(person_ref)) {
    throw validationError('invalid_person_ref', 'person_ref must be a shared:person reference.');
  }
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (!text) throw validationError('invalid_text', 'text must be a non-empty string.');
  if (text.length > REMEMBER_TEXT_MAX) {
    throw validationError('text_too_long', `text must be at most ${REMEMBER_TEXT_MAX} characters.`);
  }
  const author = input.author ?? 'ann';
  if (!REMEMBER_AUTHORS.has(author)) {
    throw validationError('invalid_author', 'author must be ann or adam.');
  }
  return {
    person_ref,
    text,
    sources: parseSources(input.sources),
    author,
    sort_order: Number.isFinite(input.sort_order) ? input.sort_order : 0
  };
}

export function validateRememberFactPatchInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('invalid_input', 'Remember patch requires a body object.');
  }
  const patch = {};
  if (input.text !== undefined) {
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    if (!text) throw validationError('invalid_text', 'text must be a non-empty string.');
    if (text.length > REMEMBER_TEXT_MAX) {
      throw validationError('text_too_long', `text must be at most ${REMEMBER_TEXT_MAX} characters.`);
    }
    patch.text = text;
  }
  if (input.status !== undefined) {
    if (!REMEMBER_STATUSES.has(input.status)) {
      throw validationError('invalid_status', 'status must be active or dismissed.');
    }
    patch.status = input.status;
  }
  if (input.sort_order !== undefined) {
    if (!Number.isFinite(input.sort_order)) {
      throw validationError('invalid_sort_order', 'sort_order must be a number.');
    }
    patch.sort_order = input.sort_order;
  }
  return patch;
}

export function sourceLabelForFact(fact, formatDate) {
  const src = fact.sources?.[0];
  if (!src) return fact.author === 'ann' ? 'Ann' : 'note';
  const kind = src.kind || 'note';
  if (kind === 'task') return 'task';
  if (kind === 'project') return 'project';
  if (src.at && typeof formatDate === 'function') {
    const d = formatDate(src.at);
    return d ? `note · ${d}` : 'note';
  }
  if (src.at) {
    const parsed = Date.parse(src.at);
    if (Number.isFinite(parsed)) {
      const dt = new Date(parsed);
      const dd = String(dt.getUTCDate()).padStart(2, '0');
      const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const yy = String(dt.getUTCFullYear()).slice(-2);
      return `note · ${dd}/${mm}/${yy}`;
    }
  }
  return kind;
}

export function projectRememberFact(record) {
  if (!record) return null;
  return {
    id: record.id,
    person_ref: record.person_ref,
    text: record.text,
    sources: record.sources,
    source_label: sourceLabelForFact(record),
    author: record.author,
    status: record.status,
    sort_order: record.sort_order,
    created_at: record.created_at,
    updated_at: record.updated_at
  };
}

/**
 * Pull short Remember candidates from observation/task/project text.
 * Prefer concrete facts (teaches, coaching, accreditation) over vague lines.
 */
export function extractRememberCandidates({ person_ref, texts = [] }) {
  const candidates = [];
  const factRe =
    /\b(teaches?|coaching|coaches|accreditation|proficient|rugby|history|year\s*\d|knows|from uni|mentee|mentor)\b/i;

  for (const entry of texts) {
    const text = String(entry.text || '').trim();
    if (!text || text.length < 12) continue;
    if (!factRe.test(text) && entry.kind !== 'project') continue;
    const short = text.split(/[.!\n]/)[0].trim().slice(0, REMEMBER_TEXT_MAX);
    if (short.length < 8) continue;
    candidates.push({
      person_ref,
      text: short,
      sources: [
        {
          ref: entry.ref ?? null,
          kind: entry.kind ?? 'note',
          excerpt: short,
          at: entry.at ?? null
        }
      ],
      author: 'ann'
    });
  }
  return candidates;
}
