/**
 * Pictionary's drawing surface (spec §6.11): a lean canvas for a phone
 * controller, not Excalidraw. Pointer events, pressure-free strokes, four
 * colours, two widths, undo and clear. Points live on a 0…1000 square.
 *
 * Strokes stream through the room in batches (`StrokeStream`): while a finger
 * moves, the new points go out at most every 100 ms (about ten messages a
 * second, rules.burst allows for it); when the finger lifts, the stroke is
 * simplified (Ramer–Douglas–Peucker) and sent whole, replacing what the room
 * held. The board paints the same strokes with the same smoothing
 * (`paintStrokes`), so the class watches the drawing happen.
 */

export const PEN_COLOURS = ['#13233a', '#d4544f', '#3a6fc4', '#e0a92e'] as const;
export const PEN_NAMES = ['Black', 'Red', 'Blue', 'Gold'] as const;
/** Line widths as a share of the square's side. */
export const PEN_WIDTHS = [0.009, 0.024] as const;
export const PAPER = '#fbf8f2';
const UNIT = 1000;

export type DrawnStroke = { c: number; w: number; p: number[] };
export type StrokeBatch = { s: number; c: number; w: number; p: number[]; from?: number; full?: true } | { undo: true } | { clear: true };

/** Ramer–Douglas–Peucker on a flat [x, y, x, y…] list. */
export function simplify(flat: readonly number[], eps = 2): number[] {
  const n = flat.length / 2;
  if (n < 3) return [...flat];
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: Array<[number, number]> = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    const ax = flat[a * 2] as number;
    const ay = flat[a * 2 + 1] as number;
    const dx = (flat[b * 2] as number) - ax;
    const dy = (flat[b * 2 + 1] as number) - ay;
    const len = Math.hypot(dx, dy) || 1e-9;
    let max = 0;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * ((flat[i * 2] as number) - ax) - dx * ((flat[i * 2 + 1] as number) - ay)) / len;
      if (d > max) {
        max = d;
        at = i;
      }
    }
    if (at > 0 && max > eps) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(flat[i * 2] as number, flat[i * 2 + 1] as number);
  return out;
}

/** Paints strokes on a square of `size` px, smoothed with quadratic midpoints. */
export function paintStrokes(g: CanvasRenderingContext2D, strokes: readonly DrawnStroke[], size: number, paper = false): void {
  g.clearRect(0, 0, size, size);
  if (paper) {
    g.fillStyle = PAPER;
    g.fillRect(0, 0, size, size);
  }
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const k = size / UNIT;
  for (const s of strokes) {
    const p = s.p;
    if (p.length < 2) continue;
    const colour = PEN_COLOURS[s.c] ?? PEN_COLOURS[0];
    const width = (PEN_WIDTHS[s.w] ?? PEN_WIDTHS[0]) * size;
    g.strokeStyle = colour;
    g.fillStyle = colour;
    g.lineWidth = width;
    if (p.length === 2) {
      g.beginPath();
      g.arc((p[0] as number) * k, (p[1] as number) * k, width * 0.6, 0, Math.PI * 2);
      g.fill();
      continue;
    }
    g.beginPath();
    g.moveTo((p[0] as number) * k, (p[1] as number) * k);
    const n = p.length / 2;
    for (let i = 1; i < n - 1; i++) {
      const x = p[i * 2] as number;
      const y = p[i * 2 + 1] as number;
      const mx = (x + (p[i * 2 + 2] as number)) / 2;
      const my = (y + (p[i * 2 + 3] as number)) / 2;
      g.quadraticCurveTo(x * k, y * k, mx * k, my * k);
    }
    g.lineTo((p[(n - 1) * 2] as number) * k, (p[(n - 1) * 2 + 1] as number) * k);
    g.stroke();
  }
}

/**
 * Batches one drawer's strokes for the room. Pure apart from the clock it's
 * given: `point` while the finger moves, `up` when it lifts; `due(now)` says
 * whether the next batch may go (one per `everyMs`), `take(now)` returns it.
 */
export class StrokeStream {
  strokes: Array<DrawnStroke & { id: number; sent: number }> = [];
  private nextId = 1;
  private lastSent = -Infinity;
  private queue: StrokeBatch[] = [];
  constructor(private everyMs = 100) {}

  down(x: number, y: number, c: number, w: number): void {
    this.strokes.push({ id: this.nextId++, c, w, p: [Math.round(x), Math.round(y)], sent: 0 });
  }

  point(x: number, y: number): void {
    const s = this.strokes[this.strokes.length - 1];
    if (!s) return;
    const lx = s.p[s.p.length - 2] as number;
    const ly = s.p[s.p.length - 1] as number;
    if (Math.hypot(x - lx, y - ly) < 3) return;
    s.p.push(Math.round(x), Math.round(y));
  }

  /** The finger lifted: the simplified stroke goes out whole (and replaces the live points everywhere). */
  up(): void {
    const s = this.strokes[this.strokes.length - 1];
    if (!s || s.sent < 0) return;
    s.p = simplify(s.p, 2);
    this.queue.push({ s: s.id, c: s.c, w: s.w, p: [...s.p], full: true });
    s.sent = -1;
  }

