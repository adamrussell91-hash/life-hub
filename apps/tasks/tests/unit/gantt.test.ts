import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SeedData } from '@/services/types';
import type { Task } from '@/schemas/task';
import {
  buildProjectGanttRows,
  buildScopedGanttRows,
  cascadeForward,
  collectDependencies,
  criticalPath,
  dateKeyAtX,
  dropTargetAt,
  layoutGantt,
  layoutGanttGroups,
  linksPatchForTask,
  placeholderGanttLayout,
  requiredStartIdx,
  wouldCreateCycle
} from '@/domain/gantt';

const seed = JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/seed.json'), 'utf8')) as SeedData;

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title' | 'due_date'>): Task {
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
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    completed_at: null,
    status: 'open',
    blocked_since: null,
    priority: 'medium',
    parent_project_id: 'proj_a',
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

describe('gantt layout', () => {
  it('builds rows for MindWorks with dependency edges', () => {
    const project = seed.projects.find((p) => p.id === 'proj_mindworks')!;
    const rows = buildProjectGanttRows(project, seed.tasks);
    expect(rows.some((r) => r.id === 'task_demo_lesson_pack')).toBe(true);
    expect(rows.some((r) => r.id === 'task_demo_publish')).toBe(true);
    expect(rows.some((r) => r.kind === 'milestone')).toBe(true);
    expect(rows.find((r) => r.id === 'task_demo_outline_units')?.parentTaskId).toBe(
      'task_demo_lesson_pack'
    );
    expect(rows.find((r) => r.id === 'task_demo_outline_units')?.depth).toBe(1);

    const layout = layoutGantt(rows);
    expect(layout).not.toBeNull();
    expect(layout!.bars.length).toBe(rows.length);
    expect(layout!.edges.some((e) => e.fromId === 'task_demo_lesson_pack' && e.toId === 'task_demo_publish')).toBe(
      true
    );
    expect(layout!.totalWidth).toBeGreaterThan(layout!.labelWidth);
    expect(layout!.ticks.length).toBeGreaterThan(0);
    expect(layout!.ticks[0]).toHaveProperty('date');
    expect(layout!.groupBounds).toHaveLength(1);
    expect(layout!.groupBounds[0]?.title).toBe('Project');
  });

  it('returns null when project has no dated tasks or milestones', () => {
    const project = {
      ...seed.projects[0]!,
      milestones: []
    };
    expect(layoutGantt(buildProjectGanttRows(project, []))).toBeNull();
  });

  it('groups all projects and can collapse a group', () => {
    const groups = buildScopedGanttRows(seed.projects, seed.tasks, 'all', null);
    expect(groups.length).toBeGreaterThan(1);
    const open = layoutGanttGroups(groups, { zoom: 'week' });
    const collapsed = layoutGanttGroups(groups, {
      zoom: 'week',
      collapsedGroups: [groups[0]!.project.id]
    });
    expect(open!.groupBounds.length).toBe(groups.length);
    expect(collapsed!.bars.length).toBeLessThan(open!.bars.length);
  });

  it('uses wider days in week zoom than term zoom', () => {
    const project = seed.projects.find((p) => p.id === 'proj_mindworks')!;
    const rows = buildProjectGanttRows(project, seed.tasks);
    const week = layoutGantt(rows, { zoom: 'week' });
    const term = layoutGantt(rows, { zoom: 'term' });
    expect(week!.dayWidth).toBeGreaterThan(term!.dayWidth);
  });
});

