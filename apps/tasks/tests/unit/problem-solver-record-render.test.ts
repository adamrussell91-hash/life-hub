import { describe, expect, it, vi } from 'vitest';
import { createRecordView, defineRun, stepState } from '../../../../packages/problem-solver/render/record';
import type { PsSession, PsToolRun } from '../../../../packages/problem-solver/types';

const run = (id: string, tool: PsToolRun['tool'], status: PsToolRun['status'], extra: Partial<PsToolRun> = {}): PsToolRun => ({ id, tool, status, nodes: [], edges: [], ...extra });

function session(extra: Partial<PsSession> = {}): PsSession {
  return {
    id: 's', title: 'T', revision: 1, status: 'defined', phase: 'defined', frame: {}, model: { id: 'seven_step', reason: '' }, links: [],
    define: { runs: [run('r1', 'five_whys', 'switched', { switchReason: 'Causes branch' }), run('r2', 'problem_tree', 'done'), run('r3', 'smart', 'done')], finishedEarly: false, exitObjection: null },
    turns: [], summary: '', suggestion: null, pendingKeep: null, runner: { status: 'idle', mode: 'turn', error: null }, createdAt: '', updatedAt: '', ...extra
  };
}

const state = (view: { el: HTMLElement }, step: string) => view.el.querySelector(`[data-step="${step}"]`)!.getAttribute('data-state');

describe('record view', () => {
  it('marks define done once defined, current during define, and the rest ahead', () => {
    expect(stepState(session(), 'define')).toBe('done');
    expect(stepState(session({ phase: 'define' }), 'define')).toBe('current');
    expect(stepState(session({ phase: 'frame' }), 'define')).toBe('future');
    expect(stepState(session(), 'analyse')).toBe('future');
    const view = createRecordView();
    view.update(session());
    expect(state(view, 'define')).toBe('done');
    expect(state(view, 'improve')).toBe('future');
    expect(view.el.querySelectorAll('[data-step]').length).toBe(7);
  });

  it('draws each model with its own steps', () => {
    const polya = createRecordView();
    polya.update(session({ model: { id: 'polya', reason: '' }, phase: 'define' }));
    expect([...polya.el.querySelectorAll('[data-step]')].map((n) => n.getAttribute('data-step'))).toEqual(['identify', 'devise', 'implement', 'evaluate']);
    expect(state(polya, 'identify')).toBe('current');
    expect(polya.el.textContent).toContain('Solution fails');
    const triz = createRecordView();
    triz.update(session({ model: { id: 'triz', reason: '' } }));
    expect(state(triz, 'specific_problem')).toBe('done');
    expect(triz.el.textContent).toContain('Contradiction matrix');
  });

  it('lists the whole define chain, switched runs with their reason', () => {
    const view = createRecordView();
    view.update(session());
    const cards = [...view.el.querySelectorAll('.ps-record__card')];
    expect(cards.map((c) => c.getAttribute('data-run'))).toEqual(['r1', 'r2', 'r3']);
    expect(cards[0]!.classList.contains('is-switched')).toBe(true);
    expect(cards[0]!.textContent).toContain('Switched: Causes branch');
    expect(cards[1]!.querySelector('.ps-emblem svg')).not.toBeNull();
  });

  it('opens the last kept run from the define step and any run from its card', () => {
    const view = createRecordView();
    const open = vi.fn();
    view.onOpenStep(open);
    view.update(session());
    expect(defineRun(session())!.id).toBe('r3');
    view.el.querySelector<HTMLButtonElement>('[data-step="define"] button')!.click();
    expect(open).toHaveBeenLastCalledWith('r3', view.el.querySelector('[data-step="define"]'));
    view.el.querySelector<HTMLButtonElement>('[data-run="r1"] button')!.click();
    expect(open).toHaveBeenLastCalledWith('r1', view.el.querySelector('[data-run="r1"]'));
    expect(view.anchor('r1', 'film')).toBe(view.el.querySelector('[data-run="r1"]'));
    expect(view.anchor('r3', 'step')).toBe(view.el.querySelector('[data-step="define"]'));
  });

  it('keeps later steps as plain boxes, not buttons', () => {
    const view = createRecordView();
    view.update(session());
    expect(view.el.querySelector('[data-step="analyse"] button')).toBeNull();
  });
});
