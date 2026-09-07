/**
 * Bind kernel proposals to the existing pending-action Confirm path.
 * After a successful write, a later request can continue the same persisted turn.
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

function iso(now) {
  return now instanceof Date ? now.toISOString() : String(now);
}

export function summarizeWriteResults(writeResult) {
  return (writeResult?.results ?? []).slice(0, 8).map(item => ({
    path: typeof item?.path === 'string' ? item.path : null,
    mode: typeof item?.mode === 'string' ? item.mode : null,
    ok: item?.ok !== false
  }));
}

export function continuationGate({ state, writeOk, duplicate = false, rejected = false } = {}) {
  if (rejected) return { invoke: false, reason: 'rejected' };
  if (duplicate) return { invoke: false, reason: 'duplicate' };
  if (writeOk !== true) return { invoke: false, reason: 'write_failed' };
  if (state?.continuation?.status === 'done') return { invoke: false, reason: 'already_continued' };
  return { invoke: true, reason: null };
}

export function markWriteOutcome(state, { writeOk, writeResult, now = new Date() } = {}) {
  if (!state || typeof state !== 'object') return state;
  state.writeOutcome = {
    ok: writeOk === true,
    results: summarizeWriteResults(writeResult),
    at: iso(now)
  };
  return state;
}

export function recordContinuation(state, {
  status,
  reason = null,
  text = '',
  usage = null,
  now = new Date()
} = {}) {
  if (!state || typeof state !== 'object') return state;
  state.continuation = {
    status,
    reason,
    text: typeof text === 'string' ? text : '',
    usage: usage && typeof usage === 'object' ? usage : null,
    at: iso(now)
  };
  if (status === 'done' || status === 'skipped' || status === 'unavailable') {
    state.stage = status === 'done' ? 'continued' : state.stage;
  }
  return state;
}

export function buildContinuationMessages({ state, writeResult, reloaded = {} } = {}) {
  const slug = state?.slug || 'agent';
  const writeOk = state?.writeOutcome?.ok === true;
  const results = summarizeWriteResults(writeResult).map(item => (
    `${item.ok ? 'wrote' : 'failed'} ${item.mode || 'write'} ${item.path || 'unknown'}`
  ));
  const reloadBits = Object.entries(reloaded)
    .filter(([, value]) => value != null)
    .slice(0, 8)
    .map(([key, value]) => {
      if (typeof value === 'string') return `${key}: ${value.slice(0, 160)}`;
      if (typeof value === 'number') return `${key}: ${value}`;
      if (value && typeof value === 'object' && typeof value.count === 'number') {
        return `${key}: ${value.count} records`;
      }
      return `${key}: present`;
    });
  return {
    system: [
      `You are ${slug}. Adam just confirmed a write you proposed.`,
      'Acknowledge the executed result in one short conversational turn.',
      'Do not invent records. Do not propose another write.',
      'If the write failed, say so plainly and do not claim it succeeded.',
      'If evidence was reloaded, use only that summary — do not claim a full store dump.'
    ].join(' '),
    messages: [{
      role: 'user',
      content: [
        `Original request: ${state?.message || '(unknown)'}`,
        `Write status: ${writeOk ? 'executed' : 'failed'}`,
        results.length ? `Results: ${results.join('; ')}` : 'Results: none',
        reloadBits.length ? `Reloaded: ${reloadBits.join('; ')}` : 'Reloaded: none',
        'Respond now.'
      ].join('\n')
    }]
  };
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
    action.decidedAt = iso(now);
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
  action.decidedAt = iso(now);
  loaded.stage = 'composed';
  const resumed = resumeAgentKernel(loaded, { persist });
  persist.save(resumed);
  return { ok: true, state: resumed, duplicate: false };
}

export async function continueAfterConfirm({
  persist,
  state,
  writeOk,
  writeResult,
  reloaded = {},
  duplicate = false,
  rejected = false,
  now = new Date(),
  invokeModel
} = {}) {
  if (!state) return { invoked: false, reason: 'turn_not_found', state: null };
  const gate = continuationGate({ state, writeOk, duplicate, rejected });
  if (!gate.invoke) {
    recordContinuation(state, { status: 'skipped', reason: gate.reason, now });
    persist?.save?.(state);
    return { invoked: false, reason: gate.reason, state, status: 'skipped' };
  }
  markWriteOutcome(state, { writeOk, writeResult, now });
  let text = '';
  let usage = null;
  let status = 'done';
  let reason = null;
  if (typeof invokeModel !== 'function') {
    status = 'unavailable';
    reason = 'no_model';
  } else {
    try {
      const result = await invokeModel({
        state,
        writeResult,
        reloaded,
        messages: buildContinuationMessages({ state, writeResult, reloaded })
      });
      text = typeof result?.text === 'string' ? result.text.trim() : '';
      usage = result?.usage ?? null;
      if (!text) {
        status = 'unavailable';
        reason = result?.error || 'empty_continuation';
      }
    } catch {
      status = 'unavailable';
      reason = 'model_failed';
      text = '';
    }
  }
  recordContinuation(state, { status, reason, text, usage, now });
  persist?.save?.(state);
  return {
    invoked: status === 'done',
    reason,
    state,
    status,
    text,
    usage
  };
}
