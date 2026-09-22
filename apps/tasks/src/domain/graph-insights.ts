import type { AgentMutation } from '@/domain/agent-mutations';
import {
  collisions,
  criticalPath,
  doFirst,
  formatFriendlyDay,
  nodeState,
  pace,
  projectRoute,
  serviceStatus,
  unlockCount,
  type ServiceStatusId
} from '@/domain/graph-model';
import { addDays, parseDue, startOfDay, toDateKey } from '@/domain/queries';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';

export type GraphViewId = 'lines' | 'branch' | 'orbit';

export type InsightSeverity = 'high' | 'medium' | 'low';

export type GraphInsightAnchor =
  | { kind: 'task'; id: string }
  | { kind: 'project'; id: string }
  | { kind: 'link'; from: string; to: string }
  | { kind: 'date'; date: string };

export type GraphInsightDraft = {
  to?: string;
  subject?: string;
  body: string;
};

export type GraphInsight = {
  id: string;
  view: GraphViewId;
  severity: InsightSeverity;
  anchor: GraphInsightAnchor;
  headline: string;
  detail: string;
  proposal?: AgentMutation[];
  draft?: GraphInsightDraft;
};

export type InsightDismissal = {
  id: string;
  fingerprint: string;
};

export function insightFingerprint(insight: Pick<GraphInsight, 'id' | 'headline' | 'detail'>): string {
  return `${insight.id}::${insight.headline}::${insight.detail}`;
}

export function isInsightDismissed(
  insight: GraphInsight,
  dismissed: InsightDismissal[]
): boolean {
  const row = dismissed.find((item) => item.id === insight.id);
  if (!row) return false;
  return row.fingerprint === insightFingerprint(insight);
}

function severityForService(status: ServiceStatusId): InsightSeverity | null {
  if (status === 'major_delays' || status === 'suspended') return 'high';
  if (status === 'minor_delays') return 'medium';
  return null;
}

function blockedCause(project: Project, tasks: Task[], now: Date): Task | null {
  const route = projectRoute(project, tasks);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const blocked: Task[] = [];
  for (const station of route.stations) {
    if (!station.task) continue;
    const state = nodeState(station.task, tasks, now);
    if (state.state === 'blocked') blocked.push(station.task);
  }
  const marked = blocked.find((task) => task.blocked_since);
  if (marked) return marked;
  if (blocked[0]) return blocked[0];
  const waiting = route.stations.find((s) => s.task && nodeState(s.task, tasks, now).state === 'waiting');
  return waiting?.task ?? byId.get(route.mainline.find((s) => s.task && s.task.status !== 'done')?.id ?? '') ?? null;
}

function daysBlocked(task: Task, now: Date): number {
  const since = parseDue(task.blocked_since ?? task.waiting_since ?? task.updated_at);
  if (!since) return 0;
  return Math.max(0, Math.round((startOfDay(now).getTime() - startOfDay(since).getTime()) / 86_400_000));
}

