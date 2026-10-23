// apps/teaching/tests/unit/tutorial-grouping.test.ts
import { describe, it, expect } from 'vitest';
import { anonymise, groupingBrief, parseGroups } from '@/tutorial/grouping';
import { TutorialGroupIdSchema } from '@/tutorial/schema';
import type { Evidence } from '@/evidence/types';

const ev = (student: string, why: Evidence['why'], share = 0): Evidence => ({ item: 'q1', tags: ['tech:cyclical'], share, why, student, source: 'quiz1', date: '2026-10-20', confidence: null });
const evidence = [
  ev('st_ann', [{ type: 'named', as: 'repetition', target: 'cyclical structure' }]),
  ev('st_cy', [{ type: 'not_found', target: 'cyclical structure' }]),
  ev('st_zz', [{ type: 'code', id: 'vague' }])
];

describe('tutorial grouping', () => {
  it('anonymises students and keeps only the chosen ones', () => {
    const anon = anonymise(['st_ann', 'st_cy'], evidence, 'tech:cyclical');
    expect(anon.keys).toEqual({ S1: 'st_ann', S2: 'st_cy' });
    expect(anon.rows.map((r) => r.key)).toEqual(['S1', 'S2']);
    expect(JSON.stringify(anon)).not.toContain('st_zz');
  });

  it('writes a brief with no ids or names', () => {
    const anon = anonymise(['st_ann', 'st_cy'], evidence, 'tech:cyclical');
    const brief = groupingBrief({ tagLabel: 'Cyclical structure', rows: anon.rows, mistakeText: (w) => JSON.stringify(w) });
    expect(brief).toContain('Cyclical structure');
    expect(brief).toContain('S1');
    expect(brief).not.toContain('st_ann');
  });

  it('parses groups, maps keys back and drops unknown keys', () => {
    const raw = '```json\n{"groups":[{"name":"Names it wrong","why":"Calls it repetition","goal":"Today: naming it","gap_type":"mix_up","members":["S1","S9"],"quotes":{"S1":"Named it repetition"}},{"name":"Can’t find it","why":"Misses the return","goal":"Today: finding where it starts and ends","gap_type":"knowledge","members":["S2"],"quotes":{}}]}\n```';
    const groups = parseGroups(raw, { S1: 'st_ann', S2: 'st_cy' });
    expect(groups.map((g) => [g.name, g.students, g.gap_type])).toEqual([['Names it wrong', ['st_ann'], 'mix_up'], ['Can’t find it', ['st_cy'], 'knowledge']]);
    expect(groups[0]!.evidence).toEqual([{ student: 'st_ann', quote: 'Named it repetition' }]);
    expect(groups[0]!.id).toMatch(/^[a-z0-9_-]+$/);
  });

  it('gives two groups with the same name distinct, valid ids', () => {
    const raw = '{"groups":[{"name":"Same","why":"","goal":"Today: a","gap_type":"knowledge","members":["S1"],"quotes":{}},{"name":"Same","why":"","goal":"Today: b","gap_type":"knowledge","members":["S2"],"quotes":{}}]}';
    const groups = parseGroups(raw, { S1: 'st_ann', S2: 'st_cy' });
    const ids = groups.map((x) => x.id);
    expect(new Set(ids).size).toBe(2);
    ids.forEach((id) => expect(TutorialGroupIdSchema.safeParse(id).success).toBe(true));
  });

  it('puts any student Ann left out in an Unsure group, and refuses junk', () => {
    const groups = parseGroups('{"groups":[{"name":"A","why":"","goal":"Today","gap_type":"knowledge","members":["S1"],"quotes":{}}]}', { S1: 'st_ann', S2: 'st_cy' });
    expect(groups.at(-1)!.students).toEqual(['st_cy']);
    expect(groups.at(-1)!.unsure).toEqual(['st_cy']);
    expect(() => parseGroups('not json', { S1: 'st_ann' })).toThrow('Ann’s grouping came back unreadable. Try again.');
  });

  const one = (g: object) => parseGroups(JSON.stringify({ groups: [{ name: 'A', why: '', goal: 'Today: x', gap_type: 'knowledge', members: ['S1'], quotes: {}, ...g }] }), { S1: 'st_ann' })[0]!;

  it('coerces bad field types and blank names', () => {
    const g = one({ name: '  ', why: 5, goal: ['x'], quotes: 'nope' });
    expect(g.name).toBe('Group 1');
    expect(g.why).toBe('');
    expect(g.goal).toBe('Today: practising this together');
    expect(g.evidence).toEqual([]);
  });

  it('ignores prototype keys as members', () => {
    expect(() => parseGroups('{"groups":[{"name":"A","members":["constructor","__proto__","S1"]}]}', { S1: 'st_ann' })).not.toThrow();
    expect(parseGroups('{"groups":[{"name":"A","members":["constructor","S1"]}]}', { S1: 'st_ann' })[0]!.students).toEqual(['st_ann']);
  });

  it('prepends Today: and replaces deficit or empty goals', () => {
    expect(one({ goal: 'naming the technique' }).goal).toBe('Today: naming the technique');
    expect(one({ goal: 'Today: they can’t name it' }).goal).toBe('Today: practising this together');
    expect(one({ goal: 'working without notes' }).goal).toBe('Today: practising this together');
    expect(one({ goal: '' }).goal).toBe('Today: practising this together');
  });

  it('turns structural surprises into the friendly error', () => {
    expect(() => parseGroups('{"groups":[null, 4, {"members":"S1"}]}', { S1: 'st_ann' })).not.toThrow();
    expect(() => parseGroups('{"groups":"x"}', { S1: 'st_ann' })).toThrow('Ann’s grouping came back unreadable. Try again.');
  });

  it('caps long mistake lines in the brief', () => {
    const rows = [{ key: 'S1', mistakes: [{ type: 'code', id: 'x' } as never], share: 0.5 }];
    expect(groupingBrief({ tagLabel: 'T', rows, mistakeText: () => 'y'.repeat(500) })).not.toContain('y'.repeat(161));
  });
});
