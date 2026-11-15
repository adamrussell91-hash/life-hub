import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JournalDocument } from '@/api/journal';
import { lisbonPortoJournal } from '@/journal/fixtures/lisbon-porto';
import { listKeepsakes } from '@/journal/keepsakes/model';
import { openRelive } from '@/journal/map/relive';
import { buildReliveScenes, sceneDurationMs, type ReliveScene } from '@/journal/map/relive-scenes';
import { buildTripStops } from '@/journal/map/stops';
import type { MapLibrary } from '@/journal/map/trip-map';
import { orderedLiveMoments } from '@/journal/media-loading';
import { closeAllJournalOverlays } from '@/journal/overlay-host';
import { renderJournal } from '@/journal/render-journal';
import { dayNumber } from '@/journal/trip-days';
import type { Trip } from '@/types';
import testTrip from '../../fixtures/test-trip.json';

const trip = testTrip as unknown as Trip;
const fixture = lisbonPortoJournal(trip.id);
const moments = orderedLiveMoments(fixture);
const dayNo = (d: string) => dayNumber(trip.start_date, d);
const stops = buildTripStops(fixture, moments, dayNo);
const keepsakes = listKeepsakes(fixture as JournalDocument, trip);
const scenes = buildReliveScenes({ fixture, moments, trip: stops, keepsakes, dayNumberOf: dayNo });

/** A stand-in map that records where it was sent. */
function fakeLibrary() {
  const selected: number[] = [];
  const maps: Array<{ fire(e: string): void; removed: boolean; eases: unknown[] }> = [];
  class FakeMap {
    handlers = new Map<string, Array<() => void>>();
    sources = new Set<string>();
    eases: unknown[] = [];
    removed = false;
    container = document.createElement('div');
    constructor(options: { container: HTMLElement }) { options.container.append(this.container); maps.push(this); }
    on(e: string, h: () => void) { this.handlers.set(e, [...(this.handlers.get(e) ?? []), h]); }
    once(e: string, h: () => void) { this.on(e, h); }
    fire(e: string) { for (const h of this.handlers.get(e) ?? []) h(); }
    addSource(id: string) { this.sources.add(id); }
    addLayer() {}
    getSource(id: string) { return this.sources.has(id) ? { setData() {} } : undefined; }
    setFilter() {}
    setStyle() {}
    fitBounds() {}
    easeTo(o: unknown) { this.eases.push(o); }
    getZoom() { return 6; }
    getCanvasContainer() { return this.container; }
    resize() {}
    remove() { this.removed = true; }
  }
  class FakeMarker {
    el: HTMLElement;
    constructor(o: { element: HTMLElement }) { this.el = o.element; }
    setLngLat() { return this; }
    addTo(m: FakeMap) { m.container.append(this.el); return this; }
    remove() { this.el.remove(); }
  }
  return { lib: { Map: FakeMap, Marker: FakeMarker } as unknown as MapLibrary, maps, selected };
}

afterEach(() => {
  vi.useRealTimers();
  closeAllJournalOverlays();
  document.body.replaceChildren();
});

