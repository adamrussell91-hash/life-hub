import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendThinking = vi.fn(() => Promise.resolve({ saved: true }));
const fetchThinking = vi.fn();
const resetThinking = vi.fn();
vi.mock('@/blocks/thinking-client', () => ({
  sendThinking: (...args: unknown[]) => sendThinking(...(args as [])),
  fetchThinking: (...args: unknown[]) => fetchThinking(...(args as [])),
  resetThinking: (...args: unknown[]) => resetThinking(...(args as [])),
  savedInitials: () => 'AB',
  keepInitials: (v: string) => v
}));
const askConfirmCard = vi.fn(() => Promise.resolve(true));
vi.mock('@/teacher/confirm-dialog', () => ({ askConfirmCard: (...args: unknown[]) => askConfirmCard(...(args as [])) }));

import { createChoiceBoard, createBlock } from '@/blocks/create-block';
import { renderChoiceBoard, type ChoiceBoardBlock } from '@/blocks/choice-board';
import { SEND_DELAY_MS } from '@/blocks/choice-board/student';
import { pickProblem } from '@/blocks/choice-board/model';
import { createBlockEditor } from '@/blocks/editors';
import { renderBlock } from '@/blocks/render';
import { BlockSchema, type Block } from '@/schemas/block';

const LABELS = ['Retell', 'Map the plot', 'Diary entry', 'Quote hunt', 'Compare', 'Rewrite', 'Explain', 'Debate', 'Design a cover'];

function board(choice: Partial<NonNullable<ChoiceBoardBlock['content']['choice']>> = {}): ChoiceBoardBlock {
  const block = createChoiceBoard('cb1');
  return {
    ...block,
    content: {
      ...block.content,
      choice: { pick: 3, columns: 3, rule: 'none', ...choice },
      tabs: block.content.tabs.map((t, i) => ({ ...t, label: LABELS[i]!, kind: i === 0 ? 'Write' : undefined }))
    }
  };
}

/** Each tile's body is a plain box, so typing in it counts as starting work. */
const renderChild = (child: Block): HTMLElement => {
  const box = document.createElement('textarea');
  box.className = 'child-box';
  box.dataset.child = child.id;
  return box;
};

function withChildren(block: ChoiceBoardBlock): ChoiceBoardBlock {
  return {
    ...block,
    content: {
      ...block.content,
      tabs: block.content.tabs.map((t) => ({ ...t, blocks: [createBlock('rich_text', `${t.id}_b1`)] as typeof t.blocks }))
    }
  };
}

function mount(block: ChoiceBoardBlock, ctx: Parameters<typeof renderChoiceBoard>[2] = { lessonId: 'l1' }, mode: 'student' | 'teacher' | 'print' = 'student'): HTMLElement {
  const root = renderChoiceBoard(block, mode, ctx, renderChild);
  document.body.append(root);
  return root;
}

const faces = (root: HTMLElement) => [...root.querySelectorAll<HTMLButtonElement>('button.cb-tile__face')];
const status = (root: HTMLElement) => root.querySelector('.cb-status')!.textContent;
const buttonNamed = (root: ParentNode, name: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === name);

function pick(root: HTMLElement, index: number, reason = 'It looks fun'): void {
  faces(root)[index]!.click();
  const box = root.querySelectorAll<HTMLElement>('.cb-reason')[index]!;
  const input = box.querySelector<HTMLInputElement>('input')!;
  input.value = reason;
  buttonNamed(box, 'Open this task')!.click();
}

beforeEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
  sendThinking.mockClear();
  fetchThinking.mockReset();
  resetThinking.mockReset();
  askConfirmCard.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Choice board, student', () => {
  it('shows the instruction, initials and every tile with its level', () => {
    const root = mount(board());
    expect(root.querySelector('.block-eyebrow')!.textContent).toBe('Choice board');
    expect(root.querySelector('.cb-instruction')!.textContent).toBe('Pick 3 tasks.');
    expect(root.querySelector<HTMLInputElement>('.cb-initials__input')!.value).toBe('AB');
    expect(faces(root)).toHaveLength(9);
    expect(faces(root)[0]!.textContent).toContain('Core');
    expect(faces(root)[0]!.textContent).toContain('Write');
    expect(faces(root)[2]!.textContent).toContain('Challenge');
    expect(status(root)).toBe('Pick 3 more.');
  });

  it('asks why before a tile opens, then opens its body', () => {
    const root = mount(withChildren(board()));
    faces(root)[1]!.click();
    expect(faces(root)[1]!.getAttribute('aria-expanded')).toBe('true');
    const box = root.querySelectorAll<HTMLElement>('.cb-reason')[1]!;
    expect(box.hidden).toBe(false);
    buttonNamed(box, 'Open this task')!.click();
    expect(box.querySelector('.cb-error')!.textContent).toMatch(/short reason/);
    expect(root.querySelectorAll('.cb-task')).toHaveLength(0);
    box.querySelector<HTMLInputElement>('input')!.value = 'I like maps';
    buttonNamed(box, 'Open this task')!.click();
    const task = root.querySelector<HTMLElement>('.cb-task')!;
    expect(task.querySelector('.cb-task__title')!.textContent).toBe('Map the plot');
    expect(task.querySelector('.cb-task__why')!.textContent).toBe('Why I picked it: I like maps');
    expect(task.querySelector('.child-box')).not.toBeNull();
    expect(faces(root)[1]!.getAttribute('aria-pressed')).toBe('true');
    expect(status(root)).toBe('Pick 2 more.');
  });

  it('stops at pick N and says when the picks are set', () => {
    const root = mount(board({ pick: 2 }));
    pick(root, 0);
    pick(root, 4);
    expect(status(root)).toBe('Your picks are set.');
    faces(root)[8]!.click();
    expect(root.querySelectorAll<HTMLElement>('.cb-reason')[8]!.hidden).toBe(true);
    expect(status(root)).toMatch(/Swap a pick/);
  });

  it('one from each column: blocks a pick that would leave a column empty, allows the rest', () => {
    const root = mount(board({ rule: 'each_column' }));
    expect(root.querySelector('.cb-instruction')!.textContent).toBe('Pick 3 tasks, at least one from each column.');
    expect(faces(root)[0]!.textContent).toContain('Column 1');
    pick(root, 0);
    expect(status(root)).toBe('Pick from columns 2 and 3.');
    // A second pick in column 1 would leave one pick for two empty columns.
    faces(root)[3]!.click();
    expect(root.querySelectorAll<HTMLElement>('.cb-reason')[3]!.hidden).toBe(true);
    expect(status(root)).toBe('Pick from columns 2 and 3 next, so every column has one.');
    pick(root, 4);
    expect(status(root)).toBe('Pick from column 3.');
    pick(root, 8);
    expect(status(root)).toBe('Your picks are set.');
    expect(root.querySelectorAll('.cb-task')).toHaveLength(3);
  });

  it('a line: only picks that can still make a row, column or diagonal', () => {
    const settings = { pick: 3, columns: 3, rule: 'line' as const };
    expect(pickProblem([0], 4, 9, settings)).toBe('');
    expect(pickProblem([0, 4], 5, 9, settings)).toMatch(/lines up/);
    expect(pickProblem([0, 4], 8, 9, settings)).toBe('');
    const root = mount(board({ rule: 'line' }));
    pick(root, 0);
    pick(root, 4);
    faces(root)[5]!.click();
    expect(root.querySelectorAll<HTMLElement>('.cb-reason')[5]!.hidden).toBe(true);
    expect(status(root)).toMatch(/lines up/);
    pick(root, 8);
    expect(status(root)).toBe('Your picks are set.');
  });

  it('lets a pick be swapped until work starts inside it, then locks it', () => {
    const root = mount(withChildren(board()));
    pick(root, 0);
    pick(root, 1);
    const first = root.querySelector<HTMLElement>('.cb-task[data-tab="cb1_t1"]')!;
    buttonNamed(first, 'Swap this pick')!.click();
    expect(root.querySelector('.cb-task[data-tab="cb1_t1"]')).toBeNull();
    expect(faces(root)[0]!.getAttribute('aria-pressed')).toBe('false');
    const second = root.querySelector<HTMLElement>('.cb-task[data-tab="cb1_t2"]')!;
    const box = second.querySelector<HTMLTextAreaElement>('.child-box')!;
    box.value = 'The storm begins';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    expect(buttonNamed(second, 'Swap this pick')).toBeUndefined();
    expect(second.textContent).toContain('Work started, so this pick stays.');
    expect(faces(root)[1]!.textContent).toContain('Locked choice');
    // The body is kept, so typing survives the redraw.
    expect(second.querySelector<HTMLTextAreaElement>('.child-box')).toBe(box);
    expect(box.value).toBe('The storm begins');
  });

  it('finishing asks how hard and one thing learned, then shows Finished', () => {
    const root = mount(board());
    pick(root, 2);
    const task = root.querySelector<HTMLElement>('.cb-task')!;
    buttonNamed(task, 'I’ve finished this task')!.click();
    const finish = task.querySelector<HTMLElement>('.cb-finish')!;
    expect(finish.hidden).toBe(false);
    buttonNamed(finish, 'Save')!.click();
    expect(finish.querySelector('.cb-error')!.textContent).toMatch(/how hard/);
    buttonNamed(finish, 'Hard')!.click();
    expect(buttonNamed(finish, 'Hard')!.getAttribute('aria-pressed')).toBe('true');
    buttonNamed(finish, 'Save')!.click();
    expect(finish.querySelector('.cb-error')!.textContent).toMatch(/one thing/);
    finish.querySelector<HTMLInputElement>('input')!.value = 'Short sentences build tension';
    buttonNamed(finish, 'Save')!.click();
    expect(task.dataset.state).toBe('finished');
    expect(task.querySelector('.cb-done')!.textContent).toContain('How hard: Hard');
    expect(task.querySelector('.cb-done')!.textContent).toContain('Short sentences build tension');
    expect(faces(root)[2]!.textContent).toContain('Finished');
  });

  it('keeps picks on the device and sends them, debounced, with initials', async () => {
    vi.useFakeTimers();
    const root = mount(board());
    pick(root, 4, 'Looks hard');
    pick(root, 5, 'Want a go');
    expect(sendThinking).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SEND_DELAY_MS + 10);
    expect(sendThinking).toHaveBeenCalledTimes(1);
    const [lessonId, blockId, initials, data] = sendThinking.mock.calls[0] as unknown as [string, string, string, { picks: Array<Record<string, unknown>> }];
    expect([lessonId, blockId, initials]).toEqual(['l1', 'cb1', 'AB']);
    expect(data.picks).toEqual([
      { tab: 'cb1_t5', index: 4, tier: 2, reason: 'Looks hard', started: false, finished: false },
      { tab: 'cb1_t6', index: 5, tier: 3, reason: 'Want a go', started: false, finished: false }
    ]);
    const stored = JSON.parse(localStorage.getItem('teaching-hub.activity.l1.cb1.choice')!);
    expect(stored.picks).toHaveLength(2);
    // A fresh render restores the picks.
    document.body.replaceChildren();
    const again = mount(board());
    expect(again.querySelectorAll('.cb-task')).toHaveLength(2);
    expect(faces(again)[4]!.getAttribute('aria-pressed')).toBe('true');
  });

  it('without a lesson keeps nothing on the server', () => {
    vi.useFakeTimers();
    const root = mount(board(), { saveScope: 'home' });
    expect(root.querySelector('.cb-initials__input')).toBeNull();
    pick(root, 0);
    vi.advanceTimersByTime(SEND_DELAY_MS * 2);
    expect(sendThinking).not.toHaveBeenCalled();
    expect(localStorage.getItem('teaching-hub.activity.home.cb1.choice')).toContain('cb1_t1');
  });
});

