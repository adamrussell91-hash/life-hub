import { seededRandom, shuffleWith, type Rng } from './random';

/**
 * Find-a-word grid (spec §6.2): answers and decoys placed in eight directions
 * (or across and down only, for younger classes); the optional hidden message
 * spelled exactly, in reading order, by leftover cells; every other cell
 * filled with letters weighted to the words' own letters so nothing stands
 * out. No answer or decoy appears anywhere but where it was placed (a word
 * inside a longer placed word is the only exception, and can't be helped).
 * Seeded and pure: the editor preview is what students get, and the server
 * builds it at publish. No imports beyond the seeded random.
 */

export const WORDSEARCH_MAX = 15;
export const WORDSEARCH_MIN = 6;

export type WordSearchWord = { id: string; word: string };
export type WordSearchDecoy = { owner: string; word: string };
export type WordPlacement = { id: string | null; owner: string; word: string; x: number; y: number; dx: number; dy: number; decoy: boolean };
export type WordSearchLayout = {
  size: number;
  /** One string per row, A–Z. */
  rows: string[];
  placements: WordPlacement[];
  /** Answer ids that didn't fit. */
  unplaced: string[];
  /** Decoy words that didn't fit. */
  decoys_unplaced: string[];
  /** The hidden message's cells in reading order, or null when there's none or it didn't fit. */
  message: { text: string; cells: Array<[number, number]> } | null;
  /** False when a message was asked for and didn't fit. */
  message_fits: boolean;
};

export type WordSearchInput = {
  words: readonly WordSearchWord[];
  decoys?: readonly WordSearchDecoy[];
  /** A–Z letters only (gridWord); '' for none. */
  message?: string;
  seed: number;
  directions?: 'easy' | 'all';
  attempts?: number;
};

export const DIRECTIONS_ALL: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [0, 1], [1, 1], [1, -1], [-1, 0], [0, -1], [-1, -1], [-1, 1]
];
export const DIRECTIONS_EASY: ReadonlyArray<readonly [number, number]> = [[1, 0], [0, 1]];

/** Cells from one cell to another along a straight line in one of the eight directions, or null. */
export function lineBetween(from: readonly [number, number], to: readonly [number, number]): Array<[number, number]> | null {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  if (dx && dy && Math.abs(dx) !== Math.abs(dy)) return null;
  const n = Math.max(Math.abs(dx), Math.abs(dy));
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  return Array.from({ length: n + 1 }, (_, i) => [from[0] + sx * i, from[1] + sy * i] as [number, number]);
}

/** The letters a selection covers, or null when it isn't a straight line inside the grid. */
export function readSelection(rows: readonly string[], from: readonly [number, number], to: readonly [number, number]): string | null {
  const size = rows.length;
  const cells = lineBetween(from, to);
  if (!cells) return null;
  let out = '';
  for (const [x, y] of cells) {
    if (x < 0 || y < 0 || x >= size || y >= size) return null;
    out += rows[y]?.[x] ?? '';
  }
  return out;
}

/** The whole row, column or diagonal a placement sits in, as its first cell and a direction that doesn't give away which way the word reads. */
export function fullLine(size: number, p: Pick<WordPlacement, 'x' | 'y' | 'dx' | 'dy'>): { x: number; y: number; dx: number; dy: number } {
  let { dx, dy } = p;
  if (dx < 0 || (dx === 0 && dy < 0)) {
    dx = -dx;
    dy = -dy;
  }
  let x = p.x;
  let y = p.y;
  while (x - dx >= 0 && x - dx < size && y - dy >= 0 && y - dy < size) {
    x -= dx;
    y -= dy;
  }
  return { x, y, dx, dy };
}

export function placementCells(p: Pick<WordPlacement, 'x' | 'y' | 'dx' | 'dy' | 'word'>): Array<[number, number]> {
  return Array.from({ length: p.word.length }, (_, i) => [p.x + p.dx * i, p.y + p.dy * i] as [number, number]);
}

type Occurrence = { word: string; cells: string[] };