describe('buildReliveScenes', () => {
  const kinds = scenes.map((s) => s.kind);

  it('arrives in each city, plays its moments, travels between cities, and ends', () => {
    expect(kinds[0]).toBe('arrive');
    expect(kinds.at(-1)).toBe('end');
    expect(kinds.filter((k) => k === 'arrive')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'journey')).toHaveLength(1);
    const journeyAt = kinds.indexOf('journey');
    expect(kinds[journeyAt + 1]).toBe('arrive');
    const arrivals = scenes.filter((s): s is Extract<ReliveScene, { kind: 'arrive' }> => s.kind === 'arrive');
    expect(arrivals.map((a) => a.city)).toEqual(['Lisbon', 'Porto']);
    expect(arrivals.every((a) => a.stamp?.city === a.city)).toBe(true);
  });

  it('names the journey and carries the ticket kept from the booking', () => {
    const journey = scenes.find((s): s is Extract<ReliveScene, { kind: 'journey' }> => s.kind === 'journey')!;
    expect(journey.line).toBe('Lisbon to Porto, by train');
    expect(journey.ticket?.itemId).toBe('itm_testtrain01');
    expect(journey.stopIndex).toBe(stops.stops.find((s) => s.legId === 'leg_lpporto001')!.index);
  });

  it('plays every moment with a photo or words, placed or not, with the keepsakes kept at it', () => {
    const played = scenes.filter((s): s is Extract<ReliveScene, { kind: 'moment' }> => s.kind === 'moment');
    const expected = moments.filter((m) => m.text?.trim() || m.media_ids.length);
    expect(played.map((s) => s.momentId)).toEqual(expected.map((m) => m.id));
    const wordsOnly = played.find((s) => s.momentId === 'mom_lpfado001')!;
    expect(wordsOnly.mediaId).toBeUndefined();
    expect(wordsOnly.keepsakes.map((k) => k.id)).toEqual(['sv_lpfadoflyer']);
    const unplaced = played.filter((s) => s.stopIndex === null);
    expect(unplaced.length).toBe(played.length - stops.stops.length);
    expect(played[0]!.dayNumber).toBe(1);
  });

  it('leaves out a moment that is only a sound clip, and returns nothing for an empty journal', () => {
    const soundOnly = moments.map((m) => (m.id === 'mom_lpgraca01' ? { ...m, text: undefined, media_ids: m.media_ids.filter((id) => id.includes('sound')) } : m));
    const out = buildReliveScenes({ fixture, moments: soundOnly, trip: stops, keepsakes, dayNumberOf: dayNo });
    expect(out.some((s) => s.kind === 'moment' && s.momentId === 'mom_lpgraca01')).toBe(false);
    expect(buildReliveScenes({ fixture, moments: [], trip: stops, keepsakes, dayNumberOf: dayNo })).toEqual([]);
  });

  it('ends with the counts and the stamps', () => {
    const end = scenes.at(-1) as Extract<ReliveScene, { kind: 'end' }>;
    expect(end.counts[0]).toBe('4 days');
    expect(end.counts[1]).toBe('2 cities');
    expect(end.counts).toContain('12 photos');
    expect(end.counts).toContain('6 keepsakes');
    expect(end.stamps.map((s) => s.city)).toEqual(['Lisbon', 'Porto']);
  });

  it('counts a finished trip at its full length, and a day with nothing written between two that have', () => {
    const base = { fixture, moments, trip: stops, keepsakes: [], dayNumberOf: dayNo };
    const endOf = (input: Parameters<typeof buildReliveScenes>[0]) => (buildReliveScenes(input).at(-1) as Extract<ReliveScene, { kind: 'end' }>).counts[0];
    // Over: the trip was five days, though the last had no moment.
    expect(endOf({ ...base, tripDays: 5 })).toBe('5 days');
    // Still under way: the first journaled day to the last, with the empty day between them counted.
    const gap = base.moments.filter((m) => m.local_date !== '2027-03-04');
    expect(new Set(gap.map((m) => m.local_date)).size).toBe(3);
    expect(endOf({ ...base, moments: gap })).toBe('4 days');
  });

  it('gives longer words longer on screen, and never moves on from the end by itself', () => {
    const quick = sceneDurationMs({ kind: 'moment', momentId: 'a', legId: 'l', dayNumber: 1, localDate: '2027-03-03', placeName: '', text: 'Short.', stopIndex: null, keepsakes: [] })!;
    const long = sceneDurationMs({ kind: 'moment', momentId: 'a', legId: 'l', dayNumber: 1, localDate: '2027-03-03', placeName: '', text: 'word '.repeat(60), stopIndex: null, keepsakes: [] })!;
    expect(long).toBeGreaterThan(quick);
    expect(long).toBeLessThanOrEqual(9000);
    expect(sceneDurationMs({ kind: 'end', counts: [], stamps: [] })).toBeNull();
  });
});

