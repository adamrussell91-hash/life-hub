export type ClozeBlank = { answer: string; hint?: string };
export type ClozeSegment =
  | { type: 'text'; value: string }
  | { type: 'blank'; blank: ClozeBlank; index: number };

const CLOZE_MARKER = /\[\[([^\]]+)\]\]/g;

/** Markers: [[answer]] or [[answer|hint]] — first | separates hint. */
export function parseClozeText(text: string): { segments: ClozeSegment[]; blanks: ClozeBlank[] } {
  const segments: ClozeSegment[] = [];
  const blanks: ClozeBlank[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const re = new RegExp(CLOZE_MARKER.source, 'g');
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }

    const inner = match[1]!;
    const pipeIndex = inner.indexOf('|');
    const blank: ClozeBlank =
      pipeIndex === -1
        ? { answer: inner }
        : { answer: inner.slice(0, pipeIndex), hint: inner.slice(pipeIndex + 1) };

    const index = blanks.length;
    blanks.push(blank);
    segments.push({ type: 'blank', blank, index });
    lastIndex = re.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  } else if (segments.length === 0) {
    segments.push({ type: 'text', value: text });
  }

  return { segments, blanks };
}

export function shuffleArray<T>(items: T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export function storageKey(lessonId: string, blockId: string): string {
  return `teaching-hub.activity.${lessonId}.${blockId}`;
}

export function loadActivityState<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function saveActivityState(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage may be unavailable (private mode, quota); activity state is
    // a convenience, not critical, so failures are silently ignored.
  }
}