/** Every place a word reads in the grid, in any of the eight directions. Palindromes are found once per cell set. */
export function occurrences(rows: readonly string[], word: string): Occurrence[] {
  const size = rows.length;
  const out: Occurrence[] = [];
  const seen = new Set<string>();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (rows[y]?.[x] !== word[0]) continue;
      for (const [dx, dy] of DIRECTIONS_ALL) {
        const ex = x + dx * (word.length - 1);
        const ey = y + dy * (word.length - 1);
        if (ex < 0 || ey < 0 || ex >= size || ey >= size) continue;
        let ok = true;
        for (let i = 1; i < word.length && ok; i++) ok = rows[y + dy * i]?.[x + dx * i] === word[i];
        if (!ok) continue;
        const cells = Array.from({ length: word.length }, (_, i) => `${x + dx * i},${y + dy * i}`);
        const tag = [...cells].sort().join('|');
        if (seen.has(tag)) continue;
        seen.add(tag);
        out.push({ word, cells });
      }
    }
  }
  return out;
}

/**
 * Occurrences of placed words anywhere but their own placement, ignoring a
 * word read inside a longer placed word. Empty for a good grid.
 */
export function strayCopies(rows: readonly string[], placements: readonly WordPlacement[]): Occurrence[] {
  const own = placements.map((p) => new Set(placementCells(p).map(([x, y]) => `${x},${y}`)));
  const out: Occurrence[] = [];
  for (const word of new Set(placements.map((p) => p.word))) {
    for (const occ of occurrences(rows, word)) {
      const inside = own.some((cells) => occ.cells.every((c) => cells.has(c)));
      if (!inside) out.push(occ);
    }
  }
  return out;
}

function fillerPicker(words: readonly string[], rng: Rng): () => string {
  // The words' own letters, plus a little of every letter: filler that blends in.
  const weight = new Map<string, number>();
  for (const ch of 'ABCDEFGHIJKLMNOPRSTUVWY') weight.set(ch, 1);
  for (const w of words) for (const ch of w) weight.set(ch, (weight.get(ch) ?? 0) + 3);
  const letters = [...weight.entries()];
  const total = letters.reduce((n, [, v]) => n + v, 0);
  return () => {
    let r = rng() * total;
    for (const [ch, v] of letters) {
      r -= v;
      if (r < 0) return ch;
    }
    return 'E';
  };
}

type Attempt = { layout: WordSearchLayout; score: number };

function attempt(size: number, input: WordSearchInput, rng: Rng): Attempt {
  const dirs = input.directions === 'easy' ? DIRECTIONS_EASY : DIRECTIONS_ALL;
  const grid: Array<string | null> = Array(size * size).fill(null);
  const placements: WordPlacement[] = [];
  const unplaced: string[] = [];
  const decoysUnplaced: string[] = [];
  const answerWords = new Set(input.words.map((w) => w.word));

  const tryPlace = (word: string, make: (x: number, y: number, dx: number, dy: number) => WordPlacement): boolean => {
    const spots: Array<{ x: number; y: number; dx: number; dy: number; overlap: number; tie: number }> = [];
    for (const [dx, dy] of dirs) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const ex = x + dx * (word.length - 1);
          const ey = y + dy * (word.length - 1);
          if (ex < 0 || ey < 0 || ex >= size || ey >= size) continue;
          let overlap = 0;
          let ok = true;
          for (let i = 0; i < word.length && ok; i++) {
            const held = grid[(y + dy * i) * size + x + dx * i];
            if (held === null || held === undefined) continue;
            if (held === word[i]) overlap += 1;
            else ok = false;
          }
          // A word lying wholly on letters already there isn't a placement of its own.
          if (ok && overlap < word.length) spots.push({ x, y, dx, dy, overlap, tie: rng() });
        }
      }
    }
    if (!spots.length) return false;
    // Half the time take a spot that shares a letter (keeps the grid small), else any spot.
    const sharing = spots.filter((s) => s.overlap > 0);
    const pool = sharing.length && rng() < 0.5 ? sharing : spots;
    const pick = pool.reduce((a, b) => (b.tie < a.tie ? b : a));
    const p = make(pick.x, pick.y, pick.dx, pick.dy);
    for (let i = 0; i < word.length; i++) grid[(p.y + p.dy * i) * size + p.x + p.dx * i] = word[i] as string;
    placements.push(p);
    return true;
  };

  const words = shuffleWith(input.words, rng).sort((a, b) => b.word.length - a.word.length);
  for (const w of words) {
    if (w.word.length > size || !tryPlace(w.word, (x, y, dx, dy) => ({ id: w.id, owner: w.id, word: w.word, x, y, dx, dy, decoy: false }))) unplaced.push(w.id);
  }
  const placedWords = new Set(placements.map((p) => p.word));
  for (const d of shuffleWith(input.decoys ?? [], rng)) {
    // A decoy that is an answer, or already in the grid, isn't placed twice.
    if (answerWords.has(d.word) || placedWords.has(d.word)) continue;
    if (d.word.length > size || !tryPlace(d.word, (x, y, dx, dy) => ({ id: null, owner: d.owner, word: d.word, x, y, dx, dy, decoy: true }))) decoysUnplaced.push(d.word);
    else placedWords.add(d.word);
  }

  const message = input.message ?? '';
  const free: number[] = [];
  for (let i = 0; i < grid.length; i++) if (grid[i] === null) free.push(i);
  const fits = !message || free.length >= message.length;
  const msgCells = fits ? free.slice(0, message.length) : [];
  msgCells.forEach((cell, i) => {
    grid[cell] = message[i] as string;
  });
  const fillerCells = free.slice(msgCells.length);
  const filler = fillerPicker([...placements.map((p) => p.word)], rng);
  for (const cell of fillerCells) grid[cell] = filler();

  const rowsOf = () => Array.from({ length: size }, (_, y) => grid.slice(y * size, y * size + size).join(''));
  let rows = rowsOf();
  let stray = strayCopies(rows, placements);
  const fillerSet = new Set(fillerCells.map((c) => `${c % size},${Math.floor(c / size)}`));
  for (let round = 0; stray.length && round < 60; round++) {
    let changed = false;
    for (const occ of stray) {
      const loose = occ.cells.filter((c) => fillerSet.has(c));
      if (!loose.length) continue;
      const c = loose[Math.floor(rng() * loose.length)] as string;
      const [x, y] = c.split(',').map(Number) as [number, number];
      grid[y * size + x] = filler();
      changed = true;
    }
    if (!changed) break;
    rows = rowsOf();
    stray = strayCopies(rows, placements);
  }

  const decoysWanted = (input.decoys ?? []).filter((d) => !answerWords.has(d.word)).length;
  const decoysPlaced = placements.filter((p) => p.decoy).length;
  // Most answers placed, then no stray copies, then the message, then decoys, then smallest.
  const score = (input.words.length - unplaced.length) * 1000 + (stray.length ? 0 : 500) + (fits ? 200 : 0) + Math.min(decoysPlaced, decoysWanted) * 10;
  return {
    score,
    layout: {
      size,
      rows,
      placements,
      unplaced: input.words.filter((w) => unplaced.includes(w.id)).map((w) => w.id),
      decoys_unplaced: decoysUnplaced,
      message: message && fits ? { text: message, cells: msgCells.map((c) => [c % size, Math.floor(c / size)] as [number, number]) } : null,
      message_fits: fits
    }
  };
}