describe('openRelive', () => {
  function open(reducedMotion = false) {
    const { lib, maps } = fakeLibrary();
    const anchor = document.createElement('div');
    document.body.append(anchor);
    const onClose = vi.fn();
    openRelive({
      anchor, lib, title: 'Test Trip: Lisbon & Porto', scenes, trip: stops, colors: { line: '#17375e', plain: '#f1e7d6' }, reducedMotion,
      fillPhoto: (img, id) => { img.src = `/photo/${id}`; },
      drawKeepsake: (k) => { const n = document.createElement('span'); n.className = `drawn drawn--${k.type}`; n.textContent = k.id; return n; },
      sunsetFor: () => '18:30', onClose,
    });
    maps[0]!.fire('load');
    const root = anchor.querySelector<HTMLElement>('.relive')!;
    const scene = () => root.getAttribute('data-relive-scene');
    const q = <T extends Element>(sel: string) => root.querySelector<T>(sel);
    return { root, scene, q, maps, onClose, anchor };
  }

  it('opens on the first city with its stamp, and moves on by itself', () => {
    vi.useFakeTimers();
    const { root, scene, q } = open();
    expect(root.getAttribute('aria-label')).toBe('Relive Test Trip: Lisbon & Porto');
    expect(scene()).toBe('arrive');
    expect(q('.relive__headline')!.textContent).toBe('Lisbon');
    expect(q('.relive__stamp .drawn--stamp')).not.toBeNull();
    vi.advanceTimersByTime(sceneDurationMs(scenes[0]!)! + 10);
    expect(scene()).toBe('moment');
    const first = scenes[1] as Extract<ReliveScene, { kind: 'moment' }>;
    expect(q('.relive__meta')!.textContent).toContain('Day 1');
    expect(q<HTMLImageElement>('.relive__photo img')!.src).toContain(first.mediaId!);
    expect(root.querySelector('audio')).toBeNull(); // silent
  });

  it('moves to each stop on the map as its moment plays', () => {
    vi.useFakeTimers();
    const { maps, q } = open();
    const before = maps[0]!.eases.length;
    q<HTMLButtonElement>('.relive__zone--next')!.click();
    const first = scenes[1] as Extract<ReliveScene, { kind: 'moment' }>;
    const stop = stops.stops[first.stopIndex!]!;
    expect(maps[0]!.eases.length).toBeGreaterThan(before);
    expect(maps[0]!.eases.at(-1)).toMatchObject({ center: [stop.lon, stop.lat] });
  });

  it('steps with taps and arrow keys, and pauses and resumes', () => {
    vi.useFakeTimers();
    const { scene, q } = open();
    const pause = q<HTMLButtonElement>('.relive__btn')!;
    expect(pause.getAttribute('aria-label')).toBe('Pause');
    pause.click();
    expect(pause.getAttribute('aria-label')).toBe('Play');
    vi.advanceTimersByTime(20_000);
    expect(scene()).toBe('arrive'); // paused: nothing moves
    pause.click();
    vi.advanceTimersByTime(sceneDurationMs(scenes[0]!)! + 10);
    expect(scene()).toBe('moment');
    q<HTMLButtonElement>('.relive__zone--prev')!.click();
    expect(scene()).toBe('arrive');
    expect(q<HTMLButtonElement>('.relive__zone--prev')!.disabled).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(scene()).toBe('moment');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(q<HTMLButtonElement>('.relive__btn')!.getAttribute('aria-label')).toBe('Play');
  });

  it('pauses while a finger is held down and carries on when it lifts, without moving on', () => {
    vi.useFakeTimers();
    const { scene, q, root } = open();
    const zone = q<HTMLButtonElement>('.relive__zone--next')!;
    zone.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(400);
    expect(root.classList.contains('is-paused')).toBe(true);
    vi.advanceTimersByTime(20_000);
    expect(scene()).toBe('arrive');
    zone.dispatchEvent(new Event('pointerup'));
    zone.click(); // the click that ends a hold
    expect(scene()).toBe('arrive');
    expect(root.classList.contains('is-paused')).toBe(false);
  });

  it('shows the journey with its ticket, and ends on the whole trip without moving on', () => {
    vi.useFakeTimers();
    const { scene, q, root } = open();
    const journeyAt = scenes.findIndex((s) => s.kind === 'journey');
    for (let i = 0; i < journeyAt; i += 1) q<HTMLButtonElement>('.relive__zone--next')!.click();
    expect(scene()).toBe('journey');
    expect(q('.relive__headline')!.textContent).toBe('Lisbon to Porto, by train');
    expect(q('.relive__ticket .drawn--booking')).not.toBeNull();
    for (let i = journeyAt; i < scenes.length - 1; i += 1) q<HTMLButtonElement>('.relive__zone--next')!.click();
    expect(scene()).toBe('end');
    expect(q('.relive__counts')!.textContent).toContain('4 days · 2 cities');
    expect(root.querySelectorAll('.relive__stamps .drawn--stamp')).toHaveLength(2);
    expect(q<HTMLElement>('.relive__btn')!.hidden).toBe(true); // nothing to pause at the end
    vi.advanceTimersByTime(60_000);
    expect(scene()).toBe('end');
    q<HTMLButtonElement>('.relive__again')!.click();
    expect(scene()).toBe('arrive');
  });

  it('closes with Close and Escape, takes the map down, and marks reduced motion', () => {
    vi.useFakeTimers();
    const first = open();
    first.q<HTMLButtonElement>('[aria-label="Close"]')!.click();
    expect(first.onClose).toHaveBeenCalledTimes(1);
    expect(first.maps[0]!.removed).toBe(true);
    expect(first.anchor.querySelector('.relive')).toBeNull();
    vi.advanceTimersByTime(60_000); // no timer left behind

    const second = open(true);
    expect(second.root.classList.contains('relive--still')).toBe(true);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(second.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Relive in the journal', () => {
  it('starts only from the Relive button on the Map view', () => {
    const { lib, maps } = fakeLibrary();
    const root = document.createElement('div');
    document.body.append(root);
    renderJournal(root, { fixture: lisbonPortoJournal(trip.id), trip, today: '2027-03-20', mapLibrary: lib });
    expect(document.querySelector('.relive')).toBeNull();
    expect(root.querySelector('.trip-map__relive')).toBeNull(); // not on the story
    (root.querySelector('[data-story-view="map"]') as HTMLButtonElement).click();
    maps[0]!.fire('load');
    expect(document.querySelector('.relive')).toBeNull(); // opening the map plays nothing
    const relive = root.querySelector('.trip-map__relive') as HTMLButtonElement;
    expect(relive.textContent).toBe('Relive');
    relive.click();
    const dialog = document.querySelector('.relive')!;
    expect(dialog.getAttribute('data-relive-scene')).toBe('arrive');
    expect(dialog.querySelector('.relive__stamp .keepsake--stamp')).not.toBeNull();
  });
});
