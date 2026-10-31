// Drag to arrange My board. Pointer events, so a mouse, a pen and a finger all work. A press on a
// tile or a cluster title becomes a drag once it has moved a few pixels; a press and release
// without moving is left alone, so the click still opens the tile. A press anywhere else is the
// board's pan, and a second finger (a pinch) cancels the drag.
import type { Pt } from '../../../../packages/walkthrus/board/hex';

export type DragSubject = { kind: 'tile'; key: string } | { kind: 'cluster'; id: string };

export interface DragHandlers {
  /** What, if anything, a press on this element would drag. Null leaves the press to pan and click. */
  pick: (target: Element) => DragSubject | null;
  /** Board units per screen pixel, for turning pointer moves into board moves. */
  scale: () => number;
  onStart: (subject: DragSubject) => void;
  /** `by` is how far the pointer has moved since the press, in board units. */
  onMove: (subject: DragSubject, by: Pt) => void;
  onDrop: (subject: DragSubject, by: Pt) => void;
  onCancel: (subject: DragSubject) => void;
}

export interface DragController {
  /** Call on every pointerdown. True when the press is on something draggable. */
  down: (e: PointerEvent) => boolean;
  /** Call on every pointermove. True when the drag owns this pointer, so the board must not pan. */
  move: (e: PointerEvent) => boolean;
  /** Call on pointerup and pointercancel. True when a drag ended, so the click that follows is swallowed. */
  up: (e: PointerEvent) => boolean;
  /** Abandon any drag (a second finger came down, the board repainted, Escape). */
  cancel: () => void;
  active: () => boolean;
}

export const DRAG_THRESHOLD = 6;

export function createDrag(board: Element, h: DragHandlers, threshold = DRAG_THRESHOLD): DragController {
  let press: { id: number; x: number; y: number; subject: DragSubject } | null = null;
  let dragging = false;

  const delta = (e: PointerEvent): Pt => {
    const k = h.scale() || 1;
    return { x: (e.clientX - press!.x) / k, y: (e.clientY - press!.y) / k };
  };
  const end = (): void => { press = null; dragging = false; };

  return {
    down(e) {
      if (press) { this.cancel(); return false; }
      if (e.button !== undefined && e.button > 0) return false;
      const subject = h.pick(e.target as Element);
      if (!subject) return false;
      press = { id: e.pointerId, x: e.clientX, y: e.clientY, subject };
      return true;
    },
    move(e) {
      if (!press || e.pointerId !== press.id) return false;
      if (!dragging) {
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < threshold) return true;
        dragging = true;
        try { (board as Element & { setPointerCapture?: (id: number) => void }).setPointerCapture?.(e.pointerId); } catch { /* capture is a nicety */ }
        h.onStart(press.subject);
      }
      h.onMove(press.subject, delta(e));
      return true;
    },
    up(e) {
      if (!press || e.pointerId !== press.id) return false;
      const was = dragging;
      const subject = press.subject;
      const by = delta(e);
      end();
      if (!was) return false;
      if (e.type === 'pointercancel') h.onCancel(subject); else h.onDrop(subject, by);
      return true;
    },
    cancel() {
      if (press && dragging) h.onCancel(press.subject);
      end();
    },
    active: () => dragging
  };
}
