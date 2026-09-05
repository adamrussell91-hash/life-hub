/** Trusted MapLibre place constellation renderer.
 * Agents emit map_places payloads; this module validates and draws them.
 * Map config never comes from the model — only place ids + lng/lat.
 */

export const MAP_PLACES_TYPE = 'map_places';
export const DEFAULT_MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   lng: number,
 *   lat: number,
 *   address?: string,
 *   kind?: string,
 *   visitIds?: string[],
 * }} HubPlace
 * @typedef {{
 *   type: 'map_places',
 *   places: HubPlace[],
 *   focus?: string,
 *   title?: string,
 * }} MapPlacesPayload
 */

/**
 * Validate / normalize an agent (or medical) map_places payload.
 * Returns null when the payload is not a safe trusted-renderer shape.
 * @param {unknown} raw
 * @returns {MapPlacesPayload | null}
 */
export function parseMapPlacesPayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const data = /** @type {Record<string, unknown>} */ (raw);
  if (data.type != null && data.type !== MAP_PLACES_TYPE) return null;
  if (!Array.isArray(data.places)) return null;

  /** @type {HubPlace[]} */
  const places = [];
  for (const entry of data.places) {
    const place = normalizePlace(entry);
    if (place) places.push(place);
  }
  if (!places.length) return null;

  const focus =
    typeof data.focus === 'string' && places.some((p) => p.id === data.focus)
      ? data.focus
      : undefined;
  const title =
    typeof data.title === 'string' && data.title.trim() ? data.title.trim() : undefined;
  return { type: MAP_PLACES_TYPE, places, focus, title };
}

/**
 * Group medical visits with place locations into a map_places payload.
 * Coordinates are attached only when the visit already has lng/lat or a
 * lookup table provides them — never invented via string hashing.
 * @param {Array<{ id?: string, location?: string | null, location_kind?: string | null, title?: string, lng?: number, lat?: number }>} visits
 * @param {{ coordsByLocation?: Record<string, { lng: number, lat: number }> }} [opts]
 * @returns {MapPlacesPayload | null}
 */
export function mapPlacesFromMedicalVisits(visits, opts = {}) {
  const coordsByLocation = opts.coordsByLocation || {};
  /** @type {Map<string, HubPlace>} */
  const byKey = new Map();

  for (const visit of visits || []) {
    if (!visit || visit.location_kind !== 'place' || !visit.location) continue;
    const location = String(visit.location).trim();
    if (!location) continue;
    const key = location.toLowerCase();
    const existing = byKey.get(key);
    const coords =
      finiteLngLat(visit.lng, visit.lat) ||
      finiteLngLat(coordsByLocation[key]?.lng, coordsByLocation[key]?.lat) ||
      finiteLngLat(coordsByLocation[location]?.lng, coordsByLocation[location]?.lat);

    if (existing) {
      if (visit.id) existing.visitIds = [...(existing.visitIds || []), visit.id];
      if (existing.lng == null && coords) {
        existing.lng = coords.lng;
        existing.lat = coords.lat;
      }
      continue;
    }

    if (!coords) continue;

    byKey.set(key, {
      id: `place_${slugify(location)}`,
      name: location,
      address: location,
      kind: 'medical',
      lng: coords.lng,
      lat: coords.lat,
      visitIds: visit.id ? [visit.id] : []
    });
  }

  const places = [...byKey.values()];
  if (!places.length) return null;
  return { type: MAP_PLACES_TYPE, places, title: 'Medical places' };
}

/**
 * Unique place labels from medical visits (coords optional).
 * Useful for the list twin when geocoding is still pending.
 * @param {Array<{ id?: string, location?: string | null, location_kind?: string | null }>} visits
 */
export function listMedicalPlaceLabels(visits) {
  /** @type {Map<string, { name: string, visitIds: string[] }>} */
  const byKey = new Map();
  for (const visit of visits || []) {
    if (!visit || visit.location_kind !== 'place' || !visit.location) continue;
    const name = String(visit.location).trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      if (visit.id) existing.visitIds.push(visit.id);
    } else {
      byKey.set(key, { name, visitIds: visit.id ? [visit.id] : [] });
    }
  }
  return [...byKey.values()];
}

