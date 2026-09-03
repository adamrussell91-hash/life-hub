import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import { planAdminTaskForKind, type KeyDateKind } from '@/domain/excursion';
import { tasksApi } from '@/services/client-api';

/** Persist a missing key-date / event as a real admin task. */
export async function materializeExcursionAdminTask(
  project: Project,
  kind: KeyDateKind,
  dueDate: string
): Promise<Task> {
  const planned = planAdminTaskForKind(kind, project, dueDate);
  const created = await tasksApi.createTask({
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
  await tasksApi.updateProject(project.id, {
    generated_admin_tasks: [...(project.generated_admin_tasks ?? []), created.id]
  });
  return created;
}
