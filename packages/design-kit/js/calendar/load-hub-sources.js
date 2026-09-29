/**
 * Shared hub-source loaders (same auth/API Life already uses).
 * Each source has its own loading / live / error state — never a silent 0 on failure.
 */

import { teachingEventsFromCurriculum } from './teaching-calendar.js';
import {
  tasksEventsFromTasks,
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
import { calendarFeedRange, eventsFromCalendarFeeds } from './ical-calendar.js';

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
  const apiFetch = opts.apiFetch;
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
        const [tasksPayload, blocksPayload, profilePayload, missionPayload, diffPayload, sessionsPayload] =
          await Promise.all([
            readOkJson(apiFetch, '/api/tasks'),
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
        const events = [
          ...tasksEventsFromTasks(tasksPayload.data?.tasks ?? []),
          ...tasksEventsFromWorkBlocks(blocksPayload.data?.work_blocks ?? []),
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
        const events = eventsFromCalendarFeeds(payload.data?.events ?? []);
        setBucket('feeds', { status: 'live', events, error: null, meta: { feeds: payload.data?.feeds ?? [] } });
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
  const errors = Object.entries(statuses || {}).filter(([, row]) => row?.status === 'error');
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
    const msg = doc.createElement('span');
    msg.textContent = row.error || `Couldn't load ${row.label || id} events`;
    const retry = doc.createElement('button');
    retry.type = 'button';
    retry.className = 'btn btn--ghost';
    retry.textContent = 'Retry';
    retry.dataset.retrySource = id;
    retry.addEventListener('click', () => onRetry?.(id));
    line.append(msg, doc.createTextNode(' · '), retry);
    strip.append(line);
  }
}
