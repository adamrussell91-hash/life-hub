/**
 * Operator-only private feedback docs (annotation voice slice 4f).
 * POST/GET /api/teaching/feedback
 * POST /api/teaching/feedback/:id/link
 * POST /api/teaching/feedback/:id/revoke
 */
import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import {
  createFeedbackDoc,
  createFeedbackLink,
  listFeedbackDocs,
  revokeFeedbackLink
} from './_shared/teaching-feedback.mjs';

export const config = {
  path: [
    '/api/teaching/feedback',
    '/api/teaching/feedback/:id/link',
    '/api/teaching/feedback/:id/revoke'
  ]
};

function readBody(request) {
  return request.json().catch(() => ({}));
}

function feedbackId(request, context) {
  const fromContext = context.params?.id;
  if (typeof fromContext === 'string' && fromContext) return fromContext;
  const match = new URL(request.url).pathname.match(
    /\/api\/teaching\/feedback\/([^/]+)\/(?:link|revoke)$/
  );
  return match?.[1] ?? null;
}

export function createTeachingFeedbackHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.endsWith('/link')) {
      if (request.method !== 'POST') {
        return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
      }
      const id = feedbackId(request, context);
      if (!id) {
        return withCors(errorResponse(404, 'not_found', 'Feedback not found', false), request, env);
      }
      const body = await readBody(request);
      const result = await createFeedbackLink(store, id, {
        ...deps,
        expires_at: typeof body.expires_at === 'string' ? body.expires_at : undefined
      });
      if (result.error === 'not_found') {
        return withCors(errorResponse(404, 'not_found', 'Feedback not found', false), request, env);
      }
      return withCors(
        okResponse(200, {
          token: result.token,
          path: `/s/feedback/${result.token}`,
          feedback: result.doc
        }),
        request,
        env
      );
    }

    if (path.endsWith('/revoke')) {
      if (request.method !== 'POST') {
        return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
      }
      const id = feedbackId(request, context);
      if (!id) {
        return withCors(errorResponse(404, 'not_found', 'Feedback not found', false), request, env);
      }
      const result = await revokeFeedbackLink(store, id, deps);
      if (result.error === 'not_found') {
        return withCors(errorResponse(404, 'not_found', 'Feedback not found', false), request, env);
      }
      return withCors(okResponse(200, { revoked: true, feedback: result.doc }), request, env);
    }

    if (request.method === 'GET') {
      const items = await listFeedbackDocs(store);
      return withCors(okResponse(200, { items }), request, env);
    }

    if (request.method === 'POST') {
      const body = await readBody(request);
      const doc = await createFeedbackDoc(store, body, deps);
      return withCors(okResponse(201, { feedback: doc }), request, env);
    }

    return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
  }, deps);
}

export default createTeachingFeedbackHandler();
