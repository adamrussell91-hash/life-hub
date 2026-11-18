import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixtureTrip from '../../fixtures/test-trip.json';
import type { Trip } from '@/types';
import type { PostcardView } from '@/postcard/model';
import { markSeen, readSeen, unseenPostcards } from '@/postcard/seen';
import { stackLines, renderPostcardStack } from '@/postcard/stack';
import { openPostcardViewer, startIndex } from '@/postcard/viewer';
import { closeAllJournalOverlays } from '@/journal/overlay-host';

const trip = fixtureTrip as unknown as Trip;

const view = (id: string, at: string, extra: Partial<PostcardView> = {}): PostcardView => ({
  id,
  itemId: 'itm_testtodo01',
  cityId: 'lis',
  title: 'Book Belém tram tickets',
  at,
  photoId: `tph_${id}`,
  orientation: 'portrait',
  address: ['Rua do Exemplo', 'Lisboa'],
  ...extra
});
const cards = [
  view('a', '2027-03-04T09:00:00.000Z'),
  view('b', '2027-03-04T12:00:00.000Z'),
  view('c', '2027-03-04T21:40:00.000Z', { audioId: 'tau_c', audioS: 28, itemId: 'itm_testfood01' })
];

const reduceMotion = (): void => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), addEventListener() {}, removeEventListener() {} }));
};
const panel = (): HTMLElement => document.querySelector<HTMLElement>('.postcard-viewer__panel')!;
const byText = (text: string): HTMLButtonElement =>
  [...panel().querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement;

beforeEach(() => {
  localStorage.clear();
  reduceMotion();
});
afterEach(() => {
  closeAllJournalOverlays();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('seen', () => {
  it('remembers what this browser opened, per trip', () => {
    expect(unseenPostcards('trp_1', cards).map((c) => c.id)).toEqual(['a', 'b', 'c']);
    markSeen('trp_1', 'a');
    markSeen('trp_1', 'a');
    expect([...readSeen('trp_1')!]).toEqual(['a']);
    expect(unseenPostcards('trp_1', cards).map((c) => c.id)).toEqual(['b', 'c']);
    expect(unseenPostcards('trp_2', cards)).toHaveLength(3);
  });

  it('marks nothing new when the browser refuses storage', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('denied');
      },
      setItem() {
        throw new Error('denied');
      }
    });
    expect(readSeen('trp_1')).toBeNull();
    expect(unseenPostcards('trp_1', cards)).toEqual([]);
    expect(() => markSeen('trp_1', 'a')).not.toThrow();
  });
});

describe('startIndex', () => {
  it('opens at the asked-for card, else the oldest unopened, else the newest', () => {
    expect(startIndex(cards, new Set(), 'b')).toBe(1);
    expect(startIndex(cards, new Set(['a']))).toBe(1);
    expect(startIndex(cards, new Set(['a', 'b', 'c']))).toBe(2);
    expect(startIndex(cards, null)).toBe(2);
    expect(startIndex(cards, new Set(), 'gone')).toBe(0);
  });
});

describe('stack wording', () => {
  it('counts the unopened ones, then just counts', () => {
    expect(stackLines(trip, cards, 3).heading).toBe('3 new postcards');
    expect(stackLines(trip, cards, 1).heading).toBe('1 new postcard');
    expect(stackLines(trip, cards, 0).heading).toBe('3 postcards');
    expect(stackLines(trip, cards.slice(0, 1), 0).heading).toBe('1 postcard');
  });

  it('names the latest one, its local time and its voice', () => {
    expect(stackLines(trip, cards, 0)).toMatchObject({ latest: 'Latest: Rua do Exemplo, Lisbon', detail: '21:40 · 28 seconds of voice' });
    expect(stackLines(trip, cards.slice(0, 2), 0).detail).toBe('12:00');
  });

  it('is one button, with up to three cards fanned, and nothing at all without postcards', () => {
    const host = document.createElement('div');
    const onOpen = vi.fn();
    renderPostcardStack(host, { trip, cards, shareToken: 'tok', onOpen });
    const open = host.querySelector<HTMLButtonElement>('button.postcard-stack')!;
    expect(host.querySelectorAll('button')).toHaveLength(1);
    expect(open.querySelectorAll('.postcard-stack__card img')).toHaveLength(3);
    expect(open.querySelector<HTMLImageElement>('img')!.src).toContain('token=tok');
    expect(open.textContent).toContain('3 new postcards');
    open.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
    renderPostcardStack(host, { trip, cards: [], onOpen });
    expect(host.children).toHaveLength(0);
  });
});

