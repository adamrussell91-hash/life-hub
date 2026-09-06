import { createHash } from 'node:crypto';
import { decodeBlob } from './decode-blob.mjs';
import { createGitHubClient } from './github-client.mjs';

export const URL_WATCHES_PATH = 'data/knowledge/url-watches.json';
export const URL_WATCH_STATUSES = new Set(['changed', 'unchanged', 'unavailable']);

const URL_RE = /https?:\/\/[^\s<>"'`)\]]+/gi;
const HUB_HOST_RE = /(^|\.)adam-russell\.com$/i;
const FIRECRAWL_SCRAPE = 'https://api.firecrawl.dev/v1/scrape';
const MAX_BODY_CHARS = 1_000_000;

export function fingerprintText(text) {
  return createHash('sha256').update(typeof text === 'string' ? text : '').digest('hex');
}

export function extractWatchUrls(body) {
  if (typeof body !== 'string' || !body) return [];
  const seen = new Set();
  const out = [];
  for (const raw of body.match(URL_RE) ?? []) {
    const cleaned = raw.replace(/[.,;:]+$/g, '');
    let parsed;
    try {
      parsed = new URL(cleaned);
    } catch {
      continue;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
    if (HUB_HOST_RE.test(parsed.hostname)) continue;
    const href = parsed.href;
    if (seen.has(href)) continue;
    seen.add(href);
    out.push(href);
  }
  return out;
}

export function emptyUrlWatchStore() {
  return { schema_version: 1, watches: [] };
}

export function parseUrlWatchStore(raw) {
  const store = emptyUrlWatchStore();
  const source = raw && typeof raw === 'object' ? raw : {};
  const rows = Array.isArray(source.watches) ? source.watches : [];
  for (const row of rows) {
    if (!row || typeof row.url !== 'string') continue;
    let url;
    try {
      url = new URL(row.url).href;
    } catch {
      continue;
    }
    store.watches.push({
      url,
      etag: typeof row.etag === 'string' && row.etag ? row.etag : null,
      fingerprint: typeof row.fingerprint === 'string' && row.fingerprint ? row.fingerprint : null,
      status: URL_WATCH_STATUSES.has(row.status) ? row.status : 'unavailable',
      checked_at: typeof row.checked_at === 'string' ? row.checked_at : null,
      page_id: typeof row.page_id === 'string' ? row.page_id : null
    });
  }
  return store;
}

export function normalizeUrlWatchStatus(result) {
  if (Array.isArray(result)) {
    return { watches: result, status: 'ready' };
  }
  if (result && typeof result === 'object') {
    const watches = Array.isArray(result.watches) ? result.watches : [];
    const status = result.status === 'unavailable' ? 'unavailable' : 'ready';
    return { watches, status };
  }
  return { watches: [], status: 'ready' };
}

function previousByUrl(store) {
  const map = new Map();
  for (const row of store.watches) map.set(row.url, row);
  return map;
}

export async function checkWatchedUrl({
  url,
  previous = null,
  fetchImpl = fetch,
  firecrawlKey = ''
} = {}) {
  const headers = { 'user-agent': 'life-hub-url-watch' };
  if (previous?.etag) headers['if-none-match'] = previous.etag;
  try {
    const response = await fetchImpl(url, { method: 'GET', headers, redirect: 'follow' });
    if (response.status === 304) {
      return {
        url,
        status: 'unchanged',
        etag: previous?.etag ?? null,
        fingerprint: previous?.fingerprint ?? null
      };
    }
    if (response.ok) {
      const etag = response.headers.get('etag');
      const text = String(await response.text()).slice(0, MAX_BODY_CHARS);
      const fingerprint = fingerprintText(text);
      const status = previous?.fingerprint && previous.fingerprint !== fingerprint ? 'changed' : 'unchanged';
      return {
        url,
        status,
        etag: etag && etag.trim() ? etag.trim() : null,
        fingerprint
      };
    }
  } catch {
    // Fall through to Firecrawl or unavailable — never invent a change from search.
  }
  const scraped = await scrapeFirecrawl(url, firecrawlKey, fetchImpl);
  if (scraped == null) {
    return {
      url,
      status: 'unavailable',
      etag: previous?.etag ?? null,
      fingerprint: previous?.fingerprint ?? null
    };
  }
  const fingerprint = fingerprintText(scraped);
  const status = previous?.fingerprint && previous.fingerprint !== fingerprint ? 'changed' : 'unchanged';
  return { url, status, etag: previous?.etag ?? null, fingerprint };
}

async function scrapeFirecrawl(url, key, fetchImpl) {
  if (typeof key !== 'string' || !key.trim()) return null;
  try {
    const response = await fetchImpl(FIRECRAWL_SCRAPE, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key.trim()}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ url, formats: ['markdown'] })
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const markdown = payload?.data?.markdown;
    return typeof markdown === 'string' ? markdown.slice(0, MAX_BODY_CHARS) : null;
  } catch {
    return null;
  }
}

