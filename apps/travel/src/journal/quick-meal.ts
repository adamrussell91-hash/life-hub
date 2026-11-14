/**
 * "Log meal" from a food stop: the pure parts. The sheet is quick-meal-sheet.ts.
 */
import type { JournalDocument } from '@/api/journal';
import type { JournalMoment } from '@/journal/types';
import type { Item } from '@/types';
import { MEAL_TYPES } from '@/journal/meal-section';
import { bootstrapJournalForFirstMoment, bootstrapLegId } from '@/journal/capture-context';
import { chronologicalDisplayOrder } from '@/journal/capture-stamp';
import { dateInZone, formatInZone } from '@/lib/time';

export type MealType = (typeof MEAL_TYPES)[number];

const TITLE_TYPES: [RegExp, MealType][] = [
  [/\b(breakfast|brunch)\b/i, 'Breakfast'],
  [/\blunch\b/i, 'Lunch'],
  [/\b(dinner|supper)\b/i, 'Dinner'],
  [/\b(dessert|gelato|ice cream)\b/i, 'Dessert'],
  [/\b(coffee|drinks?|cocktails?|bar|wine)\b/i, 'Drinks'],
  [/\bsnack\b/i, 'Snack'],
];

/** The stop's own words first ("Brunch at…"), then the time of day. */
export function inferMealType(title: string, time: string | null | undefined): MealType {
  for (const [re, type] of TITLE_TYPES) if (re.test(title)) return type;
  const t = time && /^\d{2}:\d{2}$/.test(time) ? time : '12:00';
  if (t < '10:30') return 'Breakfast';
  if (t < '15:00') return 'Lunch';
  if (t < '17:00') return 'Snack';
  return 'Dinner';
}

const NAME = "\\p{Lu}[\\p{L}'’.-]*";
const WITH_RE = new RegExp(`\\bwith\\s+(${NAME}(?:(?:\\s*,\\s*|\\s+(?:and|&)\\s+)${NAME})*)\\s*$`, 'u');

/** "Lunch at the Point with Sam" → "Sam". Only names: "Coffee with a view" → "". */
export function withFromTitle(title: string): string {
  return WITH_RE.exec(title.trim())?.[1] ?? '';
}

function legForDate(journal: JournalDocument, date: string): string | null {
  const live = journal.legs.filter((l) => l.lifecycle === 'live');
  const covering = live.find((l) => l.start_date && l.end_date && l.start_date <= date && date <= l.end_date);
  if (covering) return covering.id;
  const day = journal.days.find((d) => d.lifecycle === 'live' && d.local_date === date);
  if (day && live.some((l) => l.id === day.leg_id)) return day.leg_id;
  const first = [...live].sort((a, b) => a.order - b.order)[0];
  return first?.id ?? null;
}

/**
 * The journal moment a logged meal hangs on: the stop's place and pin, today's
 * clock time when logged on the day (else the stop's time), and its item_id.
 */
export function buildMealMoment(
  journal: JournalDocument,
  item: Item,
  opts: { now: Date; timeZone: string; mediaIds: string[]; momentId: string; tripTitle?: string },
): { journal: JournalDocument; moment: JournalMoment } {
  const today = dateInZone(opts.now, opts.timeZone);
  const localTime = item.date === today ? formatInZone(opts.now, opts.timeZone) : (item.time ?? undefined);
  let legId = legForDate(journal, item.date);
  let base = journal;
  if (!legId) {
    legId = bootstrapLegId(journal.trip_id);
    base = bootstrapJournalForFirstMoment(journal, legId, item.date, opts.tripTitle?.trim() || 'Trip');
  }
  const place = 'place' in item ? item.place : undefined;
  const moment: JournalMoment = {
    id: opts.momentId,
    leg_id: legId,
    local_date: item.date,
    ...(localTime ? { local_time: localTime } : {}),
    ...(place ? { place: { name: place.name }, coordinates: { lat: place.lat, lon: place.lon }, location_source: 'manual' as const } : {}),
    media_ids: [...opts.mediaIds],
    display_order: chronologicalDisplayOrder(base.moments, legId, item.date, localTime ?? '12:00'),
    lifecycle: 'live',
    item_id: item.id,
  };
  return {
    journal: { ...base, revision: base.revision + 1, moments: [...base.moments, moment] },
    moment,
  };
}
