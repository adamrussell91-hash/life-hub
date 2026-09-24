/**
 * The Almanac reference: Thu 24/09/26 → Sun 10/01/27 (until Adam is home from Korea).
 * Clock frozen at 2026-09-24. Mirrors ../fixture.json (generated from this file).
 *
 * Anchors come from central-node.md (About Me, Constraints). World entries are EXAMPLES of
 * what live feeds bring in (BOM, NSW, NESA, listings) and are marked `example: true`.
 */

export const TODAY = '2026-09-24';
export const RANGE = { from: '2026-09-24', to: '2027-01-10' };
export const LAST_LOG = { date: '2026-09-24', pct: 34 }; // capacity-model on the Tideline fixture

export const TERMS = [
  { term: 3, starts_on: '2026-07-21', ends_on: '2026-09-25' },
  { term: 4, starts_on: '2026-10-13', ends_on: '2026-12-17' }
];

export type Anchor = {
  id: string; title: string; kind: 'trip' | 'medical' | 'event' | 'term' | 'dream';
  date?: string; returns?: string; window?: { opens: string; closes: string }; tags?: string[]; sub: string;
};

export const ANCHORS: Anchor[] = [
  { id: 'korea', title: 'Korea honeymoon', kind: 'trip', date: '2026-12-23', returns: '2027-01-10',
    tags: ['international', 'pets-home-alone', 'on-biologic', 'with-corey'], sub: '23/12 – 10/01 · 4 animals home' },
  { id: 'solo-travel', title: 'Solo travel', kind: 'trip', date: '2026-12-01', returns: '2026-12-15',
    tags: ['undecided'], sub: 'from 01/12 · term runs to 17/12' },
  { id: 'vitamin-d', title: 'Vitamin D recheck', kind: 'medical', window: { opens: '2026-09-19', closes: '2026-10-19' },
    tags: ['bloods'], sub: '3–4 months after the 19/06 change' },
  { id: 'unsw-conferral', title: 'UNSW conferral', kind: 'event', date: '2026-09-30', tags: ['graduation'], sub: 'Master of Gifted Education' },
  { id: 'term-4', title: 'Term 4 · new Year 12', kind: 'term', date: '2026-10-13', tags: ['new-class'], sub: 'one class from 13/10' },
  { id: 'dream-study', title: 'Dream · Harvard, Oxford…', kind: 'dream', tags: ['dream'], sub: 'study at one of the four' }
];

/** Things fixed on the calendar that aren't anchors (drawn on the anchors row). */
export const FIXED = [
  { date: '2026-10-03', title: 'ToM finals', sub: '03/10' },
  { date: '2026-12-17', title: 'T4 ends', sub: '17/12' }
];

export const WORLD = [
  { date: '2026-09-26', title: 'Sat 26 · 24° clear', sub: 'BOM', example: true, row: 0 },
  { date: '2026-10-04', title: 'Daylight saving starts + Labour Day', sub: 'you lose an hour · long weekend', example: false, row: 1 },
  { date: '2026-10-14', title: 'HSC begins · English Paper 1', sub: 'NESA timetable (est.)', example: true, row: 0 },
  { date: '2026-11-27', title: 'Reports due', sub: 'school calendar (est.)', example: true, row: 0 },
  { date: '2026-12-25', title: 'Christmas', sub: '', example: false, row: 1 }
];

/** What past terms say about points in the term (percentage points). Illustrative until 2 terms of history exist. */
export const PATTERN: { from: string; to: string; delta: number; label?: string }[] = [
  { from: '2026-10-13', to: '2026-12-17', delta: -12, label: 'term time' },
  { from: '2026-10-13', to: '2026-10-18', delta: -6, label: 'first week back' },
  { from: '2026-11-16', to: '2026-11-29', delta: -16, label: 'report-writing dip (your T2 pattern)' },
  { from: '2026-12-01', to: '2026-12-15', delta: 4 }
];

export const WALLS = [{ from: '2026-12-23', to: '2027-01-10', title: 'Korea · 23/12 – 10/01' }];

/** Busy facts the openings finder needs beyond "term weekday = busy day". */
export const BUSY = [
  { date: '2026-09-30', day: true, title: 'Conferral' },
  { date: '2026-10-03', day: true, title: 'ToM finals' }
];
export const DAY_TAGS: Record<string, string[]> = { '2026-10-04': ['dst-start'] };
/** Evenings already taken (Tideline: Sat 26/09 good night proposed; treat as taken). */
export const TAKEN_EVENINGS = ['2026-09-26'];

export const HABIT = { id: 'korean', title: 'Korean for travellers', minutes: 20, perWeek: 3, from: '2026-09-28', until: '2026-12-23',
  why: 'Enough to order, ask directions and get home: comforting adventure.' };

/** Drafts for openings that involve other people. {when} is filled from the opening's dates. Never sent. */
export const DRAFTS: Record<string, { to: string; text: string }> = {
  bob: { to: 'Bob', text: 'Hi Bob, I’m on school holidays. Are you free for lunch on {when}? My shout.' },
  newcastle: { to: 'Newcastle friends', text: 'I’m in Newcastle on {when}. Anyone free for a coffee, a walk or dinner?' }
};
