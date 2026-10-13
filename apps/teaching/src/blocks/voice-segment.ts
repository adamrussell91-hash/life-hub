/**
 * Cut matched quote pins into non-overlapping voice clips covering [0, duration].
 * Pure: no DOM.
 */
import type { AnnotationAnchor } from '@/schemas/block';
import type { VoiceWord } from '@/blocks/voice-transcript';
import type { VoicePin } from '@/blocks/voice-match';

export const MERGE_GAP_S = 1.5;
export const LEAD_IN_S = 0.15;

export type SegmentClip = {
  id: string;
  start_s: number;
  end_s: number;
  word_range: [number, number];
  anchor?: AnnotationAnchor;
  source: 'tap' | 'quote' | 'ai' | 'manual';
  confidence: number;
  approved: boolean;
  transcript_text: string;
  repeat_fallback?: boolean;
  tap_quote_disagree?: boolean;
};

function snapLeadIn(words: VoiceWord[], quoteStartS: number): { time: number; wordIndex: number } {
  const target = Math.max(0, quoteStartS - LEAD_IN_S);
  if (words.length === 0) return { time: target, wordIndex: 0 };
  let best = 0;
  for (let i = 0; i < words.length; i += 1) {
    if (words[i]!.start <= target) best = i;
    else break;
  }
  return { time: words[best]!.start, wordIndex: best };
}

function sameLine(a?: AnnotationAnchor, b?: AnnotationAnchor): boolean {
  if (!a || !b) return false;
  return a.stanza === b.stanza && a.line != null && a.line === b.line;
}

function mergePins(pins: VoicePin[], words: VoiceWord[]): VoicePin[] {
  if (pins.length === 0) return [];
  const ordered = pins.slice().sort((a, b) => a.word_start - b.word_start);
  const merged: VoicePin[] = [];
  for (const pin of ordered) {
    const prev = merged[merged.length - 1];
    if (!prev) {
      merged.push({ ...pin });
      continue;
    }
    const prevEnd = words[prev.word_end - 1]?.end ?? 0;
    const nextStart = words[pin.word_start]?.start ?? 0;
    const gap = nextStart - prevEnd;
    if (sameLine(prev.anchor, pin.anchor) && gap >= 0 && gap < MERGE_GAP_S) {
      prev.word_end = Math.max(prev.word_end, pin.word_end);
      prev.confidence = Math.min(prev.confidence, pin.confidence);
      if (pin.source === 'tap') {
        prev.source = 'tap';
        prev.confidence = 1;
        prev.anchor = pin.anchor;
      }
      if (pin.repeat_fallback) prev.repeat_fallback = true;
      if (pin.tap_quote_disagree) prev.tap_quote_disagree = true;
      prev.transcript_text = words
        .slice(prev.word_start, prev.word_end)
        .map((w) => w.w)
        .join(' ');
      continue;
    }
    merged.push({ ...pin });
  }
  return merged;
}

function clipId(index: number): string {
  return `clip_${index + 1}`;
}

type Cut = {
  start_s: number;
  word_start: number;
  pin: VoicePin | null;
};

/**
 * Build clips that never overlap and cover [0, duration] exactly once.
 * A quote clip runs from (quote start − 150 ms lead-in, snapped to a word edge)
 * to the next quote's lead-in (or duration for the last). Intro before the first
 * quote is a general comment with no anchor.
 */
export function segmentClips(input: {
  pins: VoicePin[];
  words: VoiceWord[];
  duration: number;
}): SegmentClip[] {
  const duration = Math.max(0, input.duration);
  const words = input.words;
  const pins = mergePins(input.pins, words);

  if (pins.length === 0) {
    return [
      {
        id: clipId(0),
        start_s: 0,
        end_s: duration,
        word_range: [0, words.length],
        source: 'manual',
        confidence: 1,
        approved: true,
        transcript_text: words.map((w) => w.w).join(' ').trim()
      }
    ];
  }

  const cuts: Cut[] = [];
  const firstQuoteStart = words[pins[0]!.word_start]?.start ?? 0;
  const firstSnap = snapLeadIn(words, firstQuoteStart);
  if (firstSnap.time > 1e-6) {
    cuts.push({ start_s: 0, word_start: 0, pin: null });
  }
  for (const pin of pins) {
    const quoteStart = words[pin.word_start]?.start ?? 0;
    const snap = snapLeadIn(words, quoteStart);
    if (cuts.length === 0) {
      cuts.push({ start_s: 0, word_start: 0, pin });
    } else {
      cuts.push({ start_s: snap.time, word_start: snap.wordIndex, pin });
    }
  }

  const clips: SegmentClip[] = [];
  for (let i = 0; i < cuts.length; i += 1) {
    const cut = cuts[i]!;
    const next = cuts[i + 1];
    const start_s = i === 0 ? 0 : cut.start_s;
    const end_s = next ? next.start_s : duration;
    const word_start = i === 0 ? 0 : cut.word_start;
    const word_end = next ? next.word_start : words.length;
    if (end_s < start_s) continue;
    const pin = cut.pin;
    clips.push({
      id: clipId(clips.length),
      start_s,
      end_s: i === cuts.length - 1 ? duration : end_s,
      word_range: [word_start, Math.max(word_start, word_end)],
      ...(pin?.anchor ? { anchor: pin.anchor } : {}),
      source: pin ? pin.source : 'manual',
      confidence: pin ? pin.confidence : 1,
      approved: true,
      transcript_text: words
        .slice(word_start, Math.max(word_start, word_end))
        .map((w) => w.w)
        .join(' ')
        .trim(),
      ...(pin?.repeat_fallback ? { repeat_fallback: true } : {}),
      ...(pin?.tap_quote_disagree ? { tap_quote_disagree: true } : {})
    });
  }

  if (clips.length === 0) {
    return [
      {
        id: clipId(0),
        start_s: 0,
        end_s: duration,
        word_range: [0, words.length],
        source: 'manual',
        confidence: 1,
        approved: true,
        transcript_text: words.map((w) => w.w).join(' ').trim()
      }
    ];
  }

  clips[0]!.start_s = 0;
  clips[clips.length - 1]!.end_s = duration;
  return clips.filter((clip, index) => clip.end_s > clip.start_s || clips.length === 1 || index === 0);
}

/** Coverage invariants: ordered, no overlap, union equals [0, duration]. */
export function assertClipCoverage(clips: SegmentClip[], duration: number): boolean {
  if (clips.length === 0) return duration === 0;
  if (Math.abs(clips[0]!.start_s - 0) > 1e-9) return false;
  if (Math.abs(clips[clips.length - 1]!.end_s - duration) > 1e-9) return false;
  for (let i = 0; i < clips.length; i += 1) {
    const clip = clips[i]!;
    if (clip.start_s > clip.end_s + 1e-9) return false;
    if (i > 0 && Math.abs(clips[i - 1]!.end_s - clip.start_s) > 1e-9) return false;
  }
  return true;
}
