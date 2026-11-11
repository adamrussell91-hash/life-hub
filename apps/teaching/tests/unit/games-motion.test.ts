import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { animate, calm, countUp, flip, flyTo, loadCalm, pop, setCalm, shake, springEasing, springLinear, SPRING_FALLBACK } from '@/games/motion/motion';
import { confetti, CONFETTI_MAX } from '@/games/motion/confetti';

type AnimateCall = { keyframes: Keyframe[]; options: KeyframeAnimationOptions };

function animated(node: HTMLElement): AnimateCall[] {
  const calls: AnimateCall[] = [];
  node.animate = vi.fn((keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
    calls.push({ keyframes, options });
    return { finished: Promise.resolve() } as unknown as Animation;
  }) as unknown as HTMLElement['animate'];
  return calls;
}

function reducedMotion(on: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: on && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
}

beforeEach(() => {
  localStorage.clear();
  reducedMotion(false);
  setCalm(false);
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('calm', () => {
  it('follows prefers-reduced-motion and the Calm toggle, and remembers the toggle', () => {
    expect(calm()).toBe(false);
    reducedMotion(true);
    expect(calm()).toBe(true);
    reducedMotion(false);
    setCalm(true);
    expect(calm()).toBe(true);
    expect(localStorage.getItem('teaching-hub.games.calm')).toBe('1');
    setCalm(false);
    localStorage.setItem('teaching-hub.games.calm', '1');
    expect(loadCalm()).toBe(true);
    expect(calm()).toBe(true);
  });

  it('a blocked localStorage leaves Calm off and does not throw', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadCalm()).toBe(false);
    spy.mockRestore();
  });
});

describe('moves', () => {
  it('animate uses transform/opacity and holds will-change only while running', async () => {
    const n = document.createElement('div');
    const calls = animated(n);
    const p = animate(n, [{ transform: 'scale(0.5)' }, { transform: 'none' }]);
    expect(n.style.willChange).toBe('transform');
    await p;
    expect(n.style.willChange).toBe('');
    expect(calls).toHaveLength(1);
  });

  it('in calm a move becomes a 150 ms opacity fade', async () => {
    setCalm(true);
    const n = document.createElement('div');
    const calls = animated(n);
    await pop(n);
    expect(calls).toHaveLength(1);
    expect(calls[0].options.duration).toBe(150);
    expect(calls[0].keyframes.every((k) => Object.keys(k).every((p) => p === 'opacity' || p === 'offset'))).toBe(true);
  });

  it('in calm there is no shake and no flight', async () => {
    reducedMotion(true);
    const n = document.createElement('div');
    const calls = animated(n);
    await shake(n);
    await flyTo(n, { x: 0, y: 0 }, { x: 100, y: 50 });
    expect(calls).toHaveLength(0);
  });

  it('flip runs the change, and in calm moves nothing', async () => {
    const list = document.createElement('ul');
    const a = document.createElement('li');
    const b = document.createElement('li');
    list.append(a, b);
    const ca = animated(a);
    const cb = animated(b);
    setCalm(true);
    await flip(list, () => list.prepend(b));
    expect(list.firstElementChild).toBe(b);
    expect(ca.length + cb.length).toBe(0);
  });

  it('countUp sets the final number at once in calm', () => {
    setCalm(true);
    const n = document.createElement('span');
    const raf = vi.fn();
    vi.stubGlobal('requestAnimationFrame', raf);
    countUp(n, 0, 1250);
    expect(n.textContent).toBe('1,250');
    expect(raf).not.toHaveBeenCalled();
  });

  it('countUp rolls when not calm, and stop leaves the final number', () => {
    const n = document.createElement('span');
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const stop = countUp(n, 0, 40);
    expect(n.textContent).toBe('0');
    stop();
    expect(n.textContent).toBe('40');
  });
});

describe('spring easing', () => {
  it('the linear() spring starts at 0, overshoots and ends at 1', () => {
    const s = springLinear();
    const values = s.replace(/^linear\(|\)$/g, '').split(', ').map(Number);
    expect(values[0]).toBe(0);
    expect(values.at(-1)).toBe(1);
    expect(Math.max(...values)).toBeGreaterThan(1);
  });

  it('falls back to a cubic-bezier when linear() is unsupported', async () => {
    vi.resetModules();
    vi.stubGlobal('CSS', { supports: () => false });
    const m = await import('@/games/motion/motion');
    expect(m.springEasing()).toBe(SPRING_FALLBACK);
    vi.resetModules();
    vi.stubGlobal('CSS', { supports: () => true });
    const m2 = await import('@/games/motion/motion');
    expect(m2.springEasing()).toMatch(/^linear\(/);
    expect(typeof springEasing()).toBe('string');
  });
});

describe('confetti', () => {
  it('draws nothing in calm', async () => {
    setCalm(true);
    const host = document.createElement('div');
    document.body.append(host);
    await confetti(host);
    expect(host.querySelector('canvas')).toBeNull();
  });

  it('one canvas, capped at 150 pieces, removed afterwards', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    let fills = 0;
    const ctx = { clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, fillRect() { fills += 1; }, globalAlpha: 1, fillStyle: '' };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => frames.push(f));
    const done = confetti(host, { pieces: 400 });
    expect(host.querySelectorAll('canvas')).toHaveLength(1);
    frames.shift()!(0);
    expect(fills).toBe(CONFETTI_MAX);
    now = 2000;
    frames.shift()!(2000);
    await done;
    expect(host.querySelector('canvas')).toBeNull();
  });
});
