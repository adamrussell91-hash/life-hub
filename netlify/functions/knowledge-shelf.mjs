import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { defaultGetShelfStore, deleteBook, readShelf, saveBook, savePlacements } from './_shared/knowledge-shelf.mjs';
import { checkFactsJob, readFactsJob, startFactsJob } from './_shared/knowledge-shelf-facts.mjs';

export const config = { path: '/api/knowledge/shelf' };

// GET  → { books, placements }
// POST { op: "book", book }            upsert one book's facts
// POST { op: "place", placements: [] } merge note placements (page, stance, gaps, themes, lastOpened)
// POST { op: "book-delete", label }     take a book's own record off the shelf
// POST { op: "facts-start", books: [] } Claude estimates facts for these titles (one Message Batch)
// POST { op: "facts-check" }           check the batch; applies results once it has ended
export function createKnowledgeShelfHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    try {
      const store = await (deps.getStore ?? defaultGetShelfStore)(env);
      const now = deps.now?.();
      const claude = { apiKey: deps.apiKey ?? env?.ANTHROPIC_API_KEY, fetchImpl: deps.fetchImpl, now };
      if (request.method === 'GET') {
        const [shelf, factsJob] = await Promise.all([readShelf(store), readFactsJob(store)]);
        return withCors(okResponse(200, { ...shelf, factsJob }), request, env);
      }
      if (request.method !== 'POST') return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      const body = parsed.value;
      if (body.op === 'book') {
        return withCors(okResponse(200, { book: await saveBook(store, body.book, { now }) }), request, env);
      }
      if (body.op === 'book-delete') {
        return withCors(okResponse(200, await deleteBook(store, body.label)), request, env);
      }
      if (body.op === 'place') {
        return withCors(okResponse(200, { placements: await savePlacements(store, body.placements, { now }) }), request, env);
      }
      if (body.op === 'facts-start') {
        return withCors(okResponse(200, { job: await startFactsJob(store, body.books, claude) }), request, env);
      }
      if (body.op === 'facts-check') {
        return withCors(okResponse(200, { job: await checkFactsJob(store, claude) }), request, env);
      }
      return withCors(errorResponse(400, 'validation_error', 'op must be "book", "book-delete", "place", "facts-start" or "facts-check".', false), request, env);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 502;
      const code = typeof error?.code === 'string' ? error.code : 'shelf_unavailable';
      const message = status < 500 ? error.message : 'Bookshelf storage is unavailable.';
      return withCors(errorResponse(status, code, message, status >= 500), request, env);
    }
  }, deps);
}

export default createKnowledgeShelfHandler();
