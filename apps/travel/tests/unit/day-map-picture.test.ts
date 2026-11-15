import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DAY_MAP_PICTURE_TIMEOUT_MS,
  createDayMapPicturer,
  dayMapPictureKey,
  type DayMapPictureStore,
  type PictureMapLibrary,
  type StoredDayMapPicture,
} from '@/journal/day-map-picture';
import { __setDayMapPicturerForTests, createDayMapPreview } from '@/journal/map-preview';
import { buildPhotoStops, buildSegments } from '@/journal/map-connections';
import type { JournalMoment } from '@/journal/types';

function moment(id: string, order: number, lat: number, lon: number): JournalMoment {
  return { id, leg_id: 'leg_a', local_date: '2026-04-01', media_ids: [], lifecycle: 'live', display_order: order, coordinates: { lat, lon } };
}

const MOMENTS = [moment('mom_a', 1, -33.01, 151.01), moment('mom_b', 2, -33.02, 151.03)];
const STOPS = buildPhotoStops(MOMENTS);
const SEGMENTS = buildSegments(STOPS, { steps: 12, wrapLongitude: true });
const REQUEST = { stops: STOPS, segments: SEGMENTS, width: 360, height: 132 };

interface FakeMapControl {
  created: Record<string, unknown>[];
  maps: FakeMap[];
}

/** A stand-in for MapLibre: the test environment has no WebGL. */
class FakeMap {
  handlers = new Map<string, Set<(e?: unknown) => void>>();
  framed: unknown[] = [];
  removed = false;
  constructor(
    readonly options: Record<string, unknown>,
    readonly behaviour: { load: 'load' | 'error' | 'never'; idle: 'idle' | 'error' | 'never' },
  ) {
    queueMicrotask(() => this.emit(behaviour.load === 'load' ? 'load' : behaviour.load === 'error' ? 'error' : 'none'));
  }
  on(event: string, handler: (e?: unknown) => void) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return this;
  }
  once(event: string, handler: (e?: unknown) => void) {
    const wrapped = (e?: unknown) => {
      this.off(event, wrapped);
      handler(e);
    };
    return this.on(event, wrapped);
  }
  off(event: string, handler: (e?: unknown) => void) {
    this.handlers.get(event)?.delete(handler);
    return this;
  }
  emit(event: string) {
    for (const h of [...(this.handlers.get(event) ?? [])]) h();
  }
  resize() {}
  fitBounds(bounds: unknown, options: unknown) {
    this.framed.push({ bounds, options });
  }
  jumpTo(options: unknown) {
    this.framed.push(options);
  }
  triggerRepaint() {
    const outcome = this.behaviour.idle;
    if (outcome !== 'never') setTimeout(() => this.emit(outcome), 0);
  }
  project([lon, lat]: [number, number]) {
    return { x: (lon - 151) * 10000, y: (lat + 33) * -10000 };
  }
  getCanvas() {
    return { toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(['jpeg'], { type: 'image/jpeg' })) } as unknown as HTMLCanvasElement;
  }
  remove() {
    this.removed = true;
  }
}

function library(
  behaviour: { load: 'load' | 'error' | 'never'; idle: 'idle' | 'error' | 'never' } = { load: 'load', idle: 'idle' },
): { lib: PictureMapLibrary; control: FakeMapControl } {
  const control: FakeMapControl = { created: [], maps: [] };
  const lib = {
    Map: class {
      constructor(options: Record<string, unknown>) {
        control.created.push(options);
        const map = new FakeMap(options, behaviour);
        control.maps.push(map);
        return map;
      }
    },
  } as unknown as PictureMapLibrary;
  return { lib, control };
}

function memoryStore(): DayMapPictureStore & { rows: Map<string, StoredDayMapPicture> } {
  const rows = new Map<string, StoredDayMapPicture>();
  return {
    rows,
    get: async (key) => rows.get(key),
    put: async (row) => void rows.set(row.key, row),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  __setDayMapPicturerForTests(null);
  document.body.replaceChildren();
});

