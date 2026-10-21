import { parseWhisperTimings, type VoiceWord, type WhisperTimingKind } from '@/blocks/voice-transcript';

/**
 * Pure helpers for marking a Voice submission: the transcript as text with
 * each word's character range (so the peer feedback "paper" can draw it),
 * where a tap lands, and which words are probably fillers. No DOM.
 */

export type TranscriptWords = { words: VoiceWord[]; timing: WhisperTimingKind };

export function transcriptWords(raw: unknown, duration_s: number): TranscriptWords {
  if (!raw) return { words: [], timing: 'estimated' };
  return parseWhisperTimings(raw, { duration_s });
}

export type Paper = {
  text: string;
  /** Character range of each word in `text`. */
  ranges: Array<{ start: number; end: number }>;
  /** Index of the first word of each dot point, aligned with `points`. */
  pointStarts: number[];
};

/** The first word starting at or after `t`, or the last word. */
export function firstWordFrom(words: readonly VoiceWord[], t: number): number {
  const i = words.findIndex((w) => w.start >= t - 0.05);
  return i === -1 ? Math.max(0, words.length - 1) : i;
}

/**
 * Words joined with spaces; a new paragraph at each dot point after the first,
 * so the transcript reads in the student's own sections.
 */
export function buildPaper(words: readonly VoiceWord[], points: ReadonlyArray<{ t: number }> = []): Paper {
  const breaks = new Set(points.slice(1).map((p) => firstWordFrom(words, p.t)).filter((i) => i > 0));
  let text = '';
  const ranges: Paper['ranges'] = [];
  words.forEach((word, i) => {
    if (i > 0) text += breaks.has(i) ? '\n' : ' ';
    const start = text.length;
    text += word.w;
    ranges.push({ start, end: text.length });
  });
  const pointStarts = points.map((p, i) => (i === 0 ? 0 : firstWordFrom(words, p.t)));
  return { text, ranges, pointStarts };
}

/** Index of the word being spoken at `t` (or the nearest one), -1 when there are no words. */
export function wordAt(words: readonly VoiceWord[], t: number): number {
  if (words.length === 0) return -1;
  let best = 0;
  let bestGap = Infinity;
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    if (t >= w.start && t <= w.end) return i;
    const gap = t < w.start ? w.start - t : t - w.end;
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  }
  return best;
}

export const DEFAULT_REACTION_S = 1;

/** Where a tap at media time `t` lands: `reaction` seconds earlier, snapped to a word. */
export function tapTarget(words: readonly VoiceWord[], t: number, reaction = DEFAULT_REACTION_S): { t: number; word: number } {
  const at = Math.max(0, t - Math.max(0, reaction));
  return { t: at, word: wordAt(words, at) };
}

/** Which dot point (0-based) a moment falls in; -1 when the take had no points. */
export function pointIndexAt(points: ReadonlyArray<{ t: number }>, t: number): number {
  let index = -1;
  points.forEach((p, i) => {
    if (t >= p.t) index = i;
  });
  return points.length ? Math.max(0, index) : -1;
}

const SINGLE_FILLERS = new Set(['um', 'umm', 'uh', 'uhh', 'er', 'erm', 'ah', 'hmm', 'mm', 'like', 'basically', 'literally']);
const PAIR_FILLERS = new Set(['you know', 'sort of', 'kind of', 'i mean']);

const bare = (w: string) => w.toLowerCase().replace(/[^a-z']/g, '');

/**
 * Likely fillers as word ranges. "like" only counts when it isn't doing a job
 * ("like a", "looks like", "is like" stay; "um, like," counts). These are only
 * suggestions: the teacher confirms or drops each one.
 */
export function fillerSuggestions(words: readonly VoiceWord[]): Array<{ w: [number, number]; word: string }> {
  const out: Array<{ w: [number, number]; word: string }> = [];
  for (let i = 0; i < words.length; i++) {
    const word = bare(words[i]!.w);
    const next = words[i + 1] ? bare(words[i + 1]!.w) : '';
    if (next && PAIR_FILLERS.has(`${word} ${next}`)) {
      if (word === 'kind' || word === 'sort') {
        // "a kind of irony" is not a filler; "it's sort of, you know" is.
        const before = i > 0 ? bare(words[i - 1]!.w) : '';
        if (before === 'a' || before === 'the' || before === 'this' || before === 'that') continue;
      }
      out.push({ w: [i, i + 1], word: `${word} ${next}` });
      i += 1;
      continue;
    }
    if (!SINGLE_FILLERS.has(word)) continue;
    if (word === 'like') {
      // "looks like", "like a storm" do a job; "so, like," and "um like" don't.
      const before = i > 0 ? bare(words[i - 1]!.w) : '';
      const paused = i === 0 || /[,.…?!]$/.test(words[i - 1]!.w) || /[,…]$/.test(words[i]!.w);
      if (!paused && !['um', 'uh', 'so', 'and', 'but'].includes(before)) continue;
    }
    if ((word === 'basically' || word === 'literally') && !/[,]$/.test(words[i]!.w) && i > 0) continue;
    out.push({ w: [i, i], word });
  }
  return out;
}

/** The filler word heard most, for "FW ×6 (mostly “like”)". */
export function commonestFiller(words: readonly VoiceWord[], ranges: ReadonlyArray<[number, number]>): string | null {
  const counts = new Map<string, number>();
  for (const [a, b] of ranges) {
    const text = words
      .slice(a, b + 1)
      .map((w) => bare(w.w))
      .join(' ');
    if (text) counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  let best: string | null = null;
  let most = 1;
  for (const [text, n] of counts) {
    if (n > most) {
      best = text;
      most = n;
    }
  }
  return best;
}
