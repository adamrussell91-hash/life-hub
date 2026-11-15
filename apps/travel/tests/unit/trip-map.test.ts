import { afterEach, describe, expect, it, vi } from 'vitest';
import { lisbonPortoJournal } from '@/journal/fixtures/lisbon-porto';
import { MAP_EMPTY_LINE, MAP_FAILED_LINE, MAP_UNSUPPORTED_LINE, renderMapView } from '@/journal/map/map-view';
import { buildTripStops } from '@/journal/map/stops';
import { MAP_LOAD_TIMEOUT_MS, mountTripMap, type MapLibrary, type TripMapState } from '@/journal/map/trip-map';
import { orderedLiveMoments } from '@/journal/media-loading';
import { closeAllJournalOverlays } from '@/journal/overlay-host';
import { renderJournal } from '@/journal/render-journal';
import { dayNumber } from '@/journal/trip-days';
import type { Trip } from '@/types';
import testTrip from '../../fixtures/test-trip.json';

type Handler = (event?: unknown) => void;

/** A stand-in for MapLibre that records what it is asked to do. */
function fakeLibrary(mode: 'ok' | 'throws' = 'ok') {
  const maps: FakeMap[] = [];
  class FakeMap {
    handlers = new Map<string, Handler[]>();
    sources = new Set<string>();
    layers: Array<Record<string, unknown>> = [];
    filters = new Map<string, unknown>();
    eases: Array<Record<string, unknown>> = [];
    fits: unknown[] = [];
    style: unknown;
    removed = false;
    resized = 0;
    container = document.createElement('div');
    constructor(options: Record<string, unknown>) {
      if (mode === 'throws') throw new Error('no graphics context');
      this.style = options.style;
      (options.container as HTMLElement).append(this.container);
      maps.push(this);
    }
    on(event: string, handler: Handler) { this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]); }
    once(event: string, handler: Handler) {
      const wrapped: Handler = (e) => {
        this.handlers.set(event, (this.handlers.get(event) ?? []).filter((h) => h !== wrapped));
        handler(e);
      };
      this.on(event, wrapped);
    }
    fire(event: string) { for (const h of [...(this.handlers.get(event) ?? [])]) h(); }
    addSource(id: string) { this.sources.add(id); }
    addLayer(layer: Record<string, unknown>) { this.layers.push(layer); }
    getSource(id: string) { return this.sources.has(id) ? { setData() {} } : undefined; }
    setFilter(layer: string, filter: unknown) { this.filters.set(layer, filter); }
    setStyle(style: unknown) { this.style = style; this.sources.clear(); this.layers = []; }
    fitBounds(bounds: unknown) { this.fits.push(bounds); }
    easeTo(options: Record<string, unknown>) { this.eases.push(options); }
    getZoom() { return 6; }
    getCanvasContainer() { return this.container; }
    resize() { this.resized += 1; }
    remove() { this.removed = true; this.container.remove(); }
  }
  class FakeMarker {
    el: HTMLElement;
    constructor(options: { element: HTMLElement }) { this.el = options.element; }
    setLngLat() { return this; }
    addTo(map: FakeMap) { map.container.append(this.el); return this; }
    remove() { this.el.remove(); }
  }
  return { lib: { Map: FakeMap, Marker: FakeMarker } as unknown as MapLibrary, maps };
}

const fixture = lisbonPortoJournal('trp_map_test');
const tripStops = buildTripStops(fixture, orderedLiveMoments(fixture), (d) => dayNumber('2027-03-03', d));
const colors = { line: '#17375e', plain: '#f1e7d6' };

afterEach(() => {
  vi.useRealTimers();
  closeAllJournalOverlays();
  document.body.replaceChildren();
});

function mount(mode: 'ok' | 'throws' = 'ok', reducedMotion = false) {
  const { lib, maps } = fakeLibrary(mode);
  const host = document.createElement('div');
  document.body.append(host);
  const states: TripMapState[] = [];
  const picks: number[] = [];
  const handle = mountTripMap(host, {
    lib, stops: tripStops.stops, segments: tripStops.segments, colors, reducedMotion,
    onPick: (i) => picks.push(i), onState: (s) => states.push(s),
  });
  return { handle, map: maps[0]!, host, states, picks };
}

