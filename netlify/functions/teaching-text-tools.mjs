/**
 * Operator-only text tools on a rich text block (see _shared/text-tools.mjs).
 *
 *   POST /api/text-tools        { tool: 'dictionary' | 'fry', html }  start or reuse a job
 *   GET  /api/text-tools/:key                                          poll it
 *
 * Both answer `{ key, status: 'working' | 'done' | 'error', result?, error? }`.
 */
import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import {
  isTextTool,
  kickTextToolRun as defaultKick,
  publicJobView,
  readTextToolJob,
  richTextToPlain,
  startTextToolJob,
  textToolInputError
} from './_shared/text-tools.mjs';

export const config = { path: ['/api/text-tools', '/api/text-tools/:key'] };

export const TEXT_TOOLS_RUN_PATH = '/api/text-tools-run';

function readKey(request, context = {}) {
  if (typeof context.params?.key === 'string') return context.params.key;
  const match = new URL(request.url).pathname.match(/\/api\/text-tools\/([^/]+)$/);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

export function createTextToolsHandler(deps = {}) {
  const kick = deps.kickTextToolRun ?? defaultKick;
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;

    if (request.method === 'GET') {
      const key = readKey(request, context);
      const job = await readTextToolJob(store, key);
      if (!job) return withCors(errorResponse(404, 'not_found', 'That scan has expired. Run it again.', false), request, env);
      return withCors(okResponse(200, publicJobView(key, job)), request, env);
    }
    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    }

    const body = await request.json().catch(() => null);
    const tool = body?.tool;
    if (!isTextTool(tool)) {
      return withCors(errorResponse(400, 'validation_error', 'tool must be dictionary or fry', false), request, env);
    }
    const text = richTextToPlain(typeof body?.html === 'string' ? body.html : '');
    const inputError = textToolInputError(tool, text);
    if (inputError) {
      return withCors(errorResponse(400, 'validation_error', inputError, false), request, env);
    }

    const { key, job, kick: shouldKick } = await startTextToolJob({ store, env, tool, text, now: deps.now });
    if (shouldKick) await kick(request, TEXT_TOOLS_RUN_PATH, key, deps.fetchImpl);
    return withCors(okResponse(200, publicJobView(key, job)), request, env);
  }, deps);
}

export default createTextToolsHandler();
