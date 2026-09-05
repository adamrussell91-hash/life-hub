import { hubCalendarDate } from './clare-dates.mjs';
import { buildCapacitySnapshot, toCoreyPublicView } from './tasks-capacity.mjs';
import {
  agentSlug,
  DEFAULT_STRESS_ROUTE,
  detectStressPatterns
} from './tasks-stress.mjs';
import {
  getJSON,
  listJSON,
  newRecordId,
  setJSON,
  TASK_PREFIX
} from './tasks-blobs.mjs';

export const STRESS_FLAG_PREFIX = 'stress_flags/';
export const STRESS_FLAGS_INDEX = 'stress_flags/_index';
export const CAPACITY_SHARE_KEY = 'meta/capacity_share';
export const INTUITIVE_SCAN_META_KEY = 'meta/intuitive_scan';
const PROJECT_PREFIX = 'projects/';
const AGENT_ACTION_PREFIX = 'agent_actions/';

export function stressFlagKey(id) {
  return `${STRESS_FLAG_PREFIX}${id}`;
}

export function agentInboxKey(slug) {
  return `agent_inbox/${slug}`;
}

export function indexIds(doc) {
  if (Array.isArray(doc)) return doc.filter(id => typeof id === 'string');
  if (doc && Array.isArray(doc.ids)) return doc.ids.filter(id => typeof id === 'string');
  return [];
}

async function readIds(store, key) {
  return indexIds(await getJSON(store, key));
}

async function writeIds(store, key, ids) {
  await setJSON(store, key, { ids: [...new Set(ids)] });
}

export function parseIntuitiveScanMeta(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.ran_at !== 'string' || !raw.ran_at) return null;
  return {
    ran_at: raw.ran_at,
    model: typeof raw.model === 'string' ? raw.model : null,
    raised: Number(raw.raised) || 0,
    skipped: Number(raw.skipped) || 0,
    judged: Number(raw.judged) || 0,
    skipped_ai: Boolean(raw.skipped_ai),
    reason: typeof raw.reason === 'string' ? raw.reason : null
  };
}

export async function listStressFlags(store) {
  const ids = await readIds(store, STRESS_FLAGS_INDEX);
  if (!ids.length) return listJSON(store, STRESS_FLAG_PREFIX);
  const flags = [];
  for (const id of ids) {
    const flag = await getJSON(store, stressFlagKey(id));
    if (flag && typeof flag === 'object') flags.push(flag);
  }
  return flags;
}

export async function listAgentInbox(store, agent) {
  const ids = await readIds(store, agentInboxKey(agentSlug(agent)));
  const flags = [];
  for (const id of ids) {
    const flag = await getJSON(store, stressFlagKey(id));
    if (flag && typeof flag === 'object') flags.push(flag);
  }
  return flags;
}

export async function raiseStressFlag(store, input, now = new Date()) {
  const stamp = now.toISOString();
  const description = String(input.pattern_description ?? '').trim();
  if (!description) {
    throw new Error('pattern_description is required');
  }
  const fingerprint =
    input.fingerprint ??
    `manual:${description.slice(0, 80)}:${stamp.slice(0, 10)}`;
  const existing = await listStressFlags(store);
  const dup = existing.find(flag => flag.fingerprint === fingerprint);
  if (dup) return dup;

  const flag = {
    schema_version: 1,
    id: newRecordId('sf'),
    source_project_or_task_id: input.source_project_or_task_id ?? null,
    pattern_description: description,
    pattern_kind: input.pattern_kind ?? 'manual',
    raised_by: 'Clare DeMind',
    routed_to: DEFAULT_STRESS_ROUTE,
    recurrence_note: null,
    fingerprint,
    created_at: stamp
  };
  await setJSON(store, stressFlagKey(flag.id), flag);
  const ids = await readIds(store, STRESS_FLAGS_INDEX);
  ids.push(flag.id);
  await writeIds(store, STRESS_FLAGS_INDEX, ids);

  for (const agent of flag.routed_to) {
    const inboxKey = agentInboxKey(agentSlug(agent));
    const inboxIds = await readIds(store, inboxKey);
    if (!inboxIds.includes(flag.id)) {
      inboxIds.push(flag.id);
      await writeIds(store, inboxKey, inboxIds);
    }
  }

  const log = {
    schema_version: 1,
    id: newRecordId('aal'),
    agent: 'Clare DeMind',
    action: 'create',
    entity_type: 'stress_flag',
    entity_id: flag.id,
    reason: `StressFlag: ${flag.pattern_description}`,
    created_at: stamp
  };
  await setJSON(store, `${AGENT_ACTION_PREFIX}${log.id}`, log);
  return flag;
}

