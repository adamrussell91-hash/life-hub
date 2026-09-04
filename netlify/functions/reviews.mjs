import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { computeProjectVariance, deriveProjectEndDate } from './_shared/tasks-closure.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import {
  defaultGetTasksStore,
  getJSON,
  listJSON,
  newRecordId,
  readIndex,
  setJSON,
  TASK_PREFIX,
  writeIndex
} from './_shared/tasks-blobs.mjs';

export const config = { path: '/api/reviews' };

const PROJECT_PREFIX = 'projects/';
const REVIEW_PREFIX = 'review_logs/';
const REVIEW_INDEX = 'review_logs/_index';
const AGENT_ACTION_PREFIX = 'agent_actions/';

function projectKey(id) {
  return `${PROJECT_PREFIX}${id}`;
}

export function createReviewsHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const nowIso = new Date().toISOString();
    try {
      if (request.method === 'GET') {
        const projectId = new URL(request.url).searchParams.get('project_id');
        if (projectId) {
          const project = await getJSON(store, projectKey(projectId));
          if (!project || typeof project !== 'object') {
            return withCors(errorResponse(404, 'not_found', 'Project not found', false), request, env);
          }
          const tasks = await listJSON(store, TASK_PREFIX);
          return withCors(
            okResponse(200, { variance: computeProjectVariance(project, tasks) }),
            request,
            env
          );
        }
        const reviews = await listJSON(store, REVIEW_PREFIX);
        return withCors(okResponse(200, { reviews }), request, env);
      }

      if (request.method !== 'POST') {
        return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
      }

      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      const body = parsed.value;

      if (body.action !== 'close') {
        return withCors(errorResponse(400, 'unknown_action', 'Unknown reviews action', false), request, env);
      }

      const projectId = typeof body.project_id === 'string' ? body.project_id : '';
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (!projectId || !reason) {
        return withCors(
          errorResponse(400, 'validation_error', 'project_id and a short retrospective are required', false),
          request,
          env
        );
      }

      const existing = await getJSON(store, projectKey(projectId));
      if (!existing || typeof existing !== 'object') {
        return withCors(errorResponse(404, 'not_found', 'Project not found', false), request, env);
      }
      if (existing.status === 'archived_dead') {
        return withCors(errorResponse(400, 'validation_error', 'Project already closed', false), request, env);
      }

      const tasks = await listJSON(store, TASK_PREFIX);
      const derived = deriveProjectEndDate(existing, tasks);
      const variance = computeProjectVariance({ ...existing, current_end_date: derived }, tasks);
      const project = {
        ...existing,
        status: 'archived_dead',
        current_end_date: derived,
        review_summary: reason,
        updated_at: nowIso
      };
      await setJSON(store, projectKey(project.id), project);

      const review = {
        schema_version: 1,
        id: newRecordId('rev'),
        project_id: project.id,
        outcome: 'closed',
        reason,
        merge_into_project_id: null,
        baseline_end_date: project.baseline_end_date ?? null,
        current_end_date: project.current_end_date ?? null,
        slip_days: variance.slip_days,
        created_at: nowIso
      };
      await setJSON(store, `${REVIEW_PREFIX}${review.id}`, review);
      const ids = await readIndex(store, REVIEW_INDEX);
      await writeIndex(store, REVIEW_INDEX, [...ids, review.id]);

      const logId = newRecordId('aal');
      await setJSON(store, `${AGENT_ACTION_PREFIX}${logId}`, {
        schema_version: 1,
        id: logId,
        agent: 'Clare DeMind',
        action: 'update',
        entity_type: 'project',
        entity_id: project.id,
        reason: `Closed: ${reason}`,
        created_at: nowIso
      });

      return withCors(okResponse(200, { project, review, variance }), request, env);
    } catch (error) {
      return withCors(errorResponse(400, 'bad_request', error.message, false), request, env);
    }
  }, {
    ...deps,
    unboundCode: deps.unboundCode ?? 'tasks_blobs_unbound',
    unboundMessage: deps.unboundMessage ?? 'Tasks content store is not bound.',
    getContentStore: deps.getContentStore ?? defaultGetTasksStore
  });
}

export default createReviewsHandler();
