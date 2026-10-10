import { geoInterpolate } from 'd3-geo';
import type { JournalMoment } from './types';

export interface PhotoStop {
  momentId: string;
  lat: number;
  lon: number;
  /** False when unlocated story material sits between this stop and the previous located stop. */
  connectToPrevious: boolean;
}

export interface MapSegment {
  fromMomentId: string;
  toMomentId: string;
  /** GeoJSON order: [lon, lat][] with antimeridian-aware interpolation when enabled. */
  coordinates: [number, number][];
}

export interface BuildSegmentsOptions {
  /** Sample count along each great-circle segment (inclusive endpoints). */
  steps?: number;
  /** When true (default), interpolate with d3-geo so lines cross the antimeridian correctly. */
  wrapLongitude?: boolean;
}

const VISUAL_COORD_DECIMALS = 4;

export function buildPhotoStops(moments: JournalMoment[]): PhotoStop[] {
  const ordered = [...moments]
    .filter((m) => m.lifecycle === 'live')
    .sort((a, b) => a.display_order - b.display_order);

  const stops: PhotoStop[] = [];
  let unlocatedSinceLastLocated = false;

  for (const moment of ordered) {
    if (!moment.coordinates) {
      if (stops.length > 0) unlocatedSinceLastLocated = true;
      continue;
    }
    const { lat, lon } = moment.coordinates;
    stops.push({
      momentId: moment.id,
      lat,
      lon,
      connectToPrevious: stops.length > 0 && !unlocatedSinceLastLocated,
    });
    unlocatedSinceLastLocated = false;
  }

  return stops;
}

export function buildSegments(stops: PhotoStop[], opts: BuildSegmentsOptions = {}): MapSegment[] {
  const steps = opts.steps ?? 32;
  const wrapLongitude = opts.wrapLongitude ?? true;
  const segments: MapSegment[] = [];

  for (let i = 1; i < stops.length; i++) {
    const from = stops[i - 1]!;
    const to = stops[i]!;
    if (!to.connectToPrevious) continue;

    segments.push({
      fromMomentId: from.momentId,
      toMomentId: to.momentId,
      coordinates: segmentCoordinates(from, to, steps, wrapLongitude),
    });
  }

  return segments;
}

function segmentCoordinates(
  from: PhotoStop,
  to: PhotoStop,
  steps: number,
  wrapLongitude: boolean,
): [number, number][] {
  if (!wrapLongitude || steps < 1) {
    return [
      [from.lon, from.lat],
      [to.lon, to.lat],
    ];
  }

  const interpolate = geoInterpolate([from.lon, from.lat], [to.lon, to.lat]);
  const coordinates: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const [lon, lat] = interpolate(i / steps);
    coordinates.push([lon, lat]);
  }
  return coordinates;
}

/** Stable key for clustering visually identical pin positions without merging moments. */
export function visualDedupeKey(lat: number, lon: number): string {
  const normLon = normalizeLon(lon);
  return `${roundCoord(lat)},${roundCoord(normLon)}`;
}

function normalizeLon(lon: number): number {
  let x = lon;
  while (x <= -180) x += 360;
  while (x > 180) x -= 360;
  return x;
}

function roundCoord(value: number): string {
  return value.toFixed(VISUAL_COORD_DECIMALS);
}
