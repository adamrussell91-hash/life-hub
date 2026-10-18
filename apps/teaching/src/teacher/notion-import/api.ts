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
export function parseNotionPageId(input: string): string | null {
  let text = input.trim();
  // A bare id or slug is scanned as text; parsing it as a URL would turn the id into a hostname.
  if (/^[a-z][a-z0-9+.-]*:|[/?]/i.test(text)) {
    try {
      const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
      const fromP = url.searchParams.get('p');
      text = fromP ?? url.pathname; // never the query: ?v= is a database view id
    } catch { /* not a URL: scan the text */ }
  }
  const found = text.match(/(?<![0-9a-f])[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}(?![0-9a-f])/gi);
  const hex = found?.[found.length - 1]?.replace(/-/g, '').toLowerCase();
  if (!hex) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const searchNotion = (q: string) =>
  apiGet<{ items: NotionSearchItem[] }>(`/api/notion-import/search?q=${encodeURIComponent(q)}`);

export const getNotionJob = (id: string) => apiGet<NotionImportJob>(`/api/notion-import/jobs/${id}`);

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
    sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    now = Date.now
  } = {}
): Promise<NotionImportJob> {
  const started = now();
  let seen = '';
  let seenAt = started;
  for (;;) {
    let job: NotionImportJob | null = null;
    try {
      job = await getNotionJob(id);
    } catch (error) {
      if (error instanceof ApiClientError) throw error;
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
    if (now() - started > timeoutMs) throw new Error('The import is taking too long. Check back shortly.');
    await sleep(intervalMs);
  }
}
