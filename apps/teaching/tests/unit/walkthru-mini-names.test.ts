// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/blocks/classroom-tools/sound', () => ({ chime: vi.fn(), primeSound: vi.fn() }));
vi.mock('@/blocks/classroom-tools/tools', () => ({ loadClassLists: vi.fn(), className: vi.fn() }));

const { miniNames } = await import('@/blocks/walkthru-note/mini-tools');
import type { StripState } from '@/blocks/walkthru-note/mini-tools';

function setup(): { state: StripState; first: HTMLElement; second: HTMLElement; val: (tool: HTMLElement) => string; press: (tool: HTMLElement) => Promise<void> } {
  const tools: HTMLElement[] = [];
  const state: StripState = {
    name: null,
    pool: ['Ana Bell', 'Cy Dunn Ross', 'Eve'],
    picked: [],
    classLabel: 'Class A',
    onName: () => tools.forEach((tool) => tool.dispatchEvent(new Event('wts-names'))),
    goTo: () => undefined
  };
  const first = miniNames(3, state);
  const second = miniNames(5, state);
  tools.push(first, second);
  return {
    state,
    first,
    second,
    val: (tool) => tool.querySelector('.wts-tool__val')!.textContent!,
    press: async (tool) => {
      tool.querySelector<HTMLButtonElement>('.wts-tool__go')!.click();
      await vi.advanceTimersByTimeAsync(600);
    }
  };
}

describe('WalkThru name picker', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('only moves the picker you press', async () => {
    const { state, first, second, val, press } = setup();
    first.querySelector<HTMLButtonElement>('.wts-tool__go')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(first.querySelector('.wts-tool__val')!.classList.contains('is-rolling')).toBe(true);
    expect(second.querySelector('.wts-tool__val')!.classList.contains('is-rolling')).toBe(false);
    await vi.advanceTimersByTimeAsync(600);
    expect(val(first)).not.toBe('Pick');
    expect(val(second)).toBe('Pick');
    const firstShown = val(first);
    await press(second);
    expect(val(second)).not.toBe('Pick');
    expect(val(first)).toBe(firstShown);
    expect(state.picked).toHaveLength(2);
    expect(new Set(state.picked).size).toBe(2);
    expect(state.name).toBe(state.picked[1]);
  });

  it('shows first name and surname initial, with the full name in the tooltip', async () => {
    const { state, first, val, press } = setup();
    state.pool = ['Cy Dunn Ross'];
    await press(first);
    expect(val(first)).toBe('Cy R.');
    expect(first.title).toContain('Cy Dunn Ross');
    state.pool = ['Eve'];
    await press(first);
    expect(val(first)).toBe('Eve');
  });
});
