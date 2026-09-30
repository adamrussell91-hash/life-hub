/**
 * Shared hub calendar mount. Hub adapters stay thin: defaultFilter, fills, routeFor, mount.
 * Zoom changes update the hub router and re-paint in place — no host remount.
 */

import { mondayOf, addDaysKey } from '../school-time.js';
import { getSydneyDateKey } from '../sydney-clock.js';
import { renderTideline } from './render-tideline.js';
import { renderDayDial, unmountDayDial } from './render-day-dial.js';
import { renderTermRiver, unmountTermRiver } from './render-term-river.js';
import { renderAlmanac, unmountAlmanac } from './render-almanac.js';
import { defaultFilterForHub, writeFilterState } from './calendar-filter.js';
import { createHubSourceLoader, paintSourceErrors } from './load-hub-sources.js';
import { calendarZoomHref, normalizeCalendarZoom, parseCalendarZoom } from './hub-calendar-zoom.js';

/**
 * @typedef {{
 *   hub: string,
 *   fills?: Record<string, string>,
 *   defaultFilter?: Record<string, boolean>,
 *   routeFor: (item: unknown) => string | null | undefined,
 *   apiFetch: (path: string, init?: RequestInit) => Promise<Response>,
 *   getZoom?: () => string,
 *   setZoom?: (zoom: string) => void,
 *   loadLife?: () => Promise<unknown[]>,
 *   today?: string,
 *   now?: Date,
 *   rootClass?: string,
 *   onNavigate?: (href: string) => void,
 *   onReschedule?: (item: unknown, patch: { date?: string, start_time?: string | null, duration_min?: number }) => void | Promise<void>,
 *   onQuickAdd?: () => void,
 *   quickAddLabel?: string,
 *   classId?: string,
 *   eventFilter?: (event: unknown) => boolean
 * }} HubCalendarAdapter
 */

/**
 * @param {HTMLElement} host
 * @param {HubCalendarAdapter} adapter
 */
