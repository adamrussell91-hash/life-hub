// netlify/functions/_shared/problem-solver/service.mjs
import { randomUUID } from 'node:crypto';
import {
  acceptSuggestion, applyCoachTurn, archive, confirmTask, createSession, dismissReview, startReview, taskStatus, dismissSuggestion, dismissTask,
  keepAnyway, linkCaseFile, dismissCaseFile, moveOn, rename, rescoreRadar, say, score, setReviewTask, summaryRow, cleanThreadDetour
} from './session.mjs';
import { applyLightningTurn, createLightningSession, escalateLightning, lightningAgain, lightningAnswer } from './lightning-session.mjs';
import { applyQuickTurn, createQuickSession, escalateQuick, quickAgain, quickAnswer, quickCheck } from './quick-session.mjs';
import { applyStartTurn, createStartSession, escalateStart, startAgain, startAnswer, startCheck } from './start-session.mjs';
import { migrateRow, migrateSession } from './migrate.mjs';

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REQUEST_IDS_KEPT = 50;
const MAX_TURNS = 500;
const MAX_BYTES = 1_000_000;
const LEASE_MS = 120_000;
const STALE_ERROR = 'The coach timed out, try again.';

const httpError = (status, code, message) => Object.assign(new Error(message), { status, code });

/**
 * Session kinds that run as a fixed flow rather than steps: how each is created, how a coach
 * turn lands, and how it goes on to a full session. The flow's state sits under the kind's name.
 */
const FLOWS = {
  lightning: { create: createLightningSession, turn: applyLightningTurn, escalate: (s, id, deps) => { const { full, lightning } = escalateLightning(s, id, deps); return { full, run: lightning }; } },
  quick: { create: createQuickSession, turn: applyQuickTurn, escalate: (s, id, deps) => { const { full, quick } = escalateQuick(s, id, deps); return { full, run: quick }; } },
  start: { create: createStartSession, turn: applyStartTurn, escalate: escalateStart }
};
const flowOf = (session) => FLOWS[session.kind] ?? null;

/**
 * `threads` (optional) ties sessions to thinking threads:
 *   quiet(owner, session) -> threadId | null   a direct start makes a quiet thread (home session)
 *   landed(session)                           a detour recorded its last step: land its packet
 *   removed(session)                          a detour was archived: its home step stops waiting
 * Every hook is best-effort; a failure never blocks the session's own write.
 */
