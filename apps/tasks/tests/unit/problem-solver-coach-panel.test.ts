// apps/tasks/tests/unit/problem-solver-coach-panel.test.ts
import { describe, expect, it } from 'vitest';
import { renderCoachPanel } from '@/views/problem-solver/coach-panel';
import type { PsSession } from '../../../../packages/problem-solver/types';

function session(extra: Partial<PsSession> = {}): PsSession {
  return {
    id: 's1', title: 'Late rota', revision: 3, kind: 'full', status: 'active', phase: 'improve',
    frame: { goal: 'g', whatIsTrue: 't', whatCanBeDone: 'c' }, model: { id: 'seven_step', reason: '' }, links: [],
    steps: {
      define: { runs: [], status: 'done', objection: null },
      improve: { runs: [], status: 'open', objection: null }
    },
    learnings: [], pendingLearning: null, turns: [], summary: '', suggestion: null, pendingKeep: null,
    runner: { status: 'idle', mode: 'turn', error: null }, createdAt: '', updatedAt: '',
    proposedTasks: [], reviewProposal: null, reviewTaskId: null, reviewState: null, taskSnapshot: null, detour: null,
    ...extra
  } as PsSession;
}

const noop = { onSay: () => undefined, onAction: () => undefined };

describe('coach panel: Improve', () => {
  it('renders a reopen suggestion with its own title and buttons', () => {
    const panel = renderCoachPanel(session({ suggestion: { kind: 'reopen_step', step: 'define', reason: 'The goal itself was wrong.' } }), noop);
    expect(panel.querySelector('.ps-suggestion__title')!.textContent).toBe('Reopen: Define');
    expect(panel.querySelector('.ps-suggestion__reason')!.textContent).toBe('The goal itself was wrong.');
    const accept = panel.querySelector<HTMLButtonElement>('.ps-suggestion [data-action="accept_suggestion"]')!;
    expect(accept.textContent).toBe('Reopen it');
    expect(panel.querySelector('.ps-suggestion [data-action="dismiss_suggestion"]')!.textContent).toBe('Not now');
  });

  it('labels Move on from a reopened step back to Improve', () => {
    const panel = renderCoachPanel(session({ phase: 'define', detour: { from: 'improve', to: 'define', reason: 'r', at: '' } }), noop);
    expect(panel.querySelector('[data-action="move_on"]')!.textContent).toBe('Move on to Improve');
  });

  it('labels Move on to Document while Improve waits', () => {
    const panel = renderCoachPanel(session({ reviewState: { status: 'waiting', due: '2026-11-02', returnTo: null, startedAt: null }, steps: { improve: { runs: [], status: 'waiting', objection: null } } }), noop);
    expect(panel.querySelector('[data-action="move_on"]')!.textContent).toBe('Move on to Document');
  });

  it('labels Move on from a late review back to where it began', () => {
    const panel = renderCoachPanel(session({ reviewState: { status: 'reviewing', due: null, returnTo: 'finished', startedAt: '' } }), noop);
    expect(panel.querySelector('[data-action="move_on"]')!.textContent).toBe('Finish');
  });
});
