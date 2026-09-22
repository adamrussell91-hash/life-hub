import { describe, expect, it } from 'vitest';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import {
  buildGraphInsights,
  insightFingerprint,
  isInsightDismissed,
  rankInsights,
  type GraphInsight
} from '@/domain/graph-insights';

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
    title: 'MindWorks',
    description: '',
    parent_goal_id: null,
    tags: [],
    arc_summary: '',
    purpose: '',
    desired_outcome: '',
    quality_bar: null,
    review_at: null,
    type: 'standard',
    milestones: [],
    status: 'active',
    baseline_end_date: null,
    current_end_date: '2026-09-15',
    review_summary: null,
    stall_flagged_at: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-09-09T00:00:00.000Z',
    competition_or_event_type: null,
    key_dates: null,
    student_group_reference: null,
    generated_admin_tasks: [],
    drafted_documents: null,
    expected_headcount: null,
    active_escalation: null,
    linked_program_id: null,
    ...partial
  };
}

const now = new Date('2026-09-10T10:00:00');

describe('buildGraphInsights', () => {
  it('emits a lines service alert for a delayed project', () => {
    const tasks = [
      task({ id: 'a', title: 'Book bus', step_order: 0, blocked_since: '2026-09-06', depends_on: ['missing'] }),
      task({ id: 'b', title: 'Print', step_order: 1 }),
      task({ id: 'c', title: 'Pack', step_order: 2 }),
      task({ id: 'd', title: 'Go', step_order: 3 })
    ];
    const insights = buildGraphInsights(tasks, [project()], now);
    expect(insights.some((row) => row.view === 'lines' && row.id.startsWith('lines-service'))).toBe(true);
  });

  it('emits a suggested station when the line is behind pace', () => {
    const tasks = [
      task({ id: 'a', title: 'A', step_order: 0, status: 'done' }),
      task({ id: 'b', title: 'B', step_order: 1 }),
      task({ id: 'c', title: 'C', step_order: 2 }),
      task({ id: 'd', title: 'D', step_order: 3 })
    ];
    const insights = buildGraphInsights(
      tasks,
      [project({ created_at: '2026-08-01T00:00:00.000Z', current_end_date: '2026-09-20' })],
      now
    );
    const suggest = insights.find((row) => row.id.startsWith('lines-suggest'));
    expect(suggest?.proposal?.[0]?.kind).toBe('task_create');
  });

  it('emits a do-first badge insight on Branch', () => {
    const tasks = [
      task({ id: 'a', title: 'A', estimated_duration: 15, due_date: '2026-09-12' }),
      task({ id: 'b', title: 'B', depends_on: ['a'], due_date: '2026-09-12' })
    ];
    const insights = buildGraphInsights(tasks, [project({ current_end_date: '2026-12-01' })], now);
    expect(insights.some((row) => row.id.startsWith('branch-dofirst'))).toBe(true);
  });

  it('emits a suggested link on Branch', () => {
    const tasks = [
      task({ id: 'a', title: 'Book bus', step_order: 0, estimated_duration: 60 }),
      task({ id: 'b', title: 'Roll numbers', step_order: 1, estimated_duration: 60, depends_on: ['a'] }),
      task({ id: 'c', title: 'Print', step_order: 2, estimated_duration: 10 })
    ];
    const insights = buildGraphInsights(tasks, [project({ current_end_date: '2026-12-01' })], now);
    expect(insights.some((row) => row.id.startsWith('branch-link'))).toBe(true);
  });

  it('emits an unblock nudge with a draft when waiting on someone', () => {
    const tasks = [
      task({
        id: 'a',
        title: 'Quote',
        waiting_on: 'Sam',
        waiting_status: 'waiting',
        updated_at: '2026-09-09T00:00:00.000Z'
      })
    ];
    const insights = buildGraphInsights(tasks, [project({ current_end_date: '2026-12-01' })], now);
    const nudge = insights.find((row) => row.id.startsWith('branch-nudge'));
    expect(nudge?.draft?.body).toMatch(/Sam/);
  });

  it('emits orbit collision and overdue insights', () => {
    const tasks = [
      task({ id: 'a', title: 'A', due_date: '2026-09-10', estimated_duration: 180, priority: 'high' }),
      task({ id: 'b', title: 'B', due_date: '2026-09-10', estimated_duration: 180, priority: 'low' }),
      task({ id: 'c', title: 'C', due_date: '2026-09-10', estimated_duration: 90 }),
      task({ id: 'late', title: 'Late', due_date: '2026-09-01', step_order: 4 })
    ];
    const insights = buildGraphInsights(tasks, [project({ current_end_date: '2026-12-01' })], now);
    expect(insights.some((row) => row.id.startsWith('orbit-collision'))).toBe(true);
    expect(insights.some((row) => row.id === 'orbit-overdue')).toBe(true);
  });

  it('hides a dismissed insight until the underlying copy changes', () => {
    const tasks = [task({ id: 'late', title: 'Late', due_date: '2026-09-01' })];
    const insights = buildGraphInsights(tasks, [project({ current_end_date: '2026-12-01' })], now);
    const overdue = insights.find((row) => row.id === 'orbit-overdue');
    expect(overdue).toBeTruthy();
    const dismissed = [{ id: overdue!.id, fingerprint: insightFingerprint(overdue!) }];
    expect(buildGraphInsights(tasks, [project({ current_end_date: '2026-12-01' })], now, dismissed).some((row) => row.id === 'orbit-overdue')).toBe(false);
    const renamed = [task({ id: 'late', title: 'Late still', due_date: '2026-09-01' })];
    expect(buildGraphInsights(renamed, [project({ current_end_date: '2026-12-01' })], now, dismissed).some((row) => row.id === 'orbit-overdue')).toBe(true);
  });

  it('ranks high severity first', () => {
    const rows: GraphInsight[] = [
      {
        id: 'l',
        view: 'lines',
        severity: 'low',
        anchor: { kind: 'task', id: 'a' },
        headline: 'Low',
        detail: 'd'
      },
      {
        id: 'h',
        view: 'orbit',
        severity: 'high',
        anchor: { kind: 'date', date: '2026-09-10' },
        headline: 'High',
        detail: 'd'
      }
    ];
    expect(rankInsights(rows).map((row) => row.id)).toEqual(['h', 'l']);
    expect(isInsightDismissed(rows[0]!, [])).toBe(false);
  });
});
