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
import { defaultGetTasksStore, getJSON, readTaskIndex, taskKey } from './_shared/tasks-blobs.mjs';
import { parseEventDocument } from '../../apps/life/js/core/records.js';
import { getSydneyDateKey, getSydneyTimestamp } from '../../apps/life/js/core/time.js';
import { addDays, almanacSummary, leadLines } from '../../packages/design-kit/js/lead-lines.js';
import { findOpenings } from '../../packages/design-kit/js/openings.js';
import { ALMANAC_RULES, ALMANAC_WANTS } from '../../apps/life/js/app/almanac-rules.js';
import { CAPACITY, capacityForDates, forecastSeries } from '../../apps/life/js/app/capacity-model.js';

export const ALMANAC_ANCHORS_PATH = 'almanac-anchors.yml';
export const ALMANAC_DONE_PATH = 'almanac-done.json';
export const HUB_PREFS_KEY = 'meta/hub_prefs';

export const config = { path: '/api/almanac' };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STEP_ID = /^[a-z0-9][a-z0-9:-]*$/i;
const KINDS = new Set(['trip', 'medical', 'event', 'term', 'dream']);
const LOG_PATH = /^data\/(?:sleep|mind)\/\d{4}\/\d{2}\/(\d{4}-\d{2}-\d{2})-[a-z0-9-]+\.md$/;
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
    const stepId = row && typeof row.stepId === 'string' ? row.stepId.trim() : '';
    const at = row && typeof row.at === 'string' ? row.at.trim() : '';
    if (!stepId || !at) {
      warn(`almanac: ignoring done row at index ${index}`);
      return;
    }
    rows.push({ stepId, at });
  });
  return rows;
}

export function appendAlmanacDone(text, stepId, at, { warn = console.warn } = {}) {
  const rows = parseAlmanacDone(typeof text === 'string' ? text : '', { warn });
  rows.push({ stepId, at });
  return `${JSON.stringify(rows, null, 2)}\n`;
}

export function parseSchoolTerms(value, { warn = console.warn } = {}) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    warn('almanac: ignoring school_terms (expected a list)');
    return [];
  }
  const terms = [];
  value.forEach((row, index) => {
    const starts_on = asDate(row?.starts_on);
    const ends_on = asDate(row?.ends_on);
    if (!starts_on || !ends_on || starts_on > ends_on) {
      warn(`almanac: ignoring school term at index ${index}`);
      return;
    }
    terms.push({
      term: Number.isInteger(row.term) ? row.term : null,
      starts_on,
      ends_on
    });
  });
  return terms;
}

