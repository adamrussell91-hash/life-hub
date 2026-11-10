// netlify/functions/thinking-threads.mjs
// The thread API (spec section 1): list, get, create, and revision-checked actions on one
// thread, including `detour`, which starts the target session in its own tool (or a protocol
// run) and adds it to the thread. A stale revision is a 409 whose `data.thread` is the current
// thread; the client reapplies once.
import { randomUUID } from 'node:crypto';
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { defaultInvokeRun, problemSolverServiceFor } from './problem-solver.mjs';
import { DECISION_BOOK_DEPS } from './decision-book.mjs';
import { GEAR_SHIFTER_DEPS } from './get-things-done.mjs';
import { RULES_BOOK_DEPS } from './rules-book.mjs';
import { CHANGE_BOOK_DEPS } from './change-book.mjs';
import { COLLABORATION_BOOK_DEPS } from './collaboration-book.mjs';
import { COMMUNICATION_BOOK_DEPS } from './communication-book.mjs';
import { createQuestionSource } from './_shared/question-book.mjs';
import { stepName } from '../../packages/problem-solver/steps.mjs';
import { getOption, getTool, PROTOCOL_TOOL } from '../../packages/thinking-map/index.mjs';
import {
  addSession, createThread, handOver, landPacket, patchThread, recordRoute, sessionOf, setLanding, setSessionState
} from './_shared/thinking-threads/thread.mjs';
import { createThreadStore, defaultGetThreadStore } from './_shared/thinking-threads/store.mjs';
import { DETOUR_MODES, ENGINE_TOOLS, frameFromBrief, intakeFromBrief, questionsFromBrief, TOOL_KIND } from './_shared/thinking-threads/briefs.mjs';
import { packetFrom } from './_shared/thinking-threads/adapters.mjs';

export const config = { path: '/api/thinking-threads' };

export function owner(env) {
  return env.COGNITIVE_OWNER_ID || 'operator';
}

/** Each engine tool's handler deps: its store prefix, run path and session kinds. */
export const ENGINE_DEPS = Object.freeze({
  'problem-solver': Object.freeze({ runPath: '/api/problem-solver/run', kinds: ['full', 'lightning'] }),
  'decision-book': DECISION_BOOK_DEPS,
  'get-things-done': GEAR_SHIFTER_DEPS,
  'rules-book': RULES_BOOK_DEPS,
  'change-book': CHANGE_BOOK_DEPS,
  'collaboration-book': COLLABORATION_BOOK_DEPS,
  'communication-book': COMMUNICATION_BOOK_DEPS
});

const httpError = (status, code, message) => Object.assign(new Error(message), { status, code });

/** Where the Tasks app opens a session. Thought Starter and protocol detours open inside the thread view. */
export function routeFor(tool, sessionId, threadId) {
  if (tool === 'question-book' || tool === PROTOCOL_TOOL) return `#/think/${encodeURIComponent(threadId)}?detour=${encodeURIComponent(sessionId)}`;
  const base = getTool(tool)?.route;
  return base ? `${base}?id=${encodeURIComponent(sessionId)}` : `#/think/${encodeURIComponent(threadId)}`;
}

/** Calls a sibling function with the caller's cookie and origin (as the run kicks do). */
function forward(request, path, init = {}, fetchImpl = fetch) {
  return fetchImpl(new URL(path, request.url), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie') } : {}),
      ...(request.headers.get('origin') ? { origin: request.headers.get('origin') } : {})
    }
  });
}

/** Start a protocol run through the Knowledge protocol API; resolves to its session. */
export async function defaultCreateProtocolSession(request, env, body, fetchImpl = fetch) {
  const response = await forward(request, '/api/knowledge/protocols', { method: 'POST', body: JSON.stringify(body) }, fetchImpl);
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.data?.session?.id) throw httpError(502, 'protocol_failed', json?.error?.message ?? 'The protocol run could not start.');
  return json.data.session;
}

/** Read one protocol session through the Knowledge protocol API. */
export async function defaultLoadProtocolSession(request, env, sessionId, fetchImpl = fetch) {
  const response = await forward(request, `/api/knowledge/protocols?sessionId=${encodeURIComponent(sessionId)}`, { method: 'GET' }, fetchImpl);
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.data?.session) throw httpError(response.status === 404 ? 404 : 502, 'protocol_failed', 'The protocol run could not be read.');
  return json.data.session;
}

function threadsFor(env, deps) {
  return (async () => {
    const store = deps.getStore ? await deps.getStore(env) : await defaultGetThreadStore(env);
    if (!store) throw httpError(503, 'store_unbound', 'Thread storage is not configured.');
    return createThreadStore(store);
  })();
}

