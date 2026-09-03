const GITHUB_ORIGIN = 'https://api.github.com';
const REPOSITORY = /^(?<owner>[A-Za-z0-9](?:[A-Za-z0-9.-]{0,38}))\/(?<repo>[A-Za-z0-9_.-]{1,100})$/;
const PAGE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

export const DEFAULT_KNOWLEDGE_DATA_REPO = 'adamrussell91-hash/knowledge-hub-data';
export const KNOWLEDGE_DATA_REPO_ENV = 'KNOWLEDGE_GITHUB_REPOSITORY';
export const KNOWLEDGE_DATA_TOKEN_ENV = 'GITHUB_TOKEN';

export function knowledgeWriteError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

export function knowledgeDataRepo(env) {
  const configured = typeof env?.[KNOWLEDGE_DATA_REPO_ENV] === 'string'
    ? env[KNOWLEDGE_DATA_REPO_ENV].trim()
    : '';
  return configured || DEFAULT_KNOWLEDGE_DATA_REPO;
}

export function knowledgeDataToken(env) {
  const token = env?.[KNOWLEDGE_DATA_TOKEN_ENV];
  return typeof token === 'string' && token.length > 0 ? token : '';
}

export function isSafeKnowledgePageId(id) {
  return typeof id === 'string' && PAGE_ID.test(id);
}

export function readKnowledgePageId(request, context = {}) {
  const fromContext = context.params?.id;
  if (isSafeKnowledgePageId(fromContext)) return fromContext;
  const match = new URL(request.url).pathname.match(/\/api\/knowledge\/pages\/([^/]+)$/);
  return match && isSafeKnowledgePageId(match[1]) ? match[1] : '';
}

function requireBoundRepo(env) {
  const repo = knowledgeDataRepo(env);
  const token = knowledgeDataToken(env);
  if (!REPOSITORY.test(repo) || !token) {
    throw knowledgeWriteError(
      503,
      'knowledge_repo_unbound',
      'Knowledge data repository is not bound.'
    );
  }
  return { repo, token };
}

async function githubJson(url, { token, fetchImpl }) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'user-agent': 'life-hub'
      }
    });
  } catch {
    throw knowledgeWriteError(502, 'github_unavailable', 'Knowledge data repository is unavailable.');
  }
  if (response.status === 401 || response.status === 403) {
    throw knowledgeWriteError(
      503,
      'knowledge_repo_unbound',
      'Knowledge data repository is not bound.'
    );
  }
  if (response.status === 404) {
    throw knowledgeWriteError(404, 'not_found', 'Not found');
  }
  if (!response.ok) {
    throw knowledgeWriteError(502, 'github_unavailable', 'Knowledge data repository is unavailable.');
  }
  try {
    return await response.json();
  } catch {
    throw knowledgeWriteError(502, 'github_unavailable', 'Knowledge data repository is unavailable.');
  }
}

export async function readKnowledgeFile(file, { env, fetchImpl = fetch } = {}) {
  const { repo, token } = requireBoundRepo(env);
  const encoded = file.split('/').map(segment => encodeURIComponent(segment)).join('/');
  const payload = await githubJson(
    `${GITHUB_ORIGIN}/repos/${repo}/contents/${encoded}`,
    { token, fetchImpl }
  );
  if (typeof payload?.sha !== 'string') {
    throw knowledgeWriteError(502, 'github_unavailable', 'Knowledge data repository is unavailable.');
  }
  let text =
    payload.encoding === 'base64' && typeof payload.content === 'string'
      ? Buffer.from(payload.content.replace(/\n/g, ''), 'base64').toString('utf8')
      : '';
  if (!text && (payload.size ?? 0) > 0) {
    let blob;
    try {
      blob = await fetchImpl(`${GITHUB_ORIGIN}/repos/${repo}/git/blobs/${payload.sha}`, {
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/vnd.github.raw',
          'user-agent': 'life-hub'
        }
      });
    } catch {
      throw knowledgeWriteError(502, 'github_unavailable', 'Knowledge data repository is unavailable.');
    }
    if (!blob.ok) {
      throw knowledgeWriteError(502, 'github_unavailable', 'Knowledge data repository is unavailable.');
    }
    text = await blob.text();
  }
  if ((payload.size ?? 0) > 0 && !text) {
    throw knowledgeWriteError(502, 'github_unavailable', 'Knowledge data repository is unavailable.');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw knowledgeWriteError(502, 'github_unavailable', 'Knowledge data file is not JSON.');
  }
}

