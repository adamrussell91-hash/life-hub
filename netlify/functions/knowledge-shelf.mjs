import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { defaultGetShelfStore, readShelf, saveBook, savePlacements } from './_shared/knowledge-shelf.mjs';

export const config = { path: '/api/knowledge/shelf' };

// GET  → { books, placements }
// POST { op: "book", book }            upsert one book's facts
// POST { op: "place", placements: [] } merge note placements (page, stance, gaps, themes, lastOpened)
export function createKnowledgeShelfHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    try {
      const store = await (deps.getStore ?? defaultGetShelfStore)(env);
      const now = deps.now?.();
      if (request.method === 'GET') {
        return withCors(okResponse(200, await readShelf(store)), request, env);
      }
      if (request.method !== 'POST') return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      const body = parsed.value;
      if (body.op === 'book') {
        return withCors(okResponse(200, { book: await saveBook(store, body.book, { now }) }), request, env);
      }
      if (body.op === 'place') {
        return withCors(okResponse(200, { placements: await savePlacements(store, body.placements, { now }) }), request, env);
      }
      return withCors(errorResponse(400, 'validation_error', 'op must be "book" or "place".', false), request, env);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 502;
      const code = typeof error?.code === 'string' ? error.code : 'shelf_unavailable';
      const message = status < 500 ? error.message : 'Bookshelf storage is unavailable.';
      return withCors(errorResponse(status, code, message, status >= 500), request, env);
    }
  }, deps);
}

export default createKnowledgeShelfHandler();
