/**
 * A student types a class example after the teacher gives them a code.
 * POST /api/published/examples/:id/unlock  { class?, slot_id, code }
 * POST /api/published/examples/:id/submit  { class?, slot_id, token, text }
 *
 * The code is three digits, so guessing is capped per box: ten wrong tries
 * lock it until the teacher issues a new one. A right code is spent at once
 * and swapped for a private token, so only that student can save. Saving
 * locks the box; nothing reaches the class until the teacher shows it.
 */
import {
  errorResponse,
  guardRequestOrigin,
  jsonResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import {
  ExampleError,
  normaliseContext,
  submitExample,
  unlockSlot
} from './_shared/class-examples.mjs';
import { isLivePublishedLesson } from './published-examples.mjs';

export const config = {
  path: ['/api/published/examples/:id/unlock', '/api/published/examples/:id/submit'],
  // A whole class shares one school IP, so this is generous; the per-box
  // wrong-code lock is what stops guessing.
  rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 90, windowSize: 60 }
};

function readRoute(request, context = {}) {
  const match = new URL(request.url).pathname.match(
    /\/api\/published\/examples\/([^/]+)\/(unlock|submit)$/
  );
  const fromContext = typeof context.params?.id === 'string' ? context.params.id : '';
  return {
    lessonId: fromContext || (match?.[1] ? decodeURIComponent(match[1]) : ''),
    step: match?.[2] ?? ''
  };
}

export function createPublishedExamplesWriteHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    }
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);

    const { lessonId, step } = readRoute(request, context);
    const body = await request.json().catch(() => ({}));
    const exampleContext = normaliseContext(body?.class);
    if (!step || !exampleContext || !(await isLivePublishedLesson(store, lessonId))) {
      return withCors(errorResponse(404, 'not_found', 'Lesson is not published', false), request, env);
    }

    try {
      const data = step === 'unlock'
        ? await unlockSlot(store, lessonId, exampleContext, body, deps)
        : await submitExample(store, lessonId, exampleContext, body, deps);
      return withCors(okResponse(200, data), request, env);
    } catch (error) {
      if (error instanceof ExampleError) {
        // `details` is where the app's API client reads extra error fields.
        return withCors(
          jsonResponse(error.status, {
            ok: false,
            error: { code: error.code, message: error.message, retryable: false, details: error.data }
          }),
          request,
          env
        );
      }
      throw error;
    }
  }, deps);
}

export default createPublishedExamplesWriteHandler();