function summarizeManifestEntry(item) {
  if (!item || typeof item !== 'object') return null;
  const id = typeof item.id === 'string' ? item.id : '';
  const title = typeof item.title === 'string' ? item.title : '';
  if (!id || !title) return null;
  return {
    id,
    title,
    area: typeof item.area === 'string' ? item.area : undefined,
    tags: Array.isArray(item.tags) ? item.tags.filter(tag => typeof tag === 'string') : [],
    excerpt: typeof item.excerpt === 'string' ? item.excerpt : '',
    created_at: typeof item.created_at === 'string' ? item.created_at : undefined,
    origins: Array.isArray(item.origins) ? item.origins : undefined,
    path: typeof item.path === 'string' ? item.path : `pages/${id}.json`
  };
}

function excerptFromBody(body) {
  const plain = String(body ?? '').replace(/[#*_`[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  return plain.length > 157 ? `${plain.slice(0, 157)}...` : plain;
}

export function newKnowledgePageId() {
  return `page_hub_${crypto.randomUUID().replace(/-/g, '').toLowerCase()}`;
}

export function rankKnowledgePages(entries, query) {
  const needle = String(query ?? '').trim().toLowerCase();
  if (!needle) return [];
  return entries
    .filter(entry => {
      const originLabels = Array.isArray(entry.origins)
        ? entry.origins.map(origin => origin?.label).filter(Boolean)
        : [];
      return [entry.title, entry.excerpt, ...(entry.tags ?? []), ...originLabels]
        .some(value => typeof value === 'string' && value.toLowerCase().includes(needle));
    })
    .sort((a, b) => Number(String(b.title ?? '').toLowerCase().includes(needle))
      - Number(String(a.title ?? '').toLowerCase().includes(needle)));
}

export function parseQuizStore(raw) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    schema_version: 1,
    schedule: Array.isArray(value.schedule) ? value.schedule : [],
    edges: Array.isArray(value.edges) ? value.edges : [],
    dumps: Array.isArray(value.dumps) ? value.dumps : []
  };
}

export function parseQuizItems(raw) {
  if (Array.isArray(raw)) return raw;
  return Array.isArray(raw?.items) ? raw.items : [];
}

async function githubRequest(url, { token, fetchImpl, method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'user-agent': 'life-hub',
        ...(body ? { 'content-type': 'application/json' } : {})
      },
      ...(body ? { body } : {})
    });
  } catch {
    throw knowledgeWriteError(502, 'github_unavailable', 'Knowledge data repository is unavailable.');
  }
  return response;
}

export async function getKnowledgeContent(file, { env, fetchImpl = fetch } = {}) {
  const { repo, token } = requireBoundRepo(env);
  const encoded = file.split('/').map(segment => encodeURIComponent(segment)).join('/');
  const response = await githubRequest(
    `${GITHUB_ORIGIN}/repos/${repo}/contents/${encoded}`,
    { token, fetchImpl }
  );
  if (response.status === 404) return null;
  if (response.status === 401 || response.status === 403) {
    throw knowledgeWriteError(503, 'knowledge_repo_unbound', 'Knowledge data repository is not bound.');
  }
  if (!response.ok) {
    throw knowledgeWriteError(502, 'github_unavailable', 'Knowledge data repository is unavailable.');
  }
  const payload = await response.json();
  if (typeof payload?.sha !== 'string') {
    throw knowledgeWriteError(502, 'github_unavailable', 'Knowledge data repository is unavailable.');
  }
  let text =
    payload.encoding === 'base64' && typeof payload.content === 'string'
      ? Buffer.from(payload.content.replace(/\n/g, ''), 'base64').toString('utf8')
      : '';
  if (!text && (payload.size ?? 0) > 0) {
    const blob = await githubRequest(`${GITHUB_ORIGIN}/repos/${repo}/git/blobs/${payload.sha}`, {
      token,
      fetchImpl
    });
    if (!blob.ok) {
      throw knowledgeWriteError(502, 'github_unavailable', 'Knowledge data repository is unavailable.');
    }
    text = await blob.text();
  }
  return { sha: payload.sha, text };
}

