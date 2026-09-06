import {
  errorResponse,
  jsonResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './http.mjs';
import { createOperatorHandler } from './operator-gate.mjs';
import { deleteKey, getJSON, readPublishedId, setJSON } from './teaching-blobs.mjs';
import {
  blobJsonStore,
  liveSnapshotForKind,
  writeCheckpoint
} from './teaching-versions.mjs';

const WRITE_METHODS = new Set(['GET', 'PUT', 'PATCH', 'DELETE']);

export async function readJsonObject(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return { error: errorResponse(400, 'invalid_json', 'Request body is not valid JSON', false) };
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      error: errorResponse(400, 'validation_error', 'Request body must be a JSON object', false)
    };
  }
  return { value: body };
}

function mergeRecord(existing, patch) {
  const next = { ...existing };
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'id' || key === 'type') continue;
    next[key] = value;
  }
  next.updated_at = new Date().toISOString();
  return next;
}

export function createTeachingRecordHandler({ keyFor, notFound, methods, versionKind }, deps = {}) {
  const allowed = new Set(methods ?? WRITE_METHODS);
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (!allowed.has(request.method)) {
      return withCors(methodNotAllowed([...allowed, 'OPTIONS'].join(', ')), request, env);
    }
    const id = readPublishedId(request, context);
    if (!id) {
      return withCors(errorResponse(404, 'not_found', notFound, false), request, env);
    }
    const key = keyFor(id);
    const record = await getJSON(store, key);
    if (!record) {
      return withCors(errorResponse(404, 'not_found', notFound, false), request, env);
    }
    if (request.method === 'GET') {
      return withCors(okResponse(200, record), request, env);
    }
    if (request.method === 'DELETE') {
      await deleteKey(store, key);
      return withCors(okResponse(200, { id, deleted: true }), request, env);
    }
    const parsed = await readJsonObject(request);
    if (parsed.error) return withCors(parsed.error, request, env);
    const checkpointReason = parsed.value.checkpoint_reason;
    const next = mergeRecord(record, parsed.value);
    delete next.checkpoint_reason;
    await setJSON(store, key, next);

    let warning;
    if (
      versionKind &&
      (checkpointReason === 'ai_accepted' || checkpointReason === 'manual_checkpoint')
    ) {
      try {
        await writeCheckpoint(blobJsonStore(store), {
          kind: versionKind,
          parentId: id,
          snapshot: liveSnapshotForKind(versionKind, next),
          reason: checkpointReason
        });
      } catch {
        warning = 'Saved, but version history checkpoint failed.';
      }
    }

    if (warning) {
      return withCors(jsonResponse(200, { ok: true, data: next, warning }), request, env);
    }
    return withCors(okResponse(200, next), request, env);
  }, deps);
}

export function createTeachingRecordGetHandler(options, deps = {}) {
  return createTeachingRecordHandler({ ...options, methods: ['GET'] }, deps);
}
