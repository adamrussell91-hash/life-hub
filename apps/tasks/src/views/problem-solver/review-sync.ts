// apps/tasks/src/views/problem-solver/review-sync.ts
// The page's side of Improve's review: live task statuses for the chart, the task snapshot
// posted to the coach while Improve runs, and starting the review (Review now or the banner).
// Every write goes through the session sync, so it waits for the coach and retries a stale
// revision like the task cards do.
import { planStepForBook } from '../../../../../packages/problem-solver/steps.mjs';
import { waitingForReview } from '../../../../../packages/problem-solver/review.mjs';
import type { PsAction, PsProposedTask, PsSession } from '../../../../../packages/problem-solver/types';
import { taskSnapshot, type TaskDetail } from './task-bridge';

export type ReviewSyncDeps = {
  getSession(): PsSession;
  /** The session sync's queued write (waits for the coach, retries a stale revision once). */
  confirmed(action: PsAction, payload: Record<string, unknown>): Promise<void>;
  /** Wait for the coach turn the start queued. */
  settle(): Promise<void>;
  details(proposals: PsProposedTask[]): Promise<Record<string, TaskDetail>>;
  setTaskStatuses(map: Record<string, string>): void;
  /** Re-enable the waiting panel's button after a failed start. */
  review: { update(session: PsSession): void };
  /** The review link's banner, if it is still on the page. */
  banner(): HTMLElement | null;
  flash(err: unknown): void;
  alive(): boolean;
  focusCoach(): void;
  today?: () => string;
};

export type ReviewSync = {
  /** Fetch the confirmed tasks once: statuses for the chart, and the snapshot while Improve runs. */
  refreshStatuses(): Promise<void>;
  /** Refresh only when the session has confirmed tasks (Tasks events, the tab coming back). */
  refreshIfTasks(): void;
  startReview(): Promise<void>;
  /** Called on every render: refreshes when the confirmed tasks change, on entering Improve, or when its wait ends. */
  onRender(session: PsSession): void;
};

/** Today as the local `YYYY-MM-DD`. */
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Comparable key for a snapshot's counts and overdue titles (its time is left out). */
export const snapshotKey = (snap: { byStatus: Record<string, number>; overdue: string[] } | null | undefined): string =>
  snap ? JSON.stringify([Object.entries(snap.byStatus).sort(([a], [b]) => a.localeCompare(b)), snap.overdue]) : '';

const confirmedIds = (session: PsSession) =>
  (session.proposedTasks ?? []).filter((p) => p.status === 'confirmed' && p.taskId).map((p) => p.taskId!).sort().join(',');

const inImprove = (session: PsSession) => Boolean(session.model) && session.phase === planStepForBook(session.model!.id, 'improve');

export function createReviewSync(deps: ReviewSyncDeps): ReviewSync {
  const today = deps.today ?? (() => localToday());
  /** The last snapshot key posted, so a status refresh never posts the same snapshot twice. */
  let postedKey = snapshotKey(deps.getSession().taskSnapshot);
  let confirmedKey = '';
  let shownPhase = '';
  let wasWaiting = false;
  let statusRound = 0;
  let starting = false;

  /** In an Improve plan step, not waiting, with a confirmed task: tell the coach how the tasks stand. */
  function postSnapshot(details: Record<string, TaskDetail>): void {
    const session = deps.getSession();
    if (!inImprove(session) || waitingForReview(session)) return;
    const proposals = session.proposedTasks ?? [];
    if (!proposals.some((p) => p.status === 'confirmed' && p.taskId)) return;
    const snapshot = taskSnapshot(proposals, details, today());
    const key = snapshotKey(snapshot);
    if (key === postedKey || key === snapshotKey(session.taskSnapshot)) return;
    postedKey = key;
    deps.confirmed('task_status', { snapshot }).catch(() => {
      if (postedKey === key) postedKey = '';
    });
  }

  async function refreshStatuses(): Promise<void> {
    if (!deps.alive()) return;
    const round = ++statusRound;
    const details = await deps.details(deps.getSession().proposedTasks ?? []);
    if (round !== statusRound || !deps.alive()) return;
    deps.setTaskStatuses(Object.fromEntries(Object.entries(details).map(([id, d]) => [id, typeof d === 'string' ? d : d.status])));
    postSnapshot(details);
  }

  async function startReview(): Promise<void> {
    if (starting) return;
    starting = true;
    let key = '';
    try {
      const proposals = deps.getSession().proposedTasks ?? [];
      const snapshot = taskSnapshot(proposals, await deps.details(proposals), today());
      key = snapshotKey(snapshot);
      postedKey = key;
      await deps.confirmed('start_review', { snapshot });
    } catch (err) {
      if (postedKey === key) postedKey = '';
      deps.flash(err);
      const button = deps.banner()?.querySelector('button');
      if (button) button.disabled = false;
      deps.review.update(deps.getSession());
      return;
    } finally {
      starting = false;
    }
    deps.banner()?.remove();
    await deps.settle();
    if (deps.alive()) deps.focusCoach();
  }

  return {
    refreshStatuses,
    refreshIfTasks() {
      if (confirmedKey) void refreshStatuses();
    },
    startReview,
    onRender(session) {
      const key = confirmedIds(session);
      const waiting = waitingForReview(session);
      const enteredImprove = session.phase !== shownPhase && inImprove(session);
      const waitEnded = wasWaiting && !waiting && inImprove(session);
      shownPhase = session.phase;
      wasWaiting = waiting;
      if (key !== confirmedKey || (key && (enteredImprove || waitEnded))) {
        confirmedKey = key;
        void refreshStatuses();
      }
    }
  };
}
