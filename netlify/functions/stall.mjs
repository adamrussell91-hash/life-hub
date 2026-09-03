import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import {
  DEFAULT_STALL_WEEKS,
  findStallCandidates,
  outcomeProjectStatus,
  STALL_OUTCOMES
} from './_shared/tasks-stall.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import {
  defaultGetTasksStore,
  getJSON,
  listJSON,
  newRecordId,
  readIndex,
  setJSON,
  TASK_PREFIX,
  taskKey,
  writeIndex
} from './_shared/tasks-blobs.mjs';

export const config = { path: '/api/stall' };

const PROJECT_PREFIX = 'projects/';
const REVIEW_PREFIX = 'review_logs/';
const REVIEW_INDEX = 'review_logs/_index';

function projectKey(id) {
  return `${PROJECT_PREFIX}${id}`;
}

export function createStallHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const nowIso = new Date().toISOString();
    try {
      if (request.method === 'GET') {
        const reviews = await listJSON(store, REVIEW_PREFIX);
        return withCors(okResponse(200, { reviews }), request, env);
      }
      if (request.method !== 'POST') {
        return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
      }

      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      const body = parsed.value;

      if (body.action === 'flag_stalled') {
        const weeks = Number.isFinite(Number(body.weeks)) ? Number(body.weeks) : DEFAULT_STALL_WEEKS;
        const [projects, tasks] = await Promise.all([
          listJSON(store, PROJECT_PREFIX),
          listJSON(store, TASK_PREFIX)
        ]);
        const candidates = findStallCandidates(projects, tasks, new Date(nowIso), weeks);
        const flagged = [];
        for (const candidate of candidates) {
          if (candidate.project.status === 'stalled') {
            flagged.push(candidate.project);
            continue;
          }
          const updated = {
            ...candidate.project,
            status: 'stalled',
            stall_flagged_at: nowIso,
            updated_at: nowIso
          };
          await setJSON(store, projectKey(updated.id), updated);
          flagged.push(updated);
        }
        return withCors(okResponse(200, { flagged, candidates: candidates.length }), request, env);
      }

      if (body.action === 'resolve') {
        const projectId = typeof body.project_id === 'string' ? body.project_id : '';
        const outcome = body.outcome;
        const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
        if (!projectId || !STALL_OUTCOMES.has(outcome) || !reason) {
          return withCors(
            errorResponse(400, 'validation_error', 'project_id, outcome, and reason are required', false),
            request,
            env
          );
        }
        const existing = await getJSON(store, projectKey(projectId));
        if (!existing || typeof existing !== 'object') {
          return withCors(errorResponse(404, 'not_found', 'Project not found', false), request, env);
        }

        const moved_task_ids = [];
        if (outcome === 'frankensteined') {
          const targetId = typeof body.merge_into_project_id === 'string' ? body.merge_into_project_id : '';
          if (!targetId || targetId === projectId) {
            return withCors(
              errorResponse(400, 'validation_error', 'Frankenstein needs a different merge target project', false),
              request,
              env
            );
          }
          const target = await getJSON(store, projectKey(targetId));
          if (!target || target.status === 'archived_dead') {
            return withCors(errorResponse(400, 'validation_error', 'Merge target project not found or archived', false), request, env);
          }
          const tasks = await listJSON(store, TASK_PREFIX);
          for (const task of tasks) {
            if (task.parent_project_id !== existing.id) continue;
            await setJSON(store, taskKey(task.id), {
              ...task,
              parent_project_id: targetId,
              updated_at: nowIso
            });
            moved_task_ids.push(task.id);
          }
        }

        const project = {
          ...existing,
          status: outcomeProjectStatus(outcome),
          stall_flagged_at: outcome === 'revived' ? null : (existing.stall_flagged_at ?? nowIso),
          review_summary: reason,
          updated_at: nowIso
        };
        await setJSON(store, projectKey(project.id), project);

        const review = {
          schema_version: 1,
          id: newRecordId('rev'),
          project_id: project.id,
          outcome,
          reason,
          merge_into_project_id: outcome === 'frankensteined' ? (body.merge_into_project_id ?? null) : null,
          created_at: nowIso
        };
        await setJSON(store, `${REVIEW_PREFIX}${review.id}`, review);
        const ids = await readIndex(store, REVIEW_INDEX);
        await writeIndex(store, REVIEW_INDEX, [...ids, review.id]);
        return withCors(okResponse(200, { project, review, moved_task_ids }), request, env);
      }

      return withCors(errorResponse(400, 'unknown_action', 'Unknown stall action', false), request, env);
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

export default createStallHandler();
