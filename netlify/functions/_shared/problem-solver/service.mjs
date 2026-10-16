// netlify/functions/_shared/problem-solver/service.mjs
import { randomUUID } from 'node:crypto';
import {
  acceptSuggestion, applyCoachTurn, archive, createSession, dismissSuggestion,
  finishDefine, keepAnyway, rename, rescoreRadar, say, summaryRow
} from './session.mjs';

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REQUEST_IDS_KEPT = 50;
const MAX_TURNS = 500;
const MAX_BYTES = 1_000_000;
const LEASE_MS = 120_000;
const STALE_ERROR = 'The coach timed out, try again.';

const httpError = (status, code, message) => Object.assign(new Error(message), { status, code });

export function createProblemSolverService({ store, coach, now = () => new Date().toISOString(), newId = randomUUID }) {
  const deps = { now, newId };

  const isStale = (s) => s.runner.status === 'running' && Date.parse(now()) > (s.runner.leaseUntil ?? 0);
  const unstale = (s) => (isStale(s) ? { ...s, runner: { status: 'failed', mode: s.runner.mode ?? 'turn', error: STALE_ERROR } } : s);

  async function load(owner, id) {
    if (!ID_RE.test(String(id ?? ''))) throw httpError(400, 'validation_error', 'Valid session id required.');
    const row = await store.read(owner, id);
    if (!row) throw httpError(404, 'not_found', 'Problem not found.');
    return row;
  }

  async function save(owner, value, etag) {
    if (value.turns.length > MAX_TURNS || Buffer.byteLength(JSON.stringify(value)) > MAX_BYTES) throw httpError(413, 'limit', 'This problem has reached its size limit.');
    const written = await store.write(owner, value.id, value, etag);
    if (!written) throw httpError(409, 'conflict', 'This problem changed elsewhere. Reloaded the latest.');
    return written.value;
  }

  const ACTIONS = {
    say: (s, body) => say(s, body.text, deps),
    keep_anyway: (s) => keepAnyway(s, deps),
    accept_suggestion: (s) => acceptSuggestion(s, deps),
    dismiss_suggestion: (s) => dismissSuggestion(s, deps),
    finish_define: (s) => finishDefine(s, deps),
    rename: (s, body) => rename(s, body.text, deps),
    rescore_radar: (s, body) => rescoreRadar(s, { current: body.current, objective: body.objective }, deps),
    archive: (s) => archive(s, deps),
    retry: (s) => {
      if (s.runner.status !== 'failed') throw httpError(409, 'action_not_allowed', 'Nothing to retry.');
      return { ...s, runner: { status: 'queued', mode: s.runner.mode ?? 'turn', error: null } };
    }
  };

  return {
    async list(owner, { limit = 100, offset = 0 } = {}) {
      return (await store.list(owner, limit, offset)).map((row) => summaryRow(row.value));
    },

    async get(owner, id) {
      return unstale((await load(owner, id)).value);
    },

    async create(owner, body) {
      const session = createSession({ title: body.title, text: body.text, links: Array.isArray(body.links) ? body.links : [] }, deps);
      session.requestIds = body.requestId ? [String(body.requestId)] : [];
      if (!ID_RE.test(String(body.requestId ?? ''))) return save(owner, session, null);
      session.id = String(body.requestId);
      const written = await store.write(owner, session.id, session, null);
      if (written) return written.value;
      const existing = await store.read(owner, session.id);
      if (!existing) throw httpError(409, 'conflict', 'This problem changed elsewhere. Reloaded the latest.');
      return existing.value;
    },

    async action(owner, body) {
      const loaded = await load(owner, body.id);
      const { etag } = loaded;
      const value = unstale(loaded.value);
      if (body.requestId && value.requestIds.includes(String(body.requestId))) return value;
      if (Number(body.revision) !== value.revision) throw httpError(409, 'conflict', 'This problem changed elsewhere. Reloaded the latest.');
      const act = ACTIONS[body.action];
      if (!act) throw httpError(400, 'validation_error', `Unknown action: ${body.action}`);
      if (['queued', 'running'].includes(value.runner.status) && body.action !== 'archive') throw httpError(409, 'busy', 'The coach is still thinking.');
      const next = act(value, body);
      next.revision = value.revision + 1;
      next.requestIds = [...value.requestIds, String(body.requestId ?? '')].filter(Boolean).slice(-REQUEST_IDS_KEPT);
      return save(owner, next, etag);
    },

    async run(owner, id) {
      let { value, etag } = await load(owner, id);
      if (value.runner.status !== 'queued') return unstale(value);
      value = await save(owner, { ...value, runner: { ...value.runner, status: 'running', leaseUntil: Date.parse(now()) + LEASE_MS } }, etag);
      ({ value, etag } = await load(owner, id));
      let next;
      try {
        next = applyCoachTurn(value, await coach(value), deps);
      } catch (error) {
        next = { ...value, runner: { status: 'failed', mode: value.runner.mode ?? 'turn', error: error.message || 'The coach could not answer.' } };
      }
      next.revision = value.revision + 1;
      return save(owner, next, etag);
    }
  };
}