export function buildGraphInsights(
  tasks: Task[],
  projects: Project[],
  now: Date = new Date(),
  dismissed: InsightDismissal[] = []
): GraphInsight[] {
  const insights: GraphInsight[] = [];
  const activeProjects = projects.filter((p) => p.status === 'active' || p.status === 'revived' || p.status === 'stalled');

  for (const project of activeProjects) {
    const children = tasks.filter((t) => t.parent_project_id === project.id);
    const status = serviceStatus(project, tasks, now);
    const sev = severityForService(status.status);
    if (sev) {
      const cause = blockedCause(project, tasks, now);
      const blockedDays = cause ? daysBlocked(cause, now) : 0;
      const headline =
        status.status === 'suspended'
          ? `${project.title} is suspended`
          : `${project.title} has ${status.label.toLowerCase()}`;
      const detail = cause
        ? `The delay is ${cause.title}${blockedDays ? `, blocked ${blockedDays} days` : ''}. ${status.reason}`
        : status.reason;
      const proposal: AgentMutation[] = cause
        ? [
            {
              kind: 'task_update',
              summary: `Chase ${cause.title}`,
              task_id: cause.id,
              patch: cause.waiting_status
                ? { waiting_status: 'follow_up_due' }
                : { priority: 'high' }
            }
          ]
        : [];
      insights.push({
        id: `lines-service-${project.id}`,
        view: 'lines',
        severity: sev,
        anchor: { kind: 'project', id: project.id },
        headline,
        detail,
        proposal: proposal.length ? proposal : undefined,
        draft: cause?.waiting_on
          ? {
              to: cause.waiting_on,
              subject: `Following up: ${cause.title}`,
              body: `Hi,\n\nChecking in on ${cause.title} for ${project.title}. Can you give me a status?\n\nThanks,\nAdam`
            }
          : undefined
      });
    }

    const measured = pace(project, tasks, now);
    if (measured && measured.behind >= 1) {
      const missing = children.filter((t) => t.status !== 'done' && t.status !== 'dead');
      if (missing.length && missing.length <= 3) {
        const title = `Check in on ${project.title}`;
        insights.push({
          id: `lines-suggest-${project.id}`,
          view: 'lines',
          severity: 'medium',
          anchor: { kind: 'project', id: project.id },
          headline: 'Clare suggests a station',
          detail: `${project.title} is ${measured.behind} stations behind pace. A check-in station would make the next move visible.`,
          proposal: [
            {
              kind: 'task_create',
              summary: `Add “${title}” to ${project.title}`,
              patch: {
                title,
                domain: missing[0]?.domain ?? 'other',
                parent_project_id: project.id,
                step_order: children.reduce((max, t) => Math.max(max, t.step_order), 0) + 1,
                status: 'open',
                source: 'suggested_by_agent'
              }
            }
          ]
        });
      }
    }
  }

  for (const project of activeProjects) {
    const children = tasks.filter((t) => t.parent_project_id === project.id);
    const path = criticalPath(project.id, tasks);
    const ranked = doFirst(children, now);
    const top = ranked[0];
    if (top) {
      insights.push({
        id: `branch-dofirst-${project.id}`,
        view: 'branch',
        severity: 'medium',
        anchor: { kind: 'task', id: top.taskId },
        headline: `Do first · frees ${top.unlockCount}`,
        detail: top.explanation
      });
    }

    const byId = new Map(tasks.map((t) => [t.id, t]));
    const dependents = (id: string) => children.filter((item) => (item.depends_on ?? []).includes(id));
    for (const task of children) {
      if (task.status === 'done' || task.status === 'dead') continue;
      if (!task.parent_task_id && !(task.depends_on ?? []).length && path.length > 1 && !path.includes(task.id)) {
        const likely = path.find((id) => {
          const node = byId.get(id);
          return node && node.status !== 'done';
        });
        if (likely && likely !== task.id) {
          const from = byId.get(likely);
          insights.push({
            id: `branch-link-${task.id}-${likely}`,
            view: 'branch',
            severity: 'low',
            anchor: { kind: 'link', from: likely, to: task.id },
            headline: 'Clare: link?',
            detail: `${task.title} probably needs ${from?.title ?? 'an earlier station'} first.`,
            proposal: [
              {
                kind: 'task_update',
                summary: `Link ${task.title} to ${from?.title ?? likely}`,
                task_id: task.id,
                patch: { depends_on: [...(task.depends_on ?? []), likely] }
              }
            ]
          });
        }
      }
      for (const other of children) {
        if (other.id === task.id || other.status === 'done' || other.status === 'dead') continue;
        if ((task.depends_on ?? []).includes(other.id) || (other.depends_on ?? []).includes(task.id)) continue;
        if (task.step_order !== other.step_order) continue;
        const shared = dependents(task.id).some((down) => (other.depends_on ?? []).includes(down.id) || dependents(other.id).some((item) => item.id === down.id));
        if (!shared) continue;
        const to = nodeState(other, tasks, now).state === 'blocked' ? other : task;
        const from = to.id === other.id ? task : other;
        if (insights.some((row) => row.id === `branch-link-${from.id}-${to.id}`)) continue;
        insights.push({
          id: `branch-link-${from.id}-${to.id}`,
          view: 'branch',
          severity: 'low',
          anchor: { kind: 'link', from: from.id, to: to.id },
          headline: 'Clare: link?',
          detail: `${to.title} probably needs ${from.title} first.`,
          proposal: [
            {
              kind: 'task_update',
              summary: `Link ${to.title} to ${from.title}`,
              task_id: to.id,
              patch: { depends_on: [...(to.depends_on ?? []), from.id] }
            }
          ]
        });
      }
    }

    const waiting = children.find((t) => t.waiting_on && (t.waiting_status === 'waiting' || t.waiting_status === 'follow_up_due'));
    if (waiting) {
      insights.push({
        id: `branch-nudge-${waiting.id}`,
        view: 'branch',
        severity: 'medium',
        anchor: { kind: 'task', id: waiting.id },
        headline: `Chase ${waiting.waiting_on}`,
        detail: `${waiting.title} is waiting on ${waiting.waiting_on}.`,
        draft: {
          to: waiting.waiting_on,
          subject: `Following up: ${waiting.title}`,
          body: `Hi ${waiting.waiting_on},\n\nJust checking in on ${waiting.title}. Let me know where this sits.\n\nThanks,\nAdam`
        }
      });
    }
  }

  const hits = collisions(tasks, now, 7);
  for (const hit of hits) {
    const day = parseDue(hit.dateKey) ?? new Date(`${hit.dateKey}T12:00:00`);
    const move = hit.tasks.find((t) => t.id === hit.suggestedMoveId);
    const nextDay = toDateKey(addDays(day, 1));
    insights.push({
      id: `orbit-collision-${hit.dateKey}`,
      view: 'orbit',
      severity: 'high',
      anchor: { kind: 'date', date: hit.dateKey },
      headline: `Collision on ${formatFriendlyDay(day)}`,
      detail: `Clare: collision on ${formatFriendlyDay(day)}. ${hit.tasks.length} tasks land that day. Want me to suggest one to move?`,
      proposal: move
        ? [
            {
              kind: 'task_update',
              summary: `Move ${move.title} to ${nextDay}`,
              task_id: move.id,
              patch: { due_date: nextDay }
            }
          ]
        : undefined
    });
  }

  const overdue = tasks.filter((t) => nodeState(t, tasks, now).overdue);
  if (overdue.length) {
    insights.push({
      id: 'orbit-overdue',
      view: 'orbit',
      severity: 'medium',
      anchor: { kind: 'task', id: overdue[0]!.id },
      headline:
        overdue.length === 1
          ? '1 overdue and spinning at the centre'
          : `${overdue.length} overdue and spinning at the centre`,
      detail: overdue.map((t) => t.title).join(', ')
    });
  }

  void unlockCount;
  return insights.filter((insight) => !isInsightDismissed(insight, dismissed));
}

export function rankInsights(insights: GraphInsight[]): GraphInsight[] {
  const rank: Record<InsightSeverity, number> = { high: 0, medium: 1, low: 2 };
  return [...insights].sort((a, b) => rank[a.severity] - rank[b.severity] || a.headline.localeCompare(b.headline));
}
