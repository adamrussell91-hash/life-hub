import { describe, expect, it } from 'vitest';
import { fillsFor, levelFor } from '@/evidence/mastery';
import type { Evidence } from '@/evidence/types';

const ev = (source: string, tag: string, share: number, n = 1): Evidence[] =>
  Array.from({ length: n }, (_, i) => ({ item: `${source}:${i}`, tags: [tag], share, why: [], student: 's1', source, date: '2026-10-01', confidence: null }) as unknown as Evidence);

describe('levelFor', () => {
  it('one secure quiz is building, two separate secure quizzes is mastered', () => {
    const one = ev('quiz:a', 'tech:metaphor', 0.9, 2);
    expect(levelFor('concepts', 'tech:metaphor', one)).toBe('building');
    expect(levelFor('concepts', 'tech:metaphor', [...one, ...ev('quiz:b', 'tech:metaphor', 0.85, 2)])).toBe('mastered');
  });
  it('two good questions in one quiz are one checkpoint, not two', () => {
    expect(levelFor('understanding', 'pt:U1', ev('quiz:a', 'pt:U1', 1, 4))).toBe('building');
  });
  it('a quiz with a single question on the tag is too thin to count', () => {
    expect(levelFor('concepts', 'tech:metaphor', ev('quiz:a', 'tech:metaphor', 1, 1))).toBe('none');
  });
  it('below secure shows nothing', () => {
    expect(levelFor('concepts', 'tech:metaphor', ev('quiz:a', 'tech:metaphor', 0.6, 3))).toBe('none');
  });
  it('skills climb the ladder: Capable and Skilled build, Accomplished and above on two pieces masters', () => {
    expect(levelFor('skills', 'skill:writing.thesis', ev('assess:a', 'skill:writing.thesis', 0.7))).toBe('building');
    expect(levelFor('skills', 'skill:writing.thesis', [...ev('assess:a', 'skill:writing.thesis', 0.85), ...ev('assess:b', 'skill:writing.thesis', 0.6)])).toBe('building');
    expect(levelFor('skills', 'skill:writing.thesis', [...ev('assess:a', 'skill:writing.thesis', 0.85), ...ev('assess:b', 'skill:writing.thesis', 0.96)])).toBe('mastered');
  });
  it('below Capable shows nothing', () => {
    expect(levelFor('skills', 'skill:writing.thesis', ev('assess:a', 'skill:writing.thesis', 0.5))).toBe('none');
  });
});

describe('fillsFor', () => {
  it('returns 0-1 fractions per group, building excludes mastered, empty groups are zero', () => {
    const evidence = [...ev('quiz:a', 'tech:a', 0.9, 2), ...ev('quiz:b', 'tech:a', 0.9, 2), ...ev('quiz:a', 'tech:b', 0.9, 2)];
    const items = [
      { group: 'concepts' as const, tag: 'tech:a' },
      { group: 'concepts' as const, tag: 'tech:b' },
      { group: 'concepts' as const, tag: 'tech:c' },
      { group: 'concepts' as const, tag: 'tech:d' }
    ];
    expect(fillsFor(items, evidence).concepts).toEqual({ mastered: 0.25, building: 0.25 });
    expect(fillsFor(items, evidence).skills).toEqual({ mastered: 0, building: 0 });
  });
});
