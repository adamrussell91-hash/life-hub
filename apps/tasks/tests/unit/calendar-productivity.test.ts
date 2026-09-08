import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tasksApi } from '@/services/client-api';
import { renderMonthView, renderWeekView, resetCalendarSession } from '@/views/calendar';
import { resetCollapsibleFiltersForTests } from '@/views/collapsible-filters';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import type { ClareDumpResult, ClareProposal } from '@/domain/clare';

/**
 * Every widget the calendar's productivity layer adds (locks, next actions, the brain
 * dump, project pulse, the stall banner) has to actually do something when clicked —
 * these tests exist specifically to catch a click that silently does nothing.
 */

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    listTasks: vi.fn(),
    listProjects: vi.fn(),
    updateTask: vi.fn(),
    createTask: vi.fn(),
    deleteTask: vi.fn(),
    processDumpWithClare: vi.fn(),
    acceptClareProposal: vi.fn()
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
    due_date: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    completed_at: null,
    status: 'open',
    blocked_since: null,
    priority: 'high',
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

describe('calendar productivity layer', () => {
  beforeEach(() => {
    resetCalendarSession();
    resetCollapsibleFiltersForTests();
    location.hash = '#/week?date=2026-08-17';
    vi.mocked(tasksApi.listTasks).mockReset();
    vi.mocked(tasksApi.listProjects).mockReset();
    vi.mocked(tasksApi.processDumpWithClare).mockReset();
    vi.mocked(tasksApi.acceptClareProposal).mockReset();
  });

  it('locks the real highest-priority dated task per day and opens it for real when clicked', async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue([
      task({ id: 'task_a', title: 'Marking — Yr11 essays', due_date: '2026-08-17', priority: 'urgent' })
    ]);
    vi.mocked(tasksApi.listProjects).mockResolvedValue([]);

    const canvas = document.createElement('main');
    await renderWeekView(canvas);

    const lockRow = [...canvas.querySelectorAll<HTMLButtonElement>('.calendar-lock-row')].find((row) =>
      row.textContent?.includes('Marking')
    );
    expect(lockRow).toBeTruthy();
    lockRow!.click();

    await vi.waitFor(() => {
      expect(canvas.querySelector('.task-editor')).not.toBeNull();
      expect(canvas.textContent).toContain('Marking — Yr11 essays');
    });
  });

  it('shows undated backlog tasks as next actions, grouped by whatever tag they really carry', async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue([
      task({ id: 'task_ctx', title: 'Ring the printer people', due_date: null, tags: ['calls'] })
    ]);
    vi.mocked(tasksApi.listProjects).mockResolvedValue([]);

    const canvas = document.createElement('main');
    await renderWeekView(canvas);

    const widget = canvas.querySelector('.calendar-next-actions');
    expect(widget?.textContent).toContain('Ring the printer people');
    expect(widget?.textContent).toContain('calls');
  });

  it('opens the real task editor from a Next actions card menu, not a dead click', async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue([
      task({ id: 'task_ctx', title: 'Ring the printer people', due_date: null, tags: ['calls'] })
    ]);
    vi.mocked(tasksApi.listProjects).mockResolvedValue([]);

    const canvas = document.createElement('main');
    await renderWeekView(canvas);

    const menuBtn = canvas.querySelector<HTMLButtonElement>(
      'button[aria-label="Ring the printer people card menu"]'
    );
    expect(menuBtn).toBeTruthy();
    menuBtn!.click();
    const editBtn = document.querySelector<HTMLButtonElement>('button[data-card-menu-item="edit"]');
    expect(editBtn).toBeTruthy();
    editBtn!.click();

    await vi.waitFor(() => {
      expect(canvas.querySelector('.task-editor')).not.toBeNull();
    });
  });

  it('gives Someday and Backlog quick links real live counts and real routes', async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue([
      task({ id: 'task_someday', title: 'Learn Ableton', bucket: 'someday', due_date: null }),
      task({ id: 'task_backlog', title: 'Sort the garage', due_date: null })
    ]);
    vi.mocked(tasksApi.listProjects).mockResolvedValue([]);

    const canvas = document.createElement('main');
    await renderWeekView(canvas);

    const links = [...canvas.querySelectorAll<HTMLAnchorElement>('.calendar-quick-links__row a')];
    const someday = links.find((a) => a.textContent?.startsWith('Someday'));
    const backlog = links.find((a) => a.textContent?.startsWith('Backlog'));
    expect(someday?.textContent).toBe('Someday · 1');
    expect(someday?.getAttribute('href')).toBe('#/someday');
    expect(backlog?.textContent).toBe('Backlog · 1');
    expect(backlog?.getAttribute('href')).toBe('#/backlog');
  });

  it("turns a real brain dump into a real task through Clare's dump/accept API", async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue([]);
    vi.mocked(tasksApi.listProjects).mockResolvedValue([]);

    const proposal: ClareProposal = {
      title: 'Book the venue tour',
      domain: 'wedding',
      description: '',
      priority: 'high',
      due_date: null,
      parent_project_id: null,
      framework_id: 'default',
      framework_name: 'Default',
      reasoning: '',
      proposed_minutes: 30,
      suggested_accepted_minutes: 30,
      calibration_note: null
    };
    vi.mocked(tasksApi.processDumpWithClare).mockResolvedValue({
      voice: '',
      proposals: [proposal],
      questions: [],
      notes: [],
      toolkit: null,
      mutations: [],
      agent: 'clare'
    } as unknown as ClareDumpResult);
    vi.mocked(tasksApi.acceptClareProposal).mockResolvedValue({
      task: task({ id: 'task_new', title: 'Book the venue tour', due_date: null }),
      negotiation: {},
      calibration: {}
    } as unknown as Awaited<ReturnType<typeof tasksApi.acceptClareProposal>>);

    const canvas = document.createElement('main');
    await renderWeekView(canvas);

    const textarea = canvas.querySelector<HTMLTextAreaElement>('.calendar-dump__input')!;
    textarea.value = 'book the venue tour';
    canvas
      .querySelector<HTMLFormElement>('.calendar-dump__form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(tasksApi.processDumpWithClare).toHaveBeenCalledWith({ text: 'book the venue tour' });
      expect(canvas.querySelector('.calendar-dump__proposal')).not.toBeNull();
    });

    canvas.querySelector<HTMLButtonElement>('.calendar-dump__proposal-actions .btn--primary')!.click();

    await vi.waitFor(() => {
      expect(tasksApi.acceptClareProposal).toHaveBeenCalledWith({ proposal, accepted_minutes: 30 });
      expect(canvas.querySelector('.calendar-dump__proposal')).toBeNull();
    });
  });

  it('shows real project pulse cards in month view and navigates to the real project on click', async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue([]);
    vi.mocked(tasksApi.listProjects).mockResolvedValue([project({ id: 'proj_x', title: 'Wedding' })]);

    location.hash = '#/month?date=2026-08-17';
    const canvas = document.createElement('main');
    await renderMonthView(canvas);

    const card = [...canvas.querySelectorAll<HTMLButtonElement>('.calendar-pulse-card')].find((btn) =>
      btn.textContent?.includes('Wedding')
    );
    expect(card).toBeTruthy();
    card!.click();
    expect(location.hash).toContain('proj_x');
  });

  it('shows real per-domain last-touched chips, most-stale first, honestly labeled', async () => {
    const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
    vi.mocked(tasksApi.listTasks).mockResolvedValue([
      task({ id: 'task_fresh', title: 'Mark essays', domain: 'teaching', due_date: null, updated_at: daysAgo(2) }),
      task({ id: 'task_stale', title: 'Book venue', domain: 'wedding', due_date: null, updated_at: daysAgo(30) })
      // health, life, other: no tasks at all — should read "no activity yet".
    ]);
    vi.mocked(tasksApi.listProjects).mockResolvedValue([]);

    location.hash = '#/month?date=2026-08-17';
    const canvas = document.createElement('main');
    await renderMonthView(canvas);

    const chips = [...canvas.querySelectorAll<HTMLElement>('.calendar-touched-chip')];
    const byLabel = (label: string) => chips.find((c) => c.textContent?.startsWith(label));

    const wedding = byLabel('wedding');
    expect(wedding?.textContent).toContain('30d ago');
    expect(wedding?.querySelector('.calendar-touched-dot')?.className).toContain('--stale');

    const teaching = byLabel('teaching');
    expect(teaching?.textContent).toContain('2d ago');
    expect(teaching?.querySelector('.calendar-touched-dot')?.className).toContain('--ok');

    const health = byLabel('health');
    expect(health?.textContent).toContain('no activity yet');

    // Most-stale first: wedding (30d) before teaching (2d).
    const order = chips.map((c) => c.textContent ?? '');
    expect(order.indexOf(wedding!.textContent!)).toBeLessThan(order.indexOf(teaching!.textContent!));
  });

  it('flags real stalled projects with a link to Projects', async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue([]);
    vi.mocked(tasksApi.listProjects).mockResolvedValue([
      project({
        id: 'proj_stalled',
        title: 'Old renovation',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z'
      })
    ]);

    location.hash = '#/month?date=2026-08-17';
    const canvas = document.createElement('main');
    await renderMonthView(canvas);

    const banner = canvas.querySelector<HTMLAnchorElement>('.calendar-stall-banner');
    expect(banner?.getAttribute('href')).toBe('#/projects');
    expect(banner?.textContent).toContain('1 project stalled');
  });

  it('omits the stall banner entirely when nothing is stalled, rather than showing an empty one', async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue([]);
    vi.mocked(tasksApi.listProjects).mockResolvedValue([project({ id: 'proj_fresh', title: 'New project' })]);

    location.hash = '#/month?date=2026-08-17';
    const canvas = document.createElement('main');
    await renderMonthView(canvas);

    expect(canvas.querySelector('.calendar-stall-banner')).toBeNull();
  });
});