describe('gantt critical path and cascade', () => {
  it('marks a zero-slack FS chain as critical', () => {
    const project = seed.projects.find((p) => p.id === 'proj_mindworks')!;
    const chain = [
      task({
        id: 'a',
        title: 'A',
        due_date: '2026-08-17',
        estimated_duration: 480,
        parent_project_id: project.id
      }),
      task({
        id: 'b',
        title: 'B',
        due_date: '2026-08-18',
        estimated_duration: 480,
        parent_project_id: project.id,
        depends_on: ['a']
      }),
      task({
        id: 'c',
        title: 'C',
        due_date: '2026-08-19',
        estimated_duration: 480,
        parent_project_id: project.id,
        depends_on: ['b']
      })
    ];
    const rows = buildProjectGanttRows({ ...project, milestones: [] }, chain);
    const layout = layoutGantt(rows)!;
    const path = criticalPath(layout.bars);
    expect(path.nodes.has('a')).toBe(true);
    expect(path.nodes.has('b')).toBe(true);
    expect(path.nodes.has('c')).toBe(true);
    expect(path.edges.has('a>b')).toBe(true);
    expect(requiredStartIdx(layout.bars.find((b) => b.row.id === 'a')!, { type: 'FS', offsetDays: 0 }, 1)).toBe(
      layout.bars.find((b) => b.row.id === 'a')!.fIdx
    );
  });

  it('pushes dependents later and never pulls them earlier', () => {
    const items = [
      { id: 'a', kind: 'task' as const, due_date: '2026-08-20', estimated_duration: 480 },
      { id: 'b', kind: 'task' as const, due_date: '2026-08-21', estimated_duration: 480 }
    ];
    const shifted = cascadeForward(
      items,
      [{ fromId: 'a', toId: 'b', type: 'FS', offsetDays: 0 }],
      'a'
    );
    expect(shifted.has('b')).toBe(false);

    const later = cascadeForward(
      [
        { id: 'a', kind: 'task', due_date: '2026-08-22', estimated_duration: 480 },
        { id: 'b', kind: 'task', due_date: '2026-08-21', estimated_duration: 480 }
      ],
      [{ fromId: 'a', toId: 'b', type: 'FS', offsetDays: 0 }],
      'a'
    );
    expect(later.get('b')).toBe('2026-08-23');
  });

  it('reads typed dependency_links and writes both fields', () => {
    const item = task({
      id: 'child',
      title: 'Child',
      due_date: '2026-08-20',
      depends_on: ['old'],
      dependency_links: [{ from_id: 'pred', type: 'SS', offset_days: 2 }]
    });
    const links = collectDependencies([item], []);
    expect(links).toEqual([{ fromId: 'pred', toId: 'child', type: 'SS', offsetDays: 2 }]);
    expect(linksPatchForTask('child', [{ fromId: 'a', toId: 'child', type: 'FF', offsetDays: -1 }])).toEqual({
      depends_on: ['a'],
      dependency_links: [{ from_id: 'a', type: 'FF', offset_days: -1 }]
    });
  });

  it('rejects cyclic depends_on links', () => {
    expect(
      wouldCreateCycle(
        [
          { fromId: 'a', toId: 'b', type: 'FS', offsetDays: 0 },
          { fromId: 'b', toId: 'c', type: 'FS', offsetDays: 0 }
        ],
        'c',
        'a'
      )
    ).toBe(true);
    expect(wouldCreateCycle([{ fromId: 'a', toId: 'b', type: 'FS', offsetDays: 0 }], 'a', 'c')).toBe(false);
  });
});

describe('gantt drop targeting', () => {
  it('maps an x position to a local date and a bar hit', () => {
    const project = seed.projects.find((p) => p.id === 'proj_mindworks')!;
    const rows = buildProjectGanttRows(project, seed.tasks);
    const layout = layoutGantt(rows, { zoom: 'week' })!;
    const first = layout.bars[0]!;
    const key = dateKeyAtX(layout, first.x + 4);
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const target = dropTargetAt(layout, first.x + 8, first.y + 10, project.id);
    expect(target?.kind).toBe('bar');
    if (target?.kind === 'bar') expect(target.bar.row.id).toBe(first.row.id);
    const loose = dropTargetAt(layout, first.x + 80, 4, project.id);
    expect(loose).toMatchObject({ kind: 'day', projectId: project.id });
  });

  it('builds a placeholder range when nothing is dated', () => {
    const layout = placeholderGanttLayout('week');
    expect(layout.bars).toHaveLength(0);
    expect(layout.dayCount).toBeGreaterThan(10);
    expect(dateKeyAtX(layout, layout.dayWidth)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
