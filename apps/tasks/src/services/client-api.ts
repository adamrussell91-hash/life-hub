import { ApiClientError, apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/api/client';
import { getApiBaseUrl } from '@/api/config';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import {
  filterCachedTasks,
  mergeListedTasks,
  rememberCreatedTask,
  rememberDeletedTask,
  rememberUpdatedTask,
  restoreDeletedTask
} from '@/services/task-cache';
import type { TransitMap } from '@/schemas/map';
import type { Program } from '@/schemas/program';
import type {
  FrameworkEntry,
  ExcursionTemplate,
  TaskTemplate,
  ProjectTemplate
} from '@/schemas/templates';

/** Browser client that mirrors the shared TasksStore surface (Clare will use the same server store). */

async function* readClareDumpSse(body: ReadableStream<Uint8Array>): AsyncGenerator<
  | { type: 'status'; text?: string }
  | { type: 'text'; delta: string }
  | { type: 'dump_result'; result: import('@/domain/clare').ClareDumpResult }
  | { type: 'done' }
  | { type: 'error'; message: string }
> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const line = frame.split('\n').find((candidate) => candidate.startsWith('data:'));
      if (!line) continue;
      try {
        yield JSON.parse(line.slice(5).trim());
      } catch {
        // Skip malformed frames.
      }
    }
  }
}

