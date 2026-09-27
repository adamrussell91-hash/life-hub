import { Map as MapLibreMap, Marker, NavigationControl, LngLatBounds } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { City, Item } from '@/types';
import { itemPlace, numberStops } from '@/model/day';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export interface DayMapHandle {
  map: MapLibreMap;
  selectStop: (itemId: string | null) => void;
  onSelect: (cb: (itemId: string) => void) => void;
  destroy: () => void;
}

function markerElement(item: Item, number: number | undefined, accent: string): HTMLDivElement {
  const el = document.createElement('div');
  if (item.kind === 'stay') {
    el.className = 'pin pin--stay';
    el.style.background = '#17375e';
    el.textContent = '🛏';
  } else if (item.kind === 'med') {
    el.className = 'pin pin--med';
    el.style.background = '#5d4e70';
    el.textContent = String(number ?? '');
  } else {
    el.className = 'pin';
    el.style.background = accent;
    el.textContent = String(number ?? '');
  }
  el.style.width = '26px';
  el.style.height = '26px';
  el.style.borderRadius = item.kind === 'stay' ? '8px' : '50%';
  el.style.border = '2.5px solid #fff';
  el.style.color = '#fff';
  el.style.fontWeight = '700';
  el.style.fontSize = '12px';
  el.style.display = 'grid';
  el.style.placeItems = 'center';
  el.style.cursor = 'pointer';
  return el;
}

/** Day map (§5.4): MapLibre + OpenFreeMap Liberty, numbered pins, a route
 * line through the day's stops, and card ↔ pin selection sync. */
export function renderDayMap(
  host: HTMLElement,
  city: City,
  items: Item[],
  options: { cooperativeGestures?: boolean } = {}
): DayMapHandle {
  host.replaceChildren();
  const map = new MapLibreMap({
    container: host,
    style: STYLE_URL,
    center: [city.center.lon, city.center.lat],
    zoom: 13,
    cooperativeGestures: options.cooperativeGestures ?? false,
    attributionControl: false
  });
  map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
  (host as HTMLElement & { _travelMap?: MapLibreMap })._travelMap = map;

  const numbers = numberStops(items);
  const markers = new Map<string, Marker>();
  let onSelectCb: ((itemId: string) => void) | null = null;

  const pinned = items.filter((item) => itemPlace(item));
  const withinRange = pinned.filter((item) => haversineRough(city.center, itemPlace(item)!) <= 60);

  map.on('load', () => {
    for (const item of pinned) {
      const place = itemPlace(item)!;
      const el = markerElement(item, numbers.get(item.id), city.accent.color);
      el.addEventListener('click', () => onSelectCb?.(item.id));
      const marker = new Marker({ element: el }).setLngLat([place.lon, place.lat]).addTo(map);
      markers.set(item.id, marker);
    }

    if (withinRange.length > 0) {
      const bounds = new LngLatBounds();
      for (const item of withinRange) {
        const place = itemPlace(item)!;
        bounds.extend([place.lon, place.lat]);
      }
      map.fitBounds(bounds, { padding: window.innerWidth < 720 ? 32 : 48, maxZoom: 15 });
    }

    if (withinRange.length >= 2) {
      const hasTrain = items.some((item) => item.kind === 'train');
      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: withinRange.map((item) => {
              const place = itemPlace(item)!;
              return [place.lon, place.lat];
            })
          }
        }
      });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        paint: {
          'line-color': city.accent.color,
          'line-width': 3,
          'line-dasharray': hasTrain ? [3, 2] : [0.2, 2]
        }
      });
    }
  });

  function selectStop(itemId: string | null): void {
    markers.forEach((marker, id) => {
      marker.getElement().classList.toggle('is-on', id === itemId);
    });
    if (itemId) {
      const marker = markers.get(itemId);
      if (marker) {
        const zoom = Math.max(map.getZoom(), 15);
        map.flyTo({ center: marker.getLngLat(), zoom });
      }
    }
  }

  return {
    map,
    selectStop,
    onSelect: (cb) => {
      onSelectCb = cb;
    },
    destroy: () => map.remove()
  };
}

function haversineRough(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}
