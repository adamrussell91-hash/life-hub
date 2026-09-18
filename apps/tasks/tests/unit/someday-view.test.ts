import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '@/schemas/project';
import type { Goal } from '@/schemas/goal';
import type { OdysseyNode, Task } from '@/schemas/task';
import { tasksApi } from '@/services/client-api';
import { renderSomedayView } from '@/views/someday';
import { renderSomedayWheelView } from '@/views/someday-wheel';
import { renderSomedayOdysseyView } from '@/views/someday-odyssey';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    listTasks: vi.fn(),
    listProjects: vi.fn(),
    getTask: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    createGoal: vi.fn()
  }
}));

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    schema_version: 1,
    description: '',
    kind: 'task',
    bucket: 'someday',
    step_order: 0,
    domain: 'life',
    framework_used: null,
    estimated_duration: null,
    actual_duration: null,
    due_date: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    completed_at: null,
    status: 'deferred',
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
    target_date: null,
    review_at: null,
    waiting_on: null,
    waiting_since: null,
    follow_up_at: null,
    waiting_status: null,
    contexts: [],
    cognitive_load: null,
    depth: null,
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
    purpose: '',
    desired_outcome: '',
    quality_bar: null,
    review_at: null,
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
    linked_program_id: null,
    ...partial
  };
}

function goal(partial: Partial<Goal> & Pick<Goal, 'id' | 'title'>): Goal {
  return {
    schema_version: 1,
    description: '',
    parent_area_id: null,
    status: 'active',
    tags: [],
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...partial
  };
}

beforeEach(() => {
  vi.mocked(tasksApi.listTasks).mockReset();
  vi.mocked(tasksApi.listProjects).mockReset();
  vi.mocked(tasksApi.getTask).mockReset();
  vi.mocked(tasksApi.createTask).mockReset();
  vi.mocked(tasksApi.updateTask).mockReset();
  vi.mocked(tasksApi.deleteTask).mockReset();
  vi.mocked(tasksApi.createProject).mockReset();
  vi.mocked(tasksApi.updateProject).mockReset();
  vi.mocked(tasksApi.createGoal).mockReset();
});

