import { parseSignRequest } from './_shared/knowledge-attachment-sign.mjs';
import { knowledgePresignPut } from './_shared/knowledge-r2.mjs';
import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';

export const config = { path: '/api/knowledge/attachments-sign' };

export function createKnowledgeAttachmentsSignHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    }
    const parsedBody = await readJsonObject(request);
    if (parsedBody.error) return withCors(parsedBody.error, request, env);
    const parsed = parseSignRequest(parsedBody.value);
    if (parsed.error) {
      return withCors(errorResponse(400, 'validation_error', parsed.error, false), request, env);
    }
    try {
      const putUrl = await knowledgePresignPut(env, {
        key: parsed.value.attachment.r2_key,
        contentType: parsed.value.attachment.content_type,
        signPut: deps.signPut
      });
      return withCors(okResponse(200, {
        put_url: putUrl,
        attachment: parsed.value.attachment
      }), request, env);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 502;
      return withCors(errorResponse(
        status,
        error?.code ?? 'knowledge_r2_unbound',
        status === 503 ? 'Attachment storage is not configured' : 'Attachment sign failed',
        status >= 500
      ), request, env);
    }
  }, deps);
}

export default createKnowledgeAttachmentsSignHandler();
