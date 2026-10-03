import {
  getKnowledgeContent,
  knowledgeDataRepo,
  knowledgeDataToken,
  putKnowledgeContent
} from './knowledge-data.mjs';

export const PENDING_FILE = '_curator/pending-proposals.json';
export const DISMISSED_FILE = '_curator/dismissed.json';
export const AUTO_APPROVED_FILE = '_curator/auto-approved.json';
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
  const confidence = storedConfidence(item.confidence);
  const bookA = storedLabel(item.bookA);
  const bookB = storedLabel(item.bookB);
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
    proposedAt: item.proposedAt,
    ...(confidence !== undefined ? { confidence } : {}),
    ...(bookA ? { bookA } : {}),
    ...(bookB ? { bookB } : {})
  };
}

function storedConfidence(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(1, Math.max(0, value));
}

function storedLabel(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function parseAutoApproved(item) {
  if (!item || typeof item !== 'object') return null;
  if (typeof item.noteA !== 'string' || typeof item.noteB !== 'string') return null;
  if (typeof item.titleA !== 'string' || typeof item.titleB !== 'string') return null;
  if (typeof item.bookA !== 'string' || typeof item.bookB !== 'string') return null;
  if (!RELATIONS.has(item.relation) || typeof item.rationale !== 'string' || typeof item.approvedAt !== 'string') {
    return null;
  }
  const confidence = storedConfidence(item.confidence);
  if (confidence === undefined) return null;
  return {
    noteA: item.noteA,
    noteB: item.noteB,
    titleA: item.titleA,
    titleB: item.titleB,
    bookA: item.bookA,
    bookB: item.bookB,
    relation: item.relation,
    rationale: item.rationale,
    confidence,
    approvedAt: item.approvedAt
  };
}

export function annotatePendingBooks(pending, manifestText) {
  if (!manifestText) return pending.map(item => ({ ...item }));
  let rows = null;
  try {
    const raw = JSON.parse(manifestText);
    rows = Array.isArray(raw) ? raw : Array.isArray(raw?.pages) ? raw.pages : null;
  } catch {
    rows = null;
  }
  if (!rows) {
    throw Object.assign(new Error('Knowledge manifest is unreadable.'), { status: 502, code: 'manifest_unreadable' });
  }
  const byId = new Map(rows.filter(row => row && typeof row.id === 'string').map(row => [row.id, row]));
  return pending.map(item => {
    const bookA = bookLabelOf(byId.get(item.noteA)) ?? item.bookA;
    const bookB = bookLabelOf(byId.get(item.noteB)) ?? item.bookB;
    return {
      ...item,
      ...(bookA ? { bookA } : {}),
      ...(bookB ? { bookB } : {})
    };
  });
}

function bookLabelOf(entry) {
  if (!entry || !Array.isArray(entry.origins)) return undefined;
  const origin = entry.origins.find(item => item && item.kind === 'book' && typeof item.label === 'string' && item.label.trim());
  return origin ? origin.label.trim() : undefined;
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
  const [pendingFile, dismissedFile, autoFile] = await Promise.all([
    getKnowledgeContent(PENDING_FILE, { env, fetchImpl }),
    getKnowledgeContent(DISMISSED_FILE, { env, fetchImpl }),
    getKnowledgeContent(AUTO_APPROVED_FILE, { env, fetchImpl })
  ]);
  return {
    pending: pendingFile ? parseList(pendingFile.text, parsePendingProposal) : [],
    pendingSha: pendingFile?.sha,
    dismissed: dismissedFile ? parseList(dismissedFile.text, parseDismissedPair) : [],
    dismissedSha: dismissedFile?.sha,
    autoApproved: autoFile ? parseList(autoFile.text, parseAutoApproved) : [],
    autoSha: autoFile?.sha
  };
}

export async function presentCuratorQueue(deps) {
  const queue = await loadCuratorQueue(deps);
  const manifestFile = await getKnowledgeContent('manifest.json', deps);
  return {
    pending: annotatePendingBooks(queue.pending, manifestFile?.text),
    autoApproved: queue.autoApproved.slice(-50).reverse()
  };
}

async function putFresh(file, text, message, deps) {
  const fresh = await getKnowledgeContent(file, deps);
  await putKnowledgeContent(file, text, { ...deps, sha: fresh?.sha, message });
}

export async function writeManifestConnected(updates, deps) {
  const manifestFile = await getKnowledgeContent('manifest.json', deps);
  if (!manifestFile?.text) {
    throw Object.assign(new Error('Knowledge manifest is missing; refusing to link without it.'), {
      status: 502,
      code: 'manifest_missing'
    });
  }
  let rows = null;
  try {
    const raw = JSON.parse(manifestFile.text);
    rows = Array.isArray(raw) ? raw : Array.isArray(raw?.pages) ? raw.pages : null;
  } catch {
    rows = null;
  }
  if (!rows) {
    throw Object.assign(new Error('Knowledge manifest is unreadable; refusing to overwrite the archive.'), {
      status: 502,
      code: 'manifest_unreadable'
    });
  }
  const byId = new Map(updates.map(update => [update.id, update.connected]));
  const missing = [...byId.keys()].filter(id => !rows.some(row => row?.id === id));
  if (missing.length) {
    throw Object.assign(new Error(`manifest has no entry for ${missing.join(', ')}`), {
      status: 400,
      code: 'manifest_missing'
    });
  }
  const next = rows.map(row => {
    if (!row || !byId.has(row.id)) return row;
    const connected = byId.get(row.id) ?? [];
    const copy = { ...row };
    if (connected.length) copy.connected = connected;
    else delete copy.connected;
    return copy;
  });
  await putKnowledgeContent('manifest.json', JSON.stringify(next), {
    ...deps,
    sha: manifestFile.sha,
    message: 'Update linked notes'
  });
  return next;
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
  const deps = { env, fetchImpl };
  const queue = await loadCuratorQueue(deps);
  if (action === 'unlink') {
    return unlinkAutoApproved({ id, queue, deps, nowIso });
  }
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
  const linked = new Map();
  const now = nowIso();
  for (const itemId of ids) {
    if (action === 'approve' || action === 'approve-all') {
      const item = pending.find(row => row.id === itemId);
      if (!item) continue;
      const [left, right] = await Promise.all([
        readCuratorPage(item.noteA, deps),
        readCuratorPage(item.noteB, deps)
      ]);
      if (!left || !right) continue;
      const result = approveProposal(pending, left.page, right.page, itemId);
      if (!result) continue;
      pending = result.pending;
      await putKnowledgeContent(`pages/${result.pageA.id}.json`, JSON.stringify(result.pageA), {
        ...deps,
        sha: left.sha,
        message: `Link ${result.pageA.id}`
      });
      await putKnowledgeContent(`pages/${result.pageB.id}.json`, JSON.stringify(result.pageB), {
        ...deps,
        sha: right.sha,
        message: `Link ${result.pageB.id}`
      });
      linked.set(result.pageA.id, result.pageA);
      linked.set(result.pageB.id, result.pageB);
    } else {
      const result = dismissProposal(pending, dismissed, itemId, now);
      if (!result) continue;
      pending = result.pending;
      dismissed = result.dismissed;
    }
  }

  if (linked.size) {
    await writeManifestConnected([...linked].map(([pageId, page]) => ({
      id: pageId,
      connected: page.connected ?? []
    })), deps);
  }
  await putFresh(PENDING_FILE, JSON.stringify(pending), 'Update curator pending', deps);
  await putFresh(DISMISSED_FILE, JSON.stringify(dismissed), 'Update curator dismissed', deps);
  return presentCuratorQueue(deps);
}

async function unlinkAutoApproved({ id, queue, deps, nowIso }) {
  const row = queue.autoApproved.find(item => pairKey(item.noteA, item.noteB) === id);
  if (!row) {
    throw Object.assign(new Error('Unknown auto-approved link'), { status: 400, code: 'validation_error' });
  }
  const [left, right] = await Promise.all([
    readCuratorPage(row.noteA, deps),
    readCuratorPage(row.noteB, deps)
  ]);
  if (!left || !right) {
    throw Object.assign(new Error('One of the linked notes is missing'), { status: 400, code: 'validation_error' });
  }
  const pageA = { ...left.page, connected: (left.page.connected ?? []).filter(item => item !== right.page.id) };
  const pageB = { ...right.page, connected: (right.page.connected ?? []).filter(item => item !== left.page.id) };
  await putKnowledgeContent(`pages/${pageA.id}.json`, JSON.stringify(pageA), {
    ...deps,
    sha: left.sha,
    message: `Unlink ${pageA.id}`
  });
  await putKnowledgeContent(`pages/${pageB.id}.json`, JSON.stringify(pageB), {
    ...deps,
    sha: right.sha,
    message: `Unlink ${pageB.id}`
  });
  await writeManifestConnected([
    { id: pageA.id, connected: pageA.connected },
    { id: pageB.id, connected: pageB.connected }
  ], deps);
  const auto = queue.autoApproved.filter(item => pairKey(item.noteA, item.noteB) !== id);
  const already = queue.dismissed.some(item => pairKey(item.noteA, item.noteB) === id);
  const dismissed = already
    ? queue.dismissed
    : [...queue.dismissed, { noteA: row.noteA, noteB: row.noteB, dismissedAt: nowIso() }];
  await putFresh(AUTO_APPROVED_FILE, JSON.stringify(auto), 'Update curator auto-approved', deps);
  await putFresh(DISMISSED_FILE, JSON.stringify(dismissed), 'Update curator dismissed', deps);
  return presentCuratorQueue(deps);
}

export function curatorBound(env) {
  return Boolean(knowledgeDataRepo(env) && knowledgeDataToken(env));
}
