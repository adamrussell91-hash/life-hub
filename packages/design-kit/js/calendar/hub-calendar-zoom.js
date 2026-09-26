/**
 * Zoom stop ↔ hub router paths. Teaching uses pathname; Tasks/Professional use hash.
 */

export const CALENDAR_ZOOMS = Object.freeze(['day', 'week', 'term', 'year', 'almanac']);

/** @param {unknown} value */
export function normalizeCalendarZoom(value) {
  const zoom = String(value || '').toLowerCase();
  if (zoom === 'month') return 'week';
  return CALENDAR_ZOOMS.includes(zoom) ? zoom : 'week';
}

/**
 * @param {string} hub
 * @param {string} [zoom]
 * @returns {string} same-origin path or hash the hub router already understands
 */
export function calendarZoomHref(hub, zoom = 'week') {
  const z = normalizeCalendarZoom(zoom);
  if (hub === 'teaching') {
    return z === 'week' ? '/calendar' : `/calendar/${z}`;
  }
  if (hub === 'professional') {
    return z === 'week' ? '#/calendar' : `#/calendar/${z}`;
  }
  if (hub === 'tasks') {
    return z === 'week' ? '#/week' : `#/${z}`;
  }
  // Life
  return z === 'week' ? '#/calendar' : `#/calendar/${z}`;
}

/**
 * Parse zoom from a location pathname and/or hash.
 * @param {{ pathname?: string, hash?: string }} loc
 * @param {string} [hub]
 */
export function parseCalendarZoom(loc = {}, hub = 'life') {
  const hash = String(loc.hash || '').replace(/^#\/?/, '');
  const path = String(loc.pathname || '');

  if (hub === 'teaching') {
    const m = path.match(/\/calendar(?:\/([^/]+))?\/?$/);
    if (m) return normalizeCalendarZoom(m[1] || 'week');
  }

  if (hub === 'professional') {
    const m = hash.match(/^calendar(?:\/([^/]+))?$/);
    if (m) return normalizeCalendarZoom(m[1] || 'week');
  }

  if (hub === 'tasks') {
    const head = hash.split('?')[0]?.split('/')[0] || '';
    if (head === 'month') return 'week';
    if (CALENDAR_ZOOMS.includes(head)) return head;
    return null;
  }

  // Life: #/calendar or #/calendar/<zoom>
  const life = hash.match(/^calendar(?:\/([^/]+))?$/);
  if (life) return normalizeCalendarZoom(life[1] || 'week');
  return null;
}