describe('openPostcardViewer', () => {
  it('opens inside its backdrop at the oldest unopened card, with its place and time in words', () => {
    markSeen(trip.id, 'a');
    openPostcardViewer({ trip, cards, shareToken: 'tok', trackSeen: true });
    const back = document.querySelector('.postcard-viewer')!;
    expect(back.contains(panel())).toBe(true);
    expect(panel().getAttribute('role')).toBe('dialog');
    expect(panel().querySelector('.postcard-viewer__count')!.textContent).toBe('2 of 3');
    expect(panel().querySelector('.postcard-viewer__caption')!.textContent).toBe('Rua do Exemplo, LisbonThu 4 Mar, 12:00');
    expect(panel().querySelector<HTMLImageElement>('.postcard__photo')!.src).toContain('token=tok');
  });

  it('moves older and newer, stopping at the ends', () => {
    openPostcardViewer({ trip, cards, startId: 'a' });
    expect(byText('Older').disabled).toBe(true);
    byText('Newer').click();
    byText('Newer').click();
    expect(panel().querySelector('.postcard-viewer__count')!.textContent).toBe('3 of 3');
    expect(byText('Newer').disabled).toBe(true);
    panel().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(panel().querySelector('.postcard-viewer__count')!.textContent).toBe('2 of 3');
    expect(panel().querySelectorAll('.postcard')).toHaveLength(1);
  });

  it('jumps from the row of small cards, and marks the unopened ones', () => {
    markSeen(trip.id, 'a');
    openPostcardViewer({ trip, cards, startId: 'a', trackSeen: true });
    const thumbs = () => [...panel().querySelectorAll<HTMLButtonElement>('.postcard-thumb')];
    expect(thumbs().map((t) => [t.classList.contains('is-current'), t.classList.contains('is-new')])).toEqual([
      [true, false],
      [false, true],
      [false, true]
    ]);
    thumbs()[2]!.click();
    expect(panel().querySelector('.postcard-viewer__count')!.textContent).toBe('3 of 3');
  });

  it('counts a card as opened once its back has been shown', () => {
    openPostcardViewer({ trip, cards, startId: 'b', trackSeen: true });
    expect(readSeen(trip.id)!.has('b')).toBe(false);
    byText('Turn over').click();
    expect(readSeen(trip.id)!.has('b')).toBe(true);
    expect(byText('Turn back to the photo')).toBeTruthy();
  });

  it('has no row and no Older or Newer for a single card, and no Remove for followers', () => {
    openPostcardViewer({ trip, cards: cards.slice(0, 1) });
    expect(panel().querySelector<HTMLElement>('.postcard-viewer__strip')!.hidden).toBe(true);
    expect(byText('Older').hidden).toBe(true);
    expect(panel().querySelector<HTMLElement>('.postcard-viewer__remove')!.hidden).toBe(true);
  });

  it('asks before removing, in the view itself, and closes once it is gone', async () => {
    const onRemove = vi.fn(async () => undefined);
    const onClose = vi.fn();
    openPostcardViewer({ trip, cards, startId: 'b', onRemove, onClose });
    byText('Remove postcard').click();
    const confirm = panel().querySelector<HTMLElement>('.postcard-viewer__confirm')!;
    expect(confirm.hidden).toBe(false);
    expect(confirm.textContent).toContain('Its photo and voice are deleted for everyone on the link.');
    byText('Keep').click();
    expect(confirm.hidden).toBe(true);
    expect(onRemove).not.toHaveBeenCalled();

    byText('Remove postcard').click();
    byText('Remove').click();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onRemove).toHaveBeenCalledWith(cards[1]);
    expect(document.querySelector('.postcard-viewer')).toBeNull();
  });

  it('says why a removal failed and stays open', async () => {
    const onRemove = vi.fn(async () => {
      throw new Error("Couldn't reach the server. Check your signal and try again.");
    });
    openPostcardViewer({ trip, cards, startId: 'b', onRemove });
    byText('Remove postcard').click();
    byText('Remove').click();
    await vi.waitFor(() =>
      expect(panel().querySelector<HTMLElement>('.postcard-viewer__confirm-error')!.hidden).toBe(false)
    );
    expect(panel().querySelector('.postcard-viewer__confirm-error')!.textContent).toBe(
      "Couldn't reach the server. Check your signal and try again."
    );
    expect(byText('Remove').disabled).toBe(false);
    expect(document.querySelector('.postcard-viewer')).not.toBeNull();
  });

  it('Close leaves the view and stays on the page', () => {
    const before = location.hash;
    openPostcardViewer({ trip, cards });
    byText('Close').click();
    expect(document.querySelector('.postcard-viewer')).toBeNull();
    expect(location.hash).toBe(before);
  });
});
