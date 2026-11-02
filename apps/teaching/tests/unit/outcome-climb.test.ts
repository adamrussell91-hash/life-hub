import { describe, it, expect } from 'vitest';
import { buildOutcomeClimb, climbSummary, drawnLevels, nextClimbEntries, weekOfDate, type ClimbUnit } from '@/alignment/outcome-climb';
import type { Alignment } from '@/alignment/schema';
import type { ScopeSequence } from '@/schemas';

/* An invented syllabus: the real wording lives in the private data repo. */
const point = (id: string, outcome: number, link = 'shared') => ({
  id, kind: id[0], short: `Point ${id}`, text: id, outcomes: [{ n: outcome, link }], concepts: [{ ref: 'TIDE1', link: 'shared' }], processes: []
});
const DOC = {
  schema: 'syllabus_alignment_v1', title: 'Invented', match: { syllabus: 'Invented', version: '1', year: 12 }, sources: [],
  outcomes: [{ n: 1, code: 'OUT-01', text: 'One' }, { n: 2, code: 'OUT-02', text: 'Two' }],
  processes: [],
  concepts: [{ key: 'TIDE', name: 'Tides', head: 'Tides', bullets: [] }],
  focus_areas: [
    { id: 'harbours', name: 'Harbours', points: [point('U1', 1), point('U2', 2), point('R1', 2, 'related')] },
    { id: 'storms', name: 'Storms', points: [point('U1', 1), point('U2', 2)] }
  ]
} as unknown as Alignment;

const term = (n: number, start: string, end: string) => ({ id: `t${n}`, title: `Term ${n}`, term_number: n, start_week: (n - 1) * 10 + 1, end_week: n * 10, start_date: start, end_date: end });
const SCOPE = {
  id: 'scope', type: 'scope_sequence', subject_id: 's', academic_year: 2026, week_count: 40,
  terms: [term(1, '2026-01-26', '2026-04-03'), term(2, '2026-04-20', '2026-06-26'), term(3, '2026-07-13', '2026-09-18'), term(4, '2026-10-05', '2026-12-11')],
  timeline_items: [
    { id: 'i1', kind: 'unit', unit_id: 'a', start_week: 1, end_week: 8, order: 0 },
    { id: 'n1', kind: 'note', title: 'Exams', start_week: 9, end_week: 10, order: 1 },
    { id: 'i2', kind: 'unit', unit_id: 'b', start_week: 14, end_week: 20, order: 2 },
    { id: 'i3', kind: 'unit', unit_id: 'c', start_week: 21, end_week: 24, order: 3 }
  ],
  outcome_climb: [{ outcome: 1, unit_id: 'a', level: 'capable', demand: 'Read closely' }, { outcome: 1, unit_id: 'b', level: 'accomplished' }]
} as unknown as ScopeSequence;

const UNITS: ClimbUnit[] = [
  { id: 'a', title: 'Harbours unit', lessons: [
    { id: 'l1', title: 'One', date: '2026-02-02', dot_points: ['harbours:U1'] },
    { id: 'l2', title: 'Two', date: '2026-03-02', dot_points: ['harbours:U1', 'harbours:R1'] }
  ] },
  { id: 'b', title: 'Storms unit', lessons: [{ id: 'l3', title: 'Three', date: '2026-05-18', dot_points: ['storms:U1'] }, { id: 'l4', title: 'Four', dot_points: ['storms:U2'] }] },
  { id: 'c', title: 'Empty unit', lessons: [{ id: 'l5', title: 'Five' }] }
];

describe('outcome climb', () => {
  const model = buildOutcomeClimb(DOC, SCOPE, UNITS);
  const [one, two] = model.outcomes;

  it('makes one visit per unit from core-linked dot points', () => {
    expect(one!.visits.map((v) => v.unit_id)).toEqual(['a', 'b']);
    expect(one!.visits[0]!.lessons.map((l) => l.id)).toEqual(['l1', 'l2']);
    // R1 only links outcome 2 loosely, so it is not a visit.
    expect(two!.visits.map((v) => v.unit_id)).toEqual(['b']);
  });

  it('places visits by lesson date and counts the teaching weeks between them', () => {
    expect(one!.visits[0]).toMatchObject({ first_week: 2, last_week: 6, gap: null });
    expect(one!.visits[1]).toMatchObject({ first_week: 15, last_week: 15, gap: 8 });
  });

  it('places an undated lesson by its order in the unit', () => {
    expect(two!.visits[0]!.first_week).toBe(17);
  });

  it('reads the saved level and what students now do, and brings in concepts', () => {
    expect(one!.visits[0]).toMatchObject({ level: 0, demand: 'Read closely', concepts: ['Tides'] });
    expect(one!.visits[1]!.level).toBe(2);
    expect(two!.visits[0]!.level).toBeNull();
  });

  it('hatches only units with no tagged lessons and keeps notes in the band', () => {
    expect(model.band.map((b) => [b.id, b.untagged])).toEqual([['i1', false], ['n1', false], ['i2', false], ['i3', true]]);
  });

  it('holds an unset line at the last level set', () => {
    const visits = [{ level: 2 }, { level: null }, { level: 3 }] as never;
    expect(drawnLevels(visits)).toEqual([2, 2, 3]);
  });

  it('names a later unit as the next chance when an outcome is met once', () => {
    const early = { ...SCOPE, timeline_items: [
      { id: 'i2', kind: 'unit', unit_id: 'b', start_week: 1, end_week: 5, order: 0 },
      { id: 'i1', kind: 'unit', unit_id: 'a', start_week: 6, end_week: 10, order: 1 }
    ] } as unknown as ScopeSequence;
    const units: ClimbUnit[] = [{ ...UNITS[1]!, lessons: [UNITS[1]!.lessons[1]!] }, { ...UNITS[0]!, lessons: [] }];
    expect(buildOutcomeClimb(DOC, early, units).outcomes[1]!.next_chance).toBe('Harbours unit');
  });

  it('sends holiday dates to the next term', () => {
    expect(weekOfDate(SCOPE, '2026-04-10')).toBe(11);
    expect(weekOfDate(SCOPE, '2026-12-25')).toBeNull();
  });

  it('summarises the climb once levels are set', () => {
    const name = (i: number) => ['Capable', 'Skilled', 'Accomplished', 'Excellent'][i]!;
    expect(climbSummary(one!, name)).toBe('Climbs from Capable to Accomplished over 2 visits');
    expect(climbSummary(two!, name)).toBe('Met once so far. One level still to set');
  });

  it('updates one entry and drops it when emptied', () => {
    const start = [{ outcome: 1, unit_id: 'a', level: 'capable' as const }];
    expect(nextClimbEntries(start, 1, 'a', { demand: ' Read ' })).toEqual([{ outcome: 1, unit_id: 'a', level: 'capable', demand: 'Read' }]);
    expect(nextClimbEntries(start, 1, 'a', { level: null })).toEqual([]);
    expect(nextClimbEntries(start, 2, 'a', { level: 'skilled' })).toHaveLength(2);
  });
});
