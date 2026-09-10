import { createHash, randomUUID } from 'node:crypto';
import { act, advance, createSession, fault, publicSession } from './cognitive-controller.mjs';

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

export function createCognitiveService({ store, model, retrieve, now = Date.now } = {}) {
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
    async get(owner, id) { return publicSession((await read(owner, id)).value); },
    async list(owner) {
      const rows = await store.list(owner, 50);
      return rows.map(({ value }) => ({ id: value.id, protocolId: value.protocolId, mode: value.mode, status: value.status, stage: value.stage, updatedAt: value.updatedAt }));
    },
    async action(owner, input) {
      const row = await read(owner, input.sessionId);
      const prior = row.value.requests?.[input.requestId];
      if (prior) {
        if (prior.action !== input.action || prior.text !== input.text) throw fault(409, 'request_reused', 'A request ID cannot be reused for another action.');
        return publicSession(row.value);
      }
      const next = act(row.value, input);
      next.requests[input.requestId] = { action: input.action, text: input.text };
      return publicSession((await commit(owner, input.sessionId, next, row.etag)).value);
    },
    async run(owner, id) {
      const row = await read(owner, id);
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
        const advanced = await advance(latest.value, {
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
        return publicSession((await commit(owner, id, advanced, check.etag)).value);
      } catch (error) {
        const check = await store.read(owner, id);
        if (!check || check.value.status === 'cancelled') return publicSession(check?.value ?? latest.value);
        return publicSession((await commit(owner, id, failed(check.value, error), check.etag)).value);
      }
    }
  };
}
