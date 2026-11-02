import { describe, expect, it, vi } from 'vitest';
import { openMarkPiece, type MarkPieceData } from '@/marking/mark-piece';

const data = (over: Partial<MarkPieceData> = {}): MarkPieceData => ({
  column: { id: 'c', title: 'Harbour', criteria: [{ id: 'c1', label: 'Analysis', outcomes: [], concepts: [] }] },
  student: { id: 's1', initials: 'MO', name: 'Mina Okafor' },
  text: { answers: { q1: 'New words here.' } },
  feedback: { tags: [], comment: '', status: 'draft' },
  mark: { steps: { c1: 'building' } },
  codes: [],
  recent_codes: [],
  position: { index: 0, total: 1 },
  ...over
});
const acts = () => ({ save: vi.fn().mockResolvedValue({}), returnIt: vi.fn().mockResolvedValue({}), takeBack: vi.fn().mockResolvedValue({}), move: vi.fn() });
const choose = (root: HTMLElement, value: string) => {
  const r = root.querySelector<HTMLInputElement>(`input[name="mk-ask"][value="${value}"]`)!;
  r.checked = true;
  r.dispatchEvent(new Event('change', { bubbles: true }));
};

describe('return for a redraft', () => {
  it('has no choice unless the page offers it', () => {
    expect(openMarkPiece(data(), acts()).el.querySelector('input[name="mk-ask"]')).toBeNull();
  });
  it('a plain return sends no ask', async () => {
    const a = acts();
    await openMarkPiece(data(), a, { redraft: true }).finish();
    expect(a.returnIt).toHaveBeenCalledWith(undefined);
  });
  it('a whole-piece ask sends it, and the button says so', async () => {
    const a = acts();
    const view = openMarkPiece(data(), a, { redraft: true });
    choose(view.el, 'whole');
    expect(view.el.querySelector('[data-action="return"]')!.textContent).toBe('Return for a redraft');
    await view.finish();
    expect(a.returnIt).toHaveBeenCalledWith({ redraft: { scope: 'whole' } });
  });
  it('a section ask waits for a section', async () => {
    const a = acts();
    const view = openMarkPiece(data(), a, { redraft: true });
    choose(view.el, 'section');
    expect(await view.finish()).toBe(false);
    expect(a.returnIt).not.toHaveBeenCalled();
    view.el.dispatchEvent(new CustomEvent('pm:select', { detail: { part: 'answers', field: 'q1', start: 0, end: 3 } }));
    expect(await view.finish()).toBe(true);
    expect(a.returnIt).toHaveBeenCalledWith({ redraft: { scope: { part: 'answers', field: 'q1', start: 0, end: 3 } } });
  });
});

describe('a redraft that came back', () => {
  const back = data({
    draft: 2,
    drafts: [{ n: 1, text: { answers: { q1: 'Old words here.' } }, tags: [], comment: 'Name the effect.', returned_at: '2026-10-28T00:00:00Z', steps: { c1: 'building' }, scope: 'whole' }]
  });
  it('opens on Changes, with the palette hidden and the old comment beside it', () => {
    const root = openMarkPiece(back, acts(), { redraft: true }).el;
    expect(root.querySelector('.mk-draft-pill.is-on')!.textContent).toBe('Changes');
    expect(root.querySelector<HTMLElement>('.mk-palette')!.hidden).toBe(true);
    expect(root.querySelector('del')!.textContent).toBe('Old');
    expect(root.querySelector('ins')!.textContent).toBe('New');
    expect(root.querySelector('.mk-earlier')!.textContent).toContain('Name the effect.');
  });
  it('the latest draft can be coded, and a chosen step leaves the old one marked', () => {
    const root = openMarkPiece(back, acts(), { redraft: true }).el;
    [...root.querySelectorAll<HTMLElement>('.mk-draft-pill')].find((b) => b.textContent === 'Draft 2')!.click();
    expect(root.querySelector<HTMLElement>('.mk-palette')!.hidden).toBe(false);
    root.querySelector<HTMLElement>('[data-step="c1:secure"]')!.click();
    expect(root.querySelector('[data-step="c1:building"]')!.classList.contains('is-was')).toBe(true);
  });
  it('words the next ask as another redraft', () => {
    const root = openMarkPiece(back, acts(), { redraft: true }).el;
    expect(root.querySelector('.mk-ask')!.textContent).toContain('Ask for another redraft: the whole piece');
  });
});
