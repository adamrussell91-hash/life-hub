/**
 * Shared hub-source loaders (same auth/API Life already uses).
 * Each source has its own loading / live / error state — never a silent 0 on failure.
 */

import { teachingEventsFromCurriculum } from './teaching-calendar.js';
import {
  tasksEventsFromTasks,
  tasksEventsFromProjects,
  tasksEventsFromWorkBlocks,
  tasksEventsFromWorkSessions,
  scheduleDiffActiveProposed
} from './tasks-calendar.js';
import {
  professionalEventsFromProjections,
  promiseEventsFromLedger,
  sydneyTodayKey
} from './professional-calendar.js';
import { knowledgeEventsFromPages } from './knowledge-calendar.js';
import { loadLifeCalendarEvents } from './load-life-events.js';
import { resolveSchoolTerms } from './school-terms.js';
import { calendarFeedRange, eventsFromCalendarFeeds, summarizeIcalFeedStatuses } from './ical-calendar.js';

export const HUB_SOURCE_IDS = Object.freeze([
  'teaching',
  'tasks',
  'professional',
  'knowledge',
  'life',
  'feeds'
]);

export const HUB_SOURCE_LABEL = Object.freeze({
  teaching: 'Teaching',
  tasks: 'Tasks',
  professional: 'Professional',
  knowledge: 'Knowledge',
  life: 'Life',
  feeds: 'iCloud calendars'
});

function emptyBucket() {
  return { status: 'pending', events: [], error: null, meta: null };
}

/** Cap a hung cross-hub fetch so one source cannot block the calendar for ~30s. */
const SOURCE_FETCH_MS = 12_000;

function withSourceTimeout(init) {
  if (typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function') {
    return init;
  }
  if (init?.signal) return init;
  return { ...(init || {}), signal: AbortSignal.timeout(SOURCE_FETCH_MS) };
}

async function readOkJson(apiFetch, path, init) {
  const response = await apiFetch(path, withSourceTimeout(init));
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) {
    const err = new Error('request_failed');
    err.status = response.status;
    err.code = payload?.error?.code ?? 'request_failed';
    throw err;
  }
  return payload;
}

/**
 * @param {{
 *   apiFetch: (path: string, init?: RequestInit) => Promise<Response>,
 *   loadLife?: () => Promise<unknown[]>,
 *   today?: string,
 *   onChange?: () => void
 * }} opts
 */
