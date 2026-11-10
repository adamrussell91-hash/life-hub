/**
 * State at time t: fold every event with `t ≤ time` over the starting text.
 * One pure function serves playback, scrubbing and the static end copy, so
 * playing through to t always matches jumping to t.
 */
import type { AnnotationColour, ExplainerBlock, ExplainerBoardElement, ExplainerEvent, ExplainerMarkStyle } from '@/schemas/block';
import type { AnnotationAnchor } from '@/schemas/block';

export type ExplainerContent = ExplainerBlock['content'];
export type MarkEvent = Extract<ExplainerEvent, { kind: 'mark' }>;
export type NoteEvent = Extract<ExplainerEvent, { kind: 'note' }>;
export type PauseEvent = Extract<ExplainerEvent, { kind: 'pause' }>;
export type PointerEvent = Extract<ExplainerEvent, { kind: 'pointer' }>;

export type ShownMark = { id: string; t: number; style: ExplainerMarkStyle; colour?: AnnotationColour; anchor: AnnotationAnchor };
export type ShownNote = { id: string; t: number; anchor: AnnotationAnchor; html: string };
export type ShownPointer = { pane: 'text'; word: number } | { pane: 'board'; x: number; y: number };

export type ExplainerState = {
  marks: ShownMark[];
  notes: ShownNote[];
  pointer: ShownPointer | null;
  /** Pause points already passed (t ≤ time). */
  pauseIds: string[];
  /** The board's live elements at time t, in drawing order. */
  board: ExplainerBoardElement[];
  /** Changes whenever the board picture changes (a stroke point, an edit), so the player knows to redraw. */
  boardTick: number;
};

/** A stroke drawn up to `rel` seconds after it began: its first points, or null before the first. */
export function partialStroke(element: ExplainerBoardElement, offsets: readonly number[], rel: number): ExplainerBoardElement | null {
  const points = (element as { points?: unknown[] }).points;
  if (!Array.isArray(points)) return rel >= 0 ? element : null;
  let n = 0;
  while (n < offsets.length && offsets[n]! <= rel) n += 1;
  if (n === 0) return null;
  if (n >= points.length) return element;
  const pressures = (element as { pressures?: unknown[] }).pressures;
  return {
    ...element,
    points: points.slice(0, n),
    ...(Array.isArray(pressures) && pressures.length ? { pressures: pressures.slice(0, n) } : {}),
    // A new version each step, so the board redraws it.
    version: (element.version ?? 1) * 100000 + n
  };
}

/** The pointer fades this long after its last sample. */
export const POINTER_LINGER_S = 1.2;

/** Where a pointer event's dot is at `time`, or null once it has gone. Samples hold offsets from the event's t. */
export function pointerAt(ev: PointerEvent, time: number): ShownPointer | null {
  const rel = time - ev.t;
  if (rel < 0 || ev.samples.length === 0) return null;
  let hit: (typeof ev.samples)[number] | null = null;
  for (const s of ev.samples) {
    if (s[0] <= rel) hit = s;
    else break;
  }
  if (!hit) return null;
  const last = ev.samples[ev.samples.length - 1]!;
  if (rel > last[0] + POINTER_LINGER_S) return null;
  if (ev.pane === 'board') return hit.length === 3 ? { pane: 'board', x: hit[1], y: hit[2] } : null;
  return { pane: 'text', word: hit[1] };
}

export function stateAt(content: Partial<Pick<ExplainerContent, 'recording' | 'board_start'>>, time: number): ExplainerState {
  const events = content.recording?.events ?? [];
  const board = new Map<string, ExplainerBoardElement>();
  for (const el of content.board_start?.elements ?? []) if (!el.isDeleted) board.set(el.id, el);
  let boardTick = 0;
  const put = (el: ExplainerBoardElement) => {
    boardTick += 1;
    if (el.isDeleted) board.delete(el.id);
    else board.set(el.id, el);
  };
  const marks = new Map<string, ShownMark>();
  const notes = new Map<string, ShownNote>();
  const pauseIds: string[] = [];
  let pointer: ShownPointer | null = null;
  for (const ev of events) {
    if (ev.t > time) break;
    switch (ev.kind) {
      case 'mark':
        marks.set(ev.id, { id: ev.id, t: ev.t, style: ev.style, colour: ev.colour, anchor: ev.anchor });
        break;
      case 'note':
        notes.set(ev.id, { id: ev.id, t: ev.t, anchor: ev.anchor, html: ev.html });
        break;
      case 'erase':
        marks.delete(ev.target);
        notes.delete(ev.target);
        break;
      case 'pointer':
        // A newer pointer stroke replaces the old dot.
        pointer = pointerAt(ev, time);
        break;
      case 'pause':
        pauseIds.push(ev.id);
        break;
      case 'board':
        for (const el of ev.elements) put(el);
        break;
      case 'send':
        put(ev.element);
        break;
      case 'stroke': {
        const el = partialStroke(ev.element, ev.offsets, time - ev.t);
        if (el) {
          put(el);
          boardTick += (el as { points?: unknown[] }).points?.length ?? 0;
        }
        break;
      }
    }
  }
  return { marks: [...marks.values()], notes: [...notes.values()], pointer, pauseIds, board: [...board.values()], boardTick };
}

/** The first pause point strictly after t. */
export function nextPauseAfter(events: readonly ExplainerEvent[], t: number): PauseEvent | null {
  for (const ev of events) if (ev.kind === 'pause' && ev.t > t) return ev;
  return null;
}

/** Pause points as scrubber ticks. */
export function pauseTicks(events: readonly ExplainerEvent[]): Array<{ id: string; t: number; prompt: string }> {
  return events.filter((ev): ev is PauseEvent => ev.kind === 'pause').map((ev) => ({ id: ev.id, t: ev.t, prompt: ev.prompt }));
}

/** Events in time order (stable), after a drag or nudge. */
export function sortEvents<T extends { t: number }>(events: readonly T[]): T[] {
  return events.map((ev, i) => ({ ev, i })).sort((a, b) => a.ev.t - b.ev.t || a.i - b.i).map((x) => x.ev);
}
