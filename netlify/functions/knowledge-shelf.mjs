import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { defaultGetShelfStore, deleteBook, readShelf, saveBook, savePlacements } from './_shared/knowledge-shelf.mjs';
import { checkFactsJob, readFactsJob, startFactsJob } from './_shared/knowledge-shelf-facts.mjs';
import { checkKindsJob, gradeOneKind, readKindsJob, startKindsJob } from './_shared/knowledge-shelf-kinds.mjs';

export const config = { path: '/api/knowledge/shelf' };

// GET  → { books, placements }
// POST { op: "book", book }            upsert one book's facts
// POST { op: "place", placements: [] } merge note placements (page, stance, kind, gaps, themes, lastOpened)
// POST { op: "book-delete", label }     take a book's own record off the shelf
// POST { op: "facts-start", books: [] } Claude estimates facts for these titles (one Message Batch)
// POST { op: "facts-check" }           check the batch; applies results once it has ended
// POST { op: "kinds-start", ids?, regrade? } Claude grades book-note kinds (one Message Batch)
// POST { op: "kinds-check" }           check the batch; applies kinds once it has ended
// POST { op: "kind", pageId }          grade one note synchronously
export function createKnowledgeShelfHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    try {
      const store = await (deps.getStore ?? defaultGetShelfStore)(env);
      const now = deps.now?.();
      const claude = {
        apiKey: deps.apiKey ?? env?.ANTHROPIC_API_KEY,
        fetchImpl: deps.fetchImpl,
        now,
        listPages: deps.listPages,
        getPage: deps.getPage,
        env
      };
      if (request.method === 'GET') {
        const [shelf, factsJob, kindsJob] = await Promise.all([readShelf(store), readFactsJob(store), readKindsJob(store)]);
        return withCors(okResponse(200, { ...shelf, factsJob, kindsJob }), request, env);
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
      if (body.op === 'kinds-start') {
        return withCors(okResponse(200, { job: await startKindsJob(store, { ids: body.ids, regrade: Boolean(body.regrade) }, claude) }), request, env);
      }
      if (body.op === 'kinds-check') {
        return withCors(okResponse(200, { job: await checkKindsJob(store, claude) }), request, env);
      }
      if (body.op === 'kind') {
        return withCors(okResponse(200, { placement: await gradeOneKind(store, body.pageId, claude) }), request, env);
      }
      return withCors(errorResponse(400, 'validation_error', 'op must be "book", "book-delete", "place", "facts-start", "facts-check", "kinds-start", "kinds-check" or "kind".', false), request, env);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 502;
      const code = typeof error?.code === 'string' ? error.code : 'shelf_unavailable';
      // Config/job errors must name the reason (V5); generic 5xx stay opaque.
      const passThrough = status < 500 || code === 'anthropic_unconfigured';
      const message = passThrough ? error.message : 'Bookshelf storage is unavailable.';
      return withCors(errorResponse(status, code, message, status >= 500), request, env);
    }
  }, deps);
}

export default createKnowledgeShelfHandler();
