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
  it('renders the cover, the day ribbon, two cities and the journey between them', () => {
    const root = document.createElement('div');
    renderJournal(root, { fixture: klIstanbulFixture() });
    expect(root.querySelector('[data-story-cover]')).toBeTruthy();
    expect(root.querySelector('[data-story-ribbon]')).toBeTruthy();
    expect(root.querySelectorAll('[data-journal-leg]')).toHaveLength(2);
    expect(root.querySelector('[data-journal-transition]')).toBeTruthy();
    expect(root.querySelector('[data-journal-timeline]')).toBeTruthy();
  });

  it('puts the day map under the day header, before that day\'s moments', () => {
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
      expect(mapIndex).toBeLessThan(Math.min(...momentIndexes));
      expect(children[mapIndex - 1]?.classList.contains('story-day')).toBe(true);
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
    expect(root.querySelector('.story-cover__title')?.textContent).toBe('Summer break');
    expect(root.querySelector('.story-cover img')).toBeNull();
  });

  it('puts the trip title in the one h1, on the cover, and offers the dock', () => {
    const root = document.createElement('div');
    renderJournal(root, { fixture: klIstanbulFixture() });
    const headings = root.querySelectorAll('h1');
    expect(headings).toHaveLength(1);
    expect(headings[0]?.classList.contains('story-cover__title')).toBe(true);
    const dock = root.querySelector('[data-story-dock]');
    expect(dock?.querySelector('[aria-label="Add photos"]')).toBeTruthy();
    expect(dock?.querySelector('[aria-label="Moment"]')).toBeTruthy();
  });

  it('offers only the views that are built', () => {
    const root = document.createElement('div');
    renderJournal(root, { fixture: klIstanbulFixture() });
    const views = [...root.querySelectorAll('[data-story-view]')].map((b) => b.getAttribute('data-story-view'));
    expect(views).toEqual(['story', 'photos']);
    expect(root.textContent).not.toMatch(/Relive|noticed/i);
  });

  it('numbers days from the start of the trip and writes dates out in full', () => {
    const root = document.createElement('div');
    renderJournal(root, { fixture: klIstanbulFixture() });
    const first = root.querySelector('.story-day__title');
    expect(first?.textContent).toMatch(/^Day 1/);
    expect(first?.textContent).not.toMatch(/\d{2}\/\d{2}\/\d{2}/);
  });

  it('never says how far anyone walked', () => {
    const root = document.createElement('div');
    renderJournal(root, { fixture: klIstanbulFixture() });
    const written = [...root.querySelectorAll('.story-stitch, .story-day__facts, .story-cover__stats, .story-chapter__counts')];
    expect(written.length).toBeGreaterThan(0);
    for (const node of written) expect(node.textContent).not.toMatch(/walk|on foot/i);
  });

  it('switches to all photos and back without losing the story', () => {
    const root = document.createElement('div');
    document.body.append(root);
    renderJournal(root, { fixture: klIstanbulFixture() });
    const moments = root.querySelectorAll('[data-journal-moment]').length;
    (root.querySelector('[data-story-view="photos"]') as HTMLButtonElement).click();
    expect(root.querySelector('[data-story-photos-view]')).toBeTruthy();
    expect(root.querySelector('[data-journal-moment]')).toBeNull();
    (root.querySelector('[data-story-view="story"]') as HTMLButtonElement).click();
    expect(root.querySelectorAll('[data-journal-moment]')).toHaveLength(moments);
    root.remove();
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

  it('reserves media aspect and eager-loads the first paginated moment', () => {
    const root = document.createElement('div');
    renderJournal(root, { fixture: klIstanbulFixture() });
    const img = root.querySelector('#mom_kul_single img') as HTMLImageElement | null;
    expect(img?.width).toBe(1200);
    expect(img?.height).toBe(800);
    expect(img?.loading).toBe('eager');
    const lazy = root.querySelector('#mom_kul_pair img') as HTMLImageElement | null;
    expect(lazy?.loading).toBe('lazy');
  });

  it('paginates moments beyond 30 with load controls', () => {
    const base = klIstanbulFixture();
    const extra = Array.from({ length: 32 }, (_, i) => ({
      id: `mom_page_${i}`,
      leg_id: 'leg_kul',
      local_date: '2026-03-02',
      media_ids: [] as string[],
      display_order: 100 + i,
      lifecycle: 'live' as const,
      text: `Extra ${i}`,
    }));
    const fixture = {
      ...base,
      moments: [...base.moments, ...extra],
      days: base.days.some((d) => d.local_date === '2026-03-02')
        ? base.days
        : [
            ...base.days,
            {
              id: 'day_kul_extra',
              leg_id: 'leg_kul',
              local_date: '2026-03-02',
              lifecycle: 'live' as const,
            },
          ],
    };
    const root = document.createElement('div');
    renderJournal(root, { fixture });
    expect(root.querySelectorAll('[data-journal-moment]').length).toBe(30);
    expect(root.querySelector('.journal__page-actions--later')).toBeTruthy();
    const loadMore = root.querySelector(
      '.journal__page-actions--later button',
    ) as HTMLButtonElement;
    loadMore.click();
    expect(root.querySelectorAll('[data-journal-moment]').length).toBe(40);
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
