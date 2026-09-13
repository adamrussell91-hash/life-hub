import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderCommunicationsView } from '@/views/communications';

describe('renderCommunicationsView', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('states Communications are not available in this slice, makes no API call, and exposes no create control', () => {
    const canvas = document.createElement('div');
    renderCommunicationsView(canvas);

    expect(canvas.textContent).toMatch(/Communications are not available in this slice/);
    expect(fetch).not.toHaveBeenCalled();
    expect(canvas.querySelectorAll('button').length).toBe(0);
    expect(canvas.querySelectorAll('a').length).toBe(0);
  });
});
