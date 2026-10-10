// Memory only: never persist private schedule data across sessions.
const TTL_MS = 60_000;
const MAX_ENTRIES = 200;
type Entry = {promise: Promise<unknown>; expiresAt: number};
const reads = new Map<string, Entry>();

export function clearScheduleReadCache(): void { reads.clear(); }

export function isScheduleRead(path: string): boolean {
  const url = new URL(path, 'https://hub.invalid');
  if (url.searchParams.get('fresh') === '1') return false;
  if (['/api/events', '/api/pd-groups', '/api/schedule-projections', '/api/communications', '/api/meetings', '/api/threads', '/api/people/directory', '/api/people/ledger'].includes(url.pathname)) return true;
  return url.pathname === '/api/universal-links' && /^professional:(event|pd_group|communication|meeting|thread):/.test(url.searchParams.get('entity_ref') ?? '');
}

export function changesScheduleReads(path: string): boolean {
  const pathname = path.split('?')[0]!;
  return ['/api/events', '/api/pd-groups', '/api/universal-links', '/api/auth', '/api/logout', '/api/communications', '/api/meetings', '/api/threads', '/api/entities', '/api/tasks'].includes(pathname) || pathname.startsWith('/api/people/') || pathname.startsWith('/api/organisations/');
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

export function cachedScheduleRead<T>(key: string, load: () => Promise<T>, signal?: AbortSignal): Promise<T> {
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
