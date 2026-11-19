import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSea, seaLayout } from '@/games/kinds/fleet-week/sea';

/** A 2D context that accepts every call, so the painters run under jsdom. */
function fakeContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => {} };
  const store: Record<string | symbol, unknown> = {};
  return new Proxy(store, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      return () => {};
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    }
  }) as unknown as CanvasRenderingContext2D;
}

function reducedMotion(on: boolean): void {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: on && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
}

function sizedHost(): HTMLElement {
  const host = document.createElement('div');
  Object.defineProperty(host, 'clientWidth', { value: 300 });
  Object.defineProperty(host, 'clientHeight', { value: 300 });
  document.body.append(host);
  return host;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('fleet week sea', () => {
  it('the same seed gives the same layout, and another seed a different one', () => {
    const a = seaLayout('campaign-1:ours');
    const b = seaLayout('campaign-1:ours');
    expect(b).toEqual(a);
    const others = ['campaign-1:theirs', 'campaign-2:ours', 'x'].map((s) => JSON.stringify(seaLayout(s).islands));
    expect(others.some((o) => o !== JSON.stringify(a.islands))).toBe(true);
  });

  it('islands only sit on grid corners, small enough to leave every square clear', () => {
    for (let n = 0; n < 200; n++) {
      const { islands } = seaLayout(`seed-${n}`);
      expect(islands.length).toBeGreaterThan(0);
      for (const is of islands) {
        expect(Number.isInteger(is.i) && Number.isInteger(is.j)).toBe(true);
        expect(is.i).toBeGreaterThanOrEqual(0);
        expect(is.i).toBeLessThanOrEqual(5);
        expect(is.j).toBeGreaterThanOrEqual(0);
        expect(is.j).toBeLessThanOrEqual(5);
        // Sand reaches 1.28 × r (in cells) from the corner: well short of a square's middle (0.707).
        expect(is.r * 1.28).toBeLessThan(0.25);
      }
      const keys = islands.map((is) => `${is.i},${is.j}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('reduced motion requests no animation frames, even for new shots and the lift', async () => {
    reducedMotion(true);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeContext() as never);
    const raf = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', raf);
    const host = sizedHost();
    const sea = createSea(host, { seed: 'calm', mode: 'reveal', size: 5 });
    expect(sea.live).toBe(true);
    sea.update({ ships: [{ squares: [0, 1, 2] }], marks: {} });
    sea.update({ ships: [{ squares: [0, 1, 2] }], marks: { 0: 'hit', 7: 'miss' } });
    await sea.lift();
    expect(raf).not.toHaveBeenCalled();
    sea.destroy();
  });

  it('with motion on it animates, and stops when the tab is hidden', () => {
    reducedMotion(false);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeContext() as never);
    const raf = vi.fn(() => 7);
    const caf = vi.fn();
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', caf);
    const sea = createSea(sizedHost(), { seed: 'moving', mode: 'rival' });
    expect(raf).toHaveBeenCalled();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(caf).toHaveBeenCalledWith(7);
    visibility.mockRestore();
    sea.destroy();
  });

  it('a null context falls back to the CSS look', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const host = sizedHost();
    const sea = createSea(host, { seed: 'none', mode: 'own' });
    expect(sea.live).toBe(false);
    expect(host.classList.contains('fw-sea--css')).toBe(true);
    expect(host.querySelector('canvas')).toBeNull();
    expect(() => sea.update({ marks: { 3: 'hit' } })).not.toThrow();
    sea.destroy();
  });
});
