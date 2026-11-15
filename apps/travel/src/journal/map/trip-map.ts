/**
 * The trip on a real map: a numbered pin for every stop, the route between
 * them, moving to one stop at a time, and a tint for the time of day.
 *
 * The map library is passed in, so tests can hand over a stand-in (MapLibre
 * needs a graphics context the test environment does not have). Abroad on a
 * weak signal the map's tiles may never arrive: the pins and route are then
 * drawn on a plain background, and the caller is told so it can say so.
 */
import { stopSpokenLabel, stopsBounds, type RouteSegment, type TripStop } from '@/journal/map/stops';

export const TRIP_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
/** How long the map's own style gets before the route is drawn without it. */
export const MAP_LOAD_TIMEOUT_MS = 6000;

/** `map`: tiles and all. `plain`: route and pins on a plain background. `none`: this device cannot draw a map. */
export type TripMapState = 'loading' | 'map' | 'plain' | 'none';

interface SourceLike {
  setData(data: unknown): void;
}

export interface MapLike {
  on(event: string, handler: (event?: unknown) => void): unknown;
  once(event: string, handler: (event?: unknown) => void): unknown;
  addSource(id: string, source: unknown): unknown;
  addLayer(layer: unknown): unknown;
  getSource(id: string): SourceLike | undefined;
  setFilter(layer: string, filter: unknown): unknown;
  setStyle(style: unknown): unknown;
  fitBounds(bounds: [[number, number], [number, number]], options?: unknown): unknown;
  easeTo(options: unknown): unknown;
  getZoom(): number;
  getCanvasContainer(): HTMLElement;
  resize(): unknown;
  remove(): void;
}

export interface MarkerLike {
  setLngLat(at: [number, number]): MarkerLike;
  addTo(map: MapLike): MarkerLike;
  remove(): unknown;
}

/** The parts of MapLibre this file uses. */
export interface MapLibrary {
  Map: new (options: Record<string, unknown>) => MapLike;
  Marker: new (options: { element: HTMLElement }) => MarkerLike;
}

export interface TripMapOptions {
  lib: MapLibrary;
  stops: TripStop[];
  segments: RouteSegment[];
  /** Resolved colours: MapLibre cannot read CSS variables. */
  colors: { line: string; plain: string };
  reducedMotion: boolean;
  styleUrl?: string;
  /**
   * Space at the top and bottom that something else covers (Relive's card).
   * A stop is centred in what is left, so its pin is never under the card.
   */
  inset?: () => { top: number; bottom: number };
  /** A pin was tapped. */
  onPick: (index: number) => void;
  onState: (state: TripMapState) => void;
}

export interface TripMapHandle {
  state(): TripMapState;
  /** Move to a stop, grow its pin, and draw the route up to it. */
  select(index: number, animate?: boolean): void;
  /** Draw back to the whole trip, with the whole route drawn. */
  showAll(animate?: boolean): void;
  setTint(tint: string): void;
  resize(): void;
  destroy(): void;
}

const ROUTE_SOURCE = 'trip-route';
const CITY_LAYER = 'trip-route-city';
const JOURNEY_LAYER = 'trip-route-journey';

function routeGeoJson(segments: RouteSegment[]): unknown {
  return {
    type: 'FeatureCollection',
    features: segments.map((seg) => ({
      type: 'Feature',
      properties: { kind: seg.kind, toIndex: seg.toIndex },
      geometry: { type: 'LineString', coordinates: seg.coordinates },
    })),
  };
}

