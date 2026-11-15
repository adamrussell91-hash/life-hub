/**
 * Relive as a list of scenes, worked out from the journal: arriving in a
 * city, each moment, the journey to the next city, and the end. Plain
 * functions, so the order can be tested without a map.
 */
import type { BookingKeepsake, Keepsake, PhotoKeepsake, StampKeepsake } from '@/journal/keepsakes/model';
import type { TripStops } from '@/journal/map/stops';
import { isAudioMedia } from '@/journal/transcripts';
import { transitionForFromLeg } from '@/journal/transitions';
import type { JournalFixture, JournalMoment } from '@/journal/types';

export type ReliveScene =
  | { kind: 'arrive'; legId: string; city: string; stamp?: StampKeepsake; stopIndex: number | null }
  | {
      kind: 'moment';
      momentId: string;
      legId: string;
      dayNumber: number;
      localDate: string;
      localTime?: string;
      placeName: string;
      text: string;
      mediaId?: string;
      /** The pin to move to, or null when the moment has no place: its card plays over the map where it stands. */
      stopIndex: number | null;
      keepsakes: PhotoKeepsake[];
    }
  | { kind: 'journey'; from: string; to: string; line: string; ticket?: BookingKeepsake; stopIndex: number | null }
  | { kind: 'end'; counts: string[]; stamps: StampKeepsake[] };

export interface ReliveInput {
  fixture: JournalFixture;
  /** The moments the story is showing, in story order. */
  moments: JournalMoment[];
  trip: TripStops;
  keepsakes: Keepsake[];
  dayNumberOf: (localDate: string) => number;
  /** The trip's length in days, once it is over. Before then the days are counted from the journal. */
  tripDays?: number | null;
}

const MODE_WORDS: Record<string, string> = { flight: 'by plane', train: 'by train', car: 'by car', ferry: 'by ferry' };
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

export function buildReliveScenes(input: ReliveInput): ReliveScene[] {
  const { fixture, trip, keepsakes } = input;
  const legs = new Map(fixture.legs.map((leg) => [leg.id, leg]));
  const media = new Map(fixture.media.map((m) => [m.id, m]));
  const stopOf = new Map(trip.stops.map((s) => [s.momentId, s.index]));
  const firstStopOfLeg = (legId: string): number | null => trip.stops.find((s) => s.legId === legId)?.index ?? null;
  const stamps = keepsakes.filter((k): k is StampKeepsake => k.type === 'stamp');
  const scenes: ReliveScene[] = [];

  let currentLeg: string | null = null;
  let photos = 0;
  const days = new Set<string>();
  const cities: string[] = [];

  for (const moment of input.moments) {
    if (moment.lifecycle !== 'live') continue;
    const photoId = moment.media_ids.find((id) => {
      const row = media.get(id);
      return row && row.lifecycle === 'live' && !isAudioMedia(row);
    });
    const text = moment.text?.trim() ?? '';
    // A moment that is only a sound clip has nothing to show: Relive is silent.
    if (!photoId && !text) continue;

    if (moment.leg_id !== currentLeg) {
      const city = legs.get(moment.leg_id)?.destination ?? '';
      if (currentLeg !== null) {
        const from = legs.get(currentLeg)?.destination ?? '';
        const trn = transitionForFromLeg(fixture, currentLeg);
        const by = trn ? MODE_WORDS[trn.mode] : undefined;
        scenes.push({
          kind: 'journey',
          from,
          to: city,
          line: [`${from} to ${city}`, by].filter(Boolean).join(', '),
          ticket: keepsakes.find((k): k is BookingKeepsake => k.type === 'booking' && k.legId === currentLeg && k.side === 'depart'),
          stopIndex: firstStopOfLeg(moment.leg_id),
        });
      }
      currentLeg = moment.leg_id;
      cities.push(city);
      scenes.push({
        kind: 'arrive',
        legId: moment.leg_id,
        city,
        stamp: stamps.find((s) => s.legId === moment.leg_id),
        stopIndex: firstStopOfLeg(moment.leg_id),
      });
    }

    days.add(moment.local_date);
    photos += moment.media_ids.filter((id) => {
      const row = media.get(id);
      return row && row.lifecycle === 'live' && !isAudioMedia(row);
    }).length;
    scenes.push({
      kind: 'moment',
      momentId: moment.id,
      legId: moment.leg_id,
      dayNumber: input.dayNumberOf(moment.local_date),
      localDate: moment.local_date,
      localTime: moment.local_time,
      placeName: moment.place?.name?.trim() ?? '',
      text,
      mediaId: photoId,
      stopIndex: stopOf.get(moment.id) ?? null,
      keepsakes: keepsakes.filter((k): k is PhotoKeepsake => k.type === 'photo' && k.momentId === moment.id),
    });
  }

  if (!scenes.length) return [];
  const kept = keepsakes.filter((k) => k.type !== 'stamp').length;
  // A finished trip is as long as it was. One still under way has run from its first journaled
  // day to its last: a day spent travelling with nothing written still counts.
  const numbers = [...days].map((d) => input.dayNumberOf(d)).filter((n) => n > 0);
  const span = numbers.length ? Math.max(...numbers) - Math.min(...numbers) + 1 : 0;
  const dayCount = Math.max(input.tripDays ?? 0, span, days.size);
  scenes.push({
    kind: 'end',
    counts: [
      plural(dayCount, 'day'),
      plural(cities.length, 'city', 'cities'),
      photos ? plural(photos, 'photo') : '',
      kept ? plural(kept, 'keepsake') : '',
    ].filter(Boolean),
    stamps: stamps.filter((s) => cities.includes(s.city)),
  });
  return scenes;
}

/** How long a scene stays before Relive moves on. The end stays until it is closed. */
export function sceneDurationMs(scene: ReliveScene): number | null {
  if (scene.kind === 'end') return null;
  if (scene.kind === 'arrive') return 2400;
  if (scene.kind === 'journey') return 2800;
  // Long enough to read the words: about 170 words a minute, on top of a look at the photo.
  const words = scene.text ? scene.text.split(/\s+/).length : 0;
  return Math.min(9000, 3000 + Math.round((words / 170) * 60000));
}