export function createThinkingThreadsHandler(deps = {}) {
  const nowIso = () => new Date(deps.now ? deps.now() : Date.now()).toISOString();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const engineService = deps.engineService ?? ((env, tool) => problemSolverServiceFor(env, { ...ENGINE_DEPS[tool] }));
  const invokeRun = deps.invokeRun ?? ((request, id, env, tool) => defaultInvokeRun(request, id, env, fetchImpl, ENGINE_DEPS[tool].runPath));
  const createProtocolSession = deps.createProtocolSession ?? ((request, env, body) => defaultCreateProtocolSession(request, env, body, fetchImpl));
  const loadProtocolSession = deps.loadProtocolSession ?? ((request, env, id) => defaultLoadProtocolSession(request, env, id, fetchImpl));
  let questionSource = null;
  const loadQuestions = deps.loadQuestions ?? (async (env, chapterId) => {
    questionSource ??= createQuestionSource({ env, fetchImpl });
    return ((await questionSource()).byChapter.get(chapterId) ?? []).map((q) => ({ id: q.id, prompt: q.prompt }));
  });

  /** The home step's title and work so far, when the client did not send them. */
  async function fromStep(env, thread, body) {
    const from = { sessionId: body.fromSessionId, stepId: body.fromStepId ?? null, stepTitle: body.stepTitle ?? '', workSoFar: body.workSoFar ?? '' };
    const home = sessionOf(thread, body.fromSessionId);
    if ((from.stepTitle && from.workSoFar) || !home || !ENGINE_TOOLS.includes(home.tool)) return from;
    try {
      const session = await (await engineService(env, home.tool)).get(owner(env), home.sessionId);
      if (!from.stepTitle && session.model && from.stepId) from.stepTitle = stepName(session.model.id, from.stepId);
      if (!from.workSoFar) from.workSoFar = session.summary ?? '';
    } catch { /* the brief goes without them */ }
    return from;
  }

  /** Start the detour's session in its tool. Returns { session entry for addSession, open, extra }. */
  async function startDetour(request, env, thread, body) {
    const option = getOption(body.optionId);
    if (!option) throw httpError(400, 'validation_error', 'Unknown option.');
    const home = sessionOf(thread, body.fromSessionId);
    if (!home) throw httpError(400, 'validation_error', 'A detour leaves from a session in this thread.');
    if (home.role !== 'home') throw httpError(409, 'action_not_allowed', 'A detour cannot start its own detour.');
    const question = String(body.question ?? '').trim().slice(0, 400);
    const brief = { threadId: thread.id, situation: thread.situation, digest: thread.digest, from: await fromStep(env, thread, body), question };
    const from = { sessionId: home.sessionId, stepId: body.fromStepId ?? null };

    if (option.kind === 'protocol') {
      const protocolId = option.id.slice('protocol:'.length);
      const mode = typeof body.mode === 'string' && body.mode ? body.mode : DETOUR_MODES[protocolId];
      const intake = { ...intakeFromBrief(protocolId, brief), ...(body.intake && typeof body.intake === 'object' ? body.intake : {}) };
      if (body.draftOnly) return { draft: { protocolId, mode, intake } };
      const origin = { threadId: thread.id, sessionId: home.sessionId, stepId: body.fromStepId ?? null };
      const session = await createProtocolSession(request, env, { protocolId, mode, intake, origin, userContext: intake.userContext ?? '', requestId: randomUUID() });
      return { entry: { kind: 'protocol', tool: PROTOCOL_TOOL, sessionId: session.id, role: 'detour', from, question }, state: 'running', open: { tool: PROTOCOL_TOOL, sessionId: session.id, route: routeFor(PROTOCOL_TOOL, session.id, thread.id) } };
    }

    if (option.tool === 'question-book') {
      const draft = questionsFromBrief(brief, option.id);
      const questions = questionsFromBrief(brief, option.id, await loadQuestions(env, draft.chapterId).catch(() => []));
      const sessionId = randomUUID();
      return { entry: { kind: 'tool', tool: 'question-book', sessionId, role: 'detour', from, question, questions }, open: { tool: 'question-book', sessionId, route: routeFor('question-book', sessionId, thread.id), questions } };
    }

    const tool = option.tool;
    if (!ENGINE_TOOLS.includes(tool)) throw httpError(400, 'validation_error', `Cannot detour to ${option.id}.`);
    const frame = frameFromBrief(tool, brief);
    const service = await engineService(env, tool);
    const startModel = option.kind === 'model' && !option.id.startsWith('ps:') ? option.id : null;
    let session = await service.create(owner(env), {
      kind: TOOL_KIND[tool],
      title: frame.title,
      text: frame.text,
      startModel,
      threadId: thread.id,
      detour: { threadId: thread.id, fromSessionId: home.sessionId, fromStepId: body.fromStepId ?? null, question, frameDraft: frame.frame },
      requestId: randomUUID()
    });
    if (session.runner?.status === 'queued') {
      let kicked = false;
      try { kicked = await invokeRun(request, session.id, env, tool); } catch { kicked = false; }
      if (!kicked) session = await service.run(owner(env), session.id);
    }
    return { entry: { kind: 'tool', tool, sessionId: session.id, role: 'detour', from, question }, open: { tool, sessionId: session.id, route: routeFor(tool, session.id, thread.id) } };
  }

  /** Build a packet for `land`: load the session in its tool (or read Thought Starter's ticked lines). */
  async function packetFor(request, env, entry, body) {
    if (entry.tool === 'question-book') {
      const lines = Array.isArray(body.record?.lines) ? body.record.lines.filter((l) => typeof l === 'string') : [];
      if (!lines.length) throw httpError(400, 'validation_error', 'Tick at least one line to send back.');
      return packetFrom('question-book', { id: entry.sessionId, lines });
    }
    if (entry.tool === PROTOCOL_TOOL) return packetFrom(PROTOCOL_TOOL, await loadProtocolSession(request, env, entry.sessionId));
    if (!ENGINE_TOOLS.includes(entry.tool)) throw httpError(400, 'validation_error', 'That session cannot land.');
    return packetFrom(entry.tool, await (await engineService(env, entry.tool)).get(owner(env), entry.sessionId));
  }

  const SIMPLE = {
    add_session: (t, b, now) => addSession(t, { kind: b.kind, tool: b.tool, sessionId: b.sessionId, role: b.role, from: b.from ?? null, question: b.question ?? null, questions: b.questions ?? null, now }),
    set_landing: (t, b, now) => setLanding(t, b.sessionId, b.landing, now),
    set_state: (t, b, now) => setSessionState(t, b.sessionId, b.state, now),
    hand_over: (t, b, now) => handOver(t, b.sessionId, now),
    route: (t, b, now) => recordRoute(t, { joint: b.joint, optionId: b.optionId, reason: b.reason ?? null, outcome: b.outcome, stepId: b.stepId ?? null, sessionId: b.sessionId ?? null, now }),
    patch: (t, b, now) => patchThread(t, { title: b.title, status: b.status, restUntil: b.restUntil }, now)
  };

  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    const ok = (data, status = 200) => withCors(okResponse(status, data, { 'cache-control': 'no-store' }), request, env);
    try {
      const threads = await threadsFor(env, deps);
      if (request.method === 'GET') {
        const url = new URL(request.url);
        if (url.searchParams.has('list')) return ok({ threads: await threads.list(owner(env)) });
        return ok({ thread: await threads.get(owner(env), url.searchParams.get('id')) });
      }
      if (request.method !== 'POST') return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      const body = parsed.value ?? {};
      const now = nowIso();

      if (body.create) {
        const home = body.create.home && typeof body.create.home === 'object' ? body.create.home : null;
        const thread = createThread({
          situation: body.create.situation,
          title: body.create.title,
          homeSession: home ? { kind: home.kind ?? 'tool', tool: home.tool, sessionId: home.sessionId } : null,
          now
        });
        return ok({ thread: await threads.create(owner(env), thread) });
      }

      if (body.action === 'detour') {
        // Check the revision before anything starts, so a stale page never makes an orphan session.
        const current = await threads.get(owner(env), body.id);
        if (Number(body.revision) !== current.revision) throw Object.assign(httpError(409, 'conflict', 'This thread changed elsewhere.'), { thread: current });
        const started = await startDetour(request, env, current, body);
        if (started.draft) return ok({ thread: current, draft: started.draft });
        const thread = await threads.updateLatest(owner(env), body.id, (t) => {
          let next = addSession(t, { ...started.entry, now });
          if (started.state) next = setSessionState(next, started.entry.sessionId, started.state, now);
          return recordRoute(next, { joint: body.joint ?? 'asked', optionId: body.optionId, reason: body.reason ?? null, outcome: 'taken', stepId: body.fromStepId ?? null, sessionId: body.fromSessionId, now });
        });
        return ok({ thread, open: started.open });
      }

      if (body.action === 'land') {
        const current = await threads.get(owner(env), body.id);
        if (Number(body.revision) !== current.revision) throw Object.assign(httpError(409, 'conflict', 'This thread changed elsewhere.'), { thread: current });
        const entry = sessionOf(current, body.sessionId);
        if (!entry) throw httpError(404, 'not_found', 'That session is not in this thread.');
        const packet = await packetFor(request, env, entry, body);
        return ok({ thread: await threads.update(owner(env), body.id, body.revision, (t) => landPacket(t, body.sessionId, packet, now)) });
      }

      const act = SIMPLE[body.action];
      if (!act) throw httpError(400, 'validation_error', `Unknown action: ${body.action}`);
      return ok({ thread: await threads.update(owner(env), body.id, body.revision, (t) => act(t, body, now)) });
    } catch (error) {
      const status = error.status ?? 502;
      return withCors(errorResponse(status, error.code ?? 'thread_failed', error.message ?? 'Thread request failed.', status >= 500, {}, error.thread ? { thread: error.thread } : undefined), request, env);
    }
  }, deps);
}

export default createThinkingThreadsHandler();