  undo(): void {
    if (!this.strokes.length) return;
    this.strokes.pop();
    this.queue.push({ undo: true });
  }

  clear(): void {
    this.strokes = [];
    this.queue.push({ clear: true });
  }

  due(now: number): boolean {
    if (this.queue.length) return true;
    const s = this.strokes[this.strokes.length - 1];
    return !!s && s.sent >= 0 && s.p.length / 2 > s.sent && now - this.lastSent >= this.everyMs;
  }

  /** Next batch to send, or null. Lifted strokes, undo and clear go at once; live points at most every `everyMs`. */
  take(now: number): StrokeBatch | null {
    const queued = this.queue.shift();
    if (queued) return queued;
    const s = this.strokes[this.strokes.length - 1];
    if (!s || s.sent < 0 || s.p.length / 2 <= s.sent || now - this.lastSent < this.everyMs) return null;
    const from = s.sent;
    const batch: StrokeBatch = { s: s.id, c: s.c, w: s.w, p: s.p.slice(from * 2), from };
    s.sent = s.p.length / 2;
    // Keep to the beat: a drain that runs a little late doesn't push the next batch later.
    this.lastSent = now - this.lastSent < 2 * this.everyMs ? this.lastSent + this.everyMs : now;
    return batch;
  }
}

export type Pad = {
  root: HTMLElement;
  setPen(c: number, w: number): void;
  undo(): void;
  clear(): void;
  lock(on: boolean): void;
  strokes(): DrawnStroke[];
  dispose(): void;
};

/**
 * The phone's (or the teacher's laptop's) drawing pad: a square canvas that
 * fills `root`'s width. `send` gets every batch; a timer drains the stream at
 * the stream's pace.
 */
export function createPad(opts: { send(batch: StrokeBatch): void; now?: () => number; everyMs?: number; hint?: string }): Pad {
  const root = document.createElement('div');
  root.className = 'pc-pad';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'Drawing pad');
  canvas.setAttribute('role', 'img');
  const hint = document.createElement('span');
  hint.className = 'pc-pad__hint';
  hint.textContent = opts.hint ?? 'Draw with your finger';
  root.append(canvas, hint);
  const stream = new StrokeStream(opts.everyMs ?? 100);
  const now = opts.now ?? (() => performance.now());
  let pen = { c: 0, w: 0 };
  let locked = false;
  let drawing = false;
  let raf = 0;
  let size = 0;
  const g = canvas.getContext?.('2d') ?? null;

  const fit = () => {
    const css = root.clientWidth || 320;
    const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
    if (css !== size) {
      size = css;
      canvas.width = Math.round(css * dpr);
      canvas.height = Math.round(css * dpr);
      g?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  };
  const paint = () => {
    raf = 0;
    if (!g) return;
    fit();
    paintStrokes(g, stream.strokes, size);
  };
  const schedule = () => {
    if (raf) return;
    if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(paint);
    else paint();
  };
  const drain = () => {
    let b = stream.take(now());
    while (b) {
      opts.send(b);
      b = stream.take(now());
    }
  };
  const timer = setInterval(() => {
    if (stream.due(now())) drain();
  }, Math.max(20, Math.floor((opts.everyMs ?? 100) / 2)));

  const pos = (e: PointerEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    const w = r.width || 1;
    const h = r.height || 1;
    return [Math.max(0, Math.min(UNIT, ((e.clientX - r.left) / w) * UNIT)), Math.max(0, Math.min(UNIT, ((e.clientY - r.top) / h) * UNIT))];
  };
  const onDown = (e: PointerEvent) => {
    if (locked) return;
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    drawing = true;
    const [x, y] = pos(e);
    stream.down(x, y, pen.c, pen.w);
    hint.style.opacity = '0';
    drain();
    schedule();
  };
  const onMove = (e: PointerEvent) => {
    if (!drawing) return;
    const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
    for (const ev of list.length ? list : [e]) {
      const [x, y] = pos(ev);
      stream.point(x, y);
    }
    schedule();
  };
  const onUp = () => {
    if (!drawing) return;
    drawing = false;
    stream.up();
    drain();
    schedule();
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('lostpointercapture', onUp);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  ro?.observe(root);
  schedule();

  return {
    root,
    setPen(c, w) {
      pen = { c, w };
    },
    undo() {
      if (locked) return;
      stream.undo();
      drain();
      schedule();
    },
    clear() {
      if (locked) return;
      stream.clear();
      drain();
      hint.style.opacity = '1';
      schedule();
    },
    lock(on) {
      locked = on;
      if (on) onUp();
      root.classList.toggle('is-locked', on);
    },
    strokes: () => stream.strokes.map(({ c, w, p }) => ({ c, w, p: [...p] })),
    dispose() {
      clearInterval(timer);
      ro?.disconnect();
      if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      root.remove();
    }
  };
}