describe('mountTripMap', () => {
  it('draws a numbered pin for every stop and the route, once the map has loaded', () => {
    const { handle, map, host, states, picks } = mount();
    expect(handle.state()).toBe('loading');
    expect(host.querySelectorAll('.trip-pin')).toHaveLength(0);
    map.fire('load');
    expect(states).toEqual(['map']);
    const pins = [...host.querySelectorAll<HTMLButtonElement>('.trip-pin')];
    expect(pins.map((p) => p.textContent)).toEqual(tripStops.stops.map((s) => String(s.index + 1)));
    expect(pins[0]!.getAttribute('aria-label')).toMatch(/^Stop 1 of \d+, Day 1, /);
    expect(map.layers.map((l) => l.id)).toEqual(['trip-route-city', 'trip-route-journey']);
    // No colour handed to the map is a CSS variable (register C12).
    expect(JSON.stringify(map.layers)).not.toContain('var(');
    expect(map.fits).toHaveLength(1); // fitted to the whole trip
    pins[2]!.click();
    expect(picks).toEqual([2]);
    // The tint lies over the map and under the pins.
    const children = [...map.container.children];
    expect(children.findIndex((c) => c.classList.contains('trip-map__tint'))).toBeLessThan(children.indexOf(pins[0]!));
  });

  it('moves to a stop, marks it and the ones before it, and draws the route only that far', () => {
    const { handle, map, host } = mount();
    map.fire('load');
    handle.select(3);
    const pins = [...host.querySelectorAll('.trip-pin')];
    expect(pins[3]!.classList.contains('is-on')).toBe(true);
    expect(pins[3]!.getAttribute('aria-current')).toBe('true');
    expect(pins.slice(0, 3).every((p) => p.classList.contains('is-past'))).toBe(true);
    expect(pins[4]!.classList.contains('is-past')).toBe(false);
    const stop = tripStops.stops[3]!;
    expect(map.eases.at(-1)).toMatchObject({ center: [stop.lon, stop.lat], duration: 900 });
    expect(JSON.stringify(map.filters.get('trip-route-city'))).toContain('"toIndex"],3]');
    handle.showAll();
    expect(pins.some((p) => p.classList.contains('is-on'))).toBe(false);
    expect(JSON.stringify(map.filters.get('trip-route-city'))).toContain(`"toIndex"],${tripStops.stops.length}]`);
  });

  it('does not ease with reduced motion', () => {
    const { handle, map } = mount('ok', true);
    map.fire('load');
    handle.select(1);
    expect(map.eases.at(-1)).toMatchObject({ duration: 0 });
  });

  it('draws the route on a plain background when the map’s style fails or never arrives', () => {
    vi.useFakeTimers();
    for (const fail of [(m: { fire(e: string): void }) => m.fire('error'), () => vi.advanceTimersByTime(MAP_LOAD_TIMEOUT_MS)]) {
      const { handle, map, host, states } = mount();
      fail(map);
      expect((map.style as { layers: Array<{ type: string }> }).layers[0]!.type).toBe('background');
      expect(states).toEqual([]);
      map.fire('style.load');
      expect(states).toEqual(['plain']);
      expect(handle.state()).toBe('plain');
      expect(host.querySelectorAll('.trip-pin').length).toBe(tripStops.stops.length);
      expect(map.layers.map((l) => l.id)).toEqual(['trip-route-city', 'trip-route-journey']);
      // A late load or a stray tile error changes nothing more.
      map.fire('error');
      expect(states).toEqual(['plain']);
      handle.destroy();
    }
  });

  it('says so when the device cannot draw a map at all, and still keeps track of the stop', async () => {
    const { handle, states } = mount('throws');
    expect(handle.state()).toBe('none');
    await Promise.resolve();
    expect(states).toEqual(['none']);
    expect(() => { handle.select(2); handle.showAll(); handle.setTint('rgba(0,0,0,0.2)'); handle.resize(); handle.destroy(); }).not.toThrow();
  });

  it('takes everything down when destroyed', () => {
    vi.useFakeTimers();
    const { handle, map, host, states } = mount();
    map.fire('load');
    handle.destroy();
    expect(map.removed).toBe(true);
    expect(host.querySelector('.trip-pin')).toBeNull();
    vi.advanceTimersByTime(MAP_LOAD_TIMEOUT_MS * 2);
    expect(states).toEqual(['map']);
  });
});

