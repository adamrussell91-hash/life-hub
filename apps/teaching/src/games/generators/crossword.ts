import { seededRandom, shuffleWith, type Rng } from './random';

/**
 * Crossword layout (spec §6.1): seeded backtracking that places every word it
 * can, crossing as many letters as possible, inside a 15 × 15 grid or smaller.
 * Words that won't fit are reported, never dropped quietly. Same words and
 * seed, same layout, so the editor preview is exactly what students get.
 * Pure TypeScript with no imports beyond the seeded random: bundled to the
 * server (game-rules.mjs) and run at publish.
 */

export const CROSSWORD_MAX = 15;

export type CrosswordWord = { id: string; word: string };
export type CrosswordDir = 'across' | 'down';
export type CrosswordEntry = { id: string; word: string; x: number; y: number; dir: CrosswordDir; number: number };
export type CrosswordLayout = {
  width: number;
  height: number;
  /** In clue order: by number, across before down. */
  entries: CrosswordEntry[];
  /** Ids of words that didn't fit, in the order given. */
  unplaced: string[];
  /** Cells where an across and a down word share a letter. */
  crossings: number;
};

type Cell = { ch: string; across: boolean; down: boolean };
type Placed = { id: string; word: string; x: number; y: number; dir: CrosswordDir };
type Candidate = Placed & { crossings: number; area: number; tie: number };

const key = (x: number, y: number) => `${x},${y}`;

class Board {
  cells = new Map<string, Cell>();
  placed: Placed[] = [];
  minX = 0;
  maxX = -1;
  minY = 0;
  maxY = -1;
  crossings = 0;
  constructor(readonly max: number) {}

  get empty(): boolean {
    return this.placed.length === 0;
  }

  /** Crossings made, or -1 when the word can't go there. */
  fits(word: string, x: number, y: number, dir: CrosswordDir): number {
    const dx = dir === 'across' ? 1 : 0;
    const dy = dir === 'down' ? 1 : 0;
    const n = word.length;
    const minX = this.empty ? x : Math.min(this.minX, x);
    const minY = this.empty ? y : Math.min(this.minY, y);
    const maxX = this.empty ? x + dx * (n - 1) : Math.max(this.maxX, x + dx * (n - 1));
    const maxY = this.empty ? y + dy * (n - 1) : Math.max(this.maxY, y + dy * (n - 1));
    if (maxX - minX + 1 > this.max || maxY - minY + 1 > this.max) return -1;
    if (this.cells.has(key(x - dx, y - dy)) || this.cells.has(key(x + dx * n, y + dy * n))) return -1;
    let crossings = 0;
    for (let i = 0; i < n; i++) {
      const cx = x + dx * i;
      const cy = y + dy * i;
      const held = this.cells.get(key(cx, cy));
      if (held) {
        if (held.ch !== word[i] || held[dir]) return -1;
        crossings += 1;
      } else if (this.cells.has(key(cx + dy, cy + dx)) || this.cells.has(key(cx - dy, cy - dx))) {
        // A new letter may not touch a parallel word side by side.
        return -1;
      }
    }
    return crossings;
  }

  place(p: Placed): Array<string> {
    const dx = p.dir === 'across' ? 1 : 0;
    const dy = p.dir === 'down' ? 1 : 0;
    const fresh: string[] = [];
    for (let i = 0; i < p.word.length; i++) {
      const k = key(p.x + dx * i, p.y + dy * i);
      const held = this.cells.get(k);
      if (held) {
        held[p.dir] = true;
        this.crossings += 1;
      } else {
        this.cells.set(k, { ch: p.word[i] as string, across: p.dir === 'across', down: p.dir === 'down' });
        fresh.push(k);
      }
    }
    this.placed.push(p);
    this.bounds();
    return fresh;
  }

  unplace(p: Placed, fresh: string[]): void {
    const dx = p.dir === 'across' ? 1 : 0;
    const dy = p.dir === 'down' ? 1 : 0;
    const made = new Set(fresh);
    for (let i = 0; i < p.word.length; i++) {
      const k = key(p.x + dx * i, p.y + dy * i);
      if (made.has(k)) this.cells.delete(k);
      else {
        const held = this.cells.get(k);
        if (held) held[p.dir] = false;
        this.crossings -= 1;
      }
    }
    this.placed.pop();
    this.bounds();
  }

