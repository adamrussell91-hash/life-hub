// netlify/functions/sprint-file.mjs: the teacher reads any file in a sprint.
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { teacherSprintFile } from './_shared/sprint-files.mjs';
import { SprintError } from './_shared/sprint.mjs';
import { errorResponse, guardRequestOrigin, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/lessons/:id/sprint-file' };
export function createSprintFileHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    const lessonId = new URL(request.url).pathname.match(/\/lessons\/([^/]+)\/sprint-file$/)?.[1];
    try {
      const file = await teacherSprintFile(store, lessonId, await request.json());
      return withCors(new Response(file.bytes, { status: 200, headers: { 'content-type': file.mime, 'cache-control': 'private, no-store' } }), request, env);
    } catch (e) {
      if (e instanceof SprintError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createSprintFileHandler();
