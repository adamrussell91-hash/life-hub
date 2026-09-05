import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { getJSON } from './_shared/teaching-blobs.mjs';
import {
  blobJsonStore,
  getVersion,
  listVersionIndex,
  liveKeyForKind,
  liveSnapshotForKind,
  parentNotFoundMessage,
  restoreVersion,
  VersionStoreError,
  writeCheckpoint
} from './_shared/teaching-versions.mjs';

export const config = {
  path: [
    '/api/lessons/:id/versions',
    '/api/lessons/:id/versions/:revision',
    '/api/lessons/:id/versions/:revision/restore',
    '/api/units/:id/versions',
    '/api/units/:id/versions/:revision',
    '/api/units/:id/versions/:revision/restore',
    '/api/classes/:id/versions',
    '/api/classes/:id/versions/:revision',
    '/api/classes/:id/versions/:revision/restore'
  ]
};

const COLLECTION_TO_KIND = {
  lessons: 'lesson',
  units: 'unit',
  classes: 'class_homepage'
};

export function parseVersionPath(pathname) {
  const match = String(pathname).match(
    /^\/api\/(lessons|units|classes)\/([^/]+)\/versions(?:\/([^/]+)(?:\/(restore))?)?$/
  );
  if (!match) return null;
  const kind = COLLECTION_TO_KIND[match[1]];
  const parentId = match[2];
  const revisionRaw = match[3];
  const restore = match[4] === 'restore';
  let revision = null;
  if (revisionRaw !== undefined) {
    const parsed = Number(revisionRaw);
    if (!Number.isInteger(parsed) || parsed < 1) return { kind, parentId, invalidRevision: true };
    revision = parsed;
  }
  return { kind, parentId, revision, restore };
}

function mapStoreError(err) {
  if (err instanceof VersionStoreError) {
    const status = err.code === 'not_found' ? 404 : 400;
    return errorResponse(status, err.code, err.message, false);
  }
  throw err;
}

async function readOptionalLabel(request) {
  if (request.method !== 'POST') return undefined;
  const text = await request.text();
  if (!text.trim()) return undefined;
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new VersionStoreError('invalid_json', 'Request body is not valid JSON');
  }
  if (body == null) return undefined;
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new VersionStoreError('validation_error', 'Request body must be a JSON object');
  }
  if (typeof body.label !== 'string') return undefined;
  const trimmed = body.label.trim();
  return trimmed || undefined;
}

export function createTeachingVersionsHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const parsed = parseVersionPath(new URL(request.url).pathname);
    if (!parsed || parsed.invalidRevision) {
      return withCors(errorResponse(404, 'not_found', 'Version not found', false), request, env);
    }

    const { kind, parentId, revision, restore } = parsed;
    const jsonStore = blobJsonStore(store);

    try {
      if (revision == null) {
        if (request.method === 'GET') {
          const index = await listVersionIndex(jsonStore, kind, parentId);
          return withCors(okResponse(200, index), request, env);
        }
        if (request.method !== 'POST') {
          return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
        }
        const live = await getJSON(store, liveKeyForKind(kind, parentId));
        if (!live) {
          return withCors(
            errorResponse(404, 'not_found', parentNotFoundMessage(kind), false),
            request,
            env
          );
        }
        const label = await readOptionalLabel(request);
        const record = await writeCheckpoint(jsonStore, {
          kind,
          parentId,
          snapshot: liveSnapshotForKind(kind, live),
          reason: 'manual_checkpoint',
          label
        });
        return withCors(okResponse(200, record), request, env);
      }

      if (restore) {
        if (request.method !== 'POST') {
          return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
        }
        const live = await restoreVersion(jsonStore, { kind, parentId, revision });
        return withCors(okResponse(200, live), request, env);
      }

      if (request.method !== 'GET') {
        return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
      }
      const record = await getVersion(jsonStore, kind, parentId, revision);
      if (!record) {
        return withCors(errorResponse(404, 'not_found', 'Version not found', false), request, env);
      }
      return withCors(okResponse(200, record), request, env);
    } catch (err) {
      if (err instanceof VersionStoreError && err.code === 'invalid_json') {
        return withCors(errorResponse(400, 'invalid_json', err.message, false), request, env);
      }
      try {
        return withCors(mapStoreError(err), request, env);
      } catch {
        return withCors(
          errorResponse(500, 'checkpoint_failed', 'Version history request failed.', true),
          request,
          env
        );
      }
    }
  }, deps);
}

export default createTeachingVersionsHandler();