export function mountTripMap(host: HTMLElement, options: TripMapOptions): TripMapHandle {
  const { lib, stops, segments } = options;
  let state: TripMapState = 'loading';
  let destroyed = false;
  let routeReady = false;
  let selected = -1;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const markers: MarkerLike[] = [];
  const pins: HTMLButtonElement[] = [];

  const tint = document.createElement('div');
  tint.className = 'trip-map__tint';
  tint.setAttribute('aria-hidden', 'true');
  if (options.reducedMotion) tint.style.transition = 'none';

  const setState = (next: TripMapState): void => {
    if (destroyed || state === next) return;
    state = next;
    options.onState(next);
  };

  let map: MapLike | null = null;
  try {
    map = new lib.Map({
      container: host,
      style: options.styleUrl ?? TRIP_MAP_STYLE_URL,
      center: stops[0] ? [stops[0].lon, stops[0].lat] : [0, 20],
      zoom: stops[0] ? 11 : 2,
      // The view scrolls nowhere: one finger pans, as on any phone map.
      cooperativeGestures: false,
      attributionControl: { compact: true },
    });
  } catch {
    map = null;
  }

  if (!map) {
    state = 'none';
    queueMicrotask(() => {
      if (!destroyed) options.onState('none');
    });
    return {
      state: () => state,
      select: (index) => {
        selected = index;
      },
      showAll: () => undefined,
      setTint: () => undefined,
      resize: () => undefined,
      destroy: () => {
        destroyed = true;
      },
    };
  }
  const live: MapLike = map;

  function paintPins(): void {
    pins.forEach((pin, i) => {
      pin.classList.toggle('is-on', i === selected);
      pin.classList.toggle('is-past', selected >= 0 && i < selected);
      if (i === selected) pin.setAttribute('aria-current', 'true');
      else pin.removeAttribute('aria-current');
    });
  }

  function drawRouteUpTo(index: number): void {
    if (!routeReady) return;
    // Everything when nothing is selected; otherwise only the segments that arrive at or before the stop.
    const upTo = index < 0 ? stops.length : index;
    live.setFilter(CITY_LAYER, ['all', ['==', ['get', 'kind'], 'city'], ['<=', ['get', 'toIndex'], upTo]]);
    live.setFilter(JOURNEY_LAYER, ['all', ['==', ['get', 'kind'], 'journey'], ['<=', ['get', 'toIndex'], upTo]]);
  }

  /** The covered space, kept small enough that some map is always left to centre in. */
  function covered(): { top: number; bottom: number } | null {
    if (!options.inset) return null;
    const { top, bottom } = options.inset();
    const height = host.clientHeight || 0;
    const most = Math.max(0, height - 96);
    const safeTop = Math.max(0, Math.min(top, most));
    return { top: safeTop, bottom: Math.max(0, Math.min(bottom, most - safeTop)) };
  }

  function fitAll(animate: boolean): void {
    const bounds = stopsBounds(stops);
    if (!bounds) return;
    const over = covered();
    if (stops.length === 1) {
      live.easeTo({
        center: [stops[0]!.lon, stops[0]!.lat],
        zoom: 13,
        duration: 0,
        ...(over ? { offset: [0, (over.top - over.bottom) / 2] } : {}),
      });
      return;
    }
    live.fitBounds(bounds, {
      padding: { top: 56 + (over?.top ?? 0), bottom: 56 + (over?.bottom ?? 0), left: 44, right: 44 },
      maxZoom: 14,
      duration: animate && !options.reducedMotion ? 900 : 0,
    });
  }

  /** The route and pins, added once the map has a style to add them to. */
  function addRoute(): void {
    if (destroyed || routeReady) return;
    if (!live.getSource(ROUTE_SOURCE)) {
      live.addSource(ROUTE_SOURCE, { type: 'geojson', data: routeGeoJson(segments) });
      live.addLayer({
        id: CITY_LAYER,
        type: 'line',
        source: ROUTE_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': options.colors.line, 'line-width': 3, 'line-opacity': 0.9 },
      });
      live.addLayer({
        id: JOURNEY_LAYER,
        type: 'line',
        source: ROUTE_SOURCE,
        paint: { 'line-color': options.colors.line, 'line-width': 2.5, 'line-opacity': 0.75, 'line-dasharray': [1.5, 2] },
      });
    }
    routeReady = true;
    if (!markers.length) {
      const container = live.getCanvasContainer();
      // The tint sits over the map and under the pins, which are added after it.
      container.append(tint);
      for (const stop of stops) {
        const pin = document.createElement('button');
        pin.type = 'button';
        pin.className = 'trip-pin num';
        pin.textContent = String(stop.index + 1);
        pin.setAttribute('aria-label', stopSpokenLabel(stop, stops.length));
        pin.addEventListener('click', (ev) => {
          ev.stopPropagation();
          options.onPick(stop.index);
        });
        pins.push(pin);
        markers.push(new lib.Marker({ element: pin }).setLngLat([stop.lon, stop.lat]).addTo(live));
      }
    }
    if (selected >= 0) select(selected, false);
    else {
      drawRouteUpTo(-1);
      fitAll(false);
    }
  }

  /** The map's own style did not arrive: draw on a plain background instead. */
  function usePlain(): void {
    if (destroyed || state !== 'loading') return;
    routeReady = false;
    live.once('style.load', () => {
      addRoute();
      setState('plain');
    });
    live.setStyle({
      version: 8,
      sources: {},
      layers: [{ id: 'trip-plain', type: 'background', paint: { 'background-color': options.colors.plain } }],
    });
  }

  live.on('load', () => {
    if (destroyed) return;
    if (timer) clearTimeout(timer);
    addRoute();
    if (state === 'loading') setState('map');
  });
  // Before the first load, an error means the style or its tiles could not be fetched.
  live.on('error', () => {
    if (state === 'loading') usePlain();
  });
  timer = setTimeout(usePlain, MAP_LOAD_TIMEOUT_MS);

  function select(index: number, animate = true): void {
    if (index < 0 || index >= stops.length) return;
    selected = index;
    paintPins();
    drawRouteUpTo(index);
    if (!routeReady) return;
    const stop = stops[index]!;
    const over = covered();
    live.easeTo({
      center: [stop.lon, stop.lat],
      zoom: Math.max(live.getZoom(), 13.5),
      duration: animate && !options.reducedMotion ? 900 : 0,
      // An offset, not padding: padding given to easeTo stays on the map and would then count twice in fitAll.
      ...(over ? { offset: [0, (over.top - over.bottom) / 2] } : {}),
    });
  }

  return {
    state: () => state,
    select,
    showAll(animate = true) {
      selected = -1;
      paintPins();
      drawRouteUpTo(-1);
      if (routeReady) fitAll(animate);
    },
    setTint(value) {
      tint.style.backgroundColor = value;
    },
    resize() {
      if (!destroyed) live.resize();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (timer) clearTimeout(timer);
      for (const marker of markers) marker.remove();
      tint.remove();
      live.remove();
    },
  };
}
