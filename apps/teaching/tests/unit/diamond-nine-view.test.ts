import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/blocks/thinking-client', () => ({
  sendThinking: vi.fn(),
  fetchThinking: vi.fn(),
  resetThinking: vi.fn(),
  savedInitials: vi.fn(() => ''),
  keepInitials: vi.fn((v: string) => v.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4))
}));

import { fetchThinking, sendThinking } from '@/blocks/thinking-client';
import { createDiamondNineEditor, renderDiamondNine, type DiamondNineBlock } from '@/blocks/diamond-nine';
import { BlockSchema } from '@/schemas/block';
import { createBlock } from '@/blocks/create-block';

const sendMock = vi.mocked(sendThinking);
const fetchMock = vi.mocked(fetchThinking);

const IDS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9'];

function makeBlock(patch: Partial<DiamondNineBlock['content']> = {}): DiamondNineBlock {
  return {
    id: 'd9', type: 'block', block_type: 'diamond_nine', variant: 'medium', visibility: 'student_teacher',
    content: {
      title: 'The Tide Clock',
      criterion: 'Most significant to the poem’s meaning',
      second_criterion: '',
      cards: IDS.map((id, i) => ({ id, kind: i === 1 ? 'quote' as const : 'text' as const, text: `Idea ${i + 1}`, ...(i === 1 ? { source: 'Stanza 2' } : {}) })),
      wildcard: true, frame: true, rerank: true,
      ...patch
    }
  } as DiamondNineBlock;
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const q = <T extends Element = HTMLElement>(root: Element, sel: string) => root.querySelector<T & HTMLElement>(sel);
const slotButton = (root: Element, slot: number) => q<HTMLButtonElement>(root, `.d9-round [data-slot="${slot}"] button`)!;
const trayCard = (root: Element, id: string) => q<HTMLButtonElement>(root, `.d9-tray [data-card="${id}"]`)!;
const sendButton = (root: Element) => q<HTMLButtonElement>(root, '.d9-send__button')!;

function type(box: HTMLTextAreaElement | HTMLInputElement, text: string): void {
  box.value = text;
  box.dispatchEvent(new Event('input'));
}

/** Places card i in slot i by tapping the card, then the slot. */
function placeAll(root: HTMLElement, order = IDS): void {
  order.forEach((id, slot) => {
    trayCard(root, id).click();
    slotButton(root, slot).click();
  });
}

function fillReasons(root: HTMLElement): void {
  const [top, bottom] = [...root.querySelectorAll<HTMLTextAreaElement>('.d9-round .d9-reason textarea')];
  type(top!, 'It sets the whole poem moving.');
  type(bottom!, 'It only adds colour.');
}

beforeEach(() => {
  localStorage.clear();
  sendMock.mockReset();
  fetchMock.mockReset();
  document.body.replaceChildren();
});

describe('Diamond 9 view', () => {
  it('prints the empty diamond, lettered cards and reason lines', () => {
    const root = renderDiamondNine(makeBlock({ second_criterion: 'Most surprising' }), 'print');
    expect(root.querySelectorAll('.d9-slot--print')).toHaveLength(9);
    expect(root.querySelectorAll('.d9-row')).toHaveLength(5);
    expect([...root.querySelectorAll('.d9-row')].map((r) => r.children.length)).toEqual([1, 2, 3, 2, 1]);
    expect(root.querySelectorAll('.d9-print__card')).toHaveLength(9);
    expect(root.textContent).toContain('Top card, and why');
    expect(root.textContent).toContain('Bottom card, and why');
    expect(root.textContent).toContain('Most surprising');
    expect(root.textContent).toContain('Rank by: Most significant');
  });

  it('shows the teacher a preview before publishing', () => {
    const root = renderDiamondNine(makeBlock(), 'teacher');
    expect(root.textContent).toContain('Students rank from the published lesson.');
    expect(root.querySelectorAll('.d9-preview__cards li')).toHaveLength(9);
    expect(root.querySelectorAll('.d9-slot')).toHaveLength(9);
    expect(root.querySelector('.d9-end--top')!.textContent).toBe('Most significant to the poem’s meaning');
    expect(root.querySelector('.d9-end--bottom')!.textContent).toBe('Least significant to the poem’s meaning');
  });

  it('runs the student flow: place nine, give reasons, send, then see the class', async () => {
    const root = renderDiamondNine(makeBlock(), 'student', { lessonId: 'L1' });
    document.body.append(root);
    expect(root.querySelectorAll('.d9-tray .d9-card')).toHaveLength(9);
    expect(root.querySelector('.d9-class')).toBeNull();
    expect(root.textContent).toContain('The class diamond opens here once you send yours.');

    trayCard(root, 'c1').click();
    expect(trayCard(root, 'c1').getAttribute('aria-pressed')).toBe('true');
    slotButton(root, 0).click();
    expect(slotButton(root, 0).dataset.card).toBe('c1');

    IDS.slice(1).forEach((id, i) => {
      trayCard(root, id).click();
      slotButton(root, i + 1).click();
    });
    const fresh = root;
    expect(fresh.querySelectorAll('.d9-tray .d9-card')).toHaveLength(0);
    expect(sendButton(fresh).disabled).toBe(true);
    expect(fresh.querySelector('.d9-checklist')!.textContent).toContain('Type your initials');

    type(q<HTMLInputElement>(fresh, '.d9-initials input')!, 'jt');
    fillReasons(fresh);
    expect(sendButton(fresh).disabled).toBe(false);

    sendMock.mockResolvedValue({ saved: true, class: { layouts: [IDS, IDS, [...IDS].reverse()] } });
    sendButton(fresh).click();
    await flush();
    expect(sendMock).toHaveBeenCalledTimes(1);
    const [lessonId, blockId, initials, data] = sendMock.mock.calls[0]!;
    expect([lessonId, blockId, initials]).toEqual(['L1', 'd9', 'JT']);
    expect((data as { rounds: { first: { slots: string[]; reasons: Record<string, string> } } }).rounds.first).toEqual({
      slots: IDS,
      reasons: { c1: 'It sets the whole poem moving.', c9: 'It only adds colour.' }
    });
    expect(fresh.querySelector('.d9-class')).not.toBeNull();
    expect(fresh.textContent).toContain('Class diamond');
    expect(fresh.textContent).toContain('Where the class disagrees most');
    expect(fresh.querySelectorAll('.d9-contested__item').length).toBeGreaterThan(0);
    expect(fresh.querySelector('.d9-round--locked')).not.toBeNull();
    expect(fresh.querySelector('.d9-round--locked button.d9-card')).toBeNull();
  });

  it('swaps cards on the diamond and sends a card back to the tray', () => {
    const root = renderDiamondNine(makeBlock(), 'student', { lessonId: 'L3' });
    document.body.append(root);
    trayCard(root, 'c1').click();
    slotButton(root, 0).click();
    trayCard(root, 'c2').click();
    slotButton(root, 1).click();
    slotButton(root, 0).click(); // pick up c1
    slotButton(root, 1).click(); // tap c2: swap
    expect(slotButton(root, 0).dataset.card).toBe('c2');
    expect(slotButton(root, 1).dataset.card).toBe('c1');
    slotButton(root, 1).click();
    [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Back to the tray')!.click();
    expect(trayCard(root, 'c1')).not.toBeNull();
  });

  it('asks what changed their mind for a card that moved two rows or more', async () => {
    const root = renderDiamondNine(makeBlock(), 'student', { lessonId: 'L4' });
    document.body.append(root);
    placeAll(root);
    type(q<HTMLInputElement>(root, '.d9-initials input')!, 'AB');
    fillReasons(root);
    sendMock.mockResolvedValue({ saved: true, class: { layouts: [IDS] } });
    sendButton(root).click();
    await flush();

    [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Rank again after the discussion')!.click();
    const round = root.querySelector('.d9-round--rerank')!;
    expect(round).not.toBeNull();
    expect(round.querySelectorAll('.d9-move')).toHaveLength(9);
    expect(sendButton(root).disabled).toBe(false);

    // Swap top (c1, row 0) with bottom (c9, row 4): both move four rows.
    slotButton(root, 0).click();
    slotButton(root, 8).click();
    expect(slotButton(root, 8).querySelector('.d9-move')!.textContent).toBe('↓4');
    const whys = root.querySelectorAll<HTMLTextAreaElement>('.d9-reason--why textarea');
    expect(whys).toHaveLength(2);
    expect(sendButton(root).disabled).toBe(true);
    fillReasons(root);
    expect(sendButton(root).disabled).toBe(true);
    whys.forEach((w) => type(w, 'A classmate showed me the last line.'));
    expect(sendButton(root).disabled).toBe(false);

    sendButton(root).click();
    await flush();
    const data = sendMock.mock.calls.at(-1)![3] as { rounds: Record<string, { slots: string[]; why?: Record<string, string> }> };
    expect(Object.keys(data.rounds)).toEqual(['first', 'rerank']);
    expect(data.rounds.rerank!.slots[0]).toBe('c9');
    expect(Object.keys(data.rounds.rerank!.why!)).toEqual(expect.arrayContaining(['c1', 'c9']));
    expect(root.textContent).toContain('Your movement');
  });

  it('saves locally and skips the class view with only a save scope', async () => {
    const root = renderDiamondNine(makeBlock({ rerank: false }), 'student', { saveScope: 'page1' });
    document.body.append(root);
    expect(root.querySelector('.d9-initials')).toBeNull();
    placeAll(root);
    fillReasons(root);
    sendButton(root).click();
    await flush();
    expect(sendMock).not.toHaveBeenCalled();
    expect(root.querySelector('.d9-class')).toBeNull();
    expect(root.textContent).toContain('Saved on this device.');
    expect(localStorage.getItem('teaching-hub.activity.page1.d9.diamond')).toContain('"first"');
  });

  it('swaps in a student’s own card', () => {
    const root = renderDiamondNine(makeBlock(), 'student', { lessonId: 'L5' });
    document.body.append(root);
    const form = root.querySelector('.d9-wild__form')!;
    (form.querySelector('select') as HTMLSelectElement).value = 'c3';
    type(form.querySelector('textarea')!, 'The silence after the bell');
    [...form.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Swap it in')!.click();
    expect(trayCard(root, 'wild')).not.toBeNull();
    expect(root.querySelector('.d9-tray [data-card="c3"]')).toBeNull();
  });

  it('shows the teacher the class diamond, contested cards and outliers, with initials off on Display', async () => {
    const reverse = [...IDS].reverse();
    const responses = [
      { at: '1', kind: 'diamond', initials: 'JT', data: { rounds: { first: { slots: IDS, reasons: {} } } } },
      { at: '2', kind: 'diamond', initials: 'MK', data: { rounds: { first: { slots: IDS, reasons: {} } } } },
      { at: '3', kind: 'diamond', initials: 'RS', data: { rounds: { first: { slots: IDS, reasons: {} } } } },
      { at: '4', kind: 'diamond', initials: 'PL', data: { rounds: { first: { slots: reverse, reasons: { c9: 'It is the turning point.' } } }, wildcard: { replaces: 'c4', text: 'Salt' } } }
    ];
    fetchMock.mockResolvedValue({ lesson_id: 'L1', block_id: 'd9', responses });
    const teacher = renderDiamondNine(makeBlock(), 'teacher', { lessonId: 'L1' });
    await flush();
    expect(teacher.textContent).toContain('4 diamonds in');
    expect(teacher.textContent).toContain('Most contested');
    expect(teacher.querySelector('.d9-outlier__who')?.textContent).toBe('PL');
    expect(teacher.textContent).toContain('It is the turning point.');
    expect(teacher.textContent).toContain('Clear responses');
    expect(teacher.querySelector('.d9-reveal')).toBeNull();
    expect(teacher.querySelector('.d9-boards')).not.toBeNull();

    const display = renderDiamondNine(makeBlock(), 'teacher', { lessonId: 'L1', display: true });
    await flush();
    expect(display.classList.contains('d9--display')).toBe(true);
    // Hidden until the teacher reveals: counts only.
    expect(display.textContent).toContain('4 diamonds in');
    expect(display.querySelector('.d9-boards')).toBeNull();
    expect(display.querySelector('.d9-hot')).toBeNull();
    const reveal = display.querySelector<HTMLButtonElement>('.d9-reveal')!;
    expect(reveal.textContent).toBe('Reveal the class diamond');
    reveal.click();
    expect(display.querySelector('.d9-boards')).not.toBeNull();
    expect(display.querySelector('.d9-outlier__who')).toBeNull();
    expect(display.textContent).toContain('It is the turning point.');
    // A refresh keeps it revealed.
    [...display.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Refresh')!.click();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(display.querySelector('.d9-boards')).not.toBeNull();
    display.querySelector<HTMLButtonElement>('.d9-reveal')!.click();
    expect(display.querySelector('.d9-boards')).toBeNull();
    expect(display.querySelector('.d9-reveal')!.textContent).toBe('Reveal the class diamond');
    expect(display.textContent).not.toContain('PL');
    expect(display.textContent).not.toContain('Clear responses');
  });

  it('the editor saves the criterion, card kinds and toggles, and counts ready cards', () => {
    const made = createBlock('diamond_nine', 'd9e') as DiamondNineBlock;
    const block = { ...made, content: { ...made.content, cards: [] } } as DiamondNineBlock;
    const changed = vi.fn();
    const editor = createDiamondNineEditor(block, changed);
    expect(editor.querySelectorAll('.d9-editor__card')).toHaveLength(9);
    expect(editor.textContent).toContain('0 of 9 cards ready');
    const first = editor.querySelector<HTMLInputElement>('.d9-editor__card input[type="text"]')!;
    type(first, 'The repeated image of the tide');
    expect(editor.textContent).toContain('1 of 9 cards ready');
    const kind = editor.querySelectorAll<HTMLSelectElement>('.d9-editor__card select')[1]!;
    kind.value = 'quote';
    kind.dispatchEvent(new Event('change'));
    expect(editor.querySelectorAll('.d9-editor__card')[1]!.textContent).toContain('source');
    const wildcard = [...editor.querySelectorAll<HTMLInputElement>('.pf-switch input')][0]!;
    wildcard.checked = false;
    wildcard.dispatchEvent(new Event('change'));
    const updated = changed.mock.calls.at(-1)![0] as DiamondNineBlock;
    expect(updated.content.cards).toHaveLength(9);
    expect(updated.content.cards[0]!.text).toBe('The repeated image of the tide');
    expect(updated.content.cards[1]!.kind).toBe('quote');
    expect(updated.content.wildcard).toBe(false);
    const parsed = BlockSchema.safeParse(updated);
    expect(parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe('');
  });
});
