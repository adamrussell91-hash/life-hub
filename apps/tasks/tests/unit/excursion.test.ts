import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as keys from '@/storage/keys';
import { createTasksStore, seedIfEmpty, type KvAdapter } from '@/services/store';
import type { SeedData } from '@/services/types';
import {
  adminTaskKind,
  buildExcursionPlan,
  defaultExcursionEventDate,
  excursionDatesFromAdminTask,
  matchAdminTask,
  planAdminTaskForKind,
  shiftExcursionDates
} from '@/domain/excursion';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';

function memoryKv(): KvAdapter {
  const map = new Map<string, unknown>();
  return {
    async getJSON<T>(key: string) {
      return (map.has(key) ? map.get(key) : null) as T | null;
    },
    async setJSON(key: string, value: unknown) {
      map.set(key, value);
    },
    async delete(key: string) {
      map.delete(key);
    }
  };
}

const seed = JSON.parse(
  readFileSync(resolve(process.cwd(), 'fixtures/seed.json'), 'utf8')
) as SeedData;

describe('excursion plan', () => {
  it('schedules admin tasks from the single excursion template lead times', () => {
    expect(seed.excursion_templates).toHaveLength(1);
    const template = seed.excursion_templates.find((t) => t.id === 'ext_excursion')!;
    expect(template.name).toBe('excursion template');
    const plan = buildExcursionPlan(template, {
      title: 'Year 10 excursion',
      event_date: '2026-10-15',
      student_group_reference: 'Year 10'
    });

    expect(plan.event_date).toBe('2026-10-15');
    expect(plan.key_dates.permission_note_due).toBe('2026-09-24'); // −21
    expect(plan.key_dates.staff_notification_due).toBe('2026-09-24'); // −21
    expect(plan.key_dates.risk_assessment_due).toBe('2026-09-03'); // −42
    expect(plan.key_dates.payment_due).toBe('2026-09-17'); // −28

    const kinds = plan.admin_tasks.map((t) => t.kind);
    expect(kinds).toContain('permission_note');
    expect(kinds).toContain('staff_email');
    expect(kinds).toContain('risk_assessment');
    expect(kinds).toContain('payment');
    expect(kinds).toContain('checklist'); // student list
    expect(kinds).toContain('event');

    expect(plan.drafted_documents.permission_note_draft).toContain('Year 10');
    expect(plan.drafted_documents.staff_absence_email_draft).toContain('Year 10 excursion');
    expect(plan.admin_tasks.some((t) => t.title.includes('Year 10 excursion'))).toBe(true);
  });
});

describe('shiftExcursionDates', () => {
  it('moves the event, key dates, and child tasks by the same delta', () => {
    const shifted = shiftExcursionDates(
      {
        schema_version: 1,
        id: 'proj_ex',
        title: 'Ethics heat',
        description: '',
        parent_goal_id: null,
        tags: [],
        arc_summary: '',
        type: 'excursion',
        milestones: [{ id: 'ms_1', project_id: 'proj_ex', title: 'Event day', due_date: '2026-10-10', status: 'open' }],
        status: 'active',
        baseline_end_date: '2026-10-10',
        current_end_date: '2026-10-10',
        review_summary: null,
        stall_flagged_at: null,
        created_at: '2026-07-01T00:00:00.000Z',
        updated_at: '2026-08-01T00:00:00.000Z',
        competition_or_event_type: 'ext_excursion',
        key_dates: {
          permission_note_due: '2026-09-24',
          staff_notification_due: '2026-09-24',
          risk_assessment_due: '2026-09-03',
          payment_due: '2026-09-17'
        },
        student_group_reference: null,
        generated_admin_tasks: ['task_permission'],
        drafted_documents: null
      },
      [
        {
          schema_version: 1,
          id: 'task_permission',
          title: 'Draft permission note',
          description: '',
          kind: 'task',
          bucket: 'active',
          step_order: 0,
          domain: 'teaching',
          framework_used: null,
          estimated_duration: 45,
          actual_duration: null,
          due_date: '2026-09-24',
          created_at: '2026-08-01T00:00:00.000Z',
          updated_at: '2026-08-01T00:00:00.000Z',
          completed_at: null,
          status: 'open',
          blocked_since: null,
          priority: 'high',
          parent_project_id: 'proj_ex',
          parent_task_id: null,
          depends_on: [],
          tags: [],
          recurrence_rule: null,
          due_time: null,
          remind_at: null,
          remind_dismissed_at: null,
          attachments: [],
          source: 'auto_generated_from_excursion'
        }
      ],
      '2026-10-17'
    );

    expect(shifted.project.current_end_date).toBe('2026-10-17');
    expect(shifted.project.key_dates).toEqual({
      permission_note_due: '2026-10-01',
      staff_notification_due: '2026-10-01',
      risk_assessment_due: '2026-09-10',
      payment_due: '2026-09-24'
    });
    expect(shifted.project.milestones[0]?.due_date).toBe('2026-10-17');
    expect(shifted.tasks).toEqual([{ id: 'task_permission', due_date: '2026-10-01' }]);
  });
});