async function readWatchStore(client, tree) {
  const file = tree.find(item => item.path === URL_WATCHES_PATH && item.type === 'blob');
  if (!file?.sha) return { store: emptyUrlWatchStore(), sha: null };
  const content = decodeBlob(await client.readBlob(file.sha));
  if (typeof content !== 'string') return { store: emptyUrlWatchStore(), sha: file.sha };
  try {
    return { store: parseUrlWatchStore(JSON.parse(content)), sha: file.sha };
  } catch {
    return { store: emptyUrlWatchStore(), sha: file.sha };
  }
}

function mergeWatchRows(store, incoming, nowIso) {
  const byUrl = previousByUrl(store);
  for (const row of incoming) {
    byUrl.set(row.url, {
      url: row.url,
      etag: row.etag ?? null,
      fingerprint: row.fingerprint ?? null,
      status: URL_WATCH_STATUSES.has(row.status) ? row.status : 'unavailable',
      checked_at: nowIso,
      page_id: row.page_id ?? byUrl.get(row.url)?.page_id ?? null
    });
  }
  return { schema_version: 1, watches: [...byUrl.values()] };
}

function storeChanged(before, after) {
  return JSON.stringify(before.watches) !== JSON.stringify(after.watches);
}

async function maybeWriteWatchStore(client, current, next, sha) {
  if (!storeChanged(current, next)) return;
  await client.writeFile({
    path: URL_WATCHES_PATH,
    content: JSON.stringify(next),
    sha,
    message: 'Update URL watch fingerprints'
  });
}

async function resolveLifeRepo({ env, fetchImpl, lifeRepo, client }) {
  if (lifeRepo) return lifeRepo;
  const github = client ?? createGitHubClient({ env, fetchImpl });
  const resolved = await github.resolveTree();
  return {
    client: github,
    tree: resolved.tree,
    commitSha: resolved.commitSha,
    treeSha: resolved.treeSha
  };
}

export async function defaultLoadUrlWatches({
  env,
  fetchImpl = fetch,
  page,
  lifeRepo,
  client,
  nowIso = () => new Date().toISOString()
} = {}) {
  const urls = extractWatchUrls(page?.body);
  if (!urls.length) return { watches: [], status: 'ready' };
  try {
    const repo = await resolveLifeRepo({ env, fetchImpl, lifeRepo, client });
    const { store, sha } = await readWatchStore(repo.client, repo.tree);
    const known = previousByUrl(store);
    const watches = [];
    for (const url of urls) {
      const checked = await checkWatchedUrl({
        url,
        previous: known.get(url) ?? null,
        fetchImpl,
        firecrawlKey: env?.FIRECRAWL_API_KEY
      });
      watches.push({
        ...checked,
        page_id: typeof page?.id === 'string' ? page.id : null,
        checked_at: nowIso()
      });
    }
    const next = mergeWatchRows(store, watches, nowIso());
    try {
      await maybeWriteWatchStore(repo.client, store, next, sha);
    } catch {
      // Surface the live check even when the fingerprint write fails.
    }
    return { watches, status: 'ready' };
  } catch {
    return { watches: [], status: 'unavailable' };
  }
}

export async function defaultLoadAllUrlWatches({
  env,
  fetchImpl = fetch,
  lifeRepo,
  client,
  nowIso = () => new Date().toISOString()
} = {}) {
  try {
    const repo = await resolveLifeRepo({ env, fetchImpl, lifeRepo, client });
    const { store, sha } = await readWatchStore(repo.client, repo.tree);
    if (!store.watches.length) return { watches: [], status: 'ready' };
    const watches = [];
    for (const row of store.watches) {
      const checked = await checkWatchedUrl({
        url: row.url,
        previous: row,
        fetchImpl,
        firecrawlKey: env?.FIRECRAWL_API_KEY
      });
      watches.push({
        ...checked,
        page_id: row.page_id,
        checked_at: nowIso()
      });
    }
    const next = mergeWatchRows(store, watches, nowIso());
    try {
      await maybeWriteWatchStore(repo.client, store, next, sha);
    } catch {
      // Keep the polled statuses even if persist fails.
    }
    return { watches, status: 'ready' };
  } catch {
    return { watches: [], status: 'unavailable' };
  }
}