describe('renderMapView', () => {
  function view(extra: { mode?: 'ok' | 'throws'; position?: number; trip?: typeof tripStops } = {}) {
    const { lib, maps } = fakeLibrary(extra.mode ?? 'ok');
    const opened: string[] = [];
    const positions: number[] = [];
    const handle = renderMapView({
      lib, trip: extra.trip ?? tripStops, cityCount: 2, position: extra.position ?? 0, colors, reducedMotion: false,
      fillPhoto: (img, id) => { img.src = `/photo/${id}`; },
      sunsetFor: () => '18:30',
      onOpenMoment: (id) => opened.push(id),
      onPosition: (p) => positions.push(p),
    });
    document.body.append(handle.el);
    const q = <T extends Element>(sel: string) => handle.el.querySelector<T>(sel)!;
    return { handle, map: maps[0], opened, positions, q };
  }

  it('starts on the whole trip and walks one stop at a time with the slider and the buttons', () => {
    const { map, q, positions, opened } = view();
    map!.fire('load');
    const slider = q<HTMLInputElement>('.trip-map__slider');
    expect(slider.type).toBe('range');
    expect(slider.max).toBe(String(tripStops.stops.length));
    expect(slider.getAttribute('aria-valuetext')).toBe(`The whole trip, ${tripStops.stops.length} stops`);
    expect(q('.trip-map__card-place').textContent).toBe('The whole trip');
    expect(q<HTMLButtonElement>('.trip-map__card').disabled).toBe(true);
    expect(q<HTMLButtonElement>('[aria-label="Previous stop"]').disabled).toBe(true);

    q<HTMLButtonElement>('[aria-label="Next stop"]').click();
    const first = tripStops.stops[0]!;
    expect(slider.value).toBe('1');
    expect(slider.getAttribute('aria-valuetext')).toMatch(/^Stop 1 of /);
    expect(q('.trip-map__card-place').textContent).toBe(first.placeName);
    expect(q('.trip-map__card-meta').textContent).toMatch(/^Day 1 · \d+:\d\d [ap]m$/);
    expect(q<HTMLImageElement>('.trip-map__card-photo img').src).toContain(first.mediaId!);
    expect(map!.eases.at(-1)).toMatchObject({ center: [first.lon, first.lat] });

    slider.value = '4';
    slider.dispatchEvent(new Event('input'));
    expect(positions).toEqual([1, 4]);
    q<HTMLButtonElement>('.trip-map__card').click();
    expect(opened).toEqual([tripStops.stops[3]!.momentId]);
    // A tapped pin moves the slider to it.
    handleClick(q('.trip-pin:nth-of-type(1)') as HTMLElement);
    expect(slider.value).toBe('1');
  });

  function handleClick(node: HTMLElement) { node.click(); }

  it('changes the light with the time of each stop', () => {
    const night = { ...tripStops, stops: tripStops.stops.map((s, i) => (i === 0 ? { ...s, localTime: '23:10' } : i === 1 ? { ...s, localTime: '12:00' } : s)) };
    const { map, q } = view({ trip: night, position: 1 });
    map!.fire('load');
    const tint = () => (map!.container.querySelector('.trip-map__tint') as HTMLElement).style.backgroundColor;
    expect(tint()).toMatch(/rgba\(12, 22, 64/); // night
    q<HTMLButtonElement>('[aria-label="Next stop"]').click();
    expect(tint()).toMatch(/rgba\(255, 255, 255, 0\)/); // midday: clear
  });

  it('says how many moments are left off, and nothing when none are', () => {
    const { q, handle } = view({ trip: { ...tripStops, unplaced: 3 } });
    expect(q('.trip-map__unplaced').textContent).toBe('3 moments have no place and are not on the map');
    handle.destroy();
    document.body.replaceChildren();
    expect(view({ trip: { ...tripStops, unplaced: 0 } }).handle.el.querySelector('.trip-map__unplaced')).toBeNull();
  });

  it('explains when the map could not load, offers Try again, and keeps the slider working', () => {
    const { map, q, handle } = view({ position: 2 });
    map!.fire('error');
    map!.fire('style.load');
    expect(q<HTMLElement>('.trip-map__notice').hidden).toBe(false);
    expect(q('.trip-map__notice-text').textContent).toBe(MAP_FAILED_LINE);
    expect(handle.el.getAttribute('data-map-state')).toBe('plain');
    q<HTMLButtonElement>('[aria-label="Next stop"]').click();
    expect(q<HTMLInputElement>('.trip-map__slider').value).toBe('3');
    q<HTMLButtonElement>('.trip-map__retry').click();
    expect(map!.removed).toBe(true);
    expect(q<HTMLElement>('.trip-map__notice').hidden).toBe(true);
    expect(q<HTMLInputElement>('.trip-map__slider').value).toBe('3'); // the place is kept
  });

  it('still steps through the trip when the device cannot draw a map', async () => {
    const { q } = view({ mode: 'throws' });
    await Promise.resolve();
    expect(q('.trip-map__notice-text').textContent).toBe(MAP_UNSUPPORTED_LINE);
    expect(q<HTMLElement>('.trip-map__retry').hidden).toBe(true);
    q<HTMLButtonElement>('[aria-label="Next stop"]').click();
    expect(q('.trip-map__card-place').textContent).toBe(tripStops.stops[0]!.placeName);
  });

  it('says why there is no map when no moment has a place', () => {
    const { handle } = view({ trip: { stops: [], segments: [], unplaced: 4 } });
    expect(handle.el.textContent).toBe(MAP_EMPTY_LINE);
    expect(handle.el.querySelector('.trip-map__slider')).toBeNull();
  });
});

describe('the Map view in the journal', () => {
  it('is the fourth view, hides nothing else, and keeps its place when left and returned to', () => {
    const { lib, maps } = fakeLibrary();
    const root = document.createElement('div');
    document.body.append(root);
    renderJournal(root, { fixture: lisbonPortoJournal('trp_testlisbon01'), trip: testTrip as unknown as Trip, today: '2027-03-20', mapLibrary: lib });
    const views = [...root.querySelectorAll('[data-story-view]')].map((b) => b.getAttribute('data-story-view'));
    expect(views).toEqual(['story', 'photos', 'keepsakes', 'map']);
    expect(root.textContent).not.toMatch(/Relive/); // not built yet, so not drawn

    (root.querySelector('[data-story-view="map"]') as HTMLButtonElement).click();
    expect(root.querySelector('[data-story-showing]')?.getAttribute('data-story-showing') ?? root.getAttribute('data-story-showing')).toBe('map');
    maps[0]!.fire('load');
    const slider = () => root.querySelector<HTMLInputElement>('.trip-map__slider')!;
    (root.querySelector('[aria-label="Next stop"]') as HTMLButtonElement).click();
    (root.querySelector('[aria-label="Next stop"]') as HTMLButtonElement).click();
    expect(slider().value).toBe('2');

    (root.querySelector('[data-story-view="photos"]') as HTMLButtonElement).click();
    expect(maps[0]!.removed).toBe(true);
    expect(root.querySelector('[data-trip-map]')).toBeNull();
    (root.querySelector('[data-story-view="map"]') as HTMLButtonElement).click();
    expect(slider().value).toBe('2');

    // The card opens that moment in the story.
    maps[1]!.fire('load');
    (root.querySelector('.trip-map__card') as HTMLButtonElement).click();
    expect(root.querySelector('[data-trip-map]')).toBeNull();
    expect(root.querySelector('[data-journal-moment]')).not.toBeNull();
  });
});
