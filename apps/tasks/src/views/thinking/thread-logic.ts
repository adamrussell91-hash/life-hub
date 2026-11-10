// apps/tasks/src/views/thinking/thread-logic.ts
// Pure helpers for the thread views: the timeline order, when a thread has been away long
// enough to check in, and which joint a change in a session crosses. No DOM, no network.
import type { Joint, Thread, ThreadSession } from './types';

export type TimelineItem = { session: ThreadSession; depth: 0 | 1 };

const byAdded = (a: ThreadSession, b: ThreadSession): number => String(a.addedAt ?? '').localeCompare(String(b.addedAt ?? ''));

/**
 * The thread's sessions in reading order: each home (or handed-on) session, in the order they
 * joined, followed by the detours that left from it, which sit one level in. A detour whose
 * origin is not in the thread is kept at the end, indented, rather than lost.
 */
export function orderTimeline(thread: Pick<Thread, 'sessions'>): TimelineItem[] {
  const sessions = thread.sessions.map((session, index) => ({ session, index }));
  const stable = (a: { session: ThreadSession; index: number }, b: { session: ThreadSession; index: number }) => byAdded(a.session, b.session) || a.index - b.index;
  const roots = sessions.filter((s) => s.session.role !== 'detour').sort(stable);
  const detours = sessions.filter((s) => s.session.role === 'detour').sort(stable);
  const out: TimelineItem[] = [];
  const used = new Set<ThreadSession>();
  for (const root of roots) {
    out.push({ session: root.session, depth: 0 });
    for (const d of detours) {
      if (d.session.from?.sessionId === root.session.sessionId) {
        out.push({ session: d.session, depth: 1 });
        used.add(d.session);
      }
    }
  }
  for (const d of detours) if (!used.has(d.session)) out.push({ session: d.session, depth: 1 });
  return out;
}

/** The home session, or null. */
export const homeSession = (thread: Pick<Thread, 'sessions'>): ThreadSession | null => thread.sessions.find((s) => s.role === 'home') ?? null;

/** Detours that left from `sessionId`, optionally from one step. */
export function detoursFrom(thread: Pick<Thread, 'sessions'>, sessionId: string, stepId?: string | null): ThreadSession[] {
  return thread.sessions.filter((s) => s.role === 'detour' && s.from?.sessionId === sessionId && (stepId === undefined || (s.from.stepId ?? null) === stepId));
}

export const AWAY_DAYS = 3;
const DAY_MS = 86_400_000;

/**
 * Whether a thread opened now has been away long enough for a `resumed` check-in: its last
 * activity (the later of the thread's and the open session's last change) is three or more days
 * back, or the day it was resting until has come. A closed thread never resumes.
 * Returns why, or null.
 */
/** The latest of the stamps that say the thread (or the open session) was last touched, in ms; 0 when none. */
export function lastActivityMs(thread: Pick<Thread, 'updatedAt' | 'lastCheckAt'>, sessionUpdatedAt?: string | null): number {
  const stamps = [thread.updatedAt, thread.lastCheckAt, sessionUpdatedAt].map((s) => (s ? Date.parse(s) : NaN)).filter((n) => Number.isFinite(n));
  return stamps.length ? Math.max(...stamps) : 0;
}

export function resumeReason(thread: Pick<Thread, 'status' | 'restUntil' | 'updatedAt' | 'lastCheckAt'>, now: Date, sessionUpdatedAt?: string | null): 'rest_over' | 'away' | null {
  if (thread.status === 'closed') return null;
  const today = now.toISOString().slice(0, 10);
  if (thread.restUntil && thread.restUntil <= today) return 'rest_over';
  const last = lastActivityMs(thread, sessionUpdatedAt);
  if (!last) return null;
  return now.getTime() - last >= AWAY_DAYS * DAY_MS ? 'away' : null;
}

/** What the hook watches in a session between renders. */
export type SessionSnap = {
  phase: string;
  /** The step a detour (or any session's commit) ends on; null when the session has no model yet. */
  endStep: string | null;
  /** Changes when the home record is written (the case file's version and write time); null before. */
  recordKey: string | null;
};

/**
 * The joint a session crossed between two snapshots, or null. A record written wins; then
 * arriving at the commit step (`before_commit`); then leaving the frame (`framed`); then any
 * other step change (`step_done`). Finishing, and the first snapshot, cross nothing.
 */
export function jointBetween(prev: SessionSnap | null, next: SessionSnap): Joint | null {
  if (!prev) return null;
  if (next.recordKey && next.recordKey !== prev.recordKey) return 'recorded';
  if (next.phase === prev.phase || next.phase === 'finished') return null;
  if (prev.phase === 'frame') return next.phase === 'frame' ? null : 'framed';
  if (next.phase === 'frame') return null;
  return next.endStep && next.phase === next.endStep ? 'before_commit' : 'step_done';
}

/** True when Not now was already said to this option at this step (mirrors the server's wasDeclined). */
export function declinedAt(thread: Pick<Thread, 'route'>, optionId: string, stepId: string | null): boolean {
  return thread.route.some((r) => r.outcome === 'not_now' && r.optionId === optionId && (r.stepId ?? null) === (stepId ?? null));
}

/** A returned detour that has not been handled in the home step yet. */
export const awaitingLanding = (s: ThreadSession): boolean => s.role === 'detour' && s.state === 'returned' && !s.landing;

/** Open or running detours the home step is waiting on. */
export const waitingOn = (s: ThreadSession): boolean => s.role === 'detour' && (s.state === 'open' || s.state === 'running');

/** The text sent to the coach for "Use as this step's answer". */
export function answerLine(toolName: string, answer: string): string {
  return `From ${toolName} detour: ${answer}`;
}
