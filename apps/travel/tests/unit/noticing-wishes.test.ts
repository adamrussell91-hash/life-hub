import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JournalDocument } from '@/api/journal';
import { lisbonPortoJournal } from '@/journal/fixtures/lisbon-porto';
import { TICK_FAILED } from '@/journal/noticing/cards';
import {
  ASK_TRIES,
  cardsToOffer,
  dismissCard,
  keepCard,
  readNoticingState,
  recordAsked,
  recordTry,
  shouldAsk,
  type NoticeCard,
} from '@/journal/noticing/model';
import { closeAllJournalOverlays } from '@/journal/overlay-host';
import { renderJournal } from '@/journal/render-journal';
import type { Trip } from '@/types';
import testTrip from '../../fixtures/test-trip.json';

const trip = testTrip as unknown as Trip;
const journal = (): JournalDocument => lisbonPortoJournal(trip.id) as JournalDocument;

const wish: NoticeCard = {
  key: 'wish:tsk_train:itm_testtrain01', kind: 'wish', source: 'wishes', sourceLabel: 'From your bucket list', day: '2027-03-05',
  headline: 'Ride a train along a river', body: 'You have wanted this since 2024.',
  evidence: { label: 'On your itinerary today', text: 'Lisbon to Porto (Lisbon)' },
  basis: 'Added to your bucket list on 14 March 2024', wish: { taskId: 'tsk_train', list: 'bucket_list' }, score: 100,
};

afterEach(() => {
  closeAllJournalOverlays();
  document.body.replaceChildren();
});

describe('asking once a day', () => {
  it('asks a day once, keeps what came back, and leaves a failing day after two tries', () => {
    let j = journal();
    expect(shouldAsk(readNoticingState(j), 'wishes', '2027-03-05')).toBe(true);
    j = recordTry(j, 'wishes', '2027-03-05');
    expect(shouldAsk(readNoticingState(j), 'wishes', '2027-03-05')).toBe(true);
    j = recordTry(j, 'wishes', '2027-03-05');
    expect(readNoticingState(j).tries['wishes:2027-03-05']).toBe(ASK_TRIES);
    expect(shouldAsk(readNoticingState(j), 'wishes', '2027-03-05')).toBe(false);
    expect(shouldAsk(readNoticingState(j), 'wishes', '2027-03-06')).toBe(true);

    let k = recordAsked(journal(), 'wishes', '2027-03-05', [wish]);
    expect(shouldAsk(readNoticingState(k), 'wishes', '2027-03-05')).toBe(false);
    expect(shouldAsk(readNoticingState(k), 'photos', '2027-03-05')).toBe(true);
    expect(cardsToOffer([], readNoticingState(k)).map((c) => c.key)).toEqual([wish.key]);
    // Turned down or kept, it is no longer waiting, and is not brought back by a later answer.
    k = dismissCard(k, wish.key);
    expect(cardsToOffer([], readNoticingState(k))).toEqual([]);
    k = recordAsked(k, 'wishes', '2027-03-06', [wish]);
    expect(cardsToOffer([], readNoticingState(k))).toEqual([]);
    expect(cardsToOffer([], readNoticingState(keepCard(recordAsked(journal(), 'wishes', '2027-03-05', [wish]), wish)))).toEqual([]);
  });
});