export function createProblemSolverService({ store, coach, kinds = ['full', 'lightning'], now = () => new Date().toISOString(), newId = randomUUID, threads = null }) {
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
    confirm_task: (s, body) => confirmTask(s, body.payload ?? {}, deps),
    dismiss_task: (s, body) => dismissTask(s, body.payload ?? {}, deps),
    set_review_task: (s, body) => setReviewTask(s, body.payload ?? {}, deps),
    dismiss_review: (s) => dismissReview(s, deps),
    start_review: (s, body) => startReview(s, body.payload ?? {}, deps),
    task_status: (s, body) => taskStatus(s, body.payload ?? {}, deps),
    link_case_file: (s, body) => linkCaseFile(s, body.payload ?? {}, deps),
    dismiss_case_file: (s, body) => dismissCaseFile(s, body.payload ?? {}, deps),
    lightning_answer: (s, body) => lightningAnswer(s, body.payload ?? {}, deps),
    lightning_again: (s) => lightningAgain(s, deps),
    quick_answer: (s, body) => quickAnswer(s, body.payload ?? {}, deps),
    quick_again: (s) => quickAgain(s, deps),
    quick_check: (s, body) => quickCheck(s, body.payload ?? {}, deps),
    start_answer: (s, body) => startAnswer(s, body.payload ?? {}, deps),
    start_again: (s) => startAgain(s, deps),
    start_check: (s, body) => startCheck(s, body.payload ?? {}, deps),
    archive: (s) => archive(s, deps),
    retry: (s) => {
      if (s.runner.status !== 'failed') throw httpError(409, 'action_not_allowed', 'Nothing to retry.');
      return { ...s, runner: { ...s.runner, status: 'queued', error: null } };
    }
  };

  async function listRows(owner, { limit = 100, offset = 0 } = {}) {
    const rows = (await store.list(owner, limit, offset)).map((row) => migrateRow(summaryRow(row.value)));
    return Promise.all(rows.map(async (row) => (row.skills ? row : migrateRow(summaryRow(migrateSession((await store.read(owner, row.id))?.value ?? row))))));
  }

  /**
   * A flow (Lightning, a quick decision or a Quick start) to a full session: write the seeded full session first
   * (its id is the request id, so a retry finds it instead of making another), then mark the run.
   * Returns the run.
   */
  async function escalate(owner, value, etag, body) {
    if (['queued', 'running'].includes(value.runner.status)) throw httpError(409, 'busy', 'The coach is still thinking.');
    const flow = flowOf(value);
    if (!flow) throw httpError(409, 'action_not_allowed', 'Only a quick route goes on to a full session.');
    const fullId = ID_RE.test(String(body.requestId ?? '')) ? String(body.requestId) : newId();
    const { full, run } = flow.escalate(value, fullId, deps);
    if (value.threadId) full.threadId = value.threadId;
    const written = await store.write(owner, full.id, { ...full, requestIds: [] }, null);
    if (!written && !(await store.read(owner, full.id))) throw httpError(409, 'conflict', 'This problem changed elsewhere. Reloaded the latest.');
    const next = { ...run, revision: value.revision + 1, requestIds: [...value.requestIds, String(body.requestId ?? '')].filter(Boolean).slice(-REQUEST_IDS_KEPT) };
    return save(owner, next, etag);
  }

  return {
    list: listRows,

    /** Sessions that link to, created, or review a task or project, for the chips on its page. */
    async linked(owner, ref) {
      const match = /^(task|project|thread):(.{1,200})$/.exec(String(ref ?? ''));
      if (!match) throw httpError(400, 'validation_error', 'linked must be task:<id>, project:<id> or thread:<id>.');
      const [, kind, id] = match;
      const rows = await listRows(owner, { limit: 500 });
      return rows.filter((row) => row.status !== 'archived').flatMap((row) => {
        const role = kind === 'thread' ? (row.threadId === id ? (row.threadDetour ? 'detour' : 'thread') : null)
          : kind === 'task' && row.reviewTaskId === id ? 'review'
          : kind === 'task' && (row.taskIds ?? []).includes(id) ? 'task'
            : (row.links ?? []).some((l) => l.kind === kind && l.id === id) ? 'link' : null;
        return role ? [{ id: row.id, title: row.title, phase: row.phase, model: row.model, role, threadId: row.threadId ?? null }] : [];
      });
    },

    async get(owner, id) {
      return unstale((await load(owner, id)).value);
    },

    async create(owner, body) {
      const kind = body.kind ?? kinds[0];
      if (!kinds.includes(kind)) throw httpError(400, 'validation_error', `This tool does not start ${kind} sessions.`);
      const threadDetour = cleanThreadDetour(body.detour ?? null);
      if (threadDetour && FLOWS[kind]) throw httpError(400, 'validation_error', 'A detour runs as a full session.');
      const threadId = typeof body.threadId === 'string' && body.threadId.trim() ? body.threadId.trim().slice(0, 200) : threadDetour?.threadId ?? null;
      const make = FLOWS[kind]?.create ?? ((input, d) => createSession({ ...input, kind }, d));
      const session = make({ title: body.title, text: body.text, links: Array.isArray(body.links) ? body.links : [], startModel: body.startModel ?? null, threadId, threadDetour }, deps);
      session.requestIds = body.requestId ? [String(body.requestId)] : [];
      const keyed = ID_RE.test(String(body.requestId ?? ''));
      if (keyed) session.id = String(body.requestId);
      session.threadId = threadId;
      if (!threadId && threads?.quiet && !(keyed && (await store.read(owner, session.id)))) {
        try { session.threadId = (await threads.quiet(owner, session)) ?? null; } catch { session.threadId = null; }
      }
      if (!keyed) return save(owner, session, null);
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
      if (body.action === 'escalate') return escalate(owner, value, etag, body);
      const act = ACTIONS[body.action];
      if (!act) throw httpError(400, 'validation_error', `Unknown action: ${body.action}`);
      if (flowOf(value) && value.status !== 'active' && body.action === 'say') throw httpError(409, 'action_not_allowed', 'This run is finished. Press It came back if it returned.');
      if (['queued', 'running'].includes(value.runner.status) && body.action !== 'archive') throw httpError(409, 'busy', 'The coach is still thinking.');
      if (value.runner.status === 'failed' && value.runner.mode === 'boundary' && !['retry', 'archive'].includes(body.action)) {
        throw httpError(409, 'action_not_allowed', 'The coach did not finish wrapping up that step. Try again first.');
      }
      const next = act(value, body);
      next.revision = value.revision + 1;
      next.requestIds = [...value.requestIds, String(body.requestId ?? '')].filter(Boolean).slice(-REQUEST_IDS_KEPT);
      const saved = await save(owner, next, etag);
      if (saved.threadDetour && threads) {
        // A detour that just recorded its last step lands; one archived stops its home step waiting.
        try {
          if (value.phase !== 'finished' && saved.phase === 'finished') await threads.landed?.(saved);
          else if (value.status !== 'archived' && saved.status === 'archived') await threads.removed?.(saved);
        } catch { /* the thread catches up when the person lands it by hand */ }
      }
      return saved;
    },

    async run(owner, id) {
      let { value, etag } = await load(owner, id);
      if (value.runner.status !== 'queued') return unstale(value);
      value = await save(owner, { ...value, runner: { ...value.runner, status: 'running', leaseUntil: Date.parse(now()) + LEASE_MS } }, etag);
      ({ value, etag } = await load(owner, id));
      let next;
      try {
        const apply = flowOf(value)?.turn ?? applyCoachTurn;
        next = apply(value, await coach(value), deps);
      } catch (error) {
        next = { ...value, runner: { ...value.runner, status: 'failed', error: error.message || 'The coach could not answer.' } };
      }
      next.revision = value.revision + 1;
      return save(owner, next, etag);
    }
  };
}
