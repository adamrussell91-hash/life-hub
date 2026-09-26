/**
 * Term River: the term (or year) as identity lanes, a body line and a weekly load strip.
 *
 * Lanes are Adam's identities in the order About Me ranks them: teacher, Corey (partner),
 * scholar, friends and family. Body runs underneath as the capacity line. Every item on
 * the calendar lands in exactly one lane; nothing is lost and nothing is duplicated.
 *
 * Pure. Items are the same shapes the other stops use (Life records, Teaching lessons,
 * Professional events, Tasks projects, ghosts, Almanac anchors), each with a date or a span.
 *
 * Reference: docs/proposals/calendar-reference/term-river/VISUAL-SPEC.md ("Lanes", "Load").
 */

export const LANES = Object.freeze([
  Object.freeze({ id: 'teacher', label: 'Teacher', sub: 'classes · HPGE · MindWorks' }),
  Object.freeze({ id: 'corey', label: 'Corey', sub: 'comes first' }),
  Object.freeze({ id: 'scholar', label: 'Scholar', sub: 'UNSW done · UOW hum' }),
  Object.freeze({ id: 'friends', label: 'Friends & family', sub: 'Newcastle · Bob' }),
  Object.freeze({ id: 'body', label: 'Body', sub: 'capacity from your logs' })
]);

import { weekLabel } from '../../../../packages/design-kit/js/school-time.js';
import { CAPACITY } from './capacity-model.js';

const STUDY = /\b(uow|unsw|master|thesis|essay|assessment|elective|lecture|reading|conferral|graduation|university)\b/i;
const FRIENDS = /\b(bob|ruby|fletcher|taylor|donna|joe|newcastle|friends?|family|mate|mates)\b/i;

/**
 * Which lane an item belongs to. First match wins, in this order:
 * 1. An explicit `lane` on the item.
 * 2. Corey: calendar_block kind corey, or `with: 'corey'`.
 * 3. Body: medical records and appointments, symptoms, sleep, rest blocks.
 * 4. Scholar: study anchors (dream, graduation, tags 'study'), or study words.
 * 5. Friends & family: named people or the friends/family words.
 * 6. Teacher: everything else that is a commitment (lessons, meetings, PD, projects, tasks).
 */
export function laneFor(item) {
  if (item?.lane && LANES.some(l => l.id === item.lane)) return item.lane;
  const type = item?.type ?? '';
  const text = `${item?.title ?? ''} ${item?.sub ?? ''}`;
  if ((type === 'calendar_block' && item.kind === 'corey') || item?.with === 'corey' || item?.kind === 'corey') return 'corey';
  if (type === 'medical' || type === 'sleep' || item?.kind === 'rest' || item?.kind === 'health' || item?.symptom) return 'body';
  const tags = item?.tags ?? [];
  if (item?.kind === 'dream' || tags.includes('graduation') || tags.includes('study') || STUDY.test(text)) return 'scholar';
  if (FRIENDS.test(text) || tags.includes('friends') || tags.includes('family')) return 'friends';
  return 'teacher';
}

/** Group items by lane, preserving input order inside a lane. Every lane is present. */
export function byLane(items) {
  const out = Object.fromEntries(LANES.map(l => [l.id, []]));
  for (const it of items ?? []) out[laneFor(it)].push(it);
  return out;
}

const DAY = 86_400_000;
const ms = k => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
const key = t => new Date(t).toISOString().slice(0, 10);
const inTerm = (d, terms) => terms.some(t => d >= t.starts_on && d <= t.ends_on);
const weekday = d => new Date(`${d}T00:00:00Z`).getUTCDay();

/** Monday-start weeks covering [from, to]. */
export function weeksBetween(from, to) {
  const out = [];
  let m = ms(from) - ((weekday(from) + 6) % 7) * DAY;
  while (m <= ms(to)) { out.push(key(m)); m += 7 * DAY; }
  return out;
}

/**
 * Weekly load against capacity, by the same rule as the day's "over" flag
 * (capacity-model.js): a 100% day can carry CAPACITY.budgetHours of discretionary
 * commitments; classes, protected time and ghosts don't count.
 * - booked: hours of those commitments dated in the week
 * - capacity: sum over the week's days of pct/100 × budgetHours, pct from `capacityFor(date)`
 * Returns [{ week, booked, capacity, over, holiday }] with hours rounded to 0.5.
 */
export function weeklyLoad({ from, to, terms, commitments = [], capacityFor }) {
  const half = v => Math.round(v * 2) / 2;
  return weeksBetween(from, to).map(week => {
    let capacity = 0;
    let schoolDays = 0;
    for (let i = 0; i < 7; i++) {
      const d = key(ms(week) + i * DAY);
      if (inTerm(d, terms) && weekday(d) >= 1 && weekday(d) <= 5) schoolDays++;
      capacity += ((capacityFor(d) ?? 0) / 100) * CAPACITY.budgetHours;
    }
    const last = key(ms(week) + 6 * DAY);
    const booked = commitments
      .filter(c => !c.protected && !c.isClass && !c.ghost && c.date >= week && c.date <= last)
      .reduce((sum, c) => sum + Math.max(0, (c.end ?? 0) - (c.start ?? 0)), 0);
    return { week, booked: half(booked), capacity: half(capacity), over: booked > capacity + 0.25, holiday: schoolDays === 0 };
  });
}

/**
 * Week label for the axis: "T4 W3", "Hol W1", or dd/mm when there are no terms.
 * Uses the kit weekLabel. A Mon–Sun week that hands over from holiday into term
 * prefers the term label (T4 W1), matching the axis in the Term River reference.
 */
export function riverWeekLabel(week, terms) {
  for (let i = 0; i < 7; i++) {
    const label = weekLabel(key(ms(week) + i * DAY), terms ?? []);
    if (label?.startsWith('T')) return label;
  }
  return weekLabel(week, terms ?? []) ?? `${week.slice(8)}/${week.slice(5, 7)}`;
}
