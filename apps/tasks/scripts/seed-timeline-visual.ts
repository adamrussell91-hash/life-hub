import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseHubPrefs } from '../src/domain/hub-prefs';
import { DEFAULT_TASK_PROPERTY_CONFIG } from '../src/domain/task-properties-defaults';
import { GoalSchema } from '../src/schemas/goal';
import { ProjectSchema } from '../src/schemas/project';
import { PlanningProfileSchema } from '../src/schemas/planning-profile';
import { TaskSchema } from '../src/schemas/task';
import type { KvAdapter } from '../src/services/store';
import * as keys from '../src/storage/keys';

type FxTerm = { term: 1 | 2 | 3 | 4; starts_on: string; ends_on: string };
type Fixture = {
  now: string;
  domains: Array<{ id: string; color: string }>;
  hub_prefs: { school_terms: Array<{ year: number; terms: FxTerm[] }>; marking_default_minutes_per_script: number };
  dreams: Array<{ id: string; title: string; target: string; origin: string | null }>;
  goals: Array<{ id: string; title: string; dream: string | null }>;
  projects: Array<{
    id: string;
    title: string;
    goal: string | null;
    domain: string;
    start: string;
    end: string;
    baselineEnd?: string;
    ribbon?: boolean;
    submission?: string;
  }>;
  milestones: Array<{ id: string; project: string; title: string; due: string; deps?: string[] }>;
  walls?: Array<{ id: string; label: string; start: string; end: string; source: string }>;
  tasks: Array<{
    id: string;
    title: string;
    project: string | null;
    parent?: string;
    domain: string;
    due: string | null;
    est: number | null;
    status: string;
    blocked?: boolean;
    deps?: string[];
    step?: number;
    apst?: string[];
    marking?: {
      cls: string;
      scripts: number;
      marked: number;
      rate: number;
      collected: string;
      returnBy: string;
    } | null;
  }>;
};

const FIXTURE_URL = new URL('../../../docs/proposals/timeline-reference/fixture.json', import.meta.url);

function loadFixture(): Fixture {
  return JSON.parse(readFileSync(fileURLToPath(FIXTURE_URL), 'utf8')) as Fixture;
}

