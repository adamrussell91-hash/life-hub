import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { defaultGetTasksStore, getJSON, setJSON } from './_shared/tasks-blobs.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';

export const config = { path: '/api/hub-prefs' };

const HUB_PREFS_KEY = 'meta/hub_prefs';
const DEFAULT_TZ = 'Australia/Sydney';
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
// Keep in step with NSW_2026_TERMS in apps/tasks/src/domain/hub-prefs.ts.
const NSW_2026_TERMS = [
  { term: 1, starts_on: '2026-02-02', ends_on: '2026-04-02' },
  { term: 2, starts_on: '2026-04-22', ends_on: '2026-07-03' },
  { term: 3, starts_on: '2026-07-21', ends_on: '2026-09-25' },
  { term: 4, starts_on: '2026-10-13', ends_on: '2026-12-17' }
];

function parseTerm(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const term = raw.term;
  if (term !== 1 && term !== 2 && term !== 3 && term !== 4) return null;
  const starts = typeof raw.starts_on === 'string' ? raw.starts_on : '';
  const ends = typeof raw.ends_on === 'string' ? raw.ends_on : '';
  if (!DATE_KEY.test(starts) || !DATE_KEY.test(ends) || ends < starts) return null;
  return { term, starts_on: starts, ends_on: ends };
}

function parseSchoolTerms(raw) {
  if (!Array.isArray(raw)) return [{ year: 2026, terms: NSW_2026_TERMS.map((term) => ({ ...term })) }];
  const years = [];
  const seenYears = new Set();
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const year = row.year;
    if (typeof year !== 'number' || !Number.isInteger(year) || year < 2000 || year > 2100) continue;
    if (seenYears.has(year)) continue;
    seenYears.add(year);
    const terms = [];
    const seenTerms = new Set();
    if (Array.isArray(row.terms)) {
      for (const item of row.terms) {
        const term = parseTerm(item);
        if (!term || seenTerms.has(term.term)) continue;
        seenTerms.add(term.term);
        terms.push(term);
      }
    }
    terms.sort((a, b) => a.term - b.term);
    years.push({ year, terms });
  }
  return years;
}

function parseMarkingMinutes(raw) {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0 || raw > 24 * 60) return 10;
  return Math.round(raw);
}

function parseHubPrefs(raw) {
  const body = raw && typeof raw === 'object' ? raw : {};
  const dismissed = Array.isArray(body.dismissed_insight_ids)
    ? body.dismissed_insight_ids
        .map((row) => {
          if (!row || typeof row !== 'object') return null;
          const id = String(row.id ?? '').trim();
          const fingerprint = String(row.fingerprint ?? '').trim();
          return id && fingerprint ? { id, fingerprint } : null;
        })
        .filter(Boolean)
    : [];
  return {
    schema_version: 1,
    timezone: typeof body.timezone === 'string' && body.timezone.trim() ? body.timezone : DEFAULT_TZ,
    updated_at: typeof body.updated_at === 'string' ? body.updated_at : null,
    dismissed_insight_ids: dismissed,
    school_terms: parseSchoolTerms(body.school_terms),
    marking_default_minutes_per_script: parseMarkingMinutes(body.marking_default_minutes_per_script)
  };
}

export function createHubPrefsHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    try {
      if (request.method === 'GET') {
        const prefs = parseHubPrefs(await getJSON(store, HUB_PREFS_KEY));
        return withCors(okResponse(200, prefs), request, env);
      }

      if (request.method !== 'PATCH' && request.method !== 'PUT') {
        return withCors(methodNotAllowed('GET, PATCH, PUT, OPTIONS'), request, env);
      }

      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      const current = parseHubPrefs(await getJSON(store, HUB_PREFS_KEY));
      const next = parseHubPrefs({
        ...current,
        ...(parsed.value && typeof parsed.value === 'object' ? parsed.value : {}),
        updated_at: new Date().toISOString()
      });
      await setJSON(store, HUB_PREFS_KEY, next);
      return withCors(okResponse(200, next), request, env);
    } catch (error) {
      return withCors(errorResponse(400, 'bad_request', error.message, false), request, env);
    }
  }, {
    ...deps,
    unboundCode: deps.unboundCode ?? 'tasks_blobs_unbound',
    unboundMessage: deps.unboundMessage ?? 'Tasks content store is not bound.',
    getContentStore: deps.getContentStore ?? defaultGetTasksStore
  });
}

export default createHubPrefsHandler();
