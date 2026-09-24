/**
 * Bars <-> Lines morph.
 *
 * Both views stay real and mounted. For the length of the morph a contained overlay holds
 * one lightweight clone per shared entity (same `data-entity-id` in both views). Clones fly
 * from their box in the outgoing view to their box in the incoming view, changing radius and
 * colour on the way; then the real views cross-fade and the overlay is removed.
 *
 * Every animation is a Web Animation on the same document timeline, so `reverse()` mirrors
 * the whole morph from its current frame. Nothing ever jumps.
 *
 * Contract (checked by tests/unit/timeline-morph.test.ts and timeline-visual.spec.mjs):
 * - Entities in both views fly; entities in only one view fade (out or in) in place.
 * - Chrome swaps in two halves: outgoing fades 0 to 35 %, incoming fades 60 to 100 %,
 *   so the middle of the flight shows only the clones on a clean card.
 * - Toggling mid-flight reverses from the current frame.
 * - The flight uses the kit spring (morphing-dialog.js DEFAULT_SPRING) sampled into linear().
 * - Reduced motion: no flight, a MOTION.crossfade cross-fade only.
 * - The overlay is removed on finish, reverse-finish and cancel. No orphan nodes.
 * - Width and height animate here, and only here: clones live in an overlay with
 *   `contain: strict`, so layout never escapes it. Everywhere else, animate transform/opacity.
 */

import { MOTION } from '@/views/timeline-motion';

export type Box = { x: number; y: number; width: number; height: number };

export type MorphShape = 'bar' | 'milestone' | 'project' | 'station' | 'track' | 'terminus';

export type MorphEnd = {
  box: Box;
  radius: number;
  color: string;
  shape: MorphShape;
};

export type MorphPair = {
  id: string;
  from: MorphEnd | null;
  to: MorphEnd | null;
};

/** Same spring as DEFAULT_SPRING in packages/design-kit/js/morphing-dialog.js. */
export const KIT_SPRING = { stiffness: 200, damping: 24, mass: 1 } as const;
/** Outgoing chrome (axis, labels, grid) is gone by 35 % of the flight. */
export const OUT_END = 0.35;
/** Incoming chrome starts at 60 % and is fully in when the clones land. */
export const IN_START = 0.6;

/**
 * Sample a damped spring into a CSS `linear()` easing so Web Animations reproduce the kit
 * spring exactly (and can still be reversed). Returns the settle time as the duration.
 */
export function springEasing(
  spring: { stiffness: number; damping: number; mass: number } = KIT_SPRING,
  samples = 40
): { easing: string; duration: number; peak: number } {
  const w0 = Math.sqrt(spring.stiffness / spring.mass);
  const zeta = spring.damping / (2 * Math.sqrt(spring.stiffness * spring.mass));
  const x = (t: number): number => {
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
    }
    return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  };
  // Settle when within 0.1 % of rest for good.
  let settle = 0;
  for (let t = 0; t < 3; t += 0.001) if (Math.abs(1 - x(t)) > 0.001) settle = t;
  const duration = Math.round(settle * 1000);
  const points: string[] = [];
  let peak = 0;
  for (let i = 0; i <= samples; i++) {
    const v = i === samples ? 1 : x((settle * i) / samples);
    peak = Math.max(peak, v);
    points.push(String(Math.round(v * 10000) / 10000));
  }
  return { easing: `linear(${points.join(', ')})`, duration, peak };
}

/** Radius a shape should have at a given box, so a bar reads as a bar and a station as a disc. */
export function radiusFor(shape: MorphShape, box: Box): number {
  const short = Math.min(box.width, box.height);
  switch (shape) {
    case 'station':
    case 'terminus':
    case 'track':
      return short / 2;
    case 'milestone':
      return 2;
    case 'project':
      return 8;
    default:
      return 6;
  }
}

/** Pair entities by id. Order follows the outgoing view, then incoming-only entities. */
export function pairEntities(
  from: Map<string, MorphEnd>,
  to: Map<string, MorphEnd>
): MorphPair[] {
  const pairs: MorphPair[] = [];
  for (const [id, end] of from) pairs.push({ id, from: end, to: to.get(id) ?? null });
  for (const [id, end] of to) if (!from.has(id)) pairs.push({ id, from: null, to: end });
  return pairs;
}

