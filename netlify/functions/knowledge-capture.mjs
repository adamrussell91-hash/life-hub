import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { knowledgeKernelFetch, knowledgeKernelSecret } from './_shared/knowledge-kernel.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';

export const config = { path: '/api/knowledge/capture' };

export function createKnowledgeCaptureHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    }
    const parsed = await readJsonObject(request);
    if (parsed.error) return withCors(parsed.error, request, env);
    const r2Key = typeof parsed.value?.r2_key === 'string' ? parsed.value.r2_key.trim() : '';
    if (!r2Key) {
      return withCors(errorResponse(400, 'validation_error', 'r2_key is required', false), request, env);
    }
    if (!knowledgeKernelSecret(env)) {
      return withCors(errorResponse(
        503,
        'knowledge_kernel_unbound',
        'Knowledge research kernel is not bound.',
        true
      ), request, env);
    }
    try {
      const response = await knowledgeKernelFetch('/capture', {
        env,
        fetchImpl: deps.fetchImpl,
        method: 'POST',
        body: { r2_key: r2Key },
        timeoutMs: 26_000
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = typeof payload?.error === 'string' ? payload.error : 'Capture failed';
        return withCors(errorResponse(
          response.status || 502,
          response.status === 503 ? 'knowledge_kernel_unbound' : 'capture_failed',
          message,
          response.status >= 500
        ), request, env);
      }
      return withCors(okResponse(200, payload), request, env);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 502;
      return withCors(errorResponse(
        status,
        error?.code ?? 'knowledge_kernel_unbound',
        status === 503 ? 'Knowledge research kernel is not bound.' : 'Capture failed',
        true
      ), request, env);
    }
  }, deps);
}

export default createKnowledgeCaptureHandler();
