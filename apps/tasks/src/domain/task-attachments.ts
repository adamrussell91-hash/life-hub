import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import { projectPageHash, taskPageHash } from '@/domain/cards';

/** Something a task is attached to, shown as a pill on the card. */
export type TaskAttachment = {
  kind: string;
  label: string;
  href?: string | null;
};

export type TaskAttachmentScope = {
  projects?: readonly Project[];
  tasks?: readonly Task[];
  goals?: readonly { id: string; title: string }[];
};

const KIND_LABELS: Record<string, string> = {
  project: 'Project',
  excursion: 'Excursion',
  program: 'Program',
  academic_program: 'Program',
  task: 'Task',
  goal: 'Goal',
  place: 'Place',
  device: 'Device',
  person: 'Person',
  other: 'Context',
  event: 'Event',
  meeting: 'Meeting',
  organisation: 'Org',
  organization: 'Org',
  lesson: 'Lesson',
  class: 'Class',
  unit: 'Unit',
  page: 'Page',
  application: 'App',
  contact: 'Contact',
  collaborator: 'Collaborator'
};

export function attachmentKindLabel(kind: string): string {
  const known = KIND_LABELS[kind];
  if (known) return known;
  if (!kind) return 'Link';
  return kind.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function projectKind(type: Project['type'] | undefined): string {
  if (type === 'excursion') return 'excursion';
  if (type === 'academic_program') return 'program';
  return 'project';
}

/**
 * Attachments already stored on the task (project, parent task, contexts,
 * someday links). Universal-link entities (events, people, …) are added later.
 */
export function taskAttachments(task: Task, scope: TaskAttachmentScope = {}): TaskAttachment[] {
  const out: TaskAttachment[] = [];
  const seen = new Set<string>();

  function push(kind: string, label: string, href?: string | null): void {
    const text = label.trim();
    if (!text) return;
    const key = `${kind}:${text.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, label: text, href: href ?? null });
  }

  function pushProject(project: Project): void {
    push(projectKind(project.type), project.title, projectPageHash(project.id));
    if (project.parent_goal_id && scope.goals) {
      const goal = scope.goals.find((item) => item.id === project.parent_goal_id);
      if (goal) push('goal', goal.title);
    }
  }

  if (task.parent_project_id) {
    const project = scope.projects?.find((item) => item.id === task.parent_project_id);
    if (project) pushProject(project);
    else if (scope.projects) push('project', 'Missing project');
  }

  if (task.parent_task_id) {
    const parent = scope.tasks?.find((item) => item.id === task.parent_task_id);
    if (parent) push('task', parent.title, taskPageHash(parent.id));
    else if (scope.tasks) push('task', 'Missing task');
  }

  for (const context of task.contexts ?? []) {
    push(context.kind, context.value);
  }

  for (const id of task.linked_project_ids ?? []) {
    const project = scope.projects?.find((item) => item.id === id);
    if (project) pushProject(project);
  }

  for (const id of task.linked_goal_ids ?? []) {
    const goal = scope.goals?.find((item) => item.id === id);
    if (goal) push('goal', goal.title);
  }

  return out;
}

/** One universal-link endpoint, already flattened by the caller. */
export function attachmentFromEndpoint(input: {
  status?: string;
  relationshipType: string;
  kind: string;
  label: string;
  href?: string | null;
}): TaskAttachment | null {
  if (input.status && input.status !== 'current') return null;
  const label = input.label.trim();
  if (!label) return null;
  const kind =
    input.relationshipType === 'tagged_with' ? input.kind || 'event' : input.relationshipType;
  return { kind, label, href: input.href ?? null };
}
