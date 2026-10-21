import { beforeEach, describe, expect, it } from 'vitest';
import { reasoningSteps, reasoningWrite, LOGIC_CARDS } from '@/blocks/reasoning/content';
import { renderReasoningChart } from '@/blocks/reasoning/chart';
import type { LensLevel } from '@/blocks/lenses/types';

const ids = (logic: Parameters<typeof reasoningSteps>[0], level: LensLevel) => reasoningSteps(logic, level).map((s) => s.id);
beforeEach(() => { document.body.replaceChildren(); localStorage.clear(); });

describe('Reasoning steps', () => {
  it('walks each logic type through its own steps at every level', () => {
    expect(ids('inductive', 'support')).toEqual(['e1', 'e2', 'pt', 'so']);
    expect(ids('inductive', 'core')).toEqual(['e1', 'e2', 'e3', 'pt', 'so']);
    expect(ids('inductive', 'extend')).toEqual(['e1', 'e2', 'e3', 'pt', 'so', 'br']);
    expect(ids('abductive', 'support')).toEqual(['c1', 'c2', 'm1', 'be']);
    expect(ids('abductive', 'core')).toEqual(['c1', 'c2', 'c3', 'm1', 'm2', 'ts', 'be']);
    expect(ids('abductive', 'extend')).toEqual(['c1', 'c2', 'c3', 'm1', 'm2', 'ts', 'be', 'wr']);
    expect(ids('deductive', 'support')).toEqual(['r', 'cs', 'sm']);
    expect(ids('deductive', 'core')).toEqual(['r', 'cs', 'sm']);
    expect(ids('deductive', 'extend')).toEqual(['r', 'cs', 'sm', 'hp']);
  });
  it('chains All three in proof order with prefixed ids', () => {
    const chain = ids('all_three', 'core');
    expect(chain[0]).toBe('inductive.e1');
    expect(chain.indexOf('abductive.c1')).toBeGreaterThan(chain.indexOf('inductive.so'));
    expect(chain.indexOf('deductive.r')).toBeGreaterThan(chain.indexOf('abductive.be'));
  });
  it('gives every Support step an example and every writing step a starter, in plain words', () => {
    for (const logic of ['inductive', 'abductive', 'deductive'] as const) {
      for (const step of reasoningSteps(logic, 'support')) {
        expect(step.example, step.id).toMatch(/\w/);
        if (step.kind === 'text') expect(step.starter, step.id).toContain('___');
        expect(step.title).not.toMatch(/\bcase\b/i);
      }
    }
  });
  it('only checks steps that exist at that level', () => {
    for (const level of ['support', 'core', 'extend'] as const) {
      const steps = reasoningSteps('inductive', level);
      const pattern = steps.find((s) => s.id === 'pt')!;
      expect(pattern.checks).toEqual(steps.filter((s) => s.id.startsWith('e')).map((s) => s.id));
    }
  });
  it('gives a frame at Support and Core and a challenge at Extend', () => {
    for (const logic of ['inductive', 'abductive', 'deductive'] as const) {
      expect(reasoningWrite(logic, 'support').frame).toContain('___');
      expect(reasoningWrite(logic, 'core').frame).toContain('___');
      expect(reasoningWrite(logic, 'extend').frame).toBeUndefined();
      expect(reasoningWrite(logic, 'extend').challenge).toMatch(/sentences/);
    }
    expect(reasoningWrite('inductive', 'core').checklist).toContain('Uses probably, likely or possibly');
  });
  it('offers three cards from analytical to creative', () => {
    expect(LOGIC_CARDS.map((c) => c.value)).toEqual(['deductive', 'inductive', 'abductive']);
  });
});

describe('Reasoning chart', () => {
  const nodes = (chart: HTMLElement) => [...chart.querySelectorAll<HTMLElement>('.block-reasoning-chart__node')];
  it('draws one node per writing step, in columns, with the student’s words', () => {
    const steps = reasoningSteps('inductive', 'core');
    const chart = renderReasoningChart({ logic: 'inductive', steps, answers: { e1: 'Rue dies.' }, current: 'e2' });
    expect(chart.dataset.logic).toBe('inductive');
    const cols = [...chart.querySelectorAll('.block-reasoning-chart__col')].map((c) => c.querySelectorAll('.block-reasoning-chart__node').length);
    expect(cols).toEqual([3, 1, 1]);
    expect(nodes(chart)[0]!.classList.contains('block-reasoning-chart__node--done')).toBe(true);
    expect(nodes(chart)[0]!.textContent).toContain('Rue dies.');
    expect(nodes(chart)[1]!.classList.contains('block-reasoning-chart__node--now')).toBe(true);
    expect(nodes(chart)[2]!.classList.contains('block-reasoning-chart__node--ghost')).toBe(true);
    expect(chart.textContent).toContain('Specific');
  });
  it('marks examples the pattern fits', () => {
    const steps = reasoningSteps('inductive', 'support');
    const chart = renderReasoningChart({ logic: 'inductive', steps, answers: { e1: 'a', e2: 'b' }, fits: new Set(['e2']) });
    expect(nodes(chart)[1]!.textContent).toContain('✓ fits');
    expect(nodes(chart)[0]!.textContent).not.toContain('✓ fits');
  });
  it('links every clue to every maybe, and skips the test step', () => {
    const steps = reasoningSteps('abductive', 'core');
    const chart = renderReasoningChart({ logic: 'abductive', steps, answers: {} });
    expect(nodes(chart)).toHaveLength(6);
    const firstLinks = chart.querySelector('.block-reasoning-chart__links')!;
    expect(firstLinks.querySelectorAll('path')).toHaveLength(6);
  });
  it('prints empty nodes with ruled lines', () => {
    const steps = reasoningSteps('deductive', 'core');
    const chart = renderReasoningChart({ logic: 'deductive', steps, answers: { r: 'kept' }, print: true });
    expect(chart.textContent).not.toContain('kept');
    expect(chart.querySelectorAll('.block-reasoning-chart__line').length).toBeGreaterThan(0);
  });
});