export async function seedTimelineVisualFixture(kv: KvAdapter): Promise<{ tasks: number; projects: number; goals: number }> {
  const fixture = loadFixture();
  const domainIds = new Set(DEFAULT_TASK_PROPERTY_CONFIG.domains.map((domain) => domain.id));
  const domains = DEFAULT_TASK_PROPERTY_CONFIG.domains.map((domain) => {
    const match = fixture.domains.find((item) => item.id === domain.id);
    return match ? { ...domain, color: match.color } : domain;
  });
  for (const domain of fixture.domains) {
    if (!domainIds.has(domain.id)) domains.push({ id: domain.id, label: domain.id, color: domain.color });
  }
  await kv.setJSON(keys.taskPropertiesKey(), { ...DEFAULT_TASK_PROPERTY_CONFIG, domains });

  const prefs = parseHubPrefs({
    school_terms: fixture.hub_prefs.school_terms,
    marking_default_minutes_per_script: fixture.hub_prefs.marking_default_minutes_per_script,
    timezone: 'Australia/Sydney'
  });
  await kv.setJSON(keys.hubPrefsKey(), prefs);

  const twoHours = [{ start: '09:00', end: '11:00' }];
  const closed = [{ start: '00:00', end: '00:00' }];
  await kv.setJSON(
    keys.planningProfileKey(),
    PlanningProfileSchema.parse({
      schema_version: 1,
      id: 'default',
      work_windows: {
        mon: twoHours,
        tue: twoHours,
        wed: twoHours,
        thu: twoHours,
        fri: twoHours,
        sat: twoHours,
        sun: closed
      },
      updated_at: fixture.now
    })
  );

  const milestonesByProject = new Map<string, Fixture['milestones']>();
  for (const milestone of fixture.milestones) {
    const list = milestonesByProject.get(milestone.project) ?? [];
    list.push(milestone);
    milestonesByProject.set(milestone.project, list);
  }

  const projects = fixture.projects.map((project) =>
    ProjectSchema.parse({
      schema_version: 1,
      id: project.id,
      title: project.title,
      parent_goal_id: project.goal,
      status: 'active',
      type: 'standard',
      current_end_date: project.end,
      baseline_end_date: project.baselineEnd ?? null,
      standards_ribbon: Boolean(project.ribbon),
      submission_date: project.submission ?? null,
      created_at: `${project.start}T12:00:00.000Z`,
      updated_at: fixture.now,
      milestones: (milestonesByProject.get(project.id) ?? []).map((milestone) => ({
        id: milestone.id,
        project_id: project.id,
        title: milestone.title,
        due_date: milestone.due,
        status: 'open',
        depends_on: milestone.deps ?? []
      }))
    })
  );
  for (const wall of fixture.walls ?? []) {
    if (projects.some((project) => project.id === wall.source)) {
      const host = projects.find((project) => project.id === wall.source);
      if (host) host.life_wall = { starts_on: wall.start, ends_on: wall.end, label: wall.label };
      continue;
    }
    projects.push(
      ProjectSchema.parse({
        schema_version: 1,
        id: wall.source,
        title: wall.label,
        status: 'active',
        type: 'standard',
        current_end_date: wall.end,
        created_at: `${wall.start}T12:00:00.000Z`,
        updated_at: fixture.now,
        life_wall: { starts_on: wall.start, ends_on: wall.end, label: wall.label }
      })
    );
  }
  for (const project of projects) await kv.setJSON(keys.projectKey(project.id), project);
  await kv.setJSON(keys.projectsIndexKey(), { ids: projects.map((project) => project.id) });

  const goals = fixture.goals.map((goal) =>
    GoalSchema.parse({
      schema_version: 1,
      id: goal.id,
      title: goal.title,
      parent_someday_id: goal.dream,
      status: 'active',
      created_at: fixture.now,
      updated_at: fixture.now
    })
  );
  for (const goal of goals) await kv.setJSON(keys.goalKey(goal.id), goal);
  await kv.setJSON(keys.goalsIndexKey(), { ids: goals.map((goal) => goal.id) });

  const dreams = fixture.dreams.map((dream) =>
    TaskSchema.parse({
      schema_version: 1,
      id: dream.id,
      title: dream.title,
      domain: 'professional',
      bucket: 'someday',
      someday_kind: 'dreams_jar',
      target_date: dream.target,
      origin_date: dream.origin,
      status: 'open',
      created_at: fixture.now,
      updated_at: fixture.now
    })
  );
  const tasks = fixture.tasks.map((raw) => {
    const marking = raw.marking
      ? {
          class_label: raw.marking.cls,
          scripts: raw.marking.scripts,
          minutes_per_script: raw.marking.rate,
          collected_on: raw.marking.collected,
          return_by: raw.marking.returnBy,
          scripts_marked: raw.marking.marked
        }
      : null;
    return TaskSchema.parse({
      schema_version: 1,
      id: raw.id,
      title: raw.title,
      domain: raw.domain,
      parent_project_id: raw.project,
      parent_task_id: raw.parent ?? null,
      step_order: raw.step ?? 0,
      kind: marking ? 'marking_shadow' : raw.parent ? 'step' : 'task',
      status: raw.status,
      due_date: marking?.return_by ?? raw.due,
      estimated_duration: marking ? marking.scripts * (marking.minutes_per_script ?? 0) : raw.est,
      depends_on: raw.deps ?? [],
      dependency_links: (raw.deps ?? []).map((from) => ({ from_id: from, type: 'FS', offset_days: 0 })),
      blocked_since: raw.blocked ? '2026-09-18' : null,
      apst_focus: raw.apst,
      marking,
      created_at: fixture.now,
      updated_at: fixture.now
    });
  });
  const allTasks = [...dreams, ...tasks];
  for (const task of allTasks) await kv.setJSON(keys.taskKey(task.id), task);
  await kv.setJSON(keys.tasksIndexKey(), { ids: allTasks.map((task) => task.id) });
  return { tasks: allTasks.length, projects: projects.length, goals: goals.length };
}
