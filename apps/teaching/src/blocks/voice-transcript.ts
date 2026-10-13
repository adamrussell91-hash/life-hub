/** Pure Whisper timing helpers for annotation voice tracks. No DOM. */

export type VoiceWord = {
  w: string;
  start: number;
  end: number;
};

export type WhisperTimingKind = 'word' | 'segment' | 'estimated';

export type WhisperTimings = {
  words: VoiceWord[];
  timing: WhisperTimingKind;
};

type RawWord = {
  word?: unknown;
  w?: unknown;
  text?: unknown;
  start?: unknown;
  end?: unknown;
};

type RawSegment = {
  text?: unknown;
  start?: unknown;
  end?: unknown;
  words?: unknown;
};

function asFinite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function wordText(raw: RawWord): string {
  if (typeof raw.word === 'string') return raw.word.trim();
  if (typeof raw.w === 'string') return raw.w.trim();
  if (typeof raw.text === 'string') return raw.text.trim();
  return '';
}

function coerceWord(raw: RawWord, fallbackEnd: number): VoiceWord | null {
  const w = wordText(raw);
  if (!w) return null;
  const start = asFinite(raw.start) ?? 0;
  let end = asFinite(raw.end);
  if (end == null || end < start) end = Math.max(start, fallbackEnd);
  return { w, start, end };
}

function splitSegmentWords(text: string): string[] {
  return text
    .trim()
    .split(/\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Spread a segment's words across [start, end] in proportion to character length.
 * Used when Whisper returns segment timings but no per-word times.
 */
export function distributeWordTimes(segment: {
  text: string;
  start: number;
  end: number;
}): VoiceWord[] {
  const start = Number.isFinite(segment.start) ? segment.start : 0;
  const end = Number.isFinite(segment.end) && segment.end >= start ? segment.end : start;
  const parts = splitSegmentWords(segment.text ?? '');
  if (parts.length === 0) return [];
  if (end <= start) {
    return parts.map((w) => ({ w, start, end: start }));
  }

  const weights = parts.map((w) => Math.max(1, w.replace(/[^\p{L}\p{N}]/gu, '').length || w.length));
  const total = weights.reduce((sum, n) => sum + n, 0);
  const span = end - start;
  const words: VoiceWord[] = [];
  let cursor = start;
  for (let i = 0; i < parts.length; i += 1) {
    const share = (weights[i]! / total) * span;
    const wordEnd = i === parts.length - 1 ? end : cursor + share;
    words.push({ w: parts[i]!, start: cursor, end: wordEnd });
    cursor = wordEnd;
  }
  return words;
}

function readTopLevelWords(raw: Record<string, unknown>): VoiceWord[] | null {
  if (!Array.isArray(raw.words) || raw.words.length === 0) return null;
  const out: VoiceWord[] = [];
  for (let i = 0; i < raw.words.length; i += 1) {
    const item = raw.words[i];
    if (!item || typeof item !== 'object') continue;
    const next = raw.words[i + 1];
    const fallbackEnd =
      next && typeof next === 'object' ? (asFinite((next as RawWord).start) ?? 0) : 0;
    const word = coerceWord(item as RawWord, fallbackEnd);
    if (word) out.push(word);
  }
  return out.length > 0 ? out : null;
}

function readSegmentWords(segments: RawSegment[]): VoiceWord[] | null {
  const out: VoiceWord[] = [];
  let sawWordTimes = false;
  for (const segment of segments) {
    if (Array.isArray(segment.words) && segment.words.length > 0) {
      sawWordTimes = true;
      for (let i = 0; i < segment.words.length; i += 1) {
        const item = segment.words[i];
        if (!item || typeof item !== 'object') continue;
        const next = segment.words[i + 1];
        const fallbackEnd =
          next && typeof next === 'object'
            ? (asFinite((next as RawWord).start) ?? asFinite(segment.end) ?? 0)
            : (asFinite(segment.end) ?? 0);
        const word = coerceWord(item as RawWord, fallbackEnd);
        if (word) out.push(word);
      }
      continue;
    }
    const text = typeof segment.text === 'string' ? segment.text : '';
    const start = asFinite(segment.start) ?? 0;
    const end = asFinite(segment.end) ?? start;
    out.push(...distributeWordTimes({ text, start, end }));
  }
  if (out.length === 0) return null;
  return sawWordTimes ? out : out;
}

function estimatedFromText(text: string, duration_s: number): VoiceWord[] {
  const parts = splitSegmentWords(text);
  if (parts.length === 0) return [];
  const end = Math.max(0, duration_s);
  return distributeWordTimes({ text: parts.join(' '), start: 0, end });
}

/**
 * Normalise a Whisper JSON payload into word timings.
 * Prefers word-level times, then segment distribution, then even estimate over duration.
 */
export function parseWhisperTimings(
  raw: unknown,
  options: { duration_s?: number } = {}
): WhisperTimings {
  const duration_s =
    typeof options.duration_s === 'number' && Number.isFinite(options.duration_s)
      ? Math.max(0, options.duration_s)
      : 0;

  if (typeof raw === 'string') {
    const words = estimatedFromText(raw, duration_s);
    return { words, timing: 'estimated' };
  }
  if (!raw || typeof raw !== 'object') {
    return { words: [], timing: 'estimated' };
  }

  const record = raw as Record<string, unknown>;
  const topWords = readTopLevelWords(record);
  if (topWords) return { words: topWords, timing: 'word' };

  const segments = Array.isArray(record.segments)
    ? (record.segments.filter((s) => s && typeof s === 'object') as RawSegment[])
    : [];

  if (segments.length > 0) {
    const hasNestedWords = segments.some(
      (segment) => Array.isArray(segment.words) && segment.words.length > 0
    );
    const words = readSegmentWords(segments) ?? [];
    if (words.length > 0) {
      return { words, timing: hasNestedWords ? 'word' : 'segment' };
    }
  }

  const text =
    typeof record.text === 'string'
      ? record.text
      : typeof (record.transcription as { text?: unknown } | undefined)?.text === 'string'
        ? ((record.transcription as { text: string }).text)
        : '';
  const infoDuration = asFinite(
    (record.transcription_info as { duration?: unknown } | undefined)?.duration
  );
  const words = estimatedFromText(text, infoDuration ?? duration_s);
  return { words, timing: 'estimated' };
}
