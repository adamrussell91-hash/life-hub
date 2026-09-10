import { describe, expect, it } from 'vitest';
import type { Task } from '@/schemas/task';
import { renderBoardTaskTile } from '@/views/task-tile';

const baseTask = (partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task => ({
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
});

describe('renderBoardTaskTile', () => {
  it('expands on click and exposes a Full page action', () => {
    const editorHost = document.createElement('div');
    const detail = document.createElement('p');
    detail.textContent = 'Blocked by one task';
    const card = renderBoardTaskTile(baseTask({ id: 't1', title: 'Waiting task' }), 'waiting on Dep', detail, {
      editorHost,
      projects: [],
      onSaved: () => undefined
    });

    expect(card.classList.contains('task-tile--open')).toBe(false);
    expect((card.querySelector('.task-tile__detail') as HTMLElement).hidden).toBe(true);

    card.click();
    expect(card.classList.contains('task-tile--open')).toBe(true);
    expect((card.querySelector('.task-tile__detail') as HTMLElement).hidden).toBe(false);
    expect(card.querySelector('button')?.textContent).toBe('Full page');
  });
});
