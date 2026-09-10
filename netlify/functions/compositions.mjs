import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import {
  COMPOSITION_PREFIX,
  compositionKey,
  listJSON,
  newId,
  setJSON,
  slugify
} from './_shared/teaching-blobs.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { teachingWriteError } from './_shared/teaching-create.mjs';

export const config = { path: '/api/compositions' };

function isSectionRoot(root) {
  return Boolean(root && typeof root === 'object' && !Array.isArray(root) && root.type === 'section');
}

export async function createCompositionRecord(store, body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) throw teachingWriteError(400, 'validation_error', 'title is required');
  if (!isSectionRoot(body.root)) {
    throw teachingWriteError(400, 'validation_error', 'root must be a section block');
  }
  const timestamp = new Date().toISOString();
  const id = newId('composition');
  const record = {
    id,
    type: 'composition_template',
    title,
    slug: slugify(title),
    status: 'active',
    root: structuredClone(body.root),
    created_at: timestamp,
    updated_at: timestamp,
    schema_version: 1
  };
  await setJSON(store, compositionKey(id), record);
  return record;
}

export function createCompositionsHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    try {
      if (request.method === 'GET') {
        const compositions = (await listJSON(store, COMPOSITION_PREFIX))
          .filter(entry => entry.status === 'active')
          .map(entry => ({ id: entry.id, title: entry.title, updated_at: entry.updated_at }))
          .sort((a, b) => String(a.title).localeCompare(String(b.title)));
        return withCors(okResponse(200, { compositions }), request, env);
      }
      if (request.method !== 'POST') {
        return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
      }
      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      const record = await createCompositionRecord(store, parsed.value);
      return withCors(okResponse(201, record), request, env);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 503;
      return withCors(
        errorResponse(
          status,
          error?.code ?? 'blobs_unbound',
          error?.status ? error.message : 'Teaching content store is not bound.',
          status >= 500
        ),
        request,
        env
      );
    }
  }, deps);
}

export default createCompositionsHandler();
