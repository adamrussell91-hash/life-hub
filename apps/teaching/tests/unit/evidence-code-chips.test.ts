import { describe, expect, it, vi } from 'vitest';
import { codeChips } from '@/evidence/code-chips';
import type { FeedbackCode } from '@/blocks/feedback-codes';

const code = (id: string, c: string, group: FeedbackCode['group'], hidden = false): FeedbackCode => ({
  id,
  code: c,
  label: c,
  group,
  criterion: null,
  colour: 'sage',
  descriptor: `${c} means…`,
  hidden
});
const codes = [code('ts', 'TS', 'composition'), code('e', 'E', 'composition'), code('v', 'VP', 'viva'), code('h', 'X', 'composition', true)];

describe('codeChips', () => {
  it('shows composition codes, toggles them, and hides the rest behind More codes', () => {
    const onChange = vi.fn();
    const node = codeChips({ codes, selected: ['e'], onChange });
    const chips = () => [...node.querySelectorAll<HTMLButtonElement>('.ev-chip')];
    expect(chips().map((b) => b.textContent)).toEqual(['TS', 'E']);
    expect(chips()[1]!.getAttribute('aria-pressed')).toBe('true');
    expect(chips()[0]!.title).toBe('TS means…');
    chips()[0]!.click();
    expect(onChange).toHaveBeenLastCalledWith(['e', 'ts']);
    node.querySelector<HTMLButtonElement>('.ev-chips__more')!.click();
    expect(chips().map((b) => b.textContent)).toEqual(['TS', 'E', 'VP']);
  });
  it('shows a picked code from another group without More codes', () => {
    const node = codeChips({ codes, selected: ['v'], onChange: vi.fn() });
    expect([...node.querySelectorAll('.ev-chip')].map((b) => b.textContent)).toContain('VP');
  });
  it('keeps focus on the chip that was clicked after it repaints', () => {
    const node = codeChips({ codes, selected: [], onChange: vi.fn() });
    document.body.append(node);
    const first = node.querySelector<HTMLButtonElement>('.ev-chip')!;
    first.focus();
    first.click();
    const now = node.querySelector<HTMLButtonElement>('.ev-chip')!;
    expect(now).not.toBe(first);
    expect(now.getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(now);
    node.remove();
  });
  it('moves focus to the first chip More codes reveals', () => {
    const node = codeChips({ codes, selected: [], onChange: vi.fn(), label: 'Why marks were lost: Analysis' });
    document.body.append(node);
    expect(node.getAttribute('aria-label')).toBe('Why marks were lost: Analysis');
    const more = node.querySelector<HTMLButtonElement>('.ev-chips__more')!;
    more.focus();
    more.click();
    expect((document.activeElement as HTMLElement).textContent).toBe('VP');
    node.remove();
  });
});
