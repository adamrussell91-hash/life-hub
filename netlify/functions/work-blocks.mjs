import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import {
  defaultGetTasksStore,
  deleteKey,
  getJSON,
  listJSON,
  newRecordId,
  readIndex,
  setJSON,
  writeIndex
} from './_shared/tasks-blobs.mjs';

export const config = { path: '/api/work-blocks' };

const WORK_BLOCK_PREFIX = 'work_blocks/';
const WORK_BLOCKS_INDEX = 'work_blocks/_index';

function workBlockKey(id) {
  return `${WORK_BLOCK_PREFIX}${id}`;
}

function readId(request) {
  return new URL(request.url).searchParams.get('id') ?? '';
}

function normalizeBlock(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  return {
    schema_version: 1,
    status: 'confirmed',
    depth: 'shallow',
    source: 'manual',
    locked: false,
    task_id: null,
    project_id: null,
    ...raw
  };
}

export function createWorkBlocksHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    try {
      if (request.method === 'GET') {
        const id = readId(request);
        if (id) {
          const block = await getJSON(store, workBlockKey(id));
          if (!block) {
            return withCors(errorResponse(404, 'not_found', 'Work block not found', false), request, env);
          }
          return withCors(okResponse(200, normalizeBlock(block)), request, env);
        }
        const blocks = (await listJSON(store, WORK_BLOCK_PREFIX))
          .filter((item) => typeof item?.id === 'string')
          .map(normalizeBlock);
        return withCors(okResponse(200, { work_blocks: blocks }), request, env);
      }

      if (request.method === 'POST') {
        const parsed = await readJsonObject(request);
        if (parsed.error) return withCors(parsed.error, request, env);
        const title = typeof parsed.value.title === 'string' ? parsed.value.title.trim() : '';
        const date = typeof parsed.value.date === 'string' ? parsed.value.date : '';
        const start_time = typeof parsed.value.start_time === 'string' ? parsed.value.start_time : '';
        const duration_minutes = Number(parsed.value.duration_minutes);
        if (!title || !date || !start_time || !Number.isFinite(duration_minutes) || duration_minutes <= 0) {
          return withCors(
            errorResponse(400, 'validation_error', 'title, date, start_time, duration_minutes required', false),
            request,
            env
          );
        }
        const stamp = new Date().toISOString();
        const id = newRecordId('wblock');
        const block = normalizeBlock({
          id,
          title,
          date,
          start_time,
          duration_minutes,
          task_id: typeof parsed.value.task_id === 'string' ? parsed.value.task_id : null,
          project_id: typeof parsed.value.project_id === 'string' ? parsed.value.project_id : null,
          depth: parsed.value.depth ?? 'shallow',
          status: parsed.value.status ?? 'confirmed',
          source: parsed.value.source ?? 'manual',
          locked: Boolean(parsed.value.locked),
          created_at: stamp,
          updated_at: stamp
        });
        await setJSON(store, workBlockKey(id), block);
        const ids = await readIndex(store, WORK_BLOCKS_INDEX);
        await writeIndex(store, WORK_BLOCKS_INDEX, [...ids, id]);
        return withCors(okResponse(201, block), request, env);
      }

      if (request.method === 'PATCH' || request.method === 'DELETE') {
        const id = readId(request);
        if (!id) {
          return withCors(errorResponse(400, 'missing_id', 'id query param required', false), request, env);
        }
        const existing = await getJSON(store, workBlockKey(id));
        if (!existing) {
          return withCors(errorResponse(404, 'not_found', 'Work block not found', false), request, env);
        }
        if (request.method === 'DELETE') {
          await deleteKey(store, workBlockKey(id));
          const ids = (await readIndex(store, WORK_BLOCKS_INDEX)).filter((x) => x !== id);
          await writeIndex(store, WORK_BLOCKS_INDEX, ids);
          return withCors(okResponse(200, { id, deleted: true }), request, env);
        }
        const parsed = await readJsonObject(request);
        if (parsed.error) return withCors(parsed.error, request, env);
        const next = normalizeBlock({
          ...existing,
          ...parsed.value,
          id: existing.id,
          created_at: existing.created_at,
          updated_at: new Date().toISOString()
        });
        await setJSON(store, workBlockKey(id), next);
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

export default createWorkBlocksHandler();