describe('Choice board, teacher', () => {
  const responses = {
    lesson_id: 'l1',
    block_id: 'cb1',
    responses: [
      { at: '1', kind: 'choice', initials: 'JS', data: { picks: [
        { tab: 'cb1_t1', index: 0, tier: 1, reason: 'Easy start', started: true, finished: true, rating: 1, learned: 'Plot order' },
        { tab: 'cb1_t4', index: 3, tier: 1, reason: 'Quotes', started: false, finished: false }
      ] } },
      { at: '2', kind: 'choice', initials: 'MK', data: { picks: [
        { tab: 'cb1_t1', index: 0, tier: 1, reason: 'Warm up', started: false, finished: false },
        { tab: 'cb1_t5', index: 4, tier: 2, reason: 'Compare', started: true, finished: false }
      ] } }
    ]
  };

  it('editing canvas: grid with levels, rule text and each task in a fold', () => {
    const root = mount(withChildren(board({ rule: 'each_column' })), {}, 'teacher');
    expect(root.querySelector('.cb-instruction')!.textContent).toMatch(/each column/);
    const tiles = root.querySelectorAll('.cb-tile');
    expect(tiles).toHaveLength(9);
    expect(tiles[0]!.textContent).toContain('Retell');
    const fold = tiles[0]!.querySelector('details')!;
    fold.open = true;
    fold.dispatchEvent(new Event('toggle'));
    expect(fold.querySelector('.child-box')).not.toBeNull();
    expect(fetchThinking).not.toHaveBeenCalled();
  });

  it('shows counts per tile, the table and the pattern flag', async () => {
    fetchThinking.mockResolvedValue(responses);
    const root = mount(board(), { lessonId: 'l1' }, 'teacher');
    await vi.waitFor(() => expect(root.querySelector('.cb-table')).not.toBeNull());
    const counts = [...root.querySelectorAll('.cb-count')].map((c) => c.textContent);
    expect(counts[0]).toBe('Picked by 2');
    expect(counts[3]).toBe('Picked by 1');
    expect(counts[8]).toBe('Picked by 0');
    const table = root.querySelector('.cb-table')!;
    expect(table.textContent).toContain('JS');
    expect(table.textContent).toContain('Easy start');
    expect(table.textContent).toContain('Plot order');
    const flags = [...root.querySelectorAll('.cb-pattern')].map((f) => f.textContent);
    expect(flags).toEqual(['Took Core every time']);
    expect(buttonNamed(root, 'Clear responses')).toBeDefined();
  });

  it('clears responses after the teacher confirms', async () => {
    fetchThinking.mockResolvedValue(responses);
    resetThinking.mockResolvedValue({ lesson_id: 'l1', block_id: 'cb1', responses: [] });
    const root = mount(board(), { lessonId: 'l1' }, 'teacher');
    await vi.waitFor(() => expect(root.querySelector('.cb-table')).not.toBeNull());
    buttonNamed(root, 'Clear responses')!.click();
    await vi.waitFor(() => expect(resetThinking).toHaveBeenCalledWith('l1', 'cb1'));
    await vi.waitFor(() => expect(root.querySelector('.cb-table')).toBeNull());
    expect(askConfirmCard).toHaveBeenCalled();
  });

  it('Display shows counts only: no initials, no clear, refreshes itself', async () => {
    vi.useFakeTimers();
    fetchThinking.mockResolvedValue(responses);
    const root = mount(board(), { lessonId: 'l1', display: true }, 'teacher');
    await vi.waitFor(() => expect(root.querySelector('.cb-count')!.textContent).toBe('Picked by 2'));
    expect(root.querySelector('.cb-table')).toBeNull();
    expect(root.textContent).not.toContain('JS');
    expect(buttonNamed(root, 'Clear responses')).toBeUndefined();
    expect(fetchThinking).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(8000);
    expect(fetchThinking).toHaveBeenCalledTimes(2);
    root.remove();
    await vi.advanceTimersByTimeAsync(16000);
    expect(fetchThinking).toHaveBeenCalledTimes(2);
  });
});

