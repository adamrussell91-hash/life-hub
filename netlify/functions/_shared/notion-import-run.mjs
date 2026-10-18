import { buildImportPlan } from './notion-import-core.mjs';
import { createNotionClient, NotionApiError } from './notion-client.mjs';
import { readNotionTree } from './notion-reader.mjs';
import { rehostMedia } from './notion-media.mjs';
import { applyPlan } from './notion-apply.mjs';
import { notionJobKey, notionReportKey, readSourceMap, writeJob } from './notion-import-store.mjs';
import { getJSON, listJSON, OUTCOME_PREFIX, setJSON, SUBJECT_PREFIX, YEAR_PREFIX } from './teaching-blobs.mjs';

// Background functions get 15 minutes. Reading stops at 12 so the writes still fit,
// and new media downloads stop at 14.
export const READ_BUDGET_MS = 12 * 60 * 1000;
export const MEDIA_BUDGET_MS = 14 * 60 * 1000;
export const RUNNING_FRESH_MS = 2 * 60 * 1000;

export const EMPTY = { excluded_page_ids: [], overrides: {}, html_as_code: [] };

export function notionToken(env) {
  const token = typeof env?.NOTION_TEACHING_TOKEN === 'string' ? env.NOTION_TEACHING_TOKEN.trim() : '';
  if (!token) {
    throw new Error('Notion import is not set up: add NOTION_TEACHING_TOKEN to the site environment variables.');
  }
  return token;
}

export function friendlyError(error) {
  if (error instanceof NotionApiError && (error.code === 'object_not_found' || error.status === 404)) {
    return 'This page is not shared with the Teaching Hub integration. In Notion, open the Teaching database, choose ••• → Connections, and add “Teaching Hub import”.';
  }
  if (error instanceof NotionApiError && error.status === 401) {
    return 'Notion rejected the integration token. Check NOTION_TEACHING_TOKEN.';
  }
  if (error instanceof NotionApiError && error.status === 429) {
    return 'Notion is busy; try again in a minute.';
  }
  return error?.message || 'The import failed.';
}

const PAGE_ID = /(?<![0-9a-f])[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}(?![0-9a-f])/gi;

export function normalizePageId(raw) {
  const matches = String(raw ?? '').match(PAGE_ID);
  if (!matches) return String(raw ?? '');
  // A pasted URL puts the page id last, after the title slug.
  const h = matches[matches.length - 1].replace(/-/g, '').toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

async function mapContext(store, choices, now) {
  const [years, subjects, outcomes, source_map] = await Promise.all([
    listJSON(store, YEAR_PREFIX), listJSON(store, SUBJECT_PREFIX), listJSON(store, OUTCOME_PREFIX), readSourceMap(store)
  ]);
  return {
    now,
    years: years.filter(Boolean).map((y) => ({ id: y.id, year_level: y.year_level })),
    subjects: subjects.filter(Boolean).map((s) => ({ id: s.id, title: s.display_title || s.title })),
    outcomes: outcomes.filter(Boolean).map((o) => ({ id: o.id, code: o.code })),
    source_map,
    choices: { ...EMPTY, ...choices }
  };
}

async function buildPlan(store, pageId, choices, deps) {
  const client = createNotionClient({ token: notionToken(deps.env), fetchImpl: deps.fetchImpl, sleep: deps.sleep });
  const tree = await readNotionTree(client, normalizePageId(pageId), {
    deadlineAt: (deps.clock ?? Date.now)() + READ_BUDGET_MS
  });
  return buildImportPlan(tree, await mapContext(store, choices, deps.now));
}

// Job ids are client-generated. A job that already exists is a replay, and a fresh
// running job is a duplicate background retry; both must do nothing. A stale
// running job is a crashed run, which Netlify retries, so that one may proceed.
async function alreadyHandled(store, jobId, clock = Date.now) {
  const existing = await getJSON(store, notionJobKey(jobId));
  if (!existing) return false;
  if (existing.status !== 'running') return true;
  const age = clock() - Date.parse(existing.updated_at ?? '');
  return !(age >= RUNNING_FRESH_MS);
}

export async function runPlan(store, { job_id, page_id, choices }, deps) {
  const now = deps.now ?? new Date().toISOString();
  if (await alreadyHandled(store, job_id, deps.clock)) return;
  await writeJob(store, job_id, { kind: 'plan', status: 'running', phase: 'reading' });
  try {
    const plan = await buildPlan(store, page_id, choices, { ...deps, now });
    await writeJob(store, job_id, { status: 'planned', phase: 'done', plan });
  } catch (error) {
    await writeJob(store, job_id, { status: 'failed', error: friendlyError(error) });
  }
}

export async function runApply(store, { job_id, page_id, choices }, deps) {
  const now = deps.now ?? new Date().toISOString();
  if (await alreadyHandled(store, job_id, deps.clock)) return;
  const clock = deps.clock ?? Date.now;
  const mediaDeadlineAt = deps.mediaDeadlineAt ?? clock() + MEDIA_BUDGET_MS;
  await writeJob(store, job_id, { kind: 'apply', status: 'running', phase: 'reading' });
  try {
    // Re-read so Notion file URLs are fresh (they expire within minutes).
    const plan = await buildPlan(store, page_id, choices, { ...deps, now });
    const report = await applyPlan(store, plan, {
      now,
      rehost: async (s, ref) => {
        if (clock() > mediaDeadlineAt) {
          return { ok: false, reason: 'failed', message: `Ran out of time before ${ref.name} could be downloaded.` };
        }
        return rehostMedia(s, ref, { fetchImpl: deps.fetchImpl, origin: deps.origin, now });
      },
      onProgress: (progress) => writeJob(store, job_id, { phase: progress.phase, progress })
    });
    await setJSON(store, notionReportKey(job_id), { job_id, page_id, created_at: now, ...report });
    await writeJob(store, job_id, { status: 'done', phase: 'done', report });
  } catch (error) {
    await writeJob(store, job_id, { status: 'failed', error: friendlyError(error) });
  }
}
