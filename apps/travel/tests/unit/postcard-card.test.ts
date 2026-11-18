import { afterEach, describe, expect, it, vi } from 'vitest';
import fixtureTrip from '../../fixtures/test-trip.json';
import type { Trip } from '@/types';
import { FRONT_MS, TURN_MS, formatClipClock, pickTextSize, renderPostcard } from '@/postcard/card';
import { postcardFacts, type PostcardView } from '@/postcard/model';

const trip = fixtureTrip as unknown as Trip;

const view = (extra: Partial<PostcardView> = {}): PostcardView => ({
  id: 'chk_a',
  itemId: 'itm_testtodo01',
  cityId: 'lis',
  title: 'Book Belém tram tickets',
  at: '2027-03-04T11:30:00.000Z',
  photoId: 'tph_p1',
  orientation: 'portrait',
  address: ['Rua do Exemplo', 'Alfama', '1100-000 Lisboa', 'Portugal'],
  text: 'All good here.',
  ...extra
});

function draw(card: PostcardView, more: Partial<Parameters<typeof renderPostcard>[0]> = {}) {
  return renderPostcard({
    card,
    facts: postcardFacts(trip, card),
    media: { photoUrl: 'https://api.example/api/travel-photo?id=tph_p1', audioUrl: card.audioId ? 'https://api.example/api/travel-audio?id=tau_a1' : undefined },
    reducedMotion: true,
    ...more
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('renderPostcard', () => {
  it('draws the address, the words, the stamp and the postmark', () => {
    const { el } = draw(view());
    expect(el.dataset.orient).toBe('portrait');
    expect([...el.querySelectorAll('.postcard__lines--full span')].map((s) => s.textContent)).toEqual([
      'Rua do Exemplo',
      'Alfama',
      '1100-000 Lisboa',
      'Portugal'
    ]);
    expect([...el.querySelectorAll('.postcard__lines--short span')].map((s) => s.textContent)).toEqual([
      'Rua do Exemplo, Alfama',
      '1100-000 Lisboa, Portugal'
    ]);
    expect(el.querySelector('.postcard__text')!.textContent).toBe('All good here.');
    expect(el.querySelector('.postcard-stamp__day')!.textContent).toBe('Day 2');
    expect(el.querySelector('.postcard-postmark')!.textContent).toContain('LISBON');
    expect(el.querySelector('.postcard-postmark')!.textContent).toContain('4 MAR');
  });

  it('loads the photo naming its origin', () => {
    const img = draw(view()).el.querySelector<HTMLImageElement>('.postcard__photo')!;
    expect(img.crossOrigin).toBe('use-credentials');
    expect(img.src).toContain('id=tph_p1');
    expect(img.alt).toBe('Photo from Book Belém tram tickets');
  });

  it('writes the words and the address as text, never as markup', () => {
    const { el } = draw(view({ text: '<img src=x onerror=alert(1)> hello', address: ['<b>Rua</b>'] }));
    expect(el.querySelector('.postcard__text img')).toBeNull();
    expect(el.querySelector('.postcard__lines--full b')).toBeNull();
    expect(el.querySelector('.postcard__lines--full span')!.textContent).toBe('<b>Rua</b>');
  });

  it('has no play row without a clip, and a labelled play button with one', () => {
    expect(draw(view()).el.querySelector('.postcard__play')).toBeNull();
    const { el } = draw(view({ audioId: 'tau_a1', audioS: 28 }));
    const play = el.querySelector<HTMLButtonElement>('.postcard__play-btn')!;
    expect(play.getAttribute('aria-label')).toBe('Play the voice message');
    expect(el.querySelector('.postcard__time')!.textContent).toBe('0:28');
    expect(el.querySelector<HTMLElement>('.postcard__audio-error')!.hidden).toBe(true);
    // Nothing is fetched until play is pressed.
    expect(el.querySelector('audio')!.getAttribute('src')).toBeNull();
  });

  it('says so when the voice cannot be played, and keeps the words', async () => {
    const { el } = draw(view({ audioId: 'tau_a1', audioS: 28 }));
    const audio = el.querySelector('audio')!;
    audio.play = () => Promise.reject(new Error('NotSupportedError'));
    el.querySelector<HTMLButtonElement>('.postcard__play-btn')!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(audio.crossOrigin).toBe('use-credentials');
    expect(el.querySelector<HTMLElement>('.postcard__audio-error')!.hidden).toBe(false);
    expect(el.querySelector('.postcard__text')!.textContent).toBe('All good here.');
  });

  it('with reduced motion: starts on the front, waits to be turned, and the words are simply there', () => {
    vi.useFakeTimers();
    const onBackShown = vi.fn();
    const card = draw(view(), { onBackShown });
    vi.advanceTimersByTime(FRONT_MS * 3);
    expect(card.isBack()).toBe(false);
    expect(card.el.querySelector<HTMLElement>('.postcard__back')!.inert).toBe(true);
    card.turn();
    expect(card.isBack()).toBe(true);
    expect(card.el.classList.contains('is-back')).toBe(true);
    expect(card.el.querySelector<HTMLElement>('.postcard__back')!.inert).toBe(false);
    expect([...card.el.querySelectorAll('.postcard__word')].every((w) => w.classList.contains('is-on'))).toBe(true);
    expect(onBackShown).toHaveBeenCalledTimes(1);
    card.turn();
    card.turn();
    expect(onBackShown).toHaveBeenCalledTimes(1);
  });

  it('turns itself over after a moment, then writes every word on and rests', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const card = draw(view({ text: 'one two three four five six' }), { reducedMotion: false });
    const words = () => [...card.el.querySelectorAll('.postcard__word')];
    expect(card.isBack()).toBe(false);
    vi.advanceTimersByTime(FRONT_MS);
    expect(card.isBack()).toBe(true);
    expect(words().some((w) => w.classList.contains('is-on'))).toBe(false);
    vi.advanceTimersByTime(TURN_MS + 4000);
    expect(words().every((w) => w.classList.contains('is-on'))).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a tap on the card turns it; a tap on the play button does not', () => {
    const card = draw(view({ audioId: 'tau_a1', audioS: 10 }));
    card.el.querySelector<HTMLElement>('.postcard__front')!.click();
    expect(card.isBack()).toBe(true);
    card.el.querySelector('audio')!.play = () => Promise.resolve();
    card.el.querySelector<HTMLButtonElement>('.postcard__play-btn')!.click();
    expect(card.isBack()).toBe(true);
  });

  it('reads the shape off a photo from before postcards', () => {
    const { el } = draw(view({ orientation: undefined }));
    const img = el.querySelector<HTMLImageElement>('.postcard__photo')!;
    Object.defineProperty(img, 'naturalWidth', { value: 1600 });
    Object.defineProperty(img, 'naturalHeight', { value: 1200 });
    img.dispatchEvent(new Event('load'));
    expect(el.dataset.orient).toBe('landscape');
  });
});

describe('fitting and clocks', () => {
  it('picks the largest size that fits, or the smallest when none do', () => {
    expect(pickTextSize((size) => size <= 1.7)).toBe(1.7);
    expect(pickTextSize(() => true)).toBe(2);
    expect(pickTextSize(() => false)).toBe(1.5);
  });

  it('formats a clip length', () => {
    expect(formatClipClock(28)).toBe('0:28');
    expect(formatClipClock(61.9)).toBe('1:01');
    expect(formatClipClock(Number.NaN)).toBe('0:00');
  });
});
