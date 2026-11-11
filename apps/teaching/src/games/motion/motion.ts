/**
 * Game motion (spec §5.2). Web Animations and CSS only, transform and opacity
 * only, `will-change` set while a move runs and cleared after. Calm (the
 * reduced-motion preference or a game's own Calm toggle) turns every move
 * into a 150 ms crossfade or an instant set: no flights, no shakes, no counters.
 */

let calmToggle = false;
const CALM_KEY = 'teaching-hub.games.calm';

function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** True when moves should be calm: reduced motion is asked for, or the game's Calm toggle is on. */
export function calm(): boolean {
  return calmToggle || prefersReducedMotion();
}

/** The game-level Calm toggle, remembered on this device. */
export function setCalm(on: boolean): void {
  calmToggle = on;
  try {
    localStorage.setItem(CALM_KEY, on ? '1' : '0');
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
}

/** Reads the remembered Calm toggle (call once when a game opens). */
export function loadCalm(): boolean {
  try {
    calmToggle = localStorage.getItem(CALM_KEY) === '1';
  } catch {
    calmToggle = false;
  }
  return calmToggle;
}

export function calmToggleOn(): boolean {
  return calmToggle;
}

/* ── Easing ──────────────────────────────────────────────────────── */

/** A plain ease-out for everything that isn't springy. */
export const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
/** The spring's fallback where CSS `linear()` isn't supported (older Safari): a slight overshoot. */
export const SPRING_FALLBACK = 'cubic-bezier(0.34, 1.36, 0.64, 1)';

/**
 * A damped spring sampled into a CSS `linear()` curve. Pure, so it can be
 * tested; `stiffness` and `damping` follow the usual spring model (mass 1).
 */
export function springLinear(stiffness = 170, damping = 14, samples = 40): string {
  const w0 = Math.sqrt(stiffness);
  const zeta = damping / (2 * w0);
  // Time for the spring to settle within ~0.1%: sample over that window.
  const settle = zeta < 1 ? 6.9 / (zeta * w0) : 6.9 / w0;
  const pos = (t: number): number => {
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
    }
    return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  };
  const points: string[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const v = i === samples ? 1 : pos((settle * i) / samples);
    points.push(String(Math.round(v * 1000) / 1000));
  }
  return `linear(${points.join(', ')})`;
}

let springCache: string | null = null;
/** The spring easing for this browser: `linear()` where supported, else a cubic-bezier overshoot. */
export function springEasing(): string {
  if (springCache) return springCache;
  let supported = false;
  try {
    supported = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('transition-timing-function', 'linear(0, 1)');
  } catch {
    supported = false;
  }
  springCache = supported ? springLinear() : SPRING_FALLBACK;
  return springCache;
}

/* ── The one animate path ────────────────────────────────────────── */

const CALM_MS = 150;

function canAnimate(node: Element | null | undefined): node is HTMLElement {
  return !!node && typeof (node as HTMLElement).animate === 'function';
}

/**
 * Runs keyframes on a node with `will-change` held only while it runs. In
 * calm, the move becomes a short opacity fade (or nothing when `calmFade` is
 * false). Resolves when finished; never rejects (a cancelled move is fine).
 */
export function animate(
  node: Element | null | undefined,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions & { calmFade?: boolean } = {}
): Promise<void> {
  if (!canAnimate(node)) return Promise.resolve();
  const { calmFade = true, ...opts } = options;
  if (calm()) {
    if (!calmFade) return Promise.resolve();
    return run(node, [{ opacity: 0 }, { opacity: 1 }], { duration: CALM_MS, easing: 'linear' }, 'opacity');
  }
  const props = new Set<string>();
  for (const k of keyframes) for (const p of Object.keys(k)) if (p === 'transform' || p === 'opacity') props.add(p);
  return run(node, keyframes, { duration: 400, easing: EASE_OUT, ...opts }, [...props].join(', ') || 'transform');
}

function run(node: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions, willChange: string): Promise<void> {
  const before = node.style.willChange;
  node.style.willChange = willChange;
  const done = () => {
    node.style.willChange = before;
  };
  try {
    const a = node.animate(keyframes, options);
    const finished = a.finished ?? Promise.resolve();
    return finished.then(done, done);
  } catch {
    done();
    return Promise.resolve();
  }
}

/* ── Helpers ─────────────────────────────────────────────────────── */

