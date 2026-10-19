// apps/tasks/tests/unit/problem-solver-record-render.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createRecordView, stepRun, stepState } from '../../../../packages/problem-solver/render/record';
import type { PsSession, PsToolRun } from '../../../../packages/problem-solver/types';

const run = (id: string, tool: PsToolRun['tool'], status: PsToolRun['status'], extra: Partial<PsToolRun> = {}): PsToolRun => ({ id, tool, status, nodes: [], edges: [], ...extra });

function session(over: Partial<PsSession> = {}): PsSession {
  return {
    id: 's', title: 'T', revision: 1, kind: 'full', status: 'active', phase: 'devise', frame: {}, model: { id: 'seven_step', reason: '' }, links: [],
    steps: {
      define: { runs: [run('r1', 'five_whys', 'switched', { switchReason: 'Causes branch' }), run('r2', 'problem_tree', 'done'), run('r3', 'smart', 'done')], status: 'done', objection: null },
      analyse: { runs: [], status: 'skipped', objection: 'No causes mapped.' },
      devise: { runs: [run('r4', 'contradiction', 'active')], status: 'open', objection: null }
    },
    learnings: [], pendingLearning: null, turns: [], summary: '', suggestion: null, pendingKeep: null,
    runner: { status: 'idle', mode: 'turn', error: null }, createdAt: 'c', updatedAt: 'u', ...over
  } as PsSession;
}

const state = (view: ReturnType<typeof createRecordView>, step: string) => view.el.querySelector(`[data-step="${step}"]`)!.getAttribute('data-state');

describe('process record', () => {
  it('marks steps done, skipped, current and future', () => {
    const s = session();
    expect(stepState(s, 'define')).toBe('done');
    expect(stepState(s, 'analyse')).toBe('skipped');
    expect(stepState(s, 'devise')).toBe('current');
    expect(stepState(s, 'decide')).toBe('future');
    expect(stepState(session({ phase: 'frame', steps: {} }), 'define')).toBe('future');
    const view = createRecordView();
    view.update(s);
    expect([state(view, 'define'), state(view, 'analyse'), state(view, 'devise'), state(view, 'improve')]).toEqual(['done', 'skipped', 'current', 'future']);
  });

  it('finished sessions show every visited step as done or skipped', () => {
    const s = session({ phase: 'finished', status: 'finished' });
    expect(stepState(s, 'devise')).toBe('done');
    expect(stepState(s, 'analyse')).toBe('skipped');
    expect(stepState(s, 'decide')).toBe('future');
  });

  it('gives each step with runs a filmstrip, switched runs with their reason', () => {
    const view = createRecordView();
    view.update(session());
    const strips = [...view.el.querySelectorAll('.ps-record__strip')].map((el) => el.getAttribute('data-strip'));
    expect(strips).toEqual(['define', 'devise']);
    expect(view.el.querySelector('[data-run="r1"]')!.textContent).toContain('Switched: Causes branch');
  });

  it('opens the last kept run of a step from its box, and any run from its card', () => {
    const open = vi.fn();
    const view = createRecordView();
    view.onOpenStep(open);
    view.update(session());
    expect(stepRun(session(), 'define')!.id).toBe('r3');
    view.el.querySelector<HTMLButtonElement>('[data-step="define"] button')!.click();
    expect(open).toHaveBeenLastCalledWith('r3', view.el.querySelector('[data-step="define"]'));
    view.el.querySelector<HTMLButtonElement>('[data-run="r1"] button')!.click();
    expect(open).toHaveBeenLastCalledWith('r1', view.el.querySelector('[data-run="r1"]'));
    expect(view.el.querySelector('[data-step="analyse"] button')).toBeNull();
    expect(view.anchor('r3', 'step')).toBe(view.el.querySelector('[data-step="define"]'));
    expect(view.anchor('r4', 'step')).toBe(view.el.querySelector('[data-step="devise"]'));
  });

  it('shows extra steps under the diagram for polya and triz', () => {
    const view = createRecordView();
    view.update(session({ model: { id: 'polya', reason: '' }, phase: 'identify', steps: { identify: { runs: [], status: 'open', objection: null } } }));
    expect([...view.el.querySelectorAll('.ps-record__extras [data-step]')].map((el) => el.getAttribute('data-step'))).toEqual(['document']);
    view.update(session({ model: { id: 'triz', reason: '' }, phase: 'specific_problem', steps: { specific_problem: { runs: [], status: 'open', objection: null } } }));
    expect([...view.el.querySelectorAll('.ps-record__extras [data-step]')].map((el) => el.getAttribute('data-step'))).toEqual(['implement', 'improve', 'document']);
  });

  it('shows a skipped step\'s objection as its tooltip', () => {
    const view = createRecordView();
    view.update(session());
    expect(view.el.querySelector('[data-step="analyse"] .ps-record__box')!.getAttribute('title')).toBe('Coach objected: No causes mapped.');
  });
});
