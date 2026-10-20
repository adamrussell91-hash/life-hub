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

  it('marks a waiting step, and the paused step of a detour or a late review, as waiting', () => {
    const waiting = session({ phase: 'improve', steps: { ...session().steps, improve: { runs: [], status: 'waiting', objection: null } } });
    expect(stepState(waiting, 'improve')).toBe('current');
    expect(stepState(session({ steps: { ...session().steps, decide: { runs: [], status: 'waiting', objection: null } } }), 'decide')).toBe('waiting');
    const detour = session({ phase: 'define', detour: { from: 'improve', to: 'define', reason: 'Wrong problem', at: 'a' }, steps: { ...session().steps, improve: { runs: [], status: 'open', objection: null } } });
    expect(stepState(detour, 'improve')).toBe('waiting');
    expect(stepState(detour, 'define')).toBe('current');
    expect(stepState(detour, 'analyse')).toBe('skipped');
    const review = session({ phase: 'improve', reviewState: { status: 'reviewing', due: null, returnTo: 'devise', startedAt: 'a' } });
    expect(stepState(review, 'devise')).toBe('waiting');
    expect(stepState(session({ phase: 'improve', reviewState: { status: 'reviewing', due: null, returnTo: 'finished', startedAt: 'a' } }), 'devise')).toBe('future');
  });

  it('keeps the stored state of steps after the current one during a detour', () => {
    const steps = { ...session().steps, decide: { runs: [], status: 'done' as const, objection: null }, implement: { runs: [], status: 'skipped' as const, objection: null } };
    const detour = session({ phase: 'define', detour: { from: 'improve', to: 'define', reason: 'r', at: 'a' }, steps });
    expect(stepState(detour, 'decide')).toBe('done');
    expect(stepState(detour, 'implement')).toBe('skipped');
    const view = createRecordView();
    view.update(session({ phase: 'define', detour: { from: 'devise', to: 'define', reason: 'r', at: 'a' }, steps }));
    expect(state(view, 'devise')).toBe('waiting');
    expect(view.el.querySelector('[data-step="devise"] button')!.getAttribute('aria-label')).toContain('Waiting');
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
    const step = view.el.querySelector('[data-step="analyse"]')!;
    const box = step.querySelector('.ps-record__box')!;
    expect(box.getAttribute('title')).toBe('Coach objected: No causes mapped.');
    expect(box.querySelector('.ps-record__objection')!.textContent).toBe('Coach objected: No causes mapped.');
    expect(box.hasAttribute('aria-label')).toBe(false);
    expect(step.getAttribute('aria-label')).toBe('Analyse: Problem analysis. Skipped. Coach objected: No causes mapped.');
  });

  it('repaints when a run changes tool, and indents extras and strips to the diagram column', () => {
    const view = createRecordView();
    const s = session();
    view.update(s);
    expect(view.el.style.getPropertyValue('--ps-record-inset')).toBe((10 / 360).toFixed(4));
    const swapped = { ...s, steps: { ...s.steps, devise: { ...s.steps.devise!, runs: [run('r4', 'smart', 'active')] } } } as PsSession;
    view.update(swapped);
    expect(view.el.querySelector('[data-run="r4"]')!.textContent).toContain('SMART');
    view.update(session({ model: { id: 'polya', reason: '' }, phase: 'identify', steps: {} }));
    expect(view.el.style.getPropertyValue('--ps-record-inset')).toBe((60 / 360).toFixed(4));
  });
});
