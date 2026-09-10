import {
  getKnowledgeContent,
  knowledgeDataRepo,
  knowledgeDataToken,
  putKnowledgeContent
} from './knowledge-data.mjs';

export const PENDING_FILE = '_curator/pending-proposals.json';
export const DISMISSED_FILE = '_curator/dismissed.json';
export const DEFAULT_KNOWLEDGE_CODE_REPO = 'adamrussell91-hash/knowledge-hub';
export const KNOWLEDGE_CODE_REPO_ENV = 'KNOWLEDGE_CODE_REPO';
export const KNOWLEDGE_WORKFLOW_TOKEN_ENV = 'GITHUB_WORKFLOW_TOKEN';

const RELATIONS = new Set(['related', 'builds-on', 'contrasts-with']);

export function pairKey(a, b) {
  return a < b ? `${a}||${b}` : `${b}||${a}`;
}

export function parsePendingProposal(item) {
  if (!item || typeof item !== 'object') return null;
  if (typeof item.id !== 'string' || typeof item.noteA !== 'string' || typeof item.noteB !== 'string') return null;
  if (typeof item.titleA !== 'string' || typeof item.titleB !== 'string') return null;
  if (typeof item.excerptA !== 'string' || typeof item.excerptB !== 'string') return null;
  if (!RELATIONS.has(item.relation) || typeof item.rationale !== 'string' || typeof item.proposedAt !== 'string') {
    return null;
  }
  return {
    id: item.id,
    noteA: item.noteA,
    noteB: item.noteB,
    titleA: item.titleA,
    titleB: item.titleB,
    excerptA: item.excerptA,
    excerptB: item.excerptB,
    relation: item.relation,
    rationale: item.rationale,
    proposedAt: item.proposedAt
  };
}

export function parseDismissedPair(item) {
  if (!item || typeof item !== 'object') return null;
  if (typeof item.noteA !== 'string' || typeof item.noteB !== 'string' || typeof item.dismissedAt !== 'string') {
    return null;
  }
  return { noteA: item.noteA, noteB: item.noteB, dismissedAt: item.dismissedAt };
}

