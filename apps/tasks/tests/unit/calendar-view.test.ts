import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tasksApi } from '@/services/client-api';
import { renderMonthView, renderWeekView, resetCalendarSession } from '@/views/calendar';
import { resetCollapsibleFiltersForTests } from '@/views/collapsible-filters';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    listTasks: vi.fn(),
    listProjects: vi.fn(),
    updateTask: vi.fn(),
    createTask: vi.fn(),
    deleteTask: vi.fn()
  }
}));

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
    due_date: '2026-08-17',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    completed_at: null,
    status: 'open',
    blocked_since: null,
    priority: 'high',
    parent_project_id: 'proj_mindworks',
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

const projects: Project[] = [
  {
    schema_version: 1,
    id: 'proj_mindworks',
    title: 'MindWorks',
    description: '',
    parent_goal_id: null,
    tags: [],
    arc_summary: '',
    type: 'academic_program',
    milestones: [
      {
        id: 'ms_brief',
        project_id: 'proj_mindworks',
        title: 'Term brief locked',
        due_date: '2026-08-22',
        status: 'open'
      }
    ],
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
    drafted_documents: null
  }
];

const tasks: Task[] = [
  task({ id: 'task_lesson', title: 'Finish lesson pack', due_date: '2026-08-17' }),
  task({
    id: 'task_florist',
    title: 'Reply to florist',
    due_date: '2026-08-18',
    domain: 'wedding',
    parent_project_id: null
  }),
  task({
    id: 'task_done',
    title: 'Already done',
    due_date: '2026-08-17',
    status: 'done'
  })
];

