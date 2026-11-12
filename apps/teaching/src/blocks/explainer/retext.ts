/**
 * Editing the text after recording. Marks, notes and the pointer were made on
 * words, so when the text changes each one moves to the same word in the new
 * text: words are matched old → new, and every anchor and pointer sample is
 * rebuilt from the match. Pure: no DOM.
 */
import { buildAnchor, type AnnotationTextModel } from '@/blocks/annotation-anchor';
import type { ExplainerEvent, ExplainerRecording } from '@/schemas/block';
import { anchorFromWords, tokenise, wordsOfAnchor, type Word } from './words';

/** Above this many cells the middle of a big rewrite is left unmatched. */
const MAX_CELLS = 4_000_000;

/** For each old word, its index in the new text, or -1 when it was removed. */
export function matchWords(oldWords: Word[], newWords: Word[]): number[] {
  const map = new Array<number>(oldWords.length).fill(-1);
  let pre = 0;
  while (pre < oldWords.length && pre < newWords.length && oldWords[pre]!.w === newWords[pre]!.w) {
    map[pre] = pre;
    pre += 1;
  }
  let suf = 0;
  while (
    suf < oldWords.length - pre &&
    suf < newWords.length - pre &&
    oldWords[oldWords.length - 1 - suf]!.w === newWords[newWords.length - 1 - suf]!.w
  ) {
    map[oldWords.length - 1 - suf] = newWords.length - 1 - suf;
    suf += 1;
  }
  const a = oldWords.slice(pre, oldWords.length - suf);
  const b = newWords.slice(pre, newWords.length - suf);
  if (a.length === 0 || b.length === 0 || a.length * b.length > MAX_CELLS) return map;
  // Longest common run of words through the changed middle.
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i]![j] = a[i]!.w === b[j]!.w ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i]!.w === b[j]!.w) {
      map[pre + i] = pre + j;
      i += 1;
      j += 1;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i += 1;
    else j += 1;
  }
  return map;
}

/** The new index of an old word, or of its nearest kept neighbour. */
function nearest(map: number[], i: number): number {
  if (map[i] !== undefined && map[i]! >= 0) return map[i]!;
  for (let d = 1; d < map.length; d += 1) {
    if (map[i + d] !== undefined && map[i + d]! >= 0) return map[i + d]!;
    if (map[i - d] !== undefined && map[i - d]! >= 0) return map[i - d]!;
  }
  return -1;
}

/**
 * The recording with every anchor and text-pointer sample moved onto the new
 * text. A mark whose words were all deleted keeps its old anchor (it no longer
 * shows, as before).
 */
export function retextRecording(
  rec: ExplainerRecording,
  oldText: AnnotationTextModel | undefined,
  newText: AnnotationTextModel | undefined
): ExplainerRecording {
  if (!oldText || !newText) return rec;
  const oldWords = tokenise(oldText);
  const newWords = tokenise(newText);
  if (oldWords.length === 0 || newWords.length === 0) return rec;
  const map = matchWords(oldWords, newWords);
  if (map.every((v, i) => v === i) && oldWords.length === newWords.length && JSON.stringify(oldText) === JSON.stringify(newText)) return rec;

  const moveAnchor = <E extends ExplainerEvent & { anchor: Parameters<typeof wordsOfAnchor>[1] }>(ev: E): E => {
    const range = wordsOfAnchor(oldText, ev.anchor, oldWords);
    if (!range) return ev;
    const kept: number[] = [];
    for (let k = range[0]; k <= range[1]; k += 1) if (map[k]! >= 0) kept.push(map[k]!);
    if (kept.length === 0) return ev;
    const lo = Math.min(...kept);
    const hi = Math.max(...kept);
    if (ev.anchor.granularity === 'stanza') {
      const anchor = buildAnchor(newText, { stanzaId: newWords[lo]!.stanza, wholeStanza: true });
      return anchor ? { ...ev, anchor } : ev;
    }
    const anchor = anchorFromWords(newText, lo, hi, newWords);
    return anchor ? { ...ev, anchor } : ev;
  };

  const events = rec.events.map((ev) => {
    if (ev.kind === 'mark' || ev.kind === 'note' || ev.kind === 'send') return moveAnchor(ev);
    if (ev.kind === 'pointer' && ev.pane === 'text') {
      return {
        ...ev,
        samples: ev.samples.map((s) => {
          const w = nearest(map, s[1]);
          return (w >= 0 ? [s[0], w] : s) as typeof s;
        })
      };
    }
    return ev;
  });
  return { ...rec, events };
}
