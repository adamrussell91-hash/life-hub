import { apiPost } from './client';

/** Ann's career reads run as server jobs, so nothing here has a clock on Ann. */
const POLL_MS = 3000;
/** Only an unbroken run of failed asks (about 5 minutes) ends the wait. */
const MAX_FAILED_ASKS = 100;

type JobReply<T> =
  | { status: 'reading' }
  | { status: 'done'; result: T }
  | { status: 'failed'; message?: string };

const waits = new Map<string, Promise<unknown>>();

async function poll<T>(jobId: string, pollMs: number): Promise<T> {
  let failedAsks = 0;
  for (;;) {
    let reply: JobReply<T> | null = null;
    try {
      reply = await apiPost<JobReply<T>>('/api/career-futures?action=job_status', { job_id: jobId });
      failedAsks = 0;
    } catch {
      // A dropped connection says nothing about Ann, who is still working.
      failedAsks += 1;
      if (failedAsks >= MAX_FAILED_ASKS) throw new Error('Lost contact with the hub. Reload the page to pick this up again.');
    }
    if (reply?.status === 'done') return reply.result;
    if (reply?.status === 'failed') throw new Error(reply.message || 'Ann could not finish. Try again.');
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

/** One wait per job, however many times the panel redraws while she works. */
export function waitForAnnJob<T>(jobId: string, pollMs = POLL_MS): Promise<T> {
  const running = waits.get(jobId) as Promise<T> | undefined;
  if (running) return running;
  const wait = poll<T>(jobId, pollMs).finally(() => waits.delete(jobId));
  waits.set(jobId, wait);
  return wait;
}

export function clearAnnJob(jobId: string): void {
  void apiPost('/api/career-futures?action=job_clear', { job_id: jobId }).catch(() => {});
}

export async function startFutureCheck(futureId: string): Promise<string> {
  const { job_id } = await apiPost<{ job_id: string }>(
    `/api/career-futures?action=check_start&id=${encodeURIComponent(futureId)}`,
    {}
  );
  return job_id;
}

/** Ann reads the ad for as long as it takes; the answer is handed over and cleared. */
export async function draftFuture<T>(body: { title: string; description: string }, pollMs = POLL_MS): Promise<T> {
  const { job_id } = await apiPost<{ job_id: string }>('/api/career-futures?action=draft_start', body);
  const result = await waitForAnnJob<T>(job_id, pollMs);
  clearAnnJob(job_id);
  return result;
}
