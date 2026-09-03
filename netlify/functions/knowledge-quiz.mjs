import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { getQuizStore, saveQuizRecord } from './_shared/knowledge-data.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';

export const config = { path: '/api/knowledge/quiz' };

function knowledgeError(error) {
  const status = Number.isInteger(error?.status) ? error.status : 502;
  const code = typeof error?.code === 'string' ? error.code : 'github_unavailable';
  const message = status === 400
    ? error.message
    : status === 409
      ? 'save collided, try again'
      : status === 503
        ? 'Knowledge data repository is not bound.'
        : 'Knowledge data repository is unavailable.';
  return errorResponse(status, code, message, status >= 500);
}

export function createKnowledgeQuizHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    if (request.method === 'GET') {
      try {
        return withCors(okResponse(200, await getQuizStore({ env, fetchImpl: deps.fetchImpl })), request, env);
      } catch (error) {
        return withCors(knowledgeError(error), request, env);
      }
    }
    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    }
    const parsed = await readJsonObject(request);
    if (parsed.error) return withCors(parsed.error, request, env);
    try {
      const saved = await saveQuizRecord(parsed.value, { env, fetchImpl: deps.fetchImpl });
      return withCors(okResponse(200, saved), request, env);
    } catch (error) {
      return withCors(knowledgeError(error), request, env);
    }
  }, deps);
}

export default createKnowledgeQuizHandler();
