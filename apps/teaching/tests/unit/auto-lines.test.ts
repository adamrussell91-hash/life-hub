import { describe, it, expect } from 'vitest';
import { autoLineIds, syncAutoStops, toggleLineStop, type AutoLineContext } from '@/alignment/auto-lines';
import type { Alignment } from '@/alignment/schema';
import { LessonSchema } from '@/schemas/lesson';
import type { LineStop, NetworkLine } from '@/schemas/block';
import type { SkillsContinuum } from '@/skills/schema';

/* An invented syllabus: the real wording lives in the private data repo. */
const DOC = {
  schema: 'syllabus_alignment_v1',
  title: 'Invented',
  match: { syllabus: 'Invented', version: '1', year: 12 },
  sources: [],
  outcomes: [1, 2, 3].map((n) => ({ n, code: `OUT-${n}`, text: `Outcome ${n}` })),
  processes: [],
  concepts: [
    { key: 'TIDE', name: 'Tides', head: 'Tides', bullets: [{ n: 1, text: 'Tide', adv: false }] },
    { key: 'GULL', name: 'Gulls', head: 'Gulls', bullets: [{ n: 1, text: 'Gull', adv: false }] }
  ],
  focus_areas: [
    {
      id: 'harbours', name: 'Harbours',
      points: [
        // TIDE is core to U1; GULL only related.
        { id: 'U1', kind: 'U', short: 'Read', text: 'Read', outcomes: [{ n: 1, link: 'shared' }], concepts: [{ ref: 'TIDE1', link: 'shared' }, { ref: 'GULL1', link: 'related' }], processes: [] },
        { id: 'R1', kind: 'R', short: 'Answer', text: 'Answer', outcomes: [{ n: 3, link: 'shared' }], concepts: [{ ref: 'GULL1', link: 'shared' }], processes: [] }
      ]
    },
    { id: 'storms', name: 'Storms', points: [{ id: 'U1', kind: 'U', short: 'Storm', text: 'Storm', outcomes: [], concepts: [{ ref: 'TIDE1', link: 'shared' }], processes: [] }] }
  ]
} as unknown as Alignment;

const SKILLS = {
  strands: [
    {
      schema: 'skills_strand_v1', strand: 'reading', name: 'Reading', summary: '', rungs: [],
      sub_strands: [{ id: 'close', name: 'Close', in_hsc: '', draws_on: '', outcomes: [], focus_areas: [], points: [{ area: 'harbours', point: 'U1', link: 'shared' }], rungs: {} }]
    },
    {
      schema: 'skills_strand_v1', strand: 'speaking', name: 'Speaking', summary: '', rungs: [],
      // Only a related link to R1: not enough to put a lesson on the line.
      sub_strands: [{ id: 'voice', name: 'Voice', in_hsc: '', draws_on: '', outcomes: [3], focus_areas: ['harbours'], points: [{ area: 'harbours', point: 'R1', link: 'related' }], rungs: {} }]
    }
  ]
} as unknown as SkillsContinuum;

const LINES: NetworkLine[] = [
  { id: 'und', mode: 'train', name: 'Understanding', short: 'UND', colour: 'wave', alignment: { kind: 'points', group: 'U' } },
  { id: 'resp', mode: 'train', name: 'Responding', short: 'RESP', colour: 'navy', alignment: { kind: 'points', group: 'R' } },
  { id: 'tide', mode: 'metro', name: 'Tides', short: 'TIDE', colour: 'green', alignment: { kind: 'concept', key: 'TIDE' } },
  { id: 'gull', mode: 'metro', name: 'Gulls', short: 'GULL', colour: 'lilac', alignment: { kind: 'concept', key: 'GULL' } },
  { id: 'read', mode: 'light_rail', name: 'Reading', short: 'READ', colour: 'amber', alignment: { kind: 'strand', strand: 'reading' } },
  { id: 'spk', mode: 'light_rail', name: 'Speaking', short: 'SPK', colour: 'lilac_deep', alignment: { kind: 'strand', strand: 'speaking' } },
  { id: 'loose', mode: 'light_rail', name: 'Loose', colour: 'navy_deep' }
];

