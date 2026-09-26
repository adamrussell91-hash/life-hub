// apps/tasks/tests/unit/goal-page.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tasksApi } from '@/services/client-api';
import { renderGoalPage } from '@/views/goal-page';
import { mountTagAnythingSection } from '@/views/entity-tagger';
import { goal, project, task } from './goal-fixtures';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    getGoal: vi.fn(), updateGoal: vi.fn(), deleteGoal: vi.fn(), listProjects: vi.fn(), listTasks: vi.fn(), getHubPrefs: vi.fn(),
    updateProject: vi.fn(), createTask: vi.fn(), updateTask: vi.fn(), getGoalRead: vi.fn(), rescanGoalRead: vi.fn(), decideGhost: vi.fn(),
    getPlanningDirection: vi.fn()
  }
}));
vi.mock('@/views/entity-tagger', () => ({ mountTagAnythingSection: vi.fn() }));
vi.mock('../../design-kit/js/hub-feedback.js', () => ({
  offerTimedUndo: vi.fn((opts: { onCommit?: () => void }) => {
    opts.onCommit?.();
    return { el: document.createElement('div'), dismiss: vi.fn() };
  })
}));

const G = goal({
  id: 'g1', title: 'HA evidence', sphere: 'professional', structure: 'floor_target_stretch',
  lead_measure: { label: '1 write-up / week', per_week: 1 }, next_start: 'Open the spreadsheet',
  if_then: { cue: 'Tuesday P5', action: 'open the doc', obstacle: 'email' },
  description: 'First line\nSecond line\nThird ignored',
  tags: ['term-4'],
  due_date: '2027-03-20',
  term: { year: 2026, term: 4 },
  milestones: [{ id: 'm1', title: 'Floor', due_date: '2026-11-20', status: 'open' }]
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(tasksApi.getGoal).mockResolvedValue(G);
  vi.mocked(tasksApi.updateGoal).mockImplementation(async (_id, patch) => ({ ...G, ...(patch as object) }));
  vi.mocked(tasksApi.listProjects).mockResolvedValue([
    project({ id: 'p1', title: 'Portfolio', parent_goal_id: 'g1' }),
    project({ id: 'p2', title: 'Free project' })
  ]);
  vi.mocked(tasksApi.listTasks).mockResolvedValue([task({ id: 't1', title: 'Write up 6.3', parent_goal_id: 'g1' })]);
  vi.mocked(tasksApi.getHubPrefs).mockResolvedValue({ school_terms: [{ year: 2026, terms: [{ term: 4, starts_on: '2026-10-12', ends_on: '2026-12-18' }] }] } as never);
  vi.mocked(tasksApi.createTask).mockResolvedValue(task({ id: 't2', title: 'New' }));
  vi.mocked(tasksApi.updateProject).mockResolvedValue(project({ id: 'p2', title: 'Free project', parent_goal_id: 'g1' }));
  vi.mocked(tasksApi.getGoalRead).mockResolvedValue({ read: null, reason: 'first' } as never);
  vi.mocked(tasksApi.getPlanningDirection).mockResolvedValue({
    schema_version: 1, id: 'default', purpose: 'Teach well', principles: [], vision: 'Calm rooms', updated_at: null
  });
});

