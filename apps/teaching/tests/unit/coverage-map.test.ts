import { describe, it, expect } from 'vitest';
import type { CurriculumLinesV2Content, NetworkLine } from '@/schemas/block';
import { buildCoverageMap, thinLimit, type MapLesson } from '@/network/coverage-map/model';
import { studentRoute } from '@/network/coverage-map/student';
import type { Evidence } from '@/evidence/types';

/* Invented names only: this repository is public. */
const LINES: NetworkLine[] = [
  { id: 'und', mode: 'train', name: 'Understanding', colour: 'wave', alignment: { kind: 'points', group: 'U' } },
  { id: 'rep', mode: 'metro', name: 'Representation', colour: 'lilac' },
  { id: 'read', mode: 'light_rail', name: 'Reading', colour: 'amber', alignment: { kind: 'strand', strand: 'reading' } }
];
const POINTS = { area: 'human', points: [{ id: 'U1', kind: 'U' as const, short: 'One' }, { id: 'U2', kind: 'U' as const, short: 'Two' }, { id: 'R1', kind: 'R' as const, short: 'Three' }] };

function v2(overrides: Partial<CurriculumLinesV2Content> = {}): CurriculumLinesV2Content {
  return { version: 2, rail_stops: [], gates: [], nudges: {}, terminus: { label: 'Essay' }, ...overrides };
}

const LESSONS: MapLesson[] = [
  { id: 'a', title: 'Harbour poems', dot_points: ['human:U1'], line_stops: [{ line_id: 'und', level: 'introduced' }, { line_id: 'rep', level: 'introduced' }] },
  { id: 'b', title: 'Tide quiz', quiz: true, line_stops: [{ line_id: 'read' }] },
  { id: 'c', title: 'Close looking', role: 'support', skip: '90%+ on the quiz', line_stops: [{ line_id: 'read' }] },
  { id: 'd', title: 'Salt and stone', dot_points: ['human:U1', 'human:U2'], line_stops: [{ line_id: 'und', level: 'mastered' }, { line_id: 'rep', level: 'reinforced' }] },
  { id: 'e', title: 'Lighthouse talk', role: 'extension', line_stops: [{ line_id: 'read' }] },
  { id: 'f', title: 'Wrap up', dot_points: ['human:U2'] }
];

const build = (lessons = LESSONS, content = v2()) => buildCoverageMap({ content, lines: LINES, lessons, points: POINTS });

describe('Coverage map: model', () => {
  it('puts lessons on lanes from their role and marks quizzes and the task', () => {
    const map = build();
    expect(map.rows.map((r) => [r.id, r.lane, r.kind])).toEqual([
      ['a', 'core', 'lesson'], ['b', 'core', 'check'], ['c', 'support', 'lesson'], ['d', 'core', 'lesson'],
      ['e', 'extension', 'lesson'], ['f', 'core', 'lesson'], ['__terminus', 'core', 'goal']
    ]);
    expect(map.rows.find((r) => r.id === 'c')?.skip).toBe('90%+ on the quiz');
  });

  it('takes support and extension from a light-rail stop when the lesson has no role', () => {
    const lessons = LESSONS.map((l) => ({ ...l, role: undefined, skip: undefined }));
    const map = build(lessons, v2({ rail_stops: [{ id: 's', line_id: 'read', kind: 'support', lesson_id: 'c', label: '', skip_rule: 'Under 50%' }] }));
    const c = map.rows.find((r) => r.id === 'c')!;
    expect(c.lane).toBe('support');
    expect(c.skip).toBe('Under 50%');
    expect(map.rows.find((r) => r.id === 'e')?.lane).toBe('core');
  });

  it('draws a choice as options: A on the core line, B beside it', () => {
    const lessons: MapLesson[] = [
      { id: 'a', title: 'Start', after: ['b1', 'b2'] },
      { id: 'b1', title: 'Talk', after: ['c'] },
      { id: 'b2', title: 'Write', after: ['c'] },
      { id: 'c', title: 'Draft' }
    ];
    const rows = build(lessons).rows;
    expect(rows.find((r) => r.id === 'b1')).toMatchObject({ lane: 'core', option: 'A' });
    expect(rows.find((r) => r.id === 'b2')).toMatchObject({ lane: 'option', option: 'B' });
    expect(rows.find((r) => r.id === 'c')).toMatchObject({ lane: 'core' });
    expect(rows.find((r) => r.id === 'c')?.option).toBeUndefined();
  });

  it('puts a detour that rejoins (the other way goes straight on) beside the core line as optional', () => {
    const lessons: MapLesson[] = [
      { id: 'a', title: 'Start', after: ['c', 'b'] },
      { id: 'b', title: 'Pre-quiz', quiz: true, after: ['c'] },
      { id: 'c', title: 'Next' }
    ];
    const rows = build(lessons, v2({ station_order: ['a', 'b', 'c'] })).rows;
    expect(rows.map((r) => [r.id, r.lane, r.option])).toEqual([['a', 'core', undefined], ['b', 'option', undefined], ['c', 'core', undefined], ['__terminus', 'core', undefined]]);
  });

  it('shows an extension stop’s lesson the old map left off, after the lesson it follows, teaching the stop’s line', () => {
    const lessons: MapLesson[] = [...LESSONS.map((l) => ({ ...l, role: undefined })), { id: 'talk', title: 'Talk practice' }];
    const map = build(lessons, v2({
      hidden_lessons: ['talk'],
      rail_stops: [{ id: 's', line_id: 'read', kind: 'extension', lesson_id: 'talk', after_lesson_id: 'a', label: '' }]
    }));
    expect(map.rows.map((r) => r.id).slice(0, 3)).toEqual(['a', 'talk', 'b']);
    const talk = map.rows.find((r) => r.id === 'talk')!;
    expect(talk.lane).toBe('extension');
    expect(talk.teaches.has('read')).toBe(true);
  });

  it('groups dot points, concepts and skills, keeping linked train lines out', () => {
    const map = build();
    expect(map.groups.map((g) => [g.name, g.items.map((i) => i.label)])).toEqual([
      ['Understanding', ['U1', 'U2']], ['Responding', ['R1']], ['Concepts', ['REPR']], ['Skills', ['READ']]
    ]);
  });

  it('gives dot points the depth of the lesson’s stop on their line, else first-then-again', () => {
    const map = build();
    const at = (row: string, item: string) => map.rows.find((r) => r.id === row)?.teaches.get(item);
    expect(at('a', 'human:U1')).toBe(1);
    expect(at('d', 'human:U1')).toBe(3);
    expect(at('d', 'human:U2')).toBe(3);
    expect(at('f', 'human:U2')).toBe(2);
    expect(at('b', 'read')).toBe(1);
    expect(at('c', 'read')).toBe(2);
  });

  it('counts core lessons apart from support and extension and flags thin items for the unit’s size', () => {
    const map = build();
    expect(map.coverage.get('read')).toEqual({ core: 1, optional: 2, thin: true, first: 1 });
    expect(map.coverage.get('human:R1')).toEqual({ core: 0, optional: 0, thin: true, first: -1 });
    expect(map.coverage.get('human:U1')?.thin).toBe(false);
    expect([thinLimit(4), thinLimit(14), thinLimit(36)]).toEqual([1, 2, 5]);
  });

  it('uses the terminus lesson as the goal when it is in the unit', () => {
    const rows = build(LESSONS, v2({ terminus: { label: 'Essay', lesson_id: 'f' } })).rows;
    expect(rows.at(-1)).toMatchObject({ id: 'f', kind: 'goal' });
  });
});

