import { describe, it, expect } from 'vitest';
import { fromParts, narrationLength, narrationParts, partLength } from '@/lecture/narration-parts';
import { NarrationSchema } from '@/schemas/block';

describe('narration parts', () => {
  const two = { url: '/a.webm', duration_s: 180, end_s: 120, transcript: 'Words', more: [{ url: '/b.webm', duration_s: 45 }] };

  it('lists takes in order without the transcript', () => {
    expect(narrationParts(two)).toEqual([{ url: '/a.webm', duration_s: 180, end_s: 120 }, { url: '/b.webm', duration_s: 45 }]);
    expect(narrationParts(undefined)).toEqual([]);
  });

  it('counts only the kept seconds of a cut take', () => {
    expect(partLength({ url: '/a', duration_s: 180, end_s: 120 })).toBe(120);
    expect(partLength({ url: '/a', duration_s: 0, end_s: 120 })).toBe(120);
    expect(narrationLength(two)).toBe(165);
  });

  it('builds a narration back from takes, keeping the transcript', () => {
    expect(fromParts(narrationParts(two), 'Words')).toEqual(two);
    expect(fromParts([{ url: '/b.webm', duration_s: 45 }])).toEqual({ url: '/b.webm', duration_s: 45 });
    expect(fromParts([])).toBeUndefined();
  });

  it('the schema keeps cuts and later takes, and still reads a single clip', () => {
    expect(NarrationSchema.parse(two)).toEqual(two);
    expect(NarrationSchema.parse({ url: '/a.webm', duration_s: 10 })).toEqual({ url: '/a.webm', duration_s: 10 });
  });
});
