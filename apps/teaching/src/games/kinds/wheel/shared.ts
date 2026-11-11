import type { GameEvent } from '../../core/events';

/**
 * Wheel of Fortune: the parts the room rules and the screens share (pure, no
 * registration): the wheel, timings, the puzzle's board form and the
 * letters-needed sums.
 */

/* ── Wheel and timings ───────────────────────────────────────────── */

export type Segment = number | 'bankrupt' | 'lose';
/** The wheel, clockwise from the pointer at angle 0 (the mockup's order). */
export const WHEEL_SEGMENTS: readonly Segment[] = [300, 700, 400, 'bankrupt', 500, 900, 200, 600, 'lose', 350, 800, 250, 1000, 450, 150, 550];
export const VOWELS = 'AEIOU';
export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const WHEEL = {
  /** Board spin animation budget: physics stops inside this, then the landing shows. */
  spinMs: 5600,
  /** A value showing before the letter question opens. */
  valueMs: 1400,
  /** Bankrupt / Lose a turn stamp. */
  stampMs: 2400,
  questionMs: 15_000,
  qclosedMs: 1900,
  /** The captain's time to call a letter before play passes on. */
  letterMs: 30_000,
  /** Letters turning over: a beat, then one per letter, then a pause. */
  flipBaseMs: 1500,
  flipEachMs: 380,
  /** After the first solve, others may still solve for their record. */
  solvedMs: 10_000,
  explainMs: 20_000,
  solveBonus: 500,
  /** A solve this fast with nothing showing is an outlier (likely had the text open). */
  outlierMs: 3000
} as const;

/* ── Puzzle text ─────────────────────────────────────────────────── */

const stripMarks = (s: string) => s.normalize('NFD').replace(/\p{M}+/gu, '');
/** The board form of a line: capitals A–Z, accents dropped, one space between words; anything else is punctuation, shown filled in. */
export function puzzleBoard(text: string): string {
  return stripMarks(String(text ?? ''))
    .toUpperCase()
    .replace(/_/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}
const isLetter = (ch: string) => ch >= 'A' && ch <= 'Z' && ch.length === 1;
/** Every letter position in the board form. */
export const lettersOf = (board: string): string[] => [...board].filter(isLetter);
/** A solve compared as letters only: case, spaces, punctuation and accents don't count. */
export const solveForm = (s: string): string => stripMarks(String(s ?? '')).toUpperCase().replace(/[^A-Z]/g, '');
/** What a screen may show: each hidden letter as `_`. */
export function maskBoard(board: string, shown: readonly string[]): string {
  const on = new Set(shown);
  return [...board].map((ch) => (isLetter(ch) && !on.has(ch) ? '_' : ch)).join('');
}
export function shownCount(board: string, shown: readonly string[]): number {
  const on = new Set(shown);
  return lettersOf(board).filter((ch) => on.has(ch)).length;
}

/* ── Letters needed ──────────────────────────────────────────────── */

export type LettersNeeded = { shown: number; total: number; pct: number; outlier: boolean; ms?: number };

/** A student's first right solve: letters showing, share of the line, and whether it's an outlier (< 3 s with 0 letters). */
export function lettersNeededAt(shown: number, total: number, ms: number): LettersNeeded {
  return { shown, total, pct: total ? shown / total : 0, outlier: shown === 0 && ms < WHEEL.outlierMs, ms };
}

/**
 * Letters needed per student per puzzle, from folded events (Results heat
 * strip). The first right `solve` per owner per puzzle counts; later ones and
 * wrong solves don't. Missing: not solved.
 */
export function lettersNeededFromEvents(events: readonly Pick<GameEvent, 'owner' | 'item' | 'move' | 'correct' | 'at' | 'time_ms' | 'extra'>[]): Record<string, Record<string, LettersNeeded>> {
  const out: Record<string, Record<string, LettersNeeded>> = {};
  const sorted = [...events].filter((e) => e.move === 'solve' && e.correct === true).sort((a, b) => a.at - b.at);
  for (const e of sorted) {
    const row = (out[e.owner] ??= {});
    if (row[e.item]) continue;
    const shown = Number(e.extra?.letters_showing ?? 0);
    const total = Number(e.extra?.letters_total ?? 0);
    row[e.item] = { ...lettersNeededAt(shown, total, e.time_ms ?? Number.MAX_SAFE_INTEGER), outlier: e.extra?.outlier === true };
  }
  return out;
}

/**
 * Recognition score over the puzzles a student played: 1 − share needed for
 * each solve, 0 for not solved; outliers left out. Null when nothing counts.
 */
export function recognitionScore(cells: Array<LettersNeeded | null | undefined>): number | null {
  const counted = cells.filter((c) => !c?.outlier);
  if (!counted.length) return null;
  return counted.reduce((s, c) => s + (c ? 1 - c.pct : 0), 0) / counted.length;
}

