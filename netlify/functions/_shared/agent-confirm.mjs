/**
 * Bind kernel proposals to the existing pending-action Confirm path.
 * A later request reloads the same persisted turn.
 */
import { resumeAgentKernel } from './agent-kernel.mjs';

export function bindPendingToTurn(entry, turnId) {
  if (!entry || typeof entry !== 'object') return entry;
  return { ...entry, turnId: turnId || entry.turnId || null };
}

export function isProposalStale(action, currentRecords = {}) {
  if (!action?.snapshot) return false;
  const prev = JSON.stringify(action.snapshot);
  const next = JSON.stringify(currentRecords);
  return prev !== next;
}

export function resumeConfirmedTurn({
  persist,
  turnId,
  actionId,
  decision,
  now = new Date(),
  currentRecords = {}
} = {}) {
  if (!persist || !turnId) return { ok: false, error: 'turn_not_found' };
  const loaded = persist.load(turnId);
  if (!loaded) return { ok: false, error: 'turn_not_found' };
  const action = (loaded.actions ?? []).find(item =>
    item.id === actionId || item.idempotencyKey === actionId
  );
  if (!action) return { ok: false, error: 'action_not_found', state: loaded };
  if (action.status === 'executed') {
    return { ok: true, duplicate: true, state: loaded };
  }
  if (decision === 'reject') {
    action.status = 'rejected';
    action.decidedAt = now instanceof Date ? now.toISOString() : String(now);
    persist.save(loaded);
    return { ok: true, state: loaded, rejected: true };
  }
  if (isProposalStale(action, currentRecords)) {
    action.status = 'invalidated';
    persist.save(loaded);
    return { ok: false, error: 'stale_proposal', state: loaded };
  }
  if (action.status === 'executed') return { ok: true, duplicate: true, state: loaded };
  action.status = 'executed';
  action.decidedAt = now instanceof Date ? now.toISOString() : String(now);
  loaded.stage = 'composed';
  const resumed = resumeAgentKernel(loaded, { persist });
  persist.save(resumed);
  return { ok: true, state: resumed, duplicate: false };
}
