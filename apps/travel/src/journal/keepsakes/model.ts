import type { JournalDocument } from '@/api/journal';
import { isVerifiedItineraryTicket } from '@/journal/transitions';
import {
  defaultJournalSouvenir,
  dropJournalSouvenir,
  readSouvenirsMap,
  restoreJournalSouvenir,
  softDeleteJournalSouvenir,
  upsertJournalSouvenir,
  type JournalSouvenir,
  type KeepsakeKind,
} from '@/journal/souvenirs';
import type { JournalLeg, JournalMedia } from '@/journal/types';
import { listPostcards, placeLine, type PostcardView } from '@/postcard/model';
import type { TicketItem, Trip } from '@/types';

export type { KeepsakeKind };

/** Something photographed and kept: a ticket stub, a poster, a coaster. */
export interface PhotoKeepsake {
  type: 'photo';
  id: string;
  kind: KeepsakeKind;
  title: string;
  note?: string;
  mediaId?: string;
  momentId?: string;
  /** Empty when an older record names neither a moment nor a city. */
  legId: string;
  localDate: string;
  localTime?: string;
  placeName?: string;
}

/** A flight or train on the itinerary, kept without any work. */
export interface BookingKeepsake {
  type: 'booking';
  id: string;
  itemId: string;
  mode: 'flight' | 'train';
  carrier: string;
  number: string;
  fromName: string;
  toName: string;
  fromCode: string;
  toCode: string;
  date: string;
  departTime: string;
  legId: string;
  /** Whether the ticket brought the traveller into this city or took them out of it. */
  side: 'arrive' | 'depart';
}

/** One per city: where and when the traveller arrived. */
export interface StampKeepsake {
  type: 'stamp';
  id: string;
  legId: string;
  city: string;
  country: string;
  date: string;
}

/** A postcard posted from a stop, kept without any work. Read from the trip, never copied. */
export interface PostcardKeepsake {
  type: 'postcard';
  /** `postcard_` and the check-in that carries it. */
  id: string;
  card: PostcardView;
  /** Empty when no live leg is for the postcard's city. */
  legId: string;
  /** When it was posted, in the leg's time zone. */
  localDate: string;
  localTime: string;
  /** "Jalan Alor, Kuala Lumpur" */
  placeName: string;
  /** A postcard is never linked to a moment. */
  momentId?: undefined;
}

export type Keepsake = PhotoKeepsake | BookingKeepsake | StampKeepsake | PostcardKeepsake;

/** The keepsakes that sit on a day of the story. */
export type DayKeepsake = PhotoKeepsake | PostcardKeepsake;

const liveLegs = (journal: JournalDocument): JournalLeg[] =>
  journal.legs.filter((leg) => leg.lifecycle === 'live').sort((a, b) => a.order - b.order);

function legStart(journal: JournalDocument, leg: JournalLeg): string {
  if (leg.start_date) return leg.start_date;
  const dates = journal.days
    .filter((d) => d.leg_id === leg.id && d.lifecycle === 'live')
    .map((d) => d.local_date)
    .sort();
  return dates[0] ?? '';
}

function hiddenBookingItems(rows: JournalSouvenir[]): Set<string> {
  const hidden = new Set<string>();
  for (const row of rows) {
    if (row.source === 'booking' && row.item_id && row.lifecycle === 'deleted') hidden.add(row.item_id);
  }
  return hidden;
}

export function ticketTitle(item: TicketItem): string {
  return `${item.carrier.trim()} ${item.number.trim()}`;
}

function bookingKeepsake(item: TicketItem, legs: JournalLeg[]): BookingKeepsake | null {
  const arriveLeg = item.arrive_city_id ? legs.find((leg) => leg.city_id === item.arrive_city_id) : undefined;
  const departLeg = legs.find((leg) => leg.city_id === item.city_id);
  // A ticket between two cities of the trip belongs to the journey out of the first.
  const between = arriveLeg && departLeg && arriveLeg.id !== departLeg.id;
  const leg = between ? departLeg : (arriveLeg ?? departLeg);
  if (!leg) return null;
  return {
    type: 'booking',
    id: `booking_${item.id}`,
    itemId: item.id,
    mode: item.kind,
    carrier: item.carrier.trim(),
    number: item.number.trim(),
    // Station and airport names when the booking has them, then the trip's own city names.
    fromName: item.from_name?.trim() || (between ? departLeg?.destination : '') || item.from_code.trim(),
    toName: item.to_name?.trim() || arriveLeg?.destination || item.to_code.trim(),
    fromCode: item.from_code.trim(),
    toCode: item.to_code.trim(),
    date: item.date,
    departTime: item.depart_time,
    legId: leg.id,
    side: between || leg !== arriveLeg ? 'depart' : 'arrive',
  };
}

