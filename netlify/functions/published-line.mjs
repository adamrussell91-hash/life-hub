import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { defaultGetTasksStore, getJSON } from './_shared/tasks-blobs.mjs';
import { isLineSlug, lineKey } from './_shared/personal-lines.mjs';

export const config = { path: '/api/published/lines/:slug' };

function readSlug(request, context = {}) {
  if (typeof context.params?.slug === 'string') return context.params.slug;
  const match = new URL(request.url).pathname.match(/\/api\/published\/lines\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : '';
}

/** The public side: anyone with the link can read a published line, nothing else. */
export function createPublishedLineHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET') return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    const slug = readSlug(request, context);
    const record = isLineSlug(slug) ? await getJSON(store, lineKey(slug)) : null;
    if (!record || typeof record !== 'object') {
      return withCors(errorResponse(404, 'not_found', 'This line is not published.', false), request, env);
    }
    return withCors(okResponse(200, record, { 'cache-control': 'no-store' }), request, env);
  }, { ...deps, getContentStore: deps.getContentStore ?? defaultGetTasksStore });
}

export default createPublishedLineHandler();
