import type { City, IsoDate, Item, Place, StayItem, Trip } from '@/types';

/** Only PlaceItem and StayItem carry a `place`; tickets and check-ins never do. */
export function itemPlace(item: Item): Place | undefined {
  switch (item.kind) {
    case 'flight':
    case 'train':
    case 'checkin_slot':
      return undefined;
    default:
      return item.place;
  }
}

/** §3 rule 1 — every date from start to end for a city, plus any date with
 * an item for that city (travel days can appear in two cities). */
export function daysForCity(trip: Trip, cityId: string): IsoDate[] {
  const city = trip.cities.find((c) => c.id === cityId);
  const dates = new Set<IsoDate>();
  if (city) {
    for (let d = new Date(city.start_date + 'T00:00:00Z'); ; d = addDaysUtc(d, 1)) {
      const iso = toIsoUtc(d);
      dates.add(iso);
      if (iso === city.end_date) break;
    }
  }
  for (const item of trip.items) {
    if (item.city_id === cityId) dates.add(item.date);
  }
  return [...dates].sort();
}

/** Cities whose day list includes this date (range or item). Travel days land in two. */
export function citiesSharingDate(trip: Trip, date: IsoDate): City[] {
  return trip.cities.filter((city) => daysForCity(trip, city.id).includes(date));
}

export function otherCitiesSharingDate(trip: Trip, cityId: string, date: IsoDate): City[] {
  return citiesSharingDate(trip, date).filter((city) => city.id !== cityId);
}

/**
 * Short daybar label when this date is shared with another city.
 * Prefer → toward a city that starts today, ← from a city that ends today.
 */
export function travelDayCue(trip: Trip, cityId: string, date: IsoDate): string | null {
  const others = otherCitiesSharingDate(trip, cityId, date);
  if (!others.length) return null;
  const outbound = others.filter((city) => city.start_date === date);
  if (outbound.length) return `→ ${outbound.map((city) => city.name).join(', ')}`;
  const inbound = others.filter((city) => city.end_date === date);
  if (inbound.length) return `← ${inbound.map((city) => city.name).join(', ')}`;
  return `also ${others.map((city) => city.name).join(', ')}`;
}

function toIsoUtc(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

function addDaysUtc(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/** §3 rule 2 — time ascending, `time: null` first, ties keep insertion order.
 * Tickets sort by `depart_time`. */
export function orderDayItems(items: Item[]): Item[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ta = sortTime(a.item);
      const tb = sortTime(b.item);
      if (ta === null && tb === null) return a.index - b.index;
      if (ta === null) return -1;
      if (tb === null) return 1;
      if (ta === tb) return a.index - b.index;
      return ta < tb ? -1 : 1;
    })
    .map((entry) => entry.item);
}

function sortTime(item: Item): string | null {
  if (item.kind === 'flight' || item.kind === 'train') return item.depart_time;
  return item.time;
}

/** §3 rule 3 — numbered pins go to items with a `place` that aren't stays,
 * in the day's rendered order. Stays and tickets get no number. */
export function numberStops(items: Item[]): Map<string, number> {
  const numbers = new Map<string, number>();
  let n = 0;
  for (const item of items) {
    if (item.kind === 'stay') continue;
    if (!itemPlace(item)) continue;
    n += 1;
    numbers.set(item.id, n);
  }
  return numbers;
}

/** §3 rule 4 — the stay covering night N with `home_base: true`. Ties
 * resolved by latest `updated_at`. */
export function homeBaseForNight(trip: Trip, date: IsoDate): StayItem | null {
  const candidates = trip.items.filter(
    (item): item is StayItem =>
      item.kind === 'stay' && item.home_base && item.date <= date && date < item.check_out_date
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, item) => (item.updated_at > latest.updated_at ? item : latest));
}

/** §3 rule 5 — arrival guide shows on a city's first day, or on any day
 * with a ticket arriving into that city. */
export function showArrivalGuide(trip: Trip, cityId: string, date: IsoDate): boolean {
  const city = trip.cities.find((c) => c.id === cityId);
  if (city && city.start_date === date) return true;
  return trip.items.some(
    (item) =>
      (item.kind === 'flight' || item.kind === 'train') &&
      item.arrive_city_id === cityId &&
      item.arrive_date === date
  );
}

const WALK_METERS_PER_MIN = 80;
const HOP_FALLBACK_DETOUR = 1.3;
const HOP_FALLBACK_MAX_KM = 2.5;

