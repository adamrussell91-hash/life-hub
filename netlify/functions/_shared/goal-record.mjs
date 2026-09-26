// netlify/functions/_shared/goal-record.mjs
import { normalizeTags } from './tasks-collection.mjs';

/**
 * Goal v2 shape (spec: docs/superpowers/specs/2026-09-26-goals-redesign-design.md).
 * Additive over v1: every field has a default, so stored goals stay valid.
 */
const SPHERES = new Set(['life', 'work', 'professional']);
const STATUSES = new Set(['active', 'parked', 'achieved', 'dropped', 'archived']);
const STRUCTURES = new Set(['woop', 'smarter', 'okr', 'lead_lag', 'floor_target_stretch']);
const TERM_OUTCOMES = new Set(['carried', 'parked', 'achieved', 'dropped']);
const LIFE_AREAS = new Set(['career', 'health', 'love', 'money', 'create', 'explore', 'learn', 'friends']);
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_AT = /^\d{4}-\d{2}-\d{2}T/;
const TEXT_PARTS = {
  woop: ['wish', 'outcome', 'obstacle', 'plan'],
  smarter: ['specific', 'measurable', 'achievable', 'relevant', 'time_bound', 'evaluate', 'readjust'],
  lead_lag: ['lag']
};

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isMondayKey(key) {
  return typeof key === 'string' && DATE_KEY.test(key) && new Date(`${key}T00:00:00Z`).getUTCDay() === 1;
}

export function normalizeFrame(value) {
  const src = isObject(value) ? value : {};
  const out = {};
  for (const [part, keys] of Object.entries(TEXT_PARTS)) {
    if (isObject(src[part])) out[part] = Object.fromEntries(keys.map(key => [key, text(src[part][key])]));
  }
  if (isObject(src.okr)) {
    const results = Array.isArray(src.okr.key_results) ? src.okr.key_results : [];
    out.okr = {
      objective: text(src.okr.objective),
      key_results: results
        .filter(kr => isObject(kr) && text(kr.label))
        .slice(0, 6)
        .map((kr, index) => ({
          id: text(kr.id) || `kr${index + 1}`,
          label: text(kr.label),
          target: num(kr.target),
          current: num(kr.current)
        }))
    };
  }
  if (isObject(src.floor_target_stretch)) {
    const f = src.floor_target_stretch;
    out.floor_target_stretch = {
      unit: text(f.unit),
      floor: num(f.floor),
      target: num(f.target),
      stretch: num(f.stretch),
      current: num(f.current)
    };
  }
  return out;
}

function normalizeLeadMeasure(value) {
  if (!isObject(value)) return null;
  const label = text(value.label);
  const perWeek = Number.isInteger(value.per_week) && value.per_week >= 1 ? Math.min(value.per_week, 21) : null;
  return label && perWeek ? { label, per_week: perWeek } : null;
}

function normalizeWeekLog(value) {
  const out = {};
  if (!isObject(value)) return out;
  for (const [key, entry] of Object.entries(value)) {
    if (!isMondayKey(key)) continue;
    const manual = isObject(entry) && Number.isInteger(entry.manual) && entry.manual >= 0 ? Math.min(entry.manual, 50) : 0;
    out[key] = { manual };
  }
  return out;
}

function normalizeRestWeeks(value) {
  return Array.isArray(value) ? [...new Set(value.filter(isMondayKey))].sort() : [];
}

function normalizeIfThen(value) {
  if (!isObject(value)) return null;
  const cue = text(value.cue);
  const action = text(value.action);
  return cue && action ? { cue, action, obstacle: text(value.obstacle) } : null;
}

function normalizeMilestones(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => isObject(item) && text(item.title))
    .slice(0, 20)
    .map((item, index) => ({
      id: text(item.id) || `ms${index + 1}`,
      title: text(item.title),
      due_date: DATE_KEY.test(item.due_date ?? '') ? item.due_date : null,
      status: item.status === 'done' ? 'done' : 'open'
    }));
}

export function normalizeTerm(value) {
  if (!isObject(value)) return null;
  const year = Number.isInteger(value.year) ? value.year : null;
  const term = Number.isInteger(value.term) && value.term >= 1 && value.term <= 4 ? value.term : null;
  return year && term ? { year, term } : null;
}

function normalizeTermHistory(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => isObject(item))
    .map(item => {
      const year = Number.isInteger(item.year) ? item.year : null;
      const term = Number.isInteger(item.term) && item.term >= 1 && item.term <= 4 ? item.term : null;
      const outcome = TERM_OUTCOMES.has(item.outcome) ? item.outcome : null;
      const at = typeof item.at === 'string' && ISO_AT.test(item.at) ? item.at : null;
      return year && term && outcome && at ? { year, term, outcome, at } : null;
    })
    .filter(Boolean)
    .slice(0, 40);
}

function normalizeLifeArea(value, sphere) {
  if (sphere !== 'life') return null;
  return LIFE_AREAS.has(value) ? value : null;
}

/** The goal fields a client may send on create or patch. Everything else is ignored. */
export const GOAL_INPUT_KEYS = Object.freeze([
  'title', 'description', 'parent_area_id', 'parent_someday_id', 'sphere', 'status', 'structure',
  'frame', 'lead_measure', 'week_log', 'rest_weeks', 'if_then', 'next_start', 'due_date',
  'milestones', 'tags', 'life_wall', 'term', 'term_history', 'life_area'
]);

export function normalizeGoalRecord(record) {
  const sphere = SPHERES.has(record.sphere) ? record.sphere : 'life';
  return {
    ...record,
    description: typeof record.description === 'string' ? record.description : '',
    sphere,
    status: STATUSES.has(record.status) ? record.status : 'active',
    structure: STRUCTURES.has(record.structure) ? record.structure : 'woop',
    frame: normalizeFrame(record.frame),
    lead_measure: normalizeLeadMeasure(record.lead_measure),
    week_log: normalizeWeekLog(record.week_log),
    rest_weeks: normalizeRestWeeks(record.rest_weeks),
    if_then: normalizeIfThen(record.if_then),
    next_start: text(record.next_start) || null,
    due_date: DATE_KEY.test(record.due_date ?? '') ? record.due_date : null,
    milestones: normalizeMilestones(record.milestones),
    tags: normalizeTags(record.tags),
    term: normalizeTerm(record.term),
    term_history: normalizeTermHistory(record.term_history),
    life_area: normalizeLifeArea(record.life_area, sphere)
  };
}