export function mountHubCalendar(host, adapter) {
  if (!host) throw new TypeError('host is required');
  if (!adapter?.hub || typeof adapter.apiFetch !== 'function' || typeof adapter.routeFor !== 'function') {
    throw new TypeError('adapter requires hub, apiFetch, routeFor');
  }

  const doc = host.ownerDocument || document;
  const hub = adapter.hub;
  if (adapter.defaultFilter) writeFilterState(hub, { ...defaultFilterForHub(hub), ...adapter.defaultFilter });
  else writeFilterState(hub, defaultFilterForHub(hub));

  let destroyed = false;
  /**
   * Suppress onChange paints until the first meaningful paint.
   * Do not wait for every hub source — a slow Life/Knowledge fetch used to
   * leave the host blank for ~30s while Tasks chrome (locks) already showed.
   * Tideline skips entrance on remount; Almanac fetches its own payload.
   */
  let ready = false;
  let selectedDate = adapter.today || getSydneyDateKey(adapter.now ?? new Date());
  let dayLayout = 'dial';
  let ghosts = [];
  let ghostsKey = '';
  let paintToken = 0;
  /** First paint budget: show skeleton immediately, then paint with whatever sources have arrived. */
  const FIRST_PAINT_MS = 1200;
  const GHOST_BUDGET_MS = 1500;

  const shell = doc.createElement('div');
  shell.className = 'hub-calendar-mount';
  shell.dataset.hub = hub;
  shell.dataset.part = 'hub-calendar-mount';
  if (adapter.rootClass) shell.classList.add(adapter.rootClass);
  host.replaceChildren(shell);

  const errorsHost = doc.createElement('div');
  errorsHost.dataset.part = 'source-errors-host';
  const calendarHost = doc.createElement('div');
  calendarHost.className = 'hub-calendar hub-calendar--workspace';
  calendarHost.dataset.part = 'calendar-host';
  shell.append(errorsHost, calendarHost);

  function paintLoading() {
    if (calendarHost.querySelector('[data-part="calendar-loading"]')) return;
    if (calendarHost.childElementCount) return;
    const note = doc.createElement('p');
    note.className = 'hub-calendar__loading';
    note.dataset.part = 'calendar-loading';
    note.setAttribute('role', 'status');
    note.textContent =
      currentZoom() === 'almanac' ? 'Loading Almanac…' : 'Loading calendar…';
    calendarHost.append(note);
  }

  function raceMs(promise, ms) {
    return Promise.race([
      Promise.resolve(promise).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, ms))
    ]);
  }

  function currentZoom() {
    if (typeof adapter.getZoom === 'function') return normalizeCalendarZoom(adapter.getZoom());
    const loc = doc.defaultView?.location;
    return (
      parseCalendarZoom({ pathname: loc?.pathname, hash: loc?.hash }, hub) || 'week'
    );
  }

  function writeZoom(zoom) {
    const next = normalizeCalendarZoom(zoom);
    if (typeof adapter.setZoom === 'function') {
      adapter.setZoom(next);
      return;
    }
    const href = calendarZoomHref(hub, next);
    const loc = doc.defaultView?.location;
    if (!loc) return;
    if (href.startsWith('#')) {
      if (loc.hash !== href) loc.hash = href;
    } else if (typeof adapter.onNavigate === 'function') {
      adapter.onNavigate(href);
    } else if (loc.pathname !== href) {
      loc.assign(href);
    }
  }

  const loader = createHubSourceLoader({
    apiFetch: adapter.apiFetch,
    loadLife: adapter.loadLife,
    today: adapter.today,
    onChange: () => {
      // After first paint: late sources re-paint (Tideline skips entrance; Almanac stays mounted).
      if (!destroyed && ready) schedulePaint();
    }
  });

  function weekFor(date) {
    const monday = mondayOf(date);
    return Array.from({ length: 7 }, (_, i) => addDaysKey(monday, i));
  }

  function ghostRange(zoom) {
    if (zoom === 'term' || zoom === 'year' || zoom === 'almanac') {
      return { from: addDaysKey(selectedDate, -120), to: addDaysKey(selectedDate, 240) };
    }
    const week = weekFor(selectedDate);
    return { from: week[0], to: week[6] };
  }

  async function loadGhosts(zoom) {
    const range = ghostRange(zoom);
    const key = `${range.from}:${range.to}`;
    if (key === ghostsKey) return;
    try {
      const response = await adapter.apiFetch(
        `/api/calendar-ghosts?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`
      );
      const payload = await response.json().catch(() => null);
      ghosts = response.ok && Array.isArray(payload?.ghosts) ? payload.ghosts : [];
    } catch {
      ghosts = [];
    }
    ghostsKey = key;
  }

  function schedulePaint() {
    const token = ++paintToken;
    queueMicrotask(() => {
      if (!destroyed && token === paintToken) paint();
    });
  }

  function scopedEvents() {
    let events = loader.getEvents();
    if (typeof adapter.eventFilter === 'function') {
      events = events.filter((event) => adapter.eventFilter(event));
    } else if (adapter.classId) {
      const classId = adapter.classId;
      events = events.filter((event) => {
        const record = event && typeof event === 'object' ? event.record : null;
        if (record?.type === 'scheduled_lesson') return record.class_id === classId;
        return true;
      });
    }
    return events;
  }

  function sharedInput(zoom) {
    const today = adapter.today || getSydneyDateKey(adapter.now ?? new Date());
    const week = weekFor(selectedDate);
    const tasksMeta = loader.getMeta('tasks');
    const terms = loader.getTerms?.() ?? [];
    const visual = loader.getVisual?.() ?? null;
    const feedStatus = loader.getStatuses?.()?.feeds;
    const icalFeedNote =
      feedStatus && (feedStatus.status === 'error' || feedStatus.status === 'degraded')
        ? feedStatus.error
        : null;
    return {
      hub,
      fills: adapter.fills ?? {},
      defaultFilter: adapter.defaultFilter ?? defaultFilterForHub(hub),
      routeFor: adapter.routeFor,
      apiFetch: adapter.apiFetch,
      onNavigate: adapter.onNavigate,
      onReschedule: adapter.onReschedule,
      onQuickAdd: adapter.onQuickAdd,
      quickAddLabel: adapter.quickAddLabel,
      events: scopedEvents(),
      ghosts,
      week,
      today,
      now: adapter.now ?? new Date(),
      dayProfile: tasksMeta?.planningProfile?.day_profile ?? null,
      terms: terms.length ? terms : null,
      visual,
      icalFeedNote,
      onShiftRange: (delta) => {
        const step = zoom === 'day' ? delta : delta * 7;
        selectedDate = addDaysKey(selectedDate, step);
        ghostsKey = '';
        void loadGhosts(currentZoom()).then(() => schedulePaint());
      },
      onSelectDate: (next) => {
        if (typeof next === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(next)) {
          selectedDate = next;
          schedulePaint();
        }
      },
      onSwitchView: (next) => {
        if (next === 'day') dayLayout = 'dial';
        writeZoom(next);
        schedulePaint();
      },
      onSourcesChanged: () => {
        void loader.loadAll();
      }
    };
  }

  function paint() {
    const zoom = currentZoom();
    paintSourceErrors(doc, errorsHost, loader.getStatuses(), (id) => {
      void loader.retry(id);
    });

    const input = sharedInput(zoom);

    if (zoom === 'almanac') {
      unmountDayDial();
      unmountTermRiver();
      renderAlmanac(doc, calendarHost, {
        hub,
        now: input.now,
        apiFetch: adapter.apiFetch,
        onSwitchView: input.onSwitchView,
        routeFor: adapter.routeFor,
        events: input.events,
        ghosts: input.ghosts,
        icalFeedNote: input.icalFeedNote
      });
      return;
    }
    unmountAlmanac();

    if (zoom === 'term' || zoom === 'year') {
      unmountDayDial();
      renderTermRiver(doc, calendarHost, {
        ...input,
        zoom
      });
      return;
    }
    unmountTermRiver();

    if (zoom === 'day') {
      if (dayLayout === 'linear') {
        unmountDayDial();
        renderTideline(doc, calendarHost, {
          ...input,
          week: [selectedDate]
        });
        return;
      }
      renderDayDial(doc, calendarHost, {
        ...input,
        selectedDate,
        onLinear: () => {
          dayLayout = 'linear';
          writeZoom('day');
          schedulePaint();
        }
      });
      return;
    }

    unmountDayDial();
    dayLayout = 'dial';
    renderTideline(doc, calendarHost, input);
  }

  function onHashOrPop() {
    if (destroyed) return;
    schedulePaint();
  }

  const view = doc.defaultView;
  view?.addEventListener?.('hashchange', onHashOrPop);
  view?.addEventListener?.('popstate', onHashOrPop);

  paintLoading();
  // First meaningful paint immediately (empty grid / skeleton). Late sources
  // re-paint via onChange once ready — never wait the full loadAll budget.
  ready = true;
  schedulePaint();
  void (async () => {
    const all = loader.loadAll();
    await raceMs(all, FIRST_PAINT_MS);
    if (destroyed) return;
    await raceMs(loadGhosts(currentZoom()), GHOST_BUDGET_MS);
    if (!destroyed) schedulePaint();
    try {
      await all;
    } catch {
      /* per-source errors live in loader buckets */
    }
    if (destroyed) return;
    await loadGhosts(currentZoom());
    schedulePaint();
  })();

  return {
    destroy() {
      destroyed = true;
      ready = false;
      view?.removeEventListener?.('hashchange', onHashOrPop);
      view?.removeEventListener?.('popstate', onHashOrPop);
      unmountDayDial();
      unmountTermRiver();
      unmountAlmanac();
      host.replaceChildren();
    },
    reload() {
      ghostsKey = '';
      paintLoading();
      ready = true;
      schedulePaint();
      const all = loader.loadAll();
      return raceMs(all, FIRST_PAINT_MS)
        .then(() => raceMs(loadGhosts(currentZoom()), GHOST_BUDGET_MS))
        .then(() => {
          if (!destroyed) schedulePaint();
          return all.finally(() => {
            if (destroyed) return;
            ghostsKey = '';
            return loadGhosts(currentZoom()).then(() => schedulePaint());
          });
        });
    },
    /** Re-read zoom from the router and paint in place (Back/Forward / soft route). */
    syncZoom() {
      ghostsKey = '';
      return loadGhosts(currentZoom()).then(() => schedulePaint());
    },
    getZoom: currentZoom,
    getLoader: () => loader
  };
}
