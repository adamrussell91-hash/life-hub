/**
 * The trip as the map sees it: an ordered list of stops (moments that have a
 * place), the route between them, and how many moments have no place.
 */
import { isAudioMedia } from '@/journal/transcripts';
import type { JournalFixture, JournalLeg, JournalMoment } from '@/journal/types';

export interface TripStop {
  /** 0-based position along the whole trip. The pin shows index + 1. */
  index: number;
  momentId: string;
  legId: string;
  lat: number;
  lon: number;
  localDate: string;
  localTime?: string;
  dayNumber: number;
  placeName: string;
  /** The stop's first photo, when it has one. */
  mediaId?: string;
  text: string;
}

export interface RouteSegment {
  /** `city`: within one city, drawn solid. `journey`: from one city to the next, drawn dashed. */
  kind: 'city' | 'journey';
  /** The stop this segment arrives at. The route is "drawn up to" a stop by its index. */
  toIndex: number;
  coordinates: [number, number][];
}

export interface TripStops {
  stops: TripStop[];
  segments: RouteSegment[];
  /** Moments with no place: they are in the story but not on the map. */
  unplaced: number;
}

const isPlaced = (m: JournalMoment): boolean =>
  typeof m.coordinates?.lat === 'number' &&
  typeof m.coordinates?.lon === 'number' &&
  Number.isFinite(m.coordinates.lat) &&
  Number.isFinite(m.coordinates.lon) &&
  !(Math.abs(m.coordinates.lat) < 0.0001 && Math.abs(m.coordinates.lon) < 0.0001);

/**
 * @param moments the moments the story is showing, already in story order
 * @param dayNumberOf the trip day for a date (1 on the first day)
 */
export function buildTripStops(
  fixture: JournalFixture,
  moments: JournalMoment[],
  dayNumberOf: (localDate: string) => number,
): TripStops {
  const legs = new Map<string, JournalLeg>(fixture.legs.map((leg) => [leg.id, leg]));
  const media = new Map(fixture.media.map((m) => [m.id, m]));
  const stops: TripStop[] = [];
  let unplaced = 0;

  for (const moment of moments) {
    if (moment.lifecycle !== 'live') continue;
    if (!isPlaced(moment)) {
      unplaced += 1;
      continue;
    }
    const photo = moment.media_ids.find((id) => {
      const row = media.get(id);
      return row && row.lifecycle === 'live' && !isAudioMedia(row);
    });
    stops.push({
      index: stops.length,
      momentId: moment.id,
      legId: moment.leg_id,
      lat: moment.coordinates!.lat,
      lon: moment.coordinates!.lon,
      localDate: moment.local_date,
      localTime: moment.local_time,
      dayNumber: dayNumberOf(moment.local_date),
      placeName: moment.place?.name?.trim() || legs.get(moment.leg_id)?.destination || '',
      mediaId: photo,
      text: moment.text?.trim() ?? '',
    });
  }

  const segments: RouteSegment[] = [];
  for (let i = 1; i < stops.length; i += 1) {
    const from = stops[i - 1]!;
    const to = stops[i]!;
    segments.push({
      kind: from.legId === to.legId ? 'city' : 'journey',
      toIndex: to.index,
      coordinates: [
        [from.lon, from.lat],
        [to.lon, to.lat],
      ],
    });
  }
  return { stops, segments, unplaced };
}

/** South-west and north-east corners holding every stop, or null with none. */
export function stopsBounds(stops: TripStop[]): [[number, number], [number, number]] | null {
  if (!stops.length) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const s of stops) {
    west = Math.min(west, s.lon);
    east = Math.max(east, s.lon);
    south = Math.min(south, s.lat);
    north = Math.max(north, s.lat);
  }
  return [
    [west, south],
    [east, north],
  ];
}

/** What a screen reader hears for the slider's position. */
export function stopSpokenLabel(stop: TripStop, total: number): string {
  return [`Stop ${stop.index + 1} of ${total}`, stop.dayNumber > 0 ? `Day ${stop.dayNumber}` : '', stop.placeName]
    .filter(Boolean)
    .join(', ');
}

/** "3 moments have no place and are not on the map", or nothing when every moment has one. */
export function unplacedLine(unplaced: number): string {
  if (unplaced <= 0) return '';
  return unplaced === 1
    ? '1 moment has no place and is not on the map'
    : `${unplaced} moments have no place and are not on the map`;
}
