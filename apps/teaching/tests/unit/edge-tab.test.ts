import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EDGE_IDLE_MS, mountEdgeTab, resetEdgeTab } from '@/student/edge-tab';
import type { WhatsNextHandle } from '@/student/whats-next';
import type { NowThing } from '@/student/now-strip';

const flush = async () => { for (let i = 0; i < 6; i += 1) await new Promise((r) => setTimeout(r, 0)); };
const fakeCard = (thing: NowThing | null | undefined): WhatsNextHandle => ({
  element: document.createElement('section'),
  setDone: () => undefined,
  next: vi.fn(async () => thing),
  dispose: () => undefined
});
const FROM = '/s/classes/c1/lessons/here';

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', undefined);
  resetEdgeTab();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('the What next? edge tab', () => {
  it('opens a card with the next thing and where to go', async () => {
    const tab = mountEdgeTab({ classId: 'c1', from: FROM, card: fakeCard({ key: 'l2', what: 'Do the lesson: Ghost poem', go: { lesson: 'l2' } }) })!;
    document.body.append(tab.element);
    const button = tab.element.querySelector<HTMLButtonElement>('.et__tab')!;
    expect(button.textContent).toBe('What next?');
    button.click();
    await flush();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(tab.element.querySelector('.et__what')?.textContent).toBe('Do the lesson: Ghost poem');
    expect(tab.element.querySelector('.et__go')?.getAttribute('href')).toMatch(/\/s\/classes\/c1\/lessons\/l2$/);
    expect(tab.element.querySelector('.et__all')?.getAttribute('href')).toMatch(/profile\?show=todo/);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(tab.element.querySelector<HTMLElement>('.et__panel')!.hidden).toBe(true);
  });

  it('keeps only the list link when the list is empty', async () => {
    const tab = mountEdgeTab({ classId: 'c1', from: FROM, card: fakeCard(null) })!;
    document.body.append(tab.element);
    tab.element.querySelector<HTMLButtonElement>('.et__tab')!.click();
    await flush();
    expect(tab.element.querySelector('.et__what')?.textContent).toMatch(/Nothing else/);
    expect(tab.element.querySelector('.et__go')).toBeNull();
  });

  it('fades while scrolling down and comes back when scrolling stops', () => {
    vi.useFakeTimers();
    const tab = mountEdgeTab({ classId: 'c1', from: FROM, card: fakeCard(null) })!;
    document.body.append(tab.element);
    Object.defineProperty(window, 'scrollY', { value: 400, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    expect(tab.element.classList.contains('is-away')).toBe(true);
    vi.advanceTimersByTime(EDGE_IDLE_MS);
    expect(tab.element.classList.contains('is-away')).toBe(false);
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  it('Hide on my lessons turns it off on this device', async () => {
    const tab = mountEdgeTab({ classId: 'c1', from: FROM, card: fakeCard(null) })!;
    document.body.append(tab.element);
    tab.element.querySelector<HTMLButtonElement>('.et__tab')!.click();
    await flush();
    tab.element.querySelector<HTMLButtonElement>('.et__hide')!.click();
    expect(tab.element.isConnected).toBe(false);
    expect(mountEdgeTab({ classId: 'c1', from: FROM, card: fakeCard(null) })).toBeNull();
  });
});
