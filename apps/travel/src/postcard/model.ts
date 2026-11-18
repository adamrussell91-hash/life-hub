/**
 * Postcards on check-ins: one list for every place a postcard is shown.
 *
 * The owner's trip carries check-ins; the public trip carries a `postcard` on each
 * stop instead. Both come out of `listPostcards` in the same shape, so the stop's
 * small card, the stack on the public link and the opened view cannot disagree.
 */
import type { Checkin, City, Item, PostcardOrientation, PublicPostcard, PublicSafeFields, SceneId, Trip } from '@/types';
import type { PlaceAddressParts } from '@/api/travel';
import { itemPlace } from '@/model/day';
import { dateInZone } from '@/lib/time';

export const POSTCARD_MAX_LINES = 4;
export const POSTCARD_MAX_LINE_CHARS = 60;
export const POSTCARD_MAX_TEXT_CHARS = 600;
export const POSTCARD_MAX_AUDIO_S = 30;

export interface PostcardView {
  /** The check-in that carries it. */
  id: string;
  itemId: string;
  cityId: string;
  /** The stop's title, for labels. */
  title: string;
  /** When it was posted. */
  at: string;
  photoId: string;
  /** Absent on a photo from before postcards: measured when the image loads. */
  orientation?: PostcardOrientation;
  address: string[];
  audioId?: string;
  audioS?: number;
  text?: string;
}

/** The owner's trip (with check-ins) or the public trip (stops carry `postcard`). */
export type PostcardTrip = Pick<Trip, 'id' | 'cities' | 'items' | 'start_date'> & { checkins?: Checkin[] };

/** One to four tidy lines of at most 60 characters, with repeats dropped. */
export function tidyAddress(lines: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of lines) {
    const flat = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
    const line = Array.from(flat).slice(0, POSTCARD_MAX_LINE_CHARS).join('');
    const key = line.toLowerCase();
    if (!line || seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out.slice(0, POSTCARD_MAX_LINES);
}

/** Street, neighbourhood, postcode and town, country. Blank parts are left out. */
export function addressFromParts(parts: PlaceAddressParts | null | undefined): string[] {
  if (!parts) return [];
  return tidyAddress([
    parts.street ?? '',
    parts.district ?? '',
    [parts.postcode, parts.city].filter(Boolean).join(' '),
    parts.country ?? ''
  ]);
}

/** When the photo says nothing about where it was taken: the stop, its city and country. */
export function fallbackAddress(trip: PostcardTrip, item: Item): string[] {
  const city = trip.cities.find((c) => c.id === item.city_id);
  return tidyAddress([itemPlace(item)?.name || item.title, city?.name ?? '', city?.country ?? '']);
}

function viewOf(trip: PostcardTrip, item: Item, card: PublicPostcard): PostcardView {
  const address = tidyAddress(card.address ?? []);
  return {
    id: card.id,
    itemId: item.id,
    cityId: item.city_id,
    title: item.title,
    at: card.at,
    photoId: card.photo_id,
    orientation: card.orientation,
    address: address.length ? address : fallbackAddress(trip, item),
    ...(card.audio_id ? { audioId: card.audio_id, audioS: card.audio_s } : {}),
    ...(card.text ? { text: card.text } : {})
  };
}

/** The newest check-in on a stop that has a postcard, or a photo from before postcards. */
function carryingCheckin(checkins: Checkin[], itemId: string): Checkin | null {
  let best: Checkin | null = null;
  for (const c of checkins) {
    if (c.item_id !== itemId || (!c.postcard && !c.photo_id)) continue;
    if (!best || c.at > best.at) best = c;
  }
  return best;
}

/** Every postcard on the trip, oldest first. Ties go to the check-in id. */
export function listPostcards(trip: PostcardTrip): PostcardView[] {
  const out: PostcardView[] = [];
  for (const item of trip.items) {
    const shown = item as Item & PublicSafeFields;
    if (shown.postcard?.photo_id) {
      out.push(viewOf(trip, item, shown.postcard));
      continue;
    }
    // A public trip served by an API that does not send postcards yet: the photo still gets its card.
    if (shown.safe_photo_id && shown.safe_at) {
      out.push(viewOf(trip, item, { id: `safe_${item.id}`, at: shown.safe_at, photo_id: shown.safe_photo_id }));
      continue;
    }
    const carrier = carryingCheckin(trip.checkins ?? [], item.id);
    if (!carrier) continue;
    const card = carrier.postcard;
    out.push(
      viewOf(
        trip,
        item,
        card
          ? {
              id: carrier.id,
              at: card.posted_at || carrier.at,
              photo_id: card.photo_id,
              orientation: card.orientation,
              address: card.address,
              audio_id: card.audio_id,
              audio_s: card.audio_s,
              text: card.text
            }
          : { id: carrier.id, at: carrier.at, photo_id: carrier.photo_id! }
      )
    );
  }
  return out.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

export function postcardForItem(cards: PostcardView[], itemId: string): PostcardView | null {
  return cards.find((c) => c.itemId === itemId) ?? null;
}

/** What the stamp, the postmark and the line under an opened card say. */
export interface PostcardFacts {
  cityName: string;
  country: string;
  accent: City['accent'];
  scene: SceneId;
  /** Day 1 is the trip's start date, counted in the city's time zone. */
  dayNumber: number;
  /** "18 NOV" */
  postmarkDate: string;
  /** "2026" */
  postmarkYear: string;
  /** "21:40", local to the city. */
  localTime: string;
  /** "Wed 18 Nov, 21:40" */
  caption: string;
}

const NEUTRAL_ACCENT = { color: '#376fb7', soft: '#dceafa', ink: '#294c71' };

function safeZone(tz: string | undefined): string {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz }).format(new Date(0));
    return tz || 'UTC';
  } catch {
    return 'UTC';
  }
}

function daysBetween(fromDate: string, toDate: string): number {
  const day = (iso: string): number => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y || 1970, (m || 1) - 1, d || 1);
  };
  return Math.round((day(toDate) - day(fromDate)) / 86_400_000);
}

export function postcardFacts(trip: PostcardTrip, card: PostcardView): PostcardFacts {
  const city = trip.cities.find((c) => c.id === card.cityId);
  const tz = safeZone(city?.tz);
  const posted = new Date(card.at);
  const when = Number.isNaN(posted.getTime()) ? new Date(0) : posted;
  const parts: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(when)) {
    parts[part.type] = part.value;
  }
  // Some engines print midnight as 24:00.
  const localTime = `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`;
  return {
    cityName: city?.name ?? '',
    country: city?.country ?? '',
    accent: city?.accent ?? NEUTRAL_ACCENT,
    scene: city?.scene ?? 'generic',
    dayNumber: Math.max(1, daysBetween(trip.start_date, dateInZone(when, tz)) + 1),
    postmarkDate: `${parts.day} ${parts.month}`.toUpperCase(),
    postmarkYear: parts.year ?? '',
    localTime,
    caption: `${parts.weekday} ${parts.day} ${parts.month}, ${localTime}`
  };
}

/** "Jalan Alor, Kuala Lumpur": the first address line, then the city when it is not already that line. */
export function placeLine(trip: PostcardTrip, card: PostcardView): string {
  const city = trip.cities.find((c) => c.id === card.cityId)?.name ?? '';
  const first = card.address[0] ?? card.title;
  return city && first.toLowerCase() !== city.toLowerCase() ? `${first}, ${city}` : first;
}
