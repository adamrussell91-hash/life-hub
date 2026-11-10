/**
 * A store for one request that reads each blob and lists each prefix once.
 *
 * A progress page reads the class, the markbook, the schedule and the student's pieces from
 * several helpers, each of which used to fetch them again. This wrapper keeps the first answer
 * for the rest of the request. A write or delete through it forgets that key and every listing
 * that could hold it, so a helper that writes and reads back still sees its own write.
 * Each caller gets its own copy, so one helper changing a result can't change another's.
 * Everything else passes straight through to the real store.
 */
export function requestStore(store) {
  const reads = new Map();
  const lists = new Map();
  const copy = (value) => (value === null || typeof value !== 'object' ? value : structuredClone(value));
  const forget = (key) => {
    for (const k of reads.keys()) if (k.startsWith(`${key}\u0000`)) reads.delete(k);
    for (const k of lists.keys()) if (key.startsWith(k.split('\u0000')[0])) lists.delete(k);
  };
  const remember = (cache, id, load) => {
    if (!cache.has(id)) {
      const pending = load();
      cache.set(id, pending);
      // A failed read isn't kept: the next caller tries again.
      pending.catch(() => cache.get(id) === pending && cache.delete(id));
    }
    return cache.get(id).then(copy);
  };
  return new Proxy(store, {
    get(target, prop) {
      if (prop === 'get') return (key, options) => remember(reads, `${key}\u0000${JSON.stringify(options ?? null)}`, () => target.get(key, options));
      if (prop === 'list') return (options = {}) => remember(lists, `${options.prefix ?? ''}\u0000${JSON.stringify(options)}`, () => target.list(options));
      if (prop === 'set' || prop === 'setJSON' || prop === 'delete') {
        return async (key, ...rest) => {
          forget(key);
          try {
            return await target[prop](key, ...rest);
          } finally {
            forget(key);
          }
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}
