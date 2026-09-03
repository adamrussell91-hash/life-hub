import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import {
  assembleDumpResult,
  backlogTitles,
  buildProposal,
  CLARE_CALIBRATION_PREFIX,
  CLARE_CALIBRATIONS_INDEX,
  CLARE_DOMAINS,
  CLARE_NEGOTIATION_PREFIX,
  DEFAULT_FRAMEWORKS,
  emptyCalibration,
  FRAMEWORK_PREFIX,
  recordActualSample,
  recordNegotiationSample
} from './_shared/clare.mjs';
import { HUB_TZ } from './_shared/clare-dates.mjs';
import { buildClareBriefing } from './_shared/clare-desk.mjs';
import { parseBrainDump, resolveDuplicateFollowUp } from './_shared/clare-dump.mjs';
import {
  applyRecordPatch,
  mutationLabel,
  parseAgentMutations
} from './_shared/clare-mutations.mjs';
import {
  CLARE_ADHD_PROTOCOLS,
  CLARE_PROTOCOLS,
  readProtocolId
} from './_shared/clare-protocols.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import {
  defaultGetTasksStore,
  getJSON,
  listJSON,
  newRecordId,
  newTaskId,
  readIndex,
  setJSON,
  TASK_PREFIX,
  taskKey,
  writeIndex,
  writeTaskIndex
} from './_shared/tasks-blobs.mjs';

const PROJECT_PREFIX = 'projects/';
const MAP_PREFIX = 'maps/';

export const config = { path: '/api/clare' };

function calibrationKey(domain) {
  return `${CLARE_CALIBRATION_PREFIX}${domain}`;
}

async function loadCalibration(store, domain, nowIso) {
  const existing = await getJSON(store, calibrationKey(domain));
  if (existing && typeof existing === 'object' && !Array.isArray(existing)) return existing;
  return emptyCalibration(domain, nowIso);
}

async function loadFrameworks(store) {
  const stored = await listJSON(store, FRAMEWORK_PREFIX);
  return stored.length ? stored : DEFAULT_FRAMEWORKS;
}

function createTaskFromProposal(proposal, acceptedMinutes, frameworkId, timestamp) {
  return {
    schema_version: 1,
    id: newTaskId(),
    title: proposal.title,
    description: proposal.description ?? '',
    kind: 'task',
    bucket: 'active',
    domain: proposal.domain,
    status: 'open',
    priority: proposal.priority ?? 'medium',
    parent_project_id: proposal.parent_project_id ?? null,
    due_date: proposal.due_date ?? null,
    framework_used: frameworkId ?? proposal.framework_id,
    estimated_duration: acceptedMinutes,
    tags: proposal.dump_kind === 'communication' ? ['clare', 'comms'] : ['clare'],
    created_at: timestamp,
    updated_at: timestamp,
    completed_at: null,
    source: 'suggested_by_agent'
  };
}

async function acceptOne(store, { proposal, accepted_minutes, framework_id }, nowIso) {
  if (!proposal || typeof proposal !== 'object' || !CLARE_DOMAINS.has(proposal.domain)) {
    throw Object.assign(new Error('proposal with a valid domain is required'), { status: 400, code: 'validation_error' });
  }
  const accepted = Number(accepted_minutes);
  if (!Number.isFinite(accepted) || accepted <= 0) {
    throw Object.assign(new Error('accepted_minutes must be a positive number'), { status: 400, code: 'validation_error' });
  }
  const task = createTaskFromProposal(proposal, accepted, framework_id, nowIso);
  await setJSON(store, taskKey(task.id), task);
  const ids = await readIndex(store, 'tasks/_index');
  await writeTaskIndex(store, [...ids, task.id]);

  const negotiation = {
    schema_version: 1,
    id: newRecordId('cnl'),
    task_id: task.id,
    domain: proposal.domain,
    framework_id: framework_id ?? proposal.framework_id ?? null,
    proposed_minutes: Number(proposal.proposed_minutes) || accepted,
    accepted_minutes: accepted,
    reasoning: typeof proposal.reasoning === 'string' ? proposal.reasoning : '',
    created_at: nowIso
  };
  await setJSON(store, `${CLARE_NEGOTIATION_PREFIX}${negotiation.id}`, negotiation);

  let calibration = await loadCalibration(store, proposal.domain, nowIso);
  calibration = recordNegotiationSample(
    calibration,
    negotiation.proposed_minutes,
    accepted,
    nowIso
  );
  await setJSON(store, calibrationKey(proposal.domain), calibration);
  const calIds = await readIndex(store, CLARE_CALIBRATIONS_INDEX);
  if (!calIds.includes(proposal.domain)) {
    await writeIndex(store, CLARE_CALIBRATIONS_INDEX, [...calIds, proposal.domain]);
  }
  return { task, negotiation, calibration };
}

