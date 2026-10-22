// Gear Shifter's client: the paths Problem Solver's shared components gained for it (the task
// source, the Gear Shifter chip, the three-way skills ribbon), then its decor, canvas, record
// blocks and view helpers as later tasks add them.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TASK_PROPERTY_CONFIG } from '../../src/domain/task-properties-defaults';
import { gearShifterChips } from '../../src/views/problem-solver/link-chips';
import { skillsRibbon } from '../../src/views/problem-solver/skills-ribbon';
import type { PsSummary } from '../../../../packages/problem-solver/types';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const row = (skills: Record<string, number>) => ({ skills }) as unknown as PsSummary;

describe('shared components, Gear Shifter paths', () => {
  it('Tasks knows the gear_shifter source', () => {
    expect(DEFAULT_TASK_PROPERTY_CONFIG.sources.map((s) => s.id)).toContain('gear_shifter');
  });

  it('a Gear Shifter chip opens the session, a review chip at Review', async () => {
    const linked = vi.fn().mockResolvedValue([{ id: 'g1', title: 'Grant report', phase: 'review', model: 'gear_shifter', role: 'review' }]);
    const host = gearShifterChips({ kind: 'project', id: 'p1' }, { linked });
    await vi.waitFor(() => expect(host.querySelector('a')).not.toBeNull());
    expect(linked).toHaveBeenCalledWith('project:p1');
    expect(host.querySelector('a')!.getAttribute('href')).toBe('#/gear-shifter?id=g1&step=review');
    expect(host.querySelector('a')!.textContent).toBe('Review in Gear Shifter: Grant report');
    expect(host.querySelector('a')!.classList.contains('ps-linkchip--gt')).toBe(true);
  });

  it('the skills ribbon splits three ways, each other tool in its own colour', () => {
    const ribbon = skillsRibbon(
      { name: 'Gear Shifter', sessions: [row({ analysis: 2 })] },
      [{ name: 'Decision Maker', sessions: [row({ analysis: 1 })], colour: '#2a3340' }, { name: 'Problem Solver', sessions: [row({ analysis: 1, learning: 4 })] }],
      () => 'var(--gt-blue)'
    );
    expect([...ribbon.querySelectorAll('.ps-ribbon__key')].map((k) => k.textContent)).toEqual(['Gear Shifter', 'Decision Maker', 'Problem Solver']);
    const analysis = [...ribbon.querySelectorAll('.ps-skills__item')].find((i) => i.textContent!.includes('Analysis'))!;
    expect(analysis.querySelector('.ps-skills__count')!.textContent).toBe('4×');
    const shares = [...analysis.querySelectorAll<HTMLElement>('.ps-skills__bar i')].map((i) => i.style.getPropertyValue('--w'));
    expect(shares).toEqual(['50%', '25%', '25%']);
    expect(analysis.querySelectorAll<HTMLElement>('.ps-skills__other')[0].style.getPropertyValue('--c')).toBe('#2a3340');
    expect(analysis.getAttribute('title')).toContain('Gear Shifter: 2. Decision Maker: 1. Problem Solver: 1.');
  });

  it('with one other tool the ribbon draws as before', () => {
    const ribbon = skillsRibbon({ name: 'Decision Maker', sessions: [row({ analysis: 3 })] }, { name: 'Problem Solver', sessions: [row({ analysis: 1 })] }, () => 'var(--dm-ink)');
    const analysis = [...ribbon.querySelectorAll('.ps-skills__item')].find((i) => i.textContent!.includes('Analysis'))!;
    expect(analysis.querySelectorAll('.ps-skills__bar i')).toHaveLength(2);
    expect((analysis.querySelector('.ps-skills__other') as HTMLElement).style.getPropertyValue('--c')).toBe('');
  });
});
