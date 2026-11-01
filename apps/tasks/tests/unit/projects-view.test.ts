import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import { tasksApi } from '@/services/client-api';
import { closeCardMenu } from '@/views/card-menu';
import { renderProjectsView, resetProjectsViewStateForTests } from '@/views/projects';
import { problemSolverApi } from '@/views/problem-solver/api';

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
    updateProject: vi.fn(),
    updateTask: vi.fn(),
    createTask: vi.fn(),
    getHubPrefs: vi.fn()
  }
}));

vi.mock('@/views/problem-solver/api', () => {
  const tool = () => ({ list: vi.fn().mockResolvedValue([]), create: vi.fn() });
  return {
    problemSolverApi: tool(),
    decisionBookApi: tool(),
    gearShifterApi: tool(),
    rulesBookApi: tool(),
    changeBookApi: tool(),
    collaborationBookApi: tool(),
    communicationBookApi: tool()
  };
});

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

/** The kanban is the secondary view now — the runway is where Projects lands. */
function openBoard(canvas: HTMLElement): void {
  [...canvas.querySelectorAll<HTMLButtonElement>('[aria-label="View"] button')]
    .find((button) => button.textContent === 'Board')
    ?.click();
}

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
    openBoard(canvas);

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
    openBoard(canvas);
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
    openBoard(canvas);
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
    openBoard(canvas);

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
    openBoard(canvas);

    const lanes = [...canvas.querySelectorAll('.lane__title')].map((node) => node.textContent);
    expect(lanes).toContain('On the go');
    expect(lanes).toContain('Planning');
    expect(lanes).toContain('Not started');
    expect(lanes).toContain('Stalled');
    // No Completed lane on the default board — archived projects stay in
    // the mix count and appear when the Completed slice is selected.
    expect(lanes).not.toContain('Completed');

    const open = canvas.querySelector<HTMLButtonElement>('[data-project-id="proj_go"] .pcard__actions .btn');
    expect(open?.textContent).toBe('Open page');
    open?.click();
    expect(location.hash).toBe('#/project/proj_go');
  });

  it('lists completed projects when the mix Completed slice is selected', async () => {
    const canvas = document.createElement('main');
    document.body.append(canvas);
    await renderProjectsView(canvas);
    openBoard(canvas);

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
    openBoard(canvas);
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
    openBoard(canvas);

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
      'Mark as NSW HALT',
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
    openBoard(canvas);
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
    openBoard(canvas);

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

  it('lands on the runway alone, and keeps forecast, board and the mix bento on Board', async () => {
    const canvas = document.createElement('main');
    await renderProjectsView(canvas);

    expect(canvas.querySelector('.runway')).not.toBeNull();
    expect(canvas.querySelector('.projects-board')).toBeNull();
    expect(canvas.querySelector('#project-forecast')).toBeNull();
    expect(canvas.querySelector('.projects-pulse')).toBeNull();
    expect(canvas.querySelector('.projects-hive')).toBeNull();
    // Group-by belongs to the board only.
    expect(canvas.querySelector('[aria-label="Group by (more)"]')).toBeNull();

    openBoard(canvas);
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
    expect(canvas.querySelector('.roadmap-lede')?.textContent).toMatch(/calendar span/);
    expect(canvas.querySelector('.roadmap-axis__kind')?.textContent).toBe('Time');
    // Compact mix keeps the pulse row content-height with Timeline.
    expect(chart?.querySelector('.project-pulse-chart--compact')).not.toBeNull();
    // Due-for-review never floats as a sibling under the pulse — it lives in the bento.
    expect(canvas.querySelector('.projects-pulse + .projects-retro')).toBeNull();
    const labels = [...canvas.querySelectorAll<HTMLElement>('.roadmap-row__label')];
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.every((node) => node.title && node.title === node.textContent)).toBe(true);
  });

  it('badges NSW HALT board projects and filters the board by job', async () => {
    vi.mocked(tasksApi.listProjects).mockResolvedValue([
      ...Object.values(fixtures).filter((item) => item.id !== 'proj_plan'),
      { ...fixtures.plan, job: 'halt_board' }
    ]);
    vi.mocked(tasksApi.updateProject).mockResolvedValue({ ...fixtures.plan, job: 'teaching' });
    const canvas = document.createElement('main');
    document.body.append(canvas);
    await renderProjectsView(canvas);
    openBoard(canvas);

    const card = (id: string) => canvas.querySelector<HTMLElement>(`.pcard[data-project-id="${id}"]`);
    expect(card('proj_plan')?.querySelector('.halt-badge')?.getAttribute('aria-label')).toBe('NSW HALT');
    expect(card('proj_go')?.querySelector('.halt-badge')).toBeNull();

    const jobPill = (label: string) =>
      [...canvas.querySelectorAll<HTMLButtonElement>('[aria-label="Job"] button')].find(
        (button) => button.textContent === label
      );
    jobPill('NSW HALT')?.click();
    expect([...canvas.querySelectorAll<HTMLElement>('.pcard')].map((item) => item.dataset.projectId)).toEqual([
      'proj_plan'
    ]);
    jobPill('Teaching')?.click();
    expect(card('proj_plan')).toBeNull();
    expect(card('proj_go')).not.toBeNull();
    jobPill('All jobs')?.click();

    card('proj_plan')?.querySelector<HTMLButtonElement>('.card-menu')?.click();
    document.querySelector<HTMLButtonElement>('[data-card-menu-item="job"]')?.click();
    await vi.waitFor(() =>
      expect(tasksApi.updateProject).toHaveBeenCalledWith('proj_plan', { job: 'teaching' })
    );
  });

  it('nests the due-for-review retro inside the projects bento', async () => {
    vi.mocked(tasksApi.listProjects).mockResolvedValue([
      project({
        id: 'proj_close',
        title: 'Term 2 marking wrap',
        current_end_date: '2026-08-10',
        baseline_end_date: '2026-08-10'
      })
    ]);
    // ready_to_close needs at least one child task and zero open — not an empty project.
    vi.mocked(tasksApi.listTasks).mockResolvedValue([
      task({
        id: 't_done',
        title: 'Marks entered',
        parent_project_id: 'proj_close',
        status: 'done',
        completed_at: '2026-08-10T00:00:00.000Z'
      })
    ]);
    const canvas = document.createElement('main');
    await renderProjectsView(canvas);
    openBoard(canvas);
    const pulse = canvas.querySelector('.projects-pulse');
    const retro = pulse?.querySelector('.projects-retro');
    expect(retro).not.toBeNull();
    expect(retro?.textContent).toMatch(/Due for review/);
    expect(canvas.querySelector('.projects-pulse + .projects-retro')).toBeNull();
  });

  it('changes the timeline range without remounting the page', async () => {
    const canvas = document.createElement('main');
    await renderProjectsView(canvas);
    openBoard(canvas);
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
    openBoard(canvas);

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

  describe('runway', () => {
    const offset = (days: number) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + days);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const row = (canvas: HTMLElement, id: string) => canvas.querySelector<HTMLElement>(`.runway-row[data-project-id="${id}"]`);
    const groupOf = (canvas: HTMLElement, id: string) => row(canvas, id)?.closest<HTMLElement>('.runway-group')?.dataset.group;

    beforeEach(() => {
      vi.mocked(tasksApi.listProjects).mockResolvedValue([
        { ...fixtures.go, current_end_date: offset(10) },
        { ...fixtures.plan, current_end_date: offset(40), job: 'halt_board' },
        fixtures.idle,
        fixtures.done,
        fixtures.stall
      ]);
    });

    it('groups projects by what they need and writes a plain lede', async () => {
      const canvas = document.createElement('main');
      document.body.append(canvas);
      await renderProjectsView(canvas);

      const view = canvas.querySelector('[aria-label="View"] .hub-pills__btn.is-active');
      expect(view?.textContent).toBe('Runway');
      expect(groupOf(canvas, 'proj_go')).toBe('in_air');
      expect(groupOf(canvas, 'proj_plan')).toBe('in_air');
      expect(groupOf(canvas, 'proj_idle')).toBe('on_ground');
      expect(groupOf(canvas, 'proj_stall')).toBe('on_ground');
      // archived_dead is not "landed": only completed projects land.
      expect(row(canvas, 'proj_done')).toBeNull();
      expect(canvas.querySelector('.runway-group--needs_you')?.hasAttribute('hidden')).toBe(true);
      expect(canvas.querySelector('.runway-group--in_air .runway-group__count')?.textContent).toBe('2');

      const lede = canvas.querySelector('.runway-lede')?.textContent ?? '';
      expect(lede).toContain('HSC Tool lands in the next three weeks.');
      expect(lede).toContain('Two are stuck on the ground.');
      expect(canvas.querySelector('.runway-lede__name')?.textContent).toBe('HSC Tool');

      expect(row(canvas, 'proj_plan')?.querySelector('.halt-badge')).not.toBeNull();
      expect(row(canvas, 'proj_go')?.querySelector('.halt-badge')).toBeNull();
      expect(row(canvas, 'proj_plan')?.querySelector('.runway-row__next')?.textContent).toBe('Next: Draft slides');
      expect(row(canvas, 'proj_plan')?.querySelector('.runway-row__title')?.getAttribute('href')).toBe('#/project/proj_plan');
      expect(row(canvas, 'proj_go')?.querySelectorAll('.runway-seg')).toHaveLength(1);
      expect(row(canvas, 'proj_idle')?.querySelector('.runway-ground')).not.toBeNull();
      expect(canvas.querySelector('.runway-unstick')?.textContent).toBe('Unstick 2');
      expect(canvas.querySelector('.runway-dial--load .runway-dial__value')?.textContent).toBe('2 of ~3');
    });

    it('ticks a task from its segment, offers undo and patches only that row', async () => {
      vi.mocked(tasksApi.updateTask).mockImplementation(async (id, body) => ({ ...tasks.find((t) => t.id === id)!, ...(body as object) }) as Task);
      const canvas = document.createElement('main');
      document.body.append(canvas);
      await renderProjectsView(canvas);
      const other = row(canvas, 'proj_go');

      row(canvas, 'proj_plan')!.querySelector<HTMLButtonElement>('.runway-seg')!.click();
      await vi.waitFor(() => expect(tasksApi.updateTask).toHaveBeenCalledWith('t_plan', expect.objectContaining({ status: 'done' })));
      expect(row(canvas, 'proj_plan')?.querySelector('.runway-seg')?.classList.contains('is-done')).toBe(true);
      expect(row(canvas, 'proj_go')).toBe(other);
      await vi.waitFor(() => expect(document.body.textContent).toContain('Ticked “Draft slides”'));
      // Every task done: the complete-project confirm is offered, never applied.
      await vi.waitFor(() => expect(canvas.querySelector('.closure-confirm .confirm-card')).not.toBeNull());
      expect(tasksApi.closeProject).not.toHaveBeenCalled();
      expect(groupOf(canvas, 'proj_plan')).toBe('needs_you');
    });

    it('adds a next action inline as a real task in the project', async () => {
      vi.mocked(tasksApi.createTask).mockImplementation(async (body) =>
        task({ id: 't_new', ...(body as Partial<Task>), title: (body as { title: string }).title })
      );
      const canvas = document.createElement('main');
      document.body.append(canvas);
      await renderProjectsView(canvas);

      row(canvas, 'proj_idle')!.querySelector<HTMLButtonElement>('.runway-addnext')!.click();
      const field = row(canvas, 'proj_idle')!.querySelector<HTMLInputElement>('.runway-nextin')!;
      field.value = 'Sketch the first page';
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await vi.waitFor(() =>
        expect(tasksApi.createTask).toHaveBeenCalledWith({
          title: 'Sketch the first page',
          domain: expect.any(String),
          parent_project_id: 'proj_idle',
          kind: 'task',
          bucket: 'active'
        })
      );
      await vi.waitFor(() => expect(row(canvas, 'proj_idle')?.querySelector('.runway-row__next')?.textContent).toBe('Next: Sketch the first page'));
    });

    it('sets a finish date from the undated slot with undo', async () => {
      vi.mocked(tasksApi.updateProject).mockImplementation(async (id, body) => ({ ...fixtures.idle, ...(body as object) }) as Project);
      const canvas = document.createElement('main');
      document.body.append(canvas);
      await renderProjectsView(canvas);

      row(canvas, 'proj_idle')!.querySelector<HTMLButtonElement>('.runway-ground')!.click();
      await vi.waitFor(() => expect(tasksApi.updateProject).toHaveBeenCalledWith('proj_idle', { current_end_date: offset(28) }));
      expect(row(canvas, 'proj_idle')?.querySelector('.runway-flag')).not.toBeNull();
      await vi.waitFor(() => expect(document.body.textContent).toContain('Blank canvas finishes'));
    });

    it('opens the recommended tool as a linked session from the door', async () => {
      vi.mocked(problemSolverApi.create).mockResolvedValue({ id: 's_new' } as Awaited<ReturnType<typeof problemSolverApi.create>>);
      const canvas = document.createElement('main');
      document.body.append(canvas);
      await renderProjectsView(canvas);

      const door = await vi.waitFor(() => {
        const found = row(canvas, 'proj_stall')?.querySelector<HTMLButtonElement>('.runway-door');
        expect(found).toBeTruthy();
        return found!;
      });
      expect(door.textContent).toBe('?Work it through in Problem Solver →');
      door.click();
      await vi.waitFor(() => expect(location.hash).toBe('#/problem-solver?id=s_new'));
      expect(problemSolverApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ links: [{ kind: 'project', id: 'proj_stall' }], kind: 'full', title: 'Masters notes' })
      );
    });

    it('steps through stuck projects in the unstick sheet', async () => {
      vi.mocked(tasksApi.getHubPrefs).mockRejectedValue(new Error('offline'));
      const canvas = document.createElement('main');
      document.body.append(canvas);
      await renderProjectsView(canvas);

      canvas.querySelector<HTMLButtonElement>('.runway-unstick')!.click();
      const sheet = await vi.waitFor(() => {
        const found = document.querySelector<HTMLElement>('.runway-sheet .runway-sheet__title');
        expect(found).not.toBeNull();
        return document.querySelector<HTMLElement>('.runway-sheet')!;
      });
      expect(sheet.textContent).toContain('Unstick pass · 1 of 2');
      expect(sheet.querySelector('.runway-sheet__title')?.textContent).toBe('Masters notes');
      expect(sheet.querySelector('.runway-tool--rec')?.textContent).toContain('Problem Solver');
      expect(sheet.querySelectorAll('.runway-sheet__shelf .runway-tool')).toHaveLength(7);
      expect(sheet.textContent).toContain('Bring it back');
      expect(sheet.textContent).not.toMatch(/Clare/);

      [...sheet.querySelectorAll<HTMLButtonElement>('.btn')].find((b) => b.textContent === 'Skip')!.click();
      await vi.waitFor(() => expect(sheet.querySelector('.runway-sheet__title')?.textContent).toBe('Blank canvas'));
      expect(sheet.textContent).toContain('In two weeks');
      expect(sheet.querySelector('.runway-sheet__apply')?.textContent).toBe('Apply');
    });

    it('dims rows that do not match the energy filter', async () => {
      const canvas = document.createElement('main');
      document.body.append(canvas);
      await renderProjectsView(canvas);
      const admin = [...canvas.querySelectorAll<HTMLButtonElement>('.runway-dial--energy .hub-pills__btn')].find((b) => b.textContent === 'Admin')!;
      admin.click();
      const dimmed = [...canvas.querySelectorAll<HTMLElement>('.runway-row.is-dim')].map((n) => n.dataset.projectId);
      const deep = [...canvas.querySelectorAll<HTMLElement>('.runway-row')].filter((n) => n.dataset.energy === 'deep_focus').map((n) => n.dataset.projectId);
      expect(dimmed).toEqual(deep);
    });
  });
});