/**
 * Mount a MapLibre constellation for a validated map_places payload.
 * @param {HTMLElement} container
 * @param {MapPlacesPayload | unknown} payload
 * @param {{
 *   loadMapLibre?: () => Promise<any>,
 *   style?: string,
 *   onSelect?: (place: HubPlace) => void,
 * }} [opts]
 * @returns {Promise<{ map: any, destroy: () => void, focusPlace: (id: string) => void } | null>}
 */
export async function mountHubPlacesMap(container, payload, opts = {}) {
  const parsed = parseMapPlacesPayload(payload);
  if (!container || !parsed) return null;

  const maplibregl = opts.loadMapLibre
    ? await opts.loadMapLibre()
    : await defaultLoadMapLibre();
  if (!maplibregl?.Map) return null;

  ensureMapCss();

  const focus = parsed.places.find((p) => p.id === parsed.focus) || parsed.places[0];
  const map = new maplibregl.Map({
    container,
    style: opts.style || DEFAULT_MAP_STYLE,
    center: [focus.lng, focus.lat],
    zoom: parsed.places.length === 1 ? 14 : 11
  });
  if (maplibregl.NavigationControl) {
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
  }

  /** @type {Map<string, any>} */
  const markers = new Map();

  for (const place of parsed.places) {
    const popup = maplibregl.Popup
      ? new maplibregl.Popup({ offset: 18 }).setHTML(
          `<div class="hub-places-map__popup"><strong>${escapeHtml(place.name)}</strong>${
            place.address ? `<small>${escapeHtml(place.address)}</small>` : ''
          }</div>`
        )
      : null;
    const marker = new maplibregl.Marker({
      color: place.kind === 'medical' ? '#4a7bb5' : '#c47a3a'
    }).setLngLat([place.lng, place.lat]);
    if (popup) marker.setPopup(popup);
    marker.getElement()?.addEventListener('click', () => opts.onSelect?.(place));
    marker.addTo(map);
    markers.set(place.id, marker);
  }

  function focusPlace(id) {
    const place = parsed.places.find((p) => p.id === id);
    if (!place) return;
    map.flyTo({ center: [place.lng, place.lat], zoom: 14, essential: true });
    markers.get(id)?.togglePopup?.();
    markers.get(id)?.getPopup?.()?.addTo?.(map);
  }

  if (parsed.focus) focusPlace(parsed.focus);

  return {
    map,
    destroy: () => {
      for (const marker of markers.values()) marker.remove?.();
      map.remove?.();
    },
    focusPlace
  };
}

function normalizePlace(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const place = /** @type {Record<string, unknown>} */ (entry);
  const id = typeof place.id === 'string' && place.id.trim() ? place.id.trim() : null;
  const name = typeof place.name === 'string' && place.name.trim() ? place.name.trim() : null;
  const coords = finiteLngLat(place.lng, place.lat);
  if (!id || !name || !coords) return null;
  /** @type {HubPlace} */
  const out = { id, name, lng: coords.lng, lat: coords.lat };
  if (typeof place.address === 'string' && place.address.trim()) out.address = place.address.trim();
  if (typeof place.kind === 'string' && place.kind.trim()) out.kind = place.kind.trim();
  if (Array.isArray(place.visitIds)) {
    out.visitIds = place.visitIds.filter((v) => typeof v === 'string');
  }
  return out;
}

function finiteLngLat(lng, lat) {
  const x = Number(lng);
  const y = Number(lat);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < -180 || x > 180 || y < -90 || y > 90) return null;
  return { lng: x, lat: y };
}

function slugify(text) {
  return (
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 48) || 'place'
  );
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function defaultLoadMapLibre() {
  const mod = await import('https://cdn.jsdelivr.net/npm/maplibre-gl@5.6.1/dist/maplibre-gl.mjs');
  return mod.default || mod;
}

function ensureMapCss() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('hub-maplibre-css')) return;
  const link = document.createElement('link');
  link.id = 'hub-maplibre-css';
  link.rel = 'stylesheet';
  link.href = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.6.1/dist/maplibre-gl.css';
  document.head.append(link);
}