describe('goal page', () => {
  it('renders structure, lead strip, if-then, start, hosted projects and tasks, and mounts @ tags', async () => {
    const canvas = document.createElement('div');
    await renderGoalPage(canvas, 'g1', '2026-11-04');
    expect(canvas.querySelector('.goal-card .hub-pills__btn.is-active')?.textContent).toBe('Floor · target · stretch');
    expect(canvas.querySelectorAll('.goal-lead__cells .cell')).toHaveLength(10);
    // Deviation (Adam chose option 1): assert input values — plan UI keeps cue/start in <input>, not text nodes.
    expect(canvas.querySelector<HTMLInputElement>('.goal-ifthen input')?.value).toBe('Tuesday P5');
    expect(canvas.querySelector<HTMLInputElement>('.goal-start input')?.value).toBe('Open the spreadsheet');
    expect(canvas.textContent).toContain('Portfolio');
    expect(canvas.textContent).toContain('Write up 6.3');
    expect(mountTagAnythingSection).toHaveBeenCalledWith(expect.any(HTMLElement), 'tasks:goal:g1');
    expect(canvas.querySelector('.goal-page__chain')?.textContent).toContain('Teach well');
    expect(canvas.querySelector('.goal-page__chain')?.textContent).toContain('HA evidence');
    expect(canvas.querySelector('.goal-current-source')?.textContent).toMatch(/current/i);
  });

  it('switching structure patches only structure', async () => {
    const canvas = document.createElement('div');
    await renderGoalPage(canvas, 'g1', '2026-11-04');
    [...canvas.querySelectorAll<HTMLButtonElement>('.goal-card .hub-pills__btn')].find((b) => b.textContent === 'WOOP')!.click();
    expect(tasksApi.updateGoal).toHaveBeenCalledWith('g1', { structure: 'woop' });
  });

  it('+1 this week adds a manual tap on the Monday key', async () => {
    const canvas = document.createElement('div');
    await renderGoalPage(canvas, 'g1', '2026-11-04');
    canvas.querySelector<HTMLButtonElement>('[data-action="plus-one"]')!.click();
    expect(tasksApi.updateGoal).toHaveBeenCalledWith('g1', { week_log: { '2026-11-02': { manual: 1 } } });
  });

  it('links a free project and adds a task under the goal with the sphere domain', async () => {
    const canvas = document.createElement('div');
    await renderGoalPage(canvas, 'g1', '2026-11-04');
    const select = canvas.querySelector<HTMLSelectElement>('select[name="link-project"]')!;
    expect([...select.options].map((o) => o.value)).toEqual(['', 'p2']);
    select.value = 'p2';
    canvas.querySelector<HTMLButtonElement>('[data-action="link-project"]')!.click();
    expect(tasksApi.updateProject).toHaveBeenCalledWith('p2', { parent_goal_id: 'g1' });

    const input = canvas.querySelector<HTMLInputElement>('input[name="new-task"]')!;
    input.value = 'Collect student voice';
    canvas.querySelector<HTMLButtonElement>('[data-action="add-task"]')!.click();
    expect(tasksApi.createTask).toHaveBeenCalledWith({ title: 'Collect student voice', domain: 'other', parent_goal_id: 'g1' });
  });

  it('G-06…G-12: editable title, closed chips, due, description, tags, life wall, delete undo', async () => {
    const { offerTimedUndo } = await import('../../design-kit/js/hub-feedback.js');
    const canvas = document.createElement('div');
    const header = document.createElement('header');
    const title = document.createElement('h1');
    title.className = 'page-header__title hub-kinetic';
    // Simulate kinetic doubling that used to corrupt textContent on edit.
    const sr = document.createElement('span');
    sr.className = 'hub-kinetic__sr';
    sr.textContent = 'HA evidence';
    const vis = document.createElement('span');
    vis.textContent = 'HA evidence';
    title.append(sr, vis);
    header.append(title);
    await renderGoalPage(canvas, 'g1', '2026-11-04', undefined, { header });

    const input = header.querySelector<HTMLTextAreaElement>('.page-header__title-input')!;
    expect(input).toBeTruthy();
    expect(input.value).toBe('HA evidence');
    expect(header.querySelector('.hub-kinetic')).toBeNull();
    input.value = 'Study at Cambridge';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(tasksApi.updateGoal).not.toHaveBeenCalled();
    input.dispatchEvent(new Event('blur'));
    expect(tasksApi.updateGoal).toHaveBeenCalledTimes(1);
    expect(tasksApi.updateGoal).toHaveBeenCalledWith('g1', { title: 'Study at Cambridge' });
    expect(input.value).toBe('Study at Cambridge');

    expect(canvas.querySelector('[data-chip="sphere"]')?.textContent).toMatch(/Professional/i);
    expect(canvas.querySelector('[data-chip="status"]')?.textContent).toMatch(/Active/i);
    expect(canvas.querySelector('[data-chip="term"]')?.textContent).toMatch(/Term 4/);
    expect(canvas.querySelector('[data-chip="life-area"]')).toBeNull();
    expect(canvas.querySelector('[data-chip="due-date"]')?.textContent).toMatch(/20\/03\/27/);
    expect(canvas.querySelector('[data-slot="description-preview"]')?.textContent).toContain('First line');
    expect(canvas.querySelector('[data-slot="tags"]')).toBeTruthy();
    expect(canvas.querySelector('[data-slot="life-wall"]')?.textContent).toMatch(/Life Wall/);
    expect(canvas.querySelector('.goal-page__meta-card')).toBeTruthy();

    vi.mocked(tasksApi.getGoal).mockResolvedValueOnce(
      goal({ ...G, sphere: 'life', life_area: 'health' })
    );
    await renderGoalPage(canvas, 'g1', '2026-11-04', undefined, { header });
    expect(canvas.querySelector('[data-chip="life-area"]')?.textContent).toMatch(/Health/i);

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(tasksApi.deleteGoal).mockResolvedValue({ deleted: true });
    const deleteBtn = [...canvas.querySelectorAll('button')].find((b) => b.textContent === 'Delete');
    // Open card menu then click Delete — menu items render on click of the menu button.
    const menuBtn = canvas.querySelector<HTMLButtonElement>('.card-menu__btn, [aria-haspopup="menu"]');
    menuBtn?.click();
    const item = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Delete');
    item?.click();
    expect(window.confirm).toHaveBeenCalled();
    expect(offerTimedUndo).toHaveBeenCalled();
    expect(tasksApi.deleteGoal).toHaveBeenCalledWith('g1');
  });

  it('G-06 rename keeps spaces exactly when seeded from goal.title', async () => {
    vi.mocked(tasksApi.getGoal).mockResolvedValueOnce(goal({ ...G, title: 'Study at Cambridge' }));
    const canvas = document.createElement('div');
    const header = document.createElement('header');
    const title = document.createElement('h1');
    title.className = 'page-header__title hub-kinetic';
    title.textContent = 'Study at CambridgeStudy at Cambridge';
    header.append(title);
    await renderGoalPage(canvas, 'g1', '2026-11-04', undefined, { header });
    const input = header.querySelector<HTMLTextAreaElement>('.page-header__title-input')!;
    expect(input.value).toBe('Study at Cambridge');
  });

  it('saves a title once on blur, with the full text', async () => {
    const canvas = document.createElement('div');
    const header = document.createElement('header');
    header.append(heading('HA evidence'));
    await renderGoalPage(canvas, 'g1', '2026-11-04', undefined, { header });
    const input = header.querySelector<HTMLTextAreaElement>('.page-header__title-input')!;
    const text = 'Study at Cambridge check';
    for (let i = 1; i <= text.length; i += 1) {
      input.value = text.slice(0, i);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    expect(tasksApi.updateGoal).not.toHaveBeenCalled();
    input.dispatchEvent(new Event('blur'));
    expect(tasksApi.updateGoal).toHaveBeenCalledTimes(1);
    expect(tasksApi.updateGoal).toHaveBeenCalledWith('g1', { title: text });
  });

  it('saves on Enter and does not insert a newline', async () => {
    const canvas = document.createElement('div');
    const header = document.createElement('header');
    header.append(heading('HA evidence'));
    document.body.append(header);
    await renderGoalPage(canvas, 'g1', '2026-11-04', undefined, { header });
    const input = header.querySelector<HTMLTextAreaElement>('.page-header__title-input')!;
    input.focus();
    input.value = 'Study at Cambridge check';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(input.value).toBe('Study at Cambridge check');
    expect(tasksApi.updateGoal).toHaveBeenCalledTimes(1);
    expect(tasksApi.updateGoal).toHaveBeenCalledWith('g1', { title: 'Study at Cambridge check' });
    header.remove();
  });

  it('keeps the newer title when save responses arrive out of order', async () => {
    const pending: Array<{ title: string; resolve: (goal: ReturnType<typeof goal>) => void }> = [];
    vi.mocked(tasksApi.updateGoal).mockImplementation(
      (_id, patch) =>
        new Promise((resolve) => {
          pending.push({ title: String((patch as { title?: string }).title), resolve });
        })
    );
    const canvas = document.createElement('div');
    const header = document.createElement('header');
    header.append(heading('HA evidence'));
    document.body.append(canvas, header);
    await renderGoalPage(canvas, 'g1', '2026-11-04', undefined, { header });
    const input = header.querySelector<HTMLTextAreaElement>('.page-header__title-input')!;

    input.value = 'Study at Cambridge one';
    input.dispatchEvent(new Event('blur'));
    input.value = 'Study at Cambridge two';
    input.dispatchEvent(new Event('blur'));
    expect(pending.map((item) => item.title)).toEqual(['Study at Cambridge one', 'Study at Cambridge two']);

    pending[1]!.resolve(goal({ ...G, title: 'Study at Cambridge two' }));
    await Promise.resolve();
    pending[0]!.resolve(goal({ ...G, title: 'Study at Cambridge one' }));
    await Promise.resolve();

    const field = header.querySelector<HTMLTextAreaElement>('.page-header__title-input')!;
    expect(field.value).toBe('Study at Cambridge two');
    expect(canvas.querySelector('[data-chain="goal"]')?.textContent).toBe('Study at Cambridge two');
    field.dispatchEvent(new Event('blur'));
    expect(tasksApi.updateGoal).toHaveBeenCalledTimes(2);
    canvas.remove();
    header.remove();
  });

  it('does not write a title response into a focused field', async () => {
    let resolveSave: (goal: ReturnType<typeof goal>) => void = () => undefined;
    vi.mocked(tasksApi.updateGoal).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        })
    );
    const canvas = document.createElement('div');
    const header = document.createElement('header');
    header.append(heading('HA evidence'));
    document.body.append(canvas, header);
    await renderGoalPage(canvas, 'g1', '2026-11-04', undefined, { header });
    const input = header.querySelector<HTMLTextAreaElement>('.page-header__title-input')!;
    input.value = 'Study at Cambridge check';
    input.dispatchEvent(new Event('blur'));
    input.focus();
    input.value = 'Study at Cambridge check still typing';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    resolveSave(goal({ ...G, title: 'Study at Cambridge check' }));
    await Promise.resolve();
    expect(input.value).toBe('Study at Cambridge check still typing');
    expect(document.activeElement).toBe(input);
    canvas.remove();
    header.remove();
  });

  it('restores the saved title on Escape and does not save', async () => {
    const canvas = document.createElement('div');
    const header = document.createElement('header');
    header.append(heading('HA evidence'));
    await renderGoalPage(canvas, 'g1', '2026-11-04', undefined, { header });
    const input = header.querySelector<HTMLTextAreaElement>('.page-header__title-input')!;
    input.value = 'Study at Cambridge nope';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(input.value).toBe('HA evidence');
    expect(tasksApi.updateGoal).not.toHaveBeenCalled();
    input.dispatchEvent(new Event('blur'));
    expect(tasksApi.updateGoal).not.toHaveBeenCalled();
  });
});

function heading(text: string): HTMLHeadingElement {
  const title = document.createElement('h1');
  title.className = 'page-header__title';
  title.textContent = text;
  return title;
}
