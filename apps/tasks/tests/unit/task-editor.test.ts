import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/schemas/task';
import { tasksApi } from '@/services/client-api';
import { requestToggleDone } from '@/views/dashboard';
import { renderQuickAdd } from '@/views/task-editor';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    createTask: vi.fn(),
    updateTask: vi.fn(),
    recordClareActual: vi.fn()
  }
}));

function sampleTask(overrides: Partial<Task> = {}): Task {
  return {
    schema_version: 1,
    id: 'task_audit',
    title: 'Done cancel check',
    description: '',
    kind: 'task',
    bucket: 'active',
    step_order: 0,
    domain: 'teaching',
    framework_used: 'fw_timeboxing',
    estimated_duration: 55,
    actual_duration: null,
    due_date: '2026-08-22',
    created_at: '2026-08-22T00:00:00.000Z',
    updated_at: '2026-08-22T00:00:00.000Z',
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
    ...overrides
  };
}

describe('renderQuickAdd', () => {
  beforeEach(() => {
    vi.mocked(tasksApi.createTask).mockReset();
    vi.mocked(tasksApi.createTask).mockResolvedValue(sampleTask({ due_date: null }));
  });

  it('posts a new task without stamping due_date', async () => {
    const created = sampleTask({ id: 'task_created', title: '[UX-AUDIT] backlog test', due_date: null });
    vi.mocked(tasksApi.createTask).mockResolvedValue(created);
    const onCreated = vi.fn();
    const root = renderQuickAdd(onCreated);
    expect(root.querySelector('.plus-add__btn')?.getAttribute('aria-label')).toBe('Add a task');
    expect(root.querySelector<HTMLElement>('.plus-add__panel')?.hidden).toBe(true);
    root.querySelector<HTMLButtonElement>('.plus-add__btn')!.click();
    const form = root.querySelector('form.quick-add') as HTMLFormElement;
    expect(form.querySelector('select')).toBeNull();
    expect(form.querySelector('.hub-filter')?.tagName).toBe('BUTTON');
    expect(form.querySelector('.hub-search')?.tagName).toBe('LABEL');
    const title = form.querySelector('input') as HTMLInputElement;
    title.value = '[UX-AUDIT] backlog test';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => {
      expect(tasksApi.createTask).toHaveBeenCalledTimes(1);
      expect(onCreated).toHaveBeenCalledWith(created);
    });
    const body = vi.mocked(tasksApi.createTask).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body.title).toBe('[UX-AUDIT] backlog test');
    expect(body).not.toHaveProperty('due_date');
  });

  it('stamps a due date only when the calendar quick-add asks for one', async () => {
    const root = renderQuickAdd(() => undefined, null, { dueDate: '2026-08-19' });
    root.querySelector<HTMLButtonElement>('.plus-add__btn')!.click();
    const form = root.querySelector('form.quick-add') as HTMLFormElement;
    const title = form.querySelector('input[aria-label="New task title"]') as HTMLInputElement;
    const due = form.querySelector('input[type="date"]') as HTMLInputElement;
    const time = form.querySelector('input[aria-label="Start time"]') as HTMLInputElement;
    expect(due.value).toBe('2026-08-19');
    expect(time).not.toBeNull();
    expect(form.querySelector('.quick-add__when')).not.toBeNull();
    title.value = 'Calendar add';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => {
      expect(tasksApi.createTask).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(tasksApi.createTask).mock.calls[0]?.[0]).toMatchObject({
      title: 'Calendar add',
      due_date: '2026-08-19'
    });
  });

  it('keeps the compose due date when the date input is cleared', async () => {
    const root = renderQuickAdd(() => undefined, null, {
      dueDate: '2026-08-19',
      dueTime: '10:00'
    });
    root.querySelector<HTMLButtonElement>('.plus-add__btn')!.click();
    const form = root.querySelector('form.quick-add') as HTMLFormElement;
    const title = form.querySelector('input[aria-label="New task title"]') as HTMLInputElement;
    const due = form.querySelector('input[type="date"]') as HTMLInputElement;
    const time = form.querySelector('input[aria-label="Start time"]') as HTMLInputElement;
    due.value = '';
    time.value = '10:00';
    title.value = 'Still today';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => {
      expect(tasksApi.createTask).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(tasksApi.createTask).mock.calls[0]?.[0]).toMatchObject({
      title: 'Still today',
      due_date: '2026-08-19',
      due_time: '10:00',
      estimated_duration: 60
    });
    expect(due.value).toBe('2026-08-19');
  });
});

describe('requestToggleDone', () => {
  beforeEach(() => {
    vi.mocked(tasksApi.updateTask).mockReset();
    vi.mocked(tasksApi.recordClareActual).mockReset();
  });

  it('leaves status unchanged when Discard is clicked on a Clare-estimated task', async () => {
    const host = document.createElement('div');
    const onDone = vi.fn();
    requestToggleDone(host, sampleTask(), onDone);

    expect(host.querySelector('.confirm-card')).not.toBeNull();
    host.querySelector<HTMLButtonElement>('.btn--ghost')?.click();

    expect(onDone).not.toHaveBeenCalled();
    expect(tasksApi.updateTask).not.toHaveBeenCalled();
    expect(tasksApi.recordClareActual).not.toHaveBeenCalled();
    expect(host.querySelector('.confirm-card')).toBeNull();
  });

  it('records actual minutes only after Confirm', async () => {
    vi.mocked(tasksApi.recordClareActual).mockResolvedValue(sampleTask({ status: 'done' }) as never);
    const host = document.createElement('div');
    const onDone = vi.fn().mockResolvedValue(undefined);
    requestToggleDone(host, sampleTask(), onDone);
    host.querySelector<HTMLButtonElement>('.btn--primary')?.click();
    await vi.waitFor(() => {
      expect(tasksApi.recordClareActual).toHaveBeenCalledWith('task_audit', 55);
      expect(onDone).toHaveBeenCalledTimes(1);
    });
  });
});