  private bounds(): void {
    if (!this.placed.length) {
      this.minX = this.minY = 0;
      this.maxX = this.maxY = -1;
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const k of this.cells.keys()) {
      const [x, y] = k.split(',').map(Number) as [number, number];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    Object.assign(this, { minX, minY, maxX, maxY });
  }

  candidates(id: string, word: string, rng: Rng): Candidate[] {
    if (this.empty) return [{ id, word, x: 0, y: 0, dir: 'across', crossings: 0, area: word.length, tie: rng() }];
    const seen = new Set<string>();
    const out: Candidate[] = [];
    for (const [k, cell] of this.cells) {
      if (cell.across && cell.down) continue;
      const dir: CrosswordDir = cell.across ? 'down' : 'across';
      const [cx, cy] = k.split(',').map(Number) as [number, number];
      for (let i = 0; i < word.length; i++) {
        if (word[i] !== cell.ch) continue;
        const x = dir === 'across' ? cx - i : cx;
        const y = dir === 'down' ? cy - i : cy;
        const tag = `${x},${y},${dir}`;
        if (seen.has(tag)) continue;
        seen.add(tag);
        const crossings = this.fits(word, x, y, dir);
        if (crossings < 1) continue;
        const ex = dir === 'across' ? x + word.length - 1 : x;
        const ey = dir === 'down' ? y + word.length - 1 : y;
        const area = (Math.max(this.maxX, ex) - Math.min(this.minX, x) + 1) * (Math.max(this.maxY, ey) - Math.min(this.minY, y) + 1);
        out.push({ id, word, x, y, dir, crossings, area, tie: rng() });
      }
    }
    return out.sort((a, b) => b.crossings - a.crossings || a.area - b.area || a.tie - b.tie);
  }
}

type Best = { placed: Placed[]; crossings: number; area: number; count: number };

function better(a: Best, b: Best | null): boolean {
  if (!b) return true;
  if (a.count !== b.count) return a.count > b.count;
  if (a.crossings !== b.crossings) return a.crossings > b.crossings;
  return a.area < b.area;
}

/**
 * Lays out a crossword. `words` are A–Z only (gridWord); anything longer than
 * `max` is reported unplaced. Each attempt orders the words (longest first,
 * shuffled within a length by the seed) and runs a depth-first search: the
 * best few crossings for each word, or leave it out; a word with nowhere to go
 * is tried again once the others are down. The search stops at a budget; the
 * layout that places the most words, then crosses most, then is smallest, wins.
 */
export function generateCrossword(words: readonly CrosswordWord[], seed: number, options: { max?: number; attempts?: number; budget?: number; branch?: number } = {}): CrosswordLayout {
  const max = Math.max(3, Math.min(CROSSWORD_MAX, options.max ?? CROSSWORD_MAX));
  const attempts = options.attempts ?? 10;
  const budget = options.budget ?? 1500;
  const branch = options.branch ?? 3;
  const rng = seededRandom(seed);
  const usable = words.filter((w) => /^[A-Z]{2,}$/.test(w.word) && w.word.length <= max);
  let best: Best | null = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    // Longest first; later attempts jitter the order a little more each time.
    const order = shuffleWith(usable, rng)
      .map((w) => ({ w, k: w.word.length + (attempt ? (rng() - 0.5) * Math.min(attempt, 4) : 0) }))
      .sort((a, b) => b.k - a.k)
      .map((x) => x.w);
    const board = new Board(max);
    let nodes = 0;
    const record = () => {
      const area = board.placed.length ? (board.maxX - board.minX + 1) * (board.maxY - board.minY + 1) : 0;
      const now: Best = { placed: [...board.placed], crossings: board.crossings, area, count: board.placed.length };
      if (better(now, best)) best = now;
    };
    const search = (queue: Array<CrosswordWord & { deferred?: boolean }>): boolean => {
      if (nodes++ > budget) return true;
      if (!queue.length) {
        record();
        return board.placed.length === usable.length;
      }
      const [next, ...rest] = queue as [CrosswordWord & { deferred?: boolean }, ...Array<CrosswordWord & { deferred?: boolean }>];
      const options2 = board.candidates(next.id, next.word, rng).slice(0, branch);
      if (!options2.length && !next.deferred && rest.length) return search([...rest, { ...next, deferred: true }]);
      for (const c of options2) {
        const fresh = board.place(c);
        const done = search(rest);
        board.unplace(c, fresh);
        if (done) return true;
      }
      // Leave this word out and carry on.
      return search(rest);
    };
    search(order);
    if (best && (best as Best).count === usable.length && attempt >= 2) break;
  }

  const chosen: Best = best ?? { placed: [], crossings: 0, area: 0, count: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of chosen.placed) {
    const ex = p.dir === 'across' ? p.x + p.word.length - 1 : p.x;
    const ey = p.dir === 'down' ? p.y + p.word.length - 1 : p.y;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, ex);
    maxY = Math.max(maxY, ey);
  }
  const shifted = chosen.placed.map((p) => ({ ...p, x: p.x - (Number.isFinite(minX) ? minX : 0), y: p.y - (Number.isFinite(minY) ? minY : 0) }));
  const starts = [...new Set(shifted.map((p) => p.y * 100 + p.x))].sort((a, b) => a - b);
  const entries: CrosswordEntry[] = shifted
    .map((p) => ({ id: p.id, word: p.word, x: p.x, y: p.y, dir: p.dir, number: starts.indexOf(p.y * 100 + p.x) + 1 }))
    .sort((a, b) => a.number - b.number || (a.dir === 'across' ? -1 : 1));
  const placedIds = new Set(entries.map((e) => e.id));
  return {
    width: Number.isFinite(maxX) ? maxX - minX + 1 : 0,
    height: Number.isFinite(maxY) ? maxY - minY + 1 : 0,
    entries,
    unplaced: words.filter((w) => !placedIds.has(w.id)).map((w) => w.id),
    crossings: chosen.crossings
  };
}

/** The letter in each cell of a layout, keyed "x,y". */
export function crosswordCells(layout: Pick<CrosswordLayout, 'entries'>): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of layout.entries) {
    for (let i = 0; i < e.word.length; i++) out.set(key(e.dir === 'across' ? e.x + i : e.x, e.dir === 'down' ? e.y + i : e.y), e.word[i] as string);
  }
  return out;
}
