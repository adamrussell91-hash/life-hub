export function memoryAlchemyStore() {
  const rows = new Map(); let serial = 0;
  return {
    rows,
    async get(key) { return structuredClone(rows.get(key)?.data ?? null); },
    async getWithMetadata(key) { return structuredClone(rows.get(key) ?? null); },
    async setJSON(key, data, condition = {}) {
      const row = rows.get(key);
      if ((condition.onlyIfNew && row) || (condition.onlyIfMatch !== undefined && row?.etag !== condition.onlyIfMatch)) return { modified: false };
      const next = { data: structuredClone(data), etag: String(++serial) }; rows.set(key, next); return { modified: true, etag: next.etag };
    }
  };
}
