import { describe, expect, it, vi } from 'vitest';
import { lisbonPortoJournal } from '@/journal/fixtures/lisbon-porto';
import { renderCover } from '@/journal/story/cover';
import { renderRibbon } from '@/journal/story/ribbon';
import { renderChapterOpener } from '@/journal/story/chapter-opener';
import { renderDayHeader } from '@/journal/story/day-header';
import { clampedRatio, renderPhotoRow } from '@/journal/story/photo-row';
import { formatClock, renderSoundPlayer } from '@/journal/story/sound-player';
import { momentMedia, renderMomentCard } from '@/journal/story/moment-card';
import { renderJourneyBand } from '@/journal/story/journey-band';
import type { Trip } from '@/types';
import testTrip from '../../fixtures/test-trip.json';

const journal = lisbonPortoJournal(testTrip.id);
const trip = testTrip as unknown as Trip;
const moment = (id: string) => journal.moments.find((m) => m.id === id)!;
const card = (id: string, extra: Partial<Parameters<typeof renderMomentCard>[0]> = {}) =>
  renderMomentCard({ fixture: journal, moment: moment(id), tripId: journal.trip_id, photoIndexOf: () => 0, ...extra });

describe('cover', () => {
  const base = { title: 'Lisbon & Porto', dates: '3 – 7 March 2027', eyebrow: 'Journal · Day 4 of 5', stats: ['4 days', '', '12 photos'], backHref: '#/trip/x', onSearch: () => {}, onOptions: () => {} };

  it('shows the eyebrow, title and facts it is given, skipping empty facts', () => {
    const cover = renderCover(base);
    expect(cover.querySelector('.story-eyebrow')?.textContent).toBe('Journal · Day 4 of 5');
    expect(cover.querySelector('h1')?.textContent).toBe('Lisbon & Porto');
    expect(cover.querySelector('.story-cover__stats')?.textContent).toBe('4 days · 12 photos');
  });

  it('uses a field of colour, and no image, when there is no photo', () => {
    const cover = renderCover({ ...base, accent: '#e8743b' });
    expect(cover.querySelector('img')).toBeNull();
    expect(cover.classList.contains('story-cover--plain')).toBe(true);
    expect(cover.style.getPropertyValue('--story-cover-accent')).toBe('#e8743b');
  });

  it('links back to the trip and wires search and options', () => {
    const onSearch = vi.fn();
    const onOptions = vi.fn();
    const cover = renderCover({ ...base, onSearch, onOptions });
    expect(cover.querySelector('a')?.getAttribute('href')).toBe('#/trip/x');
    (cover.querySelector('[aria-label="Search journal"]') as HTMLButtonElement).click();
    (cover.querySelector('[aria-label="Journal options"]') as HTMLButtonElement).click();
    expect(onSearch).toHaveBeenCalledOnce();
    expect(onOptions).toHaveBeenCalledOnce();
  });
});

