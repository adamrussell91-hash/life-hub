import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { sanitizeApstFocus } from './_shared/apst-focus.mjs';
import { applyLifeWall } from './_shared/life-wall.mjs';
import { coerceOriginDate, coerceSomedayKind, coerceStringArray, normalizeTaskRecord } from './_shared/task-shape.mjs';
import { applyDueDatePriorityFloor } from './_shared/task-priority-assess.mjs';
import {
  defaultGetTasksStore,
  deleteKey,
  getJSON,
  listJSON,
  newTaskId,
  readTaskIndex,
  setJSON,
  TASK_PREFIX,
  taskKey,
  writeTaskIndex
} from './_shared/tasks-blobs.mjs';

export const config = { path: '/api/tasks' };

const DOMAINS = new Set(['teaching', 'life', 'wedding', 'health', 'other']);
const PROFESSIONAL_RECORD_ID_PREFIX = /^(meeting|event|communication|application)[_-]/i;

function readTaskId(request) {
  return new URL(request.url).searchParams.get('id') ?? '';
}

const MARKING_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Null when absent. Undefined when the payload is present but not a marking shadow. */
function readMarking(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const class_label = String(value.class_label ?? '').trim();
  const scripts = Number(value.scripts);
  const collected_on = String(value.collected_on ?? '');
  const return_by = String(value.return_by ?? '');
  const rate = value.minutes_per_script == null ? null : Number(value.minutes_per_script);
  const scripts_marked = value.scripts_marked == null ? 0 : Number(value.scripts_marked);
  if (!class_label || !Number.isInteger(scripts) || scripts < 1) return undefined;
  if (!MARKING_DATE.test(collected_on) || !MARKING_DATE.test(return_by) || collected_on > return_by) return undefined;
  if (rate != null && !(rate > 0)) return undefined;
  if (!Number.isInteger(scripts_marked) || scripts_marked < 0) return undefined;
  return { class_label, scripts, minutes_per_script: rate, collected_on, return_by, scripts_marked };
}

function isTaskDomainRecord(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  if (typeof item.id !== 'string' || typeof item.title !== 'string') return false;
  if (PROFESSIONAL_RECORD_ID_PREFIX.test(item.id)) return false;
  if (typeof item.source_ref === 'string' && item.source_ref.startsWith('professional:')) return false;
  if (typeof item.projection_id === 'string') return false;
  const kind = typeof item.kind === 'string' ? item.kind : '';
  return !kind || kind === 'task' || kind === 'step';
}

function mergeTask(existing, patch) {
  const next = { ...existing };
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'id' || key === 'schema_version' || key === 'created_at') continue;
    if (key === 'someday_kind') {
      next.someday_kind = coerceSomedayKind(value);
      continue;
    }
    if (key === 'origin_date') {
      next.origin_date = coerceOriginDate(value);
      continue;
    }
    next[key] = value;
  }
  next.updated_at = new Date().toISOString();
  if (patch.status === 'done' && !existing.completed_at) {
    next.completed_at = next.updated_at;
  } else if (patch.status && patch.status !== 'done') {
    next.completed_at = null;
  }
  return next;
}

