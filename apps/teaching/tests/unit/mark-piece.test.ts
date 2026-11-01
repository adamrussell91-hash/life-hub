import { describe, expect, it, vi } from 'vitest';
import { markPieceView, type MarkPieceData } from '@/marking/mark-piece';

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
