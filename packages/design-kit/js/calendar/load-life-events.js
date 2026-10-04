/**
 * Load Life calendar events the same way Life does: repo manifest + files,
 * plus calendar-visual.json LOGS when present (visual seed / mock parity).
 *
 * `/api/repo/files` caps batches at 50 files / 1 MiB. The live function
 * still dies at 10s, and a serial GitHub walk of 50 blobs spends that
 * budget before any diary is parsed — the week then paints 80% "no logs".
 * Stay well under 50 so a serial read still returns, and so one slow
 * batch cannot drop the whole window.
 */

import { addDaysKey, mondayOf } from '../school-time.js';
import { getSydneyDateKey } from '../sydney-clock.js';

const CALENDAR_VISUAL_PATH = 'calendar-visual.json';
const EVENT_MD = /^data\/(?:nutrition|fitness|mind|sleep|heart|skincare|fragrance|body|calendar)\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}-.+\.md$/;
const LINKED_MD = /^records\/\d{4}\/\d{2}\/\d{2}\/.+\.md$/;
const MAX_BATCH_FILES = 16;
const MAX_BATCH_BYTES = 1024 * 1024;

async function resolveYamlLoad() {
  try {
    const mod = await import('js-yaml');
    return typeof mod.load === 'function' ? mod.load : mod.default?.load ?? null;
  } catch {
    return null;
  }
}

function parseFrontmatter(text, loadYaml) {
  if (typeof text !== 'string') return null;
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?([\s\S]*)$/.exec(text.trim());
  if (!match) return null;
  try {
    const record = loadYaml(match[1]);
    if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
    return { record, body: match[2].trim() };
  } catch {
    return null;
  }
}

const LIFE_FETCH_MS = 12_000;

function withLifeTimeout(init) {
  if (typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function') {
    return init;
  }
  if (init?.signal) return init;
  return { ...(init || {}), signal: AbortSignal.timeout(LIFE_FETCH_MS) };
}

async function readOkJson(apiFetch, path, init) {
  const response = await apiFetch(path, withLifeTimeout(init));
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) {
    const err = new Error('request_failed');
    err.status = response.status;
    throw err;
  }
  return payload;
}

/** Split wanted entries to honour /api/repo/files MAX_FILES / MAX_BATCH_BYTES. */
export function batchLifeFileRequests(wanted) {
  const batches = [];
  let batch = [];
  let bytes = 0;
  for (const file of wanted) {
    const size = Number.isFinite(file?.size) ? file.size : 0;
    if (batch.length && (batch.length === MAX_BATCH_FILES || bytes + size > MAX_BATCH_BYTES)) {
      batches.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(file);
    bytes += size;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

/**
 * @param {(path: string, init?: RequestInit) => Promise<Response>} apiFetch
 * @param {{ today?: string, from?: string, to?: string }} [opts]
 * @returns {Promise<{ events: unknown[], visual: object | null }>}
 */
export async function loadLifeCalendarEvents(apiFetch, opts = {}) {
  if (typeof apiFetch !== 'function') throw new TypeError('apiFetch is required');
  const today = opts.today || getSydneyDateKey(new Date());
  const from = opts.from || addDaysKey(mondayOf(today), -21);
  const to = opts.to || addDaysKey(mondayOf(today), 56);

  const manifestPayload = await readOkJson(
    apiFetch,
    `/api/repo/manifest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  );
  const manifest = manifestPayload.data;
  const entries = Array.isArray(manifest?.files) ? manifest.files : [];
  const wanted = entries.filter(
    (entry) =>
      entry?.path === CALENDAR_VISUAL_PATH ||
      EVENT_MD.test(entry?.path || '') ||
      LINKED_MD.test(entry?.path || '')
  );

  let visual = null;
  const events = [];
  if (!wanted.length) {
    await appendCheckins(apiFetch, events, today);
    return { events, visual };
  }

  const files = [];
  for (const batch of batchLifeFileRequests(wanted)) {
    const filesPayload = await readOkJson(apiFetch, '/api/repo/files', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        commitSha: manifest.commitSha,
        files: batch.map(({ path, sha }) => ({ path, sha }))
      })
    });
    const chunk = Array.isArray(filesPayload.data?.files) ? filesPayload.data.files : [];
    files.push(...chunk);
  }
  const loadYaml = await resolveYamlLoad();

  for (const file of files) {
    if (file.path === CALENDAR_VISUAL_PATH) {
      try {
        visual = JSON.parse(file.content);
      } catch {
        visual = null;
      }
      continue;
    }
    if (!loadYaml) continue;
    const parsed = parseFrontmatter(file.content, loadYaml);
    if (parsed?.record?.type) {
      events.push({ ...parsed, path: file.path });
    }
  }

  // Visual seed LOGS are already structured — use them when repo parse is empty
  // or to fill gaps (same records Life shows after calendar-visual-seed).
  if (visual && Array.isArray(visual.LOGS)) {
    const byId = new Set(events.map((e) => e.record?.id).filter(Boolean));
    for (const log of visual.LOGS) {
      const record = log?.record ?? log;
      if (!record?.type || !record?.date) continue;
      if (record.id && byId.has(record.id)) continue;
      events.push({
        record,
        body: typeof log?.body === 'string' ? log.body : '',
        path: log?.path || null
      });
    }
  }

  await appendCheckins(apiFetch, events, today);
  return { events, visual };
}

/**
 * Morning check-ins live in private Blobs, not the data repo. They join the events as
 * `readiness_checkin` records so every capacity view (dial, tideline, almanac) uses them.
 * A failed read never blocks the calendar.
 */
async function appendCheckins(apiFetch, events, today) {
  try {
    const from = addDaysKey(today, -16);
    const payload = await readOkJson(apiFetch, `/api/readiness-checkin?from=${from}&to=${today}`);
    for (const record of payload.data?.checkins ?? []) {
      if (record?.type === 'readiness_checkin' && typeof record.date === 'string') events.push({ record, body: '', path: null });
    }
  } catch {
    // Check-ins are an improvement, not a dependency.
  }
}

/**
 * Adapter-friendly hook: returns only the events array (loader bucket shape).
 * @param {(path: string, init?: RequestInit) => Promise<Response>} apiFetch
 * @param {{ today?: string }} [opts]
 */
export function createLifeEventsLoader(apiFetch, opts = {}) {
  let lastVisual = null;
  return {
    async load() {
      const result = await loadLifeCalendarEvents(apiFetch, opts);
      lastVisual = result.visual;
      return result.events;
    },
    getVisual() {
      return lastVisual;
    }
  };
}
