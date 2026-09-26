// apps/tasks/src/domain/goal-morph.ts
/** Shared rect for runway row → goal page morph (G-22). */

export type MorphRect = { left: number; top: number; width: number; height: number; radius?: number };

let pending: MorphRect | null = null;

export function rememberGoalMorph(el: Element | null): void {
  if (!el || typeof (el as HTMLElement).getBoundingClientRect !== 'function') {
    pending = null;
    return;
  }
  const r = (el as HTMLElement).getBoundingClientRect();
  pending = r.width > 0 && r.height > 0
    ? { left: r.left, top: r.top, width: r.width, height: r.height }
    : null;
}

export function takeGoalMorph(): MorphRect | null {
  const next = pending;
  pending = null;
  return next;
}
