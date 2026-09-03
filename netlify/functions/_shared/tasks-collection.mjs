import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './http.mjs';
import { createOperatorHandler } from './operator-gate.mjs';
import { readJsonObject } from './teaching-record-get.mjs';
import {
  defaultGetTasksStore,
  deleteKey,
  getJSON,
  listJSON,
  newRecordId,
  readIndex,
  setJSON,
  writeIndex
} from './tasks-blobs.mjs';

function recordKey(prefix, id) {
  return `${prefix}${id}`;
}

function summarize(item) {
  const id = typeof item.id === 'string' ? item.id : '';
  const title = typeof item.title === 'string' ? item.title : '';
  if (!id && !title) return null;
  return {
    id,
    title,
    status: typeof item.status === 'string' ? item.status : undefined
  };
}

function mergeRecord(existing, patch) {
  const next = { ...existing };
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'id' || key === 'schema_version' || key === 'created_at') continue;
    next[key] = value;
  }
  next.updated_at = new Date().toISOString();
  return next;
}

export function createTasksCollectionHandler({
  prefix,
  indexKey,
  listKey,
  idPrefix,
  notFound,
  create
}, deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    try {
      if (request.method === 'GET') {
        const id = new URL(request.url).searchParams.get('id') ?? '';
        if (id) {
          const record = await getJSON(store, recordKey(prefix, id));
          if (!record || typeof record !== 'object' || Array.isArray(record)) {
            return withCors(errorResponse(404, 'not_found', notFound, false), request, env);
          }
          return withCors(okResponse(200, record), request, env);
        }
        const items = (await listJSON(store, prefix)).map(summarize).filter(Boolean);
        return withCors(okResponse(200, { [listKey]: items }), request, env);
      }

      if (request.method === 'POST') {
        const parsed = await readJsonObject(request);
        if (parsed.error) return withCors(parsed.error, request, env);
        const built = create(parsed.value, newRecordId(idPrefix), new Date().toISOString());
        if (built.error) {
          return withCors(
            errorResponse(400, built.error.code, built.error.message, false),
            request,
            env
          );
        }
        await setJSON(store, recordKey(prefix, built.record.id), built.record);
        const ids = await readIndex(store, indexKey);
        await writeIndex(store, indexKey, [...ids, built.record.id]);
        return withCors(okResponse(201, built.record), request, env);
      }

      if (request.method === 'PATCH' || request.method === 'DELETE') {
        const id = new URL(request.url).searchParams.get('id') ?? '';
        if (!id) {
          return withCors(errorResponse(400, 'missing_id', 'id query param required', false), request, env);
        }
        const existing = await getJSON(store, recordKey(prefix, id));
        if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
          return withCors(errorResponse(404, 'not_found', notFound, false), request, env);
        }
        if (request.method === 'DELETE') {
          await deleteKey(store, recordKey(prefix, id));
          await writeIndex(store, indexKey, (await readIndex(store, indexKey)).filter(item => item !== id));
          return withCors(okResponse(200, { id, deleted: true }), request, env);
        }
        const parsed = await readJsonObject(request);
        if (parsed.error) return withCors(parsed.error, request, env);
        const next = mergeRecord(existing, parsed.value);
        await setJSON(store, recordKey(prefix, id), next);
        return withCors(okResponse(200, next), request, env);
      }

      return withCors(methodNotAllowed('GET, POST, PATCH, DELETE, OPTIONS'), request, env);
    } catch {
      return withCors(
        errorResponse(503, 'tasks_blobs_unbound', 'Tasks content store is not bound.', true),
        request,
        env
      );
    }
  }, {
    ...deps,
    unboundCode: deps.unboundCode ?? 'tasks_blobs_unbound',
    unboundMessage: deps.unboundMessage ?? 'Tasks content store is not bound.',
    getContentStore: deps.getContentStore ?? defaultGetTasksStore
  });
}
