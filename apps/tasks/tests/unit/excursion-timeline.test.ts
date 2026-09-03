import { describe, expect, it } from 'vitest';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import {
  collectExcursionStops,
  layoutExcursionTimeline,
  TIMELINE_MIN_GAP,
  TIMELINE_PAD_TOP
} from '@/domain/excursion-timeline';

function project(partial: Partial<Project> = {}): Project {
  return {
    schema_version: 1,
    id: 'proj_ex',
    title: 'Ethics heat',
    description: '',
    parent_goal_id: null,
    tags: [],
    arc_summary: '',
    type: 'excursion',
    milestones: [],
    status: 'active',
    baseline_end_date: null,
    current_end_date: '2026-10-10',
    review_summary: null,
    stall_flagged_at: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    competition_or_event_type: 'ext_ethics_olympiad',
    key_dates: {
      permission_note_due: '2026-09-24',
      staff_notification_due: '2026-09-24',
      risk_assessment_due: '2026-09-03',
      payment_due: '2026-09-17'
    },
    student_group_reference: 'Year 10 Ethics',
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
    due_date: '2026-09-24',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    completed_at: null,
    status: 'open',
    blocked_since: null,
    priority: 'medium',
    parent_project_id: 'proj_ex',
    parent_task_id: null,
    depends_on: [],
    tags: [],
    recurrence_rule: null,
    due_time: null,
    remind_at: null,
    remind_dismissed_at: null,
    attachments: [],
    source: 'auto_generated_from_excursion',
    ...partial
  };
}

describe('excursion timeline', () => {
  it('collects key dates and the event when there are no tasks', () => {
    const stops = collectExcursionStops(project(), []);
    expect(stops.map((stop) => stop.label)).toEqual([
      'Risk assessment',
      'Payment',
      'Permission note',
      'Staff notification',
      'Event'
    ]);
    expect(stops.every((stop) => stop.task === null)).toBe(true);
    expect(stops.at(-1)).toMatchObject({ kind: 'event', date: '2026-10-10', adminKind: 'event' });
  });

  it('uses a matching admin task instead of a key-date chip', () => {
    const stops = collectExcursionStops(project(), [
      task({
        id: 't1',
        title: 'Draft permission note',
        due_date: '2026-09-24',
        tags: ['excursion', 'admin', 'permission']
      })
    ]);
    expect(stops.some((stop) => stop.label === 'Permission note' && !stop.task)).toBe(false);
    expect(stops.find((stop) => stop.task?.id === 't1')).toMatchObject({
      adminKind: 'permission_note',
      kind: 'key_date'
    });
  });

  it('does not add a second Event chip when an event task exists', () => {
    const stops = collectExcursionStops(project(), [
      task({
        id: 't-event',
        title: 'Event day — Ethics heat',
        due_date: '2026-10-10',
        tags: ['excursion', 'event']
      })
    ]);
    const events = stops.filter((stop) => stop.kind === 'event');
    expect(events).toHaveLength(1);
    expect(events[0]?.task?.id).toBe('t-event');
  });

  it('spaces later dates further down and keeps a min gap for same-day cards', () => {
    const layout = layoutExcursionTimeline([
      { id: 'a', date: '2026-09-03', kind: 'key_date', label: 'Risk', task: null, adminKind: 'risk_assessment' },
      { id: 'b', date: '2026-09-03', kind: 'task', label: 'Lodge risk', task: null, adminKind: null },
      { id: 'c', date: '2026-10-10', kind: 'event', label: 'Event', task: null, adminKind: 'event' }
    ]);
    expect(layout.stops[0]?.y).toBe(TIMELINE_PAD_TOP);
    expect(layout.stops[1]!.y - layout.stops[0]!.y).toBe(TIMELINE_MIN_GAP);
    expect(layout.stops[2]!.y - layout.stops[1]!.y).toBeGreaterThan(TIMELINE_MIN_GAP);
    expect(layout.stops[2]!.y).toBeGreaterThan(layout.stops[1]!.y);
  });
});
