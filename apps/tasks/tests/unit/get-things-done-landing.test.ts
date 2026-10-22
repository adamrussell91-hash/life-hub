// Gear Shifter's landing page against a stubbed session API: the hero, a card per session with
// its medal and meta line, the five sections in route order with every Explore technique once,
// Start from this, and the three-way skills ribbon.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PsSummary } from '../../../../packages/problem-solver/types';
import { toolsForPlanStep } from '../../../../packages/problem-solver/steps.mjs';

const api = vi.hoisted(() => ({
  gs: { list: vi.fn(), create: vi.fn() },
  dm: { list: vi.fn() },
  ps: { list: vi.fn() }
}));

vi.mock('../../src/views/problem-solver/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/views/problem-solver/api')>();
  return {
    ...real,
    gearShifterApi: { ...real.gearShifterApi, list: api.gs.list, create: api.gs.create },
    decisionBookApi: { ...real.decisionBookApi, list: api.dm.list },
    problemSolverApi: { ...real.problemSolverApi, list: api.ps.list }
  };
});

import { renderGearShifterView, unmountGearShifterView } from '../../src/views/get-things-done/view';

const row = (over: Partial<PsSummary>): PsSummary => ({ id: 'a1', title: 'Finish the grant report draft', status: 'active', phase: 'explore', links: [], kind: 'shift', model: 'gear_shifter', tool: 'gt_pomodoro', frame: 3, skills: { analysis: 2 }, main: 'gt_pomodoro', createdAt: '2026-10-21T09:00:00.000Z', updatedAt: '2026-10-21T09:00:00.000Z', ...over } as PsSummary);

beforeEach(() => {
  location.hash = '#/gear-shifter';
  api.gs.list.mockResolvedValue([
    row({}),
    row({ id: 'a2', title: 'Start clearing the garage', phase: 'frame', frame: 1, tool: null, main: null, skills: {} }),
    row({ id: 'a3', title: 'Old one', status: 'archived' })
  ]);
  api.dm.list.mockResolvedValue([row({ id: 'd1', kind: 'decision', skills: { analysis: 1 } })]);
  api.ps.list.mockRejectedValue(new Error('offline'));
});

afterEach(() => {
  unmountGearShifterView();
  vi.clearAllMocks();
  document.body.replaceChildren();
});

async function landing(): Promise<HTMLElement> {
  const canvas = document.createElement('div');
  document.body.append(canvas);
  await renderGearShifterView(canvas);
  return canvas;
}

describe('landing', () => {
  it('shows the hero with the New box and the Quick start card', async () => {
    const page = await landing();
    expect(page.querySelector('.gt-page.gt-scope')).not.toBeNull();
    expect(page.querySelector('.ps-start__title')!.textContent).toBe('What do you need to get moving?');
    expect(page.querySelector('.gt-quick__title')!.textContent).toBe('Quick start');
    expect(page.querySelector('.gt-loom')).not.toBeNull();
  });

  it('lists live sessions with a medal and a meta line', async () => {
    const page = await landing();
    const cards = [...page.querySelectorAll('.gt-prob')];
    expect(cards.map((c) => c.querySelector('.ps-prob__title')!.textContent)).toEqual(['Finish the grant report draft', 'Start clearing the garage']);
    expect(cards[0].querySelector('a')!.getAttribute('href')).toBe('#/gear-shifter?id=a1');
    expect([...cards[0].querySelectorAll('.ps-prob__meta > span')].map((s) => s.textContent)).toEqual(['Exploring', 'Pomodoro Technique', '21/10/26']);
    expect(cards[1].querySelector('.ps-prob__meta')!.textContent).toContain('Question 2 of 3');
    expect(cards[0].querySelector('[data-piece="technique"]')).not.toBeNull();
  });

  it('shows the five sections in route order, every Explore technique once', async () => {
    const page = await landing();
    expect([...page.querySelectorAll('.gt-sect__title')].map((t) => t.textContent)).toEqual([
      'What to do before you do anything', 'Doing things', 'How to get others to do things', 'Doing things differently', 'What to do with the things you have done'
    ]);
    const ids = [...page.querySelectorAll<HTMLElement>('.gt-shelf__tool')].map((item) => item.dataset.tool);
    expect(ids.sort()).toEqual([...toolsForPlanStep('gear_shifter', 'explore')].sort());
    const kanban = page.querySelector('[data-tool="gt_kanban"]')!;
    expect(kanban.textContent).toContain('from Problem Solver');
    expect(page.querySelector('[data-tool="gt_motivation"]')!.textContent).toContain('lens');
  });

  it('Start from this starts the session on that technique', async () => {
    api.gs.create.mockResolvedValue({ id: 'new1' });
    const page = await landing();
    page.querySelector<HTMLButtonElement>('[data-tool="gt_pomodoro"] .gt-shelf__start')!.click();
    expect(page.querySelector('.gt-start__picked')!.textContent).toContain('Starting from The Pomodoro Technique');
    page.querySelector<HTMLTextAreaElement>('.ps-start__input')!.value = 'The grant report will not get written.';
    page.querySelector<HTMLFormElement>('.ps-start')!.requestSubmit();
    await vi.waitFor(() => expect(api.gs.create).toHaveBeenCalledWith({ text: 'The grant report will not get written.', kind: 'shift', startModel: 'gt_pomodoro' }));
    await vi.waitFor(() => expect(location.hash).toBe('#/gear-shifter?id=new1'));
  });

  it('the skills ribbon splits three ways and leaves out a tool it cannot reach', async () => {
    const page = await landing();
    expect([...page.querySelectorAll('.ps-ribbon__key')].map((k) => k.textContent)).toEqual(['Gear Shifter', 'Decision Maker', 'Problem Solver']);
    const analysis = [...page.querySelectorAll('.ps-skills__item')].find((i) => i.textContent!.includes('Analysis'))!;
    expect(analysis.querySelector('.ps-skills__count')!.textContent).toBe('3×');
  });
});