async function mount(options: { hour: number; today?: string; ask?: ReturnType<typeof vi.fn>; tick?: ReturnType<typeof vi.fn> }) {
  const root = document.createElement('div');
  document.body.append(root);
  const ask = options.ask ?? vi.fn(async () => [wish]);
  const tick = options.tick ?? vi.fn(async () => ({}));
  renderJournal(root, {
    fixture: lisbonPortoJournal(trip.id), trip, today: options.today ?? '2027-03-05', localHour: options.hour,
    askNoticing: ask as never, tickWish: tick as never,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { root, ask, tick };
}

const pill = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('[data-notice-pill]');
const dialog = () => document.querySelector<HTMLElement>('.notice')!;
const press = (label: string) =>
  [...dialog().querySelectorAll<HTMLButtonElement>('button')].find((b) => (b.textContent || b.getAttribute('aria-label')) === label && !b.hidden)!.click();

describe('bucket list and dreams jar in the journal', () => {
  it('does not ask during the day, asks once in the evening, and asks the morning after', async () => {
    const midday = await mount({ hour: 12 });
    expect(midday.ask).not.toHaveBeenCalled();
    const evening = await mount({ hour: 18 });
    expect(evening.ask).toHaveBeenCalledTimes(1);
    expect(evening.ask).toHaveBeenCalledWith('wishes', '2027-03-05');
    const morningAfter = await mount({ hour: 8, today: '2027-03-08' }); // the last journaled day is the 6th
    expect(morningAfter.ask).toHaveBeenCalledWith('wishes', '2027-03-06');
    const before = await mount({ hour: 20, today: '2027-03-01' });
    expect(before.ask).not.toHaveBeenCalled();
  });

  it('shows the wish first, with the owner’s own words as evidence, and ticks it off only on the tap', async () => {
    const { root, tick } = await mount({ hour: 19 });
    await vi.waitFor(() => expect(pill(root)!.textContent).toBe('2 things noticed today')); // the wish, and halfway
    expect(tick).not.toHaveBeenCalled();
    pill(root)!.click();
    expect(dialog().querySelector('.notice-face__source')!.textContent).toBe('From your bucket list');
    expect(dialog().querySelector('.notice-face__headline')!.textContent).toBe('Ride a train along a river');
    expect(dialog().querySelector('.notice-face__body')!.textContent).toBe('You have wanted this since 2024.');
    expect(dialog().querySelector('.notice-face__evidence')!.textContent).toBe('On your itinerary todayLisbon to Porto (Lisbon)');
    expect([...dialog().querySelectorAll('.notice__action')].map((b) => b.textContent)).toEqual(['Not this one', 'Tick it off in Tasks']);

    press('Tick it off in Tasks');
    await vi.waitFor(() => expect(dialog().querySelector('.notice__action--keep')!.textContent).toBe('Ticked off in Tasks'));
    expect(tick).toHaveBeenCalledTimes(1);
    expect(tick).toHaveBeenCalledWith('tsk_train');
    expect(dialog().querySelector('.notice-face__ticked')!.textContent).toBe('Ticked off in Tasks');
    press('Close');
    // It stays in the story as a memento, marked as ticked off.
    await vi.waitFor(() => expect(root.querySelector('[data-noticed^="wish:"]')).not.toBeNull());
    expect(root.querySelector('[data-noticed^="wish:"] .notice-face__ticked')).not.toBeNull();
  });

  it('keeps a wish waiting when the cards are closed without an answer', async () => {
    const { root, tick } = await mount({ hour: 19 });
    await vi.waitFor(() => expect(pill(root)!.textContent).toBe('2 things noticed today'));
    pill(root)!.click();
    press('Next'); // on to Halfway, then close
    press('Close');
    await vi.waitFor(() => expect(pill(root)?.textContent).toBe('1 thing noticed today'));
    expect(tick).not.toHaveBeenCalled();
    pill(root)!.click();
    expect(dialog().querySelector('.notice-face__headline')!.textContent).toBe('Ride a train along a river');
    press('Not this one');
    await vi.waitFor(() => expect(pill(root)).toBeNull());
    expect(tick).not.toHaveBeenCalled();
  });

  it('says so when Tasks cannot be reached, and ticks nothing off', async () => {
    const tick = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({});
    const { root } = await mount({ hour: 19, tick });
    await vi.waitFor(() => expect(pill(root)).not.toBeNull());
    pill(root)!.click();
    press('Tick it off in Tasks');
    await vi.waitFor(() => expect(dialog().querySelector('.notice__status')!.textContent).toBe(TICK_FAILED));
    expect(dialog().querySelector('.notice-face__ticked')).toBeNull();
    press('Try again');
    await vi.waitFor(() => expect(dialog().querySelector('.notice-face__ticked')).not.toBeNull());
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it('does not ask again once a day has been answered, and gives up quietly on a failing day', async () => {
    const failing = vi.fn(async () => { throw new Error('model down'); });
    const { root } = await mount({ hour: 19, ask: failing });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(failing).toHaveBeenCalledTimes(1);
    expect(root.querySelector('[data-import-strip]')!.hasAttribute('hidden')).toBe(true); // no error shown for a missing noticing
    expect(pill(root)!.textContent).toBe('1 thing noticed today'); // counting cards still work
  });
});

describe('seen in the photos', () => {
  /** The fixture with eight more backed-up photos on 5 March. */
  function busyDay() {
    const j = lisbonPortoJournal(trip.id);
    const moment = j.moments.find((m) => m.local_date === '2027-03-05' && m.lifecycle === 'live' && m.author !== 'partner')!;
    const extra = Array.from({ length: 8 }, (_, i) => ({
      id: `med_busy${i}`, lifecycle: 'live' as const, content_type: 'image/jpeg', width: 800, height: 600, upload_state: 'backed_up' as const,
      url: '/api/mock-photo/ribeira.jpg',
    }));
    return {
      ...j,
      media: [...j.media, ...extra],
      moments: j.moments.map((m) => (m.id === moment.id ? { ...m, media_ids: [...m.media_ids, ...extra.map((e) => e.id)] } : m)),
    };
  }
  const seen: NoticeCard = {
    key: 'photos:2027-03-05:med_busy0.med_busy1.med_busy2', kind: 'photos', source: 'photos', day: '2027-03-05',
    headline: 'A yellow tram in four of today’s photos',
    photos: [{ tripId: trip.id, mediaId: 'med_busy0' }, { tripId: trip.id, mediaId: 'med_busy1' }, { tripId: trip.id, mediaId: 'med_busy2' }],
    basis: 'Seen in 4 of today’s 11 photos', score: 55,
  };

  it('asks about the photos after the wishes, only on a day with enough of them', async () => {
    const quiet = await mount({ hour: 19, ask: vi.fn(async () => []) });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(quiet.ask.mock.calls.map((c) => c[0])).toEqual(['wishes']); // too few photos that day

    const root = document.createElement('div');
    document.body.append(root);
    const ask = vi.fn(async (kind: string) => (kind === 'photos' ? [seen] : []));
    renderJournal(root, { fixture: busyDay(), trip, today: '2027-03-05', localHour: 19, askNoticing: ask as never });
    await vi.waitFor(() => expect(ask.mock.calls.map((c) => c[0])).toEqual(['wishes', 'photos']));
    await vi.waitFor(() => expect(pill(root)?.textContent).toMatch(/things noticed today/));
    pill(root)!.click();
    // Best first: counting cards about the day may come before it; find the photos card.
    for (let i = 0; i < 5 && dialog().querySelector('.notice-face__source')!.textContent !== 'Claude noticed in today’s photos'; i += 1) press('Next');
    expect(dialog().querySelector('.notice-face__headline')!.textContent).toBe('A yellow tram in four of today’s photos');
    expect(dialog().querySelector('.notice-face__basis')!.textContent).toBe('Seen in 4 of today’s 11 photos');
    expect(dialog().querySelectorAll('.notice-face__photo img')).toHaveLength(3);
    expect([...dialog().querySelectorAll('.notice__action')].map((b) => b.textContent)).toEqual(['Not right', 'Keep in the story']);
  });
});
