import { load as loadYaml } from 'js-yaml';
import { verifySessionToken, serializeExpiredSessionCookie } from './_shared/auth-security.mjs';
import {
  errorResponse,
  guardRequestOrigin,
  isConfigured,
  jsonResponse,
  methodNotAllowed,
  misconfiguredResponse,
  preflightResponse,
  readUmbrellaSessionCookie,
  umbrellaSessionSecret,
  withCors
} from './_shared/http.mjs';
import { createGitHubClient, GitHubClientError, GitHubConfigurationError } from './_shared/github-client.mjs';
import { decodeBlob } from './_shared/decode-blob.mjs';
import { parseDateRange } from './_shared/repo-policy.mjs';
import { defaultGetTasksStore, getJSON, readTaskIndex, setJSON, taskKey } from './_shared/tasks-blobs.mjs';
import { defaultGetCognitiveStore } from './_shared/cognitive-store.mjs';
import { lastCompletedRun, horizonCompletedDateKey, isHorizonReviewStepId } from './_shared/cognitive-horizon.mjs';
import { parseEventDocument } from '../../apps/life/js/core/records.js';
import { getSydneyDateKey, getSydneyTimestamp } from '../../apps/life/js/core/time.js';
import { addDays, almanacSummary, leadLines } from '../../packages/design-kit/js/lead-lines.js';
import { findOpenings } from '../../packages/design-kit/js/openings.js';
import { ALMANAC_RULES, ALMANAC_WANTS } from '../../apps/life/js/app/almanac-rules.js';
import { capacityForDates } from '../../apps/life/js/app/capacity-model.js';
import { isHoliday as isSchoolHoliday } from '../../packages/design-kit/js/school-time.js';
import { readinessEvidenceEvents, READINESS_LOOKBACK_DAYS } from './_shared/readiness-evidence.mjs';
import { medicationContext } from '../../packages/design-kit/js/calendar/medication-model.js';

export const ALMANAC_ANCHORS_PATH = 'almanac-anchors.yml';
export const ALMANAC_DONE_PATH = 'almanac-done.json';
export const HUB_PREFS_KEY = 'meta/hub_prefs';

export const config = { path: '/api/almanac' };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STEP_ID = /^[a-z0-9][a-z0-9:-]*$/i;
const KINDS = new Set(['trip', 'medical', 'event', 'term', 'dream']);
const LOG_PATH = /^data\/(?:sleep|mind|fitness)\/\d{4}\/\d{2}\/(\d{4}-\d{2}-\d{2})-[a-z0-9-]+\.md$/;
const DEX_PATH = /^data\/body\/\d{4}\/\d{2}\/(\d{4}-\d{2}-\d{2})-dex-[a-z0-9-]+\.md$/;
const BLOCK_PATH = /^data\/calendar\/\d{4}\/\d{2}\/(\d{4}-\d{2}-\d{2})-[a-z0-9-]+\.md$/;
const DAY_START = 8 * 60;
const DAY_END = 17 * 60;
const EVE_START = 18 * 60;
const EVE_END = 22 * 60;
const PRIVATE_CACHE = { 'cache-control': 'private, no-store' };
const MAX_BODY_BYTES = 1024;
const HOLD_TITLES = {
  'good-night': { start: '18:00', end: '22:00', title: 'Good night: dinner out + a show', with: 'corey' },
  'keep-empty': { start: '06:00', end: '22:00', title: 'Keep empty (daylight saving)' },
  newcastle: { start: '08:00', end: '21:00', title: 'Newcastle · friends' }
};

/** Draft copy from the Almanac reference. {when} is filled from the opening. Nothing is sent. */
const DRAFTS = {
  bob: { to: 'Bob', text: 'Hi Bob, I’m on school holidays. Are you free for lunch on {when}? My shout.' },
  newcastle: { to: 'Newcastle friends', text: 'I’m in Newcastle on {when}. Anyone free for a coffee, a walk or dinner?' }
};

/** Phase 1 stand-in. Live feeds replace these; example entries stay marked. */
const EXAMPLE_WORLD = [
  { date: '2026-09-26', title: 'Sat 26 · 24° clear', sub: 'BOM', example: true, row: 0 },
  { date: '2026-10-04', title: 'Daylight saving starts + Labour Day', sub: 'you lose an hour · long weekend', example: false, row: 1 },
  { date: '2026-10-14', title: 'HSC begins · English Paper 1', sub: 'NESA timetable (est.)', example: true, row: 0 },
  { date: '2026-11-27', title: 'Reports due', sub: 'school calendar (est.)', example: true, row: 0 },
  { date: '2026-12-25', title: 'Christmas', sub: '', example: false, row: 1 }
];

