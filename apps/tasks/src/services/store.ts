import { TaskSchema, type Task, type TaskDomain } from '@/schemas/task';
import {
  TaskPropertyConfigSchema,
  validateTaskClassifierPatch,
  validateTaskPropertyConfig,
  type TaskPropertyConfig
} from '@/schemas/task-properties';
import { DEFAULT_TASK_PROPERTY_CONFIG } from '@/domain/task-properties-defaults';
import { ProjectSchema } from '@/schemas/project';
import {
  FrameworkEntrySchema,
  ExcursionTemplateSchema,
  type ExcursionTemplate,
  TaskTemplateSchema,
  ProjectTemplateSchema,
  AgentActionLogSchema,
  ReviewLogSchema
} from '@/schemas/templates';
import { ClareCalibrationSchema, ClareNegotiationLogSchema } from '@/schemas/clare';
import { DEFAULT_STRESS_ROUTE, StressFlagSchema } from '@/schemas/stress';
import { CapacityShareSchema } from '@/schemas/capacity';
import { TransitMapSchema } from '@/schemas/map';
import { ProgramSchema } from '@/schemas/program';
import { AreaSchema } from '@/schemas/area';
import { GoalSchema } from '@/schemas/goal';
import {
  advanceRecurrence,
  hasMoreOccurrences,
  nextDueDate,
  parseRecurrenceRule,
  serializeRecurrenceRule
} from '@/domain/recurrence';
import { carryReminderForward } from '@/domain/reminders';
import { mindWorks2026Map } from '@/domain/maps-seed';
import { catalogPrograms } from '@/domain/programs-seed';
import { buildExcursionPlan, excursionDatesFromAdminTask } from '@/domain/excursion';
import {
  catalogExcursionTemplates,
  resolveExcursionTemplateId
} from '@/domain/excursion-catalog';
import { addDays, backlogTasks, hubCalendarDate, toDateKey } from '@/domain/queries';
import { DEFAULT_HUB_PREFS, parseHubPrefs, resolveTimeZoneInput, type HubPrefs } from '@/domain/hub-prefs';
import {
  defaultAgentProtocol,
  isAgentProtocolSlug,
  parseAgentProtocol,
  type AgentProtocolDoc,
  type AgentProtocolSlug
} from '@/domain/agent-protocol';
import {
  affectedIdsForBlockedSince,
  reconcileBlockedSinceBatch
} from '@/domain/blocked-since';
import {
  assembleDumpResult,
  assembleJudgedDumpResult,
  buildProposal,
  emptyCalibration,
  recordActualSample,
  recordNegotiationSample,
  type ClareProposalInput
} from '@/domain/clare';
import { buildClareDumpDigest } from '@/domain/clare-digest';
import { parseBrainDump, resolveDuplicateFollowUp } from '@/domain/clare-dump';
import {
  defaultClareProposalJudge,
  type ClareProposalJudge
} from '@/ai/clare-proposal-judge';
import {
  defaultClareBriefingJudge,
  type ClareBriefingJudge
} from '@/ai/clare-briefing-judge';
import { defaultLifeContextProvider } from '@/ai/life-hub-client';
import { defaultAgentRepoClient } from '@/ai/github-repo';
import {
  mutationLabel,
  sanitizeProjectPatch,
  sanitizeTaskPatch,
  type AgentMutation
} from '@/domain/agent-mutations';
import { PageBlockSchema } from '@/schemas/page-block';
import { lifeContextToPromptBlock } from '@/domain/life-context';
import { buildClareBriefing } from '@/domain/clare-desk';
import { DEFAULT_STALL_WEEKS, findStallCandidates, outcomeProjectStatus } from '@/domain/stall';
import { agentSlug, detectStressPatterns } from '@/domain/stress';
import { buildIntuitiveDigest } from '@/domain/intuitive-digest';
import { parseIntuitiveScanMeta } from '@/domain/intuitive-scan';
import {
  defaultIntuitiveJudge,
  judgmentToPatterns,
  type IntuitiveJudge
} from '@/ai/intuitive-judge';
import { buildCapacitySnapshot, toCoreyPublicView } from '@/domain/capacity';
import { computeProjectVariance, deriveProjectEndDate } from '@/domain/closure';
import type { IndexDoc, SeedData, TasksStore } from './types';

