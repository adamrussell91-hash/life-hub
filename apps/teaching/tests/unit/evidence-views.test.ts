import { describe, expect, it, vi } from 'vitest';
import { dotPlot, flagCards, mixUpList, questionTable, summaryCards, tagRows, tagSwitch } from '@/evidence/views/parts';
import { summary } from '@/evidence/stats';
import type { Flag, TagRow } from '@/evidence/types';

const label = (t: string) => t.slice(t.indexOf(':') + 1);

describe('view parts', () => {
  it('summary cards show percentages and a dash for missing reliability', () => {
    const node = summaryCards(summary([0.5, 0.7]), 2, 3, null, 'Needs 5 attempts.');
    expect(node.textContent).toContain('2/3');
    expect(node.textContent).toContain('60%');
    expect(node.querySelector('[title="Needs 5 attempts."]')?.textContent).toContain('–');
  });
  it('dot plot draws one dot per score and stacks equal scores', () => {
    const svg = dotPlot([0.5, 0.5, 0.9], summary([0.5, 0.5, 0.9]));
    const dots = [...svg.querySelectorAll('circle')];
    expect(dots).toHaveLength(3);
    expect(new Set(dots.map((d) => d.getAttribute('cy'))).size).toBe(2);
  });
  it('tag switch marks the current kind and reports picks', () => {
    const onPick = vi.fn();
    const node = tagSwitch(['tech', 'out'], 'tech', onPick);
    const [tech, out] = [...node.querySelectorAll('button')];
    expect(tech!.getAttribute('aria-pressed')).toBe('true');
    out!.click();
    expect(onPick).toHaveBeenCalledWith('out');
  });
  it('tag rows name bands', () => {
    const row: TagRow = { tag: 'tech:jux', mean: 0.3, full: 0.2, half: 0.2, confidence: 2.4, questions: 3, band: 'weak', groups: { weak: [], developing: [], secure: [] } };
    const node = tagRows([row, { ...row, tag: 'tech:motif', band: 'thin', questions: 1 }], label);
    expect(node.textContent).toContain('Weak');
    expect(node.textContent).toContain('1 question');
  });
  it('flag cards say who and offer dismiss', () => {
    const flag: Flag = { id: 'sure_wrong:tech:jux', type: 'sure_wrong', tag: 'tech:jux', students: ['s1', 's2'] };
    const onDismiss = vi.fn();
    const node = flagCards([flag], { label, who: (ids) => ids.join(', '), onDismiss });
    expect(node.textContent).toContain('Sure but wrong on jux');
    expect(node.textContent).toContain('s1, s2');
    [...node.querySelectorAll('button')].find((b) => b.textContent === 'Dismiss')!.click();
    expect(onDismiss).toHaveBeenCalledWith(flag);
  });
  it('mix-ups only list mistakes two or more students share', () => {
    const node = mixUpList(
      [
        { tag: 'tech:jux', key: 'named:tech:contrast', why: { type: 'named', as: 'tech:contrast', target: 'tech:jux' }, count: 3, students: [] },
        { tag: 'tech:jux', key: 'not_found', why: { type: 'not_found', target: 'tech:jux' }, count: 1, students: [] }
      ],
      label,
      (id) => id
    );
    expect(node.textContent).toContain('jux named as contrast · 3');
    expect(node.textContent).not.toContain('not found');
  });
  it('question table flags too easy and check question', () => {
    const node = questionTable(
      [{ id: 'q1', prompt: 'Find the simile', marks: 1, kind: 'spot_technique', outcomes: [] }, { id: 'q2', prompt: 'Name it', marks: 1, kind: 'quote_technique', outcomes: [] }],
      [{ facility: 0.97, discrimination: 0.05 }, { facility: 0.45, discrimination: -0.1 }],
      true
    );
    expect(node.textContent).toContain('Too easy');
    expect(node.textContent).toContain('Check question');
  });
});
