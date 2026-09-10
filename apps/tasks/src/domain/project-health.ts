import type { Task } from '@/schemas/task';
import type { Project, Milestone } from '@/schemas/project';
import { projectMilestones } from '@/domain/project-milestones';

export type ProjectHealth =
  | 'healthy'
  | 'waiting_only'
  | 'missing_next_action'
  | 'blocked'
  | 'stalled';

export type ProjectHealthResult = {
  project_id: string;
  health: ProjectHealth;
  executable_next_actions: string[];
  waiting_task_ids: string[];
  blocked_task_ids: string[];
  open_milestones: string[];
  unmet_dependencies: string[];
  reason: string;
};

const DONE = new Set(['done', 'dead', 'archived_dead']);
const DEAD_BUCKET = new Set(['trash', 'trashed']);

function isOpenExecutable(task: Task, all: Task[]): boolean {
  if (DONE.has(String(task.status))) return false;
  if (DEAD_BUCKET.has(String(task.bucket))) return false;
  if (task.bucket === 'someday') return false;
  if (task.waiting_status === 'waiting' || task.waiting_status === 'follow_up_due') return false;
  if (task.waiting_on) return false;
  if (isBlockedByDeps(task, all)) return false;
  return task.status === 'open' || task.status === 'in_progress' || task.status === 'deferred';
}

function isWaiting(task: Task): boolean {
  if (DONE.has(String(task.status))) return false;
  return Boolean(
    task.waiting_on ||
      task.waiting_status === 'waiting' ||
      task.waiting_status === 'follow_up_due'
  );
}

function isBlockedByDeps(task: Task, all: Task[]): boolean {
  if (task.blocked_since) return true;
  const deps = task.depends_on ?? [];
  if (!deps.length) return false;
  const byId = new Map(all.map((t) => [t.id, t]));
  return deps.some((id) => {
    const dep = byId.get(id);
    if (!dep) return true;
    return !DONE.has(String(dep.status));
  });
}

function openMilestones(project: Project): Milestone[] {
  return projectMilestones(project).filter((m) => m.status === 'open');
}

/**
 * Deterministic next-action coverage for one active project.
 * Done/dead work never counts. Blocked items alone are not executable.
 */
export function inspectProjectHealth(
  project: Project,
  tasks: Task[],
  nowIso = new Date().toISOString()
): ProjectHealthResult {
  const children = tasks.filter((t) => t.parent_project_id === project.id);
  const executable = children.filter((t) => isOpenExecutable(t, tasks));
  const waiting = children.filter(isWaiting);
  const blocked = children.filter(
    (t) => !DONE.has(String(t.status)) && isBlockedByDeps(t, tasks) && !isWaiting(t)
  );
  const milestones = openMilestones(project);
  const unmet: string[] = [];
  for (const m of milestones) {
    for (const dep of m.depends_on ?? []) {
      const child = children.find((t) => t.id === dep);
      if (!child || !DONE.has(String(child.status))) unmet.push(dep);
    }
  }

  const base = {
    project_id: project.id,
    executable_next_actions: executable.map((t) => t.id),
    waiting_task_ids: waiting.map((t) => t.id),
    blocked_task_ids: blocked.map((t) => t.id),
    open_milestones: milestones.map((m) => m.id),
    unmet_dependencies: unmet
  };

  if (project.status === 'stalled' || project.stall_flagged_at) {
    return {
      ...base,
      health: 'stalled',
      reason: 'Project is flagged stalled.'
    };
  }

  if (executable.length > 0) {
    return {
      ...base,
      health: 'healthy',
      reason: `${executable.length} executable next action(s).`
    };
  }

  if (waiting.length > 0 && blocked.length === 0) {
    return {
      ...base,
      health: 'waiting_only',
      reason: 'Only waiting items — no independent next action.'
    };
  }

  if (blocked.length > 0) {
    return {
      ...base,
      health: 'blocked',
      reason: 'Open work is blocked by unmet dependencies.'
    };
  }

  void nowIso;
  return {
    ...base,
    health: 'missing_next_action',
    reason: 'No open executable next action.'
  };
}

export function inspectActiveProjectsHealth(
  projects: Project[],
  tasks: Task[],
  nowIso?: string
): ProjectHealthResult[] {
  return projects
    .filter((p) => p.status === 'active' || p.status === 'revived')
    .map((p) => inspectProjectHealth(p, tasks, nowIso));
}
