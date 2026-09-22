import { describe, expect, it } from 'vitest';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { fitBranchView } from '@/domain/graph-branch-layout';
import { lineLabelX, lineViewWidth, mountLinesView } from '@/views/graph-lines';

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
    due_date: '2026-10-15',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-09-09T00:00:00.000Z',
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
    waiting_on: null,
    waiting_since: null,
    follow_up_at: null,
    waiting_status: null,
    ...partial
  };
}

function project(partial: Partial<Project> = {}): Project {
  return {
    schema_version: 1,
    id: 'proj_a',
    title: 'The UN Voice Competition 2026',
    description: '',
    parent_goal_id: null,
    tags: [],
    arc_summary: '',
    purpose: '',
    desired_outcome: '',
    quality_bar: null,
    review_at: null,
    type: 'academic_program',
    milestones: [],
    status: 'active',
    baseline_end_date: null,
    current_end_date: '2026-10-15',
    review_summary: null,
    stall_flagged_at: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    competition_or_event_type: null,
    key_dates: null,
    student_group_reference: null,
    generated_admin_tasks: [],
    drafted_documents: null,
    ...partial
  };
}

describe('graph page fit', () => {
  it('anchors right-edge dates inward and left-edge dates outward', () => {
    expect(lineLabelX(612, 640)).toEqual({ x: 612, anchor: 'end' });
    expect(lineLabelX(28, 640)).toEqual({ x: 28, anchor: 'start' });
    expect(lineLabelX(800, 640)).toEqual({ x: 632, anchor: 'end' });
    expect(lineLabelX(-4, 640)).toEqual({ x: 8, anchor: 'start' });
  });

  it('uses the measured canvas width instead of overflowing it', () => {
    expect(lineViewWidth(1100)).toBe(1100);
    expect(lineViewWidth(0)).toBe(720);
    expect(lineViewWidth(200)).toBe(320);
  });

  it('scales a wide branch map down to the viewport', () => {
    const fitted = fitBranchView({ width: 1600, height: 400 }, { width: 800, height: 500 });
    expect(fitted.scale).toBe(0.5);
    expect(fitted.panX).toBe(0);
    expect(fitted.panY).toBe(150);
  });

  it('keeps the terminus date inside the line viewBox', () => {
    const host = document.createElement('div');
    Object.defineProperty(host, 'clientWidth', { configurable: true, value: 640 });
    document.body.append(host);
    mountLinesView(host, {
      tasks: [
        task({ id: 'task_a', title: 'Station one', step_order: 0 }),
        task({ id: 'task_b', title: 'Station two', step_order: 1 }),
        task({ id: 'task_c', title: 'Station three', step_order: 2 })
      ],
      projects: [project()],
      now: new Date('2026-09-22T00:00:00.000Z'),
      selectedId: null,
      search: '',
      insights: [],
      scale: false,
      focusedProjectId: null,
      reducedMotion: true,
      onSelect: () => undefined,
      onComplete: () => undefined,
      onFocusProject: () => undefined,
      onAddStation: () => undefined,
      onReviewInsight: () => undefined,
      onToggleScale: () => undefined
    });
    const svg = host.querySelector('.graph-line__svg');
    const terminus = host.querySelector('.graph-terminus');
    expect(svg?.getAttribute('viewBox')).toMatch(/^0 0 640 /);
    expect(Number(terminus?.getAttribute('x'))).toBeLessThanOrEqual(632);
    expect(terminus?.getAttribute('text-anchor')).toBe('end');
    host.remove();
  });
});
