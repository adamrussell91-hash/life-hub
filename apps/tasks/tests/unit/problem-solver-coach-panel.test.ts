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

describe('coach panel: Document', () => {
  const doc = (text: string) => session({
    phase: 'document',
    steps: { document: { runs: [{ id: 'r5', tool: 'five_cs', status: 'active', nodes: [], edges: [] }], status: 'open', objection: null } },
    pendingKeep: { slot: 'correspond', text, objection: 'Only you would know what KR means.' }
  } as Partial<PsSession>);

  it('a name the naming rules refuse gets no Keep it anyway, only a short note', () => {
    const panel = renderCoachPanel(doc('KR stuff'), noop);
    expect(panel.querySelector('[data-action="keep_anyway"]')).toBeNull();
    expect(panel.querySelector('.ps-coach__status--keep')!.textContent).toBe("This name breaks a naming rule, so it can't be kept as it is.");
  });

  it('a name that passes the strict rules can still be kept anyway', () => {
    const panel = renderCoachPanel(doc('KR stuff 20261020 v1 Final'), noop);
    expect(panel.querySelector('[data-action="keep_anyway"]')).not.toBeNull();
    expect(panel.querySelector('.ps-coach__status--keep')).toBeNull();
  });
});

describe('coach panel: Lightning', () => {
  const run = (extra: Partial<PsSession> = {}) => session({
    kind: 'lightning', phase: 'lightning', model: null, steps: {},
    lightning: { path: [{ node: 'start', round: 1, at: '' }], rounds: 1, finishedAt: null, escalatedTo: null },
    ...extra
  } as Partial<PsSession>);

  it('the escalate card posts escalate, not accept_suggestion, and Not now dismisses', () => {
    const actions: string[] = [];
    const panel = renderCoachPanel(run({ suggestion: { kind: 'escalate', reason: 'Several people are involved.' } }), { onSay: () => undefined, onAction: (action) => actions.push(action) });
    expect(panel.querySelector('.ps-suggestion__title')!.textContent).toBe('This needs the full process');
    expect(panel.querySelector('.ps-suggestion__reason')!.textContent).toBe('Several people are involved.');
    expect(panel.querySelector('[data-action="accept_suggestion"]')).toBeNull();
    const start = panel.querySelector<HTMLButtonElement>('.ps-suggestion [data-action="escalate"]')!;
    expect(start.textContent).toBe('Start the full process');
    const later = panel.querySelector<HTMLButtonElement>('.ps-suggestion [data-action="dismiss_suggestion"]')!;
    expect(later.textContent).toBe('Not now');
    start.click();
    later.click();
    expect(actions).toEqual(['escalate', 'dismiss_suggestion']);
  });

  it('shows no step controls and no step label on a run', () => {
    const panel = renderCoachPanel(run({ steps: { define: { runs: [], status: 'open', objection: null } }, phase: 'define', model: { id: 'seven_step', reason: '' } }), noop);
    expect(panel.querySelector('[data-action="move_on"]')).toBeNull();
    expect(panel.querySelector('.ps-composer__now')!.textContent).toBe('');
    expect((panel.querySelector('textarea') as HTMLTextAreaElement).disabled).toBe(false);
  });

  it('a finished run takes no more replies', () => {
    const panel = renderCoachPanel(run({ status: 'finished' }), noop);
    const input = panel.querySelector('textarea') as HTMLTextAreaElement;
    expect(input.disabled).toBe(true);
    expect(input.placeholder).toBe('This run is done.');
    expect((panel.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
  });
});
