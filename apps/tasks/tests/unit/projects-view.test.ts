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
    closeProject: vi.fn(),
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
    location.hash = '#/projects';
  });

  afterEach(() => {
    closeCardMenu();
    document.body.replaceChildren();
  });

  it('renders a status mix chart with every lifecycle count', async () => {
    const canvas = document.createElement('main');
    await renderProjectsView(canvas);

    const chart = canvas.querySelector('.projects-chart');
    expect(chart).not.toBeNull();
    expect(chart?.querySelector('.metric-ring')?.getAttribute('aria-label')).toMatch(/running/);
    expect(chart?.querySelector('.column-chart')?.getAttribute('aria-label')).toMatch(/On the go/);
    const legend = [...canvas.querySelectorAll('.projects-chart__slice')].map((btn) => btn.textContent);
    expect(legend.some((text) => text?.includes('On the go') && text.includes('1'))).toBe(true);
    expect(legend.some((text) => text?.includes('Planning') && text.includes('1'))).toBe(true);
    expect(legend.some((text) => text?.includes('Not started') && text.includes('1'))).toBe(true);
    expect(legend.some((text) => text?.includes('Completed') && text.includes('1'))).toBe(true);
    expect(legend.some((text) => text?.includes('Stalled') && text.includes('1'))).toBe(true);
  });

  it('groups the board by status and opens a project page from a card', async () => {
    const canvas = document.createElement('main');
    await renderProjectsView(canvas);

    const lanes = [...canvas.querySelectorAll('.lane__title')].map((node) => node.textContent);
    expect(lanes).toContain('On the go');
    expect(lanes).toContain('Planning');
    expect(lanes).toContain('Not started');
    expect(lanes).toContain('Completed');
    expect(lanes).toContain('Stalled');

    const open = canvas.querySelector<HTMLButtonElement>('[data-project-id="proj_go"] .btn');
    expect(open?.textContent).toBe('Open page');
    open?.click();
    expect(location.hash).toBe('#/project/proj_go');
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

    const mind = canvas.querySelector<HTMLElement>('[data-project-id="proj_plan"]');
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

  it('puts the kanban first, status mix beside the timeline, and the heatmap last', async () => {
    const canvas = document.createElement('main');
    await renderProjectsView(canvas);

    const board = canvas.querySelector('.projects-board');
    const pulse = canvas.querySelector('.projects-pulse');
    const heat = canvas.querySelector('.projects-heatmap');
    const chart = canvas.querySelector('.projects-chart');
    expect(board).not.toBeNull();
    expect(pulse).not.toBeNull();
    expect(heat).not.toBeNull();
    expect(chart).not.toBeNull();
    expect(board!.compareDocumentPosition(pulse!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(pulse!.compareDocumentPosition(heat!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  it('keeps the stalled outcome queue and confirm write', async () => {
    const canvas = document.createElement('main');
    await renderProjectsView(canvas);

    const queue = canvas.querySelector('#stalled-queue');
    expect(queue?.textContent).toMatch(/Masters notes/);
    const expand = canvas.querySelector<HTMLButtonElement>('#stalled-queue .hub-icon-btn');
    expand?.click();
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
