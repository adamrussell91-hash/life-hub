import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mountTour } from '@/app/tour';

function page(): HTMLElement {
  document.body.innerHTML = '<main id="m"><section data-tour="a">A</section><section data-tour="b">B</section></main>';
  return document.getElementById('m')!;
}
const steps = () => [
  { title: 'Welcome', body: 'Hello.' },
  { target: () => document.querySelector<HTMLElement>('[data-tour="a"]'), title: 'A', body: 'Section A.' },
  { target: () => document.querySelector<HTMLElement>('[data-tour="missing"]'), title: 'Gone', body: 'Not here.' },
  { target: () => document.querySelector<HTMLElement>('[data-tour="b"]'), title: 'B', body: 'Section B.' }
];
const card = () => document.querySelector<HTMLElement>('.tour-card');
const help = () => document.querySelector<HTMLButtonElement>('.tour-help');

describe('mountTour', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('runs once on a new browser, dropping steps with no target', () => {
    const tour = mountTour({ host: page(), steps: steps(), storageKey: 'k:v1' });
    expect(card()?.textContent).toContain('Welcome');
    expect(card()?.textContent).toContain('1 of 3');
    expect(card()?.getAttribute('role')).toBe('dialog');
    tour.next();
    tour.next();
    expect(card()?.textContent).toContain('B');
    expect(card()?.textContent).toContain('Done');
    tour.next();
    expect(card()).toBeNull();
    expect(localStorage.getItem('k:v1')).toBe('seen');
    tour.dispose();
    const again = mountTour({ host: page(), steps: steps(), storageKey: 'k:v1' });
    expect(card()).toBeNull();
    expect(help()?.hidden).toBe(false);
    again.dispose();
  });

  it('Back goes to the step before', () => {
    const tour = mountTour({ host: page(), steps: steps(), storageKey: 'k:v1' });
    tour.next();
    document.querySelector<HTMLButtonElement>('.tour-card__back')!.click();
    expect(card()?.textContent).toContain('Welcome');
    tour.dispose();
  });

  it('skip ends it, marks it seen and leaves the Help button', () => {
    const tour = mountTour({ host: page(), steps: steps(), storageKey: 'k:v1' });
    document.querySelector<HTMLButtonElement>('.tour-card__skip')!.click();
    expect(card()).toBeNull();
    expect(localStorage.getItem('k:v1')).toBe('seen');
    expect(help()?.hidden).toBe(false);
    expect(help()?.getAttribute('aria-label')).toBe('Show the tour again');
    tour.dispose();
  });

  it('Escape skips; Help replays from the start; focus returns to Help', () => {
    const tour = mountTour({ host: page(), steps: steps(), storageKey: 'k:v1' });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(card()).toBeNull();
    expect(document.activeElement).toBe(help());
    help()!.click();
    expect(card()?.textContent).toContain('Welcome');
    tour.dispose();
    expect(help()).toBeNull();
  });

  it('with storage throwing, it does not auto-run but Help still works', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked, clear: blocked });
    const tour = mountTour({ host: page(), steps: steps(), storageKey: 'k:v1' });
    expect(card()).toBeNull();
    help()!.click();
    expect(card()).not.toBeNull();
    tour.skip();
    expect(card()).toBeNull();
    tour.dispose();
  });

  it('makes the page inert while open', () => {
    const host = page();
    const tour = mountTour({ host, steps: steps(), storageKey: 'k:v1' });
    expect(host.hasAttribute('inert')).toBe(true);
    tour.skip();
    expect(host.hasAttribute('inert')).toBe(false);
    tour.dispose();
  });
});