describe('calendar views', () => {
  beforeEach(() => {
    resetCalendarSession();
    resetCollapsibleFiltersForTests();
    location.hash = '#/month?date=2026-08-17';
    vi.mocked(tasksApi.listTasks).mockReset();
    vi.mocked(tasksApi.listProjects).mockReset();
    vi.mocked(tasksApi.updateTask).mockReset();
    vi.mocked(tasksApi.createTask).mockReset();
    vi.mocked(tasksApi.listTasks).mockResolvedValue(tasks);
    vi.mocked(tasksApi.listProjects).mockResolvedValue(projects);
    vi.mocked(tasksApi.updateTask).mockImplementation(async (id, body) => {
      const found = tasks.find((entry) => entry.id === id)!;
      return { ...found, ...(body as Partial<Task>) };
    });
    vi.mocked(tasksApi.createTask).mockImplementation(async (body) =>
      task({
        id: 'task_new',
        title: String((body as { title?: string }).title ?? 'New'),
        due_date: (body as { due_date?: string }).due_date ?? '2026-08-17',
        due_time: (body as { due_time?: string | null }).due_time ?? null,
        estimated_duration: (body as { estimated_duration?: number }).estimated_duration ?? 45
      })
    );
  });

  it('renders a real month grid with tasks, milestones, and overflow hooks', async () => {
    const canvas = document.createElement('main');
    await renderMonthView(canvas);

    expect(canvas.querySelectorAll('.hub-calendar__day')).toHaveLength(42);
    expect([...canvas.querySelectorAll('.hub-calendar__weekday')].map((node) => node.textContent)).toEqual([
      'M',
      'T',
      'W',
      'T',
      'F',
      'S',
      'S'
    ]);
    expect(canvas.querySelector('[data-task-id="task_lesson"]')?.textContent).toContain('Finish lesson pack');
    expect(canvas.querySelector('[data-kind="milestone"]')?.textContent).toContain('Term brief locked');
    expect(canvas.querySelector('.hub-calendar__month-label')?.textContent).toMatch(/August 2026/);
    expect(canvas.querySelector('[data-date="2026-08-17"][data-kind="task"]')).not.toBeNull();
  });

  it('hides calendar filters behind an icon until it is opened', async () => {
    const canvas = document.createElement('main');
    await renderMonthView(canvas);
    const toggle = canvas.querySelector<HTMLButtonElement>('.hub-filters__toggle');
    const panel = canvas.querySelector<HTMLElement>('.hub-filters__panel');
    expect(toggle?.getAttribute('aria-label')).toBe('Filters');
    expect(panel?.hidden).toBe(true);
    expect(canvas.querySelector('.calendar-search')).not.toBeNull();
    toggle?.click();
    expect(panel?.hidden).toBe(false);
    expect(canvas.querySelector('.calendar-search') instanceof HTMLInputElement).toBe(true);
  });

  it('keeps completed work off the grid until the Completed layer is on', async () => {
    const canvas = document.createElement('main');
    await renderMonthView(canvas);
    expect(canvas.querySelector('[data-task-id="task_done"]')).toBeNull();

    canvas.querySelector<HTMLButtonElement>('[aria-pressed="false"]')?.click();
    expect(canvas.textContent).toMatch(/Already done/);
  });

  it('opens the task editor from a month chip', async () => {
    const canvas = document.createElement('main');
    await renderMonthView(canvas);
    canvas.querySelector<HTMLButtonElement>('[data-task-id="task_lesson"]')?.click();
    await vi.waitFor(() => {
      expect(canvas.querySelector('.task-editor')).not.toBeNull();
    });
    expect(canvas.querySelector('.task-editor [aria-label="Title"]')).toBeTruthy();
  });

  it('renders seven week columns and a dated quick-add on the selected day', async () => {
    location.hash = '#/week?date=2026-08-17';
    const canvas = document.createElement('main');
    await renderWeekView(canvas);

    expect(canvas.querySelectorAll('.hub-calendar__week-day')).toHaveLength(7);
    expect(canvas.querySelector('[data-task-id="task_lesson"]')).not.toBeNull();
    expect(canvas.querySelector('[data-task-id="task_florist"]')).not.toBeNull();
    const due = canvas.querySelector<HTMLInputElement>('.hub-calendar__detail input[type="date"]');
    expect(due?.value).toBe('2026-08-17');
    expect(canvas.querySelector('.hub-calendar__month-label')?.textContent).toMatch(/17\/08\/26/);
  });

  it('reschedules a task when it is dropped on another day', async () => {
    location.hash = '#/week?date=2026-08-17';
    const canvas = document.createElement('main');
    await renderWeekView(canvas);

    const friday = canvas.querySelector<HTMLElement>('.hub-calendar__week-day[data-date="2026-08-21"]')!;
    const transfer = {
      data: { 'text/task-id': 'task_lesson', 'text/plain': 'task_lesson' } as Record<string, string>,
      getData(type: string) {
        return this.data[type] ?? '';
      },
      setData(type: string, value: string) {
        this.data[type] = value;
      },
      effectAllowed: 'move',
      dropEffect: 'move'
    };
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: transfer });
    friday.dispatchEvent(drop);

    await vi.waitFor(() => {
      expect(tasksApi.updateTask).toHaveBeenCalledWith('task_lesson', { due_date: '2026-08-21' });
    });
  });

  it('adds a task on the selected calendar day', async () => {
    location.hash = '#/week?date=2026-08-19';
    const canvas = document.createElement('main');
    await renderWeekView(canvas);

    const form = canvas.querySelector('.hub-calendar__detail .quick-add') as HTMLFormElement;
    const title = form.querySelector('input[aria-label="New task title"]') as HTMLInputElement;
    title.value = 'Prep excursion bags';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(tasksApi.createTask).toHaveBeenCalledTimes(1);
      expect(canvas.textContent).toContain('Prep excursion bags');
    });
    expect(vi.mocked(tasksApi.createTask).mock.calls[0]?.[0]).toMatchObject({
      title: 'Prep excursion bags',
      due_date: '2026-08-19'
    });
    expect(vi.mocked(tasksApi.listTasks)).toHaveBeenCalledTimes(1);
    expect(canvas.querySelector('.canvas-status')).toBeNull();
  });

  it('moves the month with Next and keeps a calendar grid', async () => {
    const canvas = document.createElement('main');
    await renderMonthView(canvas);
    canvas.querySelector<HTMLButtonElement>('[aria-label="Next month"]')?.click();
    expect(canvas.querySelectorAll('.hub-calendar__day')).toHaveLength(42);
    expect(canvas.querySelector('.hub-calendar__month-label')?.textContent).toMatch(/September 2026/);
  });

  it('switches week and month in place without refetching', async () => {
    const canvas = document.createElement('main');
    await renderMonthView(canvas);
    expect(canvas.querySelectorAll('.hub-calendar__day')).toHaveLength(42);
    expect(vi.mocked(tasksApi.listTasks)).toHaveBeenCalledTimes(1);

    const weekTab = [...canvas.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (btn) => btn.textContent === 'Week'
    );
    weekTab?.click();

    expect(canvas.querySelector('.canvas-status')).toBeNull();
    expect(canvas.querySelectorAll('.hub-calendar__week-day')).toHaveLength(7);
    expect(canvas.querySelectorAll('.hub-calendar__day')).toHaveLength(0);
    expect(vi.mocked(tasksApi.listTasks)).toHaveBeenCalledTimes(1);
    expect(location.hash).toMatch(/^#\/week/);

    const monthTab = [...canvas.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (btn) => btn.textContent === 'Month'
    );
    monthTab?.click();

    expect(canvas.querySelector('.canvas-status')).toBeNull();
    expect(canvas.querySelectorAll('.hub-calendar__day')).toHaveLength(42);
    expect(vi.mocked(tasksApi.listTasks)).toHaveBeenCalledTimes(1);
    expect(location.hash).toMatch(/^#\/month/);
  });

  it('renders a week time grid with a standing compose field', async () => {
    location.hash = '#/week?date=2026-08-17';
    const canvas = document.createElement('main');
    await renderWeekView(canvas);

    expect(canvas.querySelector('.hub-calendar__timegrid')).not.toBeNull();
    expect(canvas.querySelectorAll('.hub-calendar__hours')).toHaveLength(7);
    expect(canvas.querySelector('.calendar-compose [aria-label="New task title"]')).not.toBeNull();
    expect(canvas.querySelector('.calendar-compose [aria-label="Start time"]')).not.toBeNull();
  });

  it('opens a day time grid from the Day tab without refetching', async () => {
    location.hash = '#/week?date=2026-08-17';
    const canvas = document.createElement('main');
    await renderWeekView(canvas);
    const dayTab = [...canvas.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (btn) => btn.textContent === 'Day'
    );
    dayTab?.click();

    expect(canvas.querySelector('.canvas-status')).toBeNull();
    expect(canvas.querySelector('.hub-calendar__timegrid')?.getAttribute('data-days')).toBe('1');
    expect(canvas.querySelectorAll('.hub-calendar__hours')).toHaveLength(1);
    expect(vi.mocked(tasksApi.listTasks)).toHaveBeenCalledTimes(1);
    expect(location.hash).toContain('layout=day');
  });

  it('clicking an empty hour prefills compose time and focuses the title', async () => {
    location.hash = '#/week?date=2026-08-17&layout=day';
    const canvas = document.createElement('main');
    document.body.append(canvas);
    await renderWeekView(canvas);

    const hours = canvas.querySelector<HTMLElement>('.hub-calendar__hours')!;
    hours.getBoundingClientRect = () =>
      ({ top: 0, left: 0, bottom: 832, right: 200, width: 200, height: 832, x: 0, y: 0, toJSON() {} });
    hours.dispatchEvent(
      new MouseEvent('click', { bubbles: true, clientX: 20, clientY: 156 })
    );

    const time = canvas.querySelector<HTMLInputElement>('[aria-label="Start time"]');
    const title = canvas.querySelector<HTMLInputElement>('[aria-label="New task title"]');
    expect(time?.value).toBe('09:00');
    expect(document.activeElement).toBe(title);
    canvas.remove();
  });

  it('creates a timed task from the standing compose field', async () => {
    location.hash = '#/week?date=2026-08-17&layout=day';
    const canvas = document.createElement('main');
    await renderWeekView(canvas);

    const form = canvas.querySelector('.calendar-compose .quick-add') as HTMLFormElement;
    const title = form.querySelector('input[aria-label="New task title"]') as HTMLInputElement;
    const time = form.querySelector('input[aria-label="Start time"]') as HTMLInputElement;
    title.value = 'Gym';
    time.value = '12:00';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(tasksApi.createTask).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(tasksApi.createTask).mock.calls[0]?.[0]).toMatchObject({
      title: 'Gym',
      due_date: '2026-08-17',
      due_time: '12:00',
      estimated_duration: 60
    });
  });

  it('opens go-to-date from G and selects another day from the heading', async () => {
    location.hash = '#/week?date=2026-08-17';
    const canvas = document.createElement('main');
    document.body.append(canvas);
    await renderWeekView(canvas);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
    expect(document.querySelector('[aria-label="Go to date"]')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.calendar-command')).toBeNull();

    canvas.querySelector<HTMLElement>('.hub-calendar__time-heading[data-date="2026-08-22"]')?.click();
    expect(
      canvas.querySelector<HTMLElement>('.hub-calendar__time-heading[data-selected="true"]')
        ?.dataset.date
    ).toBe('2026-08-22');
    canvas.remove();
  });
});