export async function scanAndRaiseStressFlags(store, now = hubCalendarDate()) {
  const [projects, tasks, existing] = await Promise.all([
    listJSON(store, PROJECT_PREFIX),
    listJSON(store, TASK_PREFIX),
    listStressFlags(store)
  ]);
  const patterns = detectStressPatterns(projects, tasks, now);
  const known = new Set(existing.map(flag => flag.fingerprint));
  const raised = [];
  let skipped = 0;
  for (const pattern of patterns) {
    if (known.has(pattern.fingerprint)) {
      skipped += 1;
      continue;
    }
    const flag = await raiseStressFlag(store, pattern, now);
    known.add(flag.fingerprint);
    raised.push(flag);
  }
  return { raised, skipped, patterns: patterns.length };
}

export async function getIntuitiveScanMeta(store) {
  return parseIntuitiveScanMeta(await getJSON(store, INTUITIVE_SCAN_META_KEY));
}

export async function runIntuitiveScan(store, env = process.env, now = new Date()) {
  const ran_at = now.toISOString();
  const hasKey = typeof env?.ANTHROPIC_API_KEY === 'string' && env.ANTHROPIC_API_KEY.trim();
  const result = {
    raised: [],
    skipped: 0,
    judged: 0,
    model: null,
    ran_at,
    skipped_ai: true,
    reason: hasKey ? 'judge_not_ported' : 'no_api_key'
  };
  await setJSON(store, INTUITIVE_SCAN_META_KEY, result);
  return result;
}

export async function getCapacitySnapshot(store, now = hubCalendarDate()) {
  const tasks = await listJSON(store, TASK_PREFIX);
  return buildCapacitySnapshot(tasks, now, 14);
}

export async function getCapacityShare(store) {
  const raw = await getJSON(store, CAPACITY_SHARE_KEY);
  return raw && typeof raw === 'object' ? raw : null;
}

export async function ensureCapacityShare(store, now = new Date()) {
  const existing = await getCapacityShare(store);
  if (existing?.enabled) return existing;
  const stamp = now.toISOString();
  const share = {
    schema_version: 1,
    id: newRecordId('cap'),
    token: crypto.randomUUID().replace(/-/g, ''),
    enabled: true,
    created_at: stamp,
    rotated_at: null
  };
  await setJSON(store, CAPACITY_SHARE_KEY, share);
  return share;
}

export async function rotateCapacityShare(store, now = new Date()) {
  const existing = await getCapacityShare(store);
  const stamp = now.toISOString();
  const share = {
    schema_version: 1,
    id: existing?.id ?? newRecordId('cap'),
    token: crypto.randomUUID().replace(/-/g, ''),
    enabled: true,
    created_at: existing?.created_at ?? stamp,
    rotated_at: stamp
  };
  await setJSON(store, CAPACITY_SHARE_KEY, share);
  return share;
}

export async function getPublicCapacityByToken(store, token, now = hubCalendarDate()) {
  const share = await getCapacityShare(store);
  if (!share || !share.enabled || share.token !== token) return null;
  return toCoreyPublicView(await getCapacitySnapshot(store, now));
}
