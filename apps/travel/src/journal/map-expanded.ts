import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  LngLatBounds,
  type GeoJSONSource,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { JournalMoment } from '@/journal/types';
import {
  buildPhotoStops,
  buildSegments,
  visualDedupeKey,
  type PhotoStop,
} from '@/journal/map-connections';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const SEGMENT_FADE_MS = 420;

export interface JournalDayMapHandle {
  updateMoments(moments: JournalMoment[]): void;
  destroy(): void;
}

export interface OpenJournalDayMapOptions {
  moments: JournalMoment[];
  localDate: string;
  anchor: HTMLElement;
  onClose?: () => void;
}

let activeHandle: JournalDayMapHandle | null = null;

export function getActiveJournalDayMap(): JournalDayMapHandle | null {
  return activeHandle;
}

/** Hook for delete/move: recompute segments without camera flight. */
export function refreshActiveJournalDayMap(moments: JournalMoment[]): void {
  activeHandle?.updateMoments(moments);
}

function jitterForDuplicate(key: string, index: number): { lon: number; lat: number } {
  const ring = Math.floor(index / 8) + 1;
  const angle = (index % 8) * (Math.PI / 4);
  const meters = ring * 12;
  const dLat = (meters / 111_320) * Math.sin(angle);
  const dLon = (meters / 111_320) * Math.cos(angle);
  return { lon: dLon, lat: dLat };
}

function stopPositions(stops: PhotoStop[]): { stop: PhotoStop; lon: number; lat: number }[] {
  const keyCounts = new Map<string, number>();
  return stops.map((stop) => {
    const key = visualDedupeKey(stop.lat, stop.lon);
    const index = keyCounts.get(key) ?? 0;
    keyCounts.set(key, index + 1);
    const jitter = index === 0 ? { lon: 0, lat: 0 } : jitterForDuplicate(key, index);
    return { stop, lon: stop.lon + jitter.lon, lat: stop.lat + jitter.lat };
  });
}

function segmentsGeoJson(segments: ReturnType<typeof buildSegments>): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: segments.map((segment) => ({
      type: 'Feature',
      properties: { from: segment.fromMomentId, to: segment.toMomentId },
      geometry: { type: 'LineString', coordinates: segment.coordinates },
    })),
  };
}

function stopsGeoJson(positions: ReturnType<typeof stopPositions>): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: positions.map(({ stop, lon, lat }) => ({
      type: 'Feature',
      properties: { momentId: stop.momentId },
      geometry: { type: 'Point', coordinates: [lon, lat] },
    })),
  };
}