function asDate(value) {
  if (typeof value === 'string' && DATE.test(value)) return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const key = `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
    return DATE.test(key) ? key : null;
  }
  return null;
}

function stringTags(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some(tag => typeof tag !== 'string' || tag.trim() === '')) return null;
  return value.map(tag => tag.trim());
}

function normalizeAnchor(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return { ok: false, reason: 'not an object' };
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  if (!id) return { ok: false, reason: 'missing id' };
  const title = typeof row.title === 'string' ? row.title.trim() : '';
  if (!title) return { ok: false, id, reason: 'missing title' };
  if (!KINDS.has(row.kind)) return { ok: false, id, reason: 'kind must be trip, medical, event, term, or dream' };
  const sub = typeof row.sub === 'string' ? row.sub.trim() : '';
  if (!sub) return { ok: false, id, reason: 'missing sub' };
  const tags = stringTags(row.tags);
  if (!tags) return { ok: false, id, reason: 'tags must be a list of strings' };
  const date = row.date == null ? null : asDate(row.date);
  if (row.date != null && !date) return { ok: false, id, reason: 'date must be YYYY-MM-DD' };
  const returns = row.returns == null ? null : asDate(row.returns);
  if (row.returns != null && !returns) return { ok: false, id, reason: 'returns must be YYYY-MM-DD' };
  if (returns && !date) return { ok: false, id, reason: 'returns needs a date' };
  let window = null;
  if (row.window != null) {
    if (!row.window || typeof row.window !== 'object' || Array.isArray(row.window)) {
      return { ok: false, id, reason: 'window must be { opens, closes }' };
    }
    const opens = asDate(row.window.opens);
    const closes = asDate(row.window.closes);
    if (!opens || !closes || opens > closes) return { ok: false, id, reason: 'window opens and closes must be YYYY-MM-DD' };
    window = { opens, closes };
  }
  if (date && window) return { ok: false, id, reason: 'anchor has both a date and a window' };
  if (row.kind !== 'dream' && !date && !window) return { ok: false, id, reason: 'anchor needs a date or a window' };
  return { ok: true, value: { id, title, kind: row.kind, ...(date ? { date } : {}), ...(returns ? { returns } : {}), ...(window ? { window } : {}), tags, sub } };
}

/** Valid rows only. A bad row is skipped and warned, never thrown. */
export function parseAlmanacAnchors(text, { warn = console.warn } = {}) {
  if (typeof text !== 'string' || text.trim() === '') return [];
  let parsed;
  try {
    parsed = loadYaml(text);
  } catch (error) {
    warn(`almanac: ignoring anchors file (${error instanceof Error ? error.message : 'invalid yaml'})`);
    return [];
  }
  if (!Array.isArray(parsed)) {
    warn('almanac: ignoring anchors file (expected a list)');
    return [];
  }
  const anchors = [];
  parsed.forEach((row, index) => {
    const anchor = normalizeAnchor(row);
    if (anchor.ok) anchors.push(anchor.value);
    else warn(`almanac: ignoring anchor at index ${index}${anchor.id ? ` (${anchor.id})` : ''}: ${anchor.reason}`);
  });
  return anchors;
}

export function parseAlmanacDone(text, { warn = console.warn } = {}) {
  if (typeof text !== 'string' || text.trim() === '') return [];
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    warn(`almanac: ignoring done file (${error instanceof Error ? error.message : 'invalid json'})`);
    return [];
  }
  if (!Array.isArray(parsed)) {
    warn('almanac: ignoring done file (expected a list)');
    return [];
  }
  const rows = [];
  parsed.forEach((row, index) => {
    const at = row && typeof row.at === 'string' ? row.at.trim() : '';
    const stepId = row && typeof row.stepId === 'string' ? row.stepId.trim() : '';
    const anchorId = row && typeof row.anchorId === 'string' ? row.anchorId.trim() : '';
    const status = row && typeof row.status === 'string' ? row.status : '';
    if (at && stepId && (!status || status === 'done' || status === 'not_doing')) {
      rows.push({ stepId, at, ...(status === 'not_doing' ? { status } : {}) });
      return;
    }
    if (at && anchorId && status === 'not_going') {
      rows.push({ anchorId, at, status, ...(typeof row.reason === 'string' && row.reason.trim() ? { reason: row.reason.trim() } : {}) });
      return;
    }
    if (at && anchorId && status === 'moved' && asDate(row.date)) {
      rows.push({ anchorId, at, status, date: asDate(row.date) });
      return;
    }
    warn(`almanac: ignoring done row at index ${index}`);
  });
  return rows;
}

export function appendAlmanacDone(text, stepId, at, { warn = console.warn } = {}) {
  return appendAlmanacDecision(text, { stepId, at }, { warn });
}

/** Append one decision row (done, not_doing, not_going, moved) to almanac-done.json. */
export function appendAlmanacDecision(text, row, { warn = console.warn } = {}) {
  const rows = parseAlmanacDone(typeof text === 'string' ? text : '', { warn });
  rows.push(row);
  return `${JSON.stringify(rows, null, 2)}\n`;
}

/**
 * Apply Adam's anchor decisions: "not going" removes the anchor and every step
 * hanging off it; "moved" re-dates it (latest move wins). Rows stay in the file
 * as the record of why.
 */
export function applyAnchorDecisions(anchors, done = []) {
  const gone = new Set();
  const moved = new Map();
  for (const row of done) {
    if (!row.anchorId) continue;
    if (row.status === 'not_going') gone.add(row.anchorId);
    if (row.status === 'moved') moved.set(row.anchorId, row.date);
  }
  return anchors
    .filter(anchor => !gone.has(anchor.id))
    .map(anchor => {
      const date = moved.get(anchor.id);
      if (!date || !anchor.date) return anchor;
      const shift = anchor.returns ? daysBetweenKeys(anchor.date, date) : 0;
      return { ...anchor, date, ...(anchor.returns ? { returns: addDays(anchor.returns, shift) } : {}) };
    });
}

function daysBetweenKeys(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function parseSchoolTerms(value, { warn = console.warn } = {}) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    warn('almanac: ignoring school_terms (expected a list)');
    return [];
  }
  const terms = [];
  const addTerm = (row, label) => {
    const starts_on = asDate(row?.starts_on);
    const ends_on = asDate(row?.ends_on);
    if (!starts_on || !ends_on || starts_on > ends_on) {
      warn(`almanac: ignoring school term at index ${label}`);
      return;
    }
    terms.push({
      term: Number.isInteger(row.term) ? row.term : null,
      starts_on,
      ends_on
    });
  };
  // hub-prefs stores terms nested by year ({ year, terms: [...] }); older seeds use flat rows.
  value.forEach((row, index) => {
    if (Array.isArray(row?.terms)) row.terms.forEach((term, inner) => addTerm(term, `${index}.${inner}`));
    else addTerm(row, index);
  });
  return terms.sort((a, b) => a.starts_on.localeCompare(b.starts_on));
}

/** Bounded Blob concurrency — a serial walk of every task was ~30s on real latency. */
const TASKED_BATCH = 10;
const LINE_ORDER = ['overdue', 'now', 'soon', 'later', 'done'];

export async function readAlmanacTasked(tasksStore, { warn = console.warn } = {}) {
  if (typeof tasksStore !== 'function') return [];
  try {
    const store = await tasksStore();
    const index = await readTaskIndex(store);
    const out = [];
    for (let i = 0; i < index.length; i += TASKED_BATCH) {
      const slice = index.slice(i, i + TASKED_BATCH);
      const rows = await Promise.all(slice.map((id) => getJSON(store, taskKey(id))));
      for (const task of rows) {
        const source = typeof task?.source === 'string' ? task.source : '';
        if (source.startsWith('almanac:')) out.push(source.slice('almanac:'.length));
      }
    }
    return [...new Set(out)];
  } catch (error) {
    warn(`almanac: tasked steps unavailable (${error instanceof Error ? error.message : 'error'})`);
    return [];
  }
}

export async function readSchoolTerms(tasksStore, { warn = console.warn } = {}) {
  if (typeof tasksStore !== 'function') return [];
  try {
    const store = await tasksStore();
    const prefs = await getJSON(store, HUB_PREFS_KEY);
    return parseSchoolTerms(prefs?.school_terms, { warn });
  } catch (error) {
    warn(`almanac: school terms unavailable (${error instanceof Error ? error.message : 'error'})`);
    return [];
  }
}

const DECISION_KEYS = new Set(['stepId', 'anchorId', 'status', 'reason', 'date']);

/**
 * Accepted bodies: { stepId } (done) · { stepId, status: 'not_doing' } ·
 * { anchorId, status: 'not_going', reason? } · { anchorId, status: 'moved', date }.
 */
export function readDoneRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'invalid_request' };
  for (const key of Object.keys(body)) {
    if (!DECISION_KEYS.has(key)) return { error: 'client_write_rejected' };
  }
  if (body.anchorId !== undefined) {
    if (typeof body.anchorId !== 'string' || !STEP_ID.test(body.anchorId) || body.stepId !== undefined) return { error: 'invalid_request' };
    if (body.status === 'not_going') {
      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) : '';
      return { anchorId: body.anchorId, status: 'not_going', ...(reason ? { reason } : {}) };
    }
    if (body.status === 'moved' && typeof body.date === 'string' && DATE.test(body.date)) {
      return { anchorId: body.anchorId, status: 'moved', date: body.date };
    }
    return { error: 'invalid_request' };
  }
  if (typeof body.stepId !== 'string' || !STEP_ID.test(body.stepId)) return { error: 'invalid_request' };
  if (body.reason !== undefined || body.date !== undefined) return { error: 'invalid_request' };
  if (body.status === undefined || body.status === 'done') return { stepId: body.stepId };
  if (body.status === 'not_doing') return { stepId: body.stepId, status: 'not_doing' };
  return { error: 'invalid_request' };
}

function dateKeys(from, to) {
  const out = [];
  for (let date = from; date <= to; date = addDays(date, 1)) out.push(date);
  return out;
}

function weekday(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function inTerm(date, terms) {
  return terms.some(term => date >= term.starts_on && date <= term.ends_on);
}

function horizonEnd(today, anchors) {
  let end = addDays(today, 105);
  for (const anchor of anchors) {
    for (const candidate of [anchor.returns, anchor.date, anchor.window?.closes]) {
      if (typeof candidate === 'string' && candidate > end) end = candidate;
    }
  }
  return end;
}

function hhmm(value) {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function overlaps(start, end, from, to) {
  return start != null && end != null && end > start && start < to && end > from;
}

function dstStart(year) {
  const wd = new Date(Date.UTC(year, 9, 1)).getUTCDay();
  const day = wd === 0 ? 1 : 8 - wd;
  return `${year}-10-${String(day).padStart(2, '0')}`;
}

function sydneyDate(iso, timeZone = 'Australia/Sydney') {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  const get = type => parts.find(part => part.type === type)?.value;
  const key = `${get('year')}-${get('month')}-${get('day')}`;
  return DATE.test(key) ? key : null;
}

function sydneyMinutes(iso, timeZone = 'Australia/Sydney') {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant);
  const hour = Number(parts.find(part => part.type === 'hour')?.value);
  const minute = Number(parts.find(part => part.type === 'minute')?.value);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  return hour * 60 + minute;
}

function addTag(tags, date, tag) {
  const list = tags.get(date) ?? [];
  if (!list.includes(tag)) list.push(tag);
  tags.set(date, list);
}

function mergeAnchors(fileAnchors, terms, extras) {
  const byId = new Map(fileAnchors.map(anchor => [anchor.id, anchor]));
  for (const term of terms) {
    const id = term.term == null ? `term-${term.starts_on}` : `term-${term.term}`;
    if (byId.has(id)) continue;
    if ([...byId.values()].some(anchor => anchor.kind === 'term' && anchor.date === term.starts_on)) continue;
    byId.set(id, {
      id,
      title: term.term == null ? 'Term' : `Term ${term.term}`,
      kind: 'term',
      date: term.starts_on,
      tags: [],
      sub: `${term.starts_on} – ${term.ends_on}`
    });
  }
  for (const anchor of extras) {
    if (!byId.has(anchor.id)) byId.set(anchor.id, anchor);
  }
  return [...byId.values()];
}

/**
 * Days in the reference shape. Free hours come from blocks, lessons and events;
 * school weekdays, Sundays and trip walls match the reference.
 */
export function openingDays({ dates, series, terms, busy, takenEvenings, walls, tags }) {
  const byDate = new Map(series.map(point => [point.date, point]));
  return dates.map(date => {
    const wd = weekday(date);
    const school = inTerm(date, terms) && wd >= 1 && wd <= 5;
    const point = byDate.get(date);
    return {
      date,
      pct: point?.pct ?? 0,
      weekday: wd,
      holiday: !inTerm(date, terms),
      walled: wd === 0 || walls.some(wall => date >= wall.from && date <= wall.to),
      freeDay: school || busy.has(date) ? 0 : 12,
      freeEvening: takenEvenings.has(date) ? 0 : school && wd !== 5 ? 3 : 4.5,
      tags: tags.get(date) ?? []
    };
  });
}

function occupyBlock(block, busy, taken, walls) {
  const start = hhmm(block.time);
  const end = hhmm(block.end_time);
  if (block.kind === 'wall') walls.push({ from: block.date, to: block.date });
  if (overlaps(start, end, DAY_START, DAY_END)) busy.add(block.date);
  if (overlaps(start, end, EVE_START, EVE_END)) taken.add(block.date);
}

function eventSpan(event) {
  if (event.all_day === true && typeof event.date === 'string') return { date: event.date, allDay: true };
  if (typeof event.date === 'string' && event.time) {
    return { date: event.date, start: hhmm(event.time), end: hhmm(event.end_time) };
  }
  const date = typeof event.date === 'string' && DATE.test(event.date) ? event.date : sydneyDate(event.start, event.time_zone);
  if (!date) return null;
  if (event.all_day === true || !event.start) return { date, allDay: true };
  const endDate = sydneyDate(event.end, event.time_zone);
  if (endDate && endDate !== date) return { date, allDay: true };
  return { date, start: sydneyMinutes(event.start, event.time_zone), end: sydneyMinutes(event.end, event.time_zone) };
}

function anchorFromMarked(record, prefix) {
  if (record?.anchor !== true) return null;
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const date = asDate(record.date) ?? sydneyDate(record.start, record.time_zone);
  if (!title || !date) return null;
  const tags = stringTags(record.tags) ?? [];
  const id = typeof record.id === 'string' && record.id.trim() ? `${prefix}-${record.id.trim()}` : `${prefix}-${date}`;
  const sub = typeof record.sub === 'string' && record.sub.trim() ? record.sub.trim() : title;
  return { id, title, kind: 'event', date, tags, sub };
}

export function buildAlmanac({
  today,
  from,
  to,
  anchors,
  done = [],
  terms = [],
  logs = [],
  blocks = [],
  lessons = [],
  professionalEvents = [],
  horizonCadence = null,
  medicationLogs = [],
  readinessEvents = []
}) {
  const dates = dateKeys(from, to);
  // Capacity: the same capacityForDates the Day and Week views use, fed the same
  // evidence (Life logs, check-ins, tracked sessions, classes), so a day reads the same
  // number in the Almanac as anywhere else.
  const logEvents = (logs ?? []).filter(event => event?.record && event.record.date <= today);
  // Same holiday rule as the Week view (school-time.js), so the holiday lift matches too.
  const capacity = capacityForDates([...logEvents, ...(readinessEvents ?? [])], dates, { isHoliday: date => isSchoolHoliday(date, terms ?? []), today });
  const series = dates.map(date => {
    const row = capacity.get(date);
    return { date, pct: row.pct, low: row.low ?? row.pct, high: row.high ?? row.pct };
  });

  const busy = new Set();
  const taken = new Set();
  const walls = [];
  const tags = new Map();
  const extras = [];
  for (const anchor of anchors) {
    if (anchor.kind === 'trip' && anchor.date && anchor.returns) walls.push({ from: anchor.date, to: anchor.returns });
    if (anchor.kind === 'event' && anchor.date) busy.add(anchor.date);
  }
  for (const block of blocks ?? []) {
    if (!block || !DATE.test(block.date ?? '')) continue;
    occupyBlock(block, busy, taken, walls);
    for (const tag of stringTags(block.tags) ?? []) addTag(tags, block.date, tag);
    const marked = anchorFromMarked(block, 'block');
    if (marked) extras.push(marked);
  }
  for (const lesson of lessons ?? []) {
    if (!lesson || !DATE.test(lesson.date ?? '')) continue;
    if (lesson.delivery_status === 'skipped' || lesson.delivery_status === 'rescheduled') continue;
    const start = hhmm(lesson.start_time);
    if (start != null && start >= EVE_START) taken.add(lesson.date);
    else busy.add(lesson.date);
  }
  for (const event of professionalEvents ?? []) {
    const state = event?.occurrence_state || event?.status;
    if (state === 'cancelled' || state === 'rescheduled') continue;
    const span = event ? eventSpan(event) : null;
    if (!span) continue;
    if (span.allDay || overlaps(span.start, span.end, DAY_START, DAY_END)) busy.add(span.date);
    if (!span.allDay && overlaps(span.start, span.end, EVE_START, EVE_END)) taken.add(span.date);
    for (const tag of stringTags(event.tags) ?? []) addTag(tags, span.date, tag);
    const marked = anchorFromMarked({ ...event, date: event.date ?? span.date }, 'event');
    if (marked) extras.push(marked);
  }
  const startYear = Number(from.slice(0, 4));
  const endYear = Number(to.slice(0, 4));
  for (let year = startYear; year <= endYear; year += 1) addTag(tags, dstStart(year), 'dst-start');

  const merged = applyAnchorDecisions(mergeAnchors(anchors, terms, extras), done);
  if (horizonCadence?.lastCompletedAt) {
    merged.push({
      id: 'horizon-council',
      title: 'Horizon Council',
      kind: 'event',
      tags: ['horizon-review'],
      sub: 'Quarterly cognitive review'
    });
  }
  const doneIds = new Set(done.filter(row => row.stepId && row.status !== 'not_doing').map(row => row.stepId));
  const notDoing = new Set(done.filter(row => row.stepId && row.status === 'not_doing').map(row => row.stepId));
  const lines = leadLines(merged, ALMANAC_RULES, { today, terms, done: doneIds, horizon: horizonCadence })
    .map(line => {
      const steps = line.steps.filter(step => !notDoing.has(step.id)).map(step => ({ ...step, actionId: `alm-${step.id}` }));
      // "Not doing" steps leave the line, so its urgency comes from what is left.
      const status = steps.length === line.steps.length
        ? line.status
        : steps.map(step => step.status).sort((a, b) => LINE_ORDER.indexOf(a) - LINE_ORDER.indexOf(b))[0] ?? 'later';
      return { ...line, steps, status, from: steps[0]?.lastSafe ?? line.end ?? line.from };
    });
  const computed = findOpenings(openingDays({ dates, series, terms, busy, takenEvenings: taken, walls, tags }), ALMANAC_WANTS);
  const openings = ALMANAC_WANTS.map(want => {
    const heldDates = heldDatesForWant(want.id, blocks, today);
    if (heldDates) {
      const pct = Math.min(...heldDates.map(date => series.find(point => point.date === date)?.pct ?? 0));
      return {
        wantId: want.id,
        title: want.title,
        span: want.span,
        with: want.with ?? null,
        dates: heldDates,
        pct,
        held: true,
        ids: {
          hold: null,
          draft: DRAFTS[want.id] ? `alm-draft-${want.id}` : null
        }
      };
    }
    const opening = computed.find(item => item.wantId === want.id) ?? {
      wantId: want.id, title: want.title, span: want.span, with: want.with ?? null, dates: [], pct: null
    };
    return {
      ...opening,
      held: false,
      ids: {
        hold: HOLD_TITLES[opening.wantId] ? `alm-hold-${opening.wantId}` : null,
        draft: DRAFTS[opening.wantId] ? `alm-draft-${opening.wantId}` : null
      }
    };
  });
  const summary = { ...almanacSummary(lines), openings: openings.filter(opening => opening.dates.length).length };
  const world = EXAMPLE_WORLD.filter(entry => entry.date >= from && entry.date <= to);
  const horizon = horizonEnd(today, merged);
  // Dexy context: an overlay on the forecast band, never a lower number (§3.1).
  const medication = medicationLogs.length ? medicationContext(medicationLogs, { today, from, to }) : null;
  return { lines, summary, series, openings, world, terms, today, from, to, horizon, ...(medication ? { medication } : {}) };
}

/** Future calendar_block from an Almanac hold — keeps that opening until its date passes. */
function heldDatesForWant(wantId, blocks, today) {
  const spec = HOLD_TITLES[wantId];
  if (!spec) return null;
  const matched = (blocks ?? []).filter(block => {
    if (!block || !DATE.test(block.date ?? '') || block.date < today) return false;
    const id = typeof block.id === 'string' ? block.id : '';
    if (id === `cb-alm-hold-${wantId}` || id.startsWith(`cb-alm-hold-${wantId}:`)) return true;
    if (block.title !== spec.title) return false;
    if (spec.with === 'corey') return block.kind === 'corey';
    return block.type === 'calendar_block' || block.kind === 'protected' || block.kind === 'corey';
  });
  if (!matched.length) return null;
  return [...new Set(matched.map(block => block.date))].sort();
}

function pathDate(path, pattern) {
  return pattern.exec(path)?.[1] ?? null;
}

async function readMatching(paths, readFile, predicate, warn) {
  const matched = paths.filter(predicate);
  const events = [];
  // Parallel blob reads in small batches — serial GitHub decode was a second hang.
  for (let i = 0; i < matched.length; i += TASKED_BATCH) {
    const slice = matched.slice(i, i + TASKED_BATCH);
    const texts = await Promise.all(
      slice.map(async (path) => {
        try {
          return { path, text: await readFile(path) };
        } catch (error) {
          warn(`almanac: ignoring ${path} (${error instanceof Error ? error.message : 'unreadable'})`);
          return { path, text: null };
        }
      })
    );
    for (const { path, text } of texts) {
      if (typeof text !== 'string') continue;
      try {
        events.push(parseEventDocument(text, path, loadYaml));
      } catch (error) {
        warn(`almanac: ignoring ${path} (${error instanceof Error ? error.message : 'invalid record'})`);
      }
    }
  }
  return events;
}

export async function readAlmanac({
  readFile,
  listPaths = () => [],
  today,
  from = null,
  to = null,
  terms = [],
  lessons = [],
  professionalEvents = [],
  horizon = null,
  readinessEvents = [],
  warn = console.warn
}) {
  const anchors = parseAlmanacAnchors(await readFile(ALMANAC_ANCHORS_PATH) ?? '', { warn });
  const done = parseAlmanacDone(await readFile(ALMANAC_DONE_PATH) ?? '', { warn });
  const rangeFrom = from ?? today;
  const rangeTo = to ?? horizonEnd(today, anchors);
  const paths = typeof listPaths === 'function' ? listPaths() : [];
  // Readiness reads three weeks of history (plus two days of symptom carry-over).
  const since = addDays(today, -(READINESS_LOOKBACK_DAYS + 2));
  const kept = paths.filter(path => {
    const date = pathDate(path, LOG_PATH);
    return date && date >= since && date <= today;
  });
  const logs = await readMatching(kept, readFile, () => true, warn);
  const dexSince = new Date(Date.parse(`${today}T00:00:00Z`) - 13 * 86_400_000).toISOString().slice(0, 10);
  const medicationLogs = (await readMatching(paths, readFile, path => {
    const date = pathDate(path, DEX_PATH);
    return date && date >= dexSince && date <= today;
  }, warn)).map(event => event.record).filter(record => record?.type === 'medication');
  const blocks = (await readMatching(
    paths,
    readFile,
    path => {
      const date = pathDate(path, BLOCK_PATH);
      return date && date >= rangeFrom && date <= rangeTo;
    },
    warn
  )).map(event => event.record);

  return buildAlmanac({
    today,
    from: rangeFrom,
    to: rangeTo,
    anchors,
    done,
    terms,
    logs,
    blocks,
    lessons,
    professionalEvents,
    horizonCadence: horizon,
    medicationLogs,
    readinessEvents
  });
}

function longDate(date) {
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC'
  }).format(new Date(`${date}T00:00:00Z`));
}

function whenText(dates) {
  if (dates.length === 2) return `${longDate(dates[0])} and ${longDate(dates[1])}`;
  return longDate(dates[0]);
}

export function ghostsForAlmanacAction(id, view) {
  if (typeof id !== 'string' || !id.startsWith('alm-')) return null;
  if (id.startsWith('alm-draft-')) {
    const wantId = id.slice('alm-draft-'.length);
    const opening = view.openings.find(item => item.wantId === wantId && item.dates.length);
    const draft = DRAFTS[wantId];
    if (!opening || !draft) return null;
    return [{
      id,
      agent: 'hammond',
      kind: 'draft_message',
      to: draft.to,
      text: draft.text.replaceAll('{when}', whenText(opening.dates))
    }];
  }
  if (id.startsWith('alm-hold-')) {
    const wantId = id.slice('alm-hold-'.length);
    const opening = view.openings.find(item => item.wantId === wantId && item.dates.length);
    const spec = HOLD_TITLES[wantId];
    if (!opening || !spec) return null;
    const blocks = wantId === 'newcastle'
      ? opening.dates.map(date => ({ date, ...spec }))
      : [{ date: opening.dates[0], ...spec }];
    return blocks.map((block, index) => ({
      id: blocks.length > 1 ? `${id}:${index}` : id,
      agent: 'hammond',
      kind: 'protect_block',
      date: block.date,
      start: block.start,
      end: block.end,
      title: block.title,
      ...(block.with ? { with: block.with } : {})
    }));
  }
  const stepId = id.slice('alm-'.length);
  const step = view.lines.flatMap(line => line.steps).find(item => item.id === stepId);
  if (!step) return null;
  const horizonReview = isHorizonReviewStepId(stepId);
  let due = step.lastSafe;
  if (horizonReview && view.today && due < view.today) due = view.today;
  return [{
    id,
    agent: 'hammond',
    kind: 'create_task',
    title: horizonReview ? 'Run the Horizon Council review' : step.title,
    due,
    source: `almanac:${stepId}`
  }];
}

async function listBlobRecords(env, storeName, prefix) {
  const { getStore } = await import('@netlify/blobs');
  const { listBlobKeys } = await import('./_shared/blobs-list.mjs');
  const store = getStore(storeName);
  const keys = (await listBlobKeys(store, prefix)).filter(key => !key.endsWith('/_index'));
  const rows = await Promise.all(keys.map(key => getJSON(store, key)));
  return rows.filter(row => row && typeof row === 'object');
}

export async function loadTeachingLessonsFromBlobs(env = process.env) {
  try {
    const { teachingStoreOptions, SCHEDULED_LESSON_PREFIX } = await import('./_shared/teaching-blobs.mjs');
    const { getStore } = await import('@netlify/blobs');
    const { listBlobKeys } = await import('./_shared/blobs-list.mjs');
    const store = getStore(teachingStoreOptions(env));
    const keys = (await listBlobKeys(store, SCHEDULED_LESSON_PREFIX)).filter(key => !key.endsWith('/_index'));
    const rows = await Promise.all(keys.map(key => getJSON(store, key)));
    return rows.filter(row => row && typeof row === 'object');
  } catch (error) {
    console.warn(`almanac: teaching lessons unavailable (${error instanceof Error ? error.message : 'error'})`);
    return [];
  }
}

export async function loadProfessionalEventsFromBlobs() {
  try {
    const { PROFESSIONAL_CONTENT_STORE, EVENT_PREFIX } = await import('./_shared/professional-blobs.mjs');
    return await listBlobRecords(process.env, PROFESSIONAL_CONTENT_STORE, EVENT_PREFIX);
  } catch (error) {
    console.warn(`almanac: professional events unavailable (${error instanceof Error ? error.message : 'error'})`);
    return [];
  }
}

/* ---------- saved Almanac copy ---------- */

export const ALMANAC_SNAPSHOT_KEY = 'meta/almanac_snapshot';
/** Blob inputs (tasks, lessons, Professional) have no commit to watch; cap how stale they can get. */
export const ALMANAC_SNAPSHOT_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export function snapshotKey(from, to) {
  return `${from ?? ''}|${to ?? ''}`;
}

/**
 * A saved copy is served only when it is for the same range, built today (Sydney),
 * against the current repo head, and younger than the cap. Any repo write
 * (a log, a calendar block, a done/not-going decision) changes the head.
 */
export function snapshotUsable(saved, { key, today, commitSha, nowMs }) {
  if (!saved || typeof saved !== 'object' || !saved.view) return false;
  if (saved.key !== key || saved.today !== today) return false;
  if (!commitSha || saved.commitSha !== commitSha) return false;
  const built = Date.parse(saved.built_at ?? '');
  return Number.isFinite(built) && nowMs - built >= 0 && nowMs - built < ALMANAC_SNAPSHOT_MAX_AGE_MS;
}

export async function readAlmanacSnapshot(tasksStore) {
  try {
    return await getJSON(await tasksStore(), ALMANAC_SNAPSHOT_KEY);
  } catch {
    return null;
  }
}

export async function writeAlmanacSnapshot(tasksStore, snapshot) {
  try {
    await setJSON(await tasksStore(), ALMANAC_SNAPSHOT_KEY, snapshot);
  } catch (error) {
    console.warn(`almanac: snapshot not saved (${error instanceof Error ? error.message : 'error'})`);
  }
}

/** The full rebuild — what every open used to do. */
export async function computeAlmanac({
  opened, env, today, from, to, tasksStore, loadLessons, loadProfessionalEvents, getCognitiveStore
}) {
  const [terms, lessons, professionalEvents, tasked, horizon] = await Promise.all([
    readSchoolTerms(tasksStore),
    loadLessons(env),
    loadProfessionalEvents(env),
    readAlmanacTasked(tasksStore),
    loadHorizonAlmanacContext(env, { getCognitiveStore })
  ]);
  let store = null;
  try {
    store = typeof tasksStore === 'function' ? await tasksStore() : null;
  } catch {
    store = null;
  }
  const readinessEvents = await readinessEvidenceEvents({ store, today, lessons });
  const view = await readAlmanac({
    readFile: path => opened.readFile(path),
    listPaths: () => opened.listPaths(),
    today,
    from,
    to,
    terms,
    lessons,
    professionalEvents,
    horizon,
    readinessEvents
  });
  return { view, tasked };
}

/** Open the repo head for reading (tree once, blobs on demand). */
export async function openAlmanacRepo(client) {
  const resolved = await client.resolveTree();
  const blobs = new Map(
    (resolved.tree ?? [])
      .filter(entry => entry?.type === 'blob' && typeof entry.path === 'string')
      .map(entry => [entry.path, entry.sha])
  );
  return {
    base: { commitSha: resolved.commitSha, treeSha: resolved.treeSha },
    listPaths() { return [...blobs.keys()]; },
    async readFile(path) {
      const sha = blobs.get(path);
      if (!sha) return null;
      return decodeBlob(await client.readBlob(sha));
    }
  };
}

/**
 * 5:30 sweep: rebuild the saved copy for the range the page asks for
 * (today → a year out), so the first open of the day is instant.
 */
export async function refreshAlmanacSnapshot({
  env = process.env,
  client,
  now = Date.now,
  getTasksStore = defaultGetTasksStore,
  getCognitiveStore = defaultGetCognitiveStore,
  loadLessons = loadTeachingLessonsFromBlobs,
  loadProfessionalEvents = loadProfessionalEventsFromBlobs
} = {}) {
  const today = getSydneyDateKey(new Date(now()));
  const from = today;
  const to = addDays(today, 365);
  const tasksStore = () => getTasksStore(env);
  const opened = await openAlmanacRepo(client);
  const { view, tasked } = await computeAlmanac({
    opened, env, today, from, to, tasksStore, loadLessons, loadProfessionalEvents, getCognitiveStore
  });
  const built_at = new Date(now()).toISOString();
  await writeAlmanacSnapshot(tasksStore, { key: snapshotKey(from, to), today, commitSha: opened.base.commitSha, built_at, view, tasked });
  return { built_at, lines: view.lines.length };
}

function fail(status, code, message) {
  return { status, payload: { ok: false, error: { code, message, retryable: false } } };
}

function isDonePath(url) {
  return url.pathname === '/api/almanac/done';
}

export async function loadHorizonAlmanacContext(env = process.env, {
  getCognitiveStore = defaultGetCognitiveStore,
  owner = env.COGNITIVE_OWNER_ID || 'operator'
} = {}) {
  try {
    const store = await getCognitiveStore(env);
    if (!store) return null;
    const last = await lastCompletedRun(store, owner, 'horizon');
    if (!last?.completedAt) return null;
    return { lastCompletedAt: horizonCompletedDateKey(last.completedAt) };
  } catch (error) {
    console.warn(`almanac: horizon cadence unavailable (${error instanceof Error ? error.message : 'error'})`);
    return null;
  }
}

export function createAlmanacHandler({
  env = process.env,
  fetchImpl = fetch,
  verifySessionToken: verify = verifySessionToken,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie,
  createGitHubClient: createClient = createGitHubClient,
  now = Date.now,
  getTasksStore = defaultGetTasksStore,
  getCognitiveStore = defaultGetCognitiveStore,
  loadLessons = async () => [],
  loadProfessionalEvents = async () => []
} = {}) {
  return async function almanacHandler(request) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);
    return withCors(await handle(request), request, env);
  };

  async function handle(request) {
    const url = new URL(request.url);
    const done = isDonePath(url);
    if (done ? request.method !== 'POST' : request.method !== 'GET') {
      return methodNotAllowed(done ? 'POST' : 'GET');
    }
    const originError = guardRequestOrigin(request, env);
    if (originError) return originError;
    if (!isConfigured(env)) return misconfiguredResponse();

    let session;
    try {
      session = verify(readUmbrellaSessionCookie(request), umbrellaSessionSecret(env), now());
    } catch {
      return misconfiguredResponse();
    }
    if (!session.valid) {
      return errorResponse(401, 'unauthenticated', 'Please sign in to continue.', false, {
        ...PRIVATE_CACHE,
        'set-cookie': clearCookie()
      });
    }

    let client;
    try {
      client = createClient({ env, fetchImpl });
    } catch (error) {
      if (error instanceof GitHubConfigurationError) return misconfiguredResponse();
      return errorResponse(503, 'github_unavailable', 'The repository is temporarily unavailable.', true, PRIVATE_CACHE);
    }

    const open = () => openAlmanacRepo(client);
    const commit = (changed, base, message) => client.commitFiles({
      files: [...changed.entries()].map(([path, content]) => ({ path, content })),
      message,
      parentSha: base.commitSha,
      baseTreeSha: base.treeSha
    });
    const tasksStore = () => getTasksStore(env);

    try {
      if (!done) {
        try {
          // `fresh=1` (rebuild now) is the one extra parameter the range check allows.
          const range = new URL(url);
          if (range.searchParams.has('fresh') && range.searchParams.get('fresh') !== '1') throw new TypeError('fresh');
          range.searchParams.delete('fresh');
          parseDateRange(range);
        } catch {
          return jsonResponse(400, fail(400, 'invalid_date_range', 'Provide from and to as YYYY-MM-DD.').payload, PRIVATE_CACHE);
        }
        const opened = await open();
        const today = getSydneyDateKey(new Date(now()));
        const from = url.searchParams.get('from');
        const to = url.searchParams.get('to');
        const key = snapshotKey(from, to);
        // Saved copy: one tree lookup + one Blob read instead of dozens of GitHub reads.
        if (url.searchParams.get('fresh') !== '1') {
          const saved = await readAlmanacSnapshot(tasksStore);
          if (snapshotUsable(saved, { key, today, commitSha: opened.base.commitSha, nowMs: now() })) {
            return jsonResponse(200, {
              ok: true,
              ...saved.view,
              tasked: saved.tasked,
              snapshot: { built_at: saved.built_at, cached: true }
            }, PRIVATE_CACHE);
          }
        }
        const { view, tasked } = await computeAlmanac({
          opened, env, today, from, to, tasksStore, loadLessons, loadProfessionalEvents, getCognitiveStore
        });
        const built_at = new Date(now()).toISOString();
        await writeAlmanacSnapshot(tasksStore, { key, today, commitSha: opened.base.commitSha, built_at, view, tasked });
        return jsonResponse(200, { ok: true, ...view, tasked, snapshot: { built_at, cached: false } }, PRIVATE_CACHE);
      }

      const text = await request.text();
      if (Buffer.byteLength(text) > MAX_BODY_BYTES) {
        return jsonResponse(400, fail(400, 'invalid_request', 'The request body is too large.').payload, PRIVATE_CACHE);
      }
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        return jsonResponse(400, fail(400, 'invalid_request', 'The request body was not valid JSON.').payload, PRIVATE_CACHE);
      }
      const body = readDoneRequest(parsed);
      if (body.error === 'client_write_rejected') {
        return jsonResponse(400, fail(400, 'client_write_rejected', 'The client cannot send writes.').payload, PRIVATE_CACHE);
      }
      if (body.error) {
        return jsonResponse(400, fail(400, 'invalid_request', 'Provide stepId.').payload, PRIVATE_CACHE);
      }
      const at = getSydneyTimestamp(new Date(now()));
      const row = { ...body, at };
      const message = body.anchorId
        ? `chore(almanac): ${body.anchorId} ${body.status === 'moved' ? `moved to ${body.date}` : 'not going'}`
        : `chore(almanac): mark ${body.stepId} ${body.status === 'not_doing' ? 'not doing' : 'done'}`;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const opened = await open();
        const next = appendAlmanacDecision(await opened.readFile(ALMANAC_DONE_PATH) ?? '', row);
        try {
          // The commit changes the repo head, so the saved copy is rebuilt on the next open.
          await commit(new Map([[ALMANAC_DONE_PATH, next]]), opened.base, message);
          return jsonResponse(200, { ok: true, ...row }, PRIVATE_CACHE);
        } catch (error) {
          if (error instanceof GitHubClientError && error.code === 'write_conflict' && attempt === 0) continue;
          throw error;
        }
      }
      return jsonResponse(409, fail(409, 'write_conflict', 'The repository changed while saving. Try again.').payload, PRIVATE_CACHE);
    } catch (error) {
      if (error instanceof GitHubClientError) {
        return jsonResponse(error.code === 'write_conflict' ? 409 : 503, {
          ok: false,
          error: { code: error.code, message: 'The repository is temporarily unavailable.', retryable: error.retryable === true }
        }, PRIVATE_CACHE);
      }
      return jsonResponse(503, {
        ok: false,
        error: { code: 'github_unavailable', message: 'The repository is temporarily unavailable.', retryable: true }
      }, PRIVATE_CACHE);
    }
  }
}

export default createAlmanacHandler({
  loadLessons: loadTeachingLessonsFromBlobs,
  loadProfessionalEvents: loadProfessionalEventsFromBlobs
});
