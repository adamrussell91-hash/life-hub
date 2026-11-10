// netlify/functions/thinking-threads-guide.mjs
// The guide's API: POST { triage } or { checkIn }, and GET ?spend=1 for the month's spend line.
// The guide only suggests; nothing here starts a session or a run.
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { createThreadStore, defaultGetThreadStore } from './_shared/thinking-threads/store.mjs';
import { JOINTS } from './_shared/thinking-threads/thread.mjs';
import { createGuide, haikuModel } from './_shared/thinking-guide/guide.mjs';
import { readSpend } from './_shared/thinking-guide/spend.mjs';

export const config = { path: '/api/thinking-threads/guide' };

export function owner(env) {
  return env.COGNITIVE_OWNER_ID || 'operator';
}

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });

export function createThinkingGuideHandler(deps = {}) {
  const nowIso = () => new Date(deps.now ? deps.now() : Date.now()).toISOString();
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    const ok = (data) => withCors(okResponse(200, data, { 'cache-control': 'no-store' }), request, env);
    try {
      const store = deps.getStore ? await deps.getStore(env) : await defaultGetThreadStore(env);
      if (!store) throw fail(503, 'store_unbound', 'Thread storage is not configured.');
      const threads = createThreadStore(store);
      if (request.method === 'GET') {
        if (!new URL(request.url).searchParams.has('spend')) throw fail(400, 'validation_error', 'Ask for ?spend=1.');
        return ok(await readSpend(threads, owner(env), nowIso()));
      }
      if (request.method !== 'POST') return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      const body = parsed.value ?? {};
      const guide = createGuide({
        model: deps.model ?? haikuModel(env, deps.fetchImpl ?? fetch),
        threads,
        owner: owner(env),
        now: nowIso,
        ...(deps.timeoutMs ? { timeoutMs: deps.timeoutMs } : {}),
        log: deps.log ?? ((error) => console.warn('thinking guide:', error?.code ?? '', error?.message ?? error))
      });
      if (body.triage) return ok(await guide.triage(body.triage));
      if (body.checkIn) {
        if (!JOINTS.includes(body.checkIn.joint)) throw fail(400, 'validation_error', 'Unknown joint.');
        return ok(await guide.checkIn(body.checkIn));
      }
      throw fail(400, 'validation_error', 'Send triage or checkIn.');
    } catch (error) {
      const status = error.status ?? 502;
      return withCors(errorResponse(status, error.code ?? 'guide_failed', error.message ?? 'The guide could not answer.', status >= 500), request, env);
    }
  }, deps);
}

export default createThinkingGuideHandler();
