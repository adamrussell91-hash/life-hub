// netlify/functions/_shared/notion-client.mjs
export const NOTION_VERSION = '2025-09-03';
const BASE = 'https://api.notion.com';

export class NotionApiError extends Error {
  constructor(status, code, message) {
    super(message || code || `Notion request failed (${status})`);
    this.name = 'NotionApiError';
    this.status = status;
    this.code = code || 'notion_error';
  }
}

export function createNotionClient({
  token,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  maxRetries = 5
}) {
  async function request(method, path, body) {
    for (let attempt = 0; ; attempt += 1) {
      const res = await fetchImpl(`${BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': NOTION_VERSION,
          ...(body ? { 'content-type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined
      });
      if (res.ok) return res.json();
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < maxRetries) {
        const after = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : 500 * 2 ** attempt);
        continue;
      }
      let payload = {};
      try { payload = await res.json(); } catch { /* not json */ }
      throw new NotionApiError(res.status, payload.code, payload.message);
    }
  }

  async function paginate(path, { method = 'GET', body } = {}) {
    const results = [];
    let cursor;
    do {
      let page;
      if (method === 'GET') {
        const qs = new URLSearchParams({ page_size: '100', ...(cursor ? { start_cursor: cursor } : {}) });
        page = await request('GET', `${path}?${qs}`);
      } else {
        page = await request(method, path, { ...body, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
      }
      results.push(...(page.results ?? []));
      cursor = page.has_more ? page.next_cursor : undefined;
    } while (cursor);
    return results;
  }

  return {
    request,
    paginate,
    getPage: (id) => request('GET', `/v1/pages/${id}`),
    listChildren: (id) => paginate(`/v1/blocks/${id}/children`),
    propertyItems: (pageId, propertyId) => paginate(`/v1/pages/${pageId}/properties/${encodeURIComponent(propertyId)}`),
    queryDataSource: (dataSourceId, body) => request('POST', `/v1/data_sources/${dataSourceId}/query`, body)
  };
}