const CTX: AutoLineContext = { doc: DOC, skills: SKILLS, areaId: 'harbours' };
const ids = (set: Set<string>) => [...set].sort();

describe('autoLineIds', () => {
  it('puts a U point on the U train, its core concepts and the strands that name it as core', () => {
    expect(ids(autoLineIds(LINES, CTX, ['harbours:U1']))).toEqual(['read', 'tide', 'und']);
  });

  it('leaves out related concept links and related sub-strand links', () => {
    // R1: GULL is core, Speaking names R1 only as related.
    expect(ids(autoLineIds(LINES, CTX, ['harbours:R1']))).toEqual(['gull', 'resp']);
  });

  it('only reads dot points from the unit’s focus area', () => {
    expect(ids(autoLineIds(LINES, CTX, ['storms:U1']))).toEqual([]);
  });

  it('works without the skills continuum, leaving light rail alone', () => {
    expect(ids(autoLineIds(LINES, { ...CTX, skills: null }, ['harbours:U1']))).toEqual(['tide', 'und']);
  });

  it('gives no lines for no dot points', () => {
    expect(autoLineIds(LINES, CTX, undefined).size).toBe(0);
  });
});

describe('syncAutoStops', () => {
  it('adds auto stops and keeps hand-set ones', () => {
    const manual: LineStop[] = [{ line_id: 'loose' }];
    expect(syncAutoStops(manual, [], new Set(['und', 'tide']))).toEqual([
      { line_id: 'loose' },
      { line_id: 'und', auto: true },
      { line_id: 'tide', auto: true }
    ]);
  });

  it('drops auto stops the dot points no longer reach, but not hand-set ones on the same line', () => {
    const stops: LineStop[] = [{ line_id: 'und', auto: true }, { line_id: 'tide', level: 'mastered' }];
    expect(syncAutoStops(stops, [], new Set())).toEqual([{ line_id: 'tide', level: 'mastered' }]);
  });

  it('keeps a depth the teacher set on an auto stop', () => {
    const stops: LineStop[] = [{ line_id: 'und', auto: true, level: 'mastered' }];
    expect(syncAutoStops(stops, [], new Set(['und']))).toEqual(stops);
  });

  it('leaves a line the teacher took off', () => {
    expect(syncAutoStops([], ['tide'], new Set(['und', 'tide']))).toEqual([{ line_id: 'und', auto: true }]);
  });

  it('is what the lesson schema keeps', () => {
    const lesson = LessonSchema.parse({
      id: 'l1', type: 'lesson', title: 'L', slug: 'l', status: 'active', created_at: '2026-10-23T00:00:00.000Z',
      updated_at: '2026-10-23T00:00:00.000Z', schema_version: 1, unit_id: 'u', sequence: 1, blocks: [],
      line_stops: [{ line_id: 'und', auto: true }], line_off: ['tide']
    });
    expect(lesson.line_stops).toEqual([{ line_id: 'und', auto: true }]);
    expect(lesson.line_off).toEqual(['tide']);
  });
});

describe('toggleLineStop', () => {
  const train = { id: 'und', mode: 'train' as const };
  const rail = { id: 'read', mode: 'light_rail' as const };

  it('steps an auto train stop through its depths and remembers taking it off', () => {
    let next = toggleLineStop([{ line_id: 'und', auto: true }], [], train);
    expect(next.stops).toEqual([{ line_id: 'und', auto: true, level: 'mastered' }]);
    next = toggleLineStop(next.stops, next.off, train);
    expect(next).toEqual({ stops: [], off: ['und'] });
  });

  it('remembers a light rail auto stop taken off', () => {
    expect(toggleLineStop([{ line_id: 'read', auto: true }], [], rail)).toEqual({ stops: [], off: ['read'] });
  });

  it('putting a line back is a hand-set stop and clears it from off', () => {
    expect(toggleLineStop([], ['und'], train)).toEqual({ stops: [{ line_id: 'und', level: 'introduced' }], off: [] });
  });

  it('taking off a hand-set stop does not add it to off', () => {
    expect(toggleLineStop([{ line_id: 'read' }], [], rail)).toEqual({ stops: [], off: [] });
  });
});
