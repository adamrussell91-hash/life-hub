/**
 * GET /api/calendar-feeds?from=YYYY-MM-DD&to=YYYY-MM-DD[&fresh=1]
 *
 * Adam's published iCloud calendars, read-only, expanded to Sydney-dated rows.
 * The feed URLs are secrets (whoever holds one can read the calendar): they live
 * only in the Functions environment (ICAL_FEED_WORK / _SOCIAL / _FAMILY / _HEALTH)
 * and never reach the client, the repo or a log line.
 *
 * Each feed's text is cached in Blobs for 15 minutes; a failed fetch serves the
 * last good copy marked `stale`.
 */
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { getJSON, setJSON } from './_shared/tasks-blobs.mjs';
import { icalOccurrences } from './_shared/ical.mjs';

export const config = { path: '/api/calendar-feeds' };

export const CALENDAR_FEEDS = Object.freeze([
  { id: 'work', env: 'ICAL_FEED_WORK' },
  { id: 'social', env: 'ICAL_FEED_SOCIAL' },
  { id: 'family', env: 'ICAL_FEED_FAMILY' },
  { id: 'health', env: 'ICAL_FEED_HEALTH' }
]);

export const FEED_CACHE_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const MAX_FEED_BYTES = 5 * 1024 * 1024;
// Must cover the client's calendarFeedRange (35 days back + 400 ahead = 435),
// with headroom. It was 430, so every client request got a 400 and the banner
// "Couldn't load your iCloud calendars". tests/unit/calendar-feeds.test.js pins this.
export const MAX_RANGE_DAYS = 450;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const cacheKey = (id) => `meta/ical_cache/${id}`;

/** webcal:// is https:// for fetching. */
export function feedUrl(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return null;
  const url = value.replace(/^webcals?:\/\//i, 'https://');
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

export function readRange(url) {
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!DATE.test(from ?? '') || !DATE.test(to ?? '') || from > to) return null;
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (days > MAX_RANGE_DAYS) return null;
  return { from, to, fresh: url.searchParams.get('fresh') === '1' };
}

async function fetchFeed(url, fetchImpl) {
  const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(FETCH_TIMEOUT_MS) : undefined;
  const response = await fetchImpl(url, { headers: { accept: 'text/calendar' }, redirect: 'follow', signal });
  if (!response.ok) throw new Error(`feed ${response.status}`);
  const body = await response.text();
  if (body.length > MAX_FEED_BYTES) throw new Error('feed too large');
  if (!body.includes('BEGIN:VCALENDAR')) throw new Error('not a calendar');
  return body;
}

/** One feed: cached text if fresh, else fetch; on failure the last good copy (stale). */
export async function loadFeedText({ feed, env, store, fetchImpl, nowMs, fresh }) {
  const url = feedUrl(env[feed.env]);
  if (!url) return { status: 'unconfigured', text: null, fetched_at: null };
  let cached = null;
  try {
    cached = await getJSON(store, cacheKey(feed.id));
  } catch {
    cached = null;
  }
  const cachedAt = Date.parse(cached?.fetched_at ?? '');
  if (!fresh && cached?.text && Number.isFinite(cachedAt) && nowMs - cachedAt < FEED_CACHE_MS) {
    return { status: 'live', text: cached.text, fetched_at: cached.fetched_at };
  }
  try {
    const text = await fetchFeed(url, fetchImpl);
    const fetched_at = new Date(nowMs).toISOString();
    try {
      await setJSON(store, cacheKey(feed.id), { fetched_at, text });
    } catch {
      /* cache is an optimisation */
    }
    return { status: 'live', text, fetched_at };
  } catch (error) {
    // Never log the URL. The status code / reason is enough.
    console.warn(`calendar-feeds: ${feed.id} unavailable (${error instanceof Error ? error.message : 'error'})`);
    if (cached?.text) return { status: 'stale', text: cached.text, fetched_at: cached.fetched_at ?? null };
    return { status: 'error', text: null, fetched_at: null };
  }
}

/**
 * iCloud rows from the cache only (no fetch, no secrets touched): for the 05:30 planner,
 * which needs busy time but must never wait on iCloud. Missing cache → [].
 */
export async function cachedFeedRows({ store, from, to }) {
  const rows = [];
  for (const feed of CALENDAR_FEEDS) {
    try {
      const cached = await getJSON(store, cacheKey(feed.id));
      if (cached?.text) rows.push(...icalOccurrences(cached.text, { feed: feed.id, from, to }));
    } catch {
      /* one unreadable feed never blocks the rest */
    }
  }
  return rows;
}

export function createCalendarFeedsHandler(deps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET') return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    const range = readRange(new URL(request.url));
    if (!range) {
      return withCors(errorResponse(400, 'invalid_date_range', `Provide from and to as YYYY-MM-DD (at most ${MAX_RANGE_DAYS} days).`, false), request, env);
    }
    const nowMs = now();
    const results = await Promise.all(CALENDAR_FEEDS.map(async (feed) => {
      const loaded = await loadFeedText({ feed, env, store, fetchImpl, nowMs, fresh: range.fresh });
      let events = [];
      if (loaded.text) {
        try {
          events = icalOccurrences(loaded.text, { feed: feed.id, from: range.from, to: range.to });
        } catch (error) {
          console.warn(`calendar-feeds: ${feed.id} unreadable (${error instanceof Error ? error.message : 'error'})`);
          return { feed: { id: feed.id, status: 'error', fetched_at: loaded.fetched_at }, events: [] };
        }
      }
      return { feed: { id: feed.id, status: loaded.status, fetched_at: loaded.fetched_at }, events };
    }));
    const freed = await getJSON(store, 'meta/freed_spans').catch(() => null);
    return withCors(okResponse(200, {
      feeds: results.map((row) => row.feed),
      events: results.flatMap((row) => row.events),
      freed: Array.isArray(freed) ? freed : []
    }), request, env);
  }, deps);
}

export default createCalendarFeedsHandler();