export function createHubSourceLoader(opts) {
  if (typeof opts?.apiFetch !== 'function') throw new TypeError('apiFetch is required');
  const rawFetch = opts.apiFetch;

  // Netlify Blobs reads are eventually consistent: a refetch straight after a tick or a
  // drag can return the row as it was before the save, and the calendar would undo itself.
  // Remember what each PATCH saved for a minute and keep it over an older server copy.
  const WRITE_HOLD_MS = 60_000;
  /** @type {Map<string, { record: Record<string, any>, at: number }>} */
  const recentWrites = new Map();
  const WRITE_PATH = /^\/api\/(tasks|work-blocks)\?id=([^&]+)/;

  /** @param {string} path @param {RequestInit} [init] */
  async function apiFetch(path, init) {
    const response = await rawFetch(path, init);
    const match = String(init?.method || 'GET').toUpperCase() === 'PATCH' ? WRITE_PATH.exec(String(path)) : null;
    if (match && response.ok && typeof response.clone === 'function') {
      try {
        const payload = await response.clone().json();
        const record = payload?.data;
        if (payload?.ok !== false && record && typeof record === 'object' && typeof record.updated_at === 'string') {
          recentWrites.set(`${match[1]}:${decodeURIComponent(match[2])}`, { record, at: Date.now() });
          holdStatus(match[1] === 'tasks' ? 'task' : 'work_block', decodeURIComponent(match[2]), record);
        }
      } catch {
        /* the caller still reads the original body */
      }
    }
    return response;
  }

  /** The refetch repaints from the held events before new data lands: keep their status current. */
  function holdStatus(type, id, record) {
    if (typeof record.status !== 'string') return;
    const status = type === 'task' && (record.status === 'done' || record.completed_at) ? 'done' : record.status;
    buckets.tasks.events = buckets.tasks.events.map((event) =>
      event?.record?.type === type && event.record.id === id
        ? { ...event, record: { ...event.record, status } }
        : event
    );
  }

  /** Swap stale rows for the copy this page just saved; forget writes the server has caught up with. */
  function withRecentWrites(kind, rows) {
    if (!recentWrites.size || !Array.isArray(rows)) return rows;
    const now = Date.now();
    return rows.map((row) => {
      const key = `${kind}:${row?.id}`;
      const held = recentWrites.get(key);
      if (!held) return row;
      const serverAt = typeof row.updated_at === 'string' ? row.updated_at : '';
      if (now - held.at > WRITE_HOLD_MS || serverAt >= held.record.updated_at) {
        recentWrites.delete(key);
        return row;
      }
      return { ...row, ...held.record };
    });
  }
  const onChange = typeof opts.onChange === 'function' ? opts.onChange : () => {};
  const loadLife = typeof opts.loadLife === 'function' ? opts.loadLife : null;
  const today = typeof opts.today === 'string' ? opts.today : null;

  /** @type {Record<string, { status: string, events: unknown[], error: string | null, meta: unknown }>} */
  const buckets = Object.fromEntries(HUB_SOURCE_IDS.map((id) => [id, emptyBucket()]));
  /** @type {Record<string, Promise<void> | null>} */
  const inflight = Object.fromEntries(HUB_SOURCE_IDS.map((id) => [id, null]));
  /** @type {{ hubPrefs: unknown, visual: unknown, terms: unknown[] }} */
  let hubContext = { hubPrefs: null, visual: null, terms: [] };
  /** @type {Promise<void> | null} */
  let contextInflight = null;

  function notify() {
    onChange();
  }

  function setBucket(id, next) {
    buckets[id] = { ...buckets[id], ...next };
    notify();
  }

  function refreshTerms() {
    hubContext.terms = resolveSchoolTerms({
      hubPrefs: hubContext.hubPrefs,
      planningProfile: buckets.tasks?.meta?.planningProfile,
      visual: hubContext.visual
    });
  }

  async function loadHubContext() {
    if (contextInflight) return contextInflight;
    contextInflight = (async () => {
      try {
        const prefsPayload = await readOkJson(apiFetch, '/api/hub-prefs').catch(() => null);
        if (prefsPayload?.data) hubContext.hubPrefs = prefsPayload.data;
      } catch {
        /* terms fall through to planning-profile / visual */
      }
      refreshTerms();
      notify();
    })().finally(() => {
      contextInflight = null;
    });
    return contextInflight;
  }

  async function loadTeaching() {
    if (inflight.teaching) return inflight.teaching;
    setBucket('teaching', { status: 'loading', error: null });
    inflight.teaching = (async () => {
      try {
        const payload = await readOkJson(apiFetch, '/api/curriculum');
        const events = teachingEventsFromCurriculum(payload.data ?? null);
        setBucket('teaching', { status: 'live', events, error: null });
      } catch {
        setBucket('teaching', {
          status: 'error',
          events: [],
          error: "Couldn't load Teaching events"
        });
      } finally {
        inflight.teaching = null;
      }
    })();
    return inflight.teaching;
  }

  async function loadTasks() {
    if (inflight.tasks) return inflight.tasks;
    setBucket('tasks', { status: 'loading', error: null });
    inflight.tasks = (async () => {
      try {
        const [tasksPayload, projectsPayload, blocksPayload, profilePayload, missionPayload, diffPayload, sessionsPayload] =
          await Promise.all([
            readOkJson(apiFetch, '/api/tasks'),
            readOkJson(apiFetch, '/api/projects').catch(() => ({ data: { projects: [] } })),
            readOkJson(apiFetch, '/api/work-blocks').catch(() => ({ data: { work_blocks: [] } })),
            readOkJson(apiFetch, '/api/planning-profile').catch(() => ({ data: null })),
            readOkJson(apiFetch, '/api/workflow-state?id=week_mission%3Acurrent').catch(() => ({
              data: null
            })),
            readOkJson(apiFetch, '/api/workflow-state?id=schedule_diff%3Acurrent').catch(() => ({
              data: null
            })),
            readOkJson(apiFetch, '/api/work-sessions').catch(() => ({ data: { work_sessions: [] } }))
          ]);
        const ghostBlocks = scheduleDiffActiveProposed(diffPayload.data).map((block, index) => ({
          ...block,
          id: block.id || block.temp_id || `ghost_${index}`,
          status: 'proposed',
          ghost: true,
          source: block.source || 'clare'
        }));
        const tasks = withRecentWrites('tasks', tasksPayload.data?.tasks ?? []);
        const events = [
          ...tasksEventsFromTasks(tasks),
          ...tasksEventsFromProjects(projectsPayload.data?.projects ?? [], tasks),
          ...tasksEventsFromWorkBlocks(withRecentWrites('work-blocks', blocksPayload.data?.work_blocks ?? [])),
          ...tasksEventsFromWorkBlocks(ghostBlocks),
          ...tasksEventsFromWorkSessions(
            sessionsPayload.data?.work_sessions ?? [],
            new Map((tasksPayload.data?.tasks ?? []).map((task) => [task.id, task.title]))
          )
        ];
        setBucket('tasks', {
          status: 'live',
          events,
          error: null,
          meta: {
            planningProfile: profilePayload.data ?? null,
            weekMission: missionPayload.data ?? null
          }
        });
        refreshTerms();
      } catch {
        setBucket('tasks', {
          status: 'error',
          events: [],
          error: "Couldn't load Tasks events"
        });
      } finally {
        inflight.tasks = null;
      }
    })();
    return inflight.tasks;
  }

  async function loadProfessional() {
    if (inflight.professional) return inflight.professional;
    setBucket('professional', { status: 'loading', error: null });
    inflight.professional = (async () => {
      try {
        const response = await apiFetch('/api/schedule-projections', withSourceTimeout());
        const payload = await response.json().catch(() => null);
        if (response.status === 401 || response.status === 403) {
          setBucket('professional', {
            status: 'unavailable',
            events: [],
            error: null
          });
          return;
        }
        if (!response.ok || payload?.ok !== true) throw new Error('request_failed');
        const events = [
          ...professionalEventsFromProjections(payload.data?.projections ?? []),
          ...promiseEventsFromLedger(payload.data?.promises ?? [], today ?? sydneyTodayKey())
        ];
        setBucket('professional', { status: 'live', events, error: null });
      } catch {
        setBucket('professional', {
          status: 'error',
          events: [],
          error: "Couldn't load Professional events"
        });
      } finally {
        inflight.professional = null;
      }
    })();
    return inflight.professional;
  }

  async function loadKnowledge() {
    if (inflight.knowledge) return inflight.knowledge;
    setBucket('knowledge', { status: 'loading', error: null });
    inflight.knowledge = (async () => {
      try {
        const payload = await readOkJson(apiFetch, '/api/knowledge/pages');
        const pages = Array.isArray(payload.data)
          ? payload.data
          : (payload.data?.pages ?? []);
        const events = knowledgeEventsFromPages(pages);
        setBucket('knowledge', { status: 'live', events, error: null });
      } catch {
        setBucket('knowledge', {
          status: 'error',
          events: [],
          error: "Couldn't load Knowledge events"
        });
      } finally {
        inflight.knowledge = null;
      }
    })();
    return inflight.knowledge;
  }

  async function loadLifeSource() {
    if (inflight.life) return inflight.life;
    setBucket('life', { status: 'loading', error: null });
    inflight.life = (async () => {
      try {
        let events;
        if (loadLife) {
          events = await loadLife();
        } else {
          const result = await loadLifeCalendarEvents(apiFetch, today ? { today } : {});
          events = result.events;
          if (result.visual) {
            hubContext.visual = result.visual;
            refreshTerms();
          }
        }
        setBucket('life', {
          status: 'live',
          events: Array.isArray(events) ? events : [],
          error: null
        });
      } catch {
        setBucket('life', {
          status: 'error',
          events: [],
          error: "Couldn't load Life events"
        });
      } finally {
        inflight.life = null;
      }
    })();
    return inflight.life;
  }

  /** Adam's iCloud calendars, read-only (server holds the feed secrets). */
  async function loadFeeds() {
    if (inflight.feeds) return inflight.feeds;
    setBucket('feeds', { status: 'loading', error: null });
    inflight.feeds = (async () => {
      try {
        const range = calendarFeedRange(today ?? sydneyTodayKey());
        const payload = await readOkJson(apiFetch, `/api/calendar-feeds?from=${range.from}&to=${range.to}`);
        const feedMeta = payload.data?.feeds ?? [];
        const events = eventsFromCalendarFeeds(payload.data?.events ?? [], payload.data?.freed ?? []);
        const summary = summarizeIcalFeedStatuses(feedMeta);
        // Map summary severity onto bucket status (`ok` → `live`).
        const status = summary.severity === 'ok' ? 'live' : summary.severity;
        setBucket('feeds', {
          status,
          events,
          error: summary.line,
          meta: { feeds: feedMeta }
        });
      } catch (error) {
        // 401/404 (signed out, or an older API deploy): not an error worth a banner.
        const quiet = error?.status === 401 || error?.status === 403 || error?.status === 404;
        setBucket('feeds', {
          status: quiet ? 'unavailable' : 'error',
          events: [],
          error: quiet ? null : "Couldn't load your iCloud calendars"
        });
      } finally {
        inflight.feeds = null;
      }
    })();
    return inflight.feeds;
  }

  const loaders = {
    teaching: loadTeaching,
    tasks: loadTasks,
    professional: loadProfessional,
    knowledge: loadKnowledge,
    life: loadLifeSource,
    feeds: loadFeeds
  };

  return {
    /** The fetch the calendar writes through, so the loader sees what was just saved. */
    apiFetch,
    loadAll() {
      return Promise.all([loadHubContext(), ...HUB_SOURCE_IDS.map((id) => loaders[id]())]);
    },
    retry(sourceId) {
      if (sourceId === 'context') return loadHubContext();
      const load = loaders[sourceId];
      if (!load) return Promise.resolve();
      return load();
    },
    getEvents() {
      return HUB_SOURCE_IDS.flatMap((id) => buckets[id].events);
    },
    getStatuses() {
      return Object.fromEntries(
        HUB_SOURCE_IDS.map((id) => [
          id,
          {
            status: buckets[id].status,
            error: buckets[id].error,
            count: buckets[id].events.length,
            label: HUB_SOURCE_LABEL[id]
          }
        ])
      );
    },
    getMeta(sourceId) {
      return buckets[sourceId]?.meta ?? null;
    },
    getTerms() {
      refreshTerms();
      return hubContext.terms;
    },
    getVisual() {
      return hubContext.visual;
    },
    /** Map kit statuses onto Life's legacy sourceStatus keys. */
    legacySourceStatus() {
      const out = {};
      for (const id of ['teaching', 'tasks', 'professional', 'knowledge']) {
        const status = buckets[id].status;
        if (status === 'live') out[id] = 'live';
        else if (status === 'loading' || status === 'pending') out[id] = 'pending';
        else out[id] = 'unavailable';
      }
      return out;
    }
  };
}

