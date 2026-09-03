import { describe, expect, it } from 'vitest';
import {
  addMonths,
  calendarHash,
  collectCalendarItems,
  dayTaskMinutes,
  filterCalendarItems,
  formatLoad,
  itemsForDay,
  monthGrid,
  overdueItems,
  parseCalendarAnchor,
  pickSelectedDateKey,
  visibleOverflow
} from '@/domain/calendar';
import { toDateKey } from '@/domain/queries';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';

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
    due_date: '2026-08-17',
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

describe('calendar domain', () => {
  it('builds a Monday-start 6×7 month grid that includes adjacent days', () => {
    const days = monthGrid(new Date(2026, 7, 15));
    expect(days).toHaveLength(42);
    expect(toDateKey(days[0]!)).toBe('2026-07-27');
    expect(toDateKey(days[5]!)).toBe('2026-08-01');
    expect(toDateKey(days[41]!)).toBe('2026-09-06');
  });

  it('clamps month navigation off a 31st', () => {
    const next = addMonths(new Date(2026, 0, 31), 1);
    expect(toDateKey(next)).toBe('2026-02-28');
  });

  it('parses a hash date as a local calendar day', () => {
    expect(toDateKey(parseCalendarAnchor('2026-08-15'))).toBe('2026-08-15');
    expect(calendarHash('month', parseCalendarAnchor('2026-08-15'))).toBe('#/month?date=2026-08-15');
  });

  it('collects tasks, milestones, and excursion key dates onto the same calendar', () => {
    const items = collectCalendarItems(
      [
        task({ id: 't1', title: 'Lesson pack', due_date: '2026-08-17', parent_project_id: 'p1' }),
        task({ id: 't2', title: 'No date', due_date: null })
      ],
      [
        project({
          id: 'p1',
          title: 'MindWorks',
          milestones: [
            {
              id: 'm1',
              project_id: 'p1',
              title: 'Term brief locked',
              due_date: '2026-08-22',
              status: 'open'
            }
          ]
        }),
        project({
          id: 'p2',
          title: 'Ethics heat',
          type: 'excursion',
          current_end_date: '2026-10-05',
          key_dates: { permission_note_due: '2026-09-14', payment_due: null }
        })
      ]
    );
    expect(items.map((item) => item.id)).toEqual([
      'task:t1',
      'milestone:p1:m1',
      'key:p2:Permission note',
      'key:p2:Event'
    ]);
    expect(itemsForDay(items, '2026-08-17').map((item) => item.title)).toEqual(['Lesson pack']);
    expect(items.find((item) => item.kind === 'milestone')?.project_title).toBe('MindWorks');
  });

  it('does not duplicate a key date when the matching admin task is already on the calendar', () => {
    const items = collectCalendarItems(
      [
        task({
          id: 't-note',
          title: 'Draft permission note',
          due_date: '2026-09-14',
          parent_project_id: 'p2',
          tags: ['excursion', 'admin', 'permission']
        })
      ],
      [
        project({
          id: 'p2',
          title: 'Ethics heat',
          type: 'excursion',
          current_end_date: '2026-10-05',
          key_dates: { permission_note_due: '2026-09-14', payment_due: null }
        })
      ]
    );
    expect(items.map((item) => item.id)).toEqual(['task:t-note', 'key:p2:Event']);
    expect(items.some((item) => item.id === 'key:p2:Permission note')).toBe(false);
  });

  it('filters completed work, domains, and title search', () => {
    const items = collectCalendarItems(
      [
        task({ id: 'open', title: 'Marking batch', due_date: '2026-08-17', domain: 'teaching' }),
        task({
          id: 'done',
          title: 'Done florist',
          due_date: '2026-08-17',
          domain: 'wedding',
          status: 'done'
        })
      ],
      []
    );
    expect(
      filterCalendarItems(items, {
        domain: 'all',
        projectId: 'all',
        query: '',
        includeDone: false,
        includeDates: true
      }).map((item) => item.id)
    ).toEqual(['task:open']);
    expect(
      filterCalendarItems(items, {
        domain: 'wedding',
        projectId: 'all',
        query: '',
        includeDone: true,
        includeDates: true
      }).map((item) => item.id)
    ).toEqual(['task:done']);
    expect(
      filterCalendarItems(items, {
        domain: 'all',
        projectId: 'all',
        query: 'florist',
        includeDone: true,
        includeDates: true
      }).map((item) => item.title)
    ).toEqual(['Done florist']);
  });

  it('summarises overflow, load, and overdue work', () => {
    const items = collectCalendarItems(
      [
        task({ id: 'a', title: 'A', due_date: '2026-08-10', estimated_duration: 90 }),
        task({ id: 'b', title: 'B', due_date: '2026-08-10', estimated_duration: 30 }),
        task({ id: 'c', title: 'C', due_date: '2026-08-10', estimated_duration: 15 }),
        task({ id: 'd', title: 'D', due_date: '2026-08-10', estimated_duration: 15 })
      ],
      []
    );
    const day = itemsForDay(items, '2026-08-10');
    expect(visibleOverflow(day, 3)).toEqual({ visible: day.slice(0, 3), hidden: 1 });
    expect(dayTaskMinutes(day)).toBe(150);
    expect(formatLoad(150)).toBe('2h 30m');
    expect(overdueItems(items, new Date(2026, 7, 23)).map((item) => item.id)).toEqual([
      'task:a',
      'task:b',
      'task:c',
      'task:d'
    ]);
  });

  it('prefers the current selection, then the hash day, then today', () => {
    const days = monthGrid(new Date(2026, 7, 1));
    expect(pickSelectedDateKey('2026-08-15', days, new Date(2026, 7, 23))).toBe('2026-08-15');
    expect(pickSelectedDateKey(null, days, new Date(2026, 7, 23), new Date(2026, 7, 15))).toBe(
      '2026-08-15'
    );
    expect(pickSelectedDateKey(null, days, new Date(2026, 7, 23))).toBe('2026-08-23');
  });
});