describe('defaultExcursionEventDate', () => {
  it('is 45 days from now', () => {
    expect(defaultExcursionEventDate(new Date('2026-08-28T00:00:00.000Z'))).toBe('2026-10-12');
  });
});

describe('createExcursionFromTemplate', () => {
  it('persists project, admin tasks, milestones, and drafts', async () => {
    const kv = memoryKv();
    await seedIfEmpty(kv, keys, seed);
    const store = createTasksStore(kv, keys);

    const { project, tasks } = await store.createExcursionFromTemplate({
      excursion_template_id: 'ext_excursion',
      title: 'Ethics State Round',
      event_date: '2026-10-15',
      student_group_reference: 'Year 10 Ethics team'
    });

    expect(project.type).toBe('excursion');
    expect(project.competition_or_event_type).toBe('ext_excursion');
    expect(project.generated_admin_tasks.length).toBe(tasks.length);
    expect(tasks.every((t) => t.source === 'auto_generated_from_excursion')).toBe(true);
    expect(tasks.every((t) => t.parent_project_id === project.id)).toBe(true);
    expect(project.milestones.length).toBeGreaterThan(0);
    expect(project.drafted_documents?.permission_note_draft).toContain('Permission note');
    expect(project.key_dates?.risk_assessment_due).toBe('2026-09-03');
  });

  it('syncs the project event date when the event task due date changes', async () => {
    const kv = memoryKv();
    await seedIfEmpty(kv, keys, seed);
    const store = createTasksStore(kv, keys);
    const { project, tasks } = await store.createExcursionFromTemplate({
      excursion_template_id: 'ext_excursion',
      title: 'Ethics State Round',
      event_date: '2026-10-15',
      student_group_reference: 'Year 10 Ethics team'
    });
    const event = tasks.find((item) => item.tags.includes('event'))!;
    await store.updateTask(event.id, { due_date: '2026-10-20' });
    const next = await store.getProject(project.id);
    expect(next?.current_end_date).toBe('2026-10-20');
  });
});

describe('admin task matching', () => {
  const sample: Task = {
    schema_version: 1,
    id: 't1',
    title: 'Draft permission note',
    description: '',
    kind: 'task',
    bucket: 'active',
    step_order: 0,
    domain: 'teaching',
    framework_used: null,
    estimated_duration: 45,
    actual_duration: null,
    due_date: '2026-09-24',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    completed_at: null,
    status: 'open',
    blocked_since: null,
    priority: 'high',
    parent_project_id: 'proj_ex',
    parent_task_id: null,
    depends_on: [],
    tags: ['excursion', 'admin', 'permission'],
    recurrence_rule: null,
    due_time: null,
    remind_at: null,
    remind_dismissed_at: null,
    attachments: [],
    source: 'auto_generated_from_excursion'
  };

  it('reads kind from tags or title', () => {
    expect(adminTaskKind(sample)).toBe('permission_note');
    expect(adminTaskKind({ ...sample, tags: [], title: 'Event day — Heat' })).toBe('event');
    expect(matchAdminTask([sample], 'permission_note')?.id).toBe('t1');
  });

  it('plans a missing key date as an admin task', () => {
    const planned = planAdminTaskForKind('risk_assessment', { title: 'Heat' } as Project, '2026-09-03');
    expect(planned.title).toContain('risk assessment');
    expect(planned.tags).toContain('risk');
    expect(planned.due_date).toBe('2026-09-03');
  });

  it('patches key dates when an admin task moves', () => {
    const project = {
      type: 'excursion',
      key_dates: { permission_note_due: '2026-09-24' },
      current_end_date: '2026-10-15'
    } as Project;
    expect(
      excursionDatesFromAdminTask(project, { ...sample, due_date: '2026-09-30' })
    ).toEqual({
      key_dates: { permission_note_due: '2026-09-30' }
    });
    expect(
      excursionDatesFromAdminTask(project, {
        ...sample,
        tags: ['excursion', 'event'],
        title: 'Event day — Heat',
        due_date: '2026-10-20'
      })
    ).toEqual({ current_end_date: '2026-10-20' });
  });
});
