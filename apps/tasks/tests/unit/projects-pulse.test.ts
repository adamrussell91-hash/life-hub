import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import type { SeedData } from '@/services/types';
import { findStallCandidates } from '@/domain/stall';
import {
  classifyProjectLifecycle,
  deadlineBucket,
  findPortfolioTension,
  findRetroCandidate,
  groupPulseCards,
  projectEnergy,
  projectLifecycleMix,
  runningProjectCount,
  buildProjectPulseCard
} from '@/domain/projects-pulse';

const seed = JSON.parse(
  readFileSync(resolve(process.cwd(), 'fixtures/seed.json'), 'utf8')
) as SeedData;

const now = new Date('2026-08-26T12:00:00');

function project(partial: Partial<Project> & Pick<Project, 'id' | 'title'>): Project {
  return {
    schema_version: 1,
    description: '',
    parent_goal_id: null,
    tags: [],
    arc_summary: '',
    type: 'standard',
    milestones: [],
    status: 'active',
    baseline_end_date: null,
    current_end_date: null,
    review_summary: null,
    stall_flagged_at: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    competition_or_event_type: null,
    key_dates: null,
    student_group_reference: null,
    generated_admin_tasks: [],
    drafted_documents: null,
    ...partial
  };
}

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    schema_version: 1,
    description: '',
    kind: 'task',
    bucket: 'active',
    step_order: 0,
    domain: 'teaching',
    framework_used: null,
    estimated_duration: 30,
    actual_duration: null,
    due_date: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    completed_at: null,
    status: 'open',
    blocked_since: null,
    priority: 'medium',
    parent_project_id: null,
    parent_task_id: null,
    depends_on: [],
    tags: [],
    recurrence_rule: null,
    due_time: null,
    remind_at: null,
    remind_dismissed_at: null,
    attachments: [],
    source: 'manual',
    ...partial
  };
}

describe('project lifecycle mix', () => {
  it('classifies seed projects into chart stages', () => {
    const stallIds = new Set(
      findStallCandidates(seed.projects, seed.tasks, now).map((item) => item.project.id)
    );
    expect(classifyProjectLifecycle(seed.projects.find((p) => p.id === 'proj_close_demo')!, seed.tasks, stallIds, now)).toBe(
      'needs_attention'
    );
    expect(classifyProjectLifecycle(seed.projects.find((p) => p.id === 'proj_stalled_masters')!, seed.tasks, stallIds, now)).toBe(
      'stalled'
    );
    expect(classifyProjectLifecycle(seed.projects.find((p) => p.id === 'proj_mindworks')!, seed.tasks, stallIds, now)).toBe(
      'on_the_go'
    );
    expect(classifyProjectLifecycle(seed.projects.find((p) => p.id === 'proj_ex_ethics_seed')!, seed.tasks, stallIds, now)).toBe(
      'not_started'
    );

    const mix = projectLifecycleMix(seed.projects, seed.tasks, stallIds, now);
    const byId = Object.fromEntries(mix.map((slice) => [slice.id, slice.count]));
    expect(byId.needs_attention).toBe(1);
    expect(byId.stalled).toBe(1);
    expect(byId.planning).toBe(0);
    expect(byId.on_the_go).toBe(1);
    expect(byId.not_started).toBe(2);
    expect(byId.completed).toBe(0);
    expect(runningProjectCount(mix)).toBe(2);
  });

  it('treats in-progress work as on the go and closed work as completed', () => {
    const live = project({ id: 'proj_go', title: 'On the go' });
    const done = project({ id: 'proj_done', title: 'Done', status: 'archived_dead' });
    const tasks = [
      task({
        id: 't1',
        title: 'Write',
        parent_project_id: 'proj_go',
        status: 'in_progress'
      })
    ];
    expect(classifyProjectLifecycle(live, tasks, new Set(), now)).toBe('on_the_go');
    expect(classifyProjectLifecycle(done, [], new Set(), now)).toBe('completed');
  });

  it('marks excursion work admin-heavy and goal-backed work high impact', () => {
    const excursion = project({
      id: 'proj_ex',
      title: 'Excursion',
      type: 'excursion',
      parent_goal_id: 'goal_1'
    });
    expect(projectEnergy(excursion, [])).toBe('admin_heavy');
    const card = buildProjectPulseCard(excursion, [], new Set(), now);
    expect(card.impactLabel).toContain('High impact');
  });

  it('groups cards by lifecycle and deadline', () => {
    const cards = [
      buildProjectPulseCard(
        project({ id: 'a', title: 'Soon', current_end_date: '2026-08-28' }),
        [],
        new Set(),
        now
      ),
      buildProjectPulseCard(
        project({ id: 'b', title: 'Closed', status: 'archived_dead' }),
        [],
        new Set(),
        now
      )
    ];
    const byStatus = groupPulseCards(cards, 'status', [], now);
    expect(byStatus.map((group) => group.id)).toEqual(['not_started', 'completed']);
    expect(deadlineBucket(cards[0]!.project, now)).toBe('this_week');
    const byDeadline = groupPulseCards(cards, 'deadline', [], now);
    expect(byDeadline[0]?.id).toBe('this_week');
  });

  it('flags overlapping deep-focus windows and a ready retro', () => {
    const left = buildProjectPulseCard(
      project({
        id: 'proj_a',
        title: 'HSC Tool',
        current_end_date: '2026-09-01',
        type: 'academic_program'
      }),
      [task({ id: 't-a', title: 'A', parent_project_id: 'proj_a', estimated_duration: 90 })],
      new Set(),
      now
    );
    const right = buildProjectPulseCard(
      project({
        id: 'proj_b',
        title: 'Ethics prep',
        current_end_date: '2026-09-04',
        type: 'academic_program'
      }),
      [task({ id: 't-b', title: 'B', parent_project_id: 'proj_b', estimated_duration: 90 })],
      new Set(),
      now
    );
    const tension = findPortfolioTension([left, right], [], now);
    expect(tension?.projectIds).toEqual(['proj_a', 'proj_b']);
    expect(tension?.message).toMatch(/HSC Tool/);

    const ready = buildProjectPulseCard(
      seed.projects.find((item) => item.id === 'proj_close_demo')!,
      seed.tasks,
      new Set(),
      now
    );
    const retro = findRetroCandidate([ready], now);
    expect(retro?.project.id).toBe('proj_close_demo');
    expect(retro?.title).toBe('Close-out retro');
  });
});