export function createTasksHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    try {
      if (request.method === 'GET') {
        const id = readTaskId(request);
        if (id) {
          const task = await getJSON(store, taskKey(id));
          if (!isTaskDomainRecord(task)) {
            return withCors(errorResponse(404, 'not_found', 'Task not found', false), request, env);
          }
          return withCors(okResponse(200, normalizeTaskRecord(task)), request, env);
        }
        const tasks = (await listJSON(store, TASK_PREFIX))
          .filter(isTaskDomainRecord)
          .map(normalizeTaskRecord);
        return withCors(okResponse(200, { tasks }), request, env);
      }

      if (request.method === 'POST') {
        const parsed = await readJsonObject(request);
        if (parsed.error) return withCors(parsed.error, request, env);
        const title = typeof parsed.value.title === 'string' ? parsed.value.title.trim() : '';
        const domain = typeof parsed.value.domain === 'string' ? parsed.value.domain : '';
        if (!title || !DOMAINS.has(domain)) {
          return withCors(
            errorResponse(400, 'validation_error', 'title and a valid domain are required', false),
            request,
            env
          );
        }
        const wall = applyLifeWall(parsed.value);
        if (!wall.ok) {
          return withCors(errorResponse(400, 'validation_error', wall.error, false), request, env);
        }
        const marking = readMarking(parsed.value.marking);
        if (marking === undefined) {
          return withCors(errorResponse(400, 'validation_error', 'marking shadow needs a class, script count, and dates', false), request, env);
        }
        const timestamp = new Date().toISOString();
        const id = newTaskId();
        const task = {
          schema_version: 1,
          id,
          title,
          description: typeof parsed.value.description === 'string' ? parsed.value.description : '',
          kind: 'task',
          bucket: typeof parsed.value.bucket === 'string' && parsed.value.bucket ? parsed.value.bucket : 'active',
          domain,
          status: typeof parsed.value.status === 'string' && parsed.value.status ? parsed.value.status : 'open',
          priority: typeof parsed.value.priority === 'string' ? parsed.value.priority : 'medium',
          parent_project_id: typeof parsed.value.parent_project_id === 'string'
            ? parsed.value.parent_project_id
            : null,
          created_at: timestamp,
          updated_at: timestamp,
          completed_at: null,
          depends_on: [],
          tags: [],
          attachments: [],
          source: 'manual',
          // Someday / Maybe fields — no-ops for board tasks that never set them.
          maturity: typeof parsed.value.maturity === 'string' ? parsed.value.maturity : null,
          life_area: typeof parsed.value.life_area === 'string' ? parsed.value.life_area : null,
          horizon_target: typeof parsed.value.horizon_target === 'string' ? parsed.value.horizon_target : null,
          someday_kind: coerceSomedayKind(parsed.value.someday_kind),
          origin_date: coerceOriginDate(parsed.value.origin_date),
          linked_project_ids: coerceStringArray(parsed.value.linked_project_ids),
          linked_goal_ids: coerceStringArray(parsed.value.linked_goal_ids),
          odyssey_paths: Array.isArray(parsed.value.odyssey_paths) ? parsed.value.odyssey_paths : [],
          ...(Object.prototype.hasOwnProperty.call(parsed.value, 'life_wall')
            ? { life_wall: parsed.value.life_wall }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(parsed.value, 'apst_focus')
            ? { apst_focus: sanitizeApstFocus(parsed.value.apst_focus) }
            : {}),
          ...(marking
            ? {
                kind: 'marking_shadow',
                marking,
                due_date: marking.return_by,
                estimated_duration: marking.scripts * (marking.minutes_per_script ?? 10)
              }
            : {})
        };
        await setJSON(store, taskKey(id), task);
        const ids = await readTaskIndex(store);
        await writeTaskIndex(store, [...ids, id]);
        return withCors(okResponse(201, task), request, env);
      }

      if (request.method === 'PATCH' || request.method === 'DELETE') {
        const id = readTaskId(request);
        if (!id) {
          return withCors(errorResponse(400, 'missing_id', 'id query param required', false), request, env);
        }
        const existing = await getJSON(store, taskKey(id));
        if (!isTaskDomainRecord(existing)) {
          return withCors(errorResponse(404, 'not_found', 'Task not found', false), request, env);
        }
        if (request.method === 'DELETE') {
          await deleteKey(store, taskKey(id));
          const ids = (await readTaskIndex(store)).filter(item => item !== id);
          await writeTaskIndex(store, ids);
          return withCors(okResponse(200, { id, deleted: true }), request, env);
        }
        const parsed = await readJsonObject(request);
        if (parsed.error) return withCors(parsed.error, request, env);
        const wall = applyLifeWall(parsed.value);
        if (!wall.ok) {
          return withCors(errorResponse(400, 'validation_error', wall.error, false), request, env);
        }
        const marking = readMarking(parsed.value.marking);
        if (marking === undefined) {
          return withCors(errorResponse(400, 'validation_error', 'marking shadow needs a class, script count, and dates', false), request, env);
        }
        const merged = mergeTask(existing, parsed.value);
        if (Object.prototype.hasOwnProperty.call(parsed.value, 'apst_focus')) {
          merged.apst_focus = sanitizeApstFocus(parsed.value.apst_focus);
        }
        if (marking) {
          merged.marking = marking;
          merged.kind = merged.kind === 'step' ? 'step' : 'marking_shadow';
          merged.due_date = marking.return_by;
          merged.estimated_duration = marking.scripts * (marking.minutes_per_script ?? 10);
        }
        const next = normalizeTaskRecord(applyDueDatePriorityFloor(merged, parsed.value));
        await setJSON(store, taskKey(id), next);
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

export default createTasksHandler();