function validZone(tz: string | undefined): string {
  if (!tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz }).format(new Date(0));
    return tz;
  } catch {
    return 'UTC';
  }
}

/** Date ("2027-03-04") and 24-hour time ("21:40") of an instant in a time zone. */
export function localStamp(instant: string, tz: string | undefined): { date: string; time: string } {
  const when = new Date(instant);
  if (Number.isNaN(when.getTime())) return { date: '', time: '' };
  const parts: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-GB', {
    timeZone: validZone(tz),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(when)) {
    parts[part.type] = part.value;
  }
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${hour}:${parts.minute}` };
}

/** The leg a postcard belongs to: its city's leg whose dates hold the posted day, else the first. */
function postcardLeg(
  journal: JournalDocument,
  legs: JournalLeg[],
  card: PostcardView,
  trip: Trip,
): { leg?: JournalLeg; date: string; time: string } {
  const cityTz = trip.cities.find((c) => c.id === card.cityId)?.tz;
  const candidates = legs.filter((leg) => leg.city_id === card.cityId);
  for (const leg of candidates) {
    const at = localStamp(card.at, leg.timezone || cityTz);
    const start = legStart(journal, leg);
    const end = leg.end_date ?? '';
    if ((!start || at.date >= start) && (!end || at.date <= end)) return { leg, ...at };
  }
  const leg = candidates[0];
  return { leg, ...localStamp(card.at, leg?.timezone || cityTz) };
}

function sortKey(k: Keepsake, legOrder: Map<string, number>): string {
  const leg = String(legOrder.get(k.legId) ?? 999).padStart(3, '0');
  if (k.type === 'stamp') return `${leg}|0|${k.date}`;
  if (k.type === 'booking') return `${leg}|${k.side === 'arrive' ? '1' : '3'}|${k.date}|${k.departTime}`;
  if (k.type === 'postcard') return `${leg}|2|${k.localDate || '9999'}|${k.localTime || '99:99'}|${k.card.id}`;
  return `${leg}|2|${k.localDate || '9999'}|${k.localTime ?? '99:99'}|${k.title}`;
}

/** Every keepsake of the trip in story order: stamps, bookings, the ones photographed and postcards. */
export function listKeepsakes(journal: JournalDocument, trip?: Trip): Keepsake[] {
  const legs = liveLegs(journal);
  const legIds = new Set(legs.map((leg) => leg.id));
  const rows = Object.values(readSouvenirsMap(journal));
  const out: Keepsake[] = [];

  for (const leg of legs) {
    const city = trip?.cities.find((c) => c.id === leg.city_id);
    out.push({
      type: 'stamp',
      id: `stamp_${leg.id}`,
      legId: leg.id,
      city: leg.destination,
      country: city?.country ?? '',
      date: legStart(journal, leg),
    });
  }

  const hidden = hiddenBookingItems(rows);
  for (const item of trip?.items ?? []) {
    if (!isVerifiedItineraryTicket(item) || hidden.has(item.id)) continue;
    const kept = bookingKeepsake(item, legs);
    if (kept) out.push(kept);
  }

  for (const row of rows) {
    if (row.lifecycle !== 'live' || row.source === 'booking') continue;
    const moment = row.moment_id
      ? journal.moments.find((m) => m.id === row.moment_id && m.lifecycle === 'live')
      : undefined;
    const legId = moment?.leg_id ?? row.leg_id ?? '';
    out.push({
      type: 'photo',
      id: row.id,
      kind: row.kind ?? 'other',
      title: row.title,
      note: row.note,
      mediaId: row.media_id,
      momentId: moment?.id,
      legId: legIds.has(legId) ? legId : '',
      localDate: moment?.local_date ?? row.local_date ?? '',
      localTime: row.local_time ?? moment?.local_time,
      placeName: moment?.place?.name,
    });
  }

  if (trip) {
    for (const card of listPostcards(trip)) {
      const { leg, date, time } = postcardLeg(journal, legs, card, trip);
      out.push({
        type: 'postcard',
        id: `postcard_${card.id}`,
        card,
        legId: leg?.id ?? '',
        localDate: date,
        localTime: time,
        placeName: placeLine(trip, card),
      });
    }
  }

  const legOrder = new Map(legs.map((leg, index) => [leg.id, index]));
  return out.sort((a, b) => sortKey(a, legOrder).localeCompare(sortKey(b, legOrder)));
}

/** The photographed keepsakes and postcards of one day, in time order. */
export function keepsakesForDay(all: Keepsake[], legId: string, localDate: string): DayKeepsake[] {
  return all.filter(
    (k): k is DayKeepsake =>
      (k.type === 'photo' || k.type === 'postcard') && k.legId === legId && k.localDate === localDate,
  );
}

/** Every postcard on the trip, in the order they were posted. */
export function postcardsOf(all: Keepsake[]): PostcardView[] {
  return all
    .filter((k): k is PostcardKeepsake => k.type === 'postcard')
    .map((k) => k.card)
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

/** Keepsakes that count towards "3 keepsakes": everything but the arrival stamps. */
export function countKept(all: Keepsake[], legId?: string): number {
  return all.filter((k) => k.type !== 'stamp' && (legId === undefined || k.legId === legId)).length;
}

const hideRowId = (itemId: string): string => `sv_hide_${itemId}`;

/** Stop showing a booked ticket. Stored as a deleted row so Trash can bring it back. */
export function hideBookingKeepsake(journal: JournalDocument, itemId: string, title = 'Booked ticket'): JournalDocument {
  const row: JournalSouvenir = {
    ...defaultJournalSouvenir({ title, source: 'booking', kind: 'ticket', item_id: itemId }),
    id: hideRowId(itemId),
  };
  return softDeleteJournalSouvenir(upsertJournalSouvenir(journal, row), row.id);
}

const usedByLiveMoment = (journal: JournalDocument, mediaId: string): boolean =>
  journal.moments.some((m) => m.lifecycle === 'live' && m.media_ids.includes(mediaId));

function mapMedia(journal: JournalDocument, mediaId: string | undefined, fn: (m: JournalMedia) => JournalMedia): JournalDocument {
  if (!mediaId) return journal;
  return { ...journal, media: journal.media.map((m) => (m.id === mediaId ? fn(m) : m)) };
}

/** Move a photographed keepsake to Trash, with its photo when no moment uses it. */
export function removeKeepsake(journal: JournalDocument, souvenirId: string): JournalDocument {
  const row = readSouvenirsMap(journal)[souvenirId];
  if (!row || row.lifecycle !== 'live') return journal;
  let next = softDeleteJournalSouvenir(journal, souvenirId);
  if (row.media_id && !usedByLiveMoment(journal, row.media_id)) {
    next = mapMedia(next, row.media_id, (m) =>
      m.lifecycle === 'live'
        ? { ...m, lifecycle: 'deleted', deleted_at: new Date().toISOString(), deleted_with: souvenirId }
        : m,
    );
  }
  return next;
}

/** Bring a keepsake back from Trash. A hidden booked ticket simply shows again. */
export function restoreKeepsake(journal: JournalDocument, souvenirId: string): JournalDocument {
  const row = readSouvenirsMap(journal)[souvenirId];
  if (!row || row.lifecycle !== 'deleted') return journal;
  if (row.source === 'booking') return dropJournalSouvenir(journal, souvenirId);
  const next = restoreJournalSouvenir(journal, souvenirId);
  return mapMedia(next, row.media_id, (m) => {
    if (m.lifecycle !== 'deleted' || m.deleted_with !== souvenirId) return m;
    const { deleted_at: _at, deleted_with: _with, ...rest } = m;
    return { ...rest, lifecycle: 'live' };
  });
}

/** Delete a trashed keepsake for good, and its photo when it was only the keepsake's. */
export function purgeKeepsake(journal: JournalDocument, souvenirId: string): JournalDocument {
  const row = readSouvenirsMap(journal)[souvenirId];
  if (!row) return journal;
  const next = dropJournalSouvenir(journal, souvenirId);
  if (!row.media_id) return next;
  return {
    ...next,
    media: next.media.filter((m) => !(m.id === row.media_id && m.lifecycle === 'deleted' && m.deleted_with === souvenirId)),
  };
}

export interface TrashedKeepsake {
  id: string;
  title: string;
  booking: boolean;
}

/** Keepsakes the traveller removed. Ones that went with a deleted moment come back with it. */
export function listTrashedKeepsakes(journal: JournalDocument): TrashedKeepsake[] {
  return Object.values(readSouvenirsMap(journal))
    .filter((row) => row.lifecycle === 'deleted' && !row.deleted_with)
    .map((row) => ({ id: row.id, title: row.title, booking: row.source === 'booking' }));
}

/** A new photographed keepsake. */
export function addPhotoKeepsake(
  journal: JournalDocument,
  input: {
    kind: KeepsakeKind;
    title: string;
    note?: string;
    mediaId?: string;
    momentId?: string;
    legId?: string;
    localDate?: string;
    localTime?: string;
    coordinates?: { lat: number; lon: number };
  },
): JournalDocument {
  return upsertJournalSouvenir(
    journal,
    defaultJournalSouvenir({
      title: input.title,
      note: input.note,
      kind: input.kind,
      source: 'photo',
      media_id: input.mediaId,
      moment_id: input.momentId,
      leg_id: input.legId,
      local_date: input.localDate,
      local_time: input.localTime,
      coordinates: input.coordinates,
    }),
  );
}

