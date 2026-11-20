import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JournalDocument } from '@/api/journal';
import { boardCountLine } from '@/journal/keepsakes/board';
import { drawKeepsake, keepsakeLabel } from '@/journal/keepsakes/draw';
import { countKept, keepsakesForDay, listKeepsakes, postcardsOf, type PostcardKeepsake } from '@/journal/keepsakes/model';
import { lisbonPortoJournal } from '@/journal/fixtures/lisbon-porto';
import { closeAllJournalOverlays } from '@/journal/overlay-host';
import { renderJournal } from '@/journal/render-journal';
import type { Checkin, Trip } from '@/types';
import testTrip from '../../fixtures/test-trip.json';

const base = testTrip as unknown as Trip;

const posted = (id: string, itemId: string, cityId: string, at: string, extra: Partial<NonNullable<Checkin['postcard']>> = {}): Checkin => ({
  id,
  at,
  city_id: cityId,
  label: 'Safe',
  item_id: itemId,
  photo_id: `tph_${id}`,
  postcard: {
    photo_id: `tph_${id}`,
    orientation: 'landscape',
    address: ['Rua do Exemplo', 'Lisboa', 'Portugal'],
    posted_at: at,
    ...extra,
  },
});

/** A Lisbon postcard at 19:00 on 4 March, and a Porto one (portrait) on the 6th. */
const trip: Trip = {
  ...base,
  checkins: [
    posted('chk_lis1', 'itm_testfood01', 'lis', '2027-03-04T19:00:00.000Z', { text: 'Pastries for dinner.' }),
    posted('chk_opo1', 'itm_testcheckin01', 'opo', '2027-03-06T11:00:00.000Z', {
      orientation: 'portrait',
      address: ['Rua das Flores', 'Porto'],
    }),
  ],
};

const journal = (): JournalDocument => lisbonPortoJournal(trip.id) as unknown as JournalDocument;

