/**
 * Morning ghost propose: load the week, call proposeGhosts, append to the queue.
 * Shared by the Netlify schedule and the mock POST /api/calendar-ghosts-propose.
 */
import { load as loadYaml } from 'js-yaml';
import { parseEventDocument } from '../../../apps/life/js/core/records.js';
import { getSydneyDateKey, getSydneyTimestamp } from '../../../apps/life/js/core/time.js';
import { capacityForDates } from '../../../apps/life/js/app/capacity-model.js';
import { proposeGhosts } from '../../../apps/life/js/app/ghost-proposer.js';
import { addDays } from '../../../packages/design-kit/js/lead-lines.js';
import {
  CALENDAR_GHOST_DECISIONS_PATH,
  PENDING_CALENDAR_GHOSTS_PATH,
  parsePendingCalendarGhosts,
  serializePendingCalendarGhosts
} from '../calendar-ghosts.mjs';
import {
  readAlmanac,
  readSchoolTerms
} from '../almanac.mjs';

const DAY_MS = 86_400_000;
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

function alreadyRanToday(queue, today) {
  return (queue ?? []).some(entry =>
    entry?.via === 'scheduled'
    && typeof entry.created_at === 'string'
    && entry.created_at.slice(0, 10) === today);
}

function pathDate(path) {
  return RECORD_PATH.exec(path)?.[1] ?? null;
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
 * Returns { ok, proposed, skipped?, ghosts }.
 */
export async function runCalendarGhostsPropose({
  open,
  commit,
  today,
  nowIso,
  terms = [],
  lessons = [],
  professionalEvents = [],
  planningProfile = null,
  warn = console.warn
} = {}) {
  if (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    throw new TypeError('runCalendarGhostsPropose needs today (YYYY-MM-DD)');
  }
  const opened = await open();
  const queue = parsePendingCalendarGhosts(await opened.readFile(PENDING_CALENDAR_GHOSTS_PATH));
  if (alreadyRanToday(queue, today)) {
    return { ok: true, proposed: 0, skipped: 'already_ran', ghosts: [] };
  }

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
  });

  if (!proposed.length) {
    return { ok: true, proposed: 0, ghosts: [] };
  }

  const stamped = proposed.map(ghost => ({
    ...ghost,
    created_at: nowIso,
    status: 'pending',
    via: 'scheduled'
  }));
  const next = [...queue, ...stamped];
  const changed = new Map([[PENDING_CALENDAR_GHOSTS_PATH, serializePendingCalendarGhosts(next)]]);
  await commit(changed, opened.base, `chore(calendar): propose ${stamped.length} ghost${stamped.length === 1 ? '' : 's'}`);
  console.log(`calendar-ghosts-propose: proposed ${stamped.length}`);
  return { ok: true, proposed: stamped.length, ghosts: stamped };
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
  readSchoolTerms: readTerms = readSchoolTerms
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
      terms,
      lessons,
      professionalEvents
    });
  };
}
