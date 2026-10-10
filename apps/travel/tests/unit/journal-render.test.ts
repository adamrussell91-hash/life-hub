import { describe, expect, it } from 'vitest';
import { renderJournal } from '@/journal/render-journal';
import { klIstanbulFixture } from '@/journal/fixtures/kl-istanbul';

function flushAnimationFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

describe('renderJournal', () => {
  it('renders toolbar, two leg headings, and a transition', () => {
    const root = document.createElement('div');
    renderJournal(root, { fixture: klIstanbulFixture() });
    expect(root.querySelector('[data-journal-toolbar]')).toBeTruthy();
    expect(root.querySelectorAll('[data-journal-leg]')).toHaveLength(2);
    expect(root.querySelector('[data-journal-transition]')).toBeTruthy();
    expect(root.querySelector('[data-journal-timeline]')).toBeTruthy();
  });

  it('renders day map preview after all moments in each day section', () => {
    const root = document.createElement('div');
    renderJournal(root, { fixture: klIstanbulFixture() });
    for (const day of root.querySelectorAll('[data-journal-day]')) {
      const children = [...day.children];
      const momentIndexes = children
        .map((el, index) => (el.hasAttribute('data-journal-moment') ? index : -1))
        .filter((index) => index >= 0);
      const mapIndex = children.findIndex((el) =>
        el.classList.contains('journal-day__map-preview'),
      );
      if (mapIndex === -1) continue;
      expect(momentIndexes.length).toBeGreaterThan(0);
      expect(mapIndex).toBeGreaterThan(Math.max(...momentIndexes));
    }
  });

  it('shows Read more on the long reflection fixture moment', async () => {
    const root = document.createElement('div');
    renderJournal(root, { fixture: klIstanbulFixture() });
    await flushAnimationFrames();
    const readMore = root.querySelector(
      '#mom_ist_reflection .journal-moment__read-more',
    ) as HTMLButtonElement | null;
    expect(readMore).toBeTruthy();
    expect(readMore?.hidden).toBe(false);
    expect(
      root.querySelector('#mom_ist_reflection .journal-moment__reflection--clamped'),
    ).toBeTruthy();
  });
});
