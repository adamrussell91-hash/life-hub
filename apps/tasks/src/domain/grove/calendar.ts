/** Saved school dates win; holidays retain their own interval. No calendar is stored here. */
import { resolveSchoolTerms } from '../../../design-kit/js/calendar/school-terms.js';
import { provisionalNswTerms } from '@/domain/hub-prefs';
import { addDays, daysBetween, mondayOf } from './dates';
import type { GroveView } from './plan';
export type GroveTerm = { term: number | null; starts_on: string; ends_on: string };
export function groveCalendar(anchor: string, saved: readonly GroveTerm[] = []) {
  const year = Number(anchor.slice(0, 4));
  const own = saved.filter(t => t.starts_on <= `${year}-12-31` && t.ends_on >= `${year}-01-01`);
  return { terms: own.length ? [...own].sort((a,b) => a.starts_on.localeCompare(b.starts_on)) : provisionalNswTerms(year), provisional: !own.length };
}
export function groveTerms(sources: {hubPrefs?:unknown;planningProfile?:unknown;visual?:unknown}): GroveTerm[] {
  return resolveSchoolTerms(sources as Parameters<typeof resolveSchoolTerms>[0]);
}
export function grovePeriod(view: GroveView, anchor: string, saved: readonly GroveTerm[] = []) {
  const {terms, provisional} = groveCalendar(anchor, saved);
  const year = anchor.slice(0, 4);
  if (view === 'day') return {from: anchor, to: anchor, label: '', provisional, terms};
  if (view === 'week') return {from: mondayOf(anchor), to: addDays(mondayOf(anchor), 6), label: 'Week', provisional, terms};
  if (view === 'year') return {from: `${year}-01-01`, to: `${year}-12-31`, label: year, provisional, terms};
  const term = terms.find(t => t.starts_on <= anchor && t.ends_on >= anchor);
  if (term) return {from: term.starts_on, to: term.ends_on, label: term.term ? `Term ${term.term}` : 'Term', provisional, terms};
  const prev = terms.filter(t => t.ends_on < anchor).at(-1);
  const next = terms.find(t => t.starts_on > anchor);
  return {from: prev ? addDays(prev.ends_on, 1) : `${year}-01-01`, to: next ? addDays(next.starts_on, -1) : `${year}-12-31`, label: 'Holiday meadow', provisional, terms};
}
export function groveDateKeys(view: GroveView, anchor: string, terms: readonly GroveTerm[] = []): string[] {
  const period = grovePeriod(view, anchor, terms);
  return Array.from({length: daysBetween(period.from, period.to) + 1}, (_,i) => addDays(period.from, i));
}
export function adjacentGroveDate(view: GroveView, anchor: string, direction: -1 | 1, terms: readonly GroveTerm[] = []) {
  if (view === 'day' || view === 'week') return addDays(anchor, direction * (view === 'day' ? 1 : 7));
  if (view === 'year') return `${Number(anchor.slice(0,4)) + direction}-01-01`;
  const period = grovePeriod(view, anchor, terms);
  return addDays(direction === -1 ? period.from : period.to, direction);
}
