import { afterEach, describe, expect, it, vi } from 'vitest';
import { markPieceView, openMarkPiece, type MarkPieceData } from '@/marking/mark-piece';

const data: MarkPieceData = {
  column: { id: 'col1', title: 'Imagery paragraph', criteria: [{ id: 'c1', label: 'Analysis', outcomes: ['out_a'], concepts: [], skill: undefined }] },
  student: { id: 'st_ava', initials: 'AN', name: 'Ava Nguyen' },
  text: { answers: { q1: 'In the poem the poet uses imagery. The road is a grey ribbon.' } },
  feedback: null, mark: null,
  codes: [{ id: 'ts', code: 'TS', label: 'Topic sentence', colour: 'peach', group: 'composition', descriptor: 'Open with your argument.' }],
  recent_codes: [['ts'], ['ts'], ['ts']],
  position: { index: 2, total: 24 }
};

describe('mark piece', () => {
  it('arms a code, tags the selected words, places a step, and saves', async () => {
    const save = vi.fn().mockResolvedValue({});
    const view = markPieceView(data, { save, returnIt: vi.fn(), takeBack: vi.fn(), move: vi.fn() });
    document.body.append(view);
    (view.querySelector('[data-code="ts"]') as HTMLButtonElement).click();
    view.dispatchEvent(new CustomEvent('pm:select', { detail: { part: 'answers', field: 'q1', start: 0, end: 34 } }));
    expect(view.querySelectorAll('.pa-run--mark').length).toBeGreaterThan(0);
    expect(view.querySelector('.mk-tally')!.textContent).toContain('TS 1');
    expect(view.querySelector('.mk-warn')!.textContent).toBe('TS has come up on Ava’s last 3 pieces.');
    (view.querySelector('[data-step="c1:building"]') as HTMLButtonElement).click();
    (view.querySelector('.mk-comment') as HTMLTextAreaElement).value = 'Sharp evidence.';
    (view.querySelector('[data-action="save"]') as HTMLButtonElement).click();
    await Promise.resolve();
    expect(save).toHaveBeenCalledWith({ tags: [expect.objectContaining({ code_id: 'ts', part: 'answers', field: 'q1', start: 0, end: 34, positive: false })], comment: 'Sharp evidence.', steps: { c1: 'building' } });
    expect(view.querySelector('[data-action="return"]')!.textContent).toBe('Return to Ava');
  });

  describe('note box on a highlight', () => {
    const tagged: MarkPieceData = { ...data, feedback: { tags: [{ code_id: 'ts', positive: false, part: 'answers', field: 'q1', start: 0, end: 11 }], comment: '', status: 'draft' } };
    const rect = (top: number, bottom: number, left = 0) => ({ top, bottom, left, right: left + 100, width: 100, height: bottom - top, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
    const open = (lineTop: number, tall: number, innerHeight = 800) => {
      vi.stubGlobal('innerHeight', innerHeight);
      const save = vi.fn().mockResolvedValue({});
      const handle = openMarkPiece(tagged, { save, returnIt: vi.fn(), takeBack: vi.fn(), move: vi.fn() });
      document.body.append(handle.el);
      const left = handle.el.querySelector<HTMLElement>('.mk-left')!;
      left.getBoundingClientRect = () => rect(100, 2000);
      const menu = handle.el.querySelector<HTMLElement>('.mk-menu')!;
      Object.defineProperty(menu, 'offsetHeight', { value: tall });
      const run = handle.el.querySelector<HTMLElement>('.pa-run--mark')!;
      run.getClientRects = () => [rect(lineTop, lineTop + 20, 40)] as unknown as DOMRectList;
      run.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: lineTop + 10 }));
      return { handle, save, menu, run, input: menu.querySelector<HTMLInputElement>('input')! };
    };

    it('opens under the clicked line, inside the sheet column', () => {
      const { menu } = open(300, 150);
      expect(menu.hidden).toBe(false);
      expect(menu.parentElement!.classList.contains('mk-left')).toBe(true);
      expect(menu.style.top).toBe('226px'); // line bottom 320 + gap 6 - column top 100
    });

    it('opens above the line when there is no room below', () => {
      const { menu } = open(700, 150);
      expect(menu.style.top).toBe('444px'); // line top 700 - gap 6 - height 150 - column top 100
    });

    it('grows a short column so the whole menu fits, and shrinks it back when the menu goes', () => {
      const { handle, menu } = open(110, 200);
      const left = handle.el.querySelector<HTMLElement>('.mk-left')!;
      expect(left.style.minHeight).toBe('242px');
      // Measured afresh each time it opens, never against the height it already added.
      Object.defineProperty(left, 'clientHeight', { configurable: true, get: () => (left.style.minHeight ? 242 : 40) });
      handle.el.querySelector<HTMLElement>('.pa-run--mark')!.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 120 }));
      expect(left.style.minHeight).toBe('242px');
      [...menu.querySelectorAll('button')].find((b) => b.textContent === 'Done')!.click();
      expect(menu.hidden).toBe(true);
      expect(left.style.minHeight).toBe('');
      handle.el.remove();
    });

    it('keeps the note as it is typed, without needing Done', async () => {
      const { handle, save, input } = open(300, 150);
      input.value = 'Say what it does.';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await handle.save();
      expect(save.mock.calls[0]![0].tags[0].note).toBe('Say what it does.');
    });

    it('closes on Enter and on a press elsewhere, and stays open for a press inside it', () => {
      const { handle, menu, run, input } = open(300, 150);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(menu.hidden).toBe(true);
      run.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 310 }));
      input.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      expect(menu.hidden).toBe(false);
      handle.el.querySelector('.mk-side')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      expect(menu.hidden).toBe(true);
    });
  });

  it('shows the student’s own pick as a dashed layer under the teacher’s highlights', () => {
    const text = data.text.answers!.q1!;
    const withPick: MarkPieceData = {
      ...data,
      text: { ...data.text, 'step.0': { pick: '{"code_id":"ts"}' } },
      steps: [{ part: 'answers', field: 'q1', pick: { code_id: 'ts', line: 'Open with a claim a reader could argue with.', start: 0, end: 34 } }],
      feedback: { tags: [{ code_id: 'ts', positive: false, part: 'answers', field: 'q1', start: 0, end: 11 }], comment: '', status: 'draft' }
    };
    const view = markPieceView(withPick, { save: vi.fn(), returnIt: vi.fn(), takeBack: vi.fn(), move: vi.fn() });
    expect(view.querySelector('.mk-step-head')!.textContent).toBe('Their next step · TSOpen with a claim a reader could argue with.');
    expect(view.querySelector('.mk-pick-caption')!.textContent).toBe('AN’s own TS pick.');
    const runs = [...view.querySelectorAll<HTMLElement>('.nst-pick-run')];
    expect(runs.map((r) => r.textContent).join('')).toBe(text.slice(0, 34));
    // The teacher's TS keeps its highlight; the rest of the pick is dashed only, and not a tag to tap.
    expect(runs[0]!.classList.contains('pa-run--mark')).toBe(true);
    expect(runs.at(-1)!.classList.contains('pa-run--mark')).toBe(false);
    expect(view.querySelector('.mk-sheets')!.textContent).not.toContain('code_id');
  });

  it('draws nothing for a skipped pick', () => {
    const skipped: MarkPieceData = { ...data, steps: [{ part: 'answers', field: 'q1', pick: { code_id: 'ts', line: 'Open with a claim.', skipped: true } }] };
    const view = markPieceView(skipped, { save: vi.fn(), returnIt: vi.fn(), takeBack: vi.fn(), move: vi.fn() });
    expect(view.querySelector('.mk-step-head')).toBeNull();
    expect(view.querySelector('.nst-pick-run')).toBeNull();
    expect(view.querySelector('.mk-pick-caption')).toBeNull();
  });
});

