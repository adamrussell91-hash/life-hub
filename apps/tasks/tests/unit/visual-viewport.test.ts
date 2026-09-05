import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachVisualViewportInset, detachVisualViewportInset } from '@/chat/visual-viewport';

describe('visual viewport inset', () => {
  afterEach(() => {
    detachVisualViewportInset();
    document.documentElement.style.removeProperty('--vv-offset-top');
    document.documentElement.style.removeProperty('--vv-height');
    document.documentElement.style.removeProperty('--vv-offset-bottom');
  });

  it('sets CSS variables from visualViewport metrics', () => {
    const listeners: Record<string, Set<() => void>> = { resize: new Set(), scroll: new Set() };
    const vv = {
      height: 420,
      offsetTop: 12,
      addEventListener: (type: string, fn: () => void) => listeners[type]?.add(fn),
      removeEventListener: (type: string, fn: () => void) => listeners[type]?.delete(fn)
    };
    vi.stubGlobal('innerHeight', 800);
    vi.stubGlobal('visualViewport', vv);

    attachVisualViewportInset();

    expect(document.documentElement.style.getPropertyValue('--vv-offset-top')).toBe('12px');
    expect(document.documentElement.style.getPropertyValue('--vv-height')).toBe('420px');
    expect(document.documentElement.style.getPropertyValue('--vv-offset-bottom')).toBe('368px');
  });

  it('clears CSS variables when detached', () => {
    vi.stubGlobal('visualViewport', {
      height: 500,
      offsetTop: 0,
      addEventListener: () => {},
      removeEventListener: () => {}
    });

    attachVisualViewportInset();
    detachVisualViewportInset();

    expect(document.documentElement.style.getPropertyValue('--vv-offset-top')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--vv-height')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--vv-offset-bottom')).toBe('');
  });

  it('re-syncs when the chat composer receives focus', () => {
    vi.useFakeTimers();
    const listeners: Record<string, Set<() => void>> = { resize: new Set(), scroll: new Set() };
    const vv = {
      height: 400,
      offsetTop: 0,
      addEventListener: (type: string, fn: () => void) => listeners[type]?.add(fn),
      removeEventListener: (type: string, fn: () => void) => listeners[type]?.delete(fn)
    };
    vi.stubGlobal('innerHeight', 800);
    vi.stubGlobal('visualViewport', vv);

    const form = document.createElement('form');
    form.className = 'chat-form';
    const input = document.createElement('textarea');
    input.id = 'chat-input';
    input.scrollIntoView = vi.fn();
    form.append(input);
    document.body.append(form);

    attachVisualViewportInset();
    vv.height = 360;
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    vi.runAllTimers();

    expect(document.documentElement.style.getPropertyValue('--vv-height')).toBe('360px');
    expect(input.scrollIntoView).toHaveBeenCalled();

    form.remove();
    vi.useRealTimers();
  });
});