export async function putKnowledgeContent(file, text, { env, fetchImpl = fetch, sha, message } = {}) {
  const { repo, token } = requireBoundRepo(env);
  const encoded = file.split('/').map(segment => encodeURIComponent(segment)).join('/');
  const response = await githubRequest(
    `${GITHUB_ORIGIN}/repos/${repo}/contents/${encoded}`,
    {
      token,
      fetchImpl,
      method: 'PUT',
      body: JSON.stringify({
        message: message || `Save ${file}`,
        content: Buffer.from(text).toString('base64'),
        ...(sha ? { sha } : {})
      })
    }
  );
  if (response.status === 409) {
    throw knowledgeWriteError(409, 'conflict', 'save collided, try again');
  }
  if (response.status === 401 || response.status === 403) {
    throw knowledgeWriteError(503, 'knowledge_repo_unbound', 'Knowledge data repository is not bound.');
  }
  if (!response.ok) {
    throw knowledgeWriteError(502, 'github_unavailable', 'Knowledge data repository is unavailable.');
  }
}

async function putWithRetry(file, text, deps, message, knownSha) {
  try {
    await putKnowledgeContent(file, text, { ...deps, sha: knownSha, message });
  } catch (error) {
    if (error?.status !== 409) throw error;
    const again = await getKnowledgeContent(file, deps);
    try {
      await putKnowledgeContent(file, text, { ...deps, sha: again?.sha, message });
    } catch (retry) {
      if (retry?.status === 409) {
        throw knowledgeWriteError(409, 'conflict', 'save collided, try again');
      }
      throw retry;
    }
  }
}

export async function saveKnowledgePage(input, { env, fetchImpl = fetch, nowIso = () => new Date().toISOString() } = {}) {
  const title = typeof input?.title === 'string' ? input.title.trim() : '';
  if (!title) {
    throw knowledgeWriteError(400, 'validation_error', 'title is required');
  }
  const id = isSafeKnowledgePageId(input.id) ? input.id : newKnowledgePageId();
  const existing = await getKnowledgeContent(`pages/${id}.json`, { env, fetchImpl });
  let previous = null;
  if (existing?.text) {
    try { previous = JSON.parse(existing.text); } catch { previous = null; }
  }
  const timestamp = nowIso();
  const body = typeof input.body === 'string' ? input.body : (previous?.body ?? '');
  const stored = {
    id,
    title,
    area: input.area === 'university' || input.area === 'notes' ? input.area : (previous?.area ?? 'notes'),
    tags: Array.isArray(input.tags) ? input.tags.filter(tag => typeof tag === 'string') : (previous?.tags ?? []),
    body,
    connected: Array.isArray(input.connected) ? input.connected : (previous?.connected ?? []),
    attachments: Array.isArray(input.attachments) ? input.attachments : (previous?.attachments ?? []),
    source: input.source === 'notion' ? 'notion' : 'hub',
    created_at: previous?.created_at ?? (typeof input.created_at === 'string' ? input.created_at : timestamp),
    updated_at: timestamp,
    schema_version: 1,
    ...(input.origins === undefined && previous?.origins?.length
      ? { origins: previous.origins }
      : Array.isArray(input.origins) ? { origins: input.origins } : {})
  };
  await putKnowledgeContent(`pages/${id}.json`, JSON.stringify(stored), {
    env,
    fetchImpl,
    sha: existing?.sha,
    message: `Save ${id}`
  });
  const manifestFile = await getKnowledgeContent('manifest.json', { env, fetchImpl });
  let rows = [];
  if (manifestFile?.text) {
    try {
      const raw = JSON.parse(manifestFile.text);
      rows = Array.isArray(raw) ? raw : Array.isArray(raw?.pages) ? raw.pages : [];
    } catch {
      rows = [];
    }
  }
  const entry = {
    id,
    title: stored.title,
    area: stored.area,
    tags: stored.tags,
    excerpt: excerptFromBody(stored.body),
    created_at: stored.created_at,
    path: `pages/${id}.json`,
    ...(stored.origins ? { origins: stored.origins } : {})
  };
  const merged = [...rows.filter(row => row?.id !== id), entry];
  await putWithRetry('manifest.json', JSON.stringify(merged), { env, fetchImpl }, `Upsert ${id}`, manifestFile?.sha);
  return stored;
}

