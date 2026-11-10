/**
 * Words of an explainer's text. Marks and the pointer are stored as word
 * anchors, never pixels, so they land on the same words at any width.
 * Pure: no DOM.
 */
import { buildAnchor, resolveAnchor, type AnnotationTextModel } from '@/blocks/annotation-anchor';
import type { AnnotationAnchor } from '@/schemas/block';

export type Word = {
  /** Index across the whole text. */
  i: number;
  stanza: string;
  line: string;
  /** Character offsets into the line text (end exclusive). */
  start: number;
  end: number;
  w: string;
};

const WORD = /[\p{L}\p{N}'’]+(?:[-‐][\p{L}\p{N}'’]+)*/gu;

export function tokenise(text: AnnotationTextModel | undefined): Word[] {
  const out: Word[] = [];
  if (!text) return out;
  for (const stanza of text.stanzas) {
    for (const line of stanza.lines) {
      for (const m of line.text.matchAll(WORD)) {
        const start = m.index ?? 0;
        out.push({ i: out.length, stanza: stanza.id, line: line.id, start, end: start + m[0].length, w: m[0] });
      }
    }
  }
  return out;
}

/**
 * An anchor over words a..b (either order). An anchor sits in one line, so a
 * span that runs into the next line stops at the end of the first word's line.
 */
export function anchorFromWords(
  text: AnnotationTextModel,
  a: number,
  b: number,
  words: Word[] = tokenise(text)
): AnnotationAnchor | null {
  const lo = Math.max(0, Math.min(a, b));
  let hi = Math.min(words.length - 1, Math.max(a, b));
  const first = words[lo];
  if (!first || hi < lo) return null;
  while (hi > lo && words[hi]!.line !== first.line) hi -= 1;
  const last = words[hi]!;
  return buildAnchor(text, { stanzaId: first.stanza, lineId: first.line, start: first.start, end: last.end });
}

/** The words an anchor covers, as an inclusive [first, last] range, or null when it no longer resolves. */
export function wordsOfAnchor(
  text: AnnotationTextModel,
  anchor: AnnotationAnchor,
  words: Word[] = tokenise(text)
): [number, number] | null {
  const r = resolveAnchor(text, anchor);
  if (r.status !== 'ok') return null;
  let hit: Word[];
  if (r.granularity === 'stanza') hit = words.filter((w) => w.stanza === r.stanzaId);
  else if (r.granularity === 'line' || r.start == null || r.end == null) hit = words.filter((w) => w.stanza === r.stanzaId && w.line === r.lineId);
  else {
    const s = r.start;
    const e = r.end;
    hit = words.filter((w) => w.stanza === r.stanzaId && w.line === r.lineId && w.end > s && w.start < e);
  }
  if (hit.length === 0) return null;
  return [hit[0]!.i, hit[hit.length - 1]!.i];
}

/** The quoted words of an anchor, for timeline rows and search. */
export function anchorWords(anchor: AnnotationAnchor): string {
  return anchor.quote.exact.replace(/\s+/g, ' ').trim();
}