function parseList(text, parseOne) {
  try {
    const raw = JSON.parse(text);
    return Array.isArray(raw) ? raw.map(parseOne).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function linkBoth(a, b, idA, idB) {
  return {
    a: [...new Set([...(a ?? []).filter(id => id !== idB), idB])],
    b: [...new Set([...(b ?? []).filter(id => id !== idA), idA])]
  };
}

export function approveProposal(pending, pageA, pageB, id) {
  const item = pending.find(row => row.id === id);
  if (!item) return null;
  if (!(
    (pageA.id === item.noteA && pageB.id === item.noteB) ||
    (pageA.id === item.noteB && pageB.id === item.noteA)
  )) {
    return null;
  }
  const linked = linkBoth(pageA.connected, pageB.connected, item.noteA, item.noteB);
  return {
    pending: pending.filter(row => row.id !== id),
    pageA: { ...pageA, connected: pageA.id === item.noteA ? linked.a : linked.b },
    pageB: { ...pageB, connected: pageB.id === item.noteB ? linked.b : linked.a }
  };
}

export function dismissProposal(pending, dismissed, id, dismissedAt) {
  const item = pending.find(row => row.id === id);
  if (!item) return null;
  const already = dismissed.some(row => pairKey(row.noteA, row.noteB) === pairKey(item.noteA, item.noteB));
  return {
    pending: pending.filter(row => row.id !== id),
    dismissed: already ? dismissed : [...dismissed, { noteA: item.noteA, noteB: item.noteB, dismissedAt }]
  };
}

export function knowledgeCodeRepo(env) {
  const configured = typeof env?.[KNOWLEDGE_CODE_REPO_ENV] === 'string' ? env[KNOWLEDGE_CODE_REPO_ENV].trim() : '';
  return configured || DEFAULT_KNOWLEDGE_CODE_REPO;
}

export function knowledgeWorkflowToken(env) {
  const dedicated = typeof env?.[KNOWLEDGE_WORKFLOW_TOKEN_ENV] === 'string' ? env[KNOWLEDGE_WORKFLOW_TOKEN_ENV].trim() : '';
  return dedicated || knowledgeDataToken(env);
}

export async function loadCuratorQueue({ env, fetchImpl = fetch } = {}) {
  const [pendingFile, dismissedFile] = await Promise.all([
    getKnowledgeContent(PENDING_FILE, { env, fetchImpl }),
    getKnowledgeContent(DISMISSED_FILE, { env, fetchImpl })
  ]);
  return {
    pending: pendingFile ? parseList(pendingFile.text, parsePendingProposal) : [],
    pendingSha: pendingFile?.sha,
    dismissed: dismissedFile ? parseList(dismissedFile.text, parseDismissedPair) : [],
    dismissedSha: dismissedFile?.sha
  };
}

export async function dispatchCurator({ env, fetchImpl = fetch, ref = 'main' } = {}) {
  const repo = knowledgeCodeRepo(env);
  const token = knowledgeWorkflowToken(env);
  if (!token) {
    throw Object.assign(new Error('Curator workflow token is not bound.'), {
      status: 503,
      code: 'knowledge_workflow_unbound'
    });
  }
  const response = await fetchImpl(
    `https://api.github.com/repos/${repo}/actions/workflows/curator.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'user-agent': 'life-hub'
      },
      body: JSON.stringify({ ref })
    }
  );
  if (!response.ok && response.status !== 204) {
    const detail = await response.text();
    throw Object.assign(new Error(`workflow dispatch failed ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`), {
      status: response.status === 409 ? 409 : 502,
      code: 'curator_dispatch_failed'
    });
  }
}

async function readCuratorPage(id, deps) {
  const file = await getKnowledgeContent(`pages/${id}.json`, deps);
  if (!file?.text) return null;
  try {
    const page = JSON.parse(file.text);
    return page && typeof page === 'object' && page.id === id ? { page, sha: file.sha } : null;
  } catch {
    return null;
  }
}

export async function applyCuratorAction({
  action,
  id,
  env,
  fetchImpl = fetch,
  nowIso = () => new Date().toISOString()
} = {}) {
  const queue = await loadCuratorQueue({ env, fetchImpl });
  const ids = action === 'approve-all' || action === 'dismiss-all'
    ? queue.pending.map(item => item.id)
    : id
      ? [id]
      : [];
  if (!ids.length || !['approve', 'dismiss', 'approve-all', 'dismiss-all'].includes(action)) {
    throw Object.assign(new Error('Unknown action'), { status: 400, code: 'validation_error' });
  }

  let pending = queue.pending;
  let dismissed = queue.dismissed;
  const now = nowIso();
  for (const itemId of ids) {
    if (action === 'approve' || action === 'approve-all') {
      const item = pending.find(row => row.id === itemId);
      if (!item) continue;
      const [left, right] = await Promise.all([
        readCuratorPage(item.noteA, { env, fetchImpl }),
        readCuratorPage(item.noteB, { env, fetchImpl })
      ]);
      if (!left || !right) continue;
      const result = approveProposal(pending, left.page, right.page, itemId);
      if (!result) continue;
      pending = result.pending;
      await putKnowledgeContent(`pages/${result.pageA.id}.json`, JSON.stringify(result.pageA), {
        env,
        fetchImpl,
        sha: left.sha,
        message: `Link ${result.pageA.id}`
      });
      await putKnowledgeContent(`pages/${result.pageB.id}.json`, JSON.stringify(result.pageB), {
        env,
        fetchImpl,
        sha: right.sha,
        message: `Link ${result.pageB.id}`
      });
    } else {
      const result = dismissProposal(pending, dismissed, itemId, now);
      if (!result) continue;
      pending = result.pending;
      dismissed = result.dismissed;
    }
  }

  await putKnowledgeContent(PENDING_FILE, JSON.stringify(pending), {
    env,
    fetchImpl,
    sha: queue.pendingSha,
    message: 'Update curator pending'
  });
  await putKnowledgeContent(DISMISSED_FILE, JSON.stringify(dismissed), {
    env,
    fetchImpl,
    sha: queue.dismissedSha,
    message: 'Update curator dismissed'
  });
  return { pending };
}

export function curatorBound(env) {
  return Boolean(knowledgeDataRepo(env) && knowledgeDataToken(env));
}