describe('mark piece: select, then code', () => {
  const act = () => ({ save: vi.fn().mockResolvedValue({}), returnIt: vi.fn(), takeBack: vi.fn(), move: vi.fn() });
  // The test DOM reports the wrong focus offset, so the selection itself is stood in for.
  const pick = (node: Text, start: number, end: number) => vi.spyOn(window, 'getSelection').mockReturnValue({ isCollapsed: false, anchorNode: node, anchorOffset: start, focusNode: node, focusOffset: end, removeAllRanges: () => undefined } as unknown as Selection);
  afterEach(() => vi.restoreAllMocks());

  it('tags the selected words when a code is pressed, widening to whole words', async () => {
    const a = act();
    const { el, save } = openMarkPiece(data, a, { embedded: true });
    document.body.append(el);
    const node = el.querySelector('.pa-run')!.firstChild as Text;
    pick(node, 1, 5);
    (el.querySelector('[data-code="ts"]') as HTMLButtonElement).click();
    expect(el.querySelector('.mk-tally')!.textContent).toContain('TS 1');
    expect(el.querySelector('.is-armed')).toBeNull();
    await save();
    expect(a.save.mock.calls[0]![0].tags[0]).toMatchObject({ code_id: 'ts', start: 0, end: 6 });
    el.remove();
  });

  it('a number key does the same as tapping the code', () => {
    const { el } = openMarkPiece(data, act(), { embedded: true });
    document.body.append(el);
    const node = el.querySelector('.pa-run')!.firstChild as Text;
    pick(node, 0, 2);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1' }));
    expect(el.querySelector('.mk-tally')!.textContent).toContain('TS 1');
    el.remove();
  });

  it('holds an AI tag dashed and out of the tally and the save until it is kept', async () => {
    const a = act();
    const suggested = [{ code_id: 'ts', part: 'answers', field: 'q1', start: 0, end: 34, why: 'No argument yet.' }];
    const { el, save } = openMarkPiece(data, a, { embedded: true, suggested });
    document.body.append(el);
    expect(el.querySelector('.mk-run--ai')).not.toBeNull();
    expect(el.querySelector('.mk-tally')!.textContent).toBe('No codes yet.');
    await save();
    expect(a.save.mock.calls[0]![0].tags).toEqual([]);
    (el.querySelector('.mk-run--ai') as HTMLElement).click();
    expect(el.querySelector('.mk-menu')!.textContent).toContain('No argument yet.');
    [...el.querySelectorAll<HTMLButtonElement>('.mk-menu button')].find((b) => b.textContent === 'Keep it')!.click();
    expect(el.querySelector('.mk-run--ai')).toBeNull();
    expect(el.querySelector('.mk-tally')!.textContent).toContain('TS 1');
    await save();
    expect(a.save.mock.calls[1]![0].tags[0]).toEqual({ code_id: 'ts', positive: false, part: 'answers', field: 'q1', start: 0, end: 34 });
    el.remove();
  });
});

