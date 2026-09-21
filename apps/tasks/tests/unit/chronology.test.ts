import { describe, expect, it } from 'vitest';
import {
  chronologyAxisKeys,
  chronologyBounds,
  chronologyTickStep,
  collectChronologyItems,
  dayOffset,
  packChronologyLanes
} from '@/domain/chronology';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import type { Program } from '@/schemas/program';

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    schema_version: 1,
    description: '',
    kind: 'task',
    bucket: 'active',
    step_order: 0,
    domain: 'teaching',
    framework_used: null,
    estimated_duration: 480,
    actual_duration: null,
    due_date: '2026-09-10',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    completed_at: null,
    status: 'open',
    blocked_since: null,
    priority: 'medium',
    parent_project_id: 'p1',
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

function project(partial: Partial<Project> & Pick<Project, 'id' | 'title'>): Project {
  return {
    schema_version: 1,
    description: '',
    parent_goal_id: null,
    tags: [],
    arc_summary: '',
    status: 'active',
    type: 'standard',
    milestones: [],
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    baseline_end_date: null,
    current_end_date: '2026-09-10',
    review_summary: null,
    stall_flagged_at: null,
    competition_or_event_type: null,
    key_dates: null,
    student_group_reference: null,
    generated_admin_tasks: [],
    drafted_documents: null,
    linked_program_id: null,
    ...partial
  };
}

function program(partial: Partial<Program> & Pick<Program, 'id' | 'name'>): Program {
  return {
    schema_version: 1,
    types: ['Competition'],
    subjects: [],
    month: 'October',
    age_groups: [],
    competition_level: null,
    competition_length: null,
    location: '',
    organiser: '',
    cost: '',
    cost_basis: null,
    description: '',
    registration_link: null,
    registration_window: '',
    not_available_nsw: false,
    not_available_reason: '',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...partial
  };
}

describe('chronology', () => {
  it('builds ranges from projects and skips tasks, undated work, and buried projects', () => {
    const items = collectChronologyItems(
      [
        task({ id: 't1', title: 'Pack slips', due_date: '2026-09-10', parent_project_id: 'p1' }),
        task({ id: 't2', title: 'Orphan task', due_date: '2026-09-11', parent_project_id: null })
      ],
      [
        project({ id: 'p1', title: 'Camp', current_end_date: '2026-09-10' }),
        project({ id: 'p2', title: 'No target', current_end_date: null, baseline_end_date: null }),
        project({
          id: 'p3',
          title: 'Buried',
          status: 'archived_dead',
          current_end_date: '2026-09-12'
        })
      ]
    );
    expect(items.map((item) => item.title)).toEqual(['Camp']);
    expect(items[0]).toMatchObject({
      id: 'p1',
      href: '#/project/p1',
      source: 'project',
      status: 'active',
      kindLabel: 'Project',
      endKey: '2026-09-10'
    });
    expect(items[0]?.startKey <= items[0]!.endKey).toBe(true);
    expect(items.some((item) => item.title === 'Pack slips')).toBe(false);
  });

  it('labels excursions and academic programs and links them to the full page', () => {
    const items = collectChronologyItems(
      [],
      [
        project({
          id: 'ex1',
          title: 'Ethics heat',
          type: 'excursion',
          status: 'stalled',
          current_end_date: '2026-10-10'
        }),
        project({
          id: 'prog1',
          title: 'MindWorks',
          type: 'academic_program',
          current_end_date: '2026-11-15'
        })
      ]
    );
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Ethics heat',
          source: 'excursion',
          kindLabel: 'Excursion',
          status: 'stalled',
          href: '#/project/ex1'
        }),
        expect.objectContaining({
          title: 'MindWorks',
          source: 'program',
          kindLabel: 'Program',
          href: '#/project/prog1'
        })
      ])
    );
  });

  it('adds a linked catalogue program on its month, not the whole catalogue', () => {
    const items = collectChronologyItems(
      [],
      [
        project({
          id: 'ex1',
          title: 'Ethics heat',
          type: 'excursion',
          current_end_date: '2026-10-10',
          linked_program_id: 'cat_ethics'
        })
      ],
      [
        program({ id: 'cat_ethics', name: 'Ethics Olympiad', month: 'October' }),
        program({ id: 'cat_other', name: 'Unlinked dump', month: 'March' })
      ]
    );
    expect(items.map((item) => item.title).sort()).toEqual(['Ethics Olympiad', 'Ethics heat']);
    const catalogue = items.find((item) => item.id === 'cat_ethics');
    expect(catalogue).toMatchObject({
      href: '#/programs?id=cat_ethics',
      source: 'program',
      startKey: '2026-10-01',
      endKey: '2026-10-31'
    });
  });

  it('packs non-overlapping work onto one lane', () => {
    const lanes = packChronologyLanes([
      {
        id: 'a',
        href: '#/project/a',
        title: 'Early',
        startKey: '2026-07-01',
        endKey: '2026-07-20',
        source: 'project',
        status: 'active',
        kindLabel: 'Project'
      },
      {
        id: 'b',
        href: '#/project/b',
        title: 'Later',
        startKey: '2026-08-01',
        endKey: '2026-08-20',
        source: 'excursion',
        status: 'active',
        kindLabel: 'Excursion'
      },
      {
        id: 'c',
        href: '#/project/c',
        title: 'Overlap',
        startKey: '2026-07-10',
        endKey: '2026-08-05',
        source: 'program',
        status: 'active',
        kindLabel: 'Program'
      }
    ]);
    expect(lanes).toHaveLength(2);
    expect(lanes[0]?.map((item) => item.id)).toEqual(['a', 'b']);
    expect(lanes[1]?.map((item) => item.id)).toEqual(['c']);
  });

  it('computes bounds, day offsets, and a coarser tick on long ranges', () => {
    const items = collectChronologyItems(
      [],
      [project({ id: 'p1', title: 'A', current_end_date: '2026-09-10' })]
    );
    const bounds = chronologyBounds(items, new Date('2026-09-05T00:00:00'));
    expect(bounds.days).toBeGreaterThanOrEqual(14);
    expect(dayOffset(bounds.start, items[0]!.endKey)).toBeGreaterThanOrEqual(0);
    expect(chronologyTickStep(40)).toBe(7);
    expect(chronologyTickStep(80)).toBe(14);
    expect(chronologyTickStep(200)).toBe(30);
    expect(chronologyAxisKeys(new Date(2026, 0, 1), 200)).toContain('2026-02-01');
  });
});
