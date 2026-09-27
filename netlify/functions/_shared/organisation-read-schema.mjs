import { parseEntityRef } from './entity-ref.mjs';

// Ann's OrganisationRead shape (BUILD-PLAN Phase 5).

export const ORGANISATION_READ_SCHEMA_VERSION = 1;

export const ORGANISATION_READ_THREAD_KEYS = new Set([
  'real_power',
  'your_lines',
  'gaps',
  'culture',
  'drifting'
]);

export const ORGANISATION_READ_AUTHORS = new Set(['ann', 'adam']);

export const SUMMARY_WORD_MAX = 90;
export const THREAD_TEXT_MAX = 2000;
export const MAX_THREADS = 10;
export const MAX_SOURCES_PER_THREAD = 12;

function validationError(code, message) {
  return Object.assign(new Error(message), { status: 400, code });
}

function isIsoTimestamp(value) {
  if (typeof value !== 'string' || !value) return false;
  return Number.isFinite(Date.parse(value));
}

function wordCount(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function validateOrganisationRef(value) {
  const ref = parseEntityRef(value);
  if (!ref || ref.namespace !== 'shared' || ref.kind !== 'organisation') {
    throw validationError(
      'invalid_organisation_ref',
      'organisation_ref must be a shared:organisation reference.'
    );
  }
  return value.trim();
}

const SOURCE_KEYS = new Set(['ref', 'url', 'excerpt']);

function parseSources(raw) {
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_SOURCES_PER_THREAD) return null;
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    for (const key of Object.keys(entry)) {
      if (!SOURCE_KEYS.has(key)) return null;
    }
    if (entry.ref != null && (typeof entry.ref !== 'string' || !parseEntityRef(entry.ref))) {
      return null;
    }
    if (entry.url != null && typeof entry.url !== 'string') return null;
    if (entry.excerpt != null && typeof entry.excerpt !== 'string') return null;
    out.push({
      ref: entry.ref ?? null,
      url: entry.url ?? null,
      excerpt: entry.excerpt ?? null
    });
  }
  return out;
}

const THREAD_KEYS = new Set(['key', 'text', 'sources', 'author']);

function parseThreads(raw) {
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_THREADS) return null;
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    for (const key of Object.keys(entry)) {
      if (!THREAD_KEYS.has(key)) return null;
    }
    if (!ORGANISATION_READ_THREAD_KEYS.has(entry.key)) return null;
    if (typeof entry.text !== 'string' || !entry.text.trim()) return null;
    const sources = parseSources(entry.sources ?? []);
    if (!sources) return null;
    const author = entry.author ?? 'ann';
    if (!ORGANISATION_READ_AUTHORS.has(author)) return null;
    out.push({
      key: entry.key,
      text: entry.text,
      sources,
      author
    });
  }
  return out;
}

const STORED_KEYS = new Set([
  'schema_version',
  'organisation_ref',
  'summary',
  'threads',
  'generated_at',
  'updated_at',
  'status',
  'error'
]);

export function parseOrganisationRead(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  for (const key of Object.keys(raw)) {
    if (!STORED_KEYS.has(key)) return null;
  }
  if (raw.schema_version !== ORGANISATION_READ_SCHEMA_VERSION) return null;
  const orgRef = typeof raw.organisation_ref === 'string' ? parseEntityRef(raw.organisation_ref) : null;
  if (!orgRef || orgRef.namespace !== 'shared' || orgRef.kind !== 'organisation') return null;
  if (typeof raw.summary !== 'string') return null;
  if (wordCount(raw.summary) > SUMMARY_WORD_MAX) return null;
  const threads = parseThreads(raw.threads);
  if (!threads) return null;
  if (!isIsoTimestamp(raw.generated_at)) return null;
  if (raw.updated_at != null && !isIsoTimestamp(raw.updated_at)) return null;
  if (raw.status != null && typeof raw.status !== 'string') return null;
  if (raw.error != null && typeof raw.error !== 'string') return null;
  return {
    schema_version: raw.schema_version,
    organisation_ref: raw.organisation_ref,
    summary: raw.summary,
    threads,
    generated_at: raw.generated_at,
    updated_at: raw.updated_at ?? raw.generated_at,
    status: raw.status ?? 'ready',
    error: raw.error ?? null
  };
}

/**
 * When Ann regenerates a read, Adam-authored threads win.
 * Ann never overwrites `author: 'adam'` threads; her next run is told about them.
 */
export function mergeOrganisationReadPreservingAdam(existing, generated) {
  const adamByKey = new Map();
  for (const thread of existing?.threads ?? []) {
    if (thread.author === 'adam') adamByKey.set(thread.key, thread);
  }
  const nextThreads = [];
  const seen = new Set();
  for (const thread of generated?.threads ?? []) {
    if (adamByKey.has(thread.key)) {
      nextThreads.push(adamByKey.get(thread.key));
      seen.add(thread.key);
    } else {
      nextThreads.push({ ...thread, author: thread.author ?? 'ann' });
      seen.add(thread.key);
    }
  }
  for (const [key, thread] of adamByKey) {
    if (!seen.has(key)) nextThreads.push(thread);
  }
  return {
    schema_version: ORGANISATION_READ_SCHEMA_VERSION,
    organisation_ref: generated.organisation_ref,
    summary: generated.summary,
    threads: nextThreads,
    generated_at: generated.generated_at,
    updated_at: generated.updated_at ?? generated.generated_at,
    status: generated.status ?? 'ready',
    error: generated.error ?? null,
    adam_protected_keys: [...adamByKey.keys()]
  };
}

export function validateAdamThreadEdit(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('invalid_input', 'Thread edit requires a request body object.');
  }
  if (!ORGANISATION_READ_THREAD_KEYS.has(input.key)) {
    throw validationError('invalid_thread_key', 'thread key is not permitted.');
  }
  if (typeof input.text !== 'string' || !input.text.trim()) {
    throw validationError('invalid_thread_text', 'text is required.');
  }
  if (input.text.length > THREAD_TEXT_MAX) {
    throw validationError('thread_text_too_long', `text must be at most ${THREAD_TEXT_MAX} characters.`);
  }
  return {
    key: input.key,
    text: input.text.trim(),
    sources: parseSources(input.sources ?? []) ?? [],
    author: 'adam'
  };
}

export function projectOrganisationRead(record) {
  if (!record) return null;
  return {
    organisation_ref: record.organisation_ref,
    summary: record.summary,
    threads: record.threads ?? [],
    generated_at: record.generated_at,
    updated_at: record.updated_at,
    status: record.status ?? 'ready',
    error: record.error ?? null,
    adam_protected_keys: record.adam_protected_keys ?? []
  };
}

export function emptyOrganisationRead(organisationRef) {
  return {
    schema_version: ORGANISATION_READ_SCHEMA_VERSION,
    organisation_ref: validateOrganisationRef(organisationRef),
    summary: '',
    threads: [],
    generated_at: null,
    updated_at: null,
    status: 'empty',
    error: null
  };
}

export { validateOrganisationRef, wordCount };
