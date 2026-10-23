import { describe, expect, it, vi } from 'vitest';

const loaders = vi.hoisted(() => ({ elements: vi.fn(), skills: vi.fn(), codes: vi.fn() }));
vi.mock('@/blocks/literary-elements', () => ({ loadLiteraryElements: loaders.elements }));
vi.mock('@/skills/api', () => ({ loadSkills: loaders.skills }));
vi.mock('@/blocks/feedback-codes', () => ({ loadFeedbackCodes: loaders.codes }));

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
  it('tag switch keeps focus on the pressed pill when the pick redraws it', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const draw = (kind: 'tech' | 'out'): void => {
      const head = document.createElement('div');
      head.append(tagSwitch(['tech', 'out'], kind, draw));
      host.replaceChildren(head);
    };
    draw('tech');
    const out = host.querySelectorAll<HTMLButtonElement>('button')[1]!;
    out.focus();
    out.click();
    expect(out.isConnected).toBe(false);
    const now = document.activeElement as HTMLElement;
    expect(host.contains(now)).toBe(true);
    expect(now.textContent).toBe(out.textContent);
    expect(now.getAttribute('aria-pressed')).toBe('true');
    host.remove();
  });
  it('question table drops the discrimination column when it is not shown', () => {
    const qs = [{ id: 'q1', prompt: 'Find it', marks: 1, kind: 'spot_technique', outcomes: [] }] as Parameters<typeof questionTable>[0];
    const hidden = questionTable(qs, [{ facility: 0.5, discrimination: 0.3 }], false);
    expect(hidden.querySelectorAll('th')).toHaveLength(3);
    expect(hidden.textContent).not.toContain('Discrimination');
    expect(hidden.querySelector('tr:last-child')!.querySelectorAll('td')).toHaveLength(3);
    const shown = questionTable(qs, [{ facility: 0.5, discrimination: 0.3 }], true);
    expect([...shown.querySelectorAll('th')].map((t) => t.textContent)).toEqual(['Question', 'Right', 'Discrimination', 'Note']);
    expect(shown.textContent).toContain('0.30');
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
  it('dot plot keeps tall stacks inside the viewBox', () => {
    const shares = Array(20).fill(0.5);
    const svg = dotPlot(shares, summary(shares));
    const [, , , h] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    for (const c of svg.querySelectorAll('circle')) {
      const cy = Number(c.getAttribute('cy'));
      expect(cy).toBeGreaterThanOrEqual(0);
      expect(cy).toBeLessThanOrEqual(h!);
    }
  });
  it('dismiss and follow-up buttons name their flag', () => {
    const flag: Flag = { id: 'sure_wrong:tech:jux', type: 'sure_wrong', tag: 'tech:jux', students: [] };
    const node = flagCards([flag], { label, who: () => '', onDismiss: vi.fn(), onFollowUp: vi.fn() });
    const dismiss = [...node.querySelectorAll('button')].find((b) => b.textContent === 'Dismiss')!;
    expect(dismiss.getAttribute('aria-label')).toBe('Dismiss: Sure but wrong on jux');
  });
  it('explains an unavailable reliability on the page', () => {
    expect(summaryCards(summary([0.5]), 1, 1, null, 'Needs 5 attempts.').querySelector('.ev-card__note')?.textContent).toBe('Needs 5 attempts.');
  });
  it('context retries after a failed load and then keeps the result', async () => {
    loaders.elements.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ marker: 'table' });
    loaders.skills.mockResolvedValue({ marker: 'skills' });
    loaders.codes.mockResolvedValue([{ id: 'c1', code: 'A1', label: 'Thesis' }]);
    const { loadInsightContext, codeLabel } = await import('@/evidence/context');
    expect((await loadInsightContext()).table).toBeNull();
    const ok = await loadInsightContext();
    expect(ok.table).toEqual({ marker: 'table' });
    expect(codeLabel('c1', ok.codes)).toBe('A1 Thesis');
    await loadInsightContext();
    expect(loaders.elements).toHaveBeenCalledTimes(2);
  });
});