describe('a day map picture', () => {
  it('draws the day on one hidden map and puts the stops where the map puts them', async () => {
    const { lib, control } = library();
    const store = memoryStore();
    const picturer = createDayMapPicturer({ loadLibrary: async () => lib, store, online: () => true });

    const picture = await picturer.picture(REQUEST);

    expect(picture).not.toBeNull();
    expect(picture!.url).toMatch(/^blob:/);
    expect(picture!.width).toBe(360);
    expect(picture!.height).toBe(132);
    // The map's own projection, not a straight lat/lon scale.
    expect(picture!.points.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([
      [100, 100],
      [300, 200],
    ]);
    expect(picture!.paths[0]).toMatch(/^M100\.0 100\.0 L/);
    expect(control.created).toHaveLength(1);
    const options = control.created[0]!;
    expect(options.interactive).toBe(false);
    expect(options.canvasContextAttributes).toMatchObject({ preserveDrawingBuffer: true });
    // Sized inline: MapLibre's own .maplibregl-map rule must not resize it (UI register S7).
    const host = options.container as HTMLElement;
    expect(host.style.width).toBe('360px');
    expect(host.style.height).toBe('132px');
    expect(store.rows.size).toBe(1);
  });

  it('draws each day once: the same stops come from memory, then from the phone after a reload', async () => {
    const { lib, control } = library();
    const store = memoryStore();
    const first = createDayMapPicturer({ loadLibrary: async () => lib, store, online: () => true });
    await first.picture(REQUEST);
    await first.picture(REQUEST);
    expect(control.maps[0]!.framed).toHaveLength(1);

    const afterReload = createDayMapPicturer({ loadLibrary: async () => lib, store, online: () => false });
    const kept = await afterReload.picture(REQUEST);
    expect(kept?.url).toMatch(/^blob:/);
    expect(control.created).toHaveLength(1);
  });

  it('keeps the drawing when this phone cannot draw a map', async () => {
    const picturer = createDayMapPicturer({
      loadLibrary: async () =>
        ({
          Map: class {
            constructor() {
              throw new Error('WebGL unavailable');
            }
          },
        }) as unknown as PictureMapLibrary,
      online: () => true,
    });
    expect(await picturer.picture(REQUEST)).toBeNull();
    expect(document.querySelector('.journal-day-map-picture-host')).toBeNull();
  });

  it('keeps the drawing when the map style cannot be fetched', async () => {
    const { lib } = library({ load: 'error', idle: 'idle' });
    const picturer = createDayMapPicturer({ loadLibrary: async () => lib, online: () => true });
    expect(await picturer.picture(REQUEST)).toBeNull();
  });

  it('saves no half-drawn picture when a tile fails', async () => {
    const { lib } = library({ load: 'load', idle: 'error' });
    const store = memoryStore();
    const picturer = createDayMapPicturer({ loadLibrary: async () => lib, store, online: () => true });
    expect(await picturer.picture(REQUEST)).toBeNull();
    expect(store.rows.size).toBe(0);
  });

  it('gives up on tiles that never arrive', async () => {
    vi.useFakeTimers();
    const { lib } = library({ load: 'load', idle: 'never' });
    const picturer = createDayMapPicturer({ loadLibrary: async () => lib, online: () => true });
    const pending = picturer.picture(REQUEST);
    await vi.advanceTimersByTimeAsync(DAY_MAP_PICTURE_TIMEOUT_MS + 10);
    expect(await pending).toBeNull();
  });

  it('starts no map while offline', async () => {
    const { lib, control } = library();
    const picturer = createDayMapPicturer({ loadLibrary: async () => lib, online: () => false });
    expect(await picturer.picture(REQUEST)).toBeNull();
    expect(control.created).toHaveLength(0);
  });

  it('closes the hidden map once the days are drawn', async () => {
    vi.useFakeTimers();
    const { lib, control } = library();
    const picturer = createDayMapPicturer({ loadLibrary: async () => lib, online: () => true, closeAfterMs: 1000 });
    const pending = picturer.picture(REQUEST);
    await vi.advanceTimersByTimeAsync(5);
    await pending;
    expect(control.maps[0]!.removed).toBe(false);
    await vi.advanceTimersByTimeAsync(1001);
    expect(control.maps[0]!.removed).toBe(true);
    expect(document.querySelector('.journal-day-map-picture-host')).toBeNull();
  });

  it('keys a picture on its stops in order and its size', () => {
    const reversed = buildPhotoStops([moment('mom_b', 1, -33.02, 151.03), moment('mom_a', 2, -33.01, 151.01)]);
    expect(dayMapPictureKey(REQUEST)).not.toBe(dayMapPictureKey({ ...REQUEST, stops: reversed }));
    expect(dayMapPictureKey(REQUEST)).not.toBe(dayMapPictureKey({ ...REQUEST, width: 720 }));
  });
});

describe('the day map preview', () => {
  function visibleNow(): void {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(private readonly cb: IntersectionObserverCallback) {}
        observe(target: Element) {
          queueMicrotask(() => this.cb([{ isIntersecting: true, target } as IntersectionObserverEntry], this as never));
        }
        disconnect() {}
        unobserve() {}
      },
    );
  }

  function preview(): HTMLButtonElement {
    const btn = createDayMapPreview({ moments: MOMENTS, dayId: 'day_a', localDate: '2026-04-01', anchor: document.body });
    Object.defineProperty(btn, 'clientWidth', { value: 360 });
    Object.defineProperty(btn, 'clientHeight', { value: 132 });
    document.body.append(btn);
    return btn;
  }

  it('shows the street map under the stops once the day scrolls into view, with its credit', async () => {
    visibleNow();
    const requests: unknown[] = [];
    __setDayMapPicturerForTests({
      picture: async (req) => {
        requests.push(req);
        return { url: 'blob:map', width: 360, height: 132, points: [{ momentId: 'mom_a', x: 10, y: 20 }], paths: ['M10 20 L30 40'] };
      },
    });
    const btn = preview();
    await vi.waitFor(() => expect(btn.classList.contains('has-picture')).toBe(true));

    expect(requests).toHaveLength(1);
    expect(btn.querySelector('img.journal-day__map-preview-picture')?.getAttribute('src')).toBe('blob:map');
    const route = btn.querySelector('svg.journal-day__map-preview-route')!;
    expect(route.getAttribute('viewBox')).toBe('0 0 360 132');
    expect(route.querySelector('circle')?.getAttribute('cx')).toBe('10');
    expect(btn.querySelector('.journal-day__map-preview-schematic')).toBeNull();
    expect(btn.querySelector('.journal-day__map-preview-credit')?.textContent).toMatch(/OpenStreetMap/);
    expect(btn.getAttribute('aria-label')).toBe('Open photo stops for this day');
  });

  it('keeps the drawing when there is no picture', async () => {
    visibleNow();
    let asked = false;
    __setDayMapPicturerForTests({
      picture: async () => {
        asked = true;
        return null;
      },
    });
    const btn = preview();
    await vi.waitFor(() => expect(asked).toBe(true));
    await Promise.resolve();
    expect(btn.classList.contains('has-picture')).toBe(false);
    expect(btn.querySelector('.journal-day__map-preview-schematic')).not.toBeNull();
    expect(btn.querySelector('img')).toBeNull();
  });
});
