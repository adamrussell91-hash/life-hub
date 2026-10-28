import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  loadBoardArrows: vi.fn(),
  saveBoardArrows: vi.fn(),
  loadWalkthruGoals: vi.fn(),
  loadWalkthruReps: vi.fn(),
  loadWalkthruText: vi.fn(),
  createWalkthruGoal: vi.fn(),
  patchWalkthruGoal: vi.fn(),
  makeArrowId: vi.fn(() => 'ar_test')
}));
vi.mock('@/api/walkthrus', () => api);

const { renderLearningBoard } = await import('@/views/walkthrus-board');
const { renderLearningGoal } = await import('@/views/walkthrus-goal');
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };

const TEXT = { sets: [{ set: 1, frameworks: [], techniques: [{ id: 'w1-quizzing', steps: [1, 2, 3, 4, 5].map((n) => ({ n, label: `Label ${n}`, text: `Filler ${n}` })) }] }] };
const goal = (over: Record<string, unknown> = {}) => ({ id: 'g1', title: 'Quizzing', status: 'active', sphere: 'professional', walkthru: { technique_id: 'w1-quizzing', stage: 'attempt' }, ...over });

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.makeArrowId.mockReturnValue('ar_test');
  api.loadBoardArrows.mockResolvedValue([]);
  api.loadWalkthruGoals.mockResolvedValue([]);
  api.loadWalkthruReps.mockResolvedValue([]);
  api.loadWalkthruText.mockResolvedValue(TEXT);
  api.saveBoardArrows.mockImplementation(async (a: unknown) => a);
  location.hash = '#/learning';
});

async function mount(technique: string | null = null) {
  const root = document.createElement('div');
  document.body.append(root);
  await renderLearningBoard(root, { technique });
  return root;
}
const click = (el: Element | null) => el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const tile = (root: HTMLElement, id: string) => root.querySelector(`[data-tile="${id}"]`);

