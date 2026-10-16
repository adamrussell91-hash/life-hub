/**
 * Public read of a lesson's class examples.
 * GET /api/published/examples/:id?class=<classId>
 *
 * Every student page in the room checks this about once a minute, so the
 * answer is cached at the edge for a few seconds: the class shares one
 * function run instead of each student causing their own.
 */
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { isDeletedRecord } from './_shared/record-liveness.mjs';
import { draftLessonKey, getJSON, publishedLessonKey } from './_shared/teaching-blobs.mjs';
import { isSafeId, readPublicExamples, resolveStudentContext } from './_shared/class-examples.mjs';

export const config = { path: '/api/published/examples/:id' };

export const EDGE_CACHE_SECONDS = 15;

function readLessonId(request, context = {}) {
  if (typeof context.params?.id === 'string' && context.params.id) return context.params.id;
  const match = new URL(request.url).pathname.match(/\/api\/published\/examples\/([^/]+)$/);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

/** The lesson must still be published and live, the same test as the lesson read. */
export async function isLivePublishedLesson(store, lessonId) {
  if (!isSafeId(lessonId)) return false;
  const [snapshot, draft] = await Promise.all([
    getJSON(store, publishedLessonKey(lessonId)),
    getJSON(store, draftLessonKey(lessonId))
  ]);
  return Boolean(snapshot && typeof snapshot === 'object' && draft && !isDeletedRecord(draft));
}

export function createPublishedExamplesHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET') {
      return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    }

    const lessonId = readLessonId(request, context);
    const live = await isLivePublishedLesson(store, lessonId);
    const exampleContext = live
      ? await resolveStudentContext(store, lessonId, new URL(request.url).searchParams.get('class'), deps)
      : null;
    if (!exampleContext) {
      return withCors(errorResponse(404, 'not_found', 'Lesson is not published', false), request, env);
    }

    const data = await readPublicExamples(store, lessonId, exampleContext);
    return withCors(
      okResponse(200, data, {
        'cache-control': 'public, max-age=0, must-revalidate',
        'netlify-cdn-cache-control': `public, durable, s-maxage=${EDGE_CACHE_SECONDS}`
      }),
      request,
      env
    );
  }, deps);
}

export default createPublishedExamplesHandler();
