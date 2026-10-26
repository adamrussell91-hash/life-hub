import { describe, expect, it, vi } from 'vitest';

const loaders = vi.hoisted(() => ({ elements: vi.fn(), skills: vi.fn(), codes: vi.fn() }));
vi.mock('@/blocks/literary-elements', () => ({ loadLiteraryElements: loaders.elements }));
vi.mock('@/skills/api', () => ({ loadSkills: loaders.skills }));
vi.mock('@/blocks/feedback-codes', () => ({ loadFeedbackCodes: loaders.codes }));

import { flagCards, mixUpList, summaryCards, tagRows, tagSwitch } from '@/evidence/views/parts';
import { attemptStrips, newResultsUi, questionRows, scoreHistogram, scoreRing } from '@/evidence/views/results';
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
  it('tag rows give long names a tooltip so they can be cut short', () => {
    const row: TagRow = { tag: 'tech:Personification', mean: 0.3, full: 0.2, half: 0.2, confidence: null, questions: 2, band: 'weak', groups: { weak: [], developing: [], secure: [] } };
    expect(tagRows([row], label).querySelector<HTMLElement>('.ev-tag__name')!.title).toBe('Personification');
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
  it('question rows show the share right, flag too easy and check question, and open to the detail', () => {
    const qs = [{ id: 'q1', prompt: 'Find the simile', marks: 1, kind: 'spot_technique', outcomes: [] }, { id: 'q2', prompt: 'Name it', marks: 1, kind: 'quote_technique', outcomes: [] }];
    const ui = newResultsUi();
    const node = questionRows(qs, [{ facility: 0.97, discrimination: 0.05 }, { facility: 0.45, discrimination: -0.1 }], true, ui, (id) => {
      const d = document.createElement('p');
      d.textContent = `detail ${id}`;
      return d;
    });
    expect([...node.querySelectorAll('.ev-qrow__pct')].map((n) => n.textContent)).toEqual(['97%', '45%']);
    expect(node.textContent).toContain('Too easy');
    expect(node.textContent).toContain('Check question');
    expect(node.textContent).not.toContain('detail q2');
    node.querySelectorAll<HTMLButtonElement>('.ev-qrow__head')[1]!.click();
    expect(node.textContent).toContain('detail q2');
    expect(node.textContent).toContain('Discrimination -0.10');
    expect(ui.openQuestions.has('q2')).toBe(true);
  });
  it('question rows list the hardest first on request', () => {
    const qs = [{ id: 'q1', prompt: 'Easy', marks: 1, kind: 'x', outcomes: [] }, { id: 'q2', prompt: 'Hard', marks: 1, kind: 'x', outcomes: [] }];
    const node = questionRows(qs, [{ facility: 0.9, discrimination: null }, { facility: 0.2, discrimination: null }], false, newResultsUi());
    node.querySelector<HTMLButtonElement>('.ev-switch__pill')!.click();
    expect([...node.querySelectorAll('.ev-qrow__prompt')].map((n) => n.textContent)).toEqual(['Hard', 'Easy']);
    expect([...node.querySelectorAll('.ev-qrow__n')].map((n) => n.textContent)).toEqual(['2', '1']);
  });
  it('score ring shows the average and the histogram bins every score', () => {
    expect(scoreRing(0.69).textContent).toContain('69%');
    expect(scoreRing(null).textContent).toContain('–');
    const shares = [0.1, 0.15, 0.55, 1];
    const fig = scoreHistogram(shares, summary(shares));
    expect([...fig.querySelectorAll('rect.ev-hist__bar')]).toHaveLength(3);
    expect([...fig.querySelectorAll('.ev-hist__n')].map((n) => n.textContent)).toEqual(['2', '1', '1']);
    expect([...fig.querySelectorAll('.ev-dots__tick')].map((t) => t.textContent)).toEqual(['0%', '50%', '100%']);
  });
  it('attempt strips give one square per question', () => {
    const p = {
      questions: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }, { id: 'q4' }],
      attempts: [{ attempt_id: 'a1', rows: [{ id: 'q1', awarded: 2, max: 2 }, { id: 'q2', awarded: 1, max: 2 }, { id: 'q3', awarded: 0, max: 2 }, { id: 'q4', awarded: null, max: 2 }] }]
    } as unknown as Parameters<typeof attemptStrips>[0];
    const { head, strip } = attemptStrips(p);
    expect(head.children).toHaveLength(4);
    expect([...strip('a1')!.children].map((c) => (c as HTMLElement).dataset.state)).toEqual(['full', 'part', 'none', 'wait']);
    expect(strip('missing')).toBeNull();
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
