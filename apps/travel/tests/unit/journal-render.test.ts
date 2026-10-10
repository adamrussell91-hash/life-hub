import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyJournalDocument } from '@/api/journal';
import { renderJournal } from '@/journal/render-journal';
import { klIstanbulFixture } from '@/journal/fixtures/kl-istanbul';

function flushAnimationFrames(depth = 2): Promise<void> {
  return new Promise((resolve) => {
    const tick = (left: number) => {
      if (left <= 0) resolve();
      else requestAnimationFrame(() => tick(left - 1));
    };
    tick(depth);
  });
}

function mockMatchMedia(reduced: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it('skips hub-reveal when prefers-reduced-motion is set', async () => {
    mockMatchMedia(true);
    const root = document.createElement('div');
    renderJournal(root, { fixture: klIstanbulFixture() });
    await flushAnimationFrames();
    expect(root.querySelector('.hub-reveal')).toBeNull();
  });

  it('applies hub-reveal entrance when motion is allowed', async () => {
    mockMatchMedia(false);
    const root = document.createElement('div');
    renderJournal(root, { fixture: klIstanbulFixture() });
    await flushAnimationFrames(4);
    const reveal = root.querySelector('.hub-reveal');
    expect(reveal).toBeTruthy();
    expect(reveal?.classList.contains('is-in')).toBe(true);
  });

  it('uses instant scroll for chapter jump under reduced motion', async () => {
    mockMatchMedia(true);
    const scrollIntoView = vi
      .spyOn(HTMLElement.prototype, 'scrollIntoView')
      .mockImplementation(() => undefined);
    const root = document.createElement('div');
    renderJournal(root, { fixture: klIstanbulFixture(), momentId: 'mom_ist_reflection' });
    await flushAnimationFrames();
    expect(scrollIntoView).toHaveBeenCalled();
    expect(scrollIntoView.mock.calls[0]?.[0]).toMatchObject({ behavior: 'auto' });
  });

  it('shows empty trip actions without invented media', () => {
    const root = document.createElement('div');
    const empty = emptyJournalDocument('trp_empty');
    renderJournal(root, { fixture: empty, displayTitle: 'Summer break' });
    expect(root.querySelector('[data-journal-empty]')).toBeTruthy();
    expect(root.querySelector('.journal-empty__photos')?.textContent).toBe('Add photos');
    expect(root.querySelector('.journal-empty__moment')?.textContent).toBe('Add moment');
    expect(root.querySelector('[data-journal-moment]')).toBeNull();
    expect(root.querySelector('.journal-toolbar__title')?.textContent).toBe('Summer break');
  });

  it('uses toolbar h1 for trip title and enables Add moment', () => {
    const root = document.createElement('div');
    renderJournal(root, { fixture: klIstanbulFixture() });
    const title = root.querySelector('.journal-toolbar__title');
    expect(title?.tagName).toBe('H1');
    const addBtn = root.querySelector('.journal-toolbar__add') as HTMLButtonElement | null;
    expect(addBtn?.disabled).toBe(false);
    expect(addBtn?.getAttribute('aria-label')).toBe('Add moment');
  });

  it('adds journal--pattern-off when patternOff option is true', () => {
    const root = document.createElement('div');
    renderJournal(root, { fixture: klIstanbulFixture(), patternOff: true });
    expect(root.querySelector('.journal')?.classList.contains('journal--pattern-off')).toBe(true);
  });

  it('Codex check 7 — omits deleted moments from the rendered timeline', () => {
    const fixture = klIstanbulFixture();
    const doomed = fixture.moments.find((m) => m.lifecycle === 'live');
    expect(doomed).toBeTruthy();
    const journal = {
      ...fixture,
      moments: fixture.moments.map((m) =>
        m.id === doomed!.id ? { ...m, lifecycle: 'deleted' as const } : m,
      ),
    };
    const root = document.createElement('div');
    renderJournal(root, { fixture: journal });
    expect(root.querySelector(`[data-journal-moment][id="${doomed!.id}"]`)).toBeNull();
    expect(root.querySelector(`#${doomed!.id}`)).toBeNull();
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
