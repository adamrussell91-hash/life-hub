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
export const STALE_RUNNING_MS = 2 * 60 * 1000;

export const EMPTY_CHOICES = { excluded_page_ids: [], overrides: {}, html_as_code: [] };

export class NotionSetupError extends Error {}

export function notionToken(env) {
  const token = typeof env?.NOTION_TEACHING_TOKEN === 'string' ? env.NOTION_TEACHING_TOKEN.trim() : '';
  if (!token) {
    throw new NotionSetupError('Notion import is not set up: add NOTION_TEACHING_TOKEN to the site environment variables.');
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
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return 'Notion took too long to respond; try again in a minute.';
  }
  return error?.message || 'The import failed.';
}

const PAGE_ID = /(?<![0-9a-f])[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}(?![0-9a-f])/gi;

function dashed(hex32) {
  const h = hex32.replace(/-/g, '').toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function lastId(text) {
  const matches = String(text ?? '').match(PAGE_ID);
  return matches ? dashed(matches[matches.length - 1]) : null;
}

/**
 * Turns a pasted link or bare id into the dashed id Notion's API uses. For a URL,
 * the `p` param (a peek-opened page) wins, then the last id in the path. The query
 * is never searched, because `?v=` is a database view id, not the page.
 */
export function normalizePageId(raw) {
  const text = String(raw ?? '').trim();
  if (/[/?#]/.test(text)) {
    let url = null;
    try { url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`); } catch { /* not a URL */ }
    if (url) return lastId(url.searchParams.get('p')) ?? lastId(url.pathname) ?? text;
  }
  return lastId(text) ?? text;
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
    choices: { ...EMPTY_CHOICES, ...choices }
  };
}

async function buildPlan(store, pageId, choices, deps) {
  const clock = deps.clock ?? Date.now;
  const client = createNotionClient({
    token: notionToken(deps.env),
    fetchImpl: deps.fetchImpl,
    sleep: deps.sleep,
    ...(deps.requestTimeoutMs ? { requestTimeoutMs: deps.requestTimeoutMs } : {})
  });
  const tree = await readNotionTree(client, normalizePageId(pageId), {
    deadlineAt: clock() + READ_BUDGET_MS,
    now: clock
  });
  return buildImportPlan(tree, await mapContext(store, choices, deps.now));
}

/** What the preview needs and nothing more: no entity records, no Notion file urls. */
export function previewOf(plan) {
  return {
    root_page_id: plan.root_page_id,
    entities: plan.entities.map(({ page_id, parent_page_id, kind, label, id, title, existing, needs, suggested }) => (
      { page_id, parent_page_id, kind, label, id, title, existing, needs, suggested }
    )),
    skipped: plan.skipped,
    warnings: plan.warnings,
    html_apps: plan.html_apps,
    new_subjects: plan.new_subjects,
    media_count: plan.media.length
  };
}

/**
 * Takes a queued job (or a crashed one that went quiet) and marks it running.
 * Returns null, doing nothing, when the job is missing, the wrong kind, finished,
 * or running and still fresh (a duplicate background retry).
 */
async function claimJob(store, jobId, kind, clock) {
  const job = await getJSON(store, notionJobKey(jobId));
  if (!job || job.kind !== kind) return null;
  if (job.status === 'running') {
    // NaN-safe: an unparseable updated_at fails `age < STALE`, so the job counts as stale.
    const age = clock() - Date.parse(job.updated_at);
    if (age < STALE_RUNNING_MS) return null;
  } else if (job.status !== 'queued') {
    return null;
  }
  return writeJob(store, jobId, { status: 'running', phase: 'reading' });
}

async function runJob(store, jobId, kind, deps, work) {
  const clock = deps.clock ?? Date.now;
  const job = await claimJob(store, jobId, kind, clock);
  if (!job) return;
  const now = deps.now ?? new Date().toISOString();
  try {
    await work(job, { ...deps, clock, now });
  } catch (error) {
    await writeJob(store, jobId, { status: 'failed', error: friendlyError(error) });
  }
}

export function runPlan(store, jobId, deps) {
  return runJob(store, jobId, 'plan', deps, async (job, d) => {
    const plan = await buildPlan(store, job.page_id, job.choices, d);
    await writeJob(store, jobId, { status: 'planned', phase: 'done', plan: previewOf(plan) });
  });
}

export function runApply(store, jobId, deps) {
  return runJob(store, jobId, 'apply', deps, async (job, d) => {
    const mediaDeadlineAt = d.mediaDeadlineAt ?? d.clock() + MEDIA_BUDGET_MS;
    const timeoutSignal = d.timeoutSignal ?? ((ms) => AbortSignal.timeout(ms));
    // Re-read so Notion file URLs are fresh (they expire within minutes).
    const plan = await buildPlan(store, job.page_id, job.choices, d);
    const report = await applyPlan(store, plan, {
      now: d.now,
      rehost: async (s, ref) => {
        if (d.clock() > mediaDeadlineAt) {
          return { ok: false, reason: 'failed', message: `Ran out of time before ${ref.name} could be downloaded.` };
        }
        const ms = Math.max(1000, Math.min(60000, mediaDeadlineAt + 60000 - d.clock()));
        return rehostMedia(s, ref, { fetchImpl: d.fetchImpl, origin: d.origin, now: d.now, signal: timeoutSignal(ms) });
      },
      onProgress: (progress) => writeJob(store, jobId, { phase: progress.phase, progress })
    });
    await setJSON(store, notionReportKey(jobId), { job_id: jobId, page_id: job.page_id, created_at: d.now, ...report });
    await writeJob(store, jobId, { status: 'done', phase: 'done', report });
  });
}

/** Fire the background run, passing only the job id. A 202 means Netlify accepted it. */
export async function kickNotionImportRun(request, runPath, jobId, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(new URL(runPath, request.url), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie') } : {}),
        ...(request.headers.get('origin') ? { origin: request.headers.get('origin') } : {})
      },
      body: JSON.stringify({ job_id: jobId }),
      signal: AbortSignal.timeout(5_000)
    });
    return response.status === 202 || response.ok;
  } catch {
    return false;
  }
}
