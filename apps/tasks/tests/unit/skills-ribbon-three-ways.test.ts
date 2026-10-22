// All three skills ribbons show all three tools (Adam, 22 Oct): Problem Solver's and Decision
// Maker's landings give Gear Shifter its share, as Gear Shifter's landing gives them theirs. A
// tool that cannot be reached leaves its share out. Against a stubbed session API.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PsSummary } from '../../../../packages/problem-solver/types';

const api = vi.hoisted(() => ({ gs: { list: vi.fn() }, dm: { list: vi.fn() }, ps: { list: vi.fn() } }));

vi.mock('../../src/views/problem-solver/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/views/problem-solver/api')>();
  return {
    ...real,
    gearShifterApi: { ...real.gearShifterApi, list: api.gs.list },
    decisionBookApi: { ...real.decisionBookApi, list: api.dm.list },
    problemSolverApi: { ...real.problemSolverApi, list: api.ps.list }
  };
});

import { renderProblemSolverView, unmountProblemSolverView } from '../../src/views/problem-solver/view';
import { renderDecisionMakerView, unmountDecisionMakerView } from '../../src/views/decision-book/view';

const row = (id: string, kind: string, skills: Record<string, number>): PsSummary => ({ id, title: `Session ${id}`, status: 'active', phase: 'frame', links: [], kind, model: null, tool: null, frame: 1, skills, createdAt: '2026-10-21T09:00:00.000Z', updatedAt: '2026-10-21T09:00:00.000Z' } as PsSummary);

beforeEach(() => {
  api.ps.list.mockResolvedValue([row('p1', 'full', { analysis: 1 })]);
  api.dm.list.mockResolvedValue([row('d1', 'decision', { analysis: 2 })]);
  api.gs.list.mockResolvedValue([row('g1', 'shift', { analysis: 4 })]);
});

afterEach(() => {
  unmountProblemSolverView();
  unmountDecisionMakerView();
  vi.clearAllMocks();
  document.body.replaceChildren();
});

async function landing(render: (canvas: HTMLElement) => Promise<void>, hash: string): Promise<HTMLElement> {
  location.hash = hash;
  const canvas = document.createElement('div');
  document.body.append(canvas);
  await render(canvas);
  return canvas;
}

const keys = (page: HTMLElement) => [...page.querySelectorAll('.ps-ribbon__key')].map((k) => k.textContent);
const analysis = (page: HTMLElement) => [...page.querySelectorAll('.ps-skills__item')].find((i) => i.textContent!.includes('Analysis'))!.querySelector('.ps-skills__count')!.textContent;
const aside = (page: HTMLElement) => [...page.querySelectorAll('section')].find((s) => s.textContent!.includes('Thinking skills you have used'))!.textContent;

describe('three-way skills ribbons', () => {
  it('Problem Solver’s landing shows all three tools', async () => {
    const page = await landing(renderProblemSolverView, '#/problem-solver');
    expect(keys(page)).toEqual(['Problem Solver', 'Decision Maker', 'Gear Shifter']);
    expect(analysis(page)).toBe('7×');
    expect(aside(page)).toContain('One tally across all three tools.');
  });

  it('Decision Maker’s landing shows all three tools', async () => {
    const page = await landing(renderDecisionMakerView, '#/decision-maker');
    expect(keys(page)).toEqual(['Decision Maker', 'Problem Solver', 'Gear Shifter']);
    expect(analysis(page)).toBe('7×');
    expect(aside(page)).toContain('One tally across all three tools.');
  });

  it('a tool that cannot be reached leaves its share out', async () => {
    api.gs.list.mockRejectedValue(new Error('offline'));
    const page = await landing(renderProblemSolverView, '#/problem-solver');
    expect(analysis(page)).toBe('3×');
    expect(page.querySelector('.ps-prob')).not.toBeNull();
  });
});