export async function getQuizStore({ env, fetchImpl = fetch } = {}) {
  const file = await getKnowledgeContent('quiz/schedule.json', { env, fetchImpl });
  if (!file?.text) return parseQuizStore(null);
  try {
    return parseQuizStore(JSON.parse(file.text));
  } catch {
    return parseQuizStore(null);
  }
}

export async function getQuizItems(pageId, { env, fetchImpl = fetch } = {}) {
  if (!isSafeKnowledgePageId(pageId)) return [];
  const file = await getKnowledgeContent(`quiz/items/${pageId}.json`, { env, fetchImpl });
  if (!file?.text) return [];
  try {
    return parseQuizItems(JSON.parse(file.text));
  } catch {
    return [];
  }
}

export async function saveQuizRecord(input, { env, fetchImpl = fetch } = {}) {
  if (!Array.isArray(input?.schedule) || !Array.isArray(input?.items)) {
    throw knowledgeWriteError(400, 'validation_error', 'schedule and items arrays are required');
  }
  const current = await getKnowledgeContent('quiz/schedule.json', { env, fetchImpl });
  let previous = parseQuizStore(null);
  if (current?.text) {
    try { previous = parseQuizStore(JSON.parse(current.text)); } catch { previous = parseQuizStore(null); }
  }
  const store = {
    schema_version: 1,
    schedule: input.schedule,
    edges: Array.isArray(input.edges) ? input.edges : previous.edges,
    dumps: Array.isArray(input.dumps) ? input.dumps : previous.dumps
  };
  await putWithRetry('quiz/schedule.json', JSON.stringify(store), { env, fetchImpl }, 'Save quiz schedule', current?.sha);
  const byPage = new Map();
  for (const item of input.items) {
    const pageId = typeof item?.page_id === 'string' ? item.page_id : '';
    if (!isSafeKnowledgePageId(pageId)) continue;
    const list = byPage.get(pageId) ?? [];
    list.push(item);
    byPage.set(pageId, list);
  }
  for (const [pageId, incoming] of byPage) {
    const path = `quiz/items/${pageId}.json`;
    const existingFile = await getKnowledgeContent(path, { env, fetchImpl });
    await putWithRetry(path, JSON.stringify({ items: incoming }), { env, fetchImpl }, `Save quiz items ${pageId}`, existingFile?.sha);
  }
  return store;
}

export async function listKnowledgePages({ env, fetchImpl = fetch } = {}) {
  let raw;
  try {
    raw = await readKnowledgeFile('manifest.json', { env, fetchImpl });
  } catch (error) {
    if (error?.status === 404) {
      throw knowledgeWriteError(
        503,
        'knowledge_repo_unbound',
        'Knowledge data repository is not bound.'
      );
    }
    throw error;
  }
  const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.pages) ? raw.pages : null;
  if (!rows) {
    throw knowledgeWriteError(502, 'github_unavailable', 'Knowledge manifest is invalid.');
  }
  return rows.map(summarizeManifestEntry).filter(Boolean);
}

export async function getKnowledgePage(id, { env, fetchImpl = fetch } = {}) {
  if (!isSafeKnowledgePageId(id)) return null;
  try {
    const page = await readKnowledgeFile(`pages/${id}.json`, { env, fetchImpl });
    return page && typeof page === 'object' ? page : null;
  } catch (error) {
    if (error?.status === 404) return null;
    throw error;
  }
}
