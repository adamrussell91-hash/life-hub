import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import {
  defaultGetWhiteboardStore,
  getWhiteboardJSON,
  setWhiteboardJSON,
  whiteboardKey
} from './_shared/whiteboard-blobs.mjs';

export const config = { path: '/api/whiteboards/:id' };

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const VALID_ID = /^[A-Za-z0-9_-]{1,160}$/;

function readDocumentId(request, context = {}) {
  const fromContext = context.params?.id;
  if (typeof fromContext === 'string' && fromContext) return fromContext;
  const match = new URL(request.url).pathname.match(/\/api\/whiteboards\/([^/]+)$/);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

async function readJsonBody(request) {
  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
    const error = new Error('Whiteboard document is too large.');
    error.status = 413;
    error.code = 'payload_too_large';
    throw error;
  }
  try {
    return JSON.parse(text || '{}');
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.status = 400;
    error.code = 'invalid_json';
    throw error;
  }
}

export function createWhiteboardsHandler(deps = {}) {
  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      if (request.method !== 'GET' && request.method !== 'PUT') {
        return withCors(methodNotAllowed('GET, PUT, OPTIONS'), request, env);
      }

      const id = readDocumentId(request, context);
      if (!VALID_ID.test(id)) {
        return withCors(
          errorResponse(400, 'validation_error', 'Invalid whiteboard document id.', false),
          request,
          env
        );
      }

      const key = whiteboardKey(id);
      if (request.method === 'GET') {
        const record = await getWhiteboardJSON(store, key);
        if (!record) {
          return withCors(
            errorResponse(404, 'not_found', 'Whiteboard document not found.', false),
            request,
            env
          );
        }
        return withCors(okResponse(200, record), request, env);
      }

      let body;
      try {
        body = await readJsonBody(request);
      } catch (error) {
        const status = Number.isInteger(error?.status) ? error.status : 400;
        const code = typeof error?.code === 'string' ? error.code : 'invalid_request';
        return withCors(errorResponse(status, code, error.message, false), request, env);
      }

      if (!body || typeof body !== 'object' || Array.isArray(body) ||
          !body.snapshot || typeof body.snapshot !== 'object' || Array.isArray(body.snapshot)) {
        return withCors(
          errorResponse(400, 'validation_error', 'Whiteboard snapshot is required.', false),
          request,
          env
        );
      }

      const record = {
        id,
        snapshot: body.snapshot,
        schema_version: 1,
        updated_at: new Date().toISOString()
      };
      await setWhiteboardJSON(store, key, record);
      return withCors(okResponse(200, record), request, env);
    },
    {
      ...deps,
      getContentStore: deps.getContentStore ?? defaultGetWhiteboardStore,
      unboundCode: deps.unboundCode ?? 'whiteboard_blobs_unbound',
      unboundMessage: deps.unboundMessage ?? 'Whiteboard content store is not bound.'
    }
  );
}

export default createWhiteboardsHandler();
