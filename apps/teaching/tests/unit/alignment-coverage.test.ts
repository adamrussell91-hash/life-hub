import { describe, it, expect } from 'vitest';
import { focusAreaFor, unitCoverage, type CoverageLesson } from '@/alignment/coverage';
import type { Alignment } from '@/alignment/schema';
import { LessonSchema } from '@/schemas/lesson';
import { NetworkLineSchema, type NetworkLine } from '@/schemas/block';
import type { SkillsContinuum } from '@/skills/schema';

/* An invented syllabus: the real wording lives in the private data repo. */
const DOC = {
  schema: 'syllabus_alignment_v1',
  title: 'Invented',
  match: { syllabus: 'Invented', version: '1', year: 12 },
  sources: [],
  outcomes: [1, 2, 3, 4].map((n) => ({ n, code: `OUT-${n}`, text: `Outcome ${n}` })),
  processes: [],
  concepts: [{ key: 'TIDE', name: 'Tides', head: 'Tides', bullets: [1, 2, 3].map((n) => ({ n, text: `Tide bullet ${n}`, adv: false })) }],
  focus_areas: [
    {
      id: 'harbours', name: 'Harbours and lighthouses',
      points: [
        { id: 'U1', kind: 'U', short: 'Read the harbour', text: 'Read the harbour', outcomes: [{ n: 1, link: 'shared' }], concepts: [{ ref: 'TIDE1', link: 'shared' }], processes: [] },
        { id: 'U2', kind: 'U', short: 'Map the lights', text: 'Map the lights', outcomes: [{ n: 2, link: 'related' }], concepts: [{ ref: 'TIDE2', link: 'related' }], processes: [] },
        { id: 'R1', kind: 'R', short: 'Answer the sea', text: 'Answer the sea', outcomes: [{ n: 3, link: 'shared' }], concepts: [], processes: [] }
      ]
    },
    { id: 'storms', name: 'Storm writing', points: [{ id: 'U1', kind: 'U', short: 'Storm', text: 'Storm', outcomes: [{ n: 4, link: 'shared' }], concepts: [], processes: [] }] }
  ]
} as unknown as Alignment;

const SKILLS = {
  strands: [{
    schema: 'skills_strand_v1', strand: 'arguing', name: 'Arguing', summary: '', rungs: [],
    sub_strands: [
      { id: 'claim', name: 'Claim', in_hsc: 'Make a claim', draws_on: '', outcomes: [3], focus_areas: ['harbours'], points: [], rungs: {} },
      { id: 'evidence', name: 'Evidence', in_hsc: 'Use evidence', draws_on: '', outcomes: [4], focus_areas: ['harbours'], points: [], rungs: {} },
      { id: 'elsewhere', name: 'Elsewhere', in_hsc: 'Other area', draws_on: '', outcomes: [3], focus_areas: ['storms'], points: [], rungs: {} },
      // Names its dot point: only U2 counts, even though R1 shares its outcome.
      { id: 'voice', name: 'Voice', in_hsc: 'Find a voice', draws_on: '', outcomes: [3], focus_areas: ['harbours'], points: [{ area: 'harbours', point: 'U2', link: 'shared' }], rungs: {} }
    ]
  }]
} as unknown as SkillsContinuum;

const LINES: NetworkLine[] = [
  { id: 'und', mode: 'train', name: 'Understanding', short: 'UND', colour: 'wave', alignment: { kind: 'points', group: 'U' } },
  { id: 'resp', mode: 'train', name: 'Responding', short: 'RESP', colour: 'navy', alignment: { kind: 'points', group: 'R' } },
  { id: 'tide', mode: 'metro', name: 'Tides', short: 'TD', colour: 'green', alignment: { kind: 'concept', key: 'TIDE' } },
  { id: 'arg', mode: 'light_rail', name: 'Arguing', short: 'ARG', colour: 'amber', alignment: { kind: 'strand', strand: 'arguing' } },
  { id: 'loose', mode: 'light_rail', name: 'Loose', short: 'LO', colour: 'lilac' }
];

