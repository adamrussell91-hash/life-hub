import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  loadBoard: vi.fn(),
  saveBoardArrows: vi.fn(),
  saveBoardClusters: vi.fn(),
  loadWalkthruGoals: vi.fn(),
  loadWalkthruReps: vi.fn(),
  loadWalkthruText: vi.fn(),
  createWalkthruGoal: vi.fn(),
  patchWalkthruGoal: vi.fn(),
  loadSuggestions: vi.fn(),
  dismissSuggestion: vi.fn(),
  makeArrowId: vi.fn(() => 'ar_test')
}));
vi.mock('@/api/walkthrus', () => api);
const fuseApi = vi.hoisted(() => ({ saveFusions: vi.fn(), drawFusion: vi.fn(), loadDrawEstimate: vi.fn() }));
vi.mock('@/api/walkthrus-fuse', () => fuseApi);
const proofApi = vi.hoisted(() => ({ loadProof: vi.fn() }));
vi.mock('@/api/walkthrus-proof', () => proofApi);
// The board remembers My board / Whole book in localStorage; this runner has none, so give it one.
const stored = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => void stored.set(k, String(v)), removeItem: (k: string) => void stored.delete(k), clear: () => stored.clear() });

const { clustersFromPicked } = await import('../../../../packages/walkthrus/clusters.mjs');
const { renderLearningBoard } = await import('@/views/walkthrus-board');
const { renderLearningGoal } = await import('@/views/walkthrus-goal');
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };

const TEXT = { sets: [{ set: 1, frameworks: [], techniques: [{ id: 'w1-quizzing', steps: [1, 2, 3, 4, 5].map((n) => ({ n, label: `Label ${n}`, text: `Filler ${n}` })) }] }] };
/** What loadBoard gives for a board saved before clusters: one "My board" cluster from the picks. */
const loaded = (arrows: unknown[] = [], picked: string[] | null = null, clusters?: unknown[], fusions: unknown[] = []) =>
  ({ arrows, picked, clusters: clusters ?? clustersFromPicked(picked ?? []), fusions });