/** Keyframes for one clone, relative to the overlay's origin. Pure: unit-tested. */
export function cloneKeyframes(pair: MorphPair, origin: { x: number; y: number }): Keyframe[] {
  const a = pair.from ?? pair.to!;
  const b = pair.to ?? pair.from!;
  const frame = (end: MorphEnd, opacity: number): Keyframe => ({
    transform: `translate(${round(end.box.x - origin.x)}px, ${round(end.box.y - origin.y)}px)`,
    width: `${round(end.box.width)}px`,
    height: `${round(end.box.height)}px`,
    borderRadius: `${round(end.radius)}px`,
    backgroundColor: end.color,
    opacity
  });
  if (pair.from && pair.to) return [frame(a, 1), frame(b, 1)];
  if (pair.from) return [frame(a, 1), { ...frame(a, 0), offset: 1 }];
  return [frame(b, 0), frame(b, 1)];
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Read every `[data-entity-id]` inside a view root. */
export function measureEntities(root: Element): Map<string, MorphEnd> {
  const out = new Map<string, MorphEnd>();
  root.querySelectorAll<HTMLElement | SVGElement>('[data-entity-id]').forEach((el) => {
    const id = el.getAttribute('data-entity-id');
    if (!id || out.has(id)) return;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;
    const shape = (el.getAttribute('data-morph-shape') as MorphShape | null) ?? 'bar';
    // SVG groups report their fill box without stroke; a 7px track would measure ~0px tall.
    const minH = shape === 'track' ? 7 : 1;
    const hgt = Math.max(r.height, minH);
    const box = { x: r.left, y: r.top + (r.height - hgt) / 2, width: Math.max(r.width, 1), height: hgt };
    const color =
      el.getAttribute('data-morph-color') ||
      getComputedStyle(el).getPropertyValue(el instanceof SVGElement ? 'fill' : 'background-color') ||
      'transparent';
    out.set(id, { box, radius: radiusFor(shape, box), color, shape });
  });
  return out;
}

export type MorphResult = 'done' | 'reversed' | 'cancelled';

export type MorphController = {
  /** Reverse from the current frame. Calling it twice plays forward again. */
  reverse: () => void;
  /** Jump to the end state (used when the view unmounts mid-flight). */
  finish: () => void;
  cancel: () => void;
  /** 0..1 along the flight in the current direction. */
  progress: () => number;
  direction: () => 1 | -1;
  finished: Promise<MorphResult>;
};

export type MorphOptions = {
  /** Positioned ancestor that will hold the overlay; usually the timeline card. */
  host: HTMLElement;
  fromRoot: HTMLElement;
  toRoot: HTMLElement;
  reducedMotion?: boolean;
  duration?: number;
  /** Called once, after the overlay is gone, with the view that is now showing. */
  onSettled?: (showing: 'from' | 'to') => void;
};

/**
 * Start a morph. `toRoot` must already be mounted (it may be hidden); this function makes
 * it measurable, measures both views, then runs the flight.
 */
export function startMorph(options: MorphOptions): MorphController {
  const { host, fromRoot, toRoot } = options;
  const spring = springEasing();
  const duration = options.duration ?? spring.duration;
  const reduced =
    options.reducedMotion ??
    (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Both views occupy the same box for the length of the morph: the incoming view is laid
  // over the outgoing one, and the host's height springs from one to the other.
  const fromHeight = host.getBoundingClientRect().height;
  const hostOverflow = host.style.overflow;
  toRoot.removeAttribute('hidden');
  Object.assign(toRoot.style, {
    visibility: 'visible',
    opacity: '0',
    pointerEvents: 'none',
    position: 'absolute',
    top: '0',
    left: '0',
    right: '0'
  });
  fromRoot.style.pointerEvents = 'none';
  const toHeight = toRoot.getBoundingClientRect().height;

  const animations: Animation[] = [];
  const hidden: Array<[HTMLElement | SVGElement, string]> = [];
  let overlay: HTMLDivElement | null = null;
  let dir: 1 | -1 = 1;
  let settled = false;
  let resolve!: (r: MorphResult) => void;
  const finished = new Promise<MorphResult>((r) => (resolve = r));

  const fadeDuration = MOTION.crossfade;

  const total = reduced ? fadeDuration : duration;
  const outDur = reduced ? fadeDuration : duration * OUT_END;
  const inDelay = reduced ? 0 : duration * IN_START;
  const inDur = reduced ? fadeDuration : duration - inDelay;
  animations.push(
    fromRoot.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: outDur,
      endDelay: total - outDur,
      fill: 'both',
      easing: 'cubic-bezier(.2,.8,.2,1)'
    }),
    toRoot.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: inDur,
      delay: inDelay,
      fill: 'both',
      easing: 'cubic-bezier(.2,.8,.2,1)'
    })
  );

  if (Math.abs(toHeight - fromHeight) > 1) {
    host.style.overflow = 'hidden';
    animations.push(
      host.animate([{ height: `${fromHeight}px` }, { height: `${toHeight}px` }], {
        duration: reduced ? fadeDuration : duration,
        easing: reduced ? 'linear' : spring.easing,
        fill: 'both'
      })
    );
  }

  if (!reduced) {
    const pairs = pairEntities(measureEntities(fromRoot), measureEntities(toRoot));
    const hostBox = host.getBoundingClientRect();
    overlay = document.createElement('div');
    overlay.className = 'timeline-morph-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('data-part', 'morph-overlay');
    Object.assign(overlay.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      contain: 'strict',
      zIndex: '3'
    });
    const origin = { x: hostBox.left - host.scrollLeft, y: hostBox.top - host.scrollTop };
    for (const pair of pairs) {
      const clone = document.createElement('div');
      clone.setAttribute('data-morph-clone', pair.id);
      Object.assign(clone.style, {
        position: 'absolute',
        left: '0',
        top: '0',
        willChange: 'transform, width, height, opacity'
      });
      overlay.append(clone);
      const flies = Boolean(pair.from && pair.to);
      animations.push(
        clone.animate(cloneKeyframes(pair, origin), {
          duration: flies ? duration : duration * 0.5,
          delay: flies ? 0 : pair.from ? 0 : duration * 0.5,
          endDelay: flies ? 0 : pair.from ? duration * 0.5 : 0,
          fill: 'both',
          easing: flies ? spring.easing : 'linear'
        })
      );
    }
    host.append(overlay);
    // Real entity marks hide while their clones fly, so nothing doubles up. Labels, axis and
    // grid stay real and cross-fade with their view.
    for (const root of [fromRoot, toRoot]) {
      root.querySelectorAll<HTMLElement | SVGElement>('[data-entity-id]').forEach((el) => {
        hidden.push([el, el.style.visibility]);
        el.style.visibility = 'hidden';
      });
    }
  }

  function progress(): number {
    const a = animations[0];
    if (!a || !a.effect) return 1;
    const t = Number(a.currentTime ?? 0);
    return Math.min(1, Math.max(0, t / total));
  }

  function cleanup(result: MorphResult): void {
    if (settled) return;
    settled = true;
    overlay?.remove();
    overlay = null;
    for (const [el, value] of hidden) el.style.visibility = value;
    hidden.length = 0;
    const showing: 'from' | 'to' = result === 'done' ? 'to' : 'from';
    for (const a of animations) a.cancel();
    const show = showing === 'to' ? toRoot : fromRoot;
    const hide = showing === 'to' ? fromRoot : toRoot;
    show.style.opacity = '';
    show.style.visibility = '';
    show.style.pointerEvents = '';
    show.style.position = '';
    show.style.top = '';
    show.style.left = '';
    show.style.right = '';
    hide.style.position = '';
    hide.style.top = '';
    hide.style.left = '';
    hide.style.right = '';
    host.style.overflow = hostOverflow;
    hide.style.opacity = '';
    hide.style.pointerEvents = '';
    hide.setAttribute('hidden', '');
    options.onSettled?.(showing);
    resolve(result);
  }

  const onFinish = () => cleanup(dir === 1 ? 'done' : 'reversed');
  // Wait for every animation: the longest decides when the morph is over.
  function watch(): void {
    Promise.all(animations.map((a) => a.finished))
      .then(() => {
        if (!settled) onFinish();
      })
      .catch(() => {
        /* cancelled or reversed: a fresh watch is set up by reverse() */
      });
  }
  watch();

  return {
    reverse() {
      if (settled) return;
      dir = dir === 1 ? -1 : 1;
      for (const a of animations) a.reverse();
      watch();
    },
    finish() {
      if (settled) return;
      for (const a of animations) a.finish();
      cleanup(dir === 1 ? 'done' : 'reversed');
    },
    cancel() {
      cleanup('cancelled');
    },
    progress: () => (dir === 1 ? progress() : 1 - progress()),
    direction: () => dir,
    finished
  };
}
