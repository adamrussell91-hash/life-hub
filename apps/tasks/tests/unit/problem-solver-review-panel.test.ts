// apps/tasks/tests/unit/problem-solver-review-panel.test.ts
import { describe, expect, it, vi } from 'vitest';
import { mountReviewPanel, reviewBanner } from '@/views/problem-solver/review-panel';
import type { PsSession } from '../../../../packages/problem-solver/types';

function session(extra: Partial<PsSession> = {}): PsSession {
  return {
    id: 's1', title: 'Late rota', revision: 3, kind: 'full', status: 'active', phase: 'improve',
    frame: { goal: 'g', whatIsTrue: 't', whatCanBeDone: 'c' }, model: { id: 'seven_step', reason: '' }, links: [],
    steps: { improve: { runs: [], status: 'open', objection: null } },
    learnings: [], pendingLearning: null, turns: [], summary: '', suggestion: null, pendingKeep: null,
    runner: { status: 'idle', mode: 'turn', error: null }, createdAt: '', updatedAt: '',
    proposedTasks: [], reviewProposal: null, reviewTaskId: 'task-r', reviewState: null, taskSnapshot: null, detour: null,
    ...extra
  } as PsSession;
}

const waiting = session({ reviewState: { status: 'waiting', due: '2026-11-02', returnTo: null, startedAt: null } });

describe('review panel', () => {
  it('is hidden unless the session waits in its Improve step', () => {
    const panel = mountReviewPanel({ start: () => undefined });
    panel.update(session());
    expect(panel.el.hidden).toBe(true);
    panel.update(session({ phase: 'document', reviewState: { status: 'waiting', due: '2026-11-02', returnTo: null, startedAt: null } }));
    expect(panel.el.hidden).toBe(true);
    panel.update(session({ reviewState: { status: 'reviewing', due: '2026-11-02', returnTo: null, startedAt: '' } }));
    expect(panel.el.hidden).toBe(true);
    panel.update(waiting);
    expect(panel.el.hidden).toBe(false);
  });

  it('says when Improve picks up and offers Review now', () => {
    const panel = mountReviewPanel({ start: () => undefined });
    panel.update(waiting);
    const line = panel.el.querySelector('[role="status"]')!;
    expect(line.textContent).toContain('Improve picks up at your review on');
    expect(line.textContent).toContain('2 Nov');
    const button = [...panel.el.querySelectorAll('button')].find((b) => b.textContent === 'Review now');
    expect(button).toBeDefined();
    expect(panel.el.textContent).toContain('Or move on; the review brings you back here.');
  });

  it('calls start once and disables Review now until the next update', () => {
    const start = vi.fn();
    const panel = mountReviewPanel({ start });
    panel.update(waiting);
    const button = panel.el.querySelector<HTMLButtonElement>('button')!;
    button.click();
    button.click();
    expect(start).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    panel.update(waiting);
    expect(button.disabled).toBe(false);
  });
});

describe('review banner', () => {
  const cases = [
    ['move', 'This review picks up at Improve.', 'Start the review'],
    ['start', 'Your review is due.', 'Start the review'],
    ['reopen', 'This problem has moved on. The review adds a new Improve pass, then brings you back.', 'Review the results']
  ] as const;
  for (const [kind, text, label] of cases) {
    it(`reads right for ${kind}`, () => {
      const start = vi.fn();
      const banner = reviewBanner({ kind, step: 'improve' }, start);
      expect(banner.matches('div.ps-resume[role="status"]')).toBe(true);
      expect(banner.textContent).toContain(text);
      const button = banner.querySelector('button')!;
      expect(button.textContent).toBe(label);
      button.click();
      expect(start).toHaveBeenCalledTimes(1);
    });
  }
});

describe('review panel while the learning question waits (Adam, 22 Oct)', () => {
  it('holds Review now with a note until the question is answered', () => {
    const start = vi.fn();
    const panel = mountReviewPanel({ start });
    panel.update(session({ ...waiting, pendingLearning: 'implement' }));
    const button = panel.el.querySelector<HTMLButtonElement>('.ps-review__go')!;
    expect(button.disabled).toBe(true);
    expect(panel.el.querySelector('.ps-review__note')!.textContent).toBe('Answer the coach’s question first, then start the review.');
    button.click();
    expect(start).not.toHaveBeenCalled();
    panel.update(waiting);
    expect(button.disabled).toBe(false);
    expect(panel.el.querySelector('.ps-review__note')!.textContent).toBe('Or move on; the review brings you back here.');
    button.click();
    expect(start).toHaveBeenCalledTimes(1);
  });
});