/**
 * Builds a find-a-word grid: the smallest square (6 to 15) where every answer,
 * the decoys and the message fit with no stray copies, trying a few seeded
 * layouts at each size. If nothing is perfect, the best try comes back with
 * what didn't fit reported.
 */
export function generateWordSearch(input: WordSearchInput): WordSearchLayout {
  const rng = seededRandom(input.seed);
  const words = input.words.filter((w) => /^[A-Z]+$/.test(w.word));
  const decoys = (input.decoys ?? []).filter((d) => /^[A-Z]{2,}$/.test(d.word));
  const clean = { ...input, words, decoys, message: (input.message ?? '').replace(/[^A-Z]/g, '') };
  const letters = [...words, ...decoys].reduce((n, w) => n + w.word.length, 0);
  const longest = Math.max(0, ...words.map((w) => w.word.length), ...decoys.map((d) => d.word.length));
  const start = Math.min(WORDSEARCH_MAX, Math.max(WORDSEARCH_MIN, longest, Math.ceil(Math.sqrt(letters * 0.8 + clean.message.length))));
  const perSize = input.attempts ?? 24;
  const decoysWanted = decoys.filter((d) => !words.some((w) => w.word === d.word)).length;
  const perfect = words.length * 1000 + 500 + 200 + decoysWanted * 10;
  let best: Attempt | null = null;
  for (let size = start; size <= WORDSEARCH_MAX; size++) {
    for (let i = 0; i < perSize; i++) {
      const a = attempt(size, clean, rng);
      if (!best || a.score > best.score) best = a;
      if (a.score >= perfect) return { ...a.layout, unplaced: input.words.filter((w) => !words.includes(w) || a.layout.unplaced.includes(w.id)).map((w) => w.id) };
    }
  }
  const layout = (best as Attempt).layout;
  return { ...layout, unplaced: input.words.filter((w) => !words.includes(w) || layout.unplaced.includes(w.id)).map((w) => w.id) };
}