export function createClareHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const nowIso = new Date().toISOString();
    try {
      if (request.method === 'GET') {
        const domain = new URL(request.url).searchParams.get('domain');
        if (domain) {
          if (!CLARE_DOMAINS.has(domain)) {
            return withCors(errorResponse(400, 'validation_error', 'domain is invalid', false), request, env);
          }
          return withCors(
            okResponse(200, { calibration: await loadCalibration(store, domain, nowIso) }),
            request,
            env
          );
        }
        const calibrations = await listJSON(store, CLARE_CALIBRATION_PREFIX);
        return withCors(okResponse(200, {
          calibrations,
          protocols: CLARE_PROTOCOLS,
          adhd_protocols: CLARE_ADHD_PROTOCOLS
        }), request, env);
      }

      if (request.method !== 'POST') {
        return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
      }

      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      const body = parsed.value;
      const action = body.action;

      if (action === 'propose') {
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        const domain = typeof body.domain === 'string' ? body.domain : '';
        if (!title || !CLARE_DOMAINS.has(domain)) {
          return withCors(
            errorResponse(400, 'validation_error', 'title and a valid domain are required', false),
            request,
            env
          );
        }
        const [frameworks, tasks, calibration] = await Promise.all([
          loadFrameworks(store),
          listJSON(store, TASK_PREFIX),
          loadCalibration(store, domain, nowIso)
        ]);
        const proposal = buildProposal(
          {
            title,
            domain,
            description: typeof body.description === 'string' ? body.description : '',
            priority: typeof body.priority === 'string' ? body.priority : 'medium',
            due_date: body.due_date ?? null,
            parent_project_id: typeof body.parent_project_id === 'string' ? body.parent_project_id : null,
            protocol_id: readProtocolId(body.protocol_id),
            backlog_titles: backlogTitles(tasks)
          },
          frameworks,
          calibration.sample_count > 0 ? calibration : null
        );
        return withCors(okResponse(200, proposal), request, env);
      }

      if (action === 'brief') {
        const tasks = await listJSON(store, TASK_PREFIX);
        return withCors(
          okResponse(200, buildClareBriefing(tasks, readProtocolId(body.protocol_id), new Date(nowIso))),
          request,
          env
        );
      }

      if (action === 'dump') {
        const text = typeof body.text === 'string' ? body.text : '';
        const domain = CLARE_DOMAINS.has(body.domain) ? body.domain : 'teaching';
        const protocolId = readProtocolId(body.protocol_id);
        const agent = typeof body.agent_slug === 'string' && body.agent_slug ? body.agent_slug : 'clare';
        const followUp = resolveDuplicateFollowUp(text, body.recent_thread);
        if (followUp?.action === 'leave') {
          return withCors(okResponse(200, {
            voice: `Leaving “${followUp.title}” as is.`,
            proposals: [],
            questions: [],
            notes: [],
            toolkit: null,
            mutations: [],
            agent
          }), request, env);
        }
        const [frameworks, tasks, projects, calibrations] = await Promise.all([
          loadFrameworks(store),
          listJSON(store, TASK_PREFIX),
          listJSON(store, PROJECT_PREFIX),
          listJSON(store, CLARE_CALIBRATION_PREFIX)
        ]);
        const byDomain = new Map(calibrations.map(item => [item.domain, item]));
        const items = parseBrainDump(followUp?.action === 'make_new' ? followUp.title : text, {
          now: new Date(nowIso),
          timezone: HUB_TZ,
          preferredDomain: domain,
          tasks,
          projects,
          forceNewTitles: followUp?.action === 'make_new' || Boolean(body.force_new_titles)
        });
        return withCors(okResponse(200, assembleDumpResult(
          items,
          frameworks,
          itemDomain => {
            const calibration = byDomain.get(itemDomain);
            return calibration && calibration.sample_count > 0 ? calibration : null;
          },
          protocolId,
          agent
        )), request, env);
      }

      if (action === 'apply_mutations') {
        const mutations = parseAgentMutations(body.mutations);
        const results = [];
        for (const mutation of mutations) {
          try {
            if (mutation.kind === 'task_update') {
              const existing = await getJSON(store, taskKey(mutation.task_id));
              if (!existing || typeof existing !== 'object') {
                results.push({ summary: mutation.summary, ok: false, note: 'Task not found' });
                continue;
              }
              await setJSON(store, taskKey(mutation.task_id), applyRecordPatch(existing, mutation.patch, nowIso));
              results.push({ summary: mutation.summary, ok: true, note: mutationLabel(mutation) });
              continue;
            }
            if (mutation.kind === 'project_update' || (mutation.kind === 'page_blocks' && mutation.entity_type === 'project')) {
              const id = mutation.project_id ?? mutation.entity_id;
              const existing = await getJSON(store, `${PROJECT_PREFIX}${id}`);
              if (!existing || typeof existing !== 'object') {
                results.push({ summary: mutation.summary, ok: false, note: 'Project not found' });
                continue;
              }
              const patch = mutation.kind === 'page_blocks' ? { page_blocks: mutation.page_blocks } : mutation.patch;
              await setJSON(store, `${PROJECT_PREFIX}${id}`, applyRecordPatch(existing, patch, nowIso));
              results.push({ summary: mutation.summary, ok: true, note: mutationLabel(mutation) });
              continue;
            }
            if (mutation.kind === 'page_blocks') {
              const existing = await getJSON(store, taskKey(mutation.entity_id));
              if (!existing || typeof existing !== 'object') {
                results.push({ summary: mutation.summary, ok: false, note: 'Task not found' });
                continue;
              }
              await setJSON(store, taskKey(mutation.entity_id), applyRecordPatch(existing, { page_blocks: mutation.page_blocks }, nowIso));
              results.push({ summary: mutation.summary, ok: true, note: mutationLabel(mutation) });
              continue;
            }
            if (mutation.kind === 'map_update') {
              const existing = await getJSON(store, `${MAP_PREFIX}${mutation.map_id}`);
              if (!existing || typeof existing !== 'object') {
                results.push({ summary: mutation.summary, ok: false, note: 'Map not found' });
                continue;
              }
              await setJSON(store, `${MAP_PREFIX}${mutation.map_id}`, applyRecordPatch(existing, mutation.patch, nowIso));
              results.push({ summary: mutation.summary, ok: true, note: mutationLabel(mutation) });
              continue;
            }
            results.push({ summary: mutation.summary, ok: false, note: 'Unsupported mutation' });
          } catch (error) {
            results.push({ summary: mutation.summary, ok: false, note: error.message });
          }
        }
        return withCors(okResponse(200, { results }), request, env);
      }

      if (action === 'accept') {
        const result = await acceptOne(store, {
          proposal: body.proposal,
          accepted_minutes: body.accepted_minutes,
          framework_id: body.framework_id
        }, nowIso);
        return withCors(okResponse(201, result), request, env);
      }

      if (action === 'accept_batch') {
        const items = Array.isArray(body.items) ? body.items : [];
        const tasks = [];
        const negotiations = [];
        const calibrations = [];
        for (const item of items) {
          const result = await acceptOne(store, item, nowIso);
          tasks.push(result.task);
          negotiations.push(result.negotiation);
          calibrations.push(result.calibration);
        }
        return withCors(okResponse(201, { tasks, negotiations, calibrations }), request, env);
      }

      if (action === 'record_actual') {
        const taskId = typeof body.task_id === 'string' ? body.task_id : '';
        const actual = Number(body.actual_minutes);
        if (!taskId || !Number.isFinite(actual) || actual <= 0) {
          return withCors(
            errorResponse(400, 'validation_error', 'task_id and actual_minutes are required', false),
            request,
            env
          );
        }
        const existing = await getJSON(store, taskKey(taskId));
        if (!existing || typeof existing !== 'object') {
          return withCors(errorResponse(404, 'not_found', 'Task not found', false), request, env);
        }
        const task = {
          ...existing,
          actual_duration: actual,
          status: 'done',
          completed_at: nowIso,
          updated_at: nowIso
        };
        await setJSON(store, taskKey(taskId), task);
        if (!task.estimated_duration) {
          return withCors(okResponse(200, { task, calibration: null }), request, env);
        }
        let calibration = await loadCalibration(store, task.domain, nowIso);
        calibration = recordActualSample(calibration, task.estimated_duration, actual, nowIso);
        await setJSON(store, calibrationKey(task.domain), calibration);
        return withCors(okResponse(200, { task, calibration }), request, env);
      }

      return withCors(errorResponse(400, 'unknown_action', 'Unknown clare action', false), request, env);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 400;
      const code = typeof error?.code === 'string' ? error.code : 'bad_request';
      return withCors(errorResponse(status, code, error.message, false), request, env);
    }
  }, {
    ...deps,
    unboundCode: deps.unboundCode ?? 'tasks_blobs_unbound',
    unboundMessage: deps.unboundMessage ?? 'Tasks content store is not bound.',
    getContentStore: deps.getContentStore ?? defaultGetTasksStore
  });
}

export default createClareHandler();