describe('renderSomedayView', () => {
  it('renders a card with maturity/horizon/area chips and a Life coverage link', async () => {
    const dream = task({
      id: 't1',
      title: 'Study at Cambridge',
      maturity: 'developing',
      horizon_target: 'goal',
      life_area: 'career'
    });
    vi.mocked(tasksApi.listTasks).mockResolvedValue([dream]);
    vi.mocked(tasksApi.listProjects).mockResolvedValue([]);

    const canvas = document.createElement('div');
    await renderSomedayView(canvas);

    expect(canvas.textContent).toContain('Study at Cambridge');
    expect(canvas.querySelector('.someday-chip--horizon')?.textContent).toBe('Goal');
    expect(canvas.querySelector('.someday-chip--area')?.textContent).toBe('Career');
    const wheelLink = canvas.querySelector<HTMLAnchorElement>('.someday-preview-card');
    expect(wheelLink?.getAttribute('href')).toBe('#/someday/wheel');
    const odysseyCta = canvas.querySelector<HTMLAnchorElement>('.someday-cta');
    expect(odysseyCta?.getAttribute('href')).toBe(`#/someday/odyssey/${dream.id}`);
    const branchLink = canvas.querySelector<HTMLAnchorElement>('.someday-card__branch');
    expect(branchLink?.getAttribute('href')).toBe(`#/someday/odyssey/${dream.id}`);
  });

  it('shows the open-loop ring and if-then nudge only on Sweep-flagged (review-now) cards', async () => {
    const due = task({ id: 't1', title: 'Study at Cambridge', review_at: '2020-01-01' });
    const parked = task({ id: 't2', title: 'Move to Lisbon', review_at: '2099-01-01' });
    vi.mocked(tasksApi.listTasks).mockResolvedValue([due, parked]);
    vi.mocked(tasksApi.listProjects).mockResolvedValue([]);

    const canvas = document.createElement('div');
    await renderSomedayView(canvas);

    const cards = [...canvas.querySelectorAll('.someday-card')];
    const dueCard = cards.find((c) => c.textContent?.includes('Study at Cambridge'))!;
    const parkedCard = cards.find((c) => c.textContent?.includes('Move to Lisbon'))!;
    expect(dueCard.querySelector('.someday-open-loop')).toBeTruthy();
    expect(dueCard.querySelector('.someday-card__if-then')?.textContent).toContain('Study at Cambridge');
    expect(parkedCard.querySelector('.someday-open-loop')).toBeNull();
    expect(parkedCard.querySelector('.someday-card__if-then')).toBeNull();
  });

  it('promoting to project keeps the dream in the list and records the backlink', async () => {
    const dream = task({ id: 't1', title: 'Retrain as a sailing instructor' });
    vi.mocked(tasksApi.listTasks).mockResolvedValue([dream]);
    vi.mocked(tasksApi.listProjects).mockResolvedValue([]);
    vi.mocked(tasksApi.createProject).mockResolvedValue(project({ id: 'p1', title: dream.title }));
    vi.mocked(tasksApi.updateProject).mockResolvedValue(project({ id: 'p1', title: dream.title }));
    const promoted = { ...dream, linked_project_ids: ['p1'] };
    vi.mocked(tasksApi.updateTask).mockResolvedValue(promoted);

    const canvas = document.createElement('div');
    await renderSomedayView(canvas);

    const promoteButton = [...canvas.querySelectorAll('button')].find(
      (btn) => btn.textContent === 'Promote to project'
    );
    expect(promoteButton).toBeTruthy();
    promoteButton!.dispatchEvent(new Event('click', { bubbles: true }));
    await vi.waitFor(() => {
      expect(tasksApi.createProject).toHaveBeenCalledWith(
        expect.objectContaining({ title: dream.title, parent_someday_id: dream.id })
      );
    });
    await vi.waitFor(() => {
      expect(tasksApi.updateTask).toHaveBeenCalledWith(dream.id, {
        linked_project_ids: ['p1']
      });
    });
    // The idea must still be on the page — promoting never deletes it.
    await vi.waitFor(() => {
      expect(tasksApi.deleteTask).not.toHaveBeenCalled();
      expect(canvas.textContent).toContain('Retrain as a sailing instructor');
    });
  });

  it('promoting to goal keeps the dream and records the backlink, without deleting it', async () => {
    const dream = task({ id: 't1', title: 'Write a novel' });
    vi.mocked(tasksApi.listTasks).mockResolvedValue([dream]);
    vi.mocked(tasksApi.listProjects).mockResolvedValue([]);
    vi.mocked(tasksApi.createGoal).mockResolvedValue(goal({ id: 'g1', title: dream.title }));
    vi.mocked(tasksApi.updateTask).mockResolvedValue({ ...dream, linked_goal_ids: ['g1'] });

    const canvas = document.createElement('div');
    await renderSomedayView(canvas);
    const promoteGoalButton = [...canvas.querySelectorAll('button')].find(
      (btn) => btn.textContent === 'Promote to goal'
    );
    promoteGoalButton!.dispatchEvent(new Event('click', { bubbles: true }));

    await vi.waitFor(() => {
      expect(tasksApi.createGoal).toHaveBeenCalledWith(
        expect.objectContaining({ title: dream.title, parent_someday_id: dream.id })
      );
      expect(tasksApi.deleteTask).not.toHaveBeenCalled();
    });
  });
});

describe('renderSomedayWheelView', () => {
  it('renders all fixed life areas, flags unlit ones, and sizes stars by count', async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue([
      task({ id: '1', title: 'Sail around Ireland', life_area: 'explore', maturity: 'set' }),
      task({ id: '2', title: 'Learn Portuguese', life_area: 'explore', maturity: 'new' })
    ]);

    const canvas = document.createElement('div');
    await renderSomedayWheelView(canvas);

    const rows = [...canvas.querySelectorAll('.someday-wheel__row-label')].map((n) => n.textContent);
    expect(rows).toContain('Explore');
    expect(rows).toContain('Health');
    expect(canvas.querySelector('.someday-wheel__gap-copy')?.textContent).toContain('unlit');
    expect(canvas.querySelectorAll('.someday-wheel__star--unlit').length).toBeGreaterThan(0);
    expect(canvas.querySelector('.someday-wheel__star--lit')).toBeTruthy();
  });
});