describe('the board', () => {
  it('draws every technique, a label per cluster and the sets still in the box', async () => {
    const root = await mount();
    expect(root.querySelectorAll('.wt-tile').length).toBe(52);
    expect(root.querySelectorAll('.wt-cluster-label').length).toBe(6);
    expect(root.querySelectorAll('.wt-boxslot').length).toBe(2);
    expect(root.querySelector('.wt-toolbar__status')!.textContent).toContain('Draw arrow');
    expect(root.querySelector('.wt-panel')!.hasAttribute('hidden')).toBe(true);
  });

  it('opening a technique shows the strip and the panel, with other tiles faded', async () => {
    const root = await mount();
    click(tile(root, 'w1-quizzing'));
    await flush();
    expect(root.querySelectorAll('.wt-strip__card').length).toBe(5);
    expect(root.querySelector('.wt-panel')!.hasAttribute('hidden')).toBe(false);
    expect(root.querySelector('.wt-panel__title')!.textContent).toBe('Quizzing');
    expect(root.querySelectorAll('.wt-steps__item').length).toBe(5);
    expect(root.querySelector('.wt-svg')!.classList.contains('has-selection')).toBe(true);
    // the strip's magnifier closes it
    click(root.querySelector('[data-close]'));
    expect(root.querySelectorAll('.wt-strip__card').length).toBe(0);
    expect(root.querySelector('.wt-panel')!.hasAttribute('hidden')).toBe(true);
  });

  it('a technique in the route opens on load', async () => {
    const root = await mount('w1-quizzing');
    await flush();
    expect(root.querySelector('.wt-panel__title')!.textContent).toBe('Quizzing');
  });

  it('starting a technique creates one goal; a second is blocked with the reason', async () => {
    const root = await mount('w1-quizzing');
    api.createWalkthruGoal.mockResolvedValue(goal());
    await flush();
    click([...root.querySelectorAll('.wt-panel button')].find((b) => b.textContent === 'Work on this technique')!);
    await flush();
    expect(api.createWalkthruGoal).toHaveBeenCalledWith(expect.objectContaining({ walkthru: expect.objectContaining({ technique_id: 'w1-quizzing' }) }));
    expect(root.querySelector('.wt-panel__actions a')!.textContent).toBe('Open the goal');
    click(tile(root, 'w1-cold-calling'));
    await flush();
    expect(root.querySelector('.wt-panel__note')!.textContent).toContain('Quizzing');
    expect(root.querySelector('.wt-panel__actions button')).toBeNull();
  });

  it('a technique with a goal shows its piece on the tile', async () => {
    api.loadWalkthruGoals.mockResolvedValue([goal()]);
    const root = await mount();
    expect(tile(root, 'w1-quizzing')!.querySelector('.wt-piece--dashed_house')).not.toBeNull();
    expect(tile(root, 'w1-cold-calling')!.querySelector('.wt-piece')).toBeNull();
  });

  it('draws an arrow: pick two techniques, a type, save', async () => {
    const root = await mount();
    click([...root.querySelectorAll('.wt-toolbar button')].find((b) => b.textContent === 'Draw arrow')!);
    click(tile(root, 'w1-quizzing'));
    click(tile(root, 'w1-cold-calling'));
    const pop = root.querySelector('.wt-pop') as HTMLElement;
    expect(pop.hidden).toBe(false);
    // a free arrow needs a label
    click([...pop.querySelectorAll('button')].find((b) => b.textContent === 'Free')!);
    click([...pop.querySelectorAll('button')].find((b) => b.textContent === 'Draw it')!);
    expect(pop.querySelector('.wt-pop__err')!.textContent).toContain('label');
    (pop.querySelector('input') as HTMLInputElement).value = 'because';
    click([...pop.querySelectorAll('button')].find((b) => b.textContent === 'Draw it')!);
    await flush();
    expect(api.saveBoardArrows).toHaveBeenCalledWith([{ id: 'ar_test', from: 'w1-quizzing', to: 'w1-cold-calling', type: 'free', label: 'because' }]);
    expect(root.querySelectorAll('.wt-arrow').length).toBe(1);
  });

  it('a failed save puts the arrows back and says so', async () => {
    api.loadBoardArrows.mockResolvedValue([{ id: 'a1', from: 'w1-quizzing', to: 'w1-weekly-and-monthly-review', type: 'leads_to' }]);
    api.saveBoardArrows.mockRejectedValue(new Error('offline'));
    const root = await mount();
    expect(root.querySelectorAll('.wt-arrow').length).toBe(1);
    click(root.querySelector('[data-arrow="a1"]'));
    click([...root.querySelectorAll('.wt-pop button')].find((b) => b.textContent === 'Remove')!);
    await flush();
    expect(root.querySelectorAll('.wt-arrow').length).toBe(1);
    expect(root.querySelector('.wt-toolbar__status')!.textContent).toContain('didn’t save');
  });

  it('says which data didn’t load and still draws the board; all three failing offers a retry', async () => {
    api.loadBoardArrows.mockRejectedValue(new Error('x'));
    const root = await mount();
    expect(root.querySelectorAll('.wt-tile').length).toBe(52);
    expect(root.querySelector('.wt-toolbar__status')!.textContent).toContain('arrows didn’t load');
    api.loadWalkthruGoals.mockRejectedValue(new Error('x'));
    api.loadWalkthruReps.mockRejectedValue(new Error('x'));
    const failed = document.createElement('div');
    await renderLearningBoard(failed, { technique: null });
    expect(failed.querySelector('.empty-state')).not.toBeNull();
    expect([...failed.querySelectorAll('button')].some((b) => b.textContent === 'Retry')).toBe(true);
  });
});

describe('the goal page', () => {
  it('with no technique in hand it points to the board', async () => {
    const root = document.createElement('div');
    await renderLearningGoal(root);
    await flush();
    expect(root.textContent).toContain('No technique in hand');
    expect(root.querySelector('a')!.getAttribute('href')).toBe('#/learning');
  });

  it('moves stage, saves your version of a step and offers keep or move on at the Test', async () => {
    const live = goal();
    api.loadWalkthruGoals.mockResolvedValue([live]);
    api.patchWalkthruGoal.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({ ...live, ...patch }));
    const root = document.createElement('div');
    await renderLearningGoal(root);
    await flush();
    expect(root.textContent).toContain('Quizzing');
    expect(root.querySelectorAll('.wt-goal__adapt').length).toBe(5);
    const area = root.querySelector('.wt-goal__adapt') as HTMLTextAreaElement;
    area.value = ' my version ';
    area.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(api.patchWalkthruGoal).toHaveBeenLastCalledWith('g1', expect.objectContaining({ walkthru: expect.objectContaining({ adapted: { 1: 'my version' } }) }));
    click([...root.querySelectorAll('.wt-chain__btn')].find((b) => b.textContent!.startsWith('T'))!);
    await flush();
    expect(api.patchWalkthruGoal).toHaveBeenLastCalledWith('g1', expect.objectContaining({ walkthru: expect.objectContaining({ stage: 'test' }) }));
    expect([...root.querySelectorAll('.wt-goal__decide button')].map((b) => b.textContent)).toEqual(['Keep going', 'Move on']);
    click([...root.querySelectorAll('.wt-goal__decide button')].find((b) => b.textContent === 'Move on')!);
    await flush();
    expect(api.patchWalkthruGoal).toHaveBeenLastCalledWith('g1', expect.objectContaining({ status: 'dropped' }));
  });
});
