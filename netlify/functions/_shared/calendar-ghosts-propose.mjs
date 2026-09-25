/**
 * Morning ghost propose: load the week, call proposeGhosts, append to the queue.
 * Shared by the Netlify schedule, calendar GET refresh, and mock POST.
 */
import { load as loadYaml } from 'js-yaml';
import { parseEventDocument } from '../../../apps/life/js/core/records.js';
import { getSydneyDateKey, getSydneyMinutesOfDay, getSydneyTimestamp } from '../../../apps/life/js/core/time.js';
import { capacityForDates } from '../../../apps/life/js/app/capacity-model.js';
import { proposeGhosts } from '../../../apps/life/js/app/ghost-proposer.js';
import { addDays } from '../../../packages/design-kit/js/lead-lines.js';
import {
  CALENDAR_GHOST_DECISIONS_PATH,
  PENDING_CALENDAR_GHOSTS_PATH,
  alreadyQueued,
  parsePendingCalendarGhostsDoc,
  serializePendingCalendarGhosts
} from '../calendar-ghosts.mjs';
import {
  readAlmanac,
  readSchoolTerms
} from '../almanac.mjs';

const DAY_MS = 86_400_000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const WINDOW_START_MIN = 5 * 60 + 25; // 05:25 Sydney
const WINDOW_END_MIN = 6 * 60 + 35; // 06:35 Sydney
const RECORD_PATH = /^data\/(?:nutrition|fitness|mind|sleep|heart|skincare|fragrance|body|calendar)\/\d{4}\/\d{2}\/(\d{4}-\d{2}-\d{2})-[a-z0-9-]+\.md$/;
const LEGACY_RECORD_PATH = /^records\/\d{4}\/\d{2}\/\d{2}\/[^/]+\.md$/; // visual-seed workout path
const VISUAL_PATH = 'calendar-visual.json';

function mondayOf(key) {
  const ms = Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
  const dow = (new Date(ms).getUTCDay() + 6) % 7;
  return new Date(ms - dow * DAY_MS).toISOString().slice(0, 10);
}

function weekDates(today) {
  const monday = mondayOf(today);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

function parseDecisionsJsonl(text) {
  if (typeof text !== 'string' || !text.trim()) return [];
  const rows = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed);
      if (row && typeof row === 'object') rows.push(row);
    } catch {
      // skip corrupt lines
    }
  }
  return rows;
}

/** Exactly one of the two UTC cron slots should fire — the 05:30 Sydney one. */
export function inSydneyProposeWindow(instant = new Date()) {
  const mins = getSydneyMinutesOfDay(instant instanceof Date ? instant : new Date(instant));
  return mins >= WINDOW_START_MIN && mins <= WINDOW_END_MIN;
}

/**
 * Refresh when: no run for today, last run > 2h ago, or today's Life records
 * changed (newest updated_at > last_run.newest_record_at).
 */
export function shouldRefreshPropose(last_run, { today, nowMs, newestRecordAt }) {
  if (!last_run || last_run.date !== today) return true;
  const lastAt = typeof last_run.at === 'string' ? Date.parse(last_run.at) : NaN;
  if (Number.isFinite(lastAt) && Number.isFinite(nowMs) && (nowMs - lastAt) > TWO_HOURS_MS) {
    return true;
  }
  if (typeof newestRecordAt === 'string' && newestRecordAt
    && (!last_run.newest_record_at || newestRecordAt > last_run.newest_record_at)) {
    return true;
  }
  return false;
}

/** Scheduled: skip if we already recorded a run for today's Sydney date. */
export function shouldScheduledPropose(last_run, today) {
  return !last_run || last_run.date !== today;
}

function pathDate(path) {
  return RECORD_PATH.exec(path)?.[1] ?? null;
}

/** Newest updated_at (else created_at) among Life records dated `today`. */
export function newestRecordAtForDate(events, today) {
  let newest = null;
  for (const event of events ?? []) {
    const rec = event?.record;
    if (!rec || rec.date !== today) continue;
    const at = typeof rec.updated_at === 'string' && rec.updated_at
      ? rec.updated_at
      : (typeof rec.created_at === 'string' ? rec.created_at : null);
    if (typeof at === 'string' && (!newest || at > newest)) newest = at;
  }
  return newest;
}

