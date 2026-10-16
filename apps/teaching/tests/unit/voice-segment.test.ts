import { describe, expect, it } from 'vitest';
import type { VoicePin } from '@/blocks/voice-match';
import { assertClipCoverage, clipsFromTaps, segmentClips } from '@/blocks/voice-segment';
import type { VoiceWord } from '@/blocks/voice-transcript';

function wordsFrom(tokens: string[], step = 0.5): VoiceWord[] {
  return tokens.map((w, i) => ({
    w,
    start: i * step,
    end: (i + 1) * step
  }));
}

function pin(
  word_start: number,
  word_end: number,
  line = 'line_1',
  overrides: Partial<VoicePin> = {}
): VoicePin {
  return {
    word_start,
    word_end,
    anchor: {
      granularity: 'phrase',
      stanza: 'stanza_1',
      line,
      start: 0,
      end: 4,
      quote: { exact: 'Bent' }
    },
    source: 'quote',
    confidence: 0.9,
    transcript_text: 'Bent',
    ...overrides
  };
}

describe('segmentClips', () => {
  it('covers [0, duration] with no gaps or overlaps for a single pin', () => {
    const words = wordsFrom(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    const clips = segmentClips({
      pins: [pin(2, 4)],
      words,
      duration: 4
    });
    expect(assertClipCoverage(clips, 4)).toBe(true);
    expect(clips[0]!.start_s).toBe(0);
    expect(clips[clips.length - 1]!.end_s).toBe(4);
  });

  it('inserts a general intro before the first quote', () => {
    const words = wordsFrom(['um', 'so', 'Bent', 'double', 'like', 'old']);
    const clips = segmentClips({
      pins: [pin(2, 6)],
      words,
      duration: 3
    });
    expect(assertClipCoverage(clips, 3)).toBe(true);
    expect(clips[0]!.anchor).toBeUndefined();
    expect(clips.some((c) => c.anchor)).toBe(true);
  });

  it('merges same-line stretches under 1.5s', () => {
    const words = wordsFrom(['Bent', 'double', 'like', 'old', 'beggars', 'under'], 0.4);
    const clips = segmentClips({
      pins: [pin(0, 2), pin(3, 5)],
      words,
      duration: 2.4
    });
    expect(assertClipCoverage(clips, 2.4)).toBe(true);
    const anchored = clips.filter((c) => c.anchor);
    expect(anchored.length).toBe(1);
  });

  it('returns one general clip when there are no pins', () => {
    const words = wordsFrom(['hello', 'there']);
    const clips = segmentClips({ pins: [], words, duration: 1 });
    expect(clips).toHaveLength(1);
    expect(clips[0]!.anchor).toBeUndefined();
    expect(assertClipCoverage(clips, 1)).toBe(true);
  });

  it('holds coverage invariants for random pin sets (property-style)', () => {
    const tokens = Array.from({ length: 40 }, (_, i) => `w${i}`);
    const words = wordsFrom(tokens, 0.25);
    const duration = 10;
    for (let trial = 0; trial < 25; trial += 1) {
      const pinCount = trial % 5;
      const pins: VoicePin[] = [];
      let cursor = 0;
      for (let p = 0; p < pinCount; p += 1) {
        const start = cursor + (trial + p) % 3;
        const end = Math.min(words.length, start + 2 + ((trial + p) % 3));
        if (start >= words.length - 1) break;
        pins.push(pin(start, end, `line_${(p % 3) + 1}`));
        cursor = end + 1;
      }
      const clips = segmentClips({ pins, words, duration });
      expect(assertClipCoverage(clips, duration)).toBe(true);
    }
  });
});

describe('clipsFromTaps', () => {
  const anchor = (line: number) => ({ stanza: 's1', line, quote: { exact: `line ${line}` } }) as never;

  it('each tap starts a clip pinned to its line, covering the whole recording', () => {
    const clips = clipsFromTaps({
      taps: [
        { t: 10, anchor: anchor(2) },
        { t: 4, anchor: anchor(1) }
      ],
      duration: 20
    });
    expect(clips.map((c) => [c.source, c.start_s, c.end_s])).toEqual([
      ['manual', 0, 3.85],
      ['tap', 3.85, 9.85],
      ['tap', 9.85, 20]
    ]);
    expect(clips[1]!.anchor).toEqual(anchor(1));
    expect(clips.every((c) => c.approved)).toBe(true);
    expect(assertClipCoverage(clips, 20)).toBe(true);
  });

  it('a tap in the first moments absorbs the opening', () => {
    const clips = clipsFromTaps({ taps: [{ t: 0.5, anchor: anchor(1) }], duration: 8 });
    expect(clips).toHaveLength(1);
    expect(clips[0]).toMatchObject({ start_s: 0, end_s: 8, source: 'tap' });
  });

  it('no taps leaves one general clip', () => {
    expect(clipsFromTaps({ taps: [], duration: 5 })).toHaveLength(1);
  });
});
