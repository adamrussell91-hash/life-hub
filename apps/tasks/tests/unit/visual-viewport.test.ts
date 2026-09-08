import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attachVisualViewportInset,
  detachVisualViewportInset,
  VV_KEYBOARD_OPEN_PX
} from '@/chat/visual-viewport';

describe('visual viewport inset', () => {
  afterEach(() => {
    detachVisualViewportInset();
    document.documentElement.classList.remove('vv-keyboard-open');
    document.documentElement.style.removeProperty('--vv-offset-top');
    document.documentElement.style.removeProperty('--vv-height');
    document.documentElement.style.removeProperty('--vv-offset-bottom');
  });

  it('leaves --vv-* unset when the keyboard is closed (no URL-bar flicker)', () => {
    const listeners: Record<string, Set<() => void>> = { resize: new Set() };
    const vv = {
      height: 800,
      offsetTop: 0,
      addEventListener: (type: string, fn: () => void) => listeners[type]?.add(fn),
      removeEventListener: (type: string, fn: () => void) => listeners[type]?.delete(fn)
    };
    vi.stubGlobal('innerHeight', 800);
    vi.stubGlobal('visualViewport', vv);

    attachVisualViewportInset();

    expect(document.documentElement.style.getPropertyValue('--vv-height')).toBe('');
    expect(document.documentElement.classList.contains('vv-keyboard-open')).toBe(false);
  });

  it('sets CSS variables and vv-keyboard-open when geometry shows a keyboard', () => {
    const listeners: Record<string, Set<() => void>> = { resize: new Set() };
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
    expect(document.documentElement.classList.contains('vv-keyboard-open')).toBe(true);
    expect(800 - 420 - 12).toBeGreaterThan(VV_KEYBOARD_OPEN_PX);
  });

  it('clears CSS variables when detached', () => {
    vi.stubGlobal('innerHeight', 800);
    vi.stubGlobal('visualViewport', {
      height: 400,
      offsetTop: 0,
      addEventListener: () => {},
      removeEventListener: () => {}
    });

    attachVisualViewportInset();
    detachVisualViewportInset();

    expect(document.documentElement.style.getPropertyValue('--vv-offset-top')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--vv-height')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--vv-offset-bottom')).toBe('');
    expect(document.documentElement.classList.contains('vv-keyboard-open')).toBe(false);
  });

  it('opens keyboard mode when the chat composer receives focus even if inset≈0', () => {
    vi.useFakeTimers();
    const listeners: Record<string, Set<() => void>> = { resize: new Set() };
    const vv = {
      height: 800,
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
    form.append(input);
    document.body.append(form);

    attachVisualViewportInset();
    vv.height = 360;
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    vi.runAllTimers();

    expect(document.documentElement.classList.contains('vv-keyboard-open')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--vv-height')).toBe('360px');

    form.remove();
    vi.useRealTimers();
  });
});
