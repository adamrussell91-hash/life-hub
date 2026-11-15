/**
 * The noticing cards that are worked out by counting. Each rule is a plain
 * function: it returns a card only when its claim is true of the data in
 * hand, and every card carries the numbers or photos that show it.
 * "Your journal" is always the journals in Life Hub: a card never claims
 * anything about travel that was not journaled here.
 */
import type { JournalDocument } from '@/api/journal';
import { isAudioMedia } from '@/journal/transcripts';
import { clock12, dayNumber, tripLength } from '@/journal/trip-days';
import type { JournalLeg, JournalMoment } from '@/journal/types';
import type { Trip } from '@/types';
import type { NoticeCard, NoticePhoto } from '@/journal/noticing/model';

export interface HistoryTrip {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  days: number;
  cities: { name: string; country: string; start_date: string; end_date: string }[];
}

export interface HistoryDay {
  trip_id: string;
  date: string;
  city: string;
  country: string;
  photos: number;
  first_time: string | null;
  last_time: string | null;
  north: { lat: number; place: string } | null;
  south: { lat: number; place: string } | null;
  photo_ids: string[];
}

export interface NoticingHistory {
  trips: HistoryTrip[];
  days: HistoryDay[];
  /** From the food journal: rated dishes of this trip, and dishes marked "order again" in its cities before it. */
  food?: {
    dishes: { date: string; title: string; venue: string; rating: number; moment_id: string }[];
    order_again: { city: string; title: string; venue: string; date: string }[];
  };
  /** From the diary, for one date: earlier years' entries, as a mood word and one highlight line. */
  diary?: { date: string; mood: string; line: string }[];
  /** From the bookshelf: books whose title names a city or country of this trip. */
  books?: { title: string; author: string; completed_on: string | null; place: string }[];
}

export interface RuleInput {
  journal: JournalDocument;
  trip: Trip;
  /** Other trips. Null when it could not be loaded: rules that need it stay quiet. */
  history: NoticingHistory | null;
  /** The trip day the cards are about: the latest day with moments. */
  day: string;
}

