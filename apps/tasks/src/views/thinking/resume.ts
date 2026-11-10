// apps/tasks/src/views/thinking/resume.ts
// The `resumed` joint: opening a thread after three or more days away, or once the day it was
// resting until has come. Fires at most once per period of absence (remembered in this browser).
// A thread whose rest is over is set back to open first.
import { threadsApi } from './api';
import { lastActivityMs, resumeReason } from './thread-logic';
import type { Thread } from './types';

const keyFor = (threadId: string): string => `tt.resumed.${threadId}`;

const memory = new Map<string, string>();
function read(key: string): number {
  try { return Date.parse(localStorage.getItem(key) ?? memory.get(key) ?? ''); } catch { return Date.parse(memory.get(key) ?? ''); }
}
function write(key: string, value: string): void {
  memory.set(key, value);
  try { localStorage.setItem(key, value); } catch { /* the check-in may repeat after a reload; nothing breaks */ }
}

/**
 * Whether a check-in is due now for `thread`, given when this browser last handled it.
 * Pure apart from the clock passed in.
 */
export function resumeDue(thread: Thread, now: Date, sessionUpdatedAt: string | null | undefined, handledAt: number): 'rest_over' | 'away' | null {
  const reason = resumeReason(thread, now, sessionUpdatedAt);
  if (!reason) return null;
  if (!Number.isFinite(handledAt)) return reason;
  const since = reason === 'rest_over' ? Date.parse(thread.restUntil ?? '') : lastActivityMs(thread, sessionUpdatedAt);
  return handledAt < since + (reason === 'away' ? 3 * 86_400_000 : 0) ? reason : null;
}

/** Run `fire` if a resumed check-in is due. Resolves to the thread to show (reopened if its rest is over). */
export async function resumeIfDue(thread: Thread, sessionUpdatedAt: string | null | undefined, fire: () => void): Promise<Thread> {
  const now = new Date();
  const reason = resumeDue(thread, now, sessionUpdatedAt, read(keyFor(thread.id)));
  if (!reason) return thread;
  write(keyFor(thread.id), now.toISOString());
  let current = thread;
  if (reason === 'rest_over' && thread.status === 'resting') {
    try { current = await threadsApi.patch(thread, { status: 'open', restUntil: null }); } catch { /* still resting; the check-in goes ahead */ }
  }
  fire();
  return current;
}
