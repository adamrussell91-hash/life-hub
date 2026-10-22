// apps/teaching/src/teacher/notion-import/api.ts
import { ApiClientError, apiGet, apiPost } from '@/api/client';
import type { ImportChoices, ImportPlanPreview, ImportWarning } from '@/notion-import/types';

export interface NotionSearchItem { page_id: string; title: string; category: string | null; last_edited_time: string }
export interface NotionImportReport {
  written: string[];
  skipped: Array<{ page_id: string; reason: string }>;
  warnings: ImportWarning[];
}
export interface NotionImportJob {
  id: string;
  kind: 'plan' | 'apply';
  /** 'queued' until the background function picks it up, then 'running'; plan jobs end 'planned', apply jobs 'done'. */
  status: 'queued' | 'running' | 'planned' | 'done' | 'failed';
  page_id: string;
  /** Server time of the last write. The heartbeat while reading refreshes it. */
  updated_at: string;
  phase?: string;
  progress?: { phase: string; done: number; total: number };
  /** Slim preview: no entity records, no media urls. Apply re-reads Notion. */
  plan?: ImportPlanPreview;
  report?: NotionImportReport;
  error?: string;
}

/** The server accepts links, `?p=` peek links and bare ids, and answers 400 "Choose a Notion page to import." otherwise. This only gives instant feedback. */
const PAGE_ID = /(?<![0-9a-f])[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}(?![0-9a-f])/gi;

function lastId(text: string | null): string | null {
  const found = text?.match(PAGE_ID);
  const hex = found?.[found.length - 1]?.replace(/-/g, '').toLowerCase();
  if (!hex) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Mirrors the server's normalizePageId: `p` (a peek link) first, then the path, never the query. */
export function parseNotionPageId(input: string): string | null {
  const text = input.trim();
  if (/[/?#]/.test(text)) {
    try {
      const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
      return lastId(url.searchParams.get('p')) ?? lastId(url.pathname);
    } catch { /* not a URL: scan the text */ }
  }
  return lastId(text);
}

export const searchNotion = (q: string) =>
  apiGet<{ items: NotionSearchItem[] }>(`/api/notion-import/search?q=${encodeURIComponent(q)}`);

export const getNotionJob = (id: string, signal?: AbortSignal) =>
  apiGet<NotionImportJob>(`/api/notion-import/jobs/${id}`, { signal });

/**
 * POST /api/notion-import/jobs   { kind: 'plan' | 'apply', page_id: string, choices?: ImportChoices }
 *   202 { job_id }   the server mints the id (nij_...) and queues the job
 *   400 validation_error   "Choose a Notion page to import." (or bad kind / choices)
 *   503 not_configured     NOTION_TEACHING_TOKEN missing; retryable false
 *   502 start_failed       the background function could not be kicked; retryable true
 */
async function startJob(kind: 'plan' | 'apply', pageId: string, choices?: ImportChoices): Promise<string> {
  const { job_id } = await apiPost<{ job_id: string }>('/api/notion-import/jobs', { kind, page_id: pageId, choices });
  return job_id;
}

export const startPlan = (pageId: string, choices?: ImportChoices) => startJob('plan', pageId, choices);
export const startApply = (pageId: string, choices: ImportChoices) => startJob('apply', pageId, choices);

/** Thrown when polling gave up. The job may still finish, so the UI offers to check again. */
export class JobTimeoutError extends Error {
  constructor() { super('The import is taking too long. Check back shortly.'); this.name = 'JobTimeoutError'; }
}

const abortError = (): Error => new DOMException('The import was cancelled.', 'AbortError');
/** Network failures and non-JSON gateway pages are blips, not answers. */
const TRANSIENT_CODES = new Set(['network_error', 'invalid_response']);

const QUEUED_LIMIT_MS = 60_000;
const SILENT_LIMIT_MS = 4 * 60_000;

/**
 * Polls until the job finishes. A network blip (not an ApiClientError) means poll again;
 * any ApiClientError (401, 404, 400) is fatal. Staleness is measured on this device's
 * clock from when the job record last changed, so clock skew with the server cannot trip it:
 * 'queued' for over 60 s never started, and 'running' with no update for over 4 minutes
 * stopped (the server writes a heartbeat while reading and a progress write while applying).
 */
export async function waitForJob(
  id: string,
  onUpdate: (job: NotionImportJob) => void,
  {
    intervalMs = 1500, timeoutMs = 15 * 60 * 1000,
    signal,
    sleep = (ms: number) => new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
      const onAbort = (): void => { clearTimeout(timer); reject(abortError()); };
      signal?.addEventListener('abort', onAbort, { once: true });
    }),
    now = Date.now
  }: {
    intervalMs?: number; timeoutMs?: number; signal?: AbortSignal;
    sleep?: (ms: number) => Promise<void>; now?: () => number;
  } = {}
): Promise<NotionImportJob> {
  const started = now();
  let seen = '';
  let seenAt = started;
  for (;;) {
    if (signal?.aborted) throw abortError();
    let job: NotionImportJob | null = null;
    try {
      job = await getNotionJob(id, signal);
    } catch (error) {
      if (signal?.aborted) throw abortError();
      if (error instanceof ApiClientError && !TRANSIENT_CODES.has(error.code)) throw error;
    }
    if (job) {
      onUpdate(job);
      if (job.status === 'planned' || job.status === 'done' || job.status === 'failed') return job;
      const stamp = `${job.status}|${job.updated_at}`;
      if (stamp !== seen) { seen = stamp; seenAt = now(); }
      const quiet = now() - seenAt;
      if (job.status === 'queued' && quiet > QUEUED_LIMIT_MS) throw new Error("The import didn't start. Try again.");
      if (job.status === 'running' && quiet > SILENT_LIMIT_MS) throw new Error('The import stopped responding. Try again.');
    }
    if (now() - started > timeoutMs) throw new JobTimeoutError();
    await sleep(intervalMs);
    if (signal?.aborted) throw abortError();
  }
}
