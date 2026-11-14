import { afterEach, describe, expect, it, vi } from 'vitest';
import { lisbonPortoJournal } from '@/journal/fixtures/lisbon-porto';
import { closeAllJournalOverlays } from '@/journal/overlay-host';
import { renderJournal } from '@/journal/render-journal';
import type { Trip } from '@/types';
import testTrip from '../../fixtures/test-trip.json';

const trip = testTrip as unknown as Trip;

function mount(): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  renderJournal(root, { fixture: lisbonPortoJournal(trip.id), trip, today: '2027-03-06' });
  return root;
}

/** Ids of the moments, keepsakes and journey bands of the story, top to bottom. */
function storyOrder(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLElement>('[data-journal-moment], [data-keepsake-id], [data-journal-transition]')].map(
    (node) => node.getAttribute('data-keepsake-id') ?? (node.hasAttribute('data-journal-transition') ? 'journey' : node.id),
  );
}

afterEach(() => {
  closeAllJournalOverlays();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('keepsakes in the journal', () => {
  it('puts each keepsake where it was picked up', () => {
    const order = storyOrder(mount());
    const at = (id: string) => order.indexOf(id);
    // The flight in comes before anything in Lisbon.
    expect(at('booking_itm_testflight01')).toBe(0);
    // A keepsake with a time and no moment sits in time order: after 11:15, before the next moment.
    expect(at('sv_lptramticket')).toBe(at('mom_lptram001') + 1);
    // A keepsake linked to a moment follows it.
    expect(at('sv_lpfadoflyer')).toBe(at('mom_lpfado001') + 1);
    expect(at('sv_lpcoaster')).toBe(at('mom_lpdinner1') + 1);
    // The booked train sits at the journey between the cities.
    expect(at('booking_itm_testtrain01')).toBe(at('journey') + 1);
    expect(at('journey')).toBeGreaterThan(at('sv_lpfadoflyer'));
    expect(at('journey')).toBeLessThan(at('sv_lpcoaster'));
  });

  it('counts keepsakes on the cover, the chapter and the day, and stamps each chapter', () => {
    const root = mount();
    expect(root.querySelector('.story-cover__stats')!.textContent).toContain('6 keepsakes');
    const chapters = [...root.querySelectorAll('.story-chapter')];
    expect(chapters[0]!.querySelector('.story-chapter__counts')!.textContent).toContain('4 keepsakes');
    expect(chapters[1]!.querySelector('.story-chapter__counts')!.textContent).toContain('2 keepsakes');
    expect(chapters[0]!.querySelector('.story-chapter__stamp .keepsake--stamp')!.textContent).toContain('Lisbon');
    expect(root.querySelector('#day_lp0303 .story-day__facts')!.textContent).toContain('1 keepsake');
  });

  it('marks a booked ticket as kept from the booking and never shows its reference', () => {
    const root = mount();
    const train = root.querySelector('#keep_booking_itm_testtrain01')!;
    expect(train.textContent).toContain('Kept automatically from your booking');
    expect(root.textContent).not.toContain('TEST-TRAIN-4');
    expect(root.textContent).not.toContain('TEST-123');
  });

  it('offers a Keepsake button in the dock and "Keep as a keepsake" on a moment', () => {
    const root = mount();
    const dock = [...root.querySelectorAll('.story-dock button')].map((b) => b.textContent || b.getAttribute('aria-label'));
    expect(dock).toEqual(['Keepsake', 'Add photos', 'Moment']);
    (root.querySelector('#mom_lparch001 .story-moment__more') as HTMLButtonElement).click();
    const row = [...root.querySelectorAll<HTMLButtonElement>('.story-sheet__row')].find((r) => r.textContent?.includes('Keep as a keepsake'))!;
    row.click();
    expect(root.querySelector('[aria-label="Keep as a keepsake"]')).not.toBeNull();
    expect(root.textContent).not.toMatch(/souvenir/i);
  });

  it('stays on Keepsakes after one is removed, and Trash can bring it back (V7)', async () => {
    const root = mount();
    (root.querySelector('[data-story-view="keepsakes"]') as HTMLButtonElement).click();
    expect(root.querySelector('[data-keepsake-board]')).not.toBeNull();
    expect(root.querySelector('.keep-board__count')!.textContent).toBe('6 kept, 2 of them from your bookings');

    (root.querySelector('[data-keepsake-id="booking_itm_testtrain01"]') as HTMLButtonElement).click();
    const remove = [...root.querySelectorAll<HTMLButtonElement>('.story-sheet__row')].find((r) => r.textContent?.includes('Remove from keepsakes'))!;
    remove.click();
    await vi.waitFor(() => expect(root.querySelector('.keep-board__count')!.textContent).toBe('5 kept, 1 of them from your bookings'));
    expect(root.getAttribute('data-story-showing') ?? root.querySelector('[data-story-showing]')?.getAttribute('data-story-showing')).toBe('keepsakes');
    expect(root.querySelector('[data-keepsake-id="booking_itm_testtrain01"]')).toBeNull();

    // Trash lists it, and Restore puts it back on the board.
    (root.querySelector('.story-ribbon__more') as HTMLButtonElement).click();
    [...root.querySelectorAll<HTMLButtonElement>('.story-sheet__row')].find((r) => r.textContent?.includes('Trash'))!.click();
    const card = [...root.querySelectorAll('.journal-trash__card')].find((c) => c.textContent?.includes('Test Rail IC200'))!;
    expect(card.textContent).not.toContain('Delete permanently');
    [...card.querySelectorAll('button')].find((b) => b.textContent === 'Restore')!.click();
    await vi.waitFor(() => expect(root.querySelector('[data-keepsake-id="booking_itm_testtrain01"]')).not.toBeNull());
  });
});
