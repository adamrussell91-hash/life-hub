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
