import { afterEach, describe, expect, it, vi } from 'vitest';
import { markPieceView, type MarkPieceData } from '@/marking/mark-piece';

const text = 'In the poem the poet uses imagery. The road is a grey ribbon.\n\nA second paragraph sits here.';
const data: MarkPieceData = {
  column: { id: 'col1', title: 'Imagery paragraph', criteria: [] },
  student: { id: 'st_ava', initials: 'AN', name: 'Ava Nguyen' },
  text: { answers: { q1: text } },
  feedback: null, mark: null,
  codes: [
    { id: 'ts', code: 'TS', label: 'Topic sentence', colour: 'lilac', group: 'composition', descriptor: '' },
    { id: 'comp_ad', code: 'AD', label: 'Analysis – depth', colour: 'lilac', group: 'composition', descriptor: '' }
  ],
  recent_codes: [],
  position: { index: 0, total: 1 }
};

function mount() {
  const view = markPieceView(data, { save: vi.fn().mockResolvedValue({}), returnIt: vi.fn(), takeBack: vi.fn(), move: vi.fn() });
  document.body.replaceChildren(view);
  return view;
}

/** Selects from (node, offset) to (node, offset), as a drag would. jsdom misreports focusOffset, so the selection is a stand-in. */
function select(a: Node, ao: number, b: Node, bo: number): void {
  let live = true;
  const fake = {
    get isCollapsed() { return !live; },
    get anchorNode() { return live ? a : null; }, anchorOffset: ao,
    get focusNode() { return live ? b : null; }, focusOffset: bo,
    removeAllRanges: () => { live = false; }
  } as unknown as Selection;
  vi.spyOn(window, 'getSelection').mockReturnValue(fake);
  document.dispatchEvent(new Event('selectionchange'));
}

const sheet = (view: HTMLElement) => view.querySelector<HTMLElement>('[data-part="answers"]')!;
const runs = (view: HTMLElement) => [...sheet(view).querySelectorAll<HTMLElement>('.pa-run')];
const tally = (view: HTMLElement) => view.querySelector('.mk-tally')!.textContent;

afterEach(() => vi.restoreAllMocks());

describe('tagging a drag that starts or ends between the runs', () => {
  it('a drag ending in the space after a sentence still tags it (select, then tap a code)', () => {
    const view = mount();
    const first = runs(view)[0]!;
    const gap = first.parentElement!.nextSibling!; // the bare space between sentences
    expect(gap.nodeType).toBe(Node.TEXT_NODE);
    select(first.firstChild!, 0, gap, 1);
    sheet(view).dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    view.querySelector<HTMLButtonElement>('[data-code="comp_ad"]')!.click();
    expect(tally(view)).toBe('AD 1');
  });

  it('a drag ending past the paragraph (on the paragraph element) still tags, with a code armed first', () => {
    const view = mount();
    view.querySelector<HTMLButtonElement>('[data-code="comp_ad"]')!.click();
    const first = runs(view)[0]!;
    const para = first.closest('p')!;
    select(first.firstChild!, 0, para, para.childNodes.length);
    sheet(view).dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(tally(view)).toBe('AD 1');
  });

  it('a triple-click that ends at the start of the next paragraph tags the first paragraph only', () => {
    const view = mount();
    const first = runs(view)[0]!;
    const next = sheet(view).querySelectorAll('p')[1]!;
    select(first.firstChild!, 0, next, 0);
    view.querySelector<HTMLButtonElement>('[data-code="comp_ad"]')!.click();
    expect(tally(view)).toBe('AD 1');
    const marked = runs(view).filter((r) => r.classList.contains('pa-run--mark')).map((r) => r.textContent).join(' ');
    expect(marked).toBe('In the poem the poet uses imagery. The road is a grey ribbon.');
  });
});
