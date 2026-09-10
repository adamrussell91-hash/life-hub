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
  getJSON,
  listJSON,
  newRecordId,
  newTaskId,
  readIndex,
  setJSON,
  taskKey,
  writeIndex,
  writeTaskIndex
} from './_shared/tasks-blobs.mjs';

export const config = { path: '/api/templates' };

const FRAMEWORK_PREFIX = 'frameworks/';
const EXCURSION_PREFIX = 'excursion_templates/';
const TASK_TEMPLATE_PREFIX = 'task_templates/';
const PROJECT_TEMPLATE_PREFIX = 'project_templates/';
const PROJECT_PREFIX = 'projects/';
const PROJECTS_INDEX = 'projects/_index';
const TASK_TEMPLATES_INDEX = 'task_templates/_index';
const PROJECT_TEMPLATES_INDEX = 'project_templates/_index';

function projectKey(id) {
  return `${PROJECT_PREFIX}${id}`;
}

export function createTemplatesHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    try {
      if (request.method === 'GET') {
        const [frameworks, excursion_templates, task_templates, project_templates] = await Promise.all([
          listJSON(store, FRAMEWORK_PREFIX),
          listJSON(store, EXCURSION_PREFIX),
          listJSON(store, TASK_TEMPLATE_PREFIX),
          listJSON(store, PROJECT_TEMPLATE_PREFIX)
        ]);
        return withCors(
          okResponse(200, { frameworks, excursion_templates, task_templates, project_templates }),
          request,
          env
        );
      }

      if (request.method !== 'POST') {
        return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
      }

      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      const body = parsed.value;
      const nowIso = new Date().toISOString();

      if (body.action === 'save_task_as_template') {
        const taskId = typeof body.task_id === 'string' ? body.task_id : '';
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!taskId || !name) {
          return withCors(errorResponse(400, 'validation_error', 'task_id and name are required', false), request, env);
        }
        const task = await getJSON(store, taskKey(taskId));
        if (!task || typeof task !== 'object') {
          return withCors(errorResponse(404, 'not_found', 'Task not found', false), request, env);
        }
        const template = {
          schema_version: 1,
          id: newRecordId('tt'),
          name,
          domain: task.domain,
          default_fields: {
            title_pattern: task.title,
            framework_used: task.framework_used ?? null,
            estimated_duration: task.estimated_duration ?? null,
            priority: task.priority ?? 'medium',
            tags: Array.isArray(task.tags) ? task.tags : []
          },
          created_from: task.id,
          created_at: nowIso
        };
        await setJSON(store, `${TASK_TEMPLATE_PREFIX}${template.id}`, template);
        const ids = await readIndex(store, TASK_TEMPLATES_INDEX);
        await writeIndex(store, TASK_TEMPLATES_INDEX, [...ids, template.id]);
        return withCors(okResponse(201, template), request, env);
      }

      if (body.action === 'save_project_as_template') {
        const projectId = typeof body.project_id === 'string' ? body.project_id : '';
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!projectId || !name) {
          return withCors(errorResponse(400, 'validation_error', 'project_id and name are required', false), request, env);
        }
        const project = await getJSON(store, projectKey(projectId));
        if (!project || typeof project !== 'object') {
          return withCors(errorResponse(404, 'not_found', 'Project not found', false), request, env);
        }
        const template = {
          schema_version: 1,
          id: newRecordId('pt'),
          name,
          type: project.type ?? 'standard',
          excursion_template_id: project.competition_or_event_type ?? null,
          default_milestones: Array.isArray(project.milestones)
            ? project.milestones.map(item => ({ title: item.title, due_date: null, status: 'open' }))
            : [],
          created_from: project.id,
          created_at: nowIso
        };
        await setJSON(store, `${PROJECT_TEMPLATE_PREFIX}${template.id}`, template);
        const ids = await readIndex(store, PROJECT_TEMPLATES_INDEX);
        await writeIndex(store, PROJECT_TEMPLATES_INDEX, [...ids, template.id]);
        return withCors(okResponse(201, template), request, env);
      }

      if (body.action === 'create_task_from_template') {
        const templateId = typeof body.template_id === 'string' ? body.template_id : '';
        const overrides = body.overrides && typeof body.overrides === 'object' ? body.overrides : {};
        const template = await getJSON(store, `${TASK_TEMPLATE_PREFIX}${templateId}`);
        if (!template || typeof template !== 'object') {
          return withCors(errorResponse(404, 'not_found', 'Task template not found', false), request, env);
        }
        const fields = template.default_fields ?? {};
        const task = {
          schema_version: 1,
          id: newTaskId(),
          title: typeof overrides.title === 'string' ? overrides.title : (fields.title_pattern ?? template.name),
          description: typeof overrides.description === 'string' ? overrides.description : '',
          kind: 'task',
          bucket: 'active',
          domain: typeof overrides.domain === 'string' ? overrides.domain : template.domain,
          status: 'open',
          priority: typeof overrides.priority === 'string' ? overrides.priority : (fields.priority ?? 'medium'),
          parent_project_id: typeof overrides.parent_project_id === 'string' ? overrides.parent_project_id : null,
          framework_used: overrides.framework_used ?? fields.framework_used ?? null,
          estimated_duration: overrides.estimated_duration ?? fields.estimated_duration ?? null,
          tags: Array.isArray(overrides.tags) ? overrides.tags : (fields.tags ?? []),
          created_at: nowIso,
          updated_at: nowIso,
          completed_at: null,
          source: 'from_template'
        };
        await setJSON(store, taskKey(task.id), task);
        const ids = await readIndex(store, 'tasks/_index');
        await writeTaskIndex(store, [...ids, task.id]);
        return withCors(okResponse(201, task), request, env);
      }

      if (body.action === 'create_project_from_template') {
        const templateId = typeof body.template_id === 'string' ? body.template_id : '';
        const overrides = body.overrides && typeof body.overrides === 'object' ? body.overrides : {};
        const template = await getJSON(store, `${PROJECT_TEMPLATE_PREFIX}${templateId}`);
        if (!template || typeof template !== 'object') {
          return withCors(errorResponse(404, 'not_found', 'Project template not found', false), request, env);
        }
        const project = {
          schema_version: 1,
          id: newRecordId('proj'),
          title: typeof overrides.title === 'string' ? overrides.title : template.name,
          description: typeof overrides.description === 'string' ? overrides.description : '',
          type: template.type ?? 'standard',
          status: 'active',
          milestones: Array.isArray(template.default_milestones)
            ? template.default_milestones.map(item => ({
              id: newRecordId('ms'),
              title: item.title ?? 'Milestone',
              due_date: item.due_date ?? null,
              status: item.status ?? 'open'
            }))
            : [],
          created_at: nowIso,
          updated_at: nowIso
        };
        await setJSON(store, projectKey(project.id), project);
        const ids = await readIndex(store, PROJECTS_INDEX);
        await writeIndex(store, PROJECTS_INDEX, [...ids, project.id]);
        return withCors(okResponse(201, project), request, env);
      }

      if (body.action === 'create_excursion_from_template') {
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        const event_date = typeof body.event_date === 'string' ? body.event_date.trim() : '';
        if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(event_date)) {
          return withCors(
            errorResponse(400, 'validation_error', 'title and event_date (YYYY-MM-DD) are required', false),
            request,
            env
          );
        }
        const project = {
          schema_version: 1,
          id: newRecordId('proj'),
          title,
          description: typeof body.description === 'string' ? body.description : '',
          type: 'excursion',
          status: 'active',
          baseline_end_date: event_date,
          current_end_date: event_date,
          competition_or_event_type: typeof body.excursion_template_id === 'string' ? body.excursion_template_id : null,
          student_group_reference: typeof body.student_group_reference === 'string' ? body.student_group_reference : null,
          milestones: [],
          generated_admin_tasks: [],
          created_at: nowIso,
          updated_at: nowIso
        };
        await setJSON(store, projectKey(project.id), project);
        const ids = await readIndex(store, PROJECTS_INDEX);
        await writeIndex(store, PROJECTS_INDEX, [...ids, project.id]);
        return withCors(okResponse(201, { project, tasks: [] }), request, env);
      }

      return withCors(errorResponse(400, 'unknown_action', 'Unknown templates action', false), request, env);
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

export default createTemplatesHandler();
