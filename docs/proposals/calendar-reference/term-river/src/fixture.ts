/**
 * Term River reference data. Today = Thu 24/09/26. Two zooms:
 *   Term: T3 W9 → T4 W3 (14/09/26 – 01/11/26)
 *   Year: 20/07/26 – 10/01/27 (Term 3 start → home from Korea)
 * Anchors and dates come from central-node.md and the other stops' fixtures. Projects come
 * from the Unified Timeline fixture. Past Corey evenings are illustrative (`sample: true`).
 */

export const TODAY = '2026-09-24';
export const TERMS = [
  { term: 3 as const, starts_on: '2026-07-21', ends_on: '2026-09-25' },
  { term: 4 as const, starts_on: '2026-10-13', ends_on: '2026-12-17' }
];
export const ZOOMS = {
  term: { from: '2026-09-14', to: '2026-11-01', holidayFactor: 0.65 },
  year: { from: '2026-07-20', to: '2027-01-10', holidayFactor: 0.5 }
};

export type Item = {
  id: string; title: string; sub?: string; type?: string; kind?: string; with?: string; lane?: string; tags?: string[];
  date?: string; from?: string; to?: string; start?: string; end?: string;
  shape: 'bar' | 'point' | 'diamond' | 'hum' | 'marker'; protected?: boolean; sample?: boolean;
  ghost?: { agent: 'hammond' | 'sara'; kind: 'protect_block'; date: string; start: string; end: string; title: string; with?: 'corey' };
};

const coreyEvenings: Item[] = ['2026-09-14', '2026-09-16', '2026-09-17', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24'].map(d => ({
  id: `corey-${d}`, title: 'Tea + TV', type: 'calendar_block', kind: 'corey', date: d, start: '19:30', end: '21:30', shape: 'point', protected: true, sample: true
}));

export const ITEMS: Item[] = [
  // Teacher
  { id: 'accreditation', title: 'Accreditation mentoring', type: 'project', from: '2026-09-07', to: '2026-12-11', shape: 'bar' },
  { id: 'un-voice', title: 'UN Voice Competition 2026', type: 'project', from: '2026-09-14', to: '2026-11-06', shape: 'bar' },
  { id: 'tom', title: 'Tournament of Minds', type: 'project', from: '2026-09-01', to: '2026-10-03', shape: 'bar', sub: 'Finals 03/10' },
  { id: 'hpge', title: 'HPGE policy', type: 'project', from: '2026-07-20', to: '2026-11-20', shape: 'bar' },
  { id: 'resource-day', title: 'Resource day', type: 'professional_event', date: '2026-09-21', start: '10:51', end: '14:50', shape: 'point' },
  { id: 'pd', title: 'PD · Hard conversations', type: 'professional_event', date: '2026-09-25', start: '08:30', end: '10:30', shape: 'point' },
  { id: 't4-class', title: 'Y11 becomes Y12 · one class', type: 'marker', date: '2026-10-13', shape: 'marker' },
  { id: 'reports', title: 'Reports due', type: 'task', date: '2026-11-27', shape: 'point' },
  // Corey
  ...coreyEvenings,
  { id: 'good-night', title: 'Good night: dinner out + a show', type: 'calendar_block', kind: 'corey', date: '2026-10-02', start: '18:00', end: '22:00', shape: 'point', protected: true, sub: 'held' },
  { id: 'g-day-trip', title: 'Blue Mountains day trip', kind: 'corey', with: 'corey', date: '2026-10-08', start: '09:00', end: '18:00', shape: 'point',
    ghost: { agent: 'hammond', kind: 'protect_block', date: '2026-10-08', start: '09:00', end: '18:00', title: 'Blue Mountains day trip', with: 'corey' }, sub: 'comforting adventure' },
  // Scholar
  { id: 'conferral', title: 'UNSW conferral', kind: 'event', tags: ['graduation'], date: '2026-09-30', shape: 'diamond', sub: 'Master of Gifted Education' },
  { id: 'uow', title: 'UOW literacy elective', sub: 'background hum, no alarms', from: '2026-07-20', to: '2027-01-10', shape: 'hum' },
  { id: 'dream', title: 'Hammond maps 2027–28 applications', kind: 'dream', date: '2026-11-02', shape: 'point' },
  // Friends & family
  { id: 'g-bob', title: 'Lunch with Bob', date: '2026-09-28', start: '12:00', end: '14:00', shape: 'point',
    ghost: { agent: 'hammond', kind: 'protect_block', date: '2026-09-28', start: '12:00', end: '14:00', title: 'Lunch with Bob' } },
  { id: 'g-newcastle', title: 'Newcastle · friends', date: '2026-10-05', start: '08:00', end: '21:00', shape: 'point',
    ghost: { agent: 'hammond', kind: 'protect_block', date: '2026-10-05', start: '08:00', end: '21:00', title: 'Newcastle · friends' } },
  // Body
  { id: 'gastro', title: 'Gastro follow-up', type: 'medical', date: '2026-09-24', start: '13:15', end: '14:15', shape: 'point' },
  { id: 'symptom', title: 'sore throat', symptom: true, kind: 'health', date: '2026-09-24', shape: 'marker' } as Item
];

/** Walls drawn across every lane. */
export const WALLS = [
  { id: 'korea', title: 'Korea · 23/12 – 10/01', from: '2026-12-23', to: '2027-01-10' }
];

/** Capacity: logged days (from the Tideline fixture) then the Almanac's forecast rule. */
export const LOGGED = { '2026-09-14': 62, '2026-09-15': 60, '2026-09-16': 58, '2026-09-17': 55, '2026-09-18': 52, '2026-09-19': 65, '2026-09-20': 68,
  '2026-09-21': 79, '2026-09-22': 51, '2026-09-23': 42, '2026-09-24': 34 } as Record<string, number>;
export const PATTERN = [
  { from: '2026-10-13', to: '2026-12-17', delta: -12 },
  { from: '2026-10-13', to: '2026-10-18', delta: -6 },
  { from: '2026-11-16', to: '2026-11-29', delta: -16, label: 'report-writing dip' },
  { from: '2026-12-01', to: '2026-12-15', delta: 4 }
];

/** Commitments for the load strip (hours). Classes, Corey time and ghosts never count. */
export const COMMITMENTS = [
  { date: '2026-09-16', start: 15.5, end: 18, title: 'Marking' },
  { date: '2026-09-17', start: 15.5, end: 17.5, title: 'UN Voice coaching' },
  { date: '2026-09-21', start: 10.85, end: 14.83, title: 'Resource day' },
  { date: '2026-09-23', start: 15.67, end: 17.33, title: 'Mark Y11 drafts' },
  { date: '2026-09-24', start: 13.25, end: 14.25, title: 'Gastro' },
  { date: '2026-09-25', start: 8.5, end: 10.5, title: 'PD' },
  { date: '2026-10-03', start: 8, end: 16, title: 'ToM finals' },
  ...[13, 14, 15, 16, 20, 21, 22, 27, 28, 29].map(d => ({ date: `2026-10-${d}`, start: 15.5, end: 18, title: 'Y12 program' })),
  ...[16, 17, 18, 19, 20, 23, 24, 25, 26].map(d => ({ date: `2026-11-${d}`, start: 15.5, end: 20, title: 'Reports' }))
];