const goal = (over: Record<string, unknown> = {}) => ({ id: 'g1', title: 'Quizzing', status: 'active', sphere: 'professional', walkthru: { technique_id: 'w1-quizzing', stage: 'attempt' }, ...over });

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  for (const fn of [...Object.values(fuseApi), ...Object.values(proofApi)]) fn.mockReset();
  fuseApi.saveFusions.mockImplementation(async (f: unknown) => f);
  fuseApi.loadDrawEstimate.mockResolvedValue({ low_aud: 0.1, high_aud: 0.25 });
  proofApi.loadProof.mockRejectedValue(new Error('offline'));
  api.makeArrowId.mockReturnValue('ar_test');
  api.loadBoard.mockResolvedValue(loaded());
  api.saveBoardClusters.mockImplementation(async (c: unknown) => c);
  api.loadWalkthruGoals.mockResolvedValue([]);
  api.loadWalkthruReps.mockResolvedValue([]);
  api.loadWalkthruText.mockResolvedValue(TEXT);
  api.loadSuggestions.mockResolvedValue([]);
  api.saveBoardArrows.mockImplementation(async (a: unknown) => a);
  location.hash = '#/learning';
  // These tests walk the whole book; My board has its own tests below.
  localStorage.setItem('wt-board-view', 'book');
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

  it('opening a technique shows its steps in the panel; the board keeps every tile at full colour', async () => {
    const root = await mount();
    click(tile(root, 'w1-quizzing'));
    await flush();
    expect(root.querySelectorAll('.wt-strip__card').length).toBe(0);
    expect(root.querySelector('.wt-panel')!.hasAttribute('hidden')).toBe(false);
    expect(root.querySelector('.wt-panel__title')!.textContent).toBe('Quizzing');
    expect(root.querySelectorAll('.wt-steps__item').length).toBe(5);
    expect(root.querySelector('.wt-svg')!.classList.contains('has-selection')).toBe(true);
    // the empty arrow pop-up stays out of sight
    expect(root.querySelector('.wt-pop')!.hasAttribute('hidden')).toBe(true);
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
    expect([...root.querySelectorAll('.wt-panel__actions button')].map((b) => b.textContent)).toEqual(['Add to my board']);
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
    api.loadBoard.mockResolvedValue(loaded([{ id: 'a1', from: 'w1-quizzing', to: 'w1-weekly-and-monthly-review', type: 'leads_to' }]));
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
    api.loadBoard.mockRejectedValue(new Error('x'));
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

describe('my board', () => {
  const button = (root: HTMLElement, text: string) => [...root.querySelectorAll('button')].find((b) => b.textContent === text)!;
  const ids = (root: HTMLElement) => [...root.querySelectorAll<SVGElement>('.wt-tile')].map((t) => t.dataset.tile);
  const lastClusters = () => api.saveBoardClusters.mock.lastCall![0] as Array<{ id: string; name: string; tiles: Array<{ id: string; q: number; r: number }> }>;
  beforeEach(() => localStorage.setItem('wt-board-view', 'mine'));

  it('starts empty and offers the whole book', async () => {
    const root = await mount();
    expect(root.querySelectorAll('.wt-tile').length).toBe(0);
    expect((root.querySelector('.wt-empty') as HTMLElement).hidden).toBe(false);
    click(button(root, 'Choose from the whole book'));
    expect(root.querySelectorAll('.wt-tile').length).toBe(52);
    expect(localStorage.getItem('wt-board-view')).toBe('book');
  });

  it('old picks, the live goal and arrow ends sit in one cluster called My board', async () => {
    api.loadBoard.mockResolvedValue(loaded([{ id: 'a1', from: 'w1-quizzing', to: 'w1-dual-coding', type: 'leads_to' }], ['w1-cold-calling']));
    api.loadWalkthruGoals.mockResolvedValue([goal({ walkthru: { technique_id: 'w1-scaffolding', stage: 'attempt' } })]);
    const root = await mount();
    expect(ids(root).sort()).toEqual(['w1-cold-calling', 'w1-dual-coding', 'w1-quizzing', 'w1-scaffolding']);
    expect([...root.querySelectorAll('.wt-cluster-label')].map((l) => l.textContent)).toEqual(['MY BOARD']);
    // nothing is saved just by looking
    expect(api.saveBoardClusters).not.toHaveBeenCalled();
  });

  it('draws each cluster with its title, and a tile may sit in two', async () => {
    api.loadBoard.mockResolvedValue(loaded([], null, [
      { id: 'cl_starts', name: 'Starts', x: 0, y: 0, tiles: [{ id: 'w1-quizzing', q: 0, r: 0 }, { id: 'w1-cold-calling', q: 1, r: 0 }] },
      { id: 'cl_checks', name: 'Checks', x: 600, y: 0, tiles: [{ id: 'w1-quizzing', q: 0, r: 0 }] }
    ]));
    const root = await mount();
    expect([...root.querySelectorAll('.wt-cluster-label text')].map((l) => l.textContent)).toEqual(['STARTS', 'CHECKS']);
    expect(ids(root).sort()).toEqual(['w1-cold-calling', 'w1-quizzing', 'w1-quizzing']);
    expect(root.querySelectorAll('[data-cluster-title]').length).toBe(2);
  });

  it('adds from the whole book into a chosen cluster, and takes off from that cluster only', async () => {
    api.loadBoard.mockResolvedValue(loaded([{ id: 'a1', from: 'w1-quizzing', to: 'w1-dual-coding', type: 'leads_to' }], null, [
      { id: 'cl_starts', name: 'Starts', x: 0, y: 0, tiles: [{ id: 'w1-quizzing', q: 0, r: 0 }, { id: 'w1-dual-coding', q: 1, r: 0 }] },
      { id: 'cl_checks', name: 'Checks', x: 600, y: 0, tiles: [{ id: 'w1-quizzing', q: 0, r: 0 }] }
    ]));
    const root = await mount();
    click(button(root, 'Whole book'));
    click(tile(root, 'w1-cold-calling'));
    await flush();
    click(button(root, 'Add to my board'));
    const pop = root.querySelector('.wt-pop') as HTMLElement;
    expect(pop.hidden).toBe(false);
    expect([...pop.querySelectorAll('.wt-pop__choices button')].map((b) => b.textContent)).toEqual(['Starts', 'Checks', 'New cluster…']);
    click(button(root, 'Checks'));
    await flush();
    expect(lastClusters().find((c) => c.id === 'cl_checks')!.tiles.map((t) => t.id)).toEqual(['w1-quizzing', 'w1-cold-calling']);
    click(button(root, 'My board'));
    expect(ids(root).length).toBe(4);

    // Quizzing sits in both clusters: taking it off Checks leaves it in Starts, with its arrow.
    const inChecks = root.querySelector('[data-key="cl_checks/w1-quizzing"]');
    click(inChecks);
    await flush();
    click(button(root, 'Take off'));
    await flush();
    expect(lastClusters().find((c) => c.id === 'cl_checks')!.tiles.map((t) => t.id)).toEqual(['w1-cold-calling']);
    expect(lastClusters().find((c) => c.id === 'cl_starts')!.tiles.map((t) => t.id)).toEqual(['w1-quizzing', 'w1-dual-coding']);
    expect(api.saveBoardArrows).not.toHaveBeenCalled();

    // Dual coding's only place: off it comes, and its arrow with it.
    click(root.querySelector('[data-key="cl_starts/w1-dual-coding"]'));
    await flush();
    click(button(root, 'Take off'));
    await flush();
    expect(api.saveBoardArrows).toHaveBeenLastCalledWith([]);
    expect(root.querySelector('.wt-toolbar__status')!.textContent).toContain('with its arrow');
  });

  it('makes a new cluster from a name typed in place', async () => {
    const root = await mount();
    click(button(root, '+ New cluster'));
    const pop = root.querySelector('.wt-pop') as HTMLElement;
    const input = pop.querySelector('input') as HTMLInputElement;
    click(button(root, 'Make it'));
    expect(pop.querySelector('.wt-pop__err')!.textContent).toContain('name');
    input.value = 'Retrieval';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flush();
    expect(lastClusters().map((c) => c.name)).toEqual(['My board', 'Retrieval']);
    expect([...root.querySelectorAll('.wt-cluster-label text')].map((l) => l.textContent)).toContain('RETRIEVAL');
  });

  const FUSION = {
    id: 'fu_abc123', name: 'Think then call', parents: ['w1-cold-calling', 'w1-think-pair-share'], cluster_id: 'cl_board', why: 'Everyone thinks first',
    steps: [{ label: 'Pose it', text: 'Filler', from: null, edited: false, loop_to: null }, { label: 'Call', text: 'Filler', from: null, edited: false, loop_to: 1 }],
    drawing: { status: 'none', scene: null, svg: null, note: null, at: null }, created_at: '2026-10-31T00:00:00.000Z'
  };
  const fusedBoard = (tiles = [{ id: 'fu_abc123', q: 0, r: 0 }, { id: 'w1-cold-calling', q: 1, r: 0 }]) =>
    loaded([], null, [{ id: 'cl_board', name: 'My board', x: 0, y: 0, tiles }], [FUSION]);

  it('a fusion tile draws in its fused frame, welded to a touching parent', async () => {
    api.loadBoard.mockResolvedValue(fusedBoard());
    const root = await mount();
    const fused = tile(root, 'fu_abc123')!;
    expect(fused.classList.contains('is-fusion')).toBe(true);
    expect([...fused.querySelectorAll('.wt-fused__name tspan')].map((t) => t.textContent).join(' ')).toBe('THINK THEN CALL');
    expect(fused.querySelector('.wt-fused__codes')!.textContent).toMatch(/\d+ \+ \d+/);
    expect(fused.querySelector('.wt-fused__placeholder')).not.toBeNull();
    expect(root.querySelectorAll('.wt-weld').length).toBe(1);
  });

  it('a parent in another cluster gets a thin line, not a weld', async () => {
    api.loadBoard.mockResolvedValue(loaded([], null, [
      { id: 'cl_board', name: 'My board', x: 0, y: 0, tiles: [{ id: 'fu_abc123', q: 0, r: 0 }] },
      { id: 'cl_other', name: 'Other', x: 700, y: 0, tiles: [{ id: 'w1-think-pair-share', q: 0, r: 0 }] }
    ], [FUSION]));
    const root = await mount();
    expect(root.querySelectorAll('.wt-weld').length).toBe(0);
    expect(root.querySelectorAll('.wt-weld-line').length).toBe(1);
  });

  it('a fusion opens its own panel: why, steps with loops, Edit, Draw with the cost first', async () => {
    api.loadBoard.mockResolvedValue(fusedBoard());
    const root = await mount();
    click(tile(root, 'fu_abc123'));
    await flush();
    const panel = root.querySelector('.wt-panel') as HTMLElement;
    expect(panel.querySelector('.wt-panel__title')!.textContent).toBe('Think then call');
    expect(panel.querySelector('.wt-panel__why')!.textContent).toBe('Everyone thinks first');
    expect(panel.querySelector('.wt-steps__loop')!.textContent).toBe('↻ back to step 1');
    expect(panel.querySelector('.wt-panel__fused svg')).not.toBeNull();
    expect(panel.querySelector('.wtp-strip')).not.toBeNull();
    expect(button(root, 'Edit')).toBeTruthy();
    click(button(root, 'Draw…'));
    expect(panel.textContent).toContain('A$0.10–0.25');
    fuseApi.drawFusion.mockResolvedValue({ fusion: { ...FUSION, drawing: { status: 'drawn', scene: [], svg: '<svg viewBox="0 0 120 90"><circle cx="1" cy="1" r="1"/></svg>', note: null, at: null } }, cost_usd: 0 });
    click(button(root, 'Draw'));
    await flush();
    expect(fuseApi.drawFusion).toHaveBeenCalledWith('fu_abc123', undefined);
    expect(tile(root, 'fu_abc123')!.querySelector('.wt-fused__placeholder')).toBeNull();
    expect(button(root, 'Redraw…')).toBeTruthy();
  });

  it('Fuse with… picks another technique on the board and saves the fusion beside its parents', async () => {
    api.loadBoard.mockResolvedValue(loaded([], ['w1-cold-calling', 'w1-quizzing']));
    const root = await mount();
    click(tile(root, 'w1-cold-calling'));
    await flush();
    click(button(root, 'Fuse with…'));
    const box = root.querySelector<HTMLInputElement>('.wt-fusepick input[value="w1-quizzing"]')!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    click(button(root, 'Fuse'));
    await flush();
    const bench = document.querySelector('.wt-fuse') as HTMLElement;
    expect(bench).not.toBeNull();
    for (const use of [...bench.querySelectorAll<HTMLButtonElement>('.wt-fuse__use')].slice(0, 2)) click(use);
    const name = bench.querySelector<HTMLInputElement>('input.wt-fuse__input')!;
    name.value = 'Call then quiz';
    click([...bench.querySelectorAll('button')].find((b) => b.textContent === 'Save')!);
    await flush();
    const saved = fuseApi.saveFusions.mock.lastCall![0] as Array<{ id: string; parents: string[] }>;
    expect(saved[0]!.parents).toEqual(['w1-cold-calling', 'w1-quizzing']);
    const cluster = lastClusters()[0]!;
    const placed = cluster.tiles.find((t) => t.id === saved[0]!.id)!;
    expect(placed).toBeTruthy();
    const touching = (a: { q: number; r: number }, b: { q: number; r: number }) => {
      const dq = b.q - a.q; const dr = b.r - a.r;
      return [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].some(([q, r]) => q === dq && r === dr);
    };
    expect(cluster.tiles.filter((t) => t.id !== placed.id && touching(placed, t)).length).toBe(2);
    expect(tile(root, saved[0]!.id)).not.toBeNull();
    bench.remove();
  });

  it('What’s working lists Proof in place of the board, and opens a tile', async () => {
    const proof = {
      rows: [{ tile_id: 'w1-quizzing', class_id: 'c1', ran: { n: 4, mean: 0.8, lessons: [] }, partly: { n: 0, lessons: [] }, none: { n: 5, mean: 0.7 }, diff: 0.1, enough: true }],
      classes: { c1: 'Demo class' }, lessons_scored: 9, generated_at: '2026-10-31T00:00:00.000Z'
    };
    proofApi.loadProof.mockResolvedValue(proof);
    api.loadBoard.mockResolvedValue(loaded([], ['w1-quizzing']));
    const root = await mount();
    await flush();
    expect(tile(root, 'w1-quizzing')!.querySelector('.wt-mark--up')).not.toBeNull();
    click(button(root, 'What’s working'));
    expect((root.querySelector('.wt-stage') as HTMLElement).hidden).toBe(true);
    const row = root.querySelector<HTMLButtonElement>('.wtp-row__open')!;
    expect(row.textContent).toContain('Demo class');
    click(row);
    await flush();
    expect((root.querySelector('.wt-stage') as HTMLElement).hidden).toBe(false);
    expect(root.querySelector('.wt-panel__title')!.textContent).toBe('Quizzing');
    expect(root.querySelector('.wt-panel .wtp-class')).not.toBeNull();
  });

  it('keeps the current goal on the board', async () => {
    api.loadWalkthruGoals.mockResolvedValue([goal()]);
    const root = await mount('w1-quizzing');
    await flush();
    expect(root.querySelector('.wt-panel')!.textContent).not.toContain('Take off');
  });

  it('a link to a technique off the board opens the whole book on it', async () => {
    const root = await mount('w1-cold-calling');
    expect(root.querySelectorAll('.wt-tile').length).toBe(52);
    expect(root.querySelector('.wt-panel__title')!.textContent).toBe('Cold calling');
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
