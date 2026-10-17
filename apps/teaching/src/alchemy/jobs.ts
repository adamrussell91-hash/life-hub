import { apiGet } from '@/api/client';

type AlchemyJob<T> = { job: string; status: 'working' | 'done' | 'error'; result?: T; error?: { message?: string } };
const POLL_MS = 1500;
/** Matches the background runner's 60s deadline, with room for the job to start and be read back. */
export const ALCHEMY_WAIT_MS = 75000;

function isJob<T>(value: unknown): value is AlchemyJob<T> {
  return Boolean(value && typeof value === 'object' && typeof (value as AlchemyJob<T>).job === 'string' && 'status' in (value as object));
}

/**
 * Ann's slower work runs as a background job (live functions stop at 10s).
 * A quick endpoint answers either with the result itself or with a job id;
 * this waits for the job and returns its result, or throws Ann's error.
 */
export async function awaitAlchemyJob<T>(first: T | AlchemyJob<T>, signal?: AbortSignal): Promise<T> {
  if (!isJob<T>(first)) return first;
  let current: AlchemyJob<T> = first;
  while (current.status === 'working') {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, POLL_MS);
      signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason ?? new DOMException('Aborted', 'AbortError')); }, { once: true });
    });
    current = await apiGet<AlchemyJob<T>>(`/api/alchemy-blocks?job=${encodeURIComponent(current.job)}`, { signal });
  }
  if (current.status === 'error') throw new Error(current.error?.message || 'Ann could not finish this check.');
  return current.result as T;
}
