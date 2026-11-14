/**
 * Straight-line distance between two points, and the wording the journal uses
 * between two moments. The journal does not track movement, so this is always
 * "how far apart", never "how far walked".
 */

import { minutesOfDay } from '@/journal/trip-days';

export interface LatLon {
  lat: number;
  lon: number;
}

const EARTH_KM = 6371;
const RAD = Math.PI / 180;

export function distanceKm(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "40 m", "440 m", "1.3 km", "12 km". Empty under 10 m, which is the same place. */
export function formatApart(km: number): string {
  if (!Number.isFinite(km) || km < 0.01) return '';
  if (km < 0.995) return `${Math.round((km * 1000) / 10) * 10} m`;
  if (km < 9.95) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/** "35 min later", "1 h 35 min later". Empty when either time is missing or the second is not later. */
export function formatLater(fromHHMM?: string, toHHMM?: string): string {
  const from = minutesOfDay(fromHHMM);
  const to = minutesOfDay(toHHMM);
  if (from === null || to === null || to <= from) return '';
  const gap = to - from;
  const hours = Math.floor(gap / 60);
  const minutes = gap % 60;
  if (hours === 0) return `${minutes} min later`;
  if (minutes === 0) return `${hours} h later`;
  return `${hours} h ${minutes} min later`;
}

export interface StitchStop {
  coordinates?: LatLon;
  local_time?: string;
}

/** "1.3 km away · 1 h 35 min later", either half alone, or empty. */
export function stitchLabel(a: StitchStop, b: StitchStop): string {
  const apart = a.coordinates && b.coordinates ? formatApart(distanceKm(a.coordinates, b.coordinates)) : '';
  const later = formatLater(a.local_time, b.local_time);
  return [apart ? `${apart} away` : '', later].filter(Boolean).join(' · ');
}