/** Single on-demand MapLibre instance for journal photo stops (not routes). */
export function openJournalDayMap(options: OpenJournalDayMapOptions): JournalDayMapHandle {
  activeHandle?.destroy();

  const backdrop = document.createElement('div');
  backdrop.className = 'journal-map-backdrop';
  backdrop.setAttribute('role', 'presentation');

  const panel = document.createElement('div');
  panel.className = 'journal-map-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute(
    'aria-label',
    `Photo stops for ${formatDisplayDate(options.localDate)}`,
  );

  const head = document.createElement('div');
  head.className = 'journal-map-panel__head';
  const title = document.createElement('h3');
  title.className = 'journal-map-panel__title';
  title.textContent = 'Photo stops';
  const subtitle = document.createElement('p');
  subtitle.className = 'journal-map-panel__subtitle';
  subtitle.textContent = `${formatDisplayDate(options.localDate)} · straight connections between stops, not observed routes`;

  const headActions = document.createElement('div');
  headActions.className = 'journal-map-panel__actions';
  const fullBtn = document.createElement('button');
  fullBtn.type = 'button';
  fullBtn.className = 'btn btn--ghost journal-map-panel__fullscreen';
  fullBtn.textContent = 'Full screen';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn--secondary journal-map-panel__close';
  closeBtn.textContent = 'Close';
  headActions.append(fullBtn, closeBtn);
  head.append(title, subtitle, headActions);

  const mapShell = document.createElement('div');
  mapShell.className = 'journal-map-panel__map';
  const mapHost = document.createElement('div');
  mapHost.className = 'journal-map-panel__map-host';
  mapShell.append(mapHost);

  panel.append(head, mapShell);
  backdrop.append(panel);
  options.anchor.append(backdrop);

  let destroyed = false;
  let map: MapLibreMap | null = null;
  const markers: Marker[] = [];
  let currentMoments = options.moments;

  const mapInit = new MapLibreMap({
    container: mapHost,
    style: STYLE_URL,
    center: [0, 20],
    zoom: 2,
    cooperativeGestures: true,
    attributionControl: { compact: false },
  });
  map = mapInit;
  map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');

  function setFullscreen(on: boolean): void {
    panel.classList.toggle('journal-map-panel--fullscreen', on);
    fullBtn.textContent = on ? 'Exit full screen' : 'Full screen';
    if (on) map?.cooperativeGestures.disable();
    else map?.cooperativeGestures.enable();
    requestAnimationFrame(() => map?.resize());
  }

  fullBtn.addEventListener('click', () => {
    setFullscreen(!panel.classList.contains('journal-map-panel--fullscreen'));
  });

  function fitToStops(positions: ReturnType<typeof stopPositions>, animate: boolean): void {
    if (!map || positions.length === 0) return;
    if (positions.length === 1) {
      const only = positions[0]!;
      map.easeTo({
        center: [only.lon, only.lat],
        zoom: Math.max(map.getZoom(), 13),
        duration: animate ? 0 : 0,
      });
      return;
    }
    const bounds = new LngLatBounds();
    for (const p of positions) bounds.extend([p.lon, p.lat]);
    map.fitBounds(bounds, {
      padding: window.innerWidth < 720 ? 40 : 56,
      maxZoom: 15,
      duration: animate ? 0 : 0,
    });
  }

  function clearMarkers(): void {
    for (const marker of markers) marker.remove();
    markers.length = 0;
  }

  function paintMarkers(positions: ReturnType<typeof stopPositions>): void {
    if (!map) return;
    clearMarkers();
    let n = 0;
    for (const { lon, lat } of positions) {
      n += 1;
      const el = document.createElement('div');
      el.className = 'journal-map-stop';
      el.textContent = String(n);
      el.setAttribute('aria-hidden', 'true');
      markers.push(new Marker({ element: el }).setLngLat([lon, lat]).addTo(map));
    }
  }

  function applyMoments(moments: JournalMoment[], initial: boolean): void {
    if (!map) return;
    currentMoments = moments;
    const stops = buildPhotoStops(moments);
    const segments = buildSegments(stops, { steps: 32, wrapLongitude: true });
    const positions = stopPositions(stops);

    const run = () => {
      if (!map || destroyed) return;
      const segSource = map.getSource('journal-segments') as GeoJSONSource | undefined;
      const stopSource = map.getSource('journal-stops') as GeoJSONSource | undefined;
      if (segSource) {
        map.setPaintProperty('journal-segments-line', 'line-opacity-transition', {
          duration: SEGMENT_FADE_MS,
        });
        map.setPaintProperty('journal-segments-line', 'line-opacity', 0);
        window.setTimeout(() => {
          if (!map || destroyed) return;
          segSource.setData(segmentsGeoJson(segments));
          stopSource?.setData(stopsGeoJson(positions));
          paintMarkers(positions);
          map.setPaintProperty('journal-segments-line', 'line-opacity', 0.85);
        }, SEGMENT_FADE_MS);
      } else {
        map.addSource('journal-segments', { type: 'geojson', data: segmentsGeoJson(segments) });
        map.addLayer({
          id: 'journal-segments-line',
          type: 'line',
          source: 'journal-segments',
          paint: {
            'line-color': 'var(--wave, #2a6f97)',
            'line-width': 3,
            'line-opacity': 0.85,
          },
        });
        map.addSource('journal-stops', { type: 'geojson', data: stopsGeoJson(positions) });
        paintMarkers(positions);
        fitToStops(positions, false);
      }
      if (!initial && segSource) {
        /* no camera flight on updates */
      } else if (initial) {
        fitToStops(positions, false);
      }
    };

    if (map.isStyleLoaded()) run();
    else map.once('load', run);
  }

  applyMoments(currentMoments, true);

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    document.removeEventListener('keydown', onKey);
    clearMarkers();
    map?.remove();
    map = null;
    backdrop.remove();
    if (activeHandle === handle) activeHandle = null;
    options.onClose?.();
  }

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      if (panel.classList.contains('journal-map-panel--fullscreen')) {
        setFullscreen(false);
        return;
      }
      destroy();
    }
  };
  document.addEventListener('keydown', onKey);

  closeBtn.addEventListener('click', () => destroy());
  backdrop.addEventListener('click', (ev) => {
    if (ev.target === backdrop) destroy();
  });

  const handle: JournalDayMapHandle = {
    updateMoments(moments) {
      applyMoments(moments, false);
    },
    destroy,
  };

  activeHandle = handle;
  return handle;
}
