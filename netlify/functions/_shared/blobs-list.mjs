export async function listBlobKeys(store, prefix) {
  const keys = [];
  let cursor;
  for (let page = 0; page < 50; page += 1) {
    const result = await store.list({
      prefix,
      ...(cursor ? { cursor } : {})
    });
    const blobs = Array.isArray(result?.blobs) ? result.blobs : [];
    for (const blob of blobs) {
      if (typeof blob?.key === 'string' && blob.key) keys.push(blob.key);
    }
    cursor = result?.next_cursor || result?.cursor || '';
    if (!cursor || blobs.length === 0) break;
  }
  return keys;
}

export function isIndexKey(key) {
  return key === '_index' || key.endsWith('/_index');
}

// Runs `fn` over `items` with at most `size` calls in flight. A pool, not
// fixed batches: a slow Blob read holds up only its own slot instead of
// stalling the whole batch. Results keep input order; the first rejection
// rejects the call. Used anywhere a set of Blob reads could grow large
// enough that unbounded concurrent GETs would be a problem (Universal Links
// membership and link hydration).
export async function mapBounded(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index], index, items);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, size), items.length) }, worker));
  return out;
}

export function dedupeRecords(entries) {
  const seen = new Set();
  const rows = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const id = typeof entry.id === 'string' ? entry.id : '';
    if (id) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    rows.push(entry);
  }
  return rows;
}
