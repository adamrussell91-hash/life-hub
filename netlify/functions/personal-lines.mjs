import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { deleteKey, defaultGetTasksStore, getJSON, listJSON, readIndex, setJSON, writeIndex } from './_shared/tasks-blobs.mjs';
import {
  LINE_INDEX_KEY,
  LINE_PREFIX,
  isLineSlug,
  lineKey,
  lineSummary,
  newLineSlug,
  sanitizeLineSnapshot
} from './_shared/personal-lines.mjs';

export const config = { path: '/api/personal-lines' };

/** Adam's side of personal lines: list, publish a snapshot, unpublish. */
export function createPersonalLinesHandler(deps = {}) {
  const makeSlug = deps.newSlug ?? newLineSlug;
  return createOperatorHandler(async (request, { env, store }) => {
    if (request.method === 'GET') {
      const records = (await listJSON(store, LINE_PREFIX)).filter(record => record && isLineSlug(record.slug));
      return withCors(okResponse(200, { lines: records.map(lineSummary) }), request, env);
    }
    if (request.method === 'POST') {
      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      const clean = sanitizeLineSnapshot(parsed.value);
      if (clean.error) return withCors(errorResponse(400, 'validation_error', clean.error, false), request, env);
      let slug = makeSlug();
      for (let tries = 0; tries < 5 && (await getJSON(store, lineKey(slug))); tries += 1) slug = makeSlug();
      const record = { ...clean.snapshot, slug };
      await setJSON(store, lineKey(slug), record);
      await writeIndex(store, LINE_INDEX_KEY, [...(await readIndex(store, LINE_INDEX_KEY)), slug]);
      return withCors(okResponse(201, lineSummary(record)), request, env);
    }
    if (request.method === 'DELETE') {
      const slug = new URL(request.url).searchParams.get('slug') ?? '';
      if (!isLineSlug(slug)) return withCors(errorResponse(400, 'missing_slug', 'slug query param required', false), request, env);
      await deleteKey(store, lineKey(slug));
      await writeIndex(store, LINE_INDEX_KEY, (await readIndex(store, LINE_INDEX_KEY)).filter(item => item !== slug));
      return withCors(okResponse(200, { slug, deleted: true }), request, env);
    }
    return withCors(methodNotAllowed('GET, POST, DELETE, OPTIONS'), request, env);
  }, {
    ...deps,
    unboundCode: 'tasks_blobs_unbound',
    unboundMessage: 'Tasks content store is not bound.',
    getContentStore: deps.getContentStore ?? defaultGetTasksStore
  });
}

export default createPersonalLinesHandler();
