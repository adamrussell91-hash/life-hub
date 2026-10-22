/**
 * Pure timing helpers for the Voice block: how a viva's time splits across
 * dot points, which point is live at a moment, and clock text. No DOM.
 */

export type PacedPoint = { index: number; start: number; end: number };

/** Splits `total` seconds across points in proportion to their weights. */
export function paceSlots(weights: readonly number[], total: number): PacedPoint[] {
  if (weights.length === 0 || total <= 0) return [];
  const clean = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 1));
  const sum = clean.reduce((a, b) => a + b, 0);
  let at = 0;
  return clean.map((w, index) => {
    const start = at;
    at = index === clean.length - 1 ? total : at + (total * w) / sum;
    return { index, start, end: at };
  });
}

/** The scheduled point at `t` seconds (the last one once time runs out). */
export function slotAt(slots: readonly PacedPoint[], t: number): number {
  if (slots.length === 0) return -1;
  const hit = slots.findIndex((s) => t >= s.start && t < s.end);
  return hit === -1 ? (t < 0 ? 0 : slots.length - 1) : hit;
}

/**
 * The point a student is on: the schedule, unless they pressed Next to move
 * ahead early. Never goes backwards.
 */
export function livePoint(slots: readonly PacedPoint[], t: number, manual: number): number {
  return Math.min(Math.max(slotAt(slots, t), manual), Math.max(0, slots.length - 1));
}

/**
 * How full a point's bar is (0–1) at `t`: from when the student actually
 * reached it (`begunAt`, earlier than `slot.start` after an early Next) to
 * when the schedule moves on.
 */
export function pointProgress(slot: PacedPoint, begunAt: number, t: number): number {
  const span = slot.end - begunAt;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (t - begunAt) / span));
}

/** Seconds as m:ss. */
export function clock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Seconds as "90 s" or "2 min". */
export function durationLabel(seconds: number): string {
  return seconds % 60 === 0 && seconds >= 120 ? `${seconds / 60} min` : `${seconds} s`;
}