export interface KvAdapter {
  getJSON<T>(key: string): Promise<T | null>;
  setJSON(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface KeyBuilders {
  taskKey: (id: string) => string;
  tasksIndexKey: () => string;
  projectKey: (id: string) => string;
  projectsIndexKey: () => string;
  frameworkKey: (id: string) => string;
  frameworksIndexKey: () => string;
  excursionTemplateKey: (id: string) => string;
  excursionTemplatesIndexKey: () => string;
  taskTemplateKey: (id: string) => string;
  taskTemplatesIndexKey: () => string;
  projectTemplateKey: (id: string) => string;
  projectTemplatesIndexKey: () => string;
  agentActionLogKey: (id: string) => string;
  reviewLogKey: (id: string) => string;
  reviewLogsIndexKey: () => string;
  capacityShareKey: () => string;
  intuitiveScanMetaKey: () => string;
  stressFlagKey: (id: string) => string;
  stressFlagsIndexKey: () => string;
  agentInboxKey: (agentSlug: string) => string;
  clareCalibrationKey: (domain: string) => string;
  clareCalibrationsIndexKey: () => string;
  clareNegotiationLogKey: (id: string) => string;
  metaSeededKey: () => string;
  taskPropertiesKey: () => string;
  hubPrefsKey: () => string;
  agentProtocolKey: (slug: string) => string;
  mapKey: (id: string) => string;
  mapsIndexKey: () => string;
  programKey: (id: string) => string;
  programsIndexKey: () => string;
  areaKey: (id: string) => string;
  areasIndexKey: () => string;
  goalKey: (id: string) => string;
  goalsIndexKey: () => string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

async function spawnRecurringSuccessor(
  store: TasksStore,
  completed: Task
): Promise<Task | null> {
  if (completed.kind === 'step' || completed.bucket === 'someday') return null;
  const rule = parseRecurrenceRule(completed.recurrence_rule);
  if (!rule || !hasMoreOccurrences(rule)) return null;

  const advanced = advanceRecurrence(rule);
  if (rule.count != null && advanced.completed_count >= rule.count) return null;

  const due = nextDueDate(completed.due_date, rule);
  if (!due) return null;

  const seriesId = rule.series_id ?? completed.id;
  const nextRule = serializeRecurrenceRule({ ...advanced, series_id: seriesId });

  return store.createTask({
    title: completed.title,
    description: completed.description,
    domain: completed.domain,
    kind: 'task',
    bucket: 'active',
    framework_used: completed.framework_used,
    estimated_duration: completed.estimated_duration,
    due_date: due,
    due_time: completed.due_time,
    status: 'open',
    priority: completed.priority,
    parent_project_id: completed.parent_project_id,
    depends_on: [],
    tags: completed.tags,
    recurrence_rule: nextRule,
    remind_at: carryReminderForward(completed, due),
    remind_dismissed_at: null,
    source: completed.source
  });
}

async function readIndex(kv: KvAdapter, key: string): Promise<string[]> {
  const doc = await kv.getJSON<IndexDoc>(key);
  return doc?.ids ?? [];
}

async function writeIndex(kv: KvAdapter, key: string, ids: string[]): Promise<void> {
  await kv.setJSON(key, { ids } satisfies IndexDoc);
}

async function listByIndex<T>(
  kv: KvAdapter,
  indexKey: string,
  itemKey: (id: string) => string,
  parse: (raw: unknown) => T
): Promise<T[]> {
  const ids = await readIndex(kv, indexKey);
  const items: T[] = [];
  for (const id of ids) {
    const raw = await kv.getJSON(itemKey(id));
    if (raw) items.push(parse(raw));
  }
  return items;
}

async function readTaskProperties(
  kv: KvAdapter,
  keys: KeyBuilders
): Promise<TaskPropertyConfig> {
  const raw = await kv.getJSON<TaskPropertyConfig>(keys.taskPropertiesKey());
  if (raw) return validateTaskPropertyConfig(TaskPropertyConfigSchema.parse(raw));
  const defaults = DEFAULT_TASK_PROPERTY_CONFIG;
  await kv.setJSON(keys.taskPropertiesKey(), defaults);
  return defaults;
}

function classifierDefault(
  options: { id: string }[],
  preferredId: string,
  fallbackIndex = 0
): string {
  return options.find((entry) => entry.id === preferredId)?.id ?? options[fallbackIndex]?.id ?? '';
}

async function syncExcursionTemplateCatalog(
  kv: KvAdapter,
  keys: KeyBuilders
): Promise<ExcursionTemplate[]> {
  const catalog = catalogExcursionTemplates();
  const stored = await listByIndex(
    kv,
    keys.excursionTemplatesIndexKey(),
    keys.excursionTemplateKey,
    (raw) => ExcursionTemplateSchema.parse(raw)
  );
  const catalogIds = catalog.map((item) => item.id).join(',');
  const storedIds = stored.map((item) => item.id).join(',');
  if (catalogIds === storedIds) return stored;
  for (const item of catalog) {
    await kv.setJSON(keys.excursionTemplateKey(item.id), item);
  }
  await writeIndex(
    kv,
    keys.excursionTemplatesIndexKey(),
    catalog.map((item) => item.id)
  );
  return catalog;
}

export function createTasksStore(kv: KvAdapter, keys: KeyBuilders): TasksStore {
  return {
    async listTasks() {
      return listByIndex(kv, keys.tasksIndexKey(), keys.taskKey, (raw) => TaskSchema.parse(raw));
    },
    async getTask(id) {
      const raw = await kv.getJSON(keys.taskKey(id));
      return raw ? TaskSchema.parse(raw) : null;
    },
    async createTask(input) {
      const props = await readTaskProperties(kv, keys);
      validateTaskClassifierPatch(input, props);
      const stamp = nowIso();
      const task = TaskSchema.parse({
        schema_version: 1,
        id: newId('task'),
        title: input.title,
        description: input.description ?? '',
        kind: input.kind ?? classifierDefault(props.kinds, 'task'),
        bucket: input.bucket ?? classifierDefault(props.buckets, 'active'),
        step_order: input.step_order ?? 0,
        domain: input.domain,
        framework_used: input.framework_used ?? null,
        estimated_duration: input.estimated_duration ?? null,
        actual_duration: input.actual_duration ?? null,
        due_date: input.due_date ?? null,
        created_at: stamp,
        updated_at: stamp,
        completed_at: null,
        status: input.status ?? classifierDefault(props.statuses, 'open'),
        priority: input.priority ?? classifierDefault(props.priorities, 'medium'),
        parent_project_id: input.parent_project_id ?? null,
        parent_task_id: input.parent_task_id ?? null,
        depends_on: input.depends_on ?? [],
        dependency_links: input.dependency_links,
        tags: input.tags ?? [],
        recurrence_rule: input.recurrence_rule ?? null,
        due_time: input.due_time ?? null,
        remind_at: input.remind_at ?? null,
        remind_dismissed_at: input.remind_dismissed_at ?? null,
        attachments: input.attachments ?? [],
        source: input.source ?? classifierDefault(props.sources, 'manual'),
        blocked_since: null,
        page_blocks: input.page_blocks ?? []
      });
      await kv.setJSON(keys.taskKey(task.id), task);
      const ids = await readIndex(kv, keys.tasksIndexKey());
      ids.push(task.id);
      await writeIndex(kv, keys.tasksIndexKey(), ids);
      const all = await this.listTasks();
      const merged = all.map((item) => (item.id === task.id ? task : item));
      const affected = affectedIdsForBlockedSince(task.id, merged.length ? merged : [task]);
      const updates = await reconcileBlockedSinceBatch(merged.length ? merged : [task], affected);
      const reconciled = updates.get(task.id);
      return reconciled ?? task;
    },
    async updateTask(id, patch) {
      const existing = await this.getTask(id);
      if (!existing) throw new Error(`Task not found: ${id}`);
      const props = await readTaskProperties(kv, keys);
      validateTaskClassifierPatch(patch, props);
      let next = TaskSchema.parse({
        ...existing,
        ...patch,
        id: existing.id,
        schema_version: 1,
        created_at: existing.created_at,
        updated_at: nowIso(),
        completed_at:
          patch.status === 'done' && !existing.completed_at
            ? nowIso()
            : patch.status && patch.status !== 'done'
              ? null
              : (patch.completed_at ?? existing.completed_at)
      });
      await kv.setJSON(keys.taskKey(id), next);
      if (patch.status === 'done' && existing.status !== 'done') {
        await spawnRecurringSuccessor(this, next);
      }
      const all = await this.listTasks();
      const merged = all.map((item) => (item.id === id ? next : item));
      const affected = affectedIdsForBlockedSince(id, merged);
      const updates = await reconcileBlockedSinceBatch(merged, affected);
      for (const [taskId, task] of updates) {
        await kv.setJSON(keys.taskKey(taskId), task);
      }
      next = updates.get(id) ?? next;
      if (next.parent_project_id && next.due_date !== existing.due_date) {
        const project = await this.getProject(next.parent_project_id);
        if (project) {
          const dates = excursionDatesFromAdminTask(project, next);
          if (dates) await this.updateProject(project.id, dates);
        }
      }
      return next;
    },
    async deleteTask(id, meta) {
      const existing = await this.getTask(id);
      if (!existing) return;
      await kv.delete(keys.taskKey(id));
      const ids = (await readIndex(kv, keys.tasksIndexKey())).filter((x) => x !== id);
      await writeIndex(kv, keys.tasksIndexKey(), ids);
      if (meta?.agent) {
        const log = AgentActionLogSchema.parse({
          schema_version: 1,
          id: newId('aal'),
          agent: meta.agent,
          action: 'delete',
          entity_type: 'task',
          entity_id: id,
          reason: meta.reason ?? '',
          created_at: nowIso()
        });
        await kv.setJSON(keys.agentActionLogKey(log.id), log);
      }
    },

    async listProjects() {
      return listByIndex(kv, keys.projectsIndexKey(), keys.projectKey, (raw) =>
        ProjectSchema.parse(raw)
      );
    },
    async getProject(id) {
      const raw = await kv.getJSON(keys.projectKey(id));
      return raw ? ProjectSchema.parse(raw) : null;
    },
    async createProject(input) {
      const stamp = nowIso();
      const project = ProjectSchema.parse({
        schema_version: 1,
        id: newId('proj'),
        title: input.title,
        description: input.description ?? '',
        parent_goal_id: input.parent_goal_id ?? null,
        tags: input.tags ?? [],
        arc_summary: input.arc_summary ?? '',
        type: input.type ?? 'standard',
        milestones: input.milestones ?? [],
        status: input.status ?? 'active',
        baseline_end_date: input.baseline_end_date ?? input.current_end_date ?? null,
        current_end_date: input.current_end_date ?? input.baseline_end_date ?? null,
        review_summary: null,
        stall_flagged_at: null,
        created_at: stamp,
        updated_at: stamp,
        competition_or_event_type: input.competition_or_event_type ?? null,
        key_dates: input.key_dates ?? null,
        student_group_reference: input.student_group_reference ?? null,
        permission_notes: input.permission_notes ?? [],
        generated_admin_tasks: input.generated_admin_tasks ?? [],
        drafted_documents: input.drafted_documents ?? null,
        page_blocks: input.page_blocks ?? []
      });
      await kv.setJSON(keys.projectKey(project.id), project);
      const ids = await readIndex(kv, keys.projectsIndexKey());
      ids.push(project.id);
      await writeIndex(kv, keys.projectsIndexKey(), ids);
      return project;
    },
    async updateProject(id, patch) {
      const existing = await this.getProject(id);
      if (!existing) throw new Error(`Project not found: ${id}`);
      const next = ProjectSchema.parse({
        ...existing,
        ...patch,
        id: existing.id,
        schema_version: 1,
        created_at: existing.created_at,
        updated_at: nowIso(),
        baseline_end_date: existing.baseline_end_date
      });
      await kv.setJSON(keys.projectKey(id), next);
      return next;
    },
    async deleteProject(id, meta) {
      const existing = await this.getProject(id);
      if (!existing) return;
      await kv.delete(keys.projectKey(id));
      const ids = (await readIndex(kv, keys.projectsIndexKey())).filter((x) => x !== id);
      await writeIndex(kv, keys.projectsIndexKey(), ids);
      if (meta?.agent) {
        const log = AgentActionLogSchema.parse({
          schema_version: 1,
          id: newId('aal'),
          agent: meta.agent,
          action: 'delete',
          entity_type: 'project',
          entity_id: id,
          reason: meta.reason ?? '',
          created_at: nowIso()
        });
        await kv.setJSON(keys.agentActionLogKey(log.id), log);
      }
    },

    async listAreas() {
      return listByIndex(kv, keys.areasIndexKey(), keys.areaKey, (raw) => AreaSchema.parse(raw));
    },
    async getArea(id) {
      const raw = await kv.getJSON(keys.areaKey(id));
      return raw ? AreaSchema.parse(raw) : null;
    },
    async createArea(input) {
      const stamp = nowIso();
      const area = AreaSchema.parse({
        schema_version: 1,
        id: newId('area'),
        title: input.title,
        description: input.description ?? '',
        tags: input.tags ?? [],
        created_at: stamp,
        updated_at: stamp
      });
      await kv.setJSON(keys.areaKey(area.id), area);
      const ids = await readIndex(kv, keys.areasIndexKey());
      ids.push(area.id);
      await writeIndex(kv, keys.areasIndexKey(), ids);
      return area;
    },
    async updateArea(id, patch) {
      const existing = await this.getArea(id);
      if (!existing) throw new Error(`Area not found: ${id}`);
      const next = AreaSchema.parse({
        ...existing,
        ...patch,
        id: existing.id,
        schema_version: 1,
        created_at: existing.created_at,
        updated_at: nowIso()
      });
      await kv.setJSON(keys.areaKey(id), next);
      return next;
    },
    async deleteArea(id) {
      await kv.delete(keys.areaKey(id));
      const ids = (await readIndex(kv, keys.areasIndexKey())).filter((x) => x !== id);
      await writeIndex(kv, keys.areasIndexKey(), ids);
    },

    async listGoals() {
      return listByIndex(kv, keys.goalsIndexKey(), keys.goalKey, (raw) => GoalSchema.parse(raw));
    },
    async getGoal(id) {
      const raw = await kv.getJSON(keys.goalKey(id));
      return raw ? GoalSchema.parse(raw) : null;
    },
    async createGoal(input) {
      const stamp = nowIso();
      const goal = GoalSchema.parse({
        schema_version: 1,
        id: newId('goal'),
        title: input.title,
        description: input.description ?? '',
        parent_area_id: input.parent_area_id ?? null,
        status: input.status ?? 'active',
        tags: input.tags ?? [],
        created_at: stamp,
        updated_at: stamp
      });
      await kv.setJSON(keys.goalKey(goal.id), goal);
      const ids = await readIndex(kv, keys.goalsIndexKey());
      ids.push(goal.id);
      await writeIndex(kv, keys.goalsIndexKey(), ids);
      return goal;
    },
    async updateGoal(id, patch) {
      const existing = await this.getGoal(id);
      if (!existing) throw new Error(`Goal not found: ${id}`);
      const next = GoalSchema.parse({
        ...existing,
        ...patch,
        id: existing.id,
        schema_version: 1,
        created_at: existing.created_at,
        updated_at: nowIso()
      });
      await kv.setJSON(keys.goalKey(id), next);
      return next;
    },
    async deleteGoal(id) {
      await kv.delete(keys.goalKey(id));
      const ids = (await readIndex(kv, keys.goalsIndexKey())).filter((x) => x !== id);
      await writeIndex(kv, keys.goalsIndexKey(), ids);
    },

    async listFrameworks() {
      return listByIndex(kv, keys.frameworksIndexKey(), keys.frameworkKey, (raw) =>
        FrameworkEntrySchema.parse(raw)
      );
    },
    async listExcursionTemplates() {
      return syncExcursionTemplateCatalog(kv, keys);
    },
    async listTaskTemplates() {
      return listByIndex(kv, keys.taskTemplatesIndexKey(), keys.taskTemplateKey, (raw) =>
        TaskTemplateSchema.parse(raw)
      );
    },
    async listProjectTemplates() {
      return listByIndex(kv, keys.projectTemplatesIndexKey(), keys.projectTemplateKey, (raw) =>
        ProjectTemplateSchema.parse(raw)
      );
    },
    async saveTaskAsTemplate(taskId, name) {
      const task = await this.getTask(taskId);
      if (!task) throw new Error(`Task not found: ${taskId}`);
      const template = TaskTemplateSchema.parse({
        schema_version: 1,
        id: newId('tt'),
        name,
        domain: task.domain,
        default_fields: {
          title_pattern: task.title,
          framework_used: task.framework_used,
          estimated_duration: task.estimated_duration,
          priority: task.priority,
          tags: task.tags
        },
        created_from: task.id,
        created_at: nowIso()
      });
      await kv.setJSON(keys.taskTemplateKey(template.id), template);
      const ids = await readIndex(kv, keys.taskTemplatesIndexKey());
      ids.push(template.id);
      await writeIndex(kv, keys.taskTemplatesIndexKey(), ids);
      return template;
    },
    async saveProjectAsTemplate(projectId, name) {
      const project = await this.getProject(projectId);
      if (!project) throw new Error(`Project not found: ${projectId}`);
      const template = ProjectTemplateSchema.parse({
        schema_version: 1,
        id: newId('pt'),
        name,
        type: project.type,
        excursion_template_id: project.competition_or_event_type,
        default_milestones: project.milestones.map((m) => ({
          title: m.title,
          due_date: null,
          status: 'open' as const
        })),
        created_from: project.id,
        created_at: nowIso()
      });
      await kv.setJSON(keys.projectTemplateKey(template.id), template);
      const ids = await readIndex(kv, keys.projectTemplatesIndexKey());
      ids.push(template.id);
      await writeIndex(kv, keys.projectTemplatesIndexKey(), ids);
      return template;
    },
    async createTaskFromTemplate(templateId, overrides = {}) {
      const template = await kv.getJSON(keys.taskTemplateKey(templateId));
      if (!template) throw new Error(`Task template not found: ${templateId}`);
      const parsed = TaskTemplateSchema.parse(template);
      return this.createTask({
        title: overrides.title ?? parsed.default_fields.title_pattern ?? parsed.name,
        domain: (overrides.domain as TaskDomain) ?? parsed.domain,
        framework_used: overrides.framework_used ?? parsed.default_fields.framework_used ?? null,
        estimated_duration:
          overrides.estimated_duration ?? parsed.default_fields.estimated_duration ?? null,
        priority: (overrides.priority as Task['priority']) ??
          (parsed.default_fields.priority as Task['priority']) ??
          'medium',
        tags: overrides.tags ?? parsed.default_fields.tags ?? [],
        ...overrides
      });
    },
    async createProjectFromTemplate(templateId, overrides = {}) {
      const raw = await kv.getJSON(keys.projectTemplateKey(templateId));
      if (!raw) throw new Error(`Project template not found: ${templateId}`);
      const parsed = ProjectTemplateSchema.parse(raw);
      if (parsed.type === 'excursion' && parsed.excursion_template_id) {
        const { project } = await this.createExcursionFromTemplate({
          excursion_template_id: parsed.excursion_template_id,
          title: overrides.title ?? parsed.name,
          event_date: overrides.event_date ?? toDateKey(addDays(new Date(), 45)),
          description: overrides.description
        });
        return project;
      }
      const project = await this.createProject({
        title: overrides.title ?? parsed.name,
        description: overrides.description ?? '',
        type: parsed.type,
        status: 'active'
      });
      const milestones = parsed.default_milestones.map((milestone) => ({
        id: newId('ms'),
        project_id: project.id,
        title: milestone.title ?? 'Milestone',
        due_date: milestone.due_date ?? null,
        status: (milestone.status ?? 'open') as 'open'
      }));
      return this.updateProject(project.id, { milestones });
    },
    async createExcursionFromTemplate(input) {
      const templateId = resolveExcursionTemplateId(input.excursion_template_id);
      const catalog = await syncExcursionTemplateCatalog(kv, keys);
      const template = catalog.find((item) => item.id === templateId);
      if (!template) throw new Error(`Excursion template not found: ${templateId}`);
      const plan = buildExcursionPlan(template, {
        title: input.title,
        event_date: input.event_date,
        student_group_reference: input.student_group_reference,
        description: input.description
      });

      let project = await this.createProject({
        title: input.title,
        description: input.description ?? '',
        arc_summary: input.description ?? '',
        type: 'excursion',
        status: 'active',
        baseline_end_date: plan.event_date,
        current_end_date: plan.event_date,
        competition_or_event_type: template.id,
        key_dates: plan.key_dates,
        student_group_reference: input.student_group_reference ?? null,
        drafted_documents: plan.drafted_documents,
        generated_admin_tasks: [],
        milestones: []
      });

      const milestones = plan.milestones.map((m) => ({
        id: newId('ms'),
        project_id: project.id,
        title: m.title,
        due_date: m.due_date,
        status: m.status
      }));

      const tasks: Task[] = [];
      for (const planned of plan.admin_tasks) {
        const task = await this.createTask({
          title: planned.title,
          description: planned.description,
          domain: 'teaching',
          due_date: planned.due_date,
          estimated_duration: planned.estimated_duration,
          priority: planned.priority,
          parent_project_id: project.id,
          tags: planned.tags,
          source: 'auto_generated_from_excursion'
        });
        tasks.push(task);
      }

      project = await this.updateProject(project.id, {
        milestones,
        generated_admin_tasks: tasks.map((t) => t.id),
        drafted_documents: plan.drafted_documents,
        key_dates: plan.key_dates
      });

      return { project, tasks };
    },

    async getClareCalibration(domain) {
      const raw = await kv.getJSON(keys.clareCalibrationKey(domain));
      if (raw) return ClareCalibrationSchema.parse(raw);
      return emptyCalibration(domain, nowIso());
    },
    async getHubPrefs(): Promise<HubPrefs> {
      return parseHubPrefs(await kv.getJSON(keys.hubPrefsKey()));
    },
    async setHubTimezone(timezoneOrCity: string): Promise<{ ok: boolean; timezone: string; note: string }> {
      const resolved = resolveTimeZoneInput(timezoneOrCity);
      if (!resolved) {
        const current = await this.getHubPrefs();
        return {
          ok: false,
          timezone: current.timezone,
          note: `Could not map "${timezoneOrCity}" to a timezone.`
        };
      }
      const prefs: HubPrefs = {
        ...DEFAULT_HUB_PREFS,
        ...(await this.getHubPrefs()),
        timezone: resolved,
        updated_at: nowIso()
      };
      await kv.setJSON(keys.hubPrefsKey(), prefs);
      return {
        ok: true,
        timezone: resolved,
        note: `Remembered ${resolved} for Adam's calendar.`
      };
    },
    async getAgentProtocol(slug: AgentProtocolSlug): Promise<AgentProtocolDoc> {
      return parseAgentProtocol(await kv.getJSON(keys.agentProtocolKey(slug)), slug);
    },
    async setAgentProtocol(
      slug: AgentProtocolSlug,
      markdown: string
    ): Promise<{ ok: boolean; markdown: string; note: string }> {
      const trimmed = markdown.trim();
      if (!trimmed) {
        const current = await this.getAgentProtocol(slug);
        return { ok: false, markdown: current.markdown, note: 'Empty protocol — not saved.' };
      }
      const doc: AgentProtocolDoc = {
        ...defaultAgentProtocol(slug),
        markdown: trimmed.slice(0, 24_000),
        updated_at: nowIso()
      };
      await kv.setJSON(keys.agentProtocolKey(slug), doc);
      return { ok: true, markdown: doc.markdown, note: `Saved ${slug} operating protocol.` };
    },
    async listClareCalibrations() {
      const ids = await readIndex(kv, keys.clareCalibrationsIndexKey());
      const out = [];
      for (const id of ids) {
        const raw = await kv.getJSON(keys.clareCalibrationKey(id));
        if (raw) out.push(ClareCalibrationSchema.parse(raw));
      }
      return out;
    },
    async proposeWithClare(input: ClareProposalInput) {
      const [frameworks, tasks, projects, calibrations, calibration] = await Promise.all([
        this.listFrameworks(),
        this.listTasks(),
        this.listProjects(),
        this.listClareCalibrations(),
        this.getClareCalibration(input.domain)
      ]);
      const backlog = input.backlog_titles ?? backlogTasks(tasks).map((t) => t.title);
      const items = parseBrainDump(input.title, {
        preferredDomain: input.domain,
        tasks,
        projects
      });
      const judge = defaultClareProposalJudge();
      if (judge && items.length > 0) {
        const lifeContext = await (defaultLifeContextProvider()?.() ?? Promise.resolve(null));
        const digest = buildClareDumpDigest({
          text: input.title,
          items,
          frameworks,
          tasks,
          projects,
          calibrations,
          preferredDomain: input.domain,
          protocolId: input.protocol_id,
          lifeContext
        });
        const judgment = await judge(digest);
        if (judgment.ok) {
          const result = assembleJudgedDumpResult(
            judgment.items,
            frameworks,
            () => (calibration.sample_count > 0 ? calibration : null),
            input.protocol_id,
            judgment.voice
          );
          if (result.proposals[0]) {
            return result.proposals[0];
          }
        }
      }
      return buildProposal(
        {
          ...input,
          backlog_titles: backlog
        },
        frameworks,
        calibration.sample_count > 0 ? calibration : null
      );
    },
    async briefWithClare(input = {}) {
      const tasks = await this.listTasks();
      const prefs = await this.getHubPrefs();
      const facts = buildClareBriefing(
        tasks,
        input.protocol_id,
        hubCalendarDate(input.now ?? new Date(), prefs.timezone)
      );
      const judge: ClareBriefingJudge | null =
        input.judge === undefined ? defaultClareBriefingJudge() : input.judge;
      if (!judge) return facts;

      const lifeContext =
        input.lifeContext === undefined
          ? await (defaultLifeContextProvider()?.() ?? Promise.resolve(null))
          : input.lifeContext;

      try {
        const written = await judge({
          protocol_id: facts.protocol_id,
          facts,
          life_context: lifeContextToPromptBlock(lifeContext)
        });
        if (!written.ok) return facts;
        return {
          ...facts,
          lead: written.lead ?? facts.lead,
          closer: written.closer ?? facts.closer,
          flags: written.flags
            ? facts.flags.map((flag, i) => ({
                ...flag,
                text: written.flags![i] ?? flag.text
              }))
            : facts.flags
        };
      } catch {
        return facts;
      }
    },
    async processDumpWithClare(input) {
      const rawSlug = String(input.agent_slug ?? 'clare');
      const agentSlug: AgentProtocolSlug = isAgentProtocolSlug(rawSlug) ? rawSlug : 'clare';
      const prefs = await this.getHubPrefs();
      const timezone = prefs.timezone;
      const protocolDoc = await this.getAgentProtocol(agentSlug);
      const now = hubCalendarDate(input.now ?? new Date(), timezone);
      const [frameworks, tasks, projects, calibrations] = await Promise.all([
        this.listFrameworks(),
        this.listTasks(),
        this.listProjects(),
        this.listClareCalibrations()
      ]);
      const byDomain = new Map(calibrations.map((c) => [c.domain, c]));
      const followUp = resolveDuplicateFollowUp(input.text, input.recent_thread);
      if (followUp?.action === 'leave') {
        return {
          voice: `Leaving “${followUp.title}” as is.`,
          proposals: [],
          questions: [],
          notes: [],
          toolkit: null,
          mutations: [],
          agent: agentSlug
        };
      }
      const dumpText = followUp?.action === 'make_new' ? followUp.title : input.text;
      const forceNewTitles = followUp?.action === 'make_new';
      // Twin follow-ups are shared across agents; Clare also uses the offline parser for dumps.
      const items =
        agentSlug === 'clare' || forceNewTitles
          ? parseBrainDump(dumpText, {
              now,
              timezone,
              preferredDomain: input.domain,
              tasks,
              projects,
              forceNewTitles
            })
          : [];
      const calibrationFor = (domain: TaskDomain) => {
        const cal = byDomain.get(domain);
        return cal && cal.sample_count > 0 ? cal : null;
      };
      const toolRuntime = {
        getTimezone: async () => (await this.getHubPrefs()).timezone,
        setTimezone: (zone: string) => this.setHubTimezone(zone),
        getProtocol: async () => (await this.getAgentProtocol(agentSlug)).markdown,
        setProtocol: (markdown: string) => this.setAgentProtocol(agentSlug, markdown),
        listTasks: () => this.listTasks(),
        listProjects: () => this.listProjects(),
        getTask: (id: string) => this.getTask(id),
        getProject: (id: string) => this.getProject(id),
        listInbox: (agent: string) => this.listAgentInbox(agent),
        listMaps: () => this.listMaps(),
        getMap: async (id: string) => {
          const maps = await this.listMaps();
          return maps.find((map) => map.id === id) ?? null;
        },
        repo: defaultAgentRepoClient(),
        agentSlug,
        now: () => input.now ?? new Date()
      };
      const judge: ClareProposalJudge | null =
        input.judge === undefined
          ? defaultClareProposalJudge(process.env, toolRuntime, agentSlug)
          : input.judge;
      if (judge) {
        const lifeContext =
          input.lifeContext === undefined
            ? await (defaultLifeContextProvider()?.() ?? Promise.resolve(null))
            : input.lifeContext;
        const digest = buildClareDumpDigest({
          text: dumpText,
          items,
          frameworks,
          tasks,
          projects,
          calibrations,
          preferredDomain: input.domain ?? 'teaching',
          protocolId: input.protocol_id,
          now: input.now ?? new Date(),
          timezone,
          lifeContext,
          operatingProtocol: protocolDoc.markdown,
          recentThread: input.recent_thread
        });
        try {
          const judgment = await judge(digest);
          if (judgment.ok) {
            const rows =
              forceNewTitles
                ? judgment.items.map((row) => ({ ...row, existing_task_id: null }))
                : judgment.items;
            return assembleJudgedDumpResult(
              rows,
              frameworks,
              calibrationFor,
              input.protocol_id,
              forceNewTitles && (!judgment.voice || /already on the board/i.test(judgment.voice))
                ? `Making a fresh “${followUp!.title}”. Confirm when ready.`
                : judgment.voice,
              judgment.mutations,
              agentSlug
            );
          }
        } catch {
          // Model call failed outright — fall through to the offline parser.
        }
      }
      if (forceNewTitles && items.length) {
        return assembleDumpResult(items, frameworks, calibrationFor, input.protocol_id, agentSlug);
      }
      if (agentSlug !== 'clare') {
        return {
          voice:
            'I am online but the model key is missing locally — set ANTHROPIC_API_KEY, or talk to me on production.',
          proposals: [],
          questions: [],
          notes: [],
          toolkit: null,
          mutations: [],
          agent: agentSlug
        };
      }
      return assembleDumpResult(items, frameworks, calibrationFor, input.protocol_id, agentSlug);
    },
    async applyAgentMutations(mutations: AgentMutation[]) {
      const results: Array<{ summary: string; ok: boolean; note: string }> = [];
      const repo = defaultAgentRepoClient();
      for (const mutation of mutations) {
        try {
          if (mutation.kind === 'task_update') {
            await this.updateTask(mutation.task_id, sanitizeTaskPatch(mutation.patch));
            results.push({ summary: mutation.summary, ok: true, note: mutationLabel(mutation) });
            continue;
          }
          if (mutation.kind === 'project_update') {
            await this.updateProject(mutation.project_id, sanitizeProjectPatch(mutation.patch));
            results.push({ summary: mutation.summary, ok: true, note: mutationLabel(mutation) });
            continue;
          }
          if (mutation.kind === 'page_blocks') {
            const blocks = mutation.page_blocks.map((block) => PageBlockSchema.parse(block));
            if (mutation.entity_type === 'task') {
              await this.updateTask(mutation.entity_id, { page_blocks: blocks });
            } else {
              await this.updateProject(mutation.entity_id, { page_blocks: blocks });
            }
            results.push({ summary: mutation.summary, ok: true, note: mutationLabel(mutation) });
            continue;
          }
          if (mutation.kind === 'map_update') {
            await this.updateMap(
              mutation.map_id,
              mutation.patch as {
                title?: string;
                year?: number | null;
                lines?: import('@/schemas/map').TransitMap['lines'];
                stations?: import('@/schemas/map').TransitMap['stations'];
                ticks?: import('@/schemas/map').TransitMap['ticks'];
              }
            );
            results.push({ summary: mutation.summary, ok: true, note: mutationLabel(mutation) });
            continue;
          }
          if (mutation.kind === 'repo_file') {
            if (!repo) {
              results.push({
                summary: mutation.summary,
                ok: false,
                note: 'AGENT_REPO_TOKEN not configured — cannot write repo files.'
              });
              continue;
            }
            const written = await repo.putFile({
              path: mutation.path,
              content: mutation.content,
              message: mutation.commit_message
            });
            results.push({
              summary: mutation.summary,
              ok: written.ok,
              note: written.commit_url ? `${written.note} ${written.commit_url}` : written.note
            });
          }
        } catch (err) {
          results.push({
            summary: mutation.summary,
            ok: false,
            note: err instanceof Error ? err.message : 'Apply failed'
          });
        }
      }
      return { results };
    },
    async acceptClareProposal({ proposal, accepted_minutes, framework_id }) {
      const stamp = nowIso();
      const tags = ['clare'];
      if (proposal.dump_kind === 'communication') tags.push('comms');
      const task = await this.createTask({
        title: proposal.title,
        description: proposal.description,
        domain: proposal.domain,
        priority: proposal.priority,
        due_date: proposal.due_date,
        parent_project_id: proposal.parent_project_id ?? null,
        framework_used: framework_id ?? proposal.framework_id,
        estimated_duration: accepted_minutes,
        source: 'suggested_by_agent',
        tags
      });

      const negotiation = ClareNegotiationLogSchema.parse({
        schema_version: 1,
        id: newId('cnl'),
        task_id: task.id,
        domain: proposal.domain,
        framework_id: framework_id ?? proposal.framework_id,
        proposed_minutes: proposal.proposed_minutes,
        accepted_minutes,
        reasoning: proposal.reasoning,
        created_at: stamp
      });
      await kv.setJSON(keys.clareNegotiationLogKey(negotiation.id), negotiation);

      let calibration = await this.getClareCalibration(proposal.domain);
      calibration = recordNegotiationSample(
        calibration,
        proposal.proposed_minutes,
        accepted_minutes,
        stamp
      );
      await kv.setJSON(keys.clareCalibrationKey(proposal.domain), calibration);
      const calIds = await readIndex(kv, keys.clareCalibrationsIndexKey());
      if (!calIds.includes(proposal.domain)) {
        calIds.push(proposal.domain);
        await writeIndex(kv, keys.clareCalibrationsIndexKey(), calIds);
      }

      const log = AgentActionLogSchema.parse({
        schema_version: 1,
        id: newId('aal'),
        agent: 'Clare DeMind',
        action: 'create',
        entity_type: 'task',
        entity_id: task.id,
        reason: proposal.reasoning,
        created_at: stamp
      });
      await kv.setJSON(keys.agentActionLogKey(log.id), log);

      return { task, negotiation, calibration };
    },
    async acceptClareBatch(items) {
      const tasks = [];
      const negotiations = [];
      const calibrations = [];
      for (const item of items) {
        const result = await this.acceptClareProposal(item);
        tasks.push(result.task);
        negotiations.push(result.negotiation);
        calibrations.push(result.calibration);
      }
      return { tasks, negotiations, calibrations };
    },
    async recordClareActual(taskId, actualMinutes) {
      const task = await this.updateTask(taskId, {
        actual_duration: actualMinutes,
        status: 'done'
      });
      if (!task.estimated_duration) {
        return { task, calibration: null };
      }
      const stamp = nowIso();
      let calibration = await this.getClareCalibration(task.domain);
      calibration = recordActualSample(calibration, task.estimated_duration, actualMinutes, stamp);
      await kv.setJSON(keys.clareCalibrationKey(task.domain), calibration);
      const calIds = await readIndex(kv, keys.clareCalibrationsIndexKey());
      if (!calIds.includes(task.domain)) {
        calIds.push(task.domain);
        await writeIndex(kv, keys.clareCalibrationsIndexKey(), calIds);
      }
      return { task, calibration };
    },

    async listReviewLogs() {
      return listByIndex(kv, keys.reviewLogsIndexKey(), keys.reviewLogKey, (raw) =>
        ReviewLogSchema.parse(raw)
      );
    },

    async flagStalledProjects(options = {}) {
      const weeks = options.weeks ?? DEFAULT_STALL_WEEKS;
      const now = options.now ?? new Date();
      const stamp = nowIso();
      const [projects, tasks] = await Promise.all([this.listProjects(), this.listTasks()]);
      const candidates = findStallCandidates(projects, tasks, now, weeks);
      const flagged: Awaited<ReturnType<TasksStore['listProjects']>> = [];

      for (const candidate of candidates) {
        if (candidate.project.status === 'stalled') {
          flagged.push(candidate.project);
          continue;
        }
        if (candidate.project.status === 'archived_dead') continue;
        const updated = await this.updateProject(candidate.project.id, {
          status: 'stalled',
          stall_flagged_at: stamp
        });
        flagged.push(updated);
      }

      return { flagged, candidates: candidates.length };
    },

    async resolveStalledProject(input) {
      const reason = input.reason.trim();
      if (!reason) throw new Error('A short reason is required');

      const existing = await this.getProject(input.project_id);
      if (!existing) throw new Error(`Project not found: ${input.project_id}`);

      const moved_task_ids: string[] = [];
      if (input.outcome === 'frankensteined') {
        const targetId = input.merge_into_project_id;
        if (!targetId) throw new Error('Frankenstein needs a merge target project');
        if (targetId === input.project_id) throw new Error('Cannot merge a project into itself');
        const target = await this.getProject(targetId);
        if (!target || target.status === 'archived_dead') {
          throw new Error('Merge target project not found or archived');
        }
        const tasks = await this.listTasks();
        for (const task of tasks) {
          if (task.parent_project_id !== existing.id) continue;
          await this.updateTask(task.id, { parent_project_id: targetId });
          moved_task_ids.push(task.id);
        }
      }

      const status = outcomeProjectStatus(input.outcome);
      const project = await this.updateProject(existing.id, {
        status,
        stall_flagged_at: input.outcome === 'revived' ? null : (existing.stall_flagged_at ?? nowIso()),
        review_summary: reason
      });

      const review = ReviewLogSchema.parse({
        schema_version: 1,
        id: newId('rev'),
        project_id: project.id,
        outcome: input.outcome,
        reason,
        merge_into_project_id:
          input.outcome === 'frankensteined' ? (input.merge_into_project_id ?? null) : null,
        created_at: nowIso()
      });
      await kv.setJSON(keys.reviewLogKey(review.id), review);
      const ids = await readIndex(kv, keys.reviewLogsIndexKey());
      ids.push(review.id);
      await writeIndex(kv, keys.reviewLogsIndexKey(), ids);

      const log = AgentActionLogSchema.parse({
        schema_version: 1,
        id: newId('aal'),
        agent: 'Clare DeMind',
        action: 'update',
        entity_type: 'project',
        entity_id: project.id,
        reason: `${input.outcome}: ${reason}`,
        created_at: nowIso()
      });
      await kv.setJSON(keys.agentActionLogKey(log.id), log);

      return { project, review, moved_task_ids };
    },

    async listStressFlags() {
      return listByIndex(kv, keys.stressFlagsIndexKey(), keys.stressFlagKey, (raw) =>
        StressFlagSchema.parse(raw)
      );
    },

    async listAgentInbox(agent) {
      const slug = agentSlug(agent);
      const doc = await kv.getJSON<IndexDoc>(keys.agentInboxKey(slug));
      const ids = doc?.ids ?? [];
      const flags: Awaited<ReturnType<TasksStore['listStressFlags']>> = [];
      for (const id of ids) {
        const raw = await kv.getJSON(keys.stressFlagKey(id));
        if (raw) flags.push(StressFlagSchema.parse(raw));
      }
      return flags;
    },

    async raiseStressFlag(input) {
      const stamp = nowIso();
      const fingerprint =
        input.fingerprint ??
        `manual:${input.pattern_description.slice(0, 80)}:${stamp.slice(0, 10)}`;
      const existing = await this.listStressFlags();
      const dup = existing.find((f) => f.fingerprint === fingerprint);
      if (dup) return dup;

      const flag = StressFlagSchema.parse({
        schema_version: 1,
        id: newId('sf'),
        source_project_or_task_id: input.source_project_or_task_id ?? null,
        pattern_description: input.pattern_description,
        pattern_kind: input.pattern_kind ?? 'manual',
        raised_by: 'Clare DeMind',
        routed_to: DEFAULT_STRESS_ROUTE,
        recurrence_note: null,
        fingerprint,
        created_at: stamp
      });

      await kv.setJSON(keys.stressFlagKey(flag.id), flag);
      const ids = await readIndex(kv, keys.stressFlagsIndexKey());
      ids.push(flag.id);
      await writeIndex(kv, keys.stressFlagsIndexKey(), ids);

      // Write-on-create into each agent inbox (DECISIONS.md — no sync fan-out yet).
      for (const agent of flag.routed_to) {
        const slug = agentSlug(agent);
        const inboxIds = await readIndex(kv, keys.agentInboxKey(slug));
        if (!inboxIds.includes(flag.id)) {
          inboxIds.push(flag.id);
          await writeIndex(kv, keys.agentInboxKey(slug), inboxIds);
        }
      }

      const log = AgentActionLogSchema.parse({
        schema_version: 1,
        id: newId('aal'),
        agent: 'Clare DeMind',
        action: 'create',
        entity_type: 'stress_flag',
        entity_id: flag.id,
        reason: `StressFlag: ${flag.pattern_description}`,
        created_at: stamp
      });
      await kv.setJSON(keys.agentActionLogKey(log.id), log);

      return flag;
    },

    async scanAndRaiseStressFlags(options = {}) {
      const now = options.now ?? new Date();
      const [projects, tasks, existing] = await Promise.all([
        this.listProjects(),
        this.listTasks(),
        this.listStressFlags()
      ]);
      const patterns = detectStressPatterns(projects, tasks, now);
      const known = new Set(existing.map((f) => f.fingerprint));
      const raised = [];
      let skipped = 0;
      for (const pattern of patterns) {
        if (known.has(pattern.fingerprint)) {
          skipped += 1;
          continue;
        }
        const flag = await this.raiseStressFlag({
          pattern_description: pattern.pattern_description,
          pattern_kind: pattern.pattern_kind,
          source_project_or_task_id: pattern.source_project_or_task_id,
          fingerprint: pattern.fingerprint
        });
        known.add(flag.fingerprint);
        raised.push(flag);
      }
      return { raised, skipped, patterns: patterns.length };
    },

    async getIntuitiveScanMeta() {
      return parseIntuitiveScanMeta(await kv.getJSON(keys.intuitiveScanMetaKey()));
    },

    async runIntuitiveScan(options = {}) {
      const now = options.now ?? new Date();
      const ran_at = nowIso();
      const judge: IntuitiveJudge | null =
        options.judge === undefined ? defaultIntuitiveJudge() : options.judge;
      if (!judge) {
        const result = {
          raised: [],
          skipped: 0,
          judged: 0,
          model: null,
          ran_at,
          skipped_ai: true,
          reason: 'no_api_key'
        };
        await kv.setJSON(keys.intuitiveScanMetaKey(), result);
        return result;
      }

      const [projects, tasks, existing] = await Promise.all([
        this.listProjects(),
        this.listTasks(),
        this.listStressFlags()
      ]);
      const digest = buildIntuitiveDigest(projects, tasks, now);
      const judgment = await judge(digest);
      const patterns = judgmentToPatterns(judgment);
      const known = new Set(existing.map((flag) => flag.fingerprint));
      const raised = [];
      let skipped = 0;
      for (const pattern of patterns) {
        if (known.has(pattern.fingerprint)) {
          skipped += 1;
          continue;
        }
        const flag = await this.raiseStressFlag({
          pattern_description: pattern.pattern_description,
          pattern_kind: pattern.pattern_kind,
          source_project_or_task_id: pattern.source_project_or_task_id,
          fingerprint: pattern.fingerprint
        });
        known.add(flag.fingerprint);
        raised.push(flag);
      }
      const result = {
        raised,
        skipped,
        judged: patterns.length,
        model: judgment.model,
        ran_at,
        skipped_ai: false,
        reason: null
      };
      await kv.setJSON(keys.intuitiveScanMetaKey(), {
        ran_at: result.ran_at,
        model: result.model,
        raised: result.raised.length,
        skipped: result.skipped,
        judged: result.judged,
        skipped_ai: result.skipped_ai,
        reason: result.reason
      });
      return result;
    },

    async getCapacitySnapshot(now = new Date()) {
      const tasks = await this.listTasks();
      return buildCapacitySnapshot(tasks, now, 14);
    },

    async getCapacityShare() {
      const raw = await kv.getJSON(keys.capacityShareKey());
      return raw ? CapacityShareSchema.parse(raw) : null;
    },

    async ensureCapacityShare() {
      const existing = await this.getCapacityShare();
      if (existing?.enabled) return existing;
      const stamp = nowIso();
      const share = CapacityShareSchema.parse({
        schema_version: 1,
        id: newId('cap'),
        token: crypto.randomUUID().replace(/-/g, ''),
        enabled: true,
        created_at: stamp,
        rotated_at: null
      });
      await kv.setJSON(keys.capacityShareKey(), share);
      return share;
    },

    async rotateCapacityShare() {
      const existing = await this.getCapacityShare();
      const stamp = nowIso();
      const share = CapacityShareSchema.parse({
        schema_version: 1,
        id: existing?.id ?? newId('cap'),
        token: crypto.randomUUID().replace(/-/g, ''),
        enabled: true,
        created_at: existing?.created_at ?? stamp,
        rotated_at: stamp
      });
      await kv.setJSON(keys.capacityShareKey(), share);
      return share;
    },

    async getPublicCapacityByToken(token) {
      const share = await this.getCapacityShare();
      if (!share || !share.enabled || share.token !== token) return null;
      const snapshot = await this.getCapacitySnapshot();
      return toCoreyPublicView(snapshot);
    },

    async getProjectVariance(projectId) {
      const project = await this.getProject(projectId);
      if (!project) throw new Error(`Project not found: ${projectId}`);
      const tasks = await this.listTasks();
      return computeProjectVariance(project, tasks);
    },

    async closeProject(input) {
      const reason = input.reason.trim();
      if (!reason) throw new Error('A short retrospective is required');
      const existing = await this.getProject(input.project_id);
      if (!existing) throw new Error(`Project not found: ${input.project_id}`);
      if (existing.status === 'archived_dead') throw new Error('Project already closed');

      const tasks = await this.listTasks();
      const derived = deriveProjectEndDate(existing, tasks);
      const variance = computeProjectVariance({ ...existing, current_end_date: derived }, tasks);

      const project = await this.updateProject(existing.id, {
        status: 'archived_dead',
        current_end_date: derived,
        review_summary: reason
      });

      const review = ReviewLogSchema.parse({
        schema_version: 1,
        id: newId('rev'),
        project_id: project.id,
        outcome: 'closed',
        reason,
        baseline_end_date: project.baseline_end_date,
        current_end_date: project.current_end_date,
        slip_days: variance.slip_days,
        created_at: nowIso()
      });
      await kv.setJSON(keys.reviewLogKey(review.id), review);
      const ids = await readIndex(kv, keys.reviewLogsIndexKey());
      ids.push(review.id);
      await writeIndex(kv, keys.reviewLogsIndexKey(), ids);

      const log = AgentActionLogSchema.parse({
        schema_version: 1,
        id: newId('aal'),
        agent: 'Clare DeMind',
        action: 'update',
        entity_type: 'project',
        entity_id: project.id,
        reason: `Closed: ${reason}`,
        created_at: nowIso()
      });
      await kv.setJSON(keys.agentActionLogKey(log.id), log);

      return { project, review, variance };
    },

    async listMaps() {
      let maps = await listByIndex(kv, keys.mapsIndexKey(), keys.mapKey, (raw) =>
        TransitMapSchema.parse(raw)
      );
      if (maps.length === 0) {
        const seedMap = mindWorks2026Map();
        await kv.setJSON(keys.mapKey(seedMap.id), seedMap);
        await writeIndex(kv, keys.mapsIndexKey(), [seedMap.id]);
        maps = [seedMap];
      }
      return maps;
    },
    async getMap(id) {
      const raw = await kv.getJSON(keys.mapKey(id));
      return raw ? TransitMapSchema.parse(raw) : null;
    },
    async createMap(input) {
      const stamp = nowIso();
      const map = TransitMapSchema.parse({
        schema_version: 1,
        id: newId('map'),
        title: input.title,
        year: input.year ?? null,
        lines: input.lines ?? [],
        stations: input.stations ?? [],
        ticks: input.ticks ?? [],
        created_at: stamp,
        updated_at: stamp
      });
      await kv.setJSON(keys.mapKey(map.id), map);
      const ids = await readIndex(kv, keys.mapsIndexKey());
      ids.push(map.id);
      await writeIndex(kv, keys.mapsIndexKey(), ids);
      return map;
    },
    async updateMap(id, patch) {
      const existing = await this.getMap(id);
      if (!existing) throw new Error(`Map not found: ${id}`);
      const next = TransitMapSchema.parse({
        ...existing,
        ...patch,
        id: existing.id,
        schema_version: 1,
        created_at: existing.created_at,
        updated_at: nowIso()
      });
      await kv.setJSON(keys.mapKey(id), next);
      return next;
    },
    async deleteMap(id) {
      await kv.delete(keys.mapKey(id));
      const ids = (await readIndex(kv, keys.mapsIndexKey())).filter((x) => x !== id);
      await writeIndex(kv, keys.mapsIndexKey(), ids);
    },

    async listPrograms() {
      let programs = await listByIndex(kv, keys.programsIndexKey(), keys.programKey, (raw) =>
        ProgramSchema.parse(raw)
      );
      if (programs.length === 0) {
        const seeded = catalogPrograms();
        for (const item of seeded) {
          await kv.setJSON(keys.programKey(item.id), item);
        }
        await writeIndex(
          kv,
          keys.programsIndexKey(),
          seeded.map((item) => item.id)
        );
        programs = seeded;
      }
      return programs;
    },
    async getProgram(id) {
      const raw = await kv.getJSON(keys.programKey(id));
      return raw ? ProgramSchema.parse(raw) : null;
    },
    async createProgram(input) {
      const stamp = nowIso();
      const program = ProgramSchema.parse({
        schema_version: 1,
        id: newId('prog'),
        name: input.name,
        types: input.types ?? [],
        subjects: input.subjects ?? [],
        month: input.month ?? null,
        age_groups: input.age_groups ?? [],
        competition_level: input.competition_level ?? null,
        competition_length: input.competition_length ?? null,
        location: input.location ?? '',
        organiser: input.organiser ?? '',
        cost: input.cost ?? '',
        cost_basis: input.cost_basis ?? null,
        description: input.description ?? '',
        registration_link: input.registration_link ?? null,
        registration_window: input.registration_window ?? '',
        not_available_nsw: input.not_available_nsw ?? false,
        not_available_reason: input.not_available_reason ?? '',
        created_at: stamp,
        updated_at: stamp
      });
      await kv.setJSON(keys.programKey(program.id), program);
      const ids = await readIndex(kv, keys.programsIndexKey());
      ids.push(program.id);
      await writeIndex(kv, keys.programsIndexKey(), ids);
      return program;
    },
    async updateProgram(id, patch) {
      const existing = await this.getProgram(id);
      if (!existing) throw new Error(`Program not found: ${id}`);
      const next = ProgramSchema.parse({
        ...existing,
        ...patch,
        id: existing.id,
        schema_version: 1,
        created_at: existing.created_at,
        updated_at: nowIso()
      });
      await kv.setJSON(keys.programKey(id), next);
      return next;
    },
    async deleteProgram(id) {
      await kv.delete(keys.programKey(id));
      const ids = (await readIndex(kv, keys.programsIndexKey())).filter((x) => x !== id);
      await writeIndex(kv, keys.programsIndexKey(), ids);
    },

    async getTaskProperties() {
      return readTaskProperties(kv, keys);
    },

    async updateTaskProperties(config) {
      const parsed = validateTaskPropertyConfig(TaskPropertyConfigSchema.parse(config));
      await kv.setJSON(keys.taskPropertiesKey(), parsed);
      return parsed;
    }
  };
}

export type { TaskDomain };

/** Seed once into an empty store (idempotent via meta/seeded). Pass force to rewrite. */
export async function seedIfEmpty(
  kv: KvAdapter,
  keys: KeyBuilders,
  seed: SeedData,
  options: { force?: boolean } = {}
): Promise<void> {
  const marker = await kv.getJSON<{ at: string }>(keys.metaSeededKey());
  if (marker && !options.force) return;

  await kv.setJSON(keys.taskPropertiesKey(), DEFAULT_TASK_PROPERTY_CONFIG);

  for (const item of seed.frameworks) {
    await kv.setJSON(keys.frameworkKey(item.id), FrameworkEntrySchema.parse(item));
  }
  await writeIndex(
    kv,
    keys.frameworksIndexKey(),
    seed.frameworks.map((f) => f.id)
  );

  const excursionTemplates = catalogExcursionTemplates();
  for (const item of excursionTemplates) {
    await kv.setJSON(keys.excursionTemplateKey(item.id), item);
  }
  await writeIndex(
    kv,
    keys.excursionTemplatesIndexKey(),
    excursionTemplates.map((t) => t.id)
  );

  for (const item of seed.task_templates) {
    await kv.setJSON(keys.taskTemplateKey(item.id), TaskTemplateSchema.parse(item));
  }
  await writeIndex(
    kv,
    keys.taskTemplatesIndexKey(),
    seed.task_templates.map((t) => t.id)
  );

  for (const item of seed.project_templates) {
    await kv.setJSON(keys.projectTemplateKey(item.id), ProjectTemplateSchema.parse(item));
  }
  await writeIndex(
    kv,
    keys.projectTemplatesIndexKey(),
    seed.project_templates.map((t) => t.id)
  );

  for (const item of seed.projects) {
    await kv.setJSON(keys.projectKey(item.id), ProjectSchema.parse(item));
  }
  await writeIndex(
    kv,
    keys.projectsIndexKey(),
    seed.projects.map((p) => p.id)
  );

  const areas = seed.areas ?? [];
  for (const item of areas) {
    await kv.setJSON(keys.areaKey(item.id), AreaSchema.parse(item));
  }
  if (areas.length > 0) {
    await writeIndex(
      kv,
      keys.areasIndexKey(),
      areas.map((a) => a.id)
    );
  }

  const goals = seed.goals ?? [];
  for (const item of goals) {
    await kv.setJSON(keys.goalKey(item.id), GoalSchema.parse(item));
  }
  if (goals.length > 0) {
    await writeIndex(
      kv,
      keys.goalsIndexKey(),
      goals.map((g) => g.id)
    );
  }

  for (const item of seed.tasks) {
    await kv.setJSON(keys.taskKey(item.id), TaskSchema.parse(item));
  }
  await writeIndex(
    kv,
    keys.tasksIndexKey(),
    seed.tasks.map((t) => t.id)
  );

  const maps = seed.maps?.length ? seed.maps : [mindWorks2026Map()];
  for (const item of maps) {
    await kv.setJSON(keys.mapKey(item.id), TransitMapSchema.parse(item));
  }
  await writeIndex(
    kv,
    keys.mapsIndexKey(),
    maps.map((m) => m.id)
  );

  const programs = seed.programs?.length ? seed.programs : catalogPrograms();
  for (const item of programs) {
    await kv.setJSON(keys.programKey(item.id), ProgramSchema.parse(item));
  }
  await writeIndex(
    kv,
    keys.programsIndexKey(),
    programs.map((item) => item.id)
  );

  await kv.setJSON(keys.metaSeededKey(), { at: nowIso() });
}
