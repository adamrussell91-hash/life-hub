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
    path: typeof item.path === 'string' ? item.path : `pages/${id}.json`
  };
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
