import { createHash, randomUUID } from 'node:crypto';
import { sanitizeApstFocus } from './apst-focus.mjs';

// Career Hub record shapes (Professional Blobs under career/*).
// Refs to other entities live only as Universal Links — never on these JSON records.

export const CAREER_SCHEMA_VERSION = 1;

export const ACHIEVEMENT_ORIGINS = new Set(['scan', 'manual', 'import']);
export const ACHIEVEMENT_LIFECYCLES = new Set(['active', 'archived', 'deleted']);
export const DATE_PRECISIONS = new Set(['day', 'month', 'year']);

export const FUTURE_STATUSES = new Set(['active', 'parked', 'suggested', 'dismissed']);
export const CRITERION_SOURCES = new Set(['ad', 'ann', 'adam']);

export const STONE_OVERRIDES = new Set(['done', 'dropped']);
export const STONE_ORIGINS = new Set(['ann', 'adam', 'gap', 'feedback', 'move']);

export const SCAN_PROPOSAL_STATUSES = new Set(['pending', 'kept', 'binned']);
export const MOVE_STATUSES = new Set(['suggested', 'applied', 'dismissed']);

export const TITLE_MAX = 300;
export const STAR_FIELD_MAX = 2000;
export const SKILL_MAX = 60;
export const MAX_SKILLS = 12;
export const WHERE_MAX = 200;
export const ALIAS_MAX = 120;
export const MAX_ALIASES = 8;
export const CRITERION_TEXT_MAX = 500;
export const MAX_CRITERIA = 20;
export const SUGGESTED_REASON_MAX = 1000;
export const STONE_LABEL_MAX = 200;
export const MOVE_TEXT_MAX = 500;

const ACHIEVEMENT_ID = /^achievement_[0-9a-f-]{36}$/;
const FUTURE_ID = /^future_[0-9a-f-]{36}$/;
const STONE_ID = /^stone_[0-9a-f-]{36}$/;
const FCRIT_ID = /^fcrit_[0-9a-f-]{36}$/;
const SCAN_ID = /^cscan_[0-9a-f-]{36}$/;
const MOVE_ID = /^cmove_[0-9a-f-]{36}$/;
const OP_ID = /^cop_[0-9a-f]{32}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validationError(code, message) {
  return Object.assign(new Error(message), { status: 400, code });
}

function isIsoTimestamp(value) {
  if (typeof value !== 'string' || !value) return false;
  return Number.isFinite(Date.parse(value));
}

