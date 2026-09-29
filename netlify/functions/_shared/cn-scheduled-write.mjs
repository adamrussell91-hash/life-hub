/**
 * Scheduled jobs writing Central Node without a chat shortcut context.
 * Auto-class Cross-Agent appends land now; Confirm-class patches go to the queue.
 */
import {
  applyCentralNodePatch,
  classifyCentralNodePatchRisk
} from '../../../apps/life/js/core/central-node-patch.js';
import { PENDING_CN_PATCHES_PATH } from '../../../apps/life/js/core/pending-cn-patches.js';
import {
  addPendingCnPatch,
  createPendingCnPatchId,
  findDuplicatePendingCnPatch,
  parsePendingCnPatches,
  serializePendingCnPatches
} from './cn-patch-queue.mjs';
import { getSydneyDateKey } from '../../../apps/life/js/core/time.js';
import { decodeBlob } from './decode-blob.mjs';

const CENTRAL_NODE_PATH = 'central-node.md';

function blobAt(tree, path) {
  return (tree?.tree ?? []).find(item => item.path === path && item.type === 'blob') ?? null;
}

async function readText(client, tree, path) {
  const blob = blobAt(tree, path);
  if (!blob?.sha) return { text: null, sha: null };
  const raw = await client.readBlob(blob.sha);
  if (typeof raw === 'string') return { text: raw, sha: blob.sha };
  const text = decodeBlob(raw);
  return { text, sha: blob.sha };
}

/**
 * Auto-apply a signed Cross-Agent line (e.g. Clare→Hammond: …).
 * Returns { applied: boolean, skipped?: string }.
 */
export async function applyScheduledCrossAgentLine({
  client,
  line,
  summary,
  agentSlug = 'clare',
  now = new Date()
}) {
  const text = String(line ?? '').replace(/^-\s*/, '').trim();
  if (!text.includes('→')) return { applied: false, skipped: 'unsigned' };
  const patch = {
    section: 'cross_agent',
    op: 'append_line',
    payload: { summary: String(summary ?? text).trim().slice(0, 160), text }
  };
  if (classifyCentralNodePatchRisk(patch) !== 'auto') {
    return { applied: false, skipped: 'not_auto' };
  }

  const tree = await client.resolveTree();
  const cn = await readText(client, tree, CENTRAL_NODE_PATH);
  if (cn.text == null) return { applied: false, skipped: 'cn_missing' };

  const next = applyCentralNodePatch(cn.text, patch);
  if (!next || next === cn.text) return { applied: false, skipped: 'noop' };

  await client.writeFile({
    path: CENTRAL_NODE_PATH,
    content: next,
    ...(cn.sha ? { sha: cn.sha } : {}),
    message: `chore(cn): ${agentSlug}: ${patch.payload.summary}`
  });
  return { applied: true, today: getSydneyDateKey(now) };
}

/**
 * Queue a Confirm-class Central Node patch (durable pending-cn-patches.json).
 */
export async function queueScheduledCnPatch({
  client,
  patch,
  slug,
  evidence = '',
  now = new Date()
}) {
  if (!patch || typeof patch !== 'object') return { queued: false, skipped: 'invalid' };
  const tree = await client.resolveTree();
  const file = await readText(client, tree, PENDING_CN_PATCHES_PATH);
  const queue = parsePendingCnPatches(file.text ?? '');
  const duplicate = findDuplicatePendingCnPatch(queue, patch);
  if (duplicate) {
    return { queued: false, already_queued: true, id: duplicate.id };
  }
  const entry = {
    id: createPendingCnPatchId(),
    createdAt: getSydneyDateKey(now),
    slug: String(slug ?? 'clare'),
    evidence: typeof evidence === 'string' ? evidence.trim() : '',
    patch
  };
  const next = addPendingCnPatch(queue, entry);
  await client.writeFile({
    path: PENDING_CN_PATCHES_PATH,
    content: serializePendingCnPatches(next),
    ...(file.sha ? { sha: file.sha } : {}),
    message: `chore(cn): queue ${entry.id}`
  });
  return { queued: true, id: entry.id };
}

/** Read/write a small JSON state blob on the data repo. */
export async function readGithubJsonState(client, path) {
  const tree = await client.resolveTree();
  const file = await readText(client, tree, path);
  if (!file.text) return { state: {}, sha: null };
  try {
    const parsed = JSON.parse(file.text);
    return { state: parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}, sha: file.sha };
  } catch {
    return { state: {}, sha: file.sha };
  }
}

export async function writeGithubJsonState(client, path, state, { sha, message } = {}) {
  await client.writeFile({
    path,
    content: `${JSON.stringify(state, null, 2)}\n`,
    ...(sha ? { sha } : {}),
    message: message || `chore: update ${path}`
  });
}
