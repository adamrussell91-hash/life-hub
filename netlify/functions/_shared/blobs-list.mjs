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