interface DayFacts {
  date: string;
  leg: JournalLeg;
  city: string;
  country: string;
  moments: JournalMoment[];
  photos: NoticePhoto[];
  firstTime: string | null;
  lastTime: string | null;
  north: { lat: number; place: string } | null;
  south: { lat: number; place: string } | null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthYear = (date: string): string => `${MONTHS[Number(date.slice(5, 7)) - 1] ?? ''} ${date.slice(0, 4)}`.trim();
const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const yearsSpan = (history: NoticingHistory): string => {
  const years = history.trips.map((t) => t.start_date.slice(0, 4)).sort();
  const n = plural(history.trips.length, 'earlier trip');
  return years.length ? `Counted against ${n} in your journal, back to ${years[0]}` : '';
};

/** This trip's own days, from the owner's live moments, oldest first. Partner's lines are left out. */
export function tripDayFacts(journal: JournalDocument, trip: Trip): DayFacts[] {
  const legs = new Map(journal.legs.filter((l) => l.lifecycle === 'live').map((l) => [l.id, l]));
  const media = new Map(journal.media.map((m) => [m.id, m]));
  const days = new Map<string, DayFacts>();
  for (const moment of journal.moments) {
    if (moment.lifecycle !== 'live' || moment.author === 'partner') continue;
    const leg = legs.get(moment.leg_id);
    if (!leg) continue;
    let facts = days.get(moment.local_date);
    if (!facts) {
      const city = trip.cities.find((c) => c.id === leg.city_id);
      facts = {
        date: moment.local_date, leg, city: leg.destination, country: city?.country ?? '',
        moments: [], photos: [], firstTime: null, lastTime: null, north: null, south: null,
      };
      days.set(moment.local_date, facts);
    }
    facts.moments.push(moment);
    for (const id of moment.media_ids) {
      const row = media.get(id);
      if (row && row.lifecycle === 'live' && !isAudioMedia(row)) facts.photos.push({ tripId: journal.trip_id, mediaId: id });
    }
    if (moment.local_time) {
      if (!facts.firstTime || moment.local_time < facts.firstTime) facts.firstTime = moment.local_time;
      if (!facts.lastTime || moment.local_time > facts.lastTime) facts.lastTime = moment.local_time;
    }
    const lat = moment.coordinates?.lat;
    if (typeof lat === 'number' && Number.isFinite(lat)) {
      const place = moment.place?.name?.trim() || leg.destination;
      if (!facts.north || lat > facts.north.lat) facts.north = { lat, place };
      if (!facts.south || lat < facts.south.lat) facts.south = { lat, place };
    }
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

interface Ctx extends RuleInput {
  days: DayFacts[];
  today: DayFacts;
  before: DayFacts[];
  dayNo: number;
}

type Rule = (ctx: Ctx) => NoticeCard | null;

const base = (ctx: Ctx, kind: string, keyTail: string): Pick<NoticeCard, 'key' | 'kind' | 'day'> => ({
  key: `${kind}:${keyTail}`,
  kind,
  day: ctx.day,
});

/** The first journaled day in a country no earlier trip went to. */
const newCountry: Rule = (ctx) => {
  const { history, today } = ctx;
  if (!history || history.trips.length === 0 || !today.country) return null;
  const earlier = new Set(history.trips.flatMap((t) => t.cities.map((c) => c.country.trim().toLowerCase())).filter(Boolean));
  if (earlier.has(today.country.trim().toLowerCase())) return null;
  if (ctx.before.some((d) => same(d.country, today.country))) return null;
  const thisTripSoFar = new Set(ctx.days.filter((d) => d.date <= ctx.day && d.country).map((d) => d.country.trim().toLowerCase()));
  const number = new Set([...earlier, ...thisTripSoFar]).size;
  return {
    ...base(ctx, 'new-country', today.country.toLowerCase()),
    source: 'past',
    headline: `${today.country} is new to your journal`,
    stats: [{ value: String(number), label: number === 1 ? 'country journaled' : 'countries journaled' }],
    basis: yearsSpan(history),
    score: 80,
  };
};

/** The first journaled day in a city an earlier trip also went to. */
const backAgain: Rule = (ctx) => {
  const { history, today } = ctx;
  if (!history) return null;
  if (ctx.before.some((d) => same(d.city, today.city))) return null;
  const visits = history.trips
    .flatMap((t) => t.cities.filter((c) => same(c.name, today.city)).map((c) => ({ trip: t, city: c })))
    .sort((a, b) => b.city.end_date.localeCompare(a.city.end_date));
  const last = visits[0];
  if (!last) return null;
  const photos = history.days
    .filter((d) => d.trip_id === last.trip.id && same(d.city, today.city))
    .flatMap((d) => d.photo_ids.map((mediaId) => ({ tripId: d.trip_id, mediaId })))
    .slice(0, 3);
  return {
    ...base(ctx, 'back-again', `${today.city.toLowerCase()}:${last.trip.id}`),
    source: 'past',
    headline: `Back in ${today.city}`,
    body: `You were last here in ${monthYear(last.city.end_date)}.`,
    photos,
    basis: `From your journal of ${last.trip.title}`,
    score: 85,
  };
};

/** The same date in an earlier journal. */
const onThisDay: Rule = (ctx) => {
  const { history } = ctx;
  if (!history) return null;
  const monthDay = ctx.day.slice(5);
  const hit = history.days
    .filter((d) => d.date.slice(5) === monthDay && d.date < ctx.day && d.photos > 0)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!hit) return null;
  const years = Number(ctx.day.slice(0, 4)) - Number(hit.date.slice(0, 4));
  if (years < 1) return null;
  const trip = history.trips.find((t) => t.id === hit.trip_id);
  return {
    ...base(ctx, 'on-this-day', `${ctx.day}:${hit.trip_id}`),
    source: 'past',
    headline: `${years === 1 ? 'A year' : `${years} years`} ago today you were in ${hit.city}`,
    photos: hit.photo_ids.map((mediaId) => ({ tripId: hit.trip_id, mediaId })),
    basis: [`${plural(hit.photos, 'photo')} from ${Number(hit.date.slice(8))} ${monthYear(hit.date)}`, trip ? `in your journal of ${trip.title}` : ''].filter(Boolean).join(', '),
    score: 90,
  };
};

/** The day the trip becomes longer than any before it. */
const longestTrip: Rule = (ctx) => {
  const { history } = ctx;
  if (!history || history.trips.length === 0) return null;
  const longest = [...history.trips].sort((a, b) => b.days - a.days)[0]!;
  if (longest.days < 2 || ctx.dayNo !== longest.days + 1) return null;
  return {
    ...base(ctx, 'longest-trip', ctx.trip.id),
    source: 'past',
    headline: 'This is now your longest trip',
    body: `Today is day ${ctx.dayNo}. The longest before it was ${longest.title}, ${plural(longest.days, 'day')} in ${longest.start_date.slice(0, 4)}.`,
    stats: [{ value: String(ctx.dayNo), label: 'days and counting' }],
    basis: yearsSpan(history),
    score: 75,
  };
};

/** Further north or south than any journal before. */
const furthestPoint: Rule = (ctx) => {
  const { history, today } = ctx;
  if (!history) return null;
  const earlierDays = [
    ...history.days.map((d) => ({ north: d.north, south: d.south, city: d.city, year: d.date.slice(0, 4) })),
    ...ctx.before.map((d) => ({ north: d.north, south: d.south, city: d.city, year: d.date.slice(0, 4) })),
  ];
  for (const way of ['north', 'south'] as const) {
    const now = today[way];
    if (!now) continue;
    const located = earlierDays.filter((d) => d[way]);
    if (located.length < 3) continue; // a record needs something to beat
    const record = located.sort((a, b) => (way === 'north' ? b.north!.lat - a.north!.lat : a.south!.lat - b.south!.lat))[0]!;
    const beaten = way === 'north' ? now.lat > record.north!.lat : now.lat < record.south!.lat;
    if (!beaten) continue;
    const degrees = (lat: number): string => `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}`;
    return {
      ...base(ctx, `furthest-${way}`, ctx.day),
      source: 'past',
      headline: `The furthest ${way} your journal has been`,
      body: `${now.place}, at ${degrees(now.lat)}. Before today it was ${record.city} in ${record.year}, at ${degrees(record[way]!.lat)}.`,
      basis: `Compared with every located moment in your journal, ${plural(located.length, 'day')} of them`,
      momentId: today.moments.find((m) => m.coordinates?.lat === now.lat)?.id,
      score: 70,
    };
  }
  return null;
};

/** The day this city passes the most photographed city in any journal. */
const mostPhotographedCity: Rule = (ctx) => {
  const { history, today } = ctx;
  if (!history) return null;
  const totals = new Map<string, { name: string; photos: number }>();
  const bump = (city: string, photos: number): void => {
    const key = city.trim().toLowerCase();
    const row = totals.get(key) ?? { name: city, photos: 0 };
    row.photos += photos;
    totals.set(key, row);
  };
  for (const d of history.days) bump(d.city, d.photos);
  for (const d of ctx.before) bump(d.city, d.photos.length);
  const here = today.city.trim().toLowerCase();
  const beforeToday = totals.get(here)?.photos ?? 0;
  const afterToday = beforeToday + today.photos.length;
  const rival = [...totals.entries()].filter(([key]) => key !== here).sort((a, b) => b[1].photos - a[1].photos)[0]?.[1];
  if (!rival || rival.photos < 20) return null;
  if (!(beforeToday <= rival.photos && afterToday > rival.photos)) return null;
  return {
    ...base(ctx, 'most-photographed', here),
    source: 'past',
    headline: `${today.city} is now your most photographed city`,
    stats: [
      { value: String(afterToday), label: `photos of ${today.city}` },
      { value: String(rival.photos), label: `of ${rival.name}, the most until today` },
    ],
    photos: today.photos.slice(0, 3),
    basis: 'Counted from the photos in all your journals',
    score: 65,
  };
};

/** More photos today than on any other day of this trip. */
const biggestDay: Rule = (ctx) => {
  const { today, before } = ctx;
  if (before.length < 2 || today.photos.length < 8) return null;
  const next = [...before].sort((a, b) => b.photos.length - a.photos.length)[0]!;
  if (today.photos.length <= next.photos.length) return null;
  return {
    ...base(ctx, 'biggest-day', ctx.day),
    source: 'trip',
    headline: 'Your biggest day yet',
    body: `More photos than any other day of this trip. The next most was ${next.photos.length}, on day ${dayNumber(ctx.trip.start_date, next.date)}.`,
    stats: [{ value: String(today.photos.length), label: 'photos today' }],
    photos: today.photos.slice(0, 3),
    basis: 'Counted from this trip’s photos',
    score: 60,
  };
};

/** Today started earlier, or ran later, than any day of the trip so far. */
const earlyOrLate: Rule = (ctx) => {
  const { today, before } = ctx;
  if (before.length < 2) return null;
  const firsts = before.map((d) => d.firstTime).filter((t): t is string => Boolean(t));
  const lasts = before.map((d) => d.lastTime).filter((t): t is string => Boolean(t));
  const photoOf = (time: string): NoticePhoto[] => {
    const moment = today.moments.find((m) => m.local_time === time);
    return today.photos.filter((p) => moment?.media_ids.includes(p.mediaId)).slice(0, 1);
  };
  if (today.firstTime && firsts.length >= 2 && today.firstTime < '08:00' && firsts.every((t) => today.firstTime! < t)) {
    return {
      ...base(ctx, 'earliest-start', ctx.day),
      source: 'trip',
      headline: 'Your earliest start of the trip',
      stats: [{ value: clock12(today.firstTime), label: 'the first moment today' }],
      photos: photoOf(today.firstTime),
      basis: `Earlier than the first moment of each of the ${firsts.length} days before`,
      momentId: today.moments.find((m) => m.local_time === today.firstTime)?.id,
      score: 40,
    };
  }
  if (today.lastTime && lasts.length >= 2 && today.lastTime >= '21:00' && lasts.every((t) => today.lastTime! > t)) {
    return {
      ...base(ctx, 'latest-finish', ctx.day),
      source: 'trip',
      headline: 'Your latest night of the trip',
      stats: [{ value: clock12(today.lastTime), label: 'the last moment today' }],
      photos: photoOf(today.lastTime),
      basis: `Later than the last moment of each of the ${lasts.length} days before`,
      momentId: today.moments.find((m) => m.local_time === today.lastTime)?.id,
      score: 40,
    };
  }
  return null;
};

/** The middle day of the trip. */
const halfway: Rule = (ctx) => {
  const length = tripLength(ctx.trip.start_date, ctx.trip.end_date);
  if (length < 4 || ctx.dayNo !== Math.ceil(length / 2)) return null;
  const soFar = ctx.days.filter((d) => d.date <= ctx.day);
  const cities = new Set(soFar.map((d) => d.city.toLowerCase())).size;
  const photos = soFar.reduce((sum, d) => sum + d.photos.length, 0);
  const moments = soFar.reduce((sum, d) => sum + d.moments.length, 0);
  return {
    ...base(ctx, 'halfway', ctx.trip.id),
    source: 'trip',
    headline: 'Halfway',
    body: `Day ${ctx.dayNo} of ${length}.`,
    stats: [
      { value: String(photos), label: photos === 1 ? 'photo' : 'photos' },
      { value: String(moments), label: moments === 1 ? 'moment' : 'moments' },
      { value: String(cities), label: cities === 1 ? 'city' : 'cities' },
    ],
    basis: 'Counted from this trip so far',
    score: 50,
  };
};

const longDay = (date: string): string => `${Number(date.slice(8))} ${monthYear(date)}`;
const firstDayIn = (ctx: Ctx, match: (d: DayFacts) => boolean): boolean => match(ctx.today) && !ctx.before.some(match);

/** The dish rated above every other on this trip, on the day it was eaten. */
const bestDish: Rule = (ctx) => {
  const dishes = ctx.history?.food?.dishes ?? [];
  if (dishes.length < 3) return null;
  const sorted = [...dishes].sort((a, b) => b.rating - a.rating);
  const top = sorted[0]!;
  if (top.rating <= sorted[1]!.rating || top.date !== ctx.day) return null;
  return {
    ...base(ctx, 'best-dish', `${ctx.trip.id}:${top.moment_id}:${top.title.toLowerCase()}`),
    source: 'food',
    headline: 'The best thing you have eaten this trip',
    body: top.venue ? `${top.title}, at ${top.venue}.` : `${top.title}.`,
    stats: [{ value: String(top.rating), label: 'out of 5, your rating' }],
    basis: `Rated above the other ${dishes.length - 1} dishes you have rated on this trip`,
    momentId: ctx.today.moments.some((m) => m.id === top.moment_id) ? top.moment_id : undefined,
    score: 58,
  };
};

/** First day in a city where an earlier visit left a dish marked "order again". */
const orderAgain: Rule = (ctx) => {
  const here = (ctx.history?.food?.order_again ?? []).filter((d) => same(d.city, ctx.today.city));
  if (!here.length || !firstDayIn(ctx, (d) => same(d.city, ctx.today.city))) return null;
  const first = here[0]!;
  const more = here.length - 1;
  return {
    ...base(ctx, 'order-again', `${ctx.today.city.toLowerCase()}:${first.title.toLowerCase()}`),
    source: 'food',
    headline: `Worth ordering again in ${ctx.today.city}`,
    body: `${first.title}, at ${first.venue}. You marked it to order again on ${longDay(first.date)}.`,
    basis: more > 0 ? `From your food journal, with ${plural(more, 'more dish', 'more dishes')} marked the same way here` : 'From your food journal',
    score: 62,
  };
};

/** This date in the diary, a year or more ago: the mood word and one highlight line, as written. */
const diaryYearsAgo: Rule = (ctx) => {
  const entry = (ctx.history?.diary ?? [])
    .filter((d) => d.date.slice(5) === ctx.day.slice(5) && d.date < ctx.day)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!entry) return null;
  const years = Number(ctx.day.slice(0, 4)) - Number(entry.date.slice(0, 4));
  if (years < 1 || (!entry.line && !entry.mood)) return null;
  return {
    ...base(ctx, 'diary-on-this-day', `${ctx.day}:${entry.date}`),
    source: 'diary',
    headline: `${years === 1 ? 'A year' : `${years} years`} ago today, in your diary`,
    body: entry.mood ? `The mood you wrote down that day: ${entry.mood}.` : undefined,
    evidence: entry.line ? { label: 'One line from that day', text: entry.line } : undefined,
    basis: `From your diary entry of ${longDay(entry.date)}`,
    score: 68,
  };
};

/** First day in a city or country that a book on the shelf names in its title. */
const bookOnShelf: Rule = (ctx) => {
  const book = (ctx.history?.books ?? []).find(
    (b) =>
      (same(b.place, ctx.today.city) && firstDayIn(ctx, (d) => same(d.city, ctx.today.city))) ||
      (same(b.place, ctx.today.country) && firstDayIn(ctx, (d) => same(d.country, ctx.today.country))),
  );
  if (!book) return null;
  return {
    ...base(ctx, 'book-on-shelf', `${book.title.toLowerCase()}:${book.place.toLowerCase()}`),
    source: 'books',
    headline: `${book.title} is on your shelf`,
    body: [book.author ? `By ${book.author}.` : '', book.completed_on ? `You finished it on ${longDay(book.completed_on)}.` : ''].filter(Boolean).join(' ') || undefined,
    basis: `Matched by its title only, which names ${book.place}`,
    score: 45,
  };
};

const RULES: Rule[] = [
  onThisDay, backAgain, newCountry, longestTrip, furthestPoint, diaryYearsAgo, mostPhotographedCity,
  orderAgain, biggestDay, bestDish, halfway, bookOnShelf, earlyOrLate,
];

/** The trip day the cards are about: the latest day with the owner's moments, no later than today and inside the trip. */
export function noticingDay(journal: JournalDocument, trip: Trip, today: string): string | null {
  if (today < trip.start_date) return null;
  // A day's grace after the trip, for the photos brought in the morning after.
  const graceEnd = new Date(Date.parse(`${trip.end_date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  if (today > graceEnd) return null;
  const days = tripDayFacts(journal, trip).filter((d) => d.date <= today && d.date >= trip.start_date && d.date <= trip.end_date);
  return days.at(-1)?.date ?? null;
}

/** Every counting card that is true of the given day. */
export function countingCards(input: RuleInput): NoticeCard[] {
  const days = tripDayFacts(input.journal, input.trip);
  const today = days.find((d) => d.date === input.day);
  if (!today) return [];
  const ctx: Ctx = {
    ...input,
    days,
    today,
    before: days.filter((d) => d.date < input.day),
    dayNo: dayNumber(input.trip.start_date, input.day),
  };
  return RULES.map((rule) => rule(ctx)).filter((card): card is NoticeCard => card !== null);
}