export async function readAlmanacTasked(tasksStore, { warn = console.warn } = {}) {
  if (typeof tasksStore !== 'function') return [];
  try {
    const store = await tasksStore();
    const index = await readTaskIndex(store);
    const out = [];
    for (const id of index) {
      const task = await getJSON(store, taskKey(id));
      const source = typeof task?.source === 'string' ? task.source : '';
      if (source.startsWith('almanac:')) out.push(source.slice('almanac:'.length));
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

export function readDoneRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'invalid_request' };
  for (const key of Object.keys(body)) {
    if (key !== 'stepId') return { error: 'client_write_rejected' };
  }
  if (typeof body.stepId !== 'string' || !STEP_ID.test(body.stepId)) return { error: 'invalid_request' };
  return { stepId: body.stepId };
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

/** Term time −12 and first week back −6, until two terms of logs exist. */
function termPattern(date, terms, historyTerms) {
  if (historyTerms >= 2) return 0;
  let delta = 0;
  for (const term of terms) {
    if (date >= term.starts_on && date <= term.ends_on) delta -= 12;
    // Fixture first week is the start day through five days later (13/10–18/10).
    if (date >= term.starts_on && date <= addDays(term.starts_on, 5)) delta -= 6;
  }
  return delta;
}

function historyTermCount(terms, logDates) {
  return terms.filter(term => logDates.some(date => date >= term.starts_on && date <= term.ends_on)).length;
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
  professionalEvents = []
}) {
  const dates = dateKeys(from, to);
  const logEvents = (logs ?? []).filter(event => event?.record && (event.record.type === 'sleep' || event.record.type === 'diary') && event.record.date <= today);
  const logDates = [...new Set(logEvents.map(event => event.record.date))].sort();
  const capacity = capacityForDates(logEvents, logDates, { isHoliday: date => !inTerm(date, terms) });
  let last = null;
  for (const date of logDates) {
    const row = capacity.get(date);
    if (row && row.forecast !== true) last = { date, pct: row.pct };
  }
  if (!last) last = { date: today, pct: CAPACITY.baseline };
  const historyTerms = historyTermCount(terms, logDates);
  const series = forecastSeries(dates, {
    lastPct: last.pct,
    lastDate: last.date,
    isHoliday: date => !inTerm(date, terms),
    pattern: date => termPattern(date, terms, historyTerms)
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

  const merged = mergeAnchors(anchors, terms, extras);
  const doneIds = new Set(done.map(row => row.stepId));
  const lines = leadLines(merged, ALMANAC_RULES, { today, terms, done: doneIds }).map(line => ({
    ...line,
    steps: line.steps.map(step => ({ ...step, actionId: `alm-${step.id}` }))
  }));
  const openings = findOpenings(openingDays({ dates, series, terms, busy, takenEvenings: taken, walls, tags }), ALMANAC_WANTS).map(opening => ({
    ...opening,
    ids: {
      hold: HOLD_TITLES[opening.wantId] ? `alm-hold-${opening.wantId}` : null,
      draft: DRAFTS[opening.wantId] ? `alm-draft-${opening.wantId}` : null
    }
  }));
  const summary = { ...almanacSummary(lines), openings: openings.filter(opening => opening.dates.length).length };
  const world = EXAMPLE_WORLD.filter(entry => entry.date >= from && entry.date <= to);
  const horizon = horizonEnd(today, merged);
  return { lines, summary, series, openings, world, terms, today, from, to, horizon };
}

function pathDate(path, pattern) {
  return pattern.exec(path)?.[1] ?? null;
}

async function readMatching(paths, readFile, predicate, warn) {
  const events = [];
  for (const path of paths.filter(predicate)) {
    let text;
    try {
      text = await readFile(path);
    } catch (error) {
      warn(`almanac: ignoring ${path} (${error instanceof Error ? error.message : 'unreadable'})`);
      continue;
    }
    if (typeof text !== 'string') continue;
    try {
      events.push(parseEventDocument(text, path, loadYaml));
    } catch (error) {
      warn(`almanac: ignoring ${path} (${error instanceof Error ? error.message : 'invalid record'})`);
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
  warn = console.warn
}) {
  const anchors = parseAlmanacAnchors(await readFile(ALMANAC_ANCHORS_PATH) ?? '', { warn });
  const done = parseAlmanacDone(await readFile(ALMANAC_DONE_PATH) ?? '', { warn });
  const rangeFrom = from ?? today;
  const rangeTo = to ?? horizonEnd(today, anchors);
  const paths = typeof listPaths === 'function' ? listPaths() : [];
  // ponytail: streak penalty caps after two below-par days, so only the latest
  // handful of sleep/diary days are read. Upgrade: pass the caller's log window.
  const logPaths = paths
    .map(path => ({ path, date: pathDate(path, LOG_PATH) }))
    .filter(item => item.date && item.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date) || a.path.localeCompare(b.path));
  const kept = [];
  const seen = new Set();
  for (const item of logPaths) {
    if (!seen.has(item.date) && seen.size >= 14) continue;
    seen.add(item.date);
    kept.push(item.path);
  }
  const logs = await readMatching(kept, readFile, () => true, warn);
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
    professionalEvents
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
  return [{
    id,
    agent: 'hammond',
    kind: 'create_task',
    title: step.title,
    due: step.lastSafe,
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

function fail(status, code, message) {
  return { status, payload: { ok: false, error: { code, message, retryable: false } } };
}

function isDonePath(url) {
  return url.pathname === '/api/almanac/done';
}

export function createAlmanacHandler({
  env = process.env,
  fetchImpl = fetch,
  verifySessionToken: verify = verifySessionToken,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie,
  createGitHubClient: createClient = createGitHubClient,
  now = Date.now,
  getTasksStore = defaultGetTasksStore,
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

    const open = async () => {
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
    };
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
          parseDateRange(url);
        } catch {
          return jsonResponse(400, fail(400, 'invalid_date_range', 'Provide from and to as YYYY-MM-DD.').payload, PRIVATE_CACHE);
        }
        const opened = await open();
        const [terms, lessons, professionalEvents, tasked] = await Promise.all([
          readSchoolTerms(tasksStore),
          loadLessons(env),
          loadProfessionalEvents(env),
          readAlmanacTasked(tasksStore)
        ]);
        const view = await readAlmanac({
          readFile: path => opened.readFile(path),
          listPaths: () => opened.listPaths(),
          today: getSydneyDateKey(new Date(now())),
          from: url.searchParams.get('from'),
          to: url.searchParams.get('to'),
          terms,
          lessons,
          professionalEvents
        });
        return jsonResponse(200, { ok: true, ...view, tasked }, PRIVATE_CACHE);
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
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const opened = await open();
        const next = appendAlmanacDone(await opened.readFile(ALMANAC_DONE_PATH) ?? '', body.stepId, at);
        try {
          await commit(new Map([[ALMANAC_DONE_PATH, next]]), opened.base, `chore(almanac): mark ${body.stepId} done`);
          return jsonResponse(200, { ok: true, stepId: body.stepId, at }, PRIVATE_CACHE);
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
