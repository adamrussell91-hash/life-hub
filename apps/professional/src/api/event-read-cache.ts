// Memory only: never persist private event data across sessions.
const TTL_MS = 60_000;
const MAX_ENTRIES = 200;
type Entry = {promise: Promise<unknown>; expiresAt: number};
const reads = new Map<string, Entry>();

export function clearEventReadCache(): void { reads.clear(); }

export function isEventRead(path: string): boolean {
  const url = new URL(path, 'https://hub.invalid');
  if (['/api/events', '/api/pd-groups', '/api/schedule-projections'].includes(url.pathname)) return true;
  return url.pathname === '/api/universal-links' && /^professional:(event|pd_group):/.test(url.searchParams.get('entity_ref') ?? '');
}

export function changesEventReads(path: string): boolean {
  return ['/api/events', '/api/pd-groups', '/api/universal-links', '/api/auth', '/api/logout'].includes(path.split('?')[0]!);
}

function waitForRead<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', abort, {once:true});
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export function cachedEventRead<T>(key: string, load: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
  let entry = reads.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    if (reads.size >= MAX_ENTRIES) reads.delete(reads.keys().next().value!);
    const fresh: Entry = {promise: Promise.resolve(), expiresAt: Infinity};
    fresh.promise = load().then(value => {
      // A write/refresh can evict this entry while its request is pending.
      if (reads.get(key) === fresh) fresh.expiresAt = Date.now() + TTL_MS;
      return value;
    }).catch(error => {
      if (reads.get(key) === fresh) reads.delete(key);
      throw error;
    });
    reads.set(key, fresh);
    entry = fresh;
  }
  return waitForRead(entry.promise as Promise<T>, signal).then(value => structuredClone(value));
}