function trimBounded(value, field, max, { allowEmpty = false } = {}) {
  if (value === null || value === undefined) {
    if (allowEmpty) return null;
    throw validationError(`invalid_${field}`, `${field} is required.`);
  }
  if (typeof value !== 'string') {
    throw validationError(`invalid_${field}`, `${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed && !allowEmpty) {
    throw validationError(`invalid_${field}`, `${field} is required.`);
  }
  if (trimmed.length > max) {
    throw validationError(`${field}_too_long`, `${field} must be at most ${max} characters.`);
  }
  return trimmed || null;
}

function optionalDate(value, field) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    throw validationError(`invalid_${field}`, `${field} must be YYYY-MM-DD.`);
  }
  return value;
}

export function generateAchievementId() {
  return `achievement_${randomUUID()}`;
}
export function generateFutureId() {
  return `future_${randomUUID()}`;
}
export function generateSteppingStoneId() {
  return `stone_${randomUUID()}`;
}
export function generateFutureCriterionId() {
  return `fcrit_${randomUUID()}`;
}
export function generateScanProposalId() {
  return `cscan_${randomUUID()}`;
}
export function generateCareerMoveId() {
  return `cmove_${randomUUID()}`;
}
export function generateCareerOperationId() {
  return `cop_${createHash('sha256').update(`${Date.now()}:${randomUUID()}`).digest('hex').slice(0, 32)}`;
}

export function isValidAchievementId(id) {
  return typeof id === 'string' && ACHIEVEMENT_ID.test(id);
}
export function isValidFutureId(id) {
  return typeof id === 'string' && FUTURE_ID.test(id);
}
export function isValidSteppingStoneId(id) {
  return typeof id === 'string' && STONE_ID.test(id);
}
export function isValidScanProposalId(id) {
  return typeof id === 'string' && SCAN_ID.test(id);
}
export function isValidCareerMoveId(id) {
  return typeof id === 'string' && MOVE_ID.test(id);
}
export function isValidCareerOperationId(id) {
  return typeof id === 'string' && OP_ID.test(id);
}

function parseStar(raw) {
  if (raw === null || raw === undefined) {
    return { situation: null, task: null, action: null, result: null };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const key of ['situation', 'task', 'action', 'result']) {
    const value = raw[key];
    if (value === null || value === undefined || value === '') {
      out[key] = null;
      continue;
    }
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (trimmed.length > STAR_FIELD_MAX) return null;
    out[key] = trimmed || null;
  }
  return out;
}

function normalizeSkills(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || trimmed.length > SKILL_MAX) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= MAX_SKILLS) break;
  }
  return out;
}

function parseCriteria(raw) {
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_CRITERIA) return null;
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    if (typeof item.id !== 'string' || !FCRIT_ID.test(item.id)) return null;
    if (typeof item.text !== 'string') return null;
    const text = item.text.trim();
    if (!text || text.length > CRITERION_TEXT_MAX) return null;
    if (!Number.isInteger(item.order)) return null;
    if (!CRITERION_SOURCES.has(item.source)) return null;
    out.push({ id: item.id, text, order: item.order, source: item.source });
  }
  return out.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

const ACHIEVEMENT_KEYS = new Set([
  'schema_version',
  'id',
  'title',
  'occurred_on',
  'date_precision',
  'star',
  'skills',
  'apst',
  'origin',
  'lifecycle_status',
  'created_at',
  'updated_at'
]);

export function parseAchievementRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  for (const key of Object.keys(raw)) {
    if (!ACHIEVEMENT_KEYS.has(key)) return null;
  }
  if (raw.schema_version !== CAREER_SCHEMA_VERSION) return null;
  if (!isValidAchievementId(raw.id)) return null;
  if (typeof raw.title !== 'string' || !raw.title.trim() || raw.title.length > TITLE_MAX) return null;
  if (typeof raw.occurred_on !== 'string' || !DATE_PATTERN.test(raw.occurred_on)) return null;
  if (!DATE_PRECISIONS.has(raw.date_precision)) return null;
  const star = parseStar(raw.star);
  if (!star) return null;
  if (!Array.isArray(raw.skills) || raw.skills.length > MAX_SKILLS) return null;
  if (!Array.isArray(raw.apst)) return null;
  if (!ACHIEVEMENT_ORIGINS.has(raw.origin)) return null;
  if (!ACHIEVEMENT_LIFECYCLES.has(raw.lifecycle_status)) return null;
  if (!isIsoTimestamp(raw.created_at) || !isIsoTimestamp(raw.updated_at)) return null;
  return {
    schema_version: CAREER_SCHEMA_VERSION,
    id: raw.id,
    title: raw.title.trim(),
    occurred_on: raw.occurred_on,
    date_precision: raw.date_precision,
    star,
    skills: normalizeSkills(raw.skills),
    apst: sanitizeApstFocus(raw.apst),
    origin: raw.origin,
    lifecycle_status: raw.lifecycle_status,
    created_at: raw.created_at,
    updated_at: raw.updated_at
  };
}

const FUTURE_KEYS = new Set([
  'schema_version',
  'id',
  'title',
  'where',
  'aliases',
  'criteria',
  'target_date',
  'status',
  'suggested_reason',
  'dismissed_until',
  'lane_order',
  'colour_slot',
  'created_at',
  'updated_at'
]);

export function parseFutureRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  for (const key of Object.keys(raw)) {
    if (!FUTURE_KEYS.has(key)) return null;
  }
  if (raw.schema_version !== CAREER_SCHEMA_VERSION) return null;
  if (!isValidFutureId(raw.id)) return null;
  if (typeof raw.title !== 'string' || !raw.title.trim() || raw.title.length > TITLE_MAX) return null;
  if (raw.where !== null && (typeof raw.where !== 'string' || raw.where.length > WHERE_MAX)) return null;
  if (!Array.isArray(raw.aliases) || raw.aliases.length > MAX_ALIASES) return null;
  const criteria = parseCriteria(raw.criteria);
  if (!criteria) return null;
  if (raw.target_date !== null && (typeof raw.target_date !== 'string' || !DATE_PATTERN.test(raw.target_date))) {
    return null;
  }
  if (!FUTURE_STATUSES.has(raw.status)) return null;
  if (
    raw.suggested_reason !== null &&
    (typeof raw.suggested_reason !== 'string' || raw.suggested_reason.length > SUGGESTED_REASON_MAX)
  ) {
    return null;
  }
  if (raw.dismissed_until !== null && !isIsoTimestamp(raw.dismissed_until)) return null;
  if (!Number.isInteger(raw.lane_order)) return null;
  if (!Number.isInteger(raw.colour_slot) || raw.colour_slot < 1 || raw.colour_slot > 6) return null;
  if (!isIsoTimestamp(raw.created_at) || !isIsoTimestamp(raw.updated_at)) return null;
  return {
    schema_version: CAREER_SCHEMA_VERSION,
    id: raw.id,
    title: raw.title.trim(),
    where: raw.where === null ? null : String(raw.where).trim() || null,
    aliases: raw.aliases.map((a) => String(a).trim()).filter(Boolean).slice(0, MAX_ALIASES),
    criteria,
    target_date: raw.target_date,
    status: raw.status,
    suggested_reason: raw.suggested_reason,
    dismissed_until: raw.dismissed_until,
    lane_order: raw.lane_order,
    colour_slot: raw.colour_slot,
    created_at: raw.created_at,
    updated_at: raw.updated_at
  };
}

const STONE_KEYS = new Set([
  'schema_version',
  'id',
  'label',
  'target_term_start',
  'status_override',
  'origin',
  'created_at',
  'updated_at'
]);

export function parseSteppingStoneRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  for (const key of Object.keys(raw)) {
    if (!STONE_KEYS.has(key)) return null;
  }
  if (raw.schema_version !== CAREER_SCHEMA_VERSION) return null;
  if (!isValidSteppingStoneId(raw.id)) return null;
  if (typeof raw.label !== 'string' || !raw.label.trim() || raw.label.length > STONE_LABEL_MAX) return null;
  if (
    raw.target_term_start !== null &&
    (typeof raw.target_term_start !== 'string' || !DATE_PATTERN.test(raw.target_term_start))
  ) {
    return null;
  }
  if (raw.status_override !== null && !STONE_OVERRIDES.has(raw.status_override)) return null;
  if (!STONE_ORIGINS.has(raw.origin)) return null;
  if (!isIsoTimestamp(raw.created_at) || !isIsoTimestamp(raw.updated_at)) return null;
  return {
    schema_version: CAREER_SCHEMA_VERSION,
    id: raw.id,
    label: raw.label.trim(),
    target_term_start: raw.target_term_start,
    status_override: raw.status_override,
    origin: raw.origin,
    created_at: raw.created_at,
    updated_at: raw.updated_at
  };
}

export function validateAchievementCreateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('invalid_input', 'Achievement creation requires a request body object.');
  }
  const title = trimBounded(input.title, 'title', TITLE_MAX);
  const occurred_on = optionalDate(input.occurred_on, 'occurred_on');
  if (!occurred_on) throw validationError('invalid_occurred_on', 'occurred_on is required.');
  if (!DATE_PRECISIONS.has(input.date_precision)) {
    throw validationError('invalid_date_precision', 'date_precision must be day, month, or year.');
  }
  const star = parseStar(input.star ?? null);
  if (!star) throw validationError('invalid_star', 'star fields are invalid.');
  const origin = ACHIEVEMENT_ORIGINS.has(input.origin) ? input.origin : 'manual';
  return {
    title,
    occurred_on,
    date_precision: input.date_precision,
    star,
    skills: normalizeSkills(input.skills ?? []),
    apst: sanitizeApstFocus(input.apst ?? []),
    origin,
    lifecycle_status: 'active'
  };
}

export function validateFutureCreateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('invalid_input', 'Future creation requires a request body object.');
  }
  const title = trimBounded(input.title, 'title', TITLE_MAX);
  const where = trimBounded(input.where ?? null, 'where', WHERE_MAX, { allowEmpty: true });
  const aliases = Array.isArray(input.aliases)
    ? input.aliases
        .map((a) => (typeof a === 'string' ? a.trim() : ''))
        .filter(Boolean)
        .slice(0, MAX_ALIASES)
    : [];
  let criteria = [];
  if (Array.isArray(input.criteria)) {
    if (input.criteria.length > MAX_CRITERIA) {
      throw validationError('too_many_criteria', `At most ${MAX_CRITERIA} criteria.`);
    }
    criteria = input.criteria.map((item, index) => {
      const text = trimBounded(item?.text, 'criterion', CRITERION_TEXT_MAX);
      const source = CRITERION_SOURCES.has(item?.source) ? item.source : 'adam';
      return {
        id: typeof item?.id === 'string' && FCRIT_ID.test(item.id) ? item.id : generateFutureCriterionId(),
        text,
        order: Number.isInteger(item?.order) ? item.order : index,
        source
      };
    });
  }
  const colour_slot = Number.isInteger(input.colour_slot) ? input.colour_slot : 1;
  if (colour_slot < 1 || colour_slot > 6) {
    throw validationError('invalid_colour_slot', 'colour_slot must be 1–6.');
  }
  const lane_order = Number.isInteger(input.lane_order) ? input.lane_order : 0;
  const status = FUTURE_STATUSES.has(input.status) ? input.status : 'active';
  return {
    title,
    where,
    aliases,
    criteria,
    target_date: optionalDate(input.target_date ?? null, 'target_date'),
    status,
    suggested_reason: trimBounded(input.suggested_reason ?? null, 'suggested_reason', SUGGESTED_REASON_MAX, {
      allowEmpty: true
    }),
    dismissed_until: null,
    lane_order,
    colour_slot
  };
}

export function validateSteppingStoneCreateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('invalid_input', 'Stepping stone creation requires a request body object.');
  }
  return {
    label: trimBounded(input.label, 'label', STONE_LABEL_MAX),
    target_term_start: optionalDate(input.target_term_start ?? null, 'target_term_start'),
    status_override: STONE_OVERRIDES.has(input.status_override) ? input.status_override : null,
    origin: STONE_ORIGINS.has(input.origin) ? input.origin : 'adam'
  };
}

export function compareAchievementsNewestFirst(a, b) {
  const byDate = String(b.occurred_on).localeCompare(String(a.occurred_on));
  if (byDate) return byDate;
  return String(b.created_at).localeCompare(String(a.created_at));
}

/**
 * Live stone completion — never stored.
 * Project closed field: status === 'completed'. Programs have no closed field.
 */
export function isSteppingStoneDone(stone, actionEndpoints = []) {
  if (stone?.status_override === 'done') return true;
  if (stone?.status_override === 'dropped') return false;
  for (const endpoint of actionEndpoints) {
    const status = endpoint?.lifecycle_status;
    const kind = endpoint?.kind;
    if (kind === 'task' && status === 'done') return true;
    if (kind === 'goal' && status === 'achieved') return true;
    if (kind === 'project' && (status === 'completed' || status === 'archived_dead')) return true;
  }
  return false;
}

/** Criterion coverage: strong=1, some=0.5, else 0. */
export function criterionCoverage(strength) {
  if (strength === 'strong') return 1;
  if (strength === 'some') return 0.5;
  return 0;
}

export function readinessPercent(criteria, supports = []) {
  if (!criteria?.length) return null;
  const byCriterion = new Map();
  for (const link of supports) {
    const ids = Array.isArray(link.criterion_ids) ? link.criterion_ids : [];
    for (const id of ids) {
      const next = criterionCoverage(link.strength);
      const prev = byCriterion.get(id) ?? 0;
      if (next > prev) byCriterion.set(id, next);
    }
  }
  const mean =
    criteria.reduce((sum, criterion) => sum + (byCriterion.get(criterion.id) ?? 0), 0) / criteria.length;
  return Math.round(100 * mean);
}

export function applicationMatchPercent(selectionCriteria, answers = []) {
  if (!selectionCriteria?.length) return null;
  const byCriterion = new Map();
  for (const link of answers) {
    const id = link.criterion_id;
    if (!id) continue;
    const next = criterionCoverage(link.strength);
    const prev = byCriterion.get(id) ?? 0;
    if (next > prev) byCriterion.set(id, next);
  }
  const mean =
    selectionCriteria.reduce((sum, criterion) => sum + (byCriterion.get(criterion.id) ?? 0), 0) /
    selectionCriteria.length;
  return Math.round(100 * mean);
}