describe('renderSomedayOdysseyView', () => {
  it('adds a root path, persists it, then adds a nested branch under the focused node', async () => {
    const dream = task({ id: 't1', title: 'Retrain as a sailing instructor', odyssey_paths: [] });
    vi.mocked(tasksApi.getTask).mockResolvedValue(dream);

    let savedTree: OdysseyNode[] = [];
    vi.mocked(tasksApi.updateTask).mockImplementation(async (_id, body) => {
      savedTree = (body as { odyssey_paths: OdysseyNode[] }).odyssey_paths;
      return { ...dream, odyssey_paths: savedTree };
    });

    const canvas = document.createElement('div');
    await renderSomedayOdysseyView(canvas, dream.id);

    expect(canvas.querySelector('.someday-odyssey__empty')).toBeTruthy();

    const titleInput = canvas.querySelector<HTMLInputElement>('[aria-label="Path title"]')!;
    titleInput.value = 'Charter part-time';
    canvas.querySelector('form.someday-odyssey__add')!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );

    await vi.waitFor(() => {
      expect(tasksApi.updateTask).toHaveBeenCalled();
      expect(savedTree).toHaveLength(1);
      expect(savedTree[0].title).toBe('Charter part-time');
    });

    // The newly added root path should now be focused, and a child can be added under it.
    await vi.waitFor(() => {
      expect(canvas.querySelector('.someday-odyssey__chip.is-focused')?.textContent).toContain(
        'Charter part-time'
      );
    });

    const nestedTitleInput = canvas.querySelector<HTMLInputElement>('[aria-label="Path title"]')!;
    nestedTitleInput.value = 'Get certified first';
    canvas.querySelector('form.someday-odyssey__add')!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );

    await vi.waitFor(() => {
      expect(savedTree).toHaveLength(1);
      expect(savedTree[0].children).toHaveLength(1);
      expect(savedTree[0].children[0].title).toBe('Get certified first');
    });
  });

  it('sends the focused path back to Someday as a new item', async () => {
    const child: OdysseyNode = {
      id: 'c1',
      title: 'Charter part-time',
      question: 'Could this pay rent?',
      resources: 55,
      confidence: 85,
      coherence: 50,
      children: []
    };
    const dream = task({
      id: 't1',
      title: 'Retrain as a sailing instructor',
      life_area: 'explore',
      odyssey_paths: [child]
    });
    vi.mocked(tasksApi.getTask).mockResolvedValue(dream);
    vi.mocked(tasksApi.createTask).mockResolvedValue(task({ id: 'new1', title: child.title }));

    const originalHash = location.hash;
    const canvas = document.createElement('div');
    await renderSomedayOdysseyView(canvas, dream.id);

    const chip = [...canvas.querySelectorAll('.someday-odyssey__chip')].find((el) =>
      el.textContent?.includes('Charter part-time')
    )!;
    chip.dispatchEvent(new Event('click', { bubbles: true }));

    await vi.waitFor(() => {
      const sendButton = [...canvas.querySelectorAll('button')].find(
        (btn) => btn.textContent === 'Send back as a Someday'
      );
      expect(sendButton).toBeTruthy();
    });
    const sendButton = [...canvas.querySelectorAll('button')].find(
      (btn) => btn.textContent === 'Send back as a Someday'
    )!;
    sendButton.dispatchEvent(new Event('click', { bubbles: true }));

    await vi.waitFor(() => {
      expect(tasksApi.createTask).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Charter part-time', bucket: 'someday', life_area: 'explore' })
      );
    });
    expect(location.hash).toBe('#/someday');
    location.hash = originalHash;
  });
});
