import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import { tasksApi } from '@/services/client-api';
import { closeCardMenu } from '@/views/card-menu';
import { renderProjectsView, resetProjectsViewStateForTests } from '@/views/projects';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    flagStalledProjects: vi.fn(),
    listProjects: vi.fn(),
    listTasks: vi.fn(),
    listGoals: vi.fn(),
    listReviewLogs: vi.fn(),
    getPlanningProfile: vi.fn(),
    closeProject: vi.fn(),
    createProject: vi.fn(),
    deleteProject: vi.fn(),
    resolveStalledProject: vi.fn(),
    updateProject: vi.fn()
  }
}));

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

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    schema_version: 1,
    description: '',
    kind: 'task',
    bucket: 'active',
    step_order: 0,
    domain: 'teaching',
    framework_used: null,
    estimated_duration: 60,
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

const fixtures = {
  go: project({
    id: 'proj_go',
    title: 'HSC Tool',
    description: 'Question bank transcription.',
    type: 'academic_program',
    parent_goal_id: 'goal_teach'
  }),
  plan: project({
    id: 'proj_plan',
    title: 'MindWorks prep',
    description: 'Slides still sitting.',
    type: 'academic_program'
  }),
  idle: project({
    id: 'proj_idle',
    title: 'Blank canvas',
    description: 'No tasks yet.'
  }),
  done: project({
    id: 'proj_done',
    title: 'Term 2 wrap',
    status: 'archived_dead',
    review_summary: 'Closed last term.'
  }),
  stall: project({
    id: 'proj_stall',
    title: 'Masters notes',
    status: 'stalled',
    stall_flagged_at: '2026-08-21',
    arc_summary: 'Quiet since June.'
  })
};

const tasks: Task[] = [
  task({
    id: 't_go',
    title: 'Transcribe',
    parent_project_id: 'proj_go',
    status: 'in_progress'
  }),
  task({
    id: 't_plan',
    title: 'Draft slides',
    parent_project_id: 'proj_plan',
    status: 'open'
  })
];

