import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { readStudio, writeStudioOp } from './_shared/knowledge-studio.mjs';

export const config = { path: '/api/knowledge/studio' };

// GET  → { studio }   the book ideas, their chapter plans and Adam's decisions
// POST { op: "stage", bookId, stage }                      move an idea along
// POST { op: "idea", title }                               put a new idea on the shelf
// POST { op: "link" | "unlink", bookId, chapter, ref, title?, words? }  tie a note to a chapter
// POST { op: "decide", insightId, choice }                 accept or dismiss one of Clementine's suggestions
export function createKnowledgeStudioHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    const repo = { env, fetchImpl: deps.fetchImpl };
    try {
      if (request.method === 'GET') {
        const { doc } = await readStudio(repo);
        return withCors(okResponse(200, { studio: doc }), request, env);
      }
      if (request.method !== 'POST') return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      const studio = await writeStudioOp(parsed.value, repo, { now: deps.now?.() });
      return withCors(okResponse(200, { studio }), request, env);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 502;
      const code = typeof error?.code === 'string' ? error.code : 'studio_unavailable';
      const passThrough = status < 500 || code === 'knowledge_repo_unbound' || code === 'studio_corrupt';
      const message = passThrough ? error.message : 'Studio storage is unavailable.';
      return withCors(errorResponse(status, code, message, status >= 500), request, env);
    }
  }, deps);
}

export default createKnowledgeStudioHandler();