export const tasksApi = {
  listTasks: () => apiGet<{ tasks: Task[] }>('/api/tasks').then((r) => mergeListedTasks(r.tasks)),
  getTask: (id: string) =>
    apiGet<Task>(`/api/tasks?id=${encodeURIComponent(id)}`).then((task) => {
      rememberUpdatedTask(task);
      return task;
    }),
  createTask: (body: unknown) =>
    apiPost<Task>('/api/tasks', body).then((task) => {
      rememberCreatedTask(task);
      return task;
    }),
  updateTask: (id: string, body: unknown) =>
    apiPatch<Task>(`/api/tasks?id=${encodeURIComponent(id)}`, body).then((task) => {
      rememberUpdatedTask(task);
      return task;
    }),
  deleteTask: async (id: string, meta?: { agent?: string; reason?: string }) => {
    rememberDeletedTask(id);
    try {
      return await apiDelete<{ deleted: boolean }>(
        `/api/tasks?id=${encodeURIComponent(id)}`,
        meta
      );
    } catch (err) {
      restoreDeletedTask(id);
      throw err;
    }
  },

  listProjects: () => apiGet<{ projects: Project[] }>('/api/projects').then((r) => r.projects),
  getProject: (id: string) => apiGet<Project>(`/api/projects?id=${encodeURIComponent(id)}`),
  createProject: (body: unknown) => apiPost<Project>('/api/projects', body),
  updateProject: (id: string, body: unknown) =>
    apiPatch<Project>(`/api/projects?id=${encodeURIComponent(id)}`, body),
  deleteProject: (id: string, meta?: { agent?: string; reason?: string }) =>
    apiDelete<{ deleted: boolean }>(`/api/projects?id=${encodeURIComponent(id)}`, meta),

  listTemplates: () =>
    apiGet<{
      frameworks: FrameworkEntry[];
      excursion_templates: ExcursionTemplate[];
      task_templates: TaskTemplate[];
      project_templates: ProjectTemplate[];
    }>('/api/templates'),

  saveTaskAsTemplate: (task_id: string, name: string) =>
    apiPost<TaskTemplate>('/api/templates', { action: 'save_task_as_template', task_id, name }),

  createTaskFromTemplate: (template_id: string, overrides?: unknown) =>
    apiPost<Task>('/api/templates', {
      action: 'create_task_from_template',
      template_id,
      overrides
    }),

  createProjectFromTemplate: (template_id: string, overrides?: unknown) =>
    apiPost<Project>('/api/templates', {
      action: 'create_project_from_template',
      template_id,
      overrides
    }),

  createExcursionFromTemplate: (input: {
    excursion_template_id: string;
    title: string;
    event_date: string;
    student_group_reference?: string | null;
    description?: string;
  }) =>
    apiPost<{ project: Project; tasks: Task[] }>('/api/templates', {
      action: 'create_excursion_from_template',
      ...input
    }),

  proposeWithClare: (body: {
    title: string;
    domain: string;
    description?: string;
    priority?: string;
    due_date?: string | null;
    protocol_id?: import('@/domain/clare-protocols').ClareProtocolId;
  }) => apiPost<import('@/domain/clare').ClareProposal>('/api/clare', { action: 'propose', ...body }),

  briefWithClare: (protocol_id?: import('@/domain/clare-protocols').ClareProtocolId) =>
    apiPost<import('@/domain/clare-desk').ClareBriefing>('/api/clare', {
      action: 'brief',
      protocol_id
    }),

  processDumpWithClare: (body: {
    text: string;
    domain?: string;
    protocol_id?: import('@/domain/clare-protocols').ClareProtocolId;
    recent_thread?: Array<{ role: 'user' | 'assistant'; text: string }>;
    agent_slug?: import('@/domain/agent-protocol').AgentProtocolSlug;
  }) =>
    apiPost<import('@/domain/clare').ClareDumpResult>('/api/clare', { action: 'dump', ...body }),

  streamDumpWithClare: async function* (body: {
    text: string;
    domain?: string;
    protocol_id?: import('@/domain/clare-protocols').ClareProtocolId;
    recent_thread?: Array<{ role: 'user' | 'assistant'; text: string }>;
    agent_slug?: import('@/domain/agent-protocol').AgentProtocolSlug;
  }) {
    const url = `${getApiBaseUrl()}/api/clare`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'dump_stream', ...body })
      });
    } catch (cause) {
      const raw = cause instanceof Error ? cause.message : 'Network request failed';
      throw new ApiClientError({ code: 'network_error', message: raw });
    }
    if (!response.ok) {
      let message = `Dump stream failed (HTTP ${response.status})`;
      try {
        const payload = await response.json();
        if (payload?.error?.message) message = payload.error.message;
      } catch {
        /* ignore */
      }
      throw new ApiClientError({ code: 'request_failed', message }, response.status);
    }
    if (!response.body) {
      throw new ApiClientError({ code: 'invalid_response', message: 'Dump stream had no body' }, response.status);
    }
    yield* readClareDumpSse(response.body);
  },

  applyAgentMutations: (mutations: import('@/domain/agent-mutations').AgentMutation[]) =>
    apiPost<{ results: Array<{ summary: string; ok: boolean; note: string }> }>('/api/clare', {
      action: 'apply_mutations',
      mutations
    }),

  acceptClareProposal: (body: {
    proposal: import('@/domain/clare').ClareProposal;
    accepted_minutes: number;
    framework_id?: string;
  }) =>
    apiPost<{
      task: Task;
      negotiation: import('@/schemas/clare').ClareNegotiationLog;
      calibration: import('@/schemas/clare').ClareCalibration;
    }>('/api/clare', { action: 'accept', ...body }),

  acceptClareBatch: (
    items: Array<{
      proposal: import('@/domain/clare').ClareProposal;
      accepted_minutes: number;
      framework_id?: string;
    }>
  ) =>
    apiPost<{
      tasks: Task[];
      negotiations: import('@/schemas/clare').ClareNegotiationLog[];
      calibrations: import('@/schemas/clare').ClareCalibration[];
    }>('/api/clare', { action: 'accept_batch', items }),

  recordClareActual: (task_id: string, actual_minutes: number) =>
    apiPost<{ task: Task; calibration: import('@/schemas/clare').ClareCalibration | null }>(
      '/api/clare',
      { action: 'record_actual', task_id, actual_minutes }
    ),

  listClareCalibrations: () =>
    apiGet<{ calibrations: import('@/schemas/clare').ClareCalibration[] }>('/api/clare').then(
      (r) => r.calibrations
    ),

  flagStalledProjects: (weeks?: number) =>
    apiPost<{ flagged: Project[]; candidates: number }>('/api/stall', {
      action: 'flag_stalled',
      weeks
    }),

  resolveStalledProject: (input: {
    project_id: string;
    outcome: 'revived' | 'frankensteined' | 'buried';
    reason: string;
    merge_into_project_id?: string | null;
  }) =>
    apiPost<{
      project: Project;
      review: import('@/schemas/templates').ReviewLog;
      moved_task_ids: string[];
    }>('/api/stall', { action: 'resolve', ...input }),

  listStressFlags: () =>
    apiGet<{
      flags: import('@/schemas/stress').StressFlag[];
      judgment?: import('@/domain/intuitive-scan').IntuitiveScanMeta | null;
    }>('/api/stress-flags').then((r) => r.flags),

  loadStressFlags: () =>
    apiGet<{
      flags: import('@/schemas/stress').StressFlag[];
      judgment: import('@/domain/intuitive-scan').IntuitiveScanMeta | null;
    }>('/api/stress-flags').then((r) => ({
      flags: r.flags,
      judgment: r.judgment ?? null
    })),

  listAgentInbox: (inbox: string) =>
    apiGet<{ flags: import('@/schemas/stress').StressFlag[]; inbox: string }>(
      `/api/stress-flags?inbox=${encodeURIComponent(inbox)}`
    ).then((r) => r.flags),

  scanStressFlags: () =>
    apiPost<{
      raised: import('@/schemas/stress').StressFlag[];
      skipped: number;
      patterns: number;
    }>('/api/stress-flags', { action: 'scan' }),

  scanIntuitiveFlags: () =>
    apiPost<{
      raised: import('@/schemas/stress').StressFlag[];
      skipped: number;
      judged: number;
      model: string | null;
      ran_at: string;
      skipped_ai: boolean;
      reason: string | null;
    }>('/api/stress-flags', { action: 'intuitive_scan' }),

  raiseStressFlag: (body: {
    pattern_description: string;
    pattern_kind?: string;
    source_project_or_task_id?: string | null;
    fingerprint?: string;
  }) =>
    apiPost<import('@/schemas/stress').StressFlag>('/api/stress-flags', {
      action: 'raise',
      ...body
    }),

  getCapacity: () =>
    apiGet<{
      snapshot: import('@/domain/capacity').CapacitySnapshot;
      share: import('@/schemas/capacity').CapacityShare | null;
    }>('/api/capacity'),

  ensureCapacityShare: () =>
    apiPost<{ share: import('@/schemas/capacity').CapacityShare }>('/api/capacity', {
      action: 'ensure_share'
    }),

  rotateCapacityShare: () =>
    apiPost<{ share: import('@/schemas/capacity').CapacityShare }>('/api/capacity', {
      action: 'rotate_share'
    }),

  getPublicCapacity: (token: string) =>
    apiGet<{
      generated_at: string;
      headlines: string[];
      overall: import('@/domain/capacity').CapacityLevel;
      days: Array<{
        date_key: string;
        weekday: string;
        level: import('@/domain/capacity').CapacityLevel;
      }>;
    }>(`/api/capacity?token=${encodeURIComponent(token)}`),

  /** Shared by the stall review loop and Corey's closure loop (same ReviewLog store). */
  listReviewLogs: () =>
    apiGet<{ reviews: import('@/schemas/templates').ReviewLog[] }>('/api/reviews').then(
      (r) => r.reviews
    ),

  getProjectVariance: (project_id: string) =>
    apiGet<{ variance: import('@/domain/closure').ProjectVariance }>(
      `/api/reviews?project_id=${encodeURIComponent(project_id)}`
    ).then((r) => r.variance),

  closeProject: (project_id: string, reason: string) =>
    apiPost<{
      project: Project;
      review: import('@/schemas/templates').ReviewLog;
      variance: import('@/domain/closure').ProjectVariance;
    }>('/api/reviews', { action: 'close', project_id, reason }),

  search: (q: string) =>
    apiGet<{ tasks: Task[]; projects: Project[] }>(`/api/search?q=${encodeURIComponent(q)}`).then(
      (r) => ({ ...r, tasks: filterCachedTasks(r.tasks) })
    ),

  listMaps: () => apiGet<{ maps: TransitMap[] }>('/api/maps').then((r) => r.maps),
  getMap: (id: string) => apiGet<TransitMap>(`/api/maps?id=${encodeURIComponent(id)}`),
  createMap: (body: unknown) => apiPost<TransitMap>('/api/maps', body),
  updateMap: (id: string, body: unknown) =>
    apiPatch<TransitMap>(`/api/maps?id=${encodeURIComponent(id)}`, body),
  deleteMap: (id: string) => apiDelete<{ deleted: boolean }>(`/api/maps?id=${encodeURIComponent(id)}`),

  listPrograms: () => apiGet<{ programs: Program[] }>('/api/programs').then((r) => r.programs),
  getProgram: (id: string) => apiGet<Program>(`/api/programs?id=${encodeURIComponent(id)}`),
  createProgram: (body: unknown) => apiPost<Program>('/api/programs', body),
  updateProgram: (id: string, body: unknown) =>
    apiPatch<Program>(`/api/programs?id=${encodeURIComponent(id)}`, body),
  deleteProgram: (id: string) =>
    apiDelete<{ deleted: boolean }>(`/api/programs?id=${encodeURIComponent(id)}`),

  listAreas: () => apiGet<{ areas: import('@/schemas/area').Area[] }>('/api/areas').then((r) => r.areas),
  getArea: (id: string) => apiGet<import('@/schemas/area').Area>(`/api/areas?id=${encodeURIComponent(id)}`),
  createArea: (body: unknown) => apiPost<import('@/schemas/area').Area>('/api/areas', body),
  updateArea: (id: string, body: unknown) =>
    apiPatch<import('@/schemas/area').Area>(`/api/areas?id=${encodeURIComponent(id)}`, body),
  deleteArea: (id: string) => apiDelete<{ deleted: boolean }>(`/api/areas?id=${encodeURIComponent(id)}`),

  listGoals: () => apiGet<{ goals: import('@/schemas/goal').Goal[] }>('/api/goals').then((r) => r.goals),
  getGoal: (id: string) => apiGet<import('@/schemas/goal').Goal>(`/api/goals?id=${encodeURIComponent(id)}`),
  createGoal: (body: unknown) => apiPost<import('@/schemas/goal').Goal>('/api/goals', body),
  updateGoal: (id: string, body: unknown) =>
    apiPatch<import('@/schemas/goal').Goal>(`/api/goals?id=${encodeURIComponent(id)}`, body),
  deleteGoal: (id: string) => apiDelete<{ deleted: boolean }>(`/api/goals?id=${encodeURIComponent(id)}`),

  getTaskProperties: () => apiGet<import('@/schemas/task-properties').TaskPropertyConfig>('/api/task-properties'),
  updateTaskProperties: (body: import('@/schemas/task-properties').TaskPropertyConfig) =>
    apiPut<import('@/schemas/task-properties').TaskPropertyConfig>('/api/task-properties', body)
};