/** Haversine distance in km. */
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon;
  return R * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** §3 rule 6 — walking-pace hop fallback between an item and the next
 * pinned item, when neither has an explicit `hop` and they're close. */
export function hopFallback(from: Item, to: Item | undefined): { minutes: number } | null {
  if (!to) return null;
  if (from.hop) return null;
  const fromPlace = itemPlace(from);
  const toPlace = itemPlace(to);
  if (!fromPlace || !toPlace) return null;
  const km = haversineKm(fromPlace, toPlace);
  if (km >= HOP_FALLBACK_MAX_KM) return null;
  const minutes = Math.round((km * 1000 * HOP_FALLBACK_DETOUR) / WALK_METERS_PER_MIN);
  return { minutes };
}

export interface TodoRow {
  when_label: string;
  title: string;
  detail: string;
  city_id: string;
  date: IsoDate;
}

/** §3 rule 7 — the single function behind the "still to book" count and list. */
export function buildTodo(trip: Trip, today: IsoDate): TodoRow[] {
  const rows: TodoRow[] = [];

  const todoItems = trip.items
    .filter((item) => item.status === 'todo')
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const item of todoItems) {
    rows.push({
      when_label: formatWhenLabel(item.date),
      title: item.title,
      detail: 'Still to book',
      city_id: item.city_id,
      date: item.date
    });
  }

  rows.push(...noBedRanges(trip));

  const cancellations = trip.items.filter(
    (item): item is StayItem => item.kind === 'stay' && Boolean(item.cancel_until) && item.cancel_until! >= today
  );
  for (const stay of cancellations) {
    rows.push({
      when_label: formatWhenLabel(stay.cancel_until!),
      title: stay.title,
      detail: `Free cancellation ends ${formatWhenLabel(stay.cancel_until!)}`,
      city_id: stay.city_id,
      date: stay.date
    });
  }

  return rows;
}

function noBedRanges(trip: Trip): TodoRow[] {
  const nights = tripNights(trip.start_date, trip.end_date);
  if (nights.length === 0) return [];
  const lastNight = nights[nights.length - 1];
  const covered = new Set<IsoDate>();
  for (const item of trip.items) {
    if (item.kind !== 'stay') continue;
    for (const night of nightsBetween(item.date, item.check_out_date)) covered.add(night);
  }
  const uncovered = nights.filter((n) => n !== lastNight && !covered.has(n));
  const ranges: { start: IsoDate; end: IsoDate; cityId: string }[] = [];
  for (const night of uncovered) {
    const cityId = cityForDate(trip, night);
    const last = ranges[ranges.length - 1];
    if (last && addDaysIso(last.end, 1) === night && last.cityId === cityId) {
      last.end = night;
    } else {
      ranges.push({ start: night, end: night, cityId });
    }
  }
  return ranges.map((r) => ({
    when_label: r.start === r.end ? formatWhenLabel(r.start) : `${dayNum(r.start)}–${dayNum(r.end)} ${monthLabel(r.end)}`,
    title: 'No bed',
    detail: 'No bed',
    city_id: r.cityId,
    date: r.start
  }));
}

function cityForDate(trip: Trip, date: IsoDate): string {
  const city = trip.cities.find((c) => c.start_date <= date && date <= c.end_date);
  return city?.id ?? trip.cities[0]?.id ?? '';
}

function tripNights(start: IsoDate, end: IsoDate): IsoDate[] {
  return nightsBetween(start, end);
}

function nightsBetween(start: IsoDate, endExclusive: IsoDate): IsoDate[] {
  const nights: IsoDate[] = [];
  for (let d = start; d < endExclusive; d = addDaysIso(d, 1)) nights.push(d);
  return nights;
}

function addDaysIso(date: IsoDate, n: number): IsoDate {
  const d = new Date(date + 'T00:00:00Z');
  return toIsoUtc(addDaysUtc(d, n));
}

function dayNum(date: IsoDate): string {
  return String(Number(date.slice(8, 10)));
}

function monthLabel(date: IsoDate): string {
  const d = new Date(date + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function formatWhenLabel(date: IsoDate): string {
  const d = new Date(date + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** For map fit / labels — a light City lookup used by views. */
export function cityById(trip: Trip, cityId: string): City | undefined {
  return trip.cities.find((c) => c.id === cityId);
}