describe('Choice board, print and wiring', () => {
  it('prints the instruction, a tick grid, reason lines and each task', () => {
    const root = mount(withChildren(board({ rule: 'line' })), {}, 'print');
    expect(root.querySelector('.cb-instruction')!.textContent).toMatch(/make a line/);
    expect(root.querySelectorAll('.cb-print__tick')).toHaveLength(9);
    expect(root.querySelector('.cb-print__why')!.textContent).toBe('Why I picked it');
    expect(root.querySelector('.pf-print__lines')).not.toBeNull();
    const tasks = root.querySelectorAll('.cb-print__task');
    expect(tasks).toHaveLength(9);
    expect(tasks[0]!.querySelector('h3')!.textContent).toBe('Retell');
    expect(tasks[0]!.querySelector('.child-box')).not.toBeNull();
    expect(root.querySelector('button')).toBeNull();
  });

  it('renders through the page renderer as a Panels block', () => {
    const block = withChildren(board());
    expect(BlockSchema.safeParse(block).success).toBe(true);
    const wrapper = renderBlock(block, 'student', { lessonId: 'l1' });
    expect(wrapper.dataset.blockType).toBe('tabs');
    expect(wrapper.querySelectorAll('button.cb-tile__face')).toHaveLength(9);
  });

  it('the Panels editor offers Choice board settings and per-tile level and type', () => {
    const block = board();
    let latest: ChoiceBoardBlock = block;
    const changed = vi.fn((next: ChoiceBoardBlock) => { latest = next; });
    const editor = createBlockEditor(block, changed as never, () => latest as never);
    const settings = editor.querySelector('.cb-editor');
    expect(settings).not.toBeNull();
    const selects = [...settings!.querySelectorAll('select')];
    expect(selects).toHaveLength(3);
    const ruleSelect = selects[2]!;
    expect([...ruleSelect.options].map((o) => o.value)).toEqual(['none', 'each_column', 'line']);
    expect([...ruleSelect.options].find((o) => o.value === 'line')!.disabled).toBe(false);
    ruleSelect.value = 'line';
    ruleSelect.dispatchEvent(new Event('change'));
    expect(latest.content.choice?.rule).toBe('line');
    // Four per row: a line no longer fits, so it says why.
    selects[1]!.value = '4';
    selects[1]!.dispatchEvent(new Event('change'));
    expect(latest.content.choice?.columns).toBe(4);
    expect(settings!.querySelector('.cb-editor__hint')!.textContent).toMatch(/3 × 3/);
    const tile = editor.querySelector('.cb-editor__tile')!;
    const level = tile.querySelector('select')!;
    level.value = '3';
    level.dispatchEvent(new Event('change'));
    const kind = tile.querySelector<HTMLInputElement>('input')!;
    expect(kind.placeholder).toBe('Write, Analyse, Create…');
    kind.value = 'Create';
    kind.dispatchEvent(new Event('input'));
    const active = latest.content.tabs.find((t) => t.kind === 'Create');
    expect(active?.tier).toBe(3);
    expect(BlockSchema.safeParse(latest).success).toBe(true);
  });
});
