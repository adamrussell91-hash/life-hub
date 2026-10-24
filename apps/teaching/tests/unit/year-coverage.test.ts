import { describe, it, expect } from 'vitest';
import { buildYearCoverage, type YearUnit } from '@/alignment/year-coverage';
import type { Alignment } from '@/alignment/schema';
import type { SkillsContinuum } from '@/skills/schema';

/* An invented syllabus: the real wording lives in the private data repo. */
const DOC = {
  schema: 'syllabus_alignment_v1',
  title: 'Invented',
  match: { syllabus: 'Invented', version: '1', year: 12 },
  sources: [],
  outcomes: [1, 2].map((n) => ({ n, code: `OUT-${n}`, text: `Outcome ${n}` })),
  processes: [],
  concepts: [
    { key: 'TIDE', name: 'Tides', head: 'Tides', bullets: [{ n: 1, text: 'Tide', adv: false }] },
    { key: 'GULL', name: 'Gulls', head: 'Gulls', bullets: [{ n: 1, text: 'Gull', adv: false }] },
    { key: 'REEF', name: 'Reefs', head: 'Reefs', bullets: [{ n: 1, text: 'Reef', adv: false }] }
  ],
  focus_areas: [
    {
      id: 'harbours', name: 'Harbours',
      points: [
        { id: 'U1', kind: 'U', short: 'Read', text: 'Read', outcomes: [{ n: 1, link: 'shared' }], concepts: [{ ref: 'TIDE1', link: 'shared' }, { ref: 'REEF1', link: 'related' }], processes: [] },
        { id: 'R1', kind: 'R', short: 'Answer', text: 'Answer', outcomes: [{ n: 2, link: 'shared' }], concepts: [{ ref: 'GULL1', link: 'shared' }], processes: [] }
      ]
    },
    { id: 'storms', name: 'Storms', points: [{ id: 'U1', kind: 'U', short: 'Storm', text: 'Storm', outcomes: [{ n: 1, link: 'shared' }], concepts: [{ ref: 'REEF1', link: 'shared' }], processes: [] }] }
  ]
} as unknown as Alignment;

const SKILLS = {
  strands: [
    {
      schema: 'skills_strand_v1', strand: 'reading', name: 'Reading', summary: '', rungs: [],
      sub_strands: [{ id: 'close', name: 'Close', in_hsc: '', draws_on: '', outcomes: [], focus_areas: [], points: [{ area: 'harbours', point: 'U1', link: 'shared' }, { area: 'storms', point: 'U1', link: 'shared' }], rungs: {} }]
    },
    {
      schema: 'skills_strand_v1', strand: 'speaking', name: 'Speaking', summary: '', rungs: [],
      sub_strands: [{ id: 'voice', name: 'Voice', in_hsc: '', draws_on: '', outcomes: [], focus_areas: [], points: [{ area: 'harbours', point: 'R1', link: 'shared' }], rungs: {} }]
    }
  ]
} as unknown as SkillsContinuum;

const UNITS: YearUnit[] = [
  {
    id: 'u1', title: 'Focus Area: Harbours',
    lessons: [
      { id: 'a', title: 'Low tide', dot_points: ['harbours:U1'] },
      { id: 'b', title: 'High tide', dot_points: ['harbours:U1'] },
      { id: 'c', title: 'Untagged' }
    ]
  },
  { id: 'u2', title: 'Storm season', focusArea: 'storms', lessons: [{ id: 'd', title: 'Clouds' }] }
];

describe('buildYearCoverage', () => {
  const cov = buildYearCoverage(DOC, SKILLS, UNITS);
  const concept = (key: string) => cov.concepts.find((r) => r.id === `concept:${key}`)!;

  it('places units in focus areas by title or by the chosen area, and counts tagged lessons', () => {
    expect(cov.areas.map((a) => [a.id, a.units.map((u) => u.id), a.lessonCount, a.tagged, a.planned])).toEqual([
      ['harbours', ['u1'], 3, 2, true],
      ['storms', ['u2'], 1, 0, false]
    ]);
  });

  it('fills a cell with the lessons whose points core-link the concept', () => {
    expect(concept('TIDE').cells[0]).toEqual({ state: 'taught', lessons: [UNITS[0]!.lessons[0], UNITS[0]!.lessons[1]] });
    expect(concept('TIDE').year).toEqual({ expected: 1, taught: 1, gaps: 0 });
  });

  it('marks an expected item with no lesson a gap in a planned area, and only expected in one still to come', () => {
    expect(concept('GULL').cells[0]!.state).toBe('gap');
    expect(concept('REEF').cells[1]!.state).toBe('later');
    // A related link is not an expectation.
    expect(concept('REEF').cells[0]!.state).toBe('none');
  });

  it('reads skills strands from the sub-strands that name a point as core', () => {
    const reading = cov.skills.find((r) => r.id === 'strand:reading')!;
    expect(reading.cells.map((c) => c.state)).toEqual(['taught', 'later']);
    expect(reading.year).toEqual({ expected: 2, taught: 1, gaps: 0 });
    expect(cov.skills.find((r) => r.id === 'strand:speaking')!.cells[0]!.state).toBe('gap');
  });

  it('covers outcomes through the points that core-link them', () => {
    expect(cov.outcomes.map((r) => r.cells.map((c) => c.state))).toEqual([['taught', 'later'], ['gap', 'none']]);
  });

  it('lists the gaps in planned areas, dot points included', () => {
    expect(cov.gaps).toEqual([
      { area: 'Harbours', label: 'Gulls' },
      { area: 'Harbours', label: 'Speaking' },
      { area: 'Harbours', label: 'OUT-2' },
      { area: 'Harbours', label: 'Dot point R1' }
    ]);
  });

  it('still builds with no skills continuum', () => {
    expect(buildYearCoverage(DOC, null, UNITS).skills).toEqual([]);
  });
});