/** A pop in: scale up from small with the spring. */
export function pop(node: Element | null | undefined): Promise<void> {
  return animate(node, [{ transform: 'scale(0.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 500, easing: springEasing() });
}

/** A wrong-answer shake. Nothing in calm (the wrong state still shows in colour and text). */
export function shake(node: Element | null | undefined): Promise<void> {
  return animate(
    node,
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-3px)', offset: 0.15 },
      { transform: 'translateX(6px)', offset: 0.3 },
      { transform: 'translateX(-8px)', offset: 0.45 },
      { transform: 'translateX(8px)', offset: 0.55 },
      { transform: 'translateX(-6px)', offset: 0.7 },
      { transform: 'translateX(3px)', offset: 0.85 },
      { transform: 'translateX(0)' }
    ],
    { duration: 420, easing: 'cubic-bezier(0.36, 0.07, 0.19, 0.97)', calmFade: false }
  );
}

/** A small "sent" pulse for the optimistic submitted state. Nothing in calm. */
export function pulse(node: Element | null | undefined): Promise<void> {
  return animate(node, [{ transform: 'scale(1)' }, { transform: 'scale(0.96)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 320, calmFade: false });
}

/** A screen or card arriving: rise and fade in (a plain fade in calm). */
export function enter(node: Element | null | undefined, delay = 0): Promise<void> {
  return animate(node, [{ transform: 'translateY(16px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 450, delay, easing: springEasing(), fill: 'backwards' });
}

/** A plain crossfade in, in either mode. */
export function crossfade(node: Element | null | undefined): Promise<void> {
  if (!canAnimate(node)) return Promise.resolve();
  return run(node, [{ opacity: 0 }, { opacity: 1 }], { duration: calm() ? CALM_MS : 250, easing: 'linear' }, 'opacity');
}

/**
 * FLIP reorder: records each child's place, runs `mutate`, then slides each
 * child from its old place to its new one. Children inside a scaled board are
 * corrected for the board's scale. In calm, `mutate` runs and nothing moves.
 */
export function flip(container: HTMLElement, mutate: () => void, options: { duration?: number } = {}): Promise<void> {
  const before = new Map<Element, DOMRect>();
  for (const k of Array.from(container.children)) before.set(k, k.getBoundingClientRect());
  mutate();
  if (calm()) return Promise.resolve();
  const moves: Promise<void>[] = [];
  for (const k of Array.from(container.children) as HTMLElement[]) {
    const a = before.get(k);
    if (!a) continue;
    const b = k.getBoundingClientRect();
    const scale = k.offsetWidth ? b.width / k.offsetWidth || 1 : 1;
    const dx = (a.left - b.left) / scale;
    const dy = (a.top - b.top) / scale;
    if (!dx && !dy) continue;
    moves.push(animate(k, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: options.duration ?? 700, easing: EASE_OUT }));
  }
  return Promise.all(moves).then(() => undefined);
}

export type Point = { x: number; y: number };

/**
 * Flies a node (usually an absolutely placed clone) from one point to another
 * along an arc, shrinking to `scale` and fading at the end. Instant in calm.
 */
export function flyTo(node: Element | null | undefined, from: Point, to: Point, options: { duration?: number; scale?: number; lift?: number } = {}): Promise<void> {
  if (calm()) return Promise.resolve();
  const { duration = 800, scale = 1, lift = 160 } = options;
  return animate(
    node,
    [
      { transform: `translate(${from.x}px, ${from.y}px) scale(1)`, opacity: 1 },
      { transform: `translate(${(from.x + to.x) / 2}px, ${Math.min(from.y, to.y) - lift}px) scale(${(1 + scale) / 2})`, opacity: 1, offset: 0.55 },
      { transform: `translate(${to.x}px, ${to.y}px) scale(${scale})`, opacity: 0.2 }
    ],
    { duration, easing: 'cubic-bezier(0.5, 0, 0.3, 1)', fill: 'forwards', calmFade: false }
  );
}

const numberFormat = (n: number) => Math.round(n).toLocaleString('en-AU');

/**
 * Rolls a number from `from` to `to` (ease-out cubic). Set at once in calm.
 * Returns a stop function that leaves the final number showing.
 */
export function countUp(node: HTMLElement, from: number, to: number, ms = 700): () => void {
  if (calm() || typeof requestAnimationFrame !== 'function' || ms <= 0) {
    node.textContent = numberFormat(to);
    return () => undefined;
  }
  let raf = 0;
  let stopped = false;
  const t0 = performance.now();
  const frame = (t: number) => {
    if (stopped) return;
    const k = Math.min(1, (t - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    node.textContent = numberFormat(from + (to - from) * e);
    if (k < 1) raf = requestAnimationFrame(frame);
  };
  node.textContent = numberFormat(from);
  raf = requestAnimationFrame(frame);
  return () => {
    stopped = true;
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
    node.textContent = numberFormat(to);
  };
}