const LESSONS: CoverageLesson[] = [
  { id: 'a', title: 'Harbour poems', line_stops: [{ line_id: 'und' }, { line_id: 'tide' }], dot_points: ['harbours:U1'] },
  { id: 'b', title: 'Answering', line_stops: [{ line_id: 'resp' }, { line_id: 'arg' }], dot_points: ['harbours:R1', 'storms:U1'] },
  { id: 'c', title: 'Untagged', line_stops: [{ line_id: 'und' }] }
];

describe('Unit map: syllabus coverage', () => {
  const AREA = { id: 'harbours', name: 'Harbours and lighthouses' };

  it('works out the focus area from the unit title, and lets the map choose', () => {
    expect(focusAreaFor(DOC, 'Lighthouses 2026')?.id).toBe('harbours');
    expect(focusAreaFor(DOC, 'Lighthouses 2026', 'storms')?.id).toBe('storms');
    expect(focusAreaFor(DOC, 'Algebra')).toBeNull();
  });

  it('covers a train’s dot points through the lessons it stops at', () => {
    const cov = unitCoverage(DOC, SKILLS, AREA, LINES, LESSONS);
    const und = cov.rows.find((r) => r.line.id === 'und')!;
    expect(und.heading).toBe('Understanding dot points');
    expect(und.items.map((i) => [i.label, i.covered])).toEqual([['U1', true], ['U2', false]]);
    expect(und.items[0]!.lessons).toEqual(['Harbour poems']);
    expect(und.outcomes).toEqual([1]);
  });

  it('covers a metro’s concept bullets through the dot points that carry them', () => {
    const tide = unitCoverage(DOC, SKILLS, AREA, LINES, LESSONS).rows.find((r) => r.line.id === 'tide')!;
    expect(tide.heading).toBe('Tides');
    // Only bullets this focus area's points reach are listed.
    expect(tide.items.map((i) => [i.label, i.covered])).toEqual([['1', true], ['2', false]]);
  });

  it('covers a skills strand’s sub-strands in this focus area through shared outcomes', () => {
    const arg = unitCoverage(DOC, SKILLS, AREA, LINES, LESSONS).rows.find((r) => r.line.id === 'arg')!;
    expect(arg.heading).toBe('Arguing');
    expect(arg.items.map((i) => [i.label, i.covered])).toEqual([['Claim', true], ['Evidence', false], ['Voice', false]]);
    expect(arg.outcomes).toEqual([3]);
  });

  it('shows a line with no link as unlinked, and counts the unit’s gaps whatever line teaches them', () => {
    const cov = unitCoverage(DOC, SKILLS, AREA, LINES, LESSONS);
    expect(cov.rows.find((r) => r.line.id === 'loose')!.heading).toBe('');
    // storms:U1 is another focus area: it doesn't count here.
    expect(cov.gaps).toEqual({ points: ['U2'], outcomes: [2, 4] });
  });

  it('stores links on lines and dot points on lessons', () => {
    expect(NetworkLineSchema.safeParse({ id: 'x', mode: 'light_rail', name: 'X', alignment: { kind: 'strand', strand: 'arguing' } }).success).toBe(true);
    expect(NetworkLineSchema.safeParse({ id: 'x', mode: 'light_rail', name: 'X', alignment: { kind: 'strand', strand: 'juggling' } }).success).toBe(false);
    const lesson = {
      id: 'l1', type: 'lesson', title: 'L', slug: 'l', status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      schema_version: 1, unit_id: 'u', sequence: 1, blocks: []
    };
    expect(LessonSchema.safeParse({ ...lesson, dot_points: ['harbours:U2'] }).success).toBe(true);
    expect(LessonSchema.safeParse({ ...lesson, dot_points: ['U2'] }).success).toBe(false);
  });
});
