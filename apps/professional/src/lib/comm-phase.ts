export type CommPhase = 'before' | 'during' | 'after';

export type CommWindow = { scheduled_start?: string | null; scheduled_end?: string | null };

const OPEN_ENDED_MS = 60 * 60_000;

function bounds(w: CommWindow): { start: number; end: number } | null {
  if (!w.scheduled_start) return null;
  const start = Date.parse(w.scheduled_start);
  if (!Number.isFinite(start)) return null;
  const parsedEnd = w.scheduled_end ? Date.parse(w.scheduled_end) : NaN;
  const end = Number.isFinite(parsedEnd) ? parsedEnd : start + OPEN_ENDED_MS;
  return { start, end };
}

/** The clock picks the face: prep before the start, capture until the end, wrap-up after. */
export function phaseFor(w: CommWindow, now: Date): CommPhase {
  const b = bounds(w);
  if (!b) return 'after';
  const t = now.getTime();
  if (t < b.start) return 'before';
  if (t < b.end) return 'during';
  return 'after';
}

/** Milliseconds until the phase next changes, or null if it never will. */
export function nextSwitchDelayMs(w: CommWindow, now: Date): number | null {
  const b = bounds(w);
  if (!b) return null;
  const t = now.getTime();
  if (t < b.start) return b.start - t;
  if (t < b.end) return b.end - t;
  return null;
}
