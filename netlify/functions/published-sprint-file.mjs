// netlify/functions/published-sprint-file.mjs: students upload (multipart) and read (JSON, returns bytes) sprint files.
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { uploadSprintFile, readSprintFile, SPRINT_FILE_BYTES } from './_shared/sprint-files.mjs';
import { SprintError } from './_shared/sprint.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/published/sprint-file/:id', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 120, windowSize: 60 } };
export function createPublishedSprintFileHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    if (Number(request.headers.get('content-length')) > SPRINT_FILE_BYTES + 64 * 1024) return withCors(errorResponse(413, 'too_large', 'That file is over 5 MB. Save a smaller copy or add a link.', false), request, env);
    const lessonId = new URL(request.url).pathname.match(/\/published\/sprint-file\/([^/]+)$/)?.[1];
    try {
      if ((request.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
        return withCors(okResponse(200, await uploadSprintFile(store, lessonId, await request.formData()), { 'cache-control': 'no-store' }), request, env);
      }
      const file = await readSprintFile(store, lessonId, JSON.parse(await request.text()));
      return withCors(new Response(file.bytes, { status: 200, headers: { 'content-type': file.mime, 'cache-control': 'private, no-store', 'content-disposition': `inline; filename="${encodeURIComponent(file.name)}"` } }), request, env);
    } catch (e) {
      if (e instanceof SprintError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createPublishedSprintFileHandler();
