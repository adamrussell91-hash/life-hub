/**
 * Adam's lead-time rules for the Almanac. Data, not logic: lead-lines.js does the math.
 *
 * Each rule says what kind of anchor it applies to, how many days before the anchor (or
 * the end of its window) is the last safe day to start, and why. Sources are named so an
 * agent can cite them. Tune numbers here; never in a view.
 *
 * Reference: docs/proposals/calendar-reference/almanac/VISUAL-SPEC.md ("Rules").
 */
import { addDays, overlapsTerm } from '../lead-lines.js';

/** Keep in sync with netlify/functions/_shared/cognitive-horizon.mjs */
const HORIZON_MIN_DAYS = 90;
const HORIZON_LEAD_DAYS = 14;

function horizonLastKey(ctx) {
  const last = ctx.horizon?.lastCompletedAt;
  if (!last) return null;
  return typeof last === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(last)
    ? last
    : String(last).slice(0, 10);
}

export const ALMANAC_RULES = Object.freeze([
  // Cognitive protocols — synthetic horizon-council anchor injected by almanac.mjs
  { id: 'horizon-review', stepId: 'horizon-review', title: 'Run the Horizon Council',
    appliesTo: { tags: ['horizon-review'] },
    by: (_anchor, ctx) => {
      const key = horizonLastKey(ctx);
      return key ? addDays(key, HORIZON_MIN_DAYS) : null;
    },
    when: (_anchor, ctx) => {
      const key = horizonLastKey(ctx);
      return Boolean(key && ctx.today && ctx.today >= addDays(key, HORIZON_MIN_DAYS - HORIZON_LEAD_DAYS));
    },
    why: (_anchor, ctx) => `Last review ${horizonLastKey(ctx) ?? ''}. Quarterly cadence.` },
  // Trips
  { id: 'passport', title: 'Passport valid 6 months past return?', leadDays: 61, appliesTo: { tags: ['international'] },
    why: 'Renewals take about 6 weeks; many countries want 6 months of validity.' },
  { id: 'pet-sitter', title: 'Pet sitter for Leo, Maxxie, SJ & Hunter', leadDays: 56, appliesTo: { tags: ['pets-home-alone'] },
    why: 'Sitters over Christmas book out about 8 weeks ahead.' },
  { id: 'medication-plan', title: 'Stelara timing × trip · ask Dr Keily', leadDays: 35, appliesTo: { tags: ['on-biologic'] },
    why: 'Constraints: Stelara maintenance is 8-weekly; a long trip needs the dose and cold chain planned.' },
  { id: 'insurance', title: 'Travel insurance · declare Crohn’s', leadDays: 21, appliesTo: { kinds: ['trip'] },
    why: 'Pre-existing conditions need declaring before you buy.' },
  { id: 'leave', title: 'Leave approval (term runs to 17/12)', leadDays: 32, appliesTo: { kinds: ['trip'] },
    when: (anchor, ctx) => overlapsTerm(anchor.date, anchor.returns ?? anchor.date, ctx.terms ?? []),
    why: 'The trip starts before term ends.' },
  { id: 'decide-where', title: 'Decide where', leadDays: 46, appliesTo: { tags: ['undecided'] },
    why: 'Fares and rooms climb inside about six weeks.' },
  // Medical
  { id: 'book-recheck', title: 'Book the recheck', leadDays: 7, appliesTo: { tags: ['bloods'] },
    why: 'Constraints: Vitamin D recheck 3–4 months after the 19/06 dose change.' },
  // Events
  { id: 'gown', title: 'Gown + Corey’s guest ticket', leadDays: 3, appliesTo: { tags: ['graduation'] },
    why: 'Registration and guest tickets close before the ceremony.' },
  // School
  { id: 'program', title: 'T4 program for the new Year 12', leadDays: 7, appliesTo: { tags: ['new-class'] },
    why: 'About Me: the Year 11 class becomes Year 12 in Term 4.' },
  { id: 'good-luck', title: 'Good-luck note to your graduating Y12s', by: '2026-10-09', appliesTo: { ids: ['term-4'] },
    why: 'Before HSC English Paper 1 (NESA timetable, estimate).' },
  // Dreams
  { id: 'dream-windows', title: 'Hammond maps the 2027–28 application windows', by: '2026-11-02', appliesTo: { tags: ['dream'] },
    why: 'About Me: study at Harvard, Cambridge, Oxford or Yale. A dream needs a runway.' }
]);

/** Openings Adam wants, in priority order. Corey first (About Me: he outranks every tie-break). */
export const ALMANAC_WANTS = Object.freeze([
  { id: 'good-night', title: 'Good night with Corey', span: 'evening', weekdays: [5, 6], minPct: 65, with: 'corey',
    why: 'About Me: dinner out plus a show or a talk.' },
  { id: 'keep-empty', title: 'Keep this one empty', span: 'protect', requireTag: 'dst-start', minPct: 0,
    why: 'Daylight saving costs an hour, and Monday is a public holiday.' },
  { id: 'bob', title: 'Lunch with Bob', span: 'lunch', holidayOnly: true, minPct: 70,
    why: 'About Me: family who matter.' },
  { id: 'newcastle', title: 'Newcastle · friends', span: 'days2', holidayOnly: true, minPct: 70,
    why: 'About Me: the hole is time, not the absence of friends.' }
]);
