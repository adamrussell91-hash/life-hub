import { findAttachment } from './_shared/knowledge-attachment-sign.mjs';
import { getKnowledgePage, isSafeKnowledgePageId } from './_shared/knowledge-data.mjs';
import { knowledgePresignGet } from './_shared/knowledge-r2.mjs';
import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';

export const config = { path: '/api/knowledge/attachments/:pageId/:attachmentId' };

function readIds(request, context = {}) {
  const pageId = isSafeKnowledgePageId(context.params?.pageId) ? context.params.pageId : '';
  const attachmentId = typeof context.params?.attachmentId === 'string' ? context.params.attachmentId : '';
  if (pageId && attachmentId) return { pageId, attachmentId };
  const match = new URL(request.url).pathname.match(/\/api\/knowledge\/attachments\/([^/]+)\/([^/]+)$/);
  return {
    pageId: match && isSafeKnowledgePageId(match[1]) ? match[1] : '',
    attachmentId: match?.[2] ?? ''
  };
}

export function createKnowledgeAttachmentHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    if (request.method !== 'GET') {
      return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    }
    const { pageId, attachmentId } = readIds(request, context);
    if (!pageId || !attachmentId) {
      return withCors(errorResponse(404, 'not_found', 'Attachment not found', false), request, env);
    }
    try {
      const page = await getKnowledgePage(pageId, { env, fetchImpl: deps.fetchImpl });
      const attachment = findAttachment(page, attachmentId);
      if (!attachment) {
        return withCors(errorResponse(404, 'not_found', 'Attachment not found', false), request, env);
      }
      const url = await knowledgePresignGet(env, { key: attachment.r2_key, signGet: deps.signGet });
      return withCors(okResponse(200, { url }), request, env);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 502;
      const code = typeof error?.code === 'string' ? error.code : 'github_unavailable';
      const message = status === 503 && code === 'knowledge_r2_unbound'
        ? 'Attachment storage is not configured'
        : status === 503
          ? 'Knowledge data repository is not bound.'
          : 'Attachment lookup failed';
      return withCors(errorResponse(status, code, message, status >= 500), request, env);
    }
  }, deps);
}

export default createKnowledgeAttachmentHandler();
