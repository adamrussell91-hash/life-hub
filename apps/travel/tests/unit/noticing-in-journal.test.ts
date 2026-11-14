import { afterEach, describe, expect, it, vi } from 'vitest';
import { lisbonPortoJournal } from '@/journal/fixtures/lisbon-porto';
import { closeAllJournalOverlays } from '@/journal/overlay-host';
import { renderJournal } from '@/journal/render-journal';
import type { NoticingHistory } from '@/journal/noticing/rules';
import type { Trip } from '@/types';
import testTrip from '../../fixtures/test-trip.json';

const trip = testTrip as unknown as Trip;

const history: NoticingHistory = {
  trips: [{ id: 'trp_past0001', title: 'Invented north', start_date: '2026-03-01', end_date: '2026-03-06', days: 6, cities: [{ name: 'Hanoi', country: 'Vietnam', start_date: '2026-03-01', end_date: '2026-03-06' }] }],
  days: [{ trip_id: 'trp_past0001', date: '2026-03-05', city: 'Hanoi', country: 'Vietnam', photos: 4, first_time: '09:00', last_time: '20:00', north: null, south: null, photo_ids: ['med_p1', 'med_p2'] }],
};

async function mount(today: string, withHistory = true): Promise<HTMLElement> {
  const root = document.createElement('div');
  document.body.append(root);
  renderJournal(root, {
    fixture: lisbonPortoJournal(trip.id), trip, today,
    loadNoticingHistory: withHistory ? async () => history : undefined,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return root;
}

const pill = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('[data-notice-pill]');
const dialog = () => document.querySelector<HTMLElement>('.notice');
const headline = () => dialog()!.querySelector('.notice-face__headline')!.textContent;
const press = (label: string) =>
  [...dialog()!.querySelectorAll<HTMLButtonElement>('button')].find((b) => (b.textContent || b.getAttribute('aria-label')) === label && !b.hidden)!.click();

afterEach(() => {
  closeAllJournalOverlays();
  document.body.replaceChildren();
});

describe('noticing in the journal', () => {
  it('shows nothing at all when there is nothing to notice', async () => {
    const before = await mount('2027-03-01'); // the trip has not started
    expect(pill(before)).toBeNull();
    expect(before.querySelector('.story-notice-host')!.children).toHaveLength(0);
    expect(before.textContent).not.toMatch(/noticed/i);
    const after = await mount('2027-03-20'); // long over
    expect(pill(after)).toBeNull();
  });

  it('offers a pill for today’s cards, best first, each with its source and what it rests on', async () => {
    const root = await mount('2027-03-05'); // day 3 of 5, a year after a day in the earlier journal
    expect(pill(root)!.textContent).toBe('2 things noticed today');
    pill(root)!.click();
    expect(dialog()!.getAttribute('aria-label')).toBe('Noticed today');
    expect(headline()).toBe('A year ago today you were in Hanoi');
    expect(dialog()!.querySelector('.notice-face__source')!.textContent).toBe('From your past trips');
    expect(dialog()!.querySelector('.notice-face__basis')!.textContent).toContain('in your journal of Invented north');
    expect(dialog()!.querySelectorAll('.notice-face__photo img')).toHaveLength(2);
    expect(dialog()!.querySelector('.notice__count')!.textContent).toBe('1 of 2');
    press('Next');
    expect(headline()).toBe('Halfway');
    expect(dialog()!.querySelector('.notice-face__source')!.textContent).toBe('From this trip');
  });

  it('only makes cards about this trip when the history cannot be loaded', async () => {
    const root = await mount('2027-03-05', false);
    expect(pill(root)!.textContent).toBe('1 thing noticed today');
  });

  it('keeps one card in the story, drops one marked not right, and never offers either again', async () => {
    const root = await mount('2027-03-05');
    pill(root)!.click();
    press('Keep in the story');
    expect([...dialog()!.querySelectorAll('button')].find((b) => b.textContent === 'Kept in the story')!.disabled).toBe(true);
    press('Next');
    press('Not right');
    expect(dialog()!.querySelector('.notice__count')!.textContent).toBe('1 of 1'); // back on the kept card
    press('Close');
    await vi.waitFor(() => expect(root.querySelector('[data-noticed]')).not.toBeNull());

    const band = root.querySelector('#day_lp0305 [data-noticed]') as HTMLElement;
    expect(band.getAttribute('data-noticed')).toMatch(/^on-this-day:/);
    expect(band.querySelector('h3')!.textContent).toBe('A year ago today you were in Hanoi');
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(pill(root)).toBeNull();
    expect(root.textContent).not.toContain('Halfway');

    // Removing it from the story does not bring the pill back.
    (band.querySelector('.story-noticed__remove') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(root.querySelector('[data-noticed]')).toBeNull());
    expect(pill(root)).toBeNull();
  });

  it('marks cards seen when they are closed without a choice', async () => {
    const root = await mount('2027-03-05');
    pill(root)!.click();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    // Only the first card was looked at, so the second is still waiting.
    await vi.waitFor(() => expect(pill(root)?.textContent).toBe('1 thing noticed today'));
    pill(root)!.click();
    expect(headline()).toBe('Halfway');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); // past the last card closes
    await vi.waitFor(() => expect(pill(root)).toBeNull());
    expect(dialog()).toBeNull();
  });
});
