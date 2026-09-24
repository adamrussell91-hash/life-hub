import { describe, expect, it } from 'vitest';
import { attachmentFromEndpoint, taskAttachments } from '@/domain/task-attachments';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    schema_version: 1,
    description: '',
    kind: 'task',
    bucket: 'active',
    step_order: 0,
    domain: 'teaching',
    framework_used: null,
    estimated_duration: null,
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

function project(partial: Partial<Project> & Pick<Project, 'id' | 'title'>): Project {
  return {
    schema_version: 1,
    description: '',
    arc_summary: '',
    type: 'standard',
    milestones: [],
    status: 'active',
    baseline_end_date: null,
    current_end_date: null,
    review_summary: null,
    stall_flagged_at: null,
    parent_goal_id: null,
    tags: [],
    competition_or_event_type: null,
    key_dates: null,
    student_group_reference: null,
    generated_admin_tasks: [],
    drafted_documents: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...partial
  };
}

describe('taskAttachments', () => {
  it('flags a project id that is not in the loaded list', () => {
    const items = taskAttachments(task({ id: 't', title: 'Orphan', parent_project_id: 'gone' }), {
      projects: []
    });
    expect(items).toEqual([{ kind: 'project', label: 'Missing project', href: null }]);
  });

  it('does not invent a pill when the view did not pass projects', () => {
    expect(
      taskAttachments(task({ id: 't', title: 'Orphan', parent_project_id: 'gone' }))
    ).toEqual([]);
  });

  it('maps a tagged event and skips ended links', () => {
    expect(
      attachmentFromEndpoint({
        status: 'current',
        relationshipType: 'tagged_with',
        kind: 'event',
        label: 'Regional heat',
        href: '#/event/1'
      })
    ).toEqual({ kind: 'event', label: 'Regional heat', href: '#/event/1' });
    expect(
      attachmentFromEndpoint({
        status: 'ended',
        relationshipType: 'tagged_with',
        kind: 'event',
        label: 'Old heat'
      })
    ).toBeNull();
  });

  it('names a linked goal once when the project already points at it', () => {
    const goal = { id: 'g1', title: 'Grow MindWorks' };
    const owned = project({ id: 'p1', title: 'MindWorks', parent_goal_id: 'g1' });
    const items = taskAttachments(
      task({
        id: 't',
        title: 'Brief',
        parent_project_id: 'p1',
        linked_goal_ids: ['g1']
      }),
      { projects: [owned], goals: [goal] }
    );
    expect(items.map((item) => `${item.kind}:${item.label}`)).toEqual([
      'project:MindWorks',
      'goal:Grow MindWorks'
    ]);
  });
});
