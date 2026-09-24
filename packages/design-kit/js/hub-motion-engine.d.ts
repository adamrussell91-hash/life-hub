export type Props = Record<string, number>;
export type Easing = (t: number) => number;

export type Clock = {
  now: () => number;
  request: (cb: (time: number) => void) => number;
  cancel: (id: number) => void;
};

export const MOTION: {
  readonly settle: number;
  readonly zoom: number;
  readonly release: number;
  readonly cascadeStagger: number;
  readonly enter: number;
  readonly exit: number;
  readonly expand: number;
  readonly rowStagger: number;
  readonly hover: number;
  readonly morph: number;
  readonly crossfade: number;
  readonly reducedFade: number;
};

export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Easing;

export const EASE: Easing;
export const OVERSHOOT: Easing;
export const LINEAR: Easing;

export type TweenOptions = {
  duration?: number;
  easing?: Easing;
  delay?: number;
};

export type MotionStats = {
  frames: number;
  p95: number;
  max: number;
};

export type MotionEngine = {
  place: (id: string, props: Props) => void;
  to: (id: string, props: Props, options?: TweenOptions) => void;
  enter: (id: string, props: Props, options?: TweenOptions & { from?: Props }) => void;
  exit: (id: string, done: () => void, options?: TweenOptions) => void;
  get: (id: string) => Readonly<Props> | undefined;
  forget: (id: string) => void;
  has: (id: string) => boolean;
  target: (id: string, prop: string) => number | undefined;
  busy: () => boolean;
  finish: () => void;
  stats: () => MotionStats;
  dispose: () => void;
};

export type MotionOptions = {
  apply: (id: string, props: Readonly<Props>) => void;
  clock?: Clock;
  reducedMotion?: () => boolean;
  onIdle?: () => void;
};

export function createMotion(options: MotionOptions): MotionEngine;

export function reconcile(
  engine: MotionEngine,
  next: Map<string, Props>,
  hooks: {
    create: (id: string) => void;
    remove: (id: string) => void;
    previous: Iterable<string>;
    options?: TweenOptions;
    stagger?: number;
    enterOptions?: TweenOptions & { from?: Props };
  }
): void;