afterEach(() => {
  closeAllJournalOverlays();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('postcard keepsakes, model', () => {
  it('keeps one per postcard, under the leg for its city, at the local time it was posted', () => {
    const cards = listKeepsakes(journal(), trip).filter((k): k is PostcardKeepsake => k.type === 'postcard');
    expect(cards.map((k) => [k.id, k.legId, k.localDate, k.localTime, k.placeName])).toEqual([
      ['postcard_chk_lis1', 'leg_lplisbon01', '2027-03-04', '19:00', 'Rua do Exemplo, Lisbon'],
      ['postcard_chk_opo1', 'leg_lpporto001', '2027-03-06', '11:00', 'Rua das Flores, Porto'],
    ]);
    expect(cards[0]!.card.text).toBe('Pastries for dinner.');
    expect(keepsakeLabel(cards[0]!)).toBe('Postcard from Rua do Exemplo, Lisbon');
  });

  it('reads the day in the leg’s time zone, across midnight (D2)', () => {
    const doc = journal();
    doc.legs = doc.legs.map((leg) => (leg.id === 'leg_lplisbon01' ? { ...leg, timezone: 'Asia/Kuala_Lumpur' } : leg));
    const late: Trip = { ...trip, checkins: [posted('chk_late', 'itm_testtodo01', 'lis', '2027-03-03T16:30:00.000Z')] };
    const k = listKeepsakes(doc, late).find((x): x is PostcardKeepsake => x.type === 'postcard')!;
    expect([k.localDate, k.localTime]).toEqual(['2027-03-04', '00:30']);
  });

  it('files a postcard whose city has no leg under no city', () => {
    const away: Trip = { ...trip, checkins: [{ ...posted('chk_x', 'itm_testtodo01', 'lis', '2027-03-04T10:00:00.000Z') }] };
    const doc = journal();
    doc.legs = doc.legs.filter((leg) => leg.city_id !== 'lis');
    const k = listKeepsakes(doc, away).find((x) => x.type === 'postcard')!;
    expect(k.legId).toBe('');
  });

  it('sits among the day’s keepsakes in time order, and counts as kept', () => {
    const all = listKeepsakes(journal(), trip);
    const day = keepsakesForDay(all, 'leg_lpporto001', '2027-03-06');
    expect(day.map((k) => k.id)).toContain('postcard_chk_opo1');
    expect(countKept(all)).toBe(countKept(listKeepsakes(journal(), base)) + 2);
    expect(postcardsOf(all).map((c) => c.id)).toEqual(['chk_lis1', 'chk_opo1']);
  });

  it('is not there without the trip, and leaves when its postcard is removed', () => {
    expect(listKeepsakes(journal()).some((k) => k.type === 'postcard')).toBe(false);
    expect(listKeepsakes(journal(), { ...trip, checkins: [] }).some((k) => k.type === 'postcard')).toBe(false);
  });

  it('names postcards on the board’s count line', () => {
    const all = listKeepsakes(journal(), trip);
    expect(boardCountLine(all)).toBe('8 kept, 2 from your bookings, 2 postcards');
    const onlyCards = all.filter((k) => k.type === 'postcard' || k.type === 'stamp');
    expect(boardCountLine(onlyCards)).toBe('2 postcards kept');
    expect(boardCountLine(all.filter((k) => k.type !== 'booking' && k.id !== 'postcard_chk_opo1'))).toBe('5 kept, 1 postcard');
  });
});

describe('postcard keepsakes, drawn', () => {
  it('draws the front with its photo through the API and a postmark in the city ink (W13)', () => {
    const k = listKeepsakes(journal(), trip).find((x): x is PostcardKeepsake => x.id === 'postcard_chk_opo1')!;
    const node = drawKeepsake(k, { tripId: trip.id, mediaById: new Map(), trip });
    expect(node.classList.contains('keepsake--postcard')).toBe(true);
    expect(node.dataset.orient).toBe('portrait');
    expect(node.getAttribute('aria-hidden')).toBe('true');
    const img = node.querySelector('img')!;
    expect(img.crossOrigin).toBe('use-credentials');
    expect(img.getAttribute('src')).toContain('tph_chk_opo1');
    expect(node.querySelector('.keepsake__postmark svg')!.textContent).toContain('PORTO');
  });
});

describe('postcard keepsakes, in the journal', () => {
  function mount(): HTMLElement {
    const root = document.createElement('div');
    document.body.append(root);
    renderJournal(root, { fixture: lisbonPortoJournal(trip.id), trip, today: '2027-03-06' });
    return root;
  }

  it('puts the postcard on its day in time order', () => {
    const root = mount();
    const order = [...root.querySelectorAll<HTMLElement>('#day_lp0304 [data-journal-moment], #day_lp0304 [data-keepsake-id]')].map(
      (n) => n.getAttribute('data-keepsake-id') ?? n.id,
    );
    const at = (id: string) => order.indexOf(id);
    expect(at('postcard_chk_lis1')).toBeGreaterThan(at('mom_lppartner'));
    expect(at('postcard_chk_lis1')).toBeLessThan(at('mom_lpfado001'));
    const row = root.querySelector('#keep_postcard_chk_lis1')!;
    expect(row.textContent).toContain('Kept: Postcard from Rua do Exemplo, Lisbon');
    expect(row.textContent).toContain('7:00 pm');
  });

  it('shows it on the board under its city, and opens the postcard itself without Remove (V6, V8)', () => {
    const root = mount();
    (root.querySelector('[data-story-view="keepsakes"]') as HTMLButtonElement).click();
    const sections = [...root.querySelectorAll('.keep-board__section')];
    const lisbon = sections.find((s) => s.textContent?.includes('Lisbon'))!;
    expect(lisbon.querySelector('[data-keepsake-id="postcard_chk_lis1"]')).not.toBeNull();

    (root.querySelector('[data-keepsake-id="postcard_chk_opo1"]') as HTMLButtonElement).click();
    const viewer = document.querySelector('.postcard-viewer')!;
    expect(viewer).not.toBeNull();
    expect(viewer.querySelector('.postcard-viewer__count')!.textContent).toBe('2 of 2');
    expect(viewer.querySelector('.postcard-viewer__caption')!.textContent).toContain('Rua das Flores, Porto');
    expect((viewer.querySelector('.postcard-viewer__remove') as HTMLElement).hidden).toBe(true);

    (viewer.querySelector('.postcard-viewer__close') as HTMLButtonElement).click();
    expect(document.querySelector('.postcard-viewer')).toBeNull();
    expect(root.querySelector('[data-keepsake-board]')).not.toBeNull();

    // Opening it again works after a close.
    (root.querySelector('[data-keepsake-id="postcard_chk_lis1"]') as HTMLButtonElement).click();
    expect(document.querySelector('.postcard-viewer__count')!.textContent).toBe('1 of 2');
  });
});
