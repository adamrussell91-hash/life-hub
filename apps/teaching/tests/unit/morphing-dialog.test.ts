import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  openMorphingDialog,
  resetMorphingDialogForTests,
  runMorphTransform
} from '../../design-kit/js/morphing-dialog.js';

function rect(left: number, top: number, width: number, height: number) {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} };
}

function stubRect(node: HTMLElement, box: ReturnType<typeof rect>): void {
  Object.defineProperty(node, 'getBoundingClientRect', { configurable: true, value: () => box });
}

describe('morphing dialog', () => {
  afterEach(() => {
    resetMorphingDialogForTests();
    document.body.replaceChildren();
  });

  it('opens from a trigger and restores it on close', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    } as unknown as MediaQueryList);

    const trigger = document.createElement('button');
    trigger.className = 'hub-row';
    const title = document.createElement('p');
    title.className = 'hub-row__title';
    title.textContent = 'Micro card';
    trigger.append(title);
    document.body.append(trigger);
    stubRect(trigger, rect(24, 80, 160, 48));

    const frame = document.createElement('div');
    const heading = document.createElement('h2');
    heading.setAttribute('data-hub-morph', 'title');
    heading.textContent = 'Micro card';
    frame.append(heading);
    stubRect(frame, rect(120, 60, 420, 480));

    const handle = openMorphingDialog({ trigger, frame, label: 'Expanded card' });
    expect(document.querySelector('.hub-morph-dialog')).toBeTruthy();
    expect(frame.classList.contains('hub-morph-dialog__frame')).toBe(true);
    expect(trigger.classList.contains('hub-morph-dialog__origin')).toBe(true);
    expect(title.getAttribute('data-hub-morph')).toBe('title');

    handle.close();
    await vi.waitFor(() => {
      expect(document.querySelector('.hub-morph-dialog')).toBeNull();
    });
    expect(trigger.classList.contains('hub-morph-dialog__origin')).toBe(false);
  });

  it('runMorphTransform swaps compact and expanded nodes', () => {
    const host = document.createElement('div');
    const compact = document.createElement('article');
    compact.className = 'hub-row';
    compact.textContent = 'Compact';
    host.append(compact);
    document.body.append(host);

    runMorphTransform({
      from: compact,
      update: () => {
        host.replaceChildren();
        const expanded = document.createElement('article');
        expanded.className = 'hub-card';
        expanded.textContent = 'Expanded';
        host.append(expanded);
      },
      to: () => host.querySelector('.hub-card')
    });

    expect(host.querySelector('.hub-card')?.textContent).toBe('Expanded');
    expect(host.querySelector('.hub-row')).toBeNull();
  });
});