describe('mark piece: several codes on the same words', () => {
  const three: MarkPieceData = {
    ...data,
    codes: [
      { id: 'ts', code: 'TS', label: 'Topic sentence', colour: 'peach', group: 'composition', descriptor: '' },
      { id: 'ev', code: 'EV', label: 'Evidence', colour: 'sage', group: 'composition', descriptor: '' },
      { id: 'an', code: 'AN', label: 'Analysis', colour: 'blue', group: 'composition', descriptor: '' }
    ],
    recent_codes: []
  };
  const act = () => ({ save: vi.fn().mockResolvedValue({}), returnIt: vi.fn(), takeBack: vi.fn(), move: vi.fn() });
  const pick = (node: Text, start: number, end: number) => vi.spyOn(window, 'getSelection').mockReturnValue({ isCollapsed: false, anchorNode: node, anchorOffset: start, focusNode: node, focusOffset: end, removeAllRanges: () => undefined } as unknown as Selection);
  const press = (el: HTMLElement, id: string) => (el.querySelector(`[data-code="${id}"]`) as HTMLButtonElement).click();
  const firstWords = (el: HTMLElement) => el.querySelector('.pa-run')!.firstChild as Text;
  const menuButton = (el: HTMLElement, label: string) => [...el.querySelectorAll<HTMLButtonElement>('.mk-menu button')].find((b) => b.textContent?.trim() === label)!;
  afterEach(() => vi.restoreAllMocks());

  it('shows a third code on words that already carry two', () => {
    const { el } = openMarkPiece(three, act(), { embedded: true });
    document.body.append(el);
    for (const id of ['ts', 'ev', 'an']) { pick(firstWords(el), 0, 6); press(el, id); }
    const run = el.querySelector<HTMLElement>('.pa-run--mark')!;
    expect(run.dataset.more).toBe('+1');
    el.remove();
  });

  it('pressing the same code on the same words again adds no second copy', async () => {
    const a = act();
    const { el, save } = openMarkPiece(three, a, { embedded: true });
    document.body.append(el);
    pick(firstWords(el), 0, 6); press(el, 'an');
    pick(firstWords(el), 0, 6); press(el, 'an');
    expect(el.querySelector('.mk-tally')!.textContent).toBe('AN 1');
    await save();
    expect(a.save.mock.calls[0]![0].tags).toHaveLength(1);
    el.remove();
  });

  it('a stale selection does not tag the same words twice when a code is armed', () => {
    const { el } = openMarkPiece(three, act(), { embedded: true });
    document.body.append(el);
    press(el, 'ev'); // nothing selected: arms EV
    // Selecting while armed tags straight away; the words leave the selection.
    pick(firstWords(el), 0, 6);
    document.dispatchEvent(new Event('selectionchange'));
    el.dispatchEvent(new CustomEvent('pm:select', { detail: { part: 'answers', field: 'q1', start: 0, end: 6 } }));
    vi.restoreAllMocks();
    vi.spyOn(window, 'getSelection').mockReturnValue({ isCollapsed: true, anchorNode: null, focusNode: null, removeAllRanges: () => undefined } as unknown as Selection);
    press(el, 'ts'); // a quick press straight after must arm TS, not tag the old words
    expect(el.querySelector('.mk-tally')!.textContent).toBe('EV 1');
    el.remove();
  });

  it('the menu on stacked words picks between their codes and removes the one chosen', async () => {
    const a = act();
    const { el, save } = openMarkPiece(three, a, { embedded: true });
    document.body.append(el);
    for (const id of ['ts', 'ev', 'an']) { pick(firstWords(el), 0, 6); press(el, id); }
    vi.restoreAllMocks();
    el.querySelector<HTMLElement>('.pa-run--mark')!.click();
    const menu = el.querySelector<HTMLElement>('.mk-menu')!;
    expect(menu.hidden).toBe(false);
    // Opens on the newest code, with the others one tap away.
    expect(menu.querySelector('.mk-menu__title')!.textContent).toContain('AN');
    expect([...menu.querySelectorAll('.mk-menu__pick')].map((b) => b.textContent)).toEqual(['TS', 'EV', 'AN']);
    menuButton(el, 'Remove').click();
    expect(el.querySelector('.mk-tally')!.textContent).toBe('TS 1 · EV 1');
    el.querySelector<HTMLElement>('.pa-run--mark')!.click();
    [...el.querySelectorAll<HTMLButtonElement>('.mk-menu__pick')].find((b) => b.textContent === 'TS')!.click();
    expect(el.querySelector('.mk-menu__title')!.textContent).toContain('TS');
    menuButton(el, 'Remove').click();
    expect(el.querySelector('.mk-tally')!.textContent).toBe('EV 1');
    await save();
    expect(a.save.mock.calls[0]![0].tags.map((t: { code_id: string }) => t.code_id)).toEqual(['ev']);
    el.remove();
  });

  it('drops copies that were already saved twice', async () => {
    const a = act();
    const t = { code_id: 'an', positive: false, part: 'answers', field: 'q1', start: 0, end: 6 };
    const { el, save } = openMarkPiece({ ...three, feedback: { tags: [t, { ...t }], comment: '', status: 'draft' } }, a, { embedded: true });
    document.body.append(el);
    expect(el.querySelector('.mk-tally')!.textContent).toBe('AN 1');
    await save();
    expect(a.save.mock.calls[0]![0].tags).toHaveLength(1);
    el.remove();
  });
});