/**
 * Paint fail-visible source errors. Never masquerades as a zero count.
 * @param {Document} doc
 * @param {HTMLElement} host
 * @param {Record<string, { status: string, error?: string | null, label?: string }>} statuses
 * @param {(sourceId: string) => void} onRetry
 */
export function paintSourceErrors(doc, host, statuses, onRetry) {
  let strip = host.querySelector(':scope > [data-part="source-errors"]');
  const errors = Object.entries(statuses || {}).filter(([, row]) => {
    const status = row?.status;
    return status === 'error' || status === 'degraded';
  });
  if (!errors.length) {
    strip?.remove();
    return;
  }
  if (!strip) {
    strip = doc.createElement('div');
    strip.className = 'cal-source-errors';
    strip.dataset.part = 'source-errors';
    strip.setAttribute('role', 'status');
    host.prepend(strip);
  }
  strip.replaceChildren();
  for (const [id, row] of errors) {
    const line = doc.createElement('p');
    line.className = 'cal-source-errors__line';
    line.dataset.source = id;
    if (row.status === 'degraded') line.dataset.severity = 'degraded';

    const msg = doc.createElement('span');
    msg.textContent = row.error || `Couldn't load ${row.label || id} events`;
    line.append(msg);

    // Retry helps a transport failure, not a missing Netlify secret.
    if (row.status === 'error') {
      const retry = doc.createElement('button');
      retry.type = 'button';
      retry.className = 'btn btn--ghost';
      retry.textContent = 'Retry';
      retry.dataset.retrySource = id;
      retry.addEventListener('click', () => onRetry?.(id));
      line.append(doc.createTextNode(' · '), retry);
    }
    strip.append(line);
  }
}
