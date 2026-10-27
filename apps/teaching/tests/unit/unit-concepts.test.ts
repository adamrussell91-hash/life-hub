import { describe, it, expect } from 'vitest';
import { conceptLineIds, skillLineIds, unitConceptKeys, unitLines, unitSkillStrands } from '@/network/unit-concepts';
import { settleConceptLines, settleSkillLines } from '@/teacher/network-context';
import { unitNetworkInput } from '@/blocks/curriculum-lines/render';
import type { SkillsContinuum } from '@/skills/schema';
import type { Alignment } from '@/alignment/schema';
import type { Block, CurriculumLinesBlock, NetworkLine } from '@/schemas/block';

/* An invented syllabus: the real wording lives in the private data repo. */
const KEYS = ['TIDE', 'GULL', 'REEF', 'SAND', 'KELP', 'WAVE'] as const;
type Link = [string, 'shared' | 'related'];
const point = (id: string, links: Link[]) => ({
  id, kind: 'U', short: id, text: id, outcomes: [], processes: [],
  concepts: links.map(([ref, link]) => ({ ref, link }))
});
const DOC = {
  schema: 'syllabus_alignment_v1',
  title: 'Invented',
  match: { syllabus: 'Invented', version: '1', year: 12 },
  sources: [],
  outcomes: [],
  processes: [],
  concepts: KEYS.map((key) => ({ key, name: key[0] + key.slice(1).toLowerCase(), head: key, bullets: [{ n: 1, text: key, adv: false }, { n: 2, text: key, adv: false }] })),
  focus_areas: [
    {
      // REEF shares wording with 3 points; GULL, SAND and KELP with 2 each, SAND touching most.
      // WAVE shares with 1. TIDE is only ever related. Two shared bullets on one point count once.
      id: 'harbours', name: 'Harbours',
      points: [
        point('U1', [['REEF1', 'shared'], ['REEF2', 'shared'], ['SAND1', 'shared'], ['TIDE1', 'related']]),
        point('U2', [['REEF1', 'shared'], ['GULL1', 'shared'], ['SAND1', 'related']]),
        point('U3', [['REEF2', 'shared'], ['KELP1', 'shared'], ['SAND2', 'shared'], ['TIDE1', 'related']]),
        point('U4', [['GULL1', 'shared'], ['KELP1', 'shared'], ['WAVE1', 'shared'], ['TIDE2', 'related']])
      ]
    },
    {
      // Only two concepts reach two points, so the area keeps three.
      id: 'storms', name: 'Storms',
      points: [
        point('U1', [['WAVE1', 'shared'], ['GULL1', 'shared']]),
        point('U2', [['WAVE2', 'shared'], ['GULL2', 'shared'], ['KELP1', 'shared'], ['TIDE1', 'related']]),
        point('U3', [['REEF1', 'shared']])
      ]
    }
  ]
} as unknown as Alignment;

const LINES: NetworkLine[] = [
  { id: 'und', mode: 'train', name: 'Understanding', colour: 'wave', alignment: { kind: 'points', group: 'U' } },
  { id: 'tide', mode: 'metro', name: 'Tide', colour: 'green', alignment: { kind: 'concept', key: 'TIDE' } },
  { id: 'gull', mode: 'metro', name: 'Gull', colour: 'lilac', alignment: { kind: 'concept', key: 'GULL' } },
  { id: 'reef', mode: 'metro', name: 'Reef', colour: 'navy', alignment: { kind: 'concept', key: 'REEF' } },
  // Named after its concept but never linked.
  { id: 'sand', mode: 'metro', name: ' sand ', colour: 'amber' },
  { id: 'kelp', mode: 'metro', name: 'Kelp', colour: 'navy_deep', alignment: { kind: 'concept', key: 'KELP' } },
  { id: 'wave', mode: 'metro', name: 'Wave', colour: 'lilac_deep', alignment: { kind: 'concept', key: 'WAVE' } },
  { id: 'read', mode: 'light_rail', name: 'Reading', colour: 'wave' }
];

describe('unitConceptKeys', () => {
  it('takes the concepts most dot points share wording with, a fourth only when it reaches two points', () => {
    expect(unitConceptKeys(DOC, 'harbours')).toEqual(['REEF', 'SAND', 'GULL', 'KELP']);
    expect(unitConceptKeys(DOC, 'storms')).toEqual(['GULL', 'WAVE', 'REEF']);
  });
  it('is empty for an unknown focus area', () => {
    expect(unitConceptKeys(DOC, 'nowhere')).toEqual([]);
  });
});

describe('conceptLineIds', () => {
  it('finds each concept’s metro line by link or by name, in the concepts’ order', () => {
    expect(conceptLineIds(LINES, ['SAND', 'REEF', 'TIDE'], DOC.concepts)).toEqual(['sand', 'reef', 'tide']);
  });
  it('skips concepts with no line', () => {
    expect(conceptLineIds(LINES.filter((l) => l.id !== 'kelp'), ['KELP', 'GULL'], DOC.concepts)).toEqual(['gull']);
  });
});

