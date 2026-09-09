import { describe, expect, it } from 'vitest';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import { buildExcursionMarkdown, excursionMarkdownFilename } from '@/domain/excursion-record';
import { cloneDefaultComplianceModules } from '@/domain/excursion-modules';
import { cloneDefaultFolderItems } from '@/domain/excursion-folder';

function project(partial: Partial<Project> = {}): Project {
  return {
    schema_version: 1,
    id: 'proj_ex',
    title: 'Free-Thinkers Forum 2026',
    description: '',
    parent_goal_id: null,
    tags: [],
    arc_summary: '',
    type: 'excursion',
    milestones: [],
    status: 'active',
    baseline_end_date: null,
    current_end_date: '2026-09-02',
    review_summary: null,
    stall_flagged_at: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    competition_or_event_type: 'ext_excursion',
    key_dates: null,
    student_group_reference: 'Year 10',
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

describe('buildExcursionMarkdown', () => {
  it('includes the title, compliance categories, muster log, folder, and tasks', () => {
    const p = project({
      compliance_modules: cloneDefaultComplianceModules(),
      folder_items: cloneDefaultFolderItems(),
      muster_log: [{ at: '2026-09-02T08:32:00.000Z', label: 'Board 415', note: 'short by 1' }]
    });
    const tasks = [task({ id: 't1', title: 'Lodge risk assessment', status: 'done' })];

    const md = buildExcursionMarkdown(p, tasks);

    expect(md).toContain('# Free-Thinkers Forum 2026');
    expect(md).toContain('Ready for letterhead');
    expect(md).toContain('## Compliance');
    expect(md).toContain('WWCC verified for all supervising staff');
    expect(md).toContain('## Muster log');
    expect(md).toContain('Board 415 — short by 1');
    expect(md).toContain('## Folder');
    expect(md).toContain('Excursion Checklist');
    expect(md).toContain('## Tasks');
    expect(md).toContain('[x] Lodge risk assessment');
  });

  it('says so when there is no muster activity yet', () => {
    const md = buildExcursionMarkdown(project(), []);
    expect(md).toContain('No muster activity recorded.');
  });

  it('builds a safe, lowercase filename from the title', () => {
    expect(excursionMarkdownFilename(project({ title: 'Free-Thinkers Forum 2026!' }))).toBe(
      'free-thinkers-forum-2026.md'
    );
    expect(excursionMarkdownFilename(project({ title: '' }))).toBe('excursion.md');
  });
});
