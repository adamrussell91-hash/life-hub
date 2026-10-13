/**
 * Rule-based quote matching for annotation voice tracks.
 * Pure: no DOM, no network.
 */
import { buildAnchor, type AnnotationTextModel } from '@/blocks/annotation-anchor';
import type { AnnotationAnchor } from '@/schemas/block';
import type { VoiceWord } from '@/blocks/voice-transcript';

/** Pins below this confidence are returned in `unmatched` instead. */
export const LOW_CONFIDENCE = 0.55;

/** Minimum mean token similarity for a stretch to count as a quote match. */
export const MIN_STRETCH_SCORE = 0.62;

/** Default minimum matched tokens in a quote stretch. */
export const MIN_MATCH_TOKENS = 4;

/** Shorter verse lines may match with fewer tokens. */
export const MIN_MATCH_TOKENS_SHORT_LINE = 3;

/** A line with this many tokens or fewer is "short" for min-token purposes. */
export const SHORT_LINE_TOKEN_LIMIT = 6;

export type VoiceTap = {
  t: number;
  anchor: AnnotationAnchor;
};

export type VoicePin = {
  word_start: number;
  word_end: number;
  anchor: AnnotationAnchor;
  source: 'tap' | 'quote';
  confidence: number;
  repeat_fallback?: boolean;
  tap_quote_disagree?: boolean;
  transcript_text: string;
};

export type UnmatchedStretch = {
  word_start: number;
  word_end: number;
  confidence: number;
  transcript_text: string;
  reason: 'low_confidence' | 'no_match' | 'paraphrase';
};

export type MatchQuotesResult = {
  pins: VoicePin[];
  unmatched: UnmatchedStretch[];
};

type TextToken = {
  raw: string;
  norm: string;
  phonetic: string;
  stanzaId: string;
  lineId: string;
  start: number;
  end: number;
  lineTokenCount: number;
};

type TranscriptToken = {
  index: number;
  raw: string;
  norm: string;
  phonetic: string;
  start: number;
  end: number;
};

/** Lowercase, strip punctuation / curly quotes, fold dashes, collapse repeats. */
export function normaliseToken(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035']/g, '')
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036"]/g, '')
    .replace(/[\u2010-\u2015\u2212_]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .replace(/(.)\1{2,}/gu, '$1$1');
}

/** Cheap phonetic key for tie-breaks (consonant skeleton + soft g/j merge). */
export function phoneticKey(s: string): string {
  const norm = normaliseToken(s)
    .replace(/ph/g, 'f')
    .replace(/ugh/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/dg/g, 'j')
    .replace(/g(?=[eiy])/g, 'j');
  return norm.replace(/[aeiouy]/g, '').replace(/(.)\1+/g, '$1') || norm.slice(0, 1);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > 4) return Math.max(a.length, b.length);
  const prev = new Array<number>(b.length + 1);
  const cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = cur[j]!;
  }
  return prev[b.length]!;
}

function tokenSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  const dist = levenshtein(a, b);
  const denom = Math.max(a.length, b.length);
  let score = 1 - dist / denom;
  if (phoneticKey(a) === phoneticKey(b)) score = Math.min(1, score + 0.12);
  return score;
}

