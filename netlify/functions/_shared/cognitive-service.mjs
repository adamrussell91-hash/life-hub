import { createHash, randomUUID } from 'node:crypto';
import { act, advance, createSession, fault, publicSession } from './cognitive-controller.mjs';
import { summariseCompletedSession, writeBackRetryable, writeProtocolCentralNodeLines } from './cognitive-writeback.mjs';

const LEASE_MS = 90_000;

function notFound() { return fault(404, 'not_found', 'Protocol session not found.'); }
function idForRequest(requestId) {
  const value = createHash('sha256').update(String(requestId)).digest('hex');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-8${value.slice(17, 20)}-${value.slice(20, 32)}`;
}
function failed(session, error) {
  const next = structuredClone(session);
  next.status = 'failed';
  next.lease = null;
  next.allowedActions = ['retry', 'cancel'];
  next.error = { code: error?.code ?? 'run_failed', message: error?.message || 'This stage could not finish. Retry it to continue.', retryable: true };
  return next;
}

export function createCognitiveService({ store, model, retrieve, now = Date.now, writeCentralNode, readCentralNode, env = {}, fetchImpl = fetch } = {}) {
  if (!store || !model || !retrieve) throw new TypeError('Cognitive service dependencies are required.');
  async function read(owner, id) {
    const row = await store.read(owner, id);
    if (!row) throw notFound();
    if (row.value.status === 'running' && row.value.lease?.expiresAt <= now()) {
      const stale = failed(row.value, { code: 'lease_expired' });
      const written = await store.write(owner, id, stale, row.etag);
      return written ?? row;
    }
    return row;
  }
  async function commit(owner, id, next, etag) {
    const written = await store.write(owner, id, next, etag);
    if (!written) throw fault(409, 'revision_conflict', 'Session changed. Refresh before continuing.');
    return written;
  }
  async function finishIfCompleted(session) {
    if (session.status !== 'completed') return session;
    const next = structuredClone(session);
    let changed = false;
    if (!next.summary) {
      try { next.summary = await summariseCompletedSession(next, model); }
      catch { next.summary = { title: next.protocolId, keyFinding: 'Run completed.', summary: 'Summary unavailable.', openQuestions: [], forHammond: null }; }
      changed = true;
    }
    const attempts = next.writeBackAttempts || 0;
    const needsWrite = !next.writeBack;
    const needsRetry = next.writeBack?.ok === false && attempts < 1 && writeBackRetryable(next.writeBack.error);
    if (needsWrite || needsRetry) {
      const priorFailed = Boolean(next.writeBack);
      try {
        next.writeBack = await writeProtocolCentralNodeLines(next, env, { fetchImpl, readCentralNode, writeCentralNode });
      } catch (error) {
        next.writeBack = { ok: false, error: error?.code || error?.message || 'write_failed', written: [] };
      }
      if (priorFailed) next.writeBackAttempts = attempts + 1;
      else if (next.writeBack?.ok === false) next.writeBackAttempts = 0;
      changed = true;
    }
    return changed ? next : session;
  }
  async function touchCompleted(owner, id, row) {
    const finished = await finishIfCompleted(row.value);
    if (finished === row.value) return publicSession(row.value);
    return publicSession((await commit(owner, id, finished, row.etag)).value);
  }
  return {
    async create(owner, input) {
      const id = input?.sessionId ?? idForRequest(input?.requestId);
      const existing = await store.read(owner, id);
      if (existing) {
        if (existing.value.requests?.[input.requestId]) return publicSession(existing.value);
        throw fault(409, 'session_exists', 'That session ID is already in use.');
      }
      const session = createSession({ ...input, id, owner });
      session.requests[input.requestId] = { type: 'create' };
      const written = await store.write(owner, id, session, null);
      if (!written) return publicSession((await read(owner, id)).value);
      return publicSession(written.value);
    },
    async get(owner, id) {
      const row = await read(owner, id);
      if (row.value.status === 'completed') return touchCompleted(owner, id, row);
      return publicSession(row.value);
    },
    async list(owner, { limit = 100, offset = 0 } = {}) {
      const rows = await store.list(owner, Math.max(0, limit), Math.max(0, offset));
      return rows.map(({ value }) => ({
        id: value.id,
        protocolId: value.protocolId,
        mode: value.mode,
        status: value.status,
        stage: value.stage,
        updatedAt: value.updatedAt,
        createdAt: value.createdAt,
        title: value.summary?.title || value.title || value.intake?.task || value.intake?.focus || value.intake?.claim || value.protocolId,
        summary: value.summary || (typeof value.summary === 'string' ? value.summary : null) || null
      }));
    },
    async action(owner, input) {
      const row = await read(owner, input.sessionId);
      const prior = row.value.requests?.[input.requestId];
      if (prior) {
        if (prior.action !== input.action || prior.text !== input.text) throw fault(409, 'request_reused', 'A request ID cannot be reused for another action.');
        return publicSession(row.value);
      }
      if (row.value.status === 'completed' && !['correct'].includes(input.action)) {
        return touchCompleted(owner, input.sessionId, row);
      }
      let next = act(row.value, input);
      next.requests[input.requestId] = { action: input.action, text: input.text };
      next = await finishIfCompleted(next);
      return publicSession((await commit(owner, input.sessionId, next, row.etag)).value);
    },
    async run(owner, id) {
      const row = await read(owner, id);
      if (row.value.status === 'completed') return touchCompleted(owner, id, row);
      if (!['queued', 'running'].includes(row.value.status)) return publicSession(row.value);
      if (row.value.status === 'running' && row.value.lease?.expiresAt > now()) return publicSession(row.value);
      const leaseId = randomUUID();
      const claimed = structuredClone(row.value);
      claimed.status = 'running';
      claimed.lease = { id: leaseId, expiresAt: now() + LEASE_MS };
      const lease = await store.write(owner, id, claimed, row.etag);
      if (!lease) return publicSession((await read(owner, id)).value);
      let latest = lease;
      try {
        let advanced = await advance(latest.value, {
          model,
          retrieve,
          onProgress: async progress => {
            const check = await store.read(owner, id);
            if (!check || check.value.lease?.id !== leaseId || check.value.status === 'cancelled') throw fault(409, 'run_cancelled', 'Run was cancelled.');
            progress.lease = check.value.lease;
            latest = await commit(owner, id, progress, check.etag);
          }
        });
        const check = await store.read(owner, id);
        if (!check || check.value.lease?.id !== leaseId || check.value.status === 'cancelled') return publicSession(check?.value ?? latest.value);
        advanced.lease = null;
        advanced = await finishIfCompleted(advanced);
        return publicSession((await commit(owner, id, advanced, check.etag)).value);
      } catch (error) {
        const check = await store.read(owner, id);
        if (!check || check.value.status === 'cancelled') return publicSession(check?.value ?? latest.value);
        return publicSession((await commit(owner, id, failed(check.value, error), check.etag)).value);
      }
    }
  };
}
