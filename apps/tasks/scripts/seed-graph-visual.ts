import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TaskSchema } from '../src/schemas/task';
import { ProjectSchema } from '../src/schemas/project';
import { DEFAULT_TASK_PROPERTY_CONFIG } from '../src/domain/task-properties-defaults';
import type { KvAdapter } from '../src/services/store';
import * as keys from '../src/storage/keys';

type Fixture = {
  now: string;
  domains: Array<{ id: string; label: string; color: string }>;
  projects: Array<{
    id: string;
    title: string;
    created_at: string;
    current_end_date: string;
    milestones?: Array<{
      id: string;
      project_id: string;
      title: string;
      due_date: string | null;
      status: string;
      depends_on?: string[];
    }>;
  }>;
  tasks: Array<Record<string, unknown>>;
  orbit_extra_tasks: Array<Record<string, unknown>>;
};

const FIXTURE_URL = new URL('../../../docs/proposals/graph-reference/fixture.json', import.meta.url);

function loadFixture(): Fixture {
  return JSON.parse(readFileSync(fileURLToPath(FIXTURE_URL), 'utf8')) as Fixture;
}

function stamp(raw: Record<string, unknown>, fallback: string): string {
  return String(
    raw.completed_at ?? raw.blocked_since ?? raw.waiting_since ?? raw.created_at ?? fallback
  );
}

export async function seedGraphVisualFixture(kv: KvAdapter): Promise<{ tasks: number; projects: number }> {
  const fixture = loadFixture();
  const properties = {
    ...DEFAULT_TASK_PROPERTY_CONFIG,
    domains: fixture.domains.map((domain) => ({
      id: domain.id,
      label: domain.label,
      color: domain.color
    }))
  };
  await kv.setJSON(keys.taskPropertiesKey(), properties);

  const projects = fixture.projects.map((project) =>
    ProjectSchema.parse({
      schema_version: 1,
      id: project.id,
      title: project.title,
      created_at: project.created_at,
      updated_at: project.created_at,
      current_end_date: project.current_end_date,
      status: 'active',
      type: 'standard',
      milestones: project.milestones ?? []
    })
  );
  for (const project of projects) {
    await kv.setJSON(keys.projectKey(project.id), project);
  }
  await kv.setJSON(keys.projectsIndexKey(), { ids: projects.map((p) => p.id) });

  const rawTasks = [...fixture.tasks, ...fixture.orbit_extra_tasks];
  const tasks = rawTasks.map((raw) => {
    const created = stamp(raw, fixture.now);
    return TaskSchema.parse({
      schema_version: 1,
      id: raw.id,
      title: raw.title,
      domain: raw.domain,
      parent_project_id: raw.parent_project_id ?? null,
      parent_task_id: raw.parent_task_id ?? null,
      step_order: raw.step_order ?? 0,
      status: raw.status ?? 'open',
      completed_at: raw.completed_at ?? null,
      due_date: raw.due_date ?? null,
      estimated_duration: raw.estimated_duration ?? null,
      depends_on: raw.depends_on ?? [],
      blocked_since: raw.blocked_since ?? null,
      waiting_on: raw.waiting_on ?? null,
      waiting_status: raw.waiting_status ?? null,
      waiting_since: raw.waiting_since ?? null,
      created_at: created,
      updated_at: created
    });
  });
  for (const task of tasks) {
    await kv.setJSON(keys.taskKey(task.id), task);
  }
  await kv.setJSON(keys.tasksIndexKey(), { ids: tasks.map((t) => t.id) });
  return { tasks: tasks.length, projects: projects.length };
}
