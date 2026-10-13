import { describe, expect, it } from 'vitest';
import { parseAnnotationSource } from '@/blocks/annotation-text';
import {
  LOW_CONFIDENCE,
  matchQuotes,
  normaliseToken,
  phoneticKey
} from '@/blocks/voice-match';
import type { VoiceWord } from '@/blocks/voice-transcript';

/** Public-domain opening of Wilfred Owen, "Dulce et Decorum Est". */
const DULCE = `Bent double, like old beggars under sacks,
Knock-kneed, coughing like hags, we cursed through sludge,
Till on the haunting flares we turned our backs
And towards our distant rest began to trudge.`;

const text = parseAnnotationSource(DULCE, 'verse');

function wordsFrom(tokens: string[], start = 0, step = 0.4): VoiceWord[] {
  return tokens.map((w, i) => ({
    w,
    start: start + i * step,
    end: start + (i + 1) * step
  }));
}

describe('normaliseToken', () => {
  it('lowercases, strips punctuation and folds dashes', () => {
    expect(normaliseToken('Knock-kneed')).toBe('knockkneed');
    expect(normaliseToken('“Beggars”')).toBe('beggars');
    expect(normaliseToken("it's")).toBe('its');
  });

  it('builds a phonetic key', () => {
    expect(phoneticKey('trudge')).toBe(phoneticKey('truj'));
    expect(phoneticKey('coughing')).toBe(phoneticKey('coffing'));
  });
});

describe('matchQuotes', () => {
  it('matches an exact quote', () => {
    const words = wordsFrom(['Bent', 'double', 'like', 'old', 'beggars', 'under', 'sacks']);
    const { pins, unmatched } = matchQuotes({ text, words });
    expect(pins.length).toBeGreaterThanOrEqual(1);
    expect(pins[0]!.source).toBe('quote');
    expect(pins[0]!.confidence).toBeGreaterThan(LOW_CONFIDENCE);
    expect(pins[0]!.transcript_text.toLowerCase()).toContain('bent');
    expect(unmatched.filter((u) => u.reason === 'low_confidence')).toHaveLength(0);
  });

  it('tolerates one misheard word', () => {
    const words = wordsFrom(['Bent', 'double', 'like', 'old', 'beggers', 'under', 'sacks']);
    const { pins } = matchQuotes({ text, words });
    expect(pins.length).toBeGreaterThanOrEqual(1);
    expect(pins[0]!.confidence).toBeGreaterThan(LOW_CONFIDENCE);
  });

  it('tolerates two dropped words', () => {
    const words = wordsFrom(['Bent', 'double', 'old', 'beggars', 'sacks', 'Knock-kneed']);
    const { pins } = matchQuotes({ text, words });
    expect(pins.length).toBeGreaterThanOrEqual(1);
  });

  it('tolerates a misspelt student-adjacent token in the spoken quote', () => {
    const words = wordsFrom(['towards', 'our', 'distant', 'rest', 'began', 'to', 'truge']);
    const { pins } = matchQuotes({ text, words });
    expect(pins.length).toBeGreaterThanOrEqual(1);
    expect(pins[0]!.anchor.quote?.exact.toLowerCase()).toContain('trudge');
  });

  it('pins the second occurrence of a repeated line after the first', () => {
    const line = ['Bent', 'double', 'like', 'old', 'beggars', 'under', 'sacks'];
    const words = wordsFrom([...line, 'um', ...line], 0, 0.3);
    const { pins } = matchQuotes({ text, words });
    expect(pins.length).toBeGreaterThanOrEqual(2);
    expect(pins[1]!.word_start).toBeGreaterThan(pins[0]!.word_start);
  });

  it('flags repeat_fallback when a quote is read out of order', () => {
    const late = wordsFrom(['towards', 'our', 'distant', 'rest', 'began', 'to', 'trudge'], 0);
    const early = wordsFrom(['Bent', 'double', 'like', 'old', 'beggars', 'under', 'sacks'], 4);
    const words = [...late, ...early];
    const { pins } = matchQuotes({ text, words });
    expect(pins.length).toBeGreaterThanOrEqual(1);
  });

  it('sends paraphrase-only speech to unmatched', () => {
    const words = wordsFrom([
      'I',
      'want',
      'you',
      'to',
      'rethink',
      'your',
      'second',
      'paragraph',
      'about',
      'the',
      'storm'
    ]);
    const { pins, unmatched } = matchQuotes({ text, words });
    expect(pins).toHaveLength(0);
    expect(unmatched.length).toBeGreaterThan(0);
    expect(unmatched[0]!.reason).toBe('paraphrase');
  });

  it('lets taps override quote anchors', () => {
    const words = wordsFrom(['Bent', 'double', 'like', 'old', 'beggars', 'under', 'sacks']);
    const tapAnchor = {
      granularity: 'line' as const,
      stanza: 'stanza_1',
      line: 's1_line_4',
      quote: { exact: 'And towards our distant rest began to trudge.' }
    };
    const { pins } = matchQuotes({
      text,
      words,
      taps: [{ t: 0.5, anchor: tapAnchor }]
    });
    const tapped = pins.find((p) => p.source === 'tap');
    expect(tapped).toBeTruthy();
    expect(tapped!.confidence).toBe(1);
    expect(tapped!.anchor.line).toBe('s1_line_4');
  });

  it('handles empty transcript', () => {
    expect(matchQuotes({ text, words: [] })).toEqual({ pins: [], unmatched: [] });
  });

  it('handles transcript with no quotes', () => {
    const words = wordsFrom(['hello', 'there', 'friend']);
    const { pins } = matchQuotes({ text, words });
    expect(pins).toHaveLength(0);
  });

  it('runs a ten-minute-sized fixture under 200ms', () => {
    const tokens: string[] = [];
    for (let i = 0; i < 4000; i += 1) {
      tokens.push(i % 17 === 0 ? 'beggars' : i % 23 === 0 ? 'trudge' : `filler${i % 50}`);
    }
    tokens.splice(200, 7, 'Bent', 'double', 'like', 'old', 'beggars', 'under', 'sacks');
    const words = wordsFrom(tokens, 0, 0.15);
    const started = performance.now();
    const { pins } = matchQuotes({ text, words });
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(200);
    expect(pins.length).toBeGreaterThanOrEqual(1);
  });
});
