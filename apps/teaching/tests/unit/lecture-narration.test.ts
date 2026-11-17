import { describe, it, expect, vi, afterEach } from 'vitest';
import { createNarration } from '@/lecture/narration';

const clip = { url: '/a.webm', duration_s: 10, transcript: '' };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('lecture narration', () => {
  afterEach(() => vi.restoreAllMocks());

  it('counts a refused autoplay as idle, so the hint can still appear', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('NotAllowedError'));
    const narration = createNarration();
    const idle = vi.fn();
    narration.onIdle(idle);
    narration.load(clip);
    await flush();
    expect(idle).toHaveBeenCalledWith(true);
    narration.dispose();
  });

  it('counts a clip that fails to load as idle', async () => {
    let audio: HTMLMediaElement | null = null;
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
      audio = this;
      return Promise.resolve();
    });
    const narration = createNarration();
    const idle = vi.fn();
    narration.onIdle(idle);
    narration.load(clip);
    await flush();
    idle.mockClear();
    audio!.dispatchEvent(new Event('error'));
    expect(idle).toHaveBeenCalledWith(true);
    narration.dispose();
  });

  it('stops reporting after dispose', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('NotAllowedError'));
    const narration = createNarration();
    const idle = vi.fn();
    narration.onIdle(idle);
    narration.load(null);
    narration.dispose();
    await flush();
    expect(idle).not.toHaveBeenCalled();
  });
});

describe('lecture narration with several takes', () => {
  afterEach(() => vi.restoreAllMocks());

  function playing() {
    let audio: HTMLMediaElement | null = null;
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
      audio = this;
      Object.defineProperty(this, 'paused', { configurable: true, value: false });
      return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
      Object.defineProperty(this, 'paused', { configurable: true, value: true });
    });
    return () => audio!;
  }

  it('moves to the next take at the cut, and counts time across takes', async () => {
    const audio = playing();
    const narration = createNarration();
    const idle = vi.fn();
    narration.onIdle(idle);
    narration.load({ url: '/one.webm', duration_s: 180, end_s: 120, more: [{ url: '/two.webm', duration_s: 60 }] });
    await flush();
    expect(audio().getAttribute('src')).toBe('/one.webm');
    audio().currentTime = 120.2;
    audio().dispatchEvent(new Event('timeupdate'));
    expect(audio().getAttribute('src')).toBe('/two.webm');
    expect(idle).not.toHaveBeenCalledWith(true);
    audio().currentTime = 5;
    expect(narration.time()).toBe(125);
    audio().dispatchEvent(new Event('ended'));
    expect(idle).toHaveBeenCalledWith(true);
    narration.dispose();
  });

  it('plays an uncut first take to its end before the next', async () => {
    const audio = playing();
    const narration = createNarration();
    narration.load({ url: '/one.webm', duration_s: 30, more: [{ url: '/two.webm', duration_s: 20 }] });
    await flush();
    audio().dispatchEvent(new Event('ended'));
    expect(audio().getAttribute('src')).toBe('/two.webm');
    narration.dispose();
  });
});