describe('ribbon', () => {
  const groups = [
    { label: 'Lisbon', days: [{ id: 'd1', number: 1, label: 'Day 1, Wednesday 3 March', state: 'past' as const }, { id: 'd2', number: 2, label: 'Day 2', state: 'today' as const }] },
    { label: 'Porto', days: [{ id: 'd3', number: 3, label: 'Day 3', state: 'future' as const }] },
  ];
  const make = (over = {}) => renderRibbon({ groups, view: 'story', views: ['story', 'photos'], onDay: () => {}, onView: () => {}, onOptions: () => {}, ...over });

  it('draws one button per day under its city, with future days off', () => {
    const { el } = make();
    expect([...el.querySelectorAll('.story-ribbon__leg')].map((n) => n.textContent)).toEqual(['Lisbon', 'Porto']);
    const days = [...el.querySelectorAll<HTMLButtonElement>('[data-story-day]')];
    expect(days.map((d) => d.textContent)).toEqual(['1', '2', '3']);
    expect(days.map((d) => d.disabled)).toEqual([false, false, true]);
    expect(days[0]?.getAttribute('aria-label')).toBe('Day 1, Wednesday 3 March');
  });

  it('marks the current day and moves the mark', () => {
    const ribbon = make();
    ribbon.setCurrentDay('d1');
    expect(ribbon.el.querySelector('[aria-current="true"]')?.getAttribute('data-story-day')).toBe('d1');
    ribbon.setCurrentDay('d2');
    expect(ribbon.el.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
    expect(ribbon.el.querySelector('[aria-current="true"]')?.getAttribute('data-story-day')).toBe('d2');
    ribbon.setCurrentDay(null);
    expect(ribbon.el.querySelector('[aria-current="true"]')).toBeNull();
  });

  it('draws only the views it is given and reports taps', () => {
    const onDay = vi.fn();
    const onView = vi.fn();
    const ribbon = make({ onDay, onView });
    const views = [...ribbon.el.querySelectorAll<HTMLButtonElement>('[data-story-view]')];
    expect(views.map((v) => v.getAttribute('data-story-view'))).toEqual(['story', 'photos']);
    expect(views.map((v) => v.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    views[1]!.click();
    (ribbon.el.querySelector('[data-story-day="d2"]') as HTMLButtonElement).click();
    expect(onView).toHaveBeenCalledWith('photos');
    expect(onDay).toHaveBeenCalledWith('d2');
    ribbon.setView('photos');
    expect(views.map((v) => v.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
  });

  it('leaves the switch out when there is only one view', () => {
    expect(make({ views: ['story'] }).el.querySelector('.story-ribbon__views')).toBeNull();
  });
});

describe('chapter opener and day header', () => {
  it('names the chapter, with a pattern when there is one and a colour when not', () => {
    const plain = renderChapterOpener({ number: 2, name: 'Porto', dateRange: '5 – 7 March', counts: '2 days · 6 moments', accentSoft: '#dceafa' });
    expect(plain.querySelector('.story-eyebrow')?.textContent).toBe('Chapter 2 · 5 – 7 March');
    expect(plain.querySelector('h2')?.textContent).toBe('Porto');
    expect(plain.querySelector('.story-chapter__art--pattern')).toBeNull();
    const patterned = renderChapterOpener({ number: 1, name: 'Lisbon', dateRange: '', counts: '', patternHref: '/p.svg' });
    expect(patterned.querySelector('.story-chapter__art--pattern')).toBeTruthy();
    expect(patterned.querySelector('.story-eyebrow')?.textContent).toBe('Chapter 1');
    expect(patterned.querySelector('.story-chapter__counts')).toBeNull();
  });

  it('writes the day number, the date and the facts it has', () => {
    const header = renderDayHeader({ number: 3, date: 'Friday 5 March', isToday: true, facts: ['3 moments', '', 'sunset 6:28 pm'] });
    expect(header.querySelector('h3')?.textContent).toBe('Day 3Friday 5 March');
    expect(header.querySelector('.story-day__today')?.textContent).toBe('Today');
    expect(header.querySelector('.story-day__facts')?.textContent).toBe('3 moments · sunset 6:28 pm');
    const bare = renderDayHeader({ number: 0, date: 'Friday 5 March', isToday: false, facts: [] });
    expect(bare.querySelector('.story-day__number')).toBeNull();
    expect(bare.querySelector('.story-day__today')).toBeNull();
    expect(bare.querySelector('.story-day__facts')).toBeNull();
  });
});

describe('photos and sound', () => {
  it('keeps a photo within 4:5 and 3:2', () => {
    expect(clampedRatio({ width: 1000, height: 3000 })).toBeCloseTo(0.8);
    expect(clampedRatio({ width: 3000, height: 1000 })).toBeCloseTo(1.5);
    expect(clampedRatio({ width: 1000, height: 1000 })).toBe(1);
    expect(clampedRatio({})).toBe(1);
  });

  it('renders one photo alone and several as a row with a count', () => {
    const { photos } = momentMedia(journal, moment('mom_lpbridge1'));
    const row = renderPhotoRow({ tripId: 't', photos, indexOf: (id) => (id === photos[0]!.id ? 7 : 8), eager: true, label: 'Ponte' })!;
    const buttons = [...row.querySelectorAll('button')];
    expect(buttons.map((b) => b.getAttribute('data-photo-index'))).toEqual(['7', '8']);
    expect(row.querySelector('.story-photos__count')?.textContent).toBe('1 / 2');
    expect(buttons[0]?.getAttribute('aria-label')).toBe('Open photo: Ponte, 1 of 2');
    expect(buttons[0]?.querySelector('img')?.loading).toBe('eager');
    expect(buttons[1]?.querySelector('img')?.loading).toBe('lazy');
    const single = renderPhotoRow({ tripId: 't', photos: [photos[0]!], indexOf: () => 0, eager: false, label: '' })!;
    expect(single.querySelector('.story-photos__count')).toBeNull();
    expect(renderPhotoRow({ tripId: 't', photos: [], indexOf: () => 0, eager: false, label: '' })).toBeNull();
  });

  it('shows the clip length and draws no waveform', () => {
    expect(formatClock(24)).toBe('0:24');
    expect(formatClock(125)).toBe('2:05');
    const player = renderSoundPlayer({ src: 'data:audio/wav;base64,AA==', durationS: 24 });
    expect(player.querySelector('.story-sound__time')?.textContent).toBe('0:24');
    expect(player.querySelector('progress')).toBeTruthy();
    expect(player.querySelector('audio')?.preload).toBe('none');
    expect(player.querySelector('svg.wave, canvas, .wavebars')).toBeNull();
  });
});

describe('moment card', () => {
  it('orders a photo moment as photo, then time and place, then words', () => {
    const el = card('mom_lparch001');
    const order = [...el.children].map((c) => c.className.split(' ')[0]);
    expect(order).toEqual(['story-photos', 'story-moment__body']);
    expect(el.querySelector('.story-moment__time')?.textContent).toBe('9:40 am');
    expect(el.querySelector('.story-moment__place')?.textContent).toBe('Praça do Comércio');
    expect(el.id).toBe('mom_lparch001');
    expect(el.hasAttribute('data-journal-moment')).toBe(true);
  });

  it('puts the words first when there is no photo', () => {
    const el = card('mom_lpfado001');
    expect(el.classList.contains('story-moment--words')).toBe(true);
    const body = el.querySelector('.story-moment__body')!;
    expect(body.firstElementChild?.classList.contains('story-moment__words')).toBe(true);
  });

  it('shows a sound player for a clip, a meal chip for a meal, and the partner line for a partner moment', () => {
    expect(card('mom_lpgraca01').querySelectorAll('.story-sound')).toHaveLength(1);
    expect(card('mom_lpgraca01').querySelectorAll('.story-photo')).toHaveLength(1);
    const onMeal = vi.fn();
    const meal = card('mom_lpcafe001', { onMeal });
    (meal.querySelector('.story-moment__meal') as HTMLButtonElement).click();
    expect(onMeal).toHaveBeenCalledOnce();
    expect(card('mom_lparch001').querySelector('.story-moment__meal')).toBeNull();
    expect(card('mom_lppartner').querySelector('.story-moment__partner')?.textContent).toMatch(/not your words/);
  });

  it('offers actions only when it is given a handler', () => {
    expect(card('mom_lparch001').querySelector('[aria-label="Moment actions"]')).toBeNull();
    const onActions = vi.fn();
    const el = card('mom_lparch001', { onActions });
    (el.querySelector('[aria-label="Moment actions"]') as HTMLButtonElement).click();
    expect(onActions).toHaveBeenCalledOnce();
    expect(onActions.mock.calls[0]![0].id).toBe('mom_lparch001');
  });

  it('never renders user text as HTML', () => {
    const fixture = { ...journal, moments: [{ ...moment('mom_lparch001'), text: '<img src=x onerror=alert(1)>' }] };
    const el = renderMomentCard({ fixture, moment: fixture.moments[0]!, tripId: 't', photoIndexOf: () => 0 });
    expect(el.querySelector('.story-moment__words img')).toBeNull();
    expect(el.querySelector('.story-moment__words p')?.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('journey band', () => {
  const legsById = new Map(journal.legs.map((l) => [l.id, l]));
  const trn = journal.transitions[0]!;

  it('names both cities and uses the booking for times', () => {
    const band = renderJourneyBand({ trn, tripId: journal.trip_id, ctx: { legsById, trip } });
    expect(band.querySelector('.story-eyebrow')?.textContent).toBe('Friday 5 March · Train');
    expect(band.querySelector('h3')?.textContent).toBe('Lisbon to Porto');
    expect([...band.querySelectorAll('.story-journey__end b')].map((b) => b.textContent)).toEqual(['10:30 am', '1:15 pm']);
    expect(band.getAttribute('data-journal-transition')).toBe(trn.id);
  });

  it('shows no times and no details button without a booking, and no edit in a read-only preview', () => {
    const band = renderJourneyBand({ trn: { ...trn, itinerary_item_id: undefined }, tripId: journal.trip_id, ctx: { legsById } });
    expect(band.querySelector('.story-journey__end b')).toBeNull();
    expect(band.querySelector('.story-journey__actions')).toBeNull();
  });

  it('never prints the booking reference', () => {
    const withRef = { ...trip, items: trip.items.map((i) => (i.id === trn.itinerary_item_id ? { ...i, booking_ref: 'SECRET123' } : i)) } as Trip;
    const band = renderJourneyBand({ trn, tripId: journal.trip_id, ctx: { legsById, trip: withRef } });
    expect(band.textContent).not.toContain('SECRET123');
  });
});