const ev = (source: string, share: number, tags: string[] = [], n = 0): Evidence => ({
  item: `${source}#${n}`, tags, share, why: [], student: 's1', source, date: '2026-10-20', confidence: null
});

describe('Coverage map: one student', () => {
  it('carries a state forward, marks skipped side lessons, and fades lessons ahead', () => {
    const map = build();
    const route = studentRoute(map, {
      evidence: [ev('quiz:b', 0.3)],
      took: [],
      scores: new Map([['b', { score: 3, max: 10 }]]),
      today: '2026-10-20'
    });
    expect(route.now).toBe(1);
    expect(route.nodes.get('b|read')).toBe('struggling');
    expect(route.nodes.get('a|human:U1')).toBe('none');
    expect(route.nodes.get('c|read')).toBe('ahead');
    expect(route.current.get('read')).toBe('struggling');
  });

  it('counts a ticked support lesson as taken and a skipped one as skipped', () => {
    const map = build();
    const base = { scores: new Map([['b', { score: 3, max: 10 }]]), today: '2026-12-01' };
    const ticked = studentRoute(map, { ...base, evidence: [ev('quiz:b', 0.3)], took: ['c'] });
    expect(ticked.took.has('c')).toBe(true);
    expect(ticked.nodes.get('c|read')).toBe('struggling');
    const not = studentRoute(map, { ...base, evidence: [ev('quiz:b', 0.3)], took: ['d'] });
    expect(not.nodes.get('c|read')).toBe('skipped');
    expect(not.nodes.get('e|read')).toBe('ahead');
  });

  it('matches skill tags to the strand’s line and stars the second secure checkpoint', () => {
    const lessons: MapLesson[] = [
      { id: 'q1', title: 'Quiz one', quiz: true, line_stops: [{ line_id: 'read' }] },
      { id: 'm', title: 'Middle', line_stops: [{ line_id: 'read' }] },
      { id: 'q2', title: 'Quiz two', quiz: true, dot_points: ['human:U1'] },
      { id: 'z', title: 'Later', line_stops: [{ line_id: 'read' }] }
    ];
    const map = build(lessons);
    const route = studentRoute(map, {
      evidence: [ev('quiz:q1', 0.9), ev('quiz:q2', 0.95, ['skill:reading.inference']), ev('quiz:q2', 0.2, [], 1)],
      took: ['z'],
      scores: new Map(),
      today: '2026-12-01'
    });
    expect(route.nodes.get('q1|read')).toBe('secure');
    expect(route.nodes.get('m|read')).toBe('secure');
    expect(route.current.get('read')).toBe('secure');
    expect(route.stars.has('z|read')).toBe(true);
    expect(route.nodes.get('q2|human:U1')).toBe('working');
  });
});