describe('projects view rebuild', () => {
  beforeEach(() => {
    // Fixtures use created_at: '2026-08-01' with no other activity, and the
    // stall threshold is 6 weeks — without pinning "now", every fixture
    // project quietly starts qualifying as stalled once real time passes
    // that window (it already has). Fake only Date, not timers, so
    // vi.waitFor-based tests elsewhere in this file keep working.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-15T12:00:00.000Z'));
    resetProjectsViewStateForTests();
    vi.clearAllMocks();
    vi.mocked(tasksApi.flagStalledProjects).mockResolvedValue({ flagged: [], candidates: 0 });
    vi.mocked(tasksApi.listProjects).mockResolvedValue(Object.values(fixtures));
    vi.mocked(tasksApi.listTasks).mockResolvedValue(tasks);
    vi.mocked(tasksApi.listGoals).mockResolvedValue([
      {
        schema_version: 1,
        id: 'goal_teach',
        title: 'Teaching systems',
        description: '',
        parent_area_id: 'area_teaching',
        status: 'active',
        tags: [],
        created_at: '2026-08-01T00:00:00.000Z',
        updated_at: '2026-08-01T00:00:00.000Z'
      }
    ]);
    vi.mocked(tasksApi.listReviewLogs).mockResolvedValue([]);
    vi.mocked(tasksApi.getPlanningProfile).mockRejectedValue(new Error('no profile'));
    location.hash = '#/projects';
  });

  afterEach(() => {
    closeCardMenu();
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it('renders a status mix chart with every live lifecycle count', async () => {
    const canvas = document.createElement('main');
    await renderProjectsView(canvas);

    const chart = canvas.querySelector('.projects-chart');
    expect(chart).not.toBeNull();
    expect(chart?.querySelector('.projects-mix__pie')?.getAttribute('aria-label')).toMatch(/On the go/);
    expect(chart?.textContent).toContain('What’s the mix?');
    expect(chart?.textContent).toMatch(/running/);
    const legend = [...canvas.querySelectorAll('.projects-chart__slice')].map((btn) => btn.textContent);
    expect(legend.some((text) => text?.includes('On the go') && text.includes('1'))).toBe(true);
    expect(legend.some((text) => text?.includes('Planning') && text.includes('1'))).toBe(true);
    expect(legend.some((text) => text?.includes('Not started') && text.includes('1'))).toBe(true);
    expect(legend.some((text) => text?.includes('Stalled') && text.includes('1'))).toBe(true);
    // Completed counts archived/completed projects (still filtered off the
    // default board — click Completed on the mix to list them).
    expect(legend.some((text) => text?.includes('Completed') && text.includes('1'))).toBe(true);
  });

  it('still paints when a stored project omitted milestones', async () => {
    const legacy = project({ id: 'proj_legacy', title: 'Blob without milestones' });
    delete (legacy as { milestones?: Project['milestones'] }).milestones;
    vi.mocked(tasksApi.listProjects).mockResolvedValue([legacy]);
    const canvas = document.createElement('main');
    await renderProjectsView(canvas);
    expect(canvas.textContent).not.toMatch(/Could not load Projects/);
    expect(canvas.querySelector('.projects-chart')).not.toBeNull();
    expect(canvas.textContent).toContain('Blob without milestones');
  });

  it('puts a plus-add on the toolbar so a project can be created', async () => {
    const canvas = document.createElement('main');
    await renderProjectsView(canvas);

    const toolbar = canvas.querySelector('.hub-toolbar');
    expect(toolbar?.querySelector('.plus-add__btn')?.getAttribute('aria-label')).toBe('Add a project');
    expect(canvas.querySelector('[aria-label="New project title"]')).not.toBeNull();
    expect(canvas.querySelector('form.quick-add .btn--primary')?.textContent).toBe('Add');
  });

  it('inserts a quick-add project without remounting the page', async () => {
    const created = project({
      id: 'proj_new',
      title: 'Year 12 formal',
      type: 'standard',
      parent_goal_id: 'goal_teach'
    });
    vi.mocked(tasksApi.createProject).mockResolvedValue(created);
    const canvas = document.createElement('main');
    document.body.append(canvas);
    await renderProjectsView(canvas);
    const listsBefore = vi.mocked(tasksApi.listProjects).mock.calls.length;

    const form = canvas.querySelector('form.quick-add') as HTMLFormElement;
    const title = form.querySelector<HTMLInputElement>('[aria-label="New project title"]');
    expect(title).not.toBeNull();
    title!.value = 'Year 12 formal';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(canvas.querySelector('[data-project-id="proj_new"] .pcard__title')?.textContent).toBe(
        'Year 12 formal'
      );
    });
    expect(tasksApi.createProject).toHaveBeenCalledWith({
      title: 'Year 12 formal',
      type: 'standard',
      parent_goal_id: null
    });
    expect(canvas.querySelector('.canvas-status')).toBeNull();
    expect(canvas.textContent).not.toContain('Loading…');
    expect(vi.mocked(tasksApi.listProjects)).toHaveBeenCalledTimes(listsBefore);
    expect(canvas.querySelector('[data-project-id="proj_go"]')).not.toBeNull();
    const notStarted = [...canvas.querySelectorAll('.lane')].find(
      (lane) => lane.querySelector('.lane__title')?.textContent === 'Not started'
    );
    expect(notStarted?.textContent).toContain('Year 12 formal');
  });

  it('clears a lifecycle filter so the new project is visible', async () => {
    const created = project({ id: 'proj_new', title: 'Blank slate' });
    vi.mocked(tasksApi.createProject).mockResolvedValue(created);
    const canvas = document.createElement('main');
    document.body.append(canvas);
    await renderProjectsView(canvas);

    const planning = [...canvas.querySelectorAll<HTMLButtonElement>('.projects-chart__slice')].find((btn) =>
      btn.textContent?.includes('Planning')
    );
    planning?.click();
    await vi.waitFor(() => {
      expect(canvas.querySelector('.projects-chart__slice.is-active')?.textContent).toMatch(/Planning/);
    });

    const form = canvas.querySelector('form.quick-add') as HTMLFormElement;
    form.querySelector<HTMLInputElement>('[aria-label="New project title"]')!.value = 'Blank slate';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(canvas.querySelector('[data-project-id="proj_new"]')).not.toBeNull();
    });
    expect(canvas.querySelector('.projects-chart__slice.is-active')).toBeNull();
    expect(canvas.querySelector('[data-project-id="proj_plan"]')).not.toBeNull();
  });

  it('groups the board by status and opens a project page from a card', async () => {
    const canvas = document.createElement('main');
    await renderProjectsView(canvas);

    const lanes = [...canvas.querySelectorAll('.lane__title')].map((node) => node.textContent);
    expect(lanes).toContain('On the go');
    expect(lanes).toContain('Planning');
    expect(lanes).toContain('Not started');
    expect(lanes).toContain('Stalled');
    // No Completed lane on the default board — archived projects stay in
    // the mix count and appear when the Completed slice is selected.
    expect(lanes).not.toContain('Completed');

    const open = canvas.querySelector<HTMLButtonElement>('[data-project-id="proj_go"] .btn');
    expect(open?.textContent).toBe('Open page');
    open?.click();
    expect(location.hash).toBe('#/project/proj_go');
  });

  it('lists completed projects when the mix Completed slice is selected', async () => {
    const canvas = document.createElement('main');
    document.body.append(canvas);
    await renderProjectsView(canvas);

    const completed = [...canvas.querySelectorAll<HTMLButtonElement>('.projects-chart__slice')].find((btn) =>
      btn.textContent?.includes('Completed')
    );
    expect(completed).not.toBeUndefined();
    completed?.click();
    await vi.waitFor(() => {
      const titles = [...canvas.querySelectorAll('.pcard__title')].map((node) => node.textContent);
      expect(titles).toContain('Term 2 wrap');
      expect(titles).not.toContain('HSC Tool');
      expect(canvas.querySelector('.projects-chart__slice.is-active')?.textContent).toMatch(/Completed/);
    });

    const open = canvas.querySelector<HTMLButtonElement>('[data-project-id="proj_done"] .btn');
    expect(open?.textContent).toBe('Open page');
    open?.click();
    expect(location.hash).toBe('#/project/proj_done');
  });

  it('shows human project titles in the review log, not raw ids', async () => {
    vi.mocked(tasksApi.listReviewLogs).mockResolvedValue([
      {
        schema_version: 1,
        id: 'rev_closed',
        project_id: 'proj_done',
        outcome: 'closed',
        reason: 'Wrapped the term.',
        merge_into_project_id: null,
        baseline_end_date: null,
        current_end_date: null,
        slip_days: 0,
        created_at: '2026-08-10T00:00:00.000Z'
      },
      {
        schema_version: 1,
        id: 'rev_missing',
        project_id: 'proj_deleted_elsewhere',
        outcome: 'completed',
        reason: 'Gone from store.',
        merge_into_project_id: null,
        baseline_end_date: null,
        current_end_date: null,
        slip_days: null,
        created_at: '2026-08-11T00:00:00.000Z'
      }
    ]);
    const canvas = document.createElement('main');
    await renderProjectsView(canvas);
    const titles = [...canvas.querySelectorAll('.task-row__title')].map((node) => node.textContent);
    expect(titles.some((text) => text === 'closed · Term 2 wrap')).toBe(true);
    expect(titles.some((text) => text === 'completed · Unknown project')).toBe(true);
    expect(canvas.textContent).not.toMatch(/proj_done/);
    expect(canvas.textContent).not.toMatch(/proj_deleted_elsewhere/);
  });

  it('does not prompt close-out retro for a project that still has open work past its end', async () => {
    vi.mocked(tasksApi.listProjects).mockResolvedValue([
      project({
        id: 'proj_accreditation',
        title: 'Accreditation Mentoring',
        baseline_end_date: '2026-07-01',
        current_end_date: '2026-07-15',
        status: 'active'
      })
    ]);
    vi.mocked(tasksApi.listTasks).mockResolvedValue([
      task({
        id: 't_open',
        title: 'Still mentoring',
        parent_project_id: 'proj_accreditation',
        status: 'open',
        due_date: '2026-07-10'
      })
    ]);
    const canvas = document.createElement('main');
    await renderProjectsView(canvas);
    expect(canvas.textContent).not.toMatch(/Close-out retro/);
    expect(canvas.textContent).toMatch(/Accreditation Mentoring/);
  });

  it('takes Add next action to the project page instead of doing nothing', async () => {
    const canvas = document.createElement('main');
    await renderProjectsView(canvas);
    const hint = canvas.querySelector<HTMLButtonElement>(
      '[data-project-id="proj_idle"] .proj-health'
    );
    expect(hint?.textContent).toBe('Add next action');
    hint?.click();
    expect(location.hash).toBe('#/project/proj_idle');
  });

  it('puts the same three-dot menu and delete on every project card', async () => {
    vi.mocked(tasksApi.deleteProject).mockResolvedValue({ deleted: true });
    const canvas = document.createElement('main');
    document.body.append(canvas);
    await renderProjectsView(canvas);

    const cards = [...canvas.querySelectorAll<HTMLElement>('.pcard')];
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.querySelector('.card-menu')).not.toBeNull();
    }

    // Scoped to .pcard, not just [data-project-id] — a project can also
    // appear as a forecast row/stall-card, which carries the same id but
    // has no .card-menu.
    const mind = canvas.querySelector<HTMLElement>('.pcard[data-project-id="proj_plan"]');
    expect(mind).not.toBeNull();
    mind?.querySelector<HTMLButtonElement>('.card-menu')?.click();
    const menu = document.querySelector<HTMLElement>('.card-menu__panel');
    expect(menu).not.toBeNull();
    expect([...menu!.querySelectorAll('.hub-menu__opt')].map((item) => item.textContent)).toEqual([
      'Full page',
      'Delete'
    ]);
    expect(menu?.querySelector('[data-card-menu-item="delete"]')?.classList.contains('hub-menu__opt--danger')).toBe(
      true
    );

    const listsBeforeDelete = vi.mocked(tasksApi.listProjects).mock.calls.length;
    menu?.querySelector<HTMLButtonElement>('[data-card-menu-item="delete"]')?.click();
    expect(canvas.querySelector('.confirm-card')).toBeNull();
    expect(canvas.textContent).not.toContain('Proposed write');
    await vi.waitFor(() =>
      expect(tasksApi.deleteProject).toHaveBeenCalledWith('proj_plan', {
        agent: 'Tasks Hub',
        reason: 'Card delete'
      })
    );
    await vi.waitFor(() => {
      expect(canvas.querySelector('[data-project-id="proj_plan"]')).toBeNull();
    });
    expect(canvas.querySelector('.canvas-status')).toBeNull();
    expect(vi.mocked(tasksApi.listProjects)).toHaveBeenCalledTimes(listsBeforeDelete);
    expect(canvas.querySelector('[data-project-id="proj_go"]')).not.toBeNull();
  });

  it('switches roadmap range without remounting or refetching', async () => {
    const canvas = document.createElement('main');
    await renderProjectsView(canvas);
    const listsBefore = vi.mocked(tasksApi.listProjects).mock.calls.length;
    expect(canvas.querySelector('.projects-pulse')).not.toBeNull();

    const week = [...canvas.querySelectorAll<HTMLButtonElement>('.hub-pills__btn')].find(
      (btn) => btn.textContent === 'Week'
    );
    week?.click();

    expect(canvas.querySelector('.canvas-status')).toBeNull();
    expect(canvas.querySelector('.projects-pulse')).not.toBeNull();
    expect(week?.classList.contains('is-active') || canvas.textContent).toBeTruthy();
    const activeRange = [...canvas.querySelectorAll<HTMLButtonElement>('.roadmap-head .hub-pills__btn')].find(
      (btn) => btn.classList.contains('is-active')
    );
    expect(activeRange?.textContent).toBe('Week');
    expect(vi.mocked(tasksApi.listProjects)).toHaveBeenCalledTimes(listsBefore);
  });

  it('filters the board when a chart slice is selected', async () => {
    const canvas = document.createElement('main');
    await renderProjectsView(canvas);

    const planning = [...canvas.querySelectorAll<HTMLButtonElement>('.projects-chart__slice')].find((btn) =>
      btn.textContent?.includes('Planning')
    );
    planning?.click();
    await vi.waitFor(() => {
      const titles = [...canvas.querySelectorAll('.pcard__title')].map((node) => node.textContent);
      expect(titles).toContain('MindWorks prep');
      expect(titles).not.toContain('HSC Tool');
      expect(canvas.querySelector('.projects-chart__slice.is-active')?.textContent).toMatch(/Planning/);
    });
  });

  it('puts the forecast first, kanban next, and status mix beside the timeline', async () => {
    const canvas = document.createElement('main');
    await renderProjectsView(canvas);

    const forecast = canvas.querySelector('#project-forecast');
    const board = canvas.querySelector('.projects-board');
    const pulse = canvas.querySelector('.projects-pulse');
    const chart = canvas.querySelector('.projects-chart');
    expect(forecast).not.toBeNull();
    expect(board).not.toBeNull();
    expect(pulse).not.toBeNull();
    expect(chart).not.toBeNull();
    expect(canvas.querySelector('.projects-toolbar')).not.toBeNull();
    // No heatmap — confirmed unused and cut.
    expect(canvas.querySelector('.projects-heatmap')).toBeNull();
    expect(forecast!.compareDocumentPosition(board!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(board!.compareDocumentPosition(pulse!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(canvas.textContent).not.toContain('Portfolio health');
    expect(canvas.querySelector('.roadmap-lede')?.textContent).toMatch(/calendar time/);
    expect(canvas.querySelector('.roadmap-axis__kind')?.textContent).toBe('Time');
  });

  it('changes the timeline range without remounting the page', async () => {
    const canvas = document.createElement('main');
    await renderProjectsView(canvas);
    expect(tasksApi.listProjects).toHaveBeenCalledTimes(1);
    expect(canvas.querySelector('.canvas-status')).toBeNull();

    const week = [...canvas.querySelectorAll<HTMLButtonElement>('.projects-roadmap .hub-pills button')].find(
      (btn) => btn.textContent === 'Week'
    );
    expect(week).not.toBeUndefined();
    week?.click();

    expect(tasksApi.listProjects).toHaveBeenCalledTimes(1);
    expect(tasksApi.flagStalledProjects).toHaveBeenCalledTimes(1);
    expect(canvas.querySelector('.canvas-status')).toBeNull();
    expect(canvas.textContent).not.toContain('Loading…');
    const pressed = canvas.querySelector('.projects-roadmap .hub-pills [aria-pressed="true"]');
    expect(pressed?.textContent).toBe('Week');
  });

  it('keeps stalled-project outcomes and confirm write in the forecast', async () => {
    const canvas = document.createElement('main');
    await renderProjectsView(canvas);

    const forecast = canvas.querySelector('#project-forecast');
    expect(forecast?.textContent).toMatch(/Masters notes/);
    const reason = canvas.querySelector<HTMLInputElement>('[aria-label="Reason for Masters notes"]');
    expect(reason).not.toBeNull();
    reason!.value = 'Park it for next year';
    const bury = [...canvas.querySelectorAll<HTMLButtonElement>('.stall-card .btn')].find(
      (btn) => btn.textContent === 'Bury'
    );
    bury?.click();
    expect(canvas.querySelector('.stall-confirm .page-header__supporting')?.textContent).toMatch(/Park it/);
  });
});
