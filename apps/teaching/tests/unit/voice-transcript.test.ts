import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  distributeWordTimes,
  parseWhisperTimings
} from '@/blocks/voice-transcript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/whisper-timings-sample.json'), 'utf-8')
) as {
  sample_with_words: unknown;
  sample_segments_only: unknown;
};

describe('distributeWordTimes', () => {
  it('spreads words in proportion to character length', () => {
    const words = distributeWordTimes({
      text: 'aa bbbb',
      start: 0,
      end: 6
    });
    expect(words).toHaveLength(2);
    expect(words[0]!.w).toBe('aa');
    expect(words[1]!.w).toBe('bbbb');
    expect(words[0]!.start).toBe(0);
    expect(words[0]!.end).toBeCloseTo(2, 5);
    expect(words[1]!.start).toBeCloseTo(2, 5);
    expect(words[1]!.end).toBe(6);
  });
});

describe('parseWhisperTimings', () => {
  it('reads word-level timings from the sample fixture', () => {
    const result = parseWhisperTimings(fixture.sample_with_words);
    expect(result.timing).toBe('word');
    expect(result.words.map((w) => w.w)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
    expect(result.words[0]).toMatchObject({ start: 0, end: 0.4 });
    expect(result.words[3]).toMatchObject({ start: 1.5, end: 2.0 });
  });

  it('distributes segment-only timings', () => {
    const result = parseWhisperTimings(fixture.sample_segments_only);
    expect(result.timing).toBe('segment');
    expect(result.words.map((w) => w.w)).toEqual(['echo', 'foxtrot', 'golf', 'hotel']);
    expect(result.words[0]!.start).toBe(0);
    expect(result.words[1]!.end).toBeCloseTo(1.5, 5);
    expect(result.words[3]!.end).toBeCloseTo(3.0, 5);
  });

  it('returns estimated timings from plain text when no segments exist', () => {
    const result = parseWhisperTimings({ text: 'one two three' }, { duration_s: 3 });
    expect(result.timing).toBe('estimated');
    expect(result.words).toHaveLength(3);
    expect(result.words[0]!.start).toBe(0);
    expect(result.words[2]!.end).toBe(3);
  });

  it('handles empty results', () => {
    expect(parseWhisperTimings({})).toEqual({ words: [], timing: 'estimated' });
    expect(parseWhisperTimings(null)).toEqual({ words: [], timing: 'estimated' });
    expect(parseWhisperTimings({ text: '' })).toEqual({ words: [], timing: 'estimated' });
  });

  it('still yields words for non-English garbage text', () => {
    const result = parseWhisperTimings({ text: '@@@ ### !!!' }, { duration_s: 1 });
    expect(result.timing).toBe('estimated');
    expect(result.words.length).toBeGreaterThanOrEqual(1);
  });

  it('fills a missing end from the next word start', () => {
    const result = parseWhisperTimings({
      words: [
        { word: 'alpha', start: 0.0 },
        { word: 'bravo', start: 0.5, end: 1.0 }
      ]
    });
    expect(result.timing).toBe('word');
    expect(result.words[0]).toMatchObject({ w: 'alpha', start: 0, end: 0.5 });
    expect(result.words[1]).toMatchObject({ w: 'bravo', start: 0.5, end: 1.0 });
  });
});
