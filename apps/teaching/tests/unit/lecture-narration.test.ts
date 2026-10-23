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
