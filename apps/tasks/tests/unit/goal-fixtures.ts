// apps/tasks/tests/unit/goal-fixtures.ts
import { normalizeGoal, type Goal } from '@/schemas/goal';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';

export function goal(partial: Partial<Goal> & Pick<Goal, 'id' | 'title'>): Goal {
  return normalizeGoal({
    schema_version: 1,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    ...partial
  } as Goal);
}

export function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    schema_version: 1, description: '', kind: 'task', bucket: 'active', step_order: 0, domain: 'life',
    framework_used: null, estimated_duration: null, actual_duration: null, due_date: null,
    created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z', completed_at: null,
    status: 'open', blocked_since: null, priority: 'medium', parent_project_id: null, parent_task_id: null,
    parent_goal_id: null, depends_on: [], tags: [], recurrence_rule: null, due_time: null, remind_at: null,
    remind_dismissed_at: null, attachments: [], source: 'manual', target_date: null, review_at: null,
    waiting_on: null, waiting_since: null, follow_up_at: null, waiting_status: null, contexts: [],
    cognitive_load: null, depth: null,
    ...partial
  } as Task;
}

export function project(partial: Partial<Project> & Pick<Project, 'id' | 'title'>): Project {
  return {
    schema_version: 1, status: 'active', description: '', parent_goal_id: null, tags: [], arc_summary: '',
    purpose: '', desired_outcome: '', quality_bar: null, review_at: null, type: 'standard', milestones: [],
    baseline_end_date: null, current_end_date: null, review_summary: null, stall_flagged_at: null,
    created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z',
    competition_or_event_type: null, key_dates: null, student_group_reference: null,
    generated_admin_tasks: [], drafted_documents: null,
    ...partial
  } as Project;
}
