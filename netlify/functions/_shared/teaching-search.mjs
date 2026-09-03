const SEARCH_FIELDS = ['title', 'display_title', 'display_name', 'code', 'slug', 'id'];

export function normalizeSearchQuery(query) {
  return typeof query === 'string' ? query.trim().toLowerCase() : '';
}

export function searchTeachingRecords(query, records, type) {
  const q = normalizeSearchQuery(query);
  if (q.length < 2) return [];

  const hits = [];
  for (const item of records) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const id = typeof item.id === 'string' ? item.id : '';
    if (!id) continue;
    const haystack = SEARCH_FIELDS
      .map(field => item[field])
      .filter(value => typeof value === 'string' && value)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(q)) continue;
    const title = typeof item.title === 'string' && item.title ? item.title : id;
    hits.push({
      type: type || (typeof item.type === 'string' ? item.type : 'record'),
      id,
      title,
      snippet: title
    });
  }
  return hits;
}