describe('unitLines', () => {
  it('keeps trains and light rail, and only the unit’s metro lines', () => {
    expect(unitLines(LINES, ['reef', 'gull']).map((l) => l.id)).toEqual(['und', 'gull', 'reef', 'read']);
  });
  it('shows every line when the unit has none picked', () => {
    expect(unitLines(LINES, undefined)).toHaveLength(LINES.length);
    expect(unitLines(LINES, [])).toHaveLength(LINES.length);
  });
});

const mapBlock = (content: Partial<Extract<CurriculumLinesBlock['content'], { version: 2 }>> = {}): CurriculumLinesBlock => ({
  id: 'map', type: 'block', block_type: 'curriculum_lines', variant: 'large', visibility: 'both',
  content: { version: 2, rail_stops: [], gates: [], nudges: {}, terminus: { label: 'Task' }, ...content }
} as CurriculumLinesBlock);

describe('settleConceptLines', () => {
  it('gives an unpicked unit map its focus area’s concept lines', () => {
    const out = settleConceptLines([mapBlock()] as Block[], LINES, DOC, 'Harbours of the world');
    expect(out?.[0]!.content).toMatchObject({ concept_lines: ['reef', 'sand', 'gull', 'kelp'] });
  });
  it('follows the map’s chosen focus area over the title', () => {
    const out = settleConceptLines([mapBlock({ focus_area: 'storms' })] as Block[], LINES, DOC, 'Harbours');
    expect(out?.[0]!.content).toMatchObject({ concept_lines: ['gull', 'wave', 'reef'] });
  });
  it('leaves a map with concepts picked, or no matching focus area, alone', () => {
    expect(settleConceptLines([mapBlock({ concept_lines: ['tide'] })] as Block[], LINES, DOC, 'Harbours')).toBeNull();
    expect(settleConceptLines([mapBlock()] as Block[], LINES, DOC, 'Volcanoes')).toBeNull();
  });
});

describe('Unit map: the unit’s concepts only', () => {
  it('draws only the picked metro lines; the rest of the subject’s lines stay', () => {
    const input = unitNetworkInput(mapBlock({ concept_lines: ['reef', 'sand'] }), { network: { lines: LINES, lessons: [] } });
    expect(input.lines.map((l) => l.id)).toEqual(['und', 'reef', 'sand', 'read']);
  });
});

/* Skills: the same idea for the light rail lines. */
const sub = (points: Array<[string, 'shared' | 'related']>) => ({ id: 'x', name: 'X', points: points.map(([point, link]) => ({ area: 'harbours', point, link })) });
const SKILLS = {
  strands: [
    { strand: 'reading', sub_strands: [sub([['U1', 'shared'], ['U2', 'shared']])] },
    { strand: 'arguing', sub_strands: [sub([['U1', 'shared']]), sub([['U1', 'shared'], ['U3', 'shared']])] },
    { strand: 'speaking', sub_strands: [sub([['U2', 'shared']])] },
    { strand: 'language', sub_strands: [sub([['U3', 'shared']])] },
    { strand: 'valuing', sub_strands: [sub([['U1', 'related']])] }
  ]
} as unknown as SkillsContinuum;
const RAILS: NetworkLine[] = [
  { id: 'rd', mode: 'light_rail', name: 'Reading', colour: 'wave', alignment: { kind: 'strand', strand: 'reading' } },
  { id: 'ar', mode: 'light_rail', name: 'Arguing', colour: 'navy', alignment: { kind: 'strand', strand: 'arguing' } },
  { id: 'sp', mode: 'light_rail', name: 'Speaking', colour: 'amber', alignment: { kind: 'strand', strand: 'speaking' } }
];

describe('unitSkillStrands', () => {
  it('ranks strands by the focus area’s dot points they name as core, a fourth only at two or more', () => {
    expect(unitSkillStrands(DOC, SKILLS, 'harbours')).toEqual(['reading', 'arguing', 'speaking']);
  });
  it('is empty for an unknown focus area', () => {
    expect(unitSkillStrands(DOC, SKILLS, 'nowhere')).toEqual([]);
  });
});

describe('skillLineIds and unitLines', () => {
  it('finds each strand’s light rail line', () => {
    expect(skillLineIds(RAILS, ['arguing', 'language', 'reading'])).toEqual(['ar', 'rd']);
  });
  it('keeps trains, picked concepts and picked skills only', () => {
    const all = [...LINES.filter((l) => l.mode !== 'light_rail'), ...RAILS];
    expect(unitLines(all, ['reef'], ['sp']).map((l) => l.id)).toEqual(['und', 'reef', 'sp']);
    expect(unitLines(all, ['reef'], undefined).map((l) => l.id)).toEqual(['und', 'reef', 'rd', 'ar', 'sp']);
  });
});

describe('settleSkillLines', () => {
  it('gives an unpicked unit map its focus area’s skill lines, and leaves picked ones alone', () => {
    const out = settleSkillLines([mapBlock()] as Block[], RAILS, DOC, SKILLS, 'Harbours of the world');
    expect(out?.[0]!.content).toMatchObject({ skill_lines: ['rd', 'ar', 'sp'] });
    expect(settleSkillLines([mapBlock({ skill_lines: ['rd'] })] as Block[], RAILS, DOC, SKILLS, 'Harbours')).toBeNull();
  });
});
