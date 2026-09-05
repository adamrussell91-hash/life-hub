import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/schemas/task';
import { mountDailyDial, resetDailyDialSession } from '@/views/daily-dial';
import { hubCalendarDate, toDateKey } from '@/domain/queries';

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    schema_version: 1,
    description: '',
    kind: 'task',
    bucket: 'active',
    step_order: 0,
    domain: 'teaching',
    framework_used: null,
    estimated_duration: 45,
    actual_duration: null,
    due_date: toDateKey(hubCalendarDate()),
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
    due_time: '09:00',
    remind_at: null,
    remind_dismissed_at: null,
    attachments: [],
    source: 'manual',
    ...partial
  };
}

describe('daily dial view', () => {
  beforeEach(() => {
    resetDailyDialSession();
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    } as unknown as MediaQueryList);
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('mounts the day ring with hub pills and a focused hour', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const now = new Date('2026-08-29T23:10:00.000Z');
    const todayKey = toDateKey(hubCalendarDate(now));
    const handle = mountDailyDial(host, {
      tasks: [task({ id: 'task_standup', title: 'Standup', due_date: todayKey })],
      projects: [],
      now,
      date: hubCalendarDate(now)
    });
    expect(host.querySelector('.daily-dial')).not.toBeNull();
    expect(host.querySelector('.glass-panel')).not.toBeNull();
    expect(host.querySelector('.hub-pills')).not.toBeNull();
    expect(host.textContent).toContain('Tap an hour to schedule');
    expect(host.querySelector('.daily-dial__label--focused')?.textContent).toBe('9 AM');
    expect(host.querySelector('.daily-dial__chip-title')?.textContent).toBe('Standup');
    handle.destroy();
  });

  it('opens a task from a radial chip', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const opened: string[] = [];
    const now = new Date('2026-08-29T23:10:00.000Z');
    const standup = task({
      id: 'task_standup',
      title: 'Standup',
      due_date: toDateKey(hubCalendarDate(now))
    });
    mountDailyDial(host, {
      tasks: [standup],
      projects: [],
      now,
      date: hubCalendarDate(now),
      onOpen: (current) => opened.push(current.id)
    });
    host.querySelector<HTMLButtonElement>('.daily-dial__chip')?.click();
    expect(opened).toEqual(['task_standup']);
  });

  it('switches to the week ring from the hub pills', () => {
    const host = document.createElement('div');
    document.body.append(host);
    mountDailyDial(host, {
      tasks: [task({ id: 'task_standup', title: 'Standup' })],
      projects: []
    });
    const weekBtn = [...host.querySelectorAll<HTMLButtonElement>('.hub-pills__btn')].find(
      (btn) => btn.textContent === 'Week'
    );
    weekBtn?.click();
    expect(weekBtn?.classList.contains('is-active')).toBe(true);
    expect(host.textContent).toContain('Tap a day to see its schedule');
    expect(host.querySelector('.daily-dial__week-total')).not.toBeNull();
  });

  it('omits domains deleted from Properties in the dial legend', async () => {
    const { DEFAULT_TASK_PROPERTY_CONFIG } = await import('@/domain/task-properties-defaults');
    const taskProperties = await import('@/services/task-properties');
    vi.spyOn(taskProperties, 'getTaskPropertiesSync').mockReturnValue({
      ...DEFAULT_TASK_PROPERTY_CONFIG,
      domains: DEFAULT_TASK_PROPERTY_CONFIG.domains.filter((entry) => entry.id !== 'wedding')
    });
    const host = document.createElement('div');
    document.body.append(host);
    mountDailyDial(host, { tasks: [], projects: [] });
    const legend = host.querySelector('.daily-dial__legend')?.textContent ?? '';
    expect(legend).toContain('Life');
    expect(legend).not.toContain('Wedding');
  });
});