function tokenizeText(text: AnnotationTextModel): TextToken[] {
  const tokens: TextToken[] = [];
  for (const stanza of text.stanzas) {
    for (const line of stanza.lines) {
      const re = /[\p{L}\p{N}'’]+/gu;
      const lineToks: { raw: string; start: number; end: number }[] = [];
      let match: RegExpExecArray | null;
      while ((match = re.exec(line.text)) != null) {
        lineToks.push({ raw: match[0], start: match.index, end: match.index + match[0].length });
      }
      for (const tok of lineToks) {
        tokens.push({
          raw: tok.raw,
          norm: normaliseToken(tok.raw),
          phonetic: phoneticKey(tok.raw),
          stanzaId: stanza.id,
          lineId: line.id,
          start: tok.start,
          end: tok.end,
          lineTokenCount: lineToks.length
        });
      }
    }
  }
  return tokens.filter((t) => t.norm.length > 0);
}

function tokenizeTranscript(words: VoiceWord[]): TranscriptToken[] {
  return words
    .map((word, index) => ({
      index,
      raw: word.w,
      norm: normaliseToken(word.w),
      phonetic: phoneticKey(word.w),
      start: word.start,
      end: word.end
    }))
    .filter((t) => t.norm.length > 0);
}

function transcriptSliceText(words: VoiceWord[], start: number, end: number): string {
  return words
    .slice(start, end)
    .map((w) => w.w)
    .join(' ')
    .trim();
}

type Candidate = {
  textStart: number;
  textEnd: number;
  wordStart: number;
  wordEnd: number;
  matched: number;
  meanSimilarity: number;
  confidence: number;
};

function minTokensFor(textTokens: TextToken[], textStart: number, textEnd: number): number {
  let minLine = Infinity;
  for (let i = textStart; i < textEnd; i += 1) {
    minLine = Math.min(minLine, textTokens[i]!.lineTokenCount);
  }
  if (minLine <= SHORT_LINE_TOKEN_LIMIT) return MIN_MATCH_TOKENS_SHORT_LINE;
  return MIN_MATCH_TOKENS;
}

function expandFromSeed(
  textTokens: TextToken[],
  transcript: TranscriptToken[],
  textSeed: number,
  wordSeed: number
): Candidate | null {
  type Pair = { ti: number; wi: number; sim: number };
  const pairs: Pair[] = [];
  let ti = textSeed;
  let wi = wordSeed;

  const seedSim = tokenSimilarity(textTokens[ti]!.norm, transcript[wi]!.norm);
  if (seedSim < 0.7) return null;
  pairs.push({ ti, wi, sim: seedSim });

  ti = textSeed + 1;
  wi = wordSeed + 1;
  while (ti < textTokens.length && wi < transcript.length) {
    const direct = tokenSimilarity(textTokens[ti]!.norm, transcript[wi]!.norm);
    if (direct >= 0.7) {
      pairs.push({ ti, wi, sim: direct });
      ti += 1;
      wi += 1;
      continue;
    }
    const skipText =
      ti + 1 < textTokens.length
        ? tokenSimilarity(textTokens[ti + 1]!.norm, transcript[wi]!.norm)
        : 0;
    const skipWord =
      wi + 1 < transcript.length
        ? tokenSimilarity(textTokens[ti]!.norm, transcript[wi + 1]!.norm)
        : 0;
    if (skipText >= 0.72 && skipText >= skipWord) {
      ti += 1;
      continue;
    }
    if (skipWord >= 0.72) {
      wi += 1;
      continue;
    }
    if (textTokens[ti]!.norm.length <= 2) {
      ti += 1;
      continue;
    }
    if (transcript[wi]!.norm.length <= 2) {
      wi += 1;
      continue;
    }
    break;
  }

  ti = textSeed - 1;
  wi = wordSeed - 1;
  while (ti >= 0 && wi >= 0) {
    const direct = tokenSimilarity(textTokens[ti]!.norm, transcript[wi]!.norm);
    if (direct >= 0.7) {
      pairs.unshift({ ti, wi, sim: direct });
      ti -= 1;
      wi -= 1;
      continue;
    }
    const skipText =
      ti - 1 >= 0 ? tokenSimilarity(textTokens[ti - 1]!.norm, transcript[wi]!.norm) : 0;
    const skipWord =
      wi - 1 >= 0 ? tokenSimilarity(textTokens[ti]!.norm, transcript[wi - 1]!.norm) : 0;
    if (skipText >= 0.72 && skipText >= skipWord) {
      ti -= 1;
      continue;
    }
    if (skipWord >= 0.72) {
      wi -= 1;
      continue;
    }
    break;
  }

  if (pairs.length === 0) return null;
  const textStart = pairs[0]!.ti;
  const textEnd = pairs[pairs.length - 1]!.ti + 1;
  const wordStart = pairs[0]!.wi;
  const wordEnd = pairs[pairs.length - 1]!.wi + 1;
  const matched = pairs.filter((p) => p.sim >= 0.72).length;
  const meanSimilarity = pairs.reduce((s, p) => s + p.sim, 0) / pairs.length;
  const minTok = minTokensFor(textTokens, textStart, textEnd);
  if (matched < minTok || meanSimilarity < MIN_STRETCH_SCORE) return null;
  const confidence = (matched / pairs.length) * meanSimilarity;
  return {
    textStart,
    textEnd,
    wordStart,
    wordEnd,
    matched,
    meanSimilarity,
    confidence
  };
}

function buildNormIndex(textTokens: TextToken[]): Map<string, number[]> {
  const index = new Map<string, number[]>();
  for (let i = 0; i < textTokens.length; i += 1) {
    const norm = textTokens[i]!.norm;
    const list = index.get(norm);
    if (list) list.push(i);
    else index.set(norm, [i]);
    const phon = textTokens[i]!.phonetic;
    if (phon && phon !== norm) {
      const key = `~${phon}`;
      const plist = index.get(key);
      if (plist) plist.push(i);
      else index.set(key, [i]);
    }
  }
  return index;
}

function candidateSeeds(
  textTokens: TextToken[],
  transcript: TranscriptToken[],
  index: Map<string, number[]>
): Array<{ ti: number; wi: number }> {
  const seeds: Array<{ ti: number; wi: number }> = [];
  const seen = new Set<string>();
  for (let wi = 0; wi < transcript.length; wi += 1) {
    const tok = transcript[wi]!;
    const exact = index.get(tok.norm) ?? [];
    const phonetic = index.get(`~${tok.phonetic}`) ?? [];
    const pool = exact.length > 0 ? exact : phonetic;
    for (const ti of pool) {
      const sim = tokenSimilarity(textTokens[ti]!.norm, tok.norm);
      if (sim < 0.72) continue;
      const key = `${ti}:${wi}`;
      if (seen.has(key)) continue;
      seen.add(key);
      seeds.push({ ti, wi });
    }
  }
  if (textTokens.length <= 200) {
    for (let wi = 0; wi < transcript.length; wi += 1) {
      const tok = transcript[wi]!;
      if (tok.norm.length < 4) continue;
      for (let ti = 0; ti < textTokens.length; ti += 1) {
        if (textTokens[ti]!.norm[0] !== tok.norm[0]) continue;
        const sim = tokenSimilarity(textTokens[ti]!.norm, tok.norm);
        if (sim < 0.78) continue;
        const key = `${ti}:${wi}`;
        if (seen.has(key)) continue;
        seen.add(key);
        seeds.push({ ti, wi });
      }
    }
  }
  return seeds;
}

function anchorFromTextRange(
  text: AnnotationTextModel,
  textTokens: TextToken[],
  textStart: number,
  textEnd: number
): AnnotationAnchor | null {
  if (textStart >= textEnd) return null;
  const first = textTokens[textStart]!;
  const last = textTokens[textEnd - 1]!;
  if (first.stanzaId !== last.stanzaId) {
    return buildAnchor(text, { stanzaId: first.stanzaId, wholeStanza: true });
  }
  if (first.lineId !== last.lineId) {
    return buildAnchor(text, { stanzaId: first.stanzaId, lineId: first.lineId, wholeLine: true });
  }
  return buildAnchor(text, {
    stanzaId: first.stanzaId,
    lineId: first.lineId,
    start: first.start,
    end: last.end
  });
}

function anchorsOverlapDisagree(tap: AnnotationAnchor, quote: AnnotationAnchor): boolean {
  if (tap.stanza !== quote.stanza) return true;
  if (tap.line && quote.line && tap.line !== quote.line) return true;
  if (
    typeof tap.start === 'number' &&
    typeof tap.end === 'number' &&
    typeof quote.start === 'number' &&
    typeof quote.end === 'number'
  ) {
    return tap.end <= quote.start || quote.end <= tap.start;
  }
  return false;
}

/**
 * Match transcript quote stretches against the draft/poem text.
 * Prefers the next occurrence after the previous pin (top-to-bottom reading).
 * Taps win over quote matches when they disagree.
 */
export function matchQuotes(input: {
  text: AnnotationTextModel;
  words: VoiceWord[];
  taps?: VoiceTap[];
}): MatchQuotesResult {
  const textTokens = tokenizeText(input.text);
  const transcript = tokenizeTranscript(input.words);
  const pins: VoicePin[] = [];
  const unmatched: UnmatchedStretch[] = [];

  if (transcript.length === 0 || textTokens.length === 0) {
    return { pins, unmatched };
  }

  const index = buildNormIndex(textTokens);
  const seeds = candidateSeeds(textTokens, transcript, index);
  const candidates: Candidate[] = [];
  const candKeys = new Set<string>();
  for (const seed of seeds) {
    const expanded = expandFromSeed(textTokens, transcript, seed.ti, seed.wi);
    if (!expanded) continue;
    const key = `${expanded.wordStart}:${expanded.wordEnd}:${expanded.textStart}:${expanded.textEnd}`;
    if (candKeys.has(key)) continue;
    candKeys.add(key);
    candidates.push(expanded);
  }

  candidates.sort((a, b) => a.wordStart - b.wordStart || b.confidence - a.confidence);
  let cursorText = 0;
  let cursorWord = 0;
  const usedWord = new Array<boolean>(transcript.length).fill(false);

  for (const cand of candidates) {
    let overlaps = false;
    for (let i = cand.wordStart; i < cand.wordEnd; i += 1) {
      if (usedWord[i]) {
        overlaps = true;
        break;
      }
    }
    if (overlaps || cand.wordStart < cursorWord) continue;

    const sameSpan = candidates.filter(
      (c) => c.wordStart === cand.wordStart && c.wordEnd === cand.wordEnd
    );
    let chosen = sameSpan
      .filter((c) => c.textStart >= cursorText)
      .sort((a, b) => a.textStart - b.textStart || b.confidence - a.confidence)[0];
    let repeat_fallback = false;
    if (!chosen) {
      const anywhere = sameSpan.sort((a, b) => b.confidence - a.confidence)[0];
      if (!anywhere) continue;
      chosen = { ...anywhere, confidence: anywhere.confidence * 0.6 };
      repeat_fallback = true;
    }

    const anchor = anchorFromTextRange(input.text, textTokens, chosen.textStart, chosen.textEnd);
    if (!anchor) continue;

    const transcript_text = transcriptSliceText(input.words, chosen.wordStart, chosen.wordEnd);
    if (chosen.confidence < LOW_CONFIDENCE) {
      unmatched.push({
        word_start: chosen.wordStart,
        word_end: chosen.wordEnd,
        confidence: chosen.confidence,
        transcript_text,
        reason: 'low_confidence'
      });
    } else {
      pins.push({
        word_start: chosen.wordStart,
        word_end: chosen.wordEnd,
        anchor,
        source: 'quote',
        confidence: Math.min(1, chosen.confidence),
        ...(repeat_fallback ? { repeat_fallback: true } : {}),
        transcript_text
      });
      cursorText = chosen.textEnd;
    }
    for (let i = chosen.wordStart; i < chosen.wordEnd; i += 1) usedWord[i] = true;
    cursorWord = chosen.wordEnd;
  }

  const taps = (input.taps ?? []).slice().sort((a, b) => a.t - b.t);
  for (const tap of taps) {
    if (!(tap.t >= 0)) continue;
    let wordIndex = transcript.findIndex((tok) => tok.start <= tap.t && tap.t < tok.end);
    if (wordIndex < 0) {
      wordIndex = transcript.reduce(
        (best, tok, idx) =>
          Math.abs(tok.start - tap.t) < Math.abs(transcript[best]!.start - tap.t) ? idx : best,
        0
      );
    }
    const existing = pins.find((pin) => pin.word_start <= wordIndex && wordIndex < pin.word_end);
    if (existing) {
      const disagree = anchorsOverlapDisagree(tap.anchor, existing.anchor);
      existing.anchor = tap.anchor;
      existing.source = 'tap';
      existing.confidence = 1;
      if (disagree) existing.tap_quote_disagree = true;
      continue;
    }
    const word_start = wordIndex;
    const word_end = Math.min(transcript.length, wordIndex + 1);
    pins.push({
      word_start,
      word_end,
      anchor: tap.anchor,
      source: 'tap',
      confidence: 1,
      transcript_text: transcriptSliceText(input.words, word_start, word_end)
    });
  }

  pins.sort((a, b) => a.word_start - b.word_start);

  let i = 0;
  while (i < transcript.length) {
    if (usedWord[i] || pins.some((p) => p.word_start <= i && i < p.word_end)) {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (
      j < transcript.length &&
      !usedWord[j] &&
      !pins.some((p) => p.word_start <= j && j < p.word_end)
    ) {
      j += 1;
    }
    if (j - i >= MIN_MATCH_TOKENS_SHORT_LINE) {
      unmatched.push({
        word_start: i,
        word_end: j,
        confidence: 0,
        transcript_text: transcriptSliceText(input.words, i, j),
        reason: 'paraphrase'
      });
    }
    i = j;
  }

  unmatched.sort((a, b) => a.word_start - b.word_start);
  return { pins, unmatched };
}
