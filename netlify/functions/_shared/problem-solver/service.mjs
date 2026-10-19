// netlify/functions/_shared/problem-solver/service.mjs
import { randomUUID } from 'node:crypto';
import {
  acceptSuggestion, applyCoachTurn, archive, createSession, dismissSuggestion,
  keepAnyway, moveOn, rename, rescoreRadar, say, score, summaryRow
} from './session.mjs';
import { migrateRow, migrateSession } from './migrate.mjs';

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
  const unstale = (s) => (isStale(s) ? { ...s, runner: { ...s.runner, status: 'failed', error: STALE_ERROR } } : s);

  async function load(owner, id) {
    if (!ID_RE.test(String(id ?? ''))) throw httpError(400, 'validation_error', 'Valid session id required.');
    const row = await store.read(owner, id);
    if (!row) throw httpError(404, 'not_found', 'Problem not found.');
    return { ...row, value: migrateSession(row.value) };
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
    move_on: (s) => moveOn(s, deps),
    finish_define: (s) => moveOn(s, deps),
    rename: (s, body) => rename(s, body.text, deps),
    score: (s, body) => score(s, body.payload ?? {}, deps),
    rescore_radar: (s, body) => rescoreRadar(s, { current: body.current, objective: body.objective }, deps),
    archive: (s) => archive(s, deps),
    retry: (s) => {
      if (s.runner.status !== 'failed') throw httpError(409, 'action_not_allowed', 'Nothing to retry.');
      return { ...s, runner: { ...s.runner, status: 'queued', error: null } };
    }
  };

  return {
    async list(owner, { limit = 100, offset = 0 } = {}) {
      const rows = (await store.list(owner, limit, offset)).map((row) => migrateRow(summaryRow(row.value)));
      return Promise.all(rows.map(async (row) => (row.skills ? row : migrateRow(summaryRow(migrateSession((await store.read(owner, row.id))?.value ?? row))))));
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
      if (value.runner.status === 'failed' && value.runner.mode === 'boundary' && !['retry', 'archive'].includes(body.action)) {
        throw httpError(409, 'action_not_allowed', 'The coach did not finish wrapping up that step. Try again first.');
      }
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
        next = { ...value, runner: { ...value.runner, status: 'failed', error: error.message || 'The coach could not answer.' } };
      }
      next.revision = value.revision + 1;
      return save(owner, next, etag);
    }
  };
}
