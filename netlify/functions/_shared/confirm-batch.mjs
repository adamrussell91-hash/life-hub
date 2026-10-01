/**
 * Same-turn Confirm batching for schedule moves.
 *
 * Clare (and peers) often emit N update_task / propose_calendar_ghost calls for
 * one conversational reschedule. Without coalescing, each call opens its own
 * Confirm card even when chat copy promises one tap.
 */

import { isCalendarGhostConfirmWrite } from './follow-up-agent.mjs';

const TASK_PATH = /^tasks:task:[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;
const GHOST_CONFIRM_PATH = /^data\/os\/calendar-ghost-confirm\/([^/]+)\.md$/;
const SCHEDULE_PATCH_KEYS = new Set([
  'due_date',
  'due_time',
  'estimated_duration',
  'target_date',
  'remind_at'
]);

function parseJsonContent(content) {
  if (typeof content !== 'string' || !content.trim()) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/** Extract ghost id from a calendar-ghost-confirm marker path. */
export function ghostIdFromConfirmPath(path) {
  if (typeof path !== 'string') return null;
  const match = path.trim().match(GHOST_CONFIRM_PATH);
  return match?.[1] || null;
}

export function collectGhostIdsFromWrites(writes) {
  const ids = [];
  const seen = new Set();
  for (const write of Array.isArray(writes) ? writes : []) {
    const id = ghostIdFromConfirmPath(write?.path);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function isScheduleTaskPatchWrite(write) {
  if (!write || typeof write !== 'object') return false;
  if (typeof write.path !== 'string' || !TASK_PATH.test(write.path.trim())) return false;
  const mode = typeof write.mode === 'string' ? write.mode.trim() : '';
  // append patches and full overwrite reschedules (batch_reschedule) both count.
  if (mode !== 'append' && mode !== 'overwrite') return false;
  const body = parseJsonContent(write.content);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const keys = Object.keys(body);
  if (!keys.length) return false;
  if (mode === 'append') {
    return keys.every((key) => SCHEDULE_PATCH_KEYS.has(key));
  }
  // overwrite: must include a due_date or due_time (a reschedule), not a create.
  return typeof body.due_date === 'string' || typeof body.due_time === 'string';
}

function isGhostConfirmWrite(write) {
  return write && typeof write === 'object' && isCalendarGhostConfirmWrite(write.path);
}

/**
 * True when every write is a schedule task patch and/or a calendar-ghost confirm
 * marker — safe to coalesce into one Confirm card for one agent turn.
 */
export function isBatchableScheduleProposal(proposal) {
  const writes = Array.isArray(proposal?.writes) ? proposal.writes : [];
  if (!writes.length) return false;
  return writes.every((write) => isScheduleTaskPatchWrite(write) || isGhostConfirmWrite(write));
}

function writeKey(write) {
  return `${write.mode || ''}::${write.path || ''}`;
}

/** Merge writes; later writes for the same path+mode replace earlier ones. */
export function mergeProposalWrites(baseWrites, nextWrites) {
  const map = new Map();
  for (const write of [...(baseWrites || []), ...(nextWrites || [])]) {
    if (!write || typeof write.path !== 'string' || !write.path.trim()) continue;
    map.set(writeKey(write), write);
  }
  return [...map.values()];
}

export function buildBatchScheduleIntent(writes) {
  const list = Array.isArray(writes) ? writes : [];
  const taskCount = list.filter((write) => TASK_PATH.test(String(write?.path || '').trim())).length;
  const ghostCount = list.filter((write) => isCalendarGhostConfirmWrite(write?.path)).length;
  const total = taskCount + ghostCount;
  if (total <= 1) {
    return null;
  }
  const parts = [];
  if (taskCount) parts.push(`${taskCount} task${taskCount === 1 ? '' : 's'}`);
  if (ghostCount) parts.push(`${ghostCount} calendar block${ghostCount === 1 ? '' : 's'}`);
  return `Move ${parts.join(' + ')} together — one Confirm applies all ${total}`;
}

/**
 * Merge a new batchable proposal into an existing pending entry's proposal.
 * Returns { proposal, calendarGhostIds } for persistence.
 */
export function mergeIntoScheduleBatch(existingEntry, nextProposal, nextExtras = {}) {
  const baseProposal = existingEntry?.proposal && typeof existingEntry.proposal === 'object'
    ? existingEntry.proposal
    : {};
  const writes = mergeProposalWrites(baseProposal.writes, nextProposal?.writes);
  const intent = buildBatchScheduleIntent(writes)
    || (typeof nextProposal?.intent === 'string' && nextProposal.intent.trim())
    || (typeof baseProposal.intent === 'string' && baseProposal.intent.trim())
    || 'Proposed schedule move';
  const surfaces = [...new Set([
    ...(Array.isArray(baseProposal.surfaces) ? baseProposal.surfaces : []),
    ...(Array.isArray(nextProposal?.surfaces) ? nextProposal.surfaces : []),
    'confirm_card'
  ])];
  const reads = [...new Set([
    ...(Array.isArray(baseProposal.reads) ? baseProposal.reads : []),
    ...(Array.isArray(nextProposal?.reads) ? nextProposal.reads : [])
  ])];
  const ghostIds = collectGhostIdsFromWrites(writes);
  const fromExtras = [];
  for (const source of [existingEntry, nextExtras]) {
    if (!source || typeof source !== 'object') continue;
    if (typeof source.calendarGhostId === 'string' && source.calendarGhostId.trim()) {
      fromExtras.push(source.calendarGhostId.trim());
    }
    if (Array.isArray(source.calendarGhostIds)) {
      for (const id of source.calendarGhostIds) {
        if (typeof id === 'string' && id.trim()) fromExtras.push(id.trim());
      }
    }
  }
  const calendarGhostIds = [...new Set([...ghostIds, ...fromExtras])];
  return {
    proposal: {
      ...baseProposal,
      ...nextProposal,
      intent,
      writes,
      surfaces,
      ...(reads.length ? { reads } : {})
    },
    calendarGhostIds,
    calendarGhostId: calendarGhostIds[0] || null
  };
}
