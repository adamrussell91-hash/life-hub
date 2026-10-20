// apps/tasks/tests/unit/problem-solver-review-sync.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createReviewSync, type ReviewSyncDeps } from '@/views/problem-solver/review-sync';
import type { PsSession } from '../../../../packages/problem-solver/types';

function session(extra: Partial<PsSession> = {}): PsSession {
  return {
    id: 's1', title: 'Late rota', revision: 3, kind: 'full', status: 'active', phase: 'improve',
    frame: { goal: 'g', whatIsTrue: 't', whatCanBeDone: 'c' }, model: { id: 'seven_step', reason: '' }, links: [],
    steps: { improve: { runs: [], status: 'open', objection: null } },
    learnings: [], pendingLearning: null, turns: [], summary: '', suggestion: null, pendingKeep: null,
    runner: { status: 'idle', mode: 'turn', error: null }, createdAt: '', updatedAt: '',
    proposedTasks: [{ id: 'p1', title: 'Draft rota', status: 'confirmed', due: null, taskId: 't1', source: { runId: 'r', nodeId: 'n' } }],
    reviewProposal: null, reviewTaskId: 'task-r', reviewState: null, taskSnapshot: null, detour: null,
    ...extra
  } as PsSession;
}

const waiting = { status: 'waiting' as const, due: '2026-11-02', returnTo: null, startedAt: null };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(initial: PsSession, over: Partial<ReviewSyncDeps> = {}) {
  let current = initial;
  let status = 'open';
  const bannerEl = document.createElement('div');
  const button = document.createElement('button');
  bannerEl.append(button);
  document.body.append(bannerEl);
  const deps = {
    getSession: () => current,
    confirmed: vi.fn().mockResolvedValue(undefined),
    settle: vi.fn().mockResolvedValue(undefined),
    details: vi.fn(async () => ({ t1: { status, title: 'Draft rota', due_date: null } })),
    setTaskStatuses: vi.fn(),
    review: { update: vi.fn() },
    banner: () => (bannerEl.isConnected ? bannerEl : null),
    flash: vi.fn(),
    alive: () => true,
    focusCoach: vi.fn(),
    today: () => '2026-11-02',
    ...over
  };
  const sync = createReviewSync(deps);
  return {
    sync, deps, bannerEl, button,
    set(next: PsSession) { current = next; },
    setStatus(next: string) { status = next; }
  };
}

describe('review sync: starting the review', () => {
  it('goes through the session sync with the snapshot, then removes the banner and focuses the coach', async () => {
    const t = setup(session({ reviewState: waiting }));
    await t.sync.startReview();
    expect(t.deps.confirmed).toHaveBeenCalledTimes(1);
    expect(t.deps.confirmed).toHaveBeenCalledWith('start_review', { snapshot: { byStatus: { open: 1, in_progress: 0, deferred: 0, done: 0, dead: 0, unknown: 0 }, overdue: [] } });
    expect(t.deps.settle).toHaveBeenCalled();
    expect(t.bannerEl.isConnected).toBe(false);
    expect(t.deps.focusCoach).toHaveBeenCalled();
  });

  it('keeps the banner on failure, re-enables it and shows the error', async () => {
    const err = new Error('busy');
    const t = setup(session({ reviewState: waiting }), { confirmed: vi.fn().mockRejectedValue(err) });
    t.button.disabled = true;
    await t.sync.startReview();
    expect(t.deps.flash).toHaveBeenCalledWith(err);
    expect(t.bannerEl.isConnected).toBe(true);
    expect(t.button.disabled).toBe(false);
    expect(t.deps.review.update).toHaveBeenCalled();
    expect(t.deps.focusCoach).not.toHaveBeenCalled();
  });

  it('starts once while a start is in flight', async () => {
    const t = setup(session({ reviewState: waiting }));
    await Promise.all([t.sync.startReview(), t.sync.startReview()]);
    expect(t.deps.confirmed).toHaveBeenCalledTimes(1);
  });

  it('a failed start lets the same snapshot post later', async () => {
    const confirmed = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(undefined);
    const t = setup(session(), { confirmed });
    await t.sync.startReview();
    await t.sync.refreshStatuses();
    expect(confirmed).toHaveBeenLastCalledWith('task_status', expect.anything());
  });
});

describe('review sync: the task snapshot', () => {
  it('posts once per changed snapshot in Improve', async () => {
    const t = setup(session());
    await t.sync.refreshStatuses();
    await t.sync.refreshStatuses();
    expect(t.deps.confirmed).toHaveBeenCalledTimes(1);
    expect(t.deps.confirmed).toHaveBeenCalledWith('task_status', expect.objectContaining({ snapshot: expect.anything() }));
    t.setStatus('done');
    await t.sync.refreshStatuses();
    expect(t.deps.confirmed).toHaveBeenCalledTimes(2);
    expect(t.deps.setTaskStatuses).toHaveBeenLastCalledWith({ t1: 'done' });
  });

  it('does not post while waiting, outside Improve, or when the session already has it', async () => {
    const t = setup(session({ reviewState: waiting }));
    await t.sync.refreshStatuses();
    t.set(session({ phase: 'implement' }));
    await t.sync.refreshStatuses();
    t.set(session({ taskSnapshot: { at: '', byStatus: { open: 1, in_progress: 0, deferred: 0, done: 0, dead: 0, unknown: 0 }, overdue: [] } }));
    await t.sync.refreshStatuses();
    expect(t.deps.confirmed).not.toHaveBeenCalled();
    expect(t.deps.setTaskStatuses).toHaveBeenCalledTimes(3);
  });

  it('refreshes when the tasks change, on entering Improve, and when the wait ends', async () => {
    const t = setup(session({ phase: 'implement' }));
    t.sync.onRender(t.deps.getSession());
    await flush();
    expect(t.deps.details).toHaveBeenCalledTimes(1);
    t.sync.onRender(t.deps.getSession());
    await flush();
    expect(t.deps.details).toHaveBeenCalledTimes(1);
    t.set(session({ reviewState: waiting }));
    t.sync.onRender(t.deps.getSession());
    await flush();
    expect(t.deps.details).toHaveBeenCalledTimes(2);
    expect(t.deps.confirmed).not.toHaveBeenCalled();
    // The review is set aside: Improve stays open but stops waiting.
    t.set(session({ reviewState: null, reviewTaskId: null }));
    t.sync.onRender(t.deps.getSession());
    await flush();
    expect(t.deps.details).toHaveBeenCalledTimes(3);
    expect(t.deps.confirmed).toHaveBeenCalledWith('task_status', expect.anything());
  });
});