/**
 * Calendar GET: decide whether a refresh propose is due before loading school
 * terms, lessons or professional events. Peeks last_run + today's newest record.
 */
export async function peekRefreshDue({ open, today, nowMs, warn = console.warn } = {}) {
  if (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return true;
  const opened = await open();
  const doc = parsePendingCalendarGhostsDoc(await opened.readFile(PENDING_CALENDAR_GHOSTS_PATH));
  const paths = typeof opened.listPaths === 'function' ? opened.listPaths() : [];
  const events = await readEvents(paths, path => opened.readFile(path), addDays(today, -1), today, warn);
  const newestRecordAt = newestRecordAtForDate(events, today);
  return shouldRefreshPropose(doc.last_run, { today, nowMs, newestRecordAt });
}

async function readEvents(paths, readFile, from, to, warn) {
  const events = [];
  for (const path of paths) {
    const date = pathDate(path);
    const legacy = LEGACY_RECORD_PATH.test(path);
    if (!legacy && (!date || date < from || date > to)) continue;
    let text;
    try {
      text = await readFile(path);
    } catch (error) {
      warn?.(`calendar-ghosts-propose: ignoring ${path} (${error instanceof Error ? error.message : 'unreadable'})`);
      continue;
    }
    if (typeof text !== 'string') continue;
    try {
      if (legacy) {
        const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?([\s\S]*)$/.exec(text.trim());
        if (!match) continue;
        const record = loadYaml(match[1]);
        if (record && typeof record === 'object') events.push({ path, record, body: match[2]?.trim() ?? '' });
        continue;
      }
      events.push(parseEventDocument(text, path, loadYaml));
    } catch (error) {
      warn?.(`calendar-ghosts-propose: ignoring ${path} (${error instanceof Error ? error.message : 'invalid'})`);
    }
  }
  return events;
}

function applyVisualChipIds(events, visual) {
  if (!visual || !Array.isArray(visual.ITEMS)) return events;
  const byPath = new Map();
  for (const item of visual.ITEMS) {
    if (item?.recordPath && item.id) byPath.set(item.recordPath, item.id);
  }
  return events.map(event => {
    const chipId = byPath.get(event.path);
    if (!chipId || !event.record) return event;
    return { ...event, record: { ...event.record, chipId, id: event.record.id || chipId } };
  });
}

function readProfile(visual, planning) {
  const day = planning?.day_profile ?? visual?.day_profile ?? null;
  if (day) return { day_profile: day };
  return { day_profile: { sleep: '22:30' } };
}

/**
 * Core propose run. `open` / `commit` match calendar-ghosts.mjs.
 * trigger: 'scheduled' | 'refresh' | 'manual'
 * Returns { ok, proposed, skipped?, ghosts, last_run? }.
 */
export async function runCalendarGhostsPropose({
  open,
  commit,
  today,
  nowIso,
  nowMs = null,
  terms = [],
  lessons = [],
  professionalEvents = [],
  planningProfile = null,
  trigger = 'scheduled',
  instant = null,
  warn = console.warn
} = {}) {
  if (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    throw new TypeError('runCalendarGhostsPropose needs today (YYYY-MM-DD)');
  }

  if (trigger === 'scheduled' && !inSydneyProposeWindow(instant ?? new Date())) {
    return { ok: true, proposed: 0, skipped: 'outside_window', ghosts: [] };
  }

  const opened = await open();
  const doc = parsePendingCalendarGhostsDoc(await opened.readFile(PENDING_CALENDAR_GHOSTS_PATH));
  const queue = doc.ghosts;

  const week = weekDates(today);
  const horizonTo = addDays(today, 13);
  const from = week[0] < today ? week[0] : today;
  const paths = typeof opened.listPaths === 'function' ? opened.listPaths() : [];

  let visual = null;
  try {
    const raw = await opened.readFile(VISUAL_PATH);
    if (typeof raw === 'string' && raw.trim()) visual = JSON.parse(raw);
  } catch {
    visual = null;
  }

  const schoolTerms = terms.length ? terms : (visual?.school_terms ?? []);
  const events = applyVisualChipIds(
    await readEvents(paths, path => opened.readFile(path), addDays(from, -7), horizonTo, warn),
    visual
  );
  const newestRecordAt = newestRecordAtForDate(events, today);
  const clockMs = Number.isFinite(nowMs) ? nowMs : (typeof nowIso === 'string' ? Date.parse(nowIso) : Date.now());

  if (trigger === 'scheduled') {
    if (!shouldScheduledPropose(doc.last_run, today)) {
      return { ok: true, proposed: 0, skipped: 'already_ran', ghosts: [], last_run: doc.last_run };
    }
  } else if (trigger === 'refresh') {
    if (!shouldRefreshPropose(doc.last_run, { today, nowMs: clockMs, newestRecordAt })) {
      return { ok: true, proposed: 0, skipped: 'fresh', ghosts: [], last_run: doc.last_run };
    }
  }

  const isHoliday = date => schoolTerms.length
    ? !schoolTerms.some(term => date >= term.starts_on && date <= term.ends_on)
    : false;
  const capacityDates = [...new Set([...week, ...Array.from({ length: 14 }, (_, i) => addDays(today, i))])].sort();
  const capacity = capacityForDates(events, capacityDates, { isHoliday });

  const view = await readAlmanac({
    readFile: path => opened.readFile(path),
    listPaths: () => paths,
    today,
    from: today,
    to: horizonTo,
    terms: schoolTerms,
    lessons,
    professionalEvents,
    warn
  });

  const decisions = parseDecisionsJsonl(await opened.readFile(CALENDAR_GHOST_DECISIONS_PATH));
  const proposed = proposeGhosts({
    today,
    days: week,
    capacity,
    events,
    openings: view.openings ?? [],
    pending: queue,
    decisions,
    profile: readProfile(visual, planningProfile)
  }).filter(ghost => !alreadyQueued(queue, ghost));

  const via = trigger === 'refresh' || trigger === 'manual' ? trigger : 'scheduled';
  const stamped = proposed.map(ghost => ({
    ...ghost,
    created_at: nowIso,
    status: 'pending',
    via
  }));
  const next = [...queue, ...stamped];
  const last_run = {
    date: today,
    at: nowIso,
    newest_record_at: newestRecordAt
  };
  // Always record last_run — a run that proposes nothing still counts.
  const changed = new Map([[PENDING_CALENDAR_GHOSTS_PATH, serializePendingCalendarGhosts(next, last_run)]]);
  await commit(changed, opened.base, stamped.length
    ? `chore(calendar): propose ${stamped.length} ghost${stamped.length === 1 ? '' : 's'}`
    : 'chore(calendar): propose run (none)');
  if (stamped.length) console.log(`calendar-ghosts-propose: proposed ${stamped.length}`);
  return { ok: true, proposed: stamped.length, ghosts: stamped, last_run };
}

/** Build open/commit for a GitHub client the same way calendar-ghosts does. */
export function githubOpenCommit(client, { decodeBlob }) {
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
  return { open, commit };
}

export function createCalendarGhostsProposeHandler({
  env = process.env,
  fetchImpl = fetch,
  createGitHubClient,
  decodeBlob,
  now = Date.now,
  getTasksStore,
  loadLessons,
  loadProfessionalEvents,
  readSchoolTerms: readTerms = readSchoolTerms,
  trigger = 'scheduled'
} = {}) {
  return async function calendarGhostsProposeHandler() {
    const instant = new Date(now());
    const today = getSydneyDateKey(instant);
    const nowIso = getSydneyTimestamp(instant);
    let client;
    try {
      client = createGitHubClient({ env, fetchImpl });
    } catch {
      return { ok: false, error: 'github_unavailable' };
    }
    const { open, commit } = githubOpenCommit(client, { decodeBlob });
    const tasksStoreFn = getTasksStore ? () => getTasksStore(env) : null;
    const terms = tasksStoreFn ? await readTerms(tasksStoreFn) : [];
    const [lessons, professionalEvents] = await Promise.all([
      loadLessons ? loadLessons(env) : [],
      loadProfessionalEvents ? loadProfessionalEvents(env) : []
    ]);
    return runCalendarGhostsPropose({
      open,
      commit,
      today,
      nowIso,
      nowMs: instant.getTime(),
      instant,
      terms,
      lessons,
      professionalEvents,
      trigger
    });
  };
}
