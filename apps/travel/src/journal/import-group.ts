import type { JournalLeg } from '@/journal/types';

export interface GroupingThresholds {
  minutes: number;
  metres: number;
}

export interface ProposeGroupsContext {
  legs: JournalLeg[];
  thresholds?: GroupingThresholds;
  /** Checksums already stored on the journal — duplicates are flagged, not re-imported. */
  known_checksums?: string[];
}

export interface PhotoProvenance {
  capture_time_source: 'exif' | 'file_last_modified' | 'none';
  file_last_modified: string;
  gps_source: 'exif' | 'none';
}

export interface InspectedPhoto {
  checksum: string;
  mime: string;
  width: number;
  height: number;
  capture_wall_time: string | null;
  offset_minutes?: number;
  coordinates?: { lat: number; lon: number };
  raw_metadata: Record<string, unknown>;
  provenance: PhotoProvenance;
  /** UTC instant when timezone offset evidence exists. */
  instant?: string;
  needs_timezone?: boolean;
  needs_date?: boolean;
}

export interface ProposedMoment {
  checksums: string[];
  duplicate_checksums: string[];
  leg_id: string | null;
  local_date: string | null;
  local_time: string | null;
  instant?: string;
  needs_timezone?: boolean;
  needs_date?: boolean;
  coordinates?: { lat: number; lon: number };
  location_source?: 'exif';
  unlocated: boolean;
}

export const DEFAULT_GROUPING_THRESHOLDS: GroupingThresholds = {
  minutes: 45,
  metres: 250,
};

const EARTH_RADIUS_M = 6_371_000;

/** EXIF orientation 5–8 swap width and height for display bitmap size. */
export function orientationAppliedDims(
  width: number,
  height: number,
  orientation: number | undefined
): { width: number; height: number } {
  if (!width || !height) return { width, height };
  const o = orientation ?? 1;
  if (o >= 5 && o <= 8) return { width: height, height: width };
  return { width, height };
}

/** Treat 0,0 and near-zero as absent GPS (common EXIF placeholder). */
export function coordsFromGps(
  lat: number | undefined,
  lon: number | undefined
): { lat: number; lon: number } | undefined {
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return undefined;
  }
  if (Math.abs(lat) < 1e-6 && Math.abs(lon) < 1e-6) return undefined;
  return { lat, lon };
}

export function haversineMetres(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function captureMs(photo: InspectedPhoto): number | null {
  if (photo.instant) return Date.parse(photo.instant);
  if (photo.capture_wall_time) {
    const normalized = photo.capture_wall_time.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
    const t = Date.parse(normalized);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function minutesApart(a: InspectedPhoto, b: InspectedPhoto): number | null {
  const ams = captureMs(a);
  const bms = captureMs(b);
  if (ams == null || bms == null) return null;
  return Math.abs(ams - bms) / 60_000;
}

function canMergeByProximity(
  prev: InspectedPhoto,
  next: InspectedPhoto,
  thresholds: GroupingThresholds
): boolean {
  const minutes = minutesApart(prev, next);
  if (minutes == null) return false;
  if (minutes > thresholds.minutes) return false;

  const a = prev.coordinates;
  const b = next.coordinates;
  if (a && b) {
    return haversineMetres(a, b) <= thresholds.metres;
  }
  return true;
}

function wallToLocalParts(wall: string): { local_date: string; local_time: string } | null {
  const m = wall.match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  return {
    local_date: `${m[1]}-${m[2]}-${m[3]}`,
    local_time: `${m[4]}:${m[5]}`,
  };
}

function formatInTimeZone(instantIso: string, timeZone: string): { local_date: string; local_time: string } {
  const d = new Date(instantIso);
  const date = d.toLocaleDateString('en-CA', { timeZone });
  const time = d.toLocaleTimeString('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return { local_date: date, local_time: time };
}

function pickLegForLocalDate(legs: JournalLeg[], localDate: string | null): string | null {
  if (!legs.length) return null;
  const ordered = [...legs].sort((a, b) => a.order - b.order);
  if (!localDate) return ordered[0]?.id ?? null;
  for (const leg of ordered) {
    if (leg.start_date && leg.end_date && localDate >= leg.start_date && localDate <= leg.end_date) {
      return leg.id;
    }
  }
  return ordered[0]?.id ?? null;
}

function representativeCoords(photos: InspectedPhoto[]): { lat: number; lon: number } | undefined {
  for (const p of photos) {
    if (p.coordinates) return p.coordinates;
  }
  return undefined;
}

function buildMoment(
  photos: InspectedPhoto[],
  ctx: ProposeGroupsContext,
  known: Set<string>
): ProposedMoment {
  const checksums = photos.map((p) => p.checksum);
  const seen = new Set<string>();
  const duplicate_checksums: string[] = [];
  for (const c of checksums) {
    if (seen.has(c) || known.has(c)) duplicate_checksums.push(c);
    seen.add(c);
  }

  const needs_date = photos.some((p) => p.needs_date || !p.capture_wall_time);
  const needs_timezone = photos.some((p) => p.needs_timezone);

  const withInstant = photos.find((p) => p.instant);
  const legGuess = ctx.legs.find((l) => l.timezone);
  let local_date: string | null = null;
  let local_time: string | null = null;
  let instant: string | undefined;
  let leg_id: string | null = null;

  if (withInstant?.instant && legGuess?.timezone) {
    instant = withInstant.instant;
    const parts = formatInTimeZone(instant, legGuess.timezone);
    local_date = parts.local_date;
    local_time = parts.local_time;
    leg_id = pickLegForLocalDate(ctx.legs, local_date);
  } else {
    const wall = photos.find((p) => p.capture_wall_time)?.capture_wall_time;
    if (wall) {
      const parts = wallToLocalParts(wall);
      if (parts) {
        local_date = parts.local_date;
        local_time = parts.local_time;
        leg_id = pickLegForLocalDate(ctx.legs, local_date);
      }
    }
  }

  const coords = representativeCoords(photos);
  const unlocated = !coords;

  return {
    checksums,
    duplicate_checksums,
    leg_id,
    local_date,
    local_time,
    instant,
    needs_timezone: needs_timezone || undefined,
    needs_date: needs_date || undefined,
    coordinates: coords,
    location_source: coords ? 'exif' : undefined,
    unlocated,
  };
}

export function proposeGroups(
  photos: InspectedPhoto[],
  ctx: ProposeGroupsContext
): ProposedMoment[] {
  const thresholds = ctx.thresholds ?? DEFAULT_GROUPING_THRESHOLDS;
  const known = new Set(ctx.known_checksums ?? []);

  const sorted = [...photos].sort((a, b) => {
    const am = captureMs(a);
    const bm = captureMs(b);
    if (am == null && bm == null) return 0;
    if (am == null) return 1;
    if (bm == null) return -1;
    return am - bm;
  });

  if (!sorted.length) return [];

  const groups: InspectedPhoto[][] = [];
  let current: InspectedPhoto[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = current[current.length - 1]!;
    const next = sorted[i]!;
    if (canMergeByProximity(prev, next, thresholds)) {
      current.push(next);
    } else {
      groups.push(current);
      current = [next];
    }
  }
  groups.push(current);

  return groups.map((g) => buildMoment(g, ctx, known));
}
