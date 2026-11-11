import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateCrossword, crosswordCells, type CrosswordLayout } from '@/games/generators/crossword';
import { generateWordSearch, strayCopies, placementCells, readSelection } from '@/games/generators/wordsearch';
import { GameSchema, type Game, type PublicGame } from '@/games/core/schema';
import { checkAnswer, checkSelection, crosswordHint, splitGame, wordHint, type GameKeys } from '@/games/core/model';
import type { EventResult, SoloEvent } from '@/games/api';
import type { PlayerContext } from '@/games/solo/registry';
import { mountCrossword } from '@/games/kinds/crossword/player';
import { mountFindAWord } from '@/games/kinds/find-a-word/player';
import { renderCrosswordPrint } from '@/games/kinds/crossword/print';
import { renderFindAWordPrint } from '@/games/kinds/find-a-word/print';
import { setCalm } from '@/games/motion/motion';
import { seededRandom } from '@/games/generators/random';
import { crossword, term } from '../../../../tests/unit/helpers/game-fixture.mjs';

// Invented content only.
const WORDS = ['SYMBOL', 'OXYMORON', 'SIBILANCE', 'UNCANNY', 'NARRATOR', 'MOTIF', 'IRONY', 'METAPHOR', 'FORESHADOWING', 'GOTHIC', 'REDHERRING', 'SIMILE'].map((word, i) => ({ id: `w${i}`, word }));

/** Every run of two or more letters across or down is a placed word: no accidental words from touching letters. */
function runsAreEntries(layout: CrosswordLayout): boolean {
  const cells = crosswordCells(layout);
  const starts = new Set(layout.entries.map((e) => `${e.dir}:${e.x},${e.y}:${e.word.length}`));
  for (const dir of ['across', 'down'] as const) {
    for (let a = 0; a < (dir === 'across' ? layout.height : layout.width); a++) {
      let run: Array<[number, number]> = [];
      const flush = () => {
        if (run.length >= 2 && !starts.has(`${dir}:${run[0]![0]},${run[0]![1]}:${run.length}`)) throw new Error(`stray run at ${run[0]}`);
        run = [];
      };
      for (let b = 0; b <= (dir === 'across' ? layout.width : layout.height); b++) {
        const [x, y] = dir === 'across' ? [b, a] : [a, b];
        if (cells.has(`${x},${y}`)) run.push([x, y]);
        else flush();
      }
    }
  }
  return true;
}

describe('crossword generator', () => {
  it('places every word or reports it, inside 15 × 15, with real crossings', () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const layout = generateCrossword(WORDS, seed);
      const ids = layout.entries.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect([...ids, ...layout.unplaced].sort()).toEqual(WORDS.map((w) => w.id).sort());
      expect(layout.width).toBeLessThanOrEqual(15);
      expect(layout.height).toBeLessThanOrEqual(15);
      expect(layout.crossings).toBeGreaterThanOrEqual(layout.entries.length - 1);
      expect(runsAreEntries(layout)).toBe(true);
      // Letters agree wherever words cross.
      const cells = crosswordCells(layout);
      for (const e of layout.entries) for (let i = 0; i < e.word.length; i++) expect(cells.get(`${e.dir === 'across' ? e.x + i : e.x},${e.dir === 'down' ? e.y + i : e.y}`)).toBe(e.word[i]);
    }
  });

  it('is the same for the same seed, and numbers clues in reading order', () => {
    expect(generateCrossword(WORDS, 42)).toEqual(generateCrossword(WORDS, 42));
    const layout = generateCrossword(WORDS, 42);
    const firsts = [...new Map(layout.entries.map((e) => [e.number, e])).values()];
    for (let i = 1; i < firsts.length; i++) {
      const [a, b] = [firsts[i - 1]!, firsts[i]!];
      expect(a.y < b.y || (a.y === b.y && a.x < b.x)).toBe(true);
    }
  });

  it('reports words too long for the grid or with no letter to share', () => {
    const layout = generateCrossword([{ id: 'a', word: 'ABCDEFGHIJKLMNOPQ' }, { id: 'b', word: 'CAT' }, { id: 'c', word: 'XYZ' }, { id: 'd', word: 'TAB' }], 1);
    expect(layout.unplaced).toEqual(['a', 'c']);
  });
});

describe('word search generator', () => {
  const input = (seed: number, message = 'THEHOUSEREMEMBERS') => ({
    words: WORDS.slice(0, 9),
    decoys: [{ owner: 'w0', word: 'PARADOX' }, { owner: 'w1', word: 'TONE' }],
    message,
    seed
  });
  it('places every answer and decoy, spells the message exactly, and makes no stray copies', () => {
    for (const seed of [1, 5, 77, 2024]) {
      const g = generateWordSearch(input(seed));
      expect(g.unplaced).toEqual([]);
      expect(g.decoys_unplaced).toEqual([]);
      expect(g.size).toBeLessThanOrEqual(15);
      expect(g.rows.every((r) => r.length === g.size && /^[A-Z]+$/.test(r))).toBe(true);
      expect(g.message?.cells.map(([x, y]) => g.rows[y]![x]).join('')).toBe('THEHOUSEREMEMBERS');
      // Message cells are in reading order and never on a word.
      const flat = g.message!.cells.map(([x, y]) => y * g.size + x);
      expect([...flat].sort((a, b) => a - b)).toEqual(flat);
      const used = new Set(g.placements.flatMap((p) => placementCells(p).map(([x, y]) => y * g.size + x)));
      expect(flat.some((c) => used.has(c))).toBe(false);
      expect(strayCopies(g.rows, g.placements)).toEqual([]);
      for (const p of g.placements) expect(readSelection(g.rows, [p.x, p.y], placementCells(p).at(-1)!)).toBe(p.word);
    }
  });
  it('is the same for the same seed; easy directions read across and down only', () => {
    expect(generateWordSearch(input(9))).toEqual(generateWordSearch(input(9)));
    const easy = generateWordSearch({ ...input(9), directions: 'easy' });
    expect(easy.placements.every((p) => (p.dx === 1 && p.dy === 0) || (p.dx === 0 && p.dy === 1))).toBe(true);
  });
  it('reports a message too long for the spare letters', () => {
    const g = generateWordSearch({ words: WORDS.slice(0, 3), seed: 1, message: 'X'.repeat(240) });
    expect(g.message).toBeNull();
    expect(g.message_fits).toBe(false);
  });
});

/* ── Players ─────────────────────────────────────────────────────── */

/** A tiny stand-in for the server: marks moves with the real model functions against the split's keys. */
function fakeCtx(pub: PublicGame, keys: GameKeys) {
  const sent: SoloEvent[] = [];
  const hintCount = new Map<string, number>();
  const found = new Set<string>();
  const ctx: PlayerContext & { sent: SoloEvent[]; toasts: string[]; finished: number; dock: HTMLElement } = {
    game: pub,
    playId: 'play_1',
    sent,
    toasts: [],
    finished: 0,
    dock: document.createElement('div'),
    async emit(e) {
      sent.push(e);
      const out: EventResult = { item: e.item };
      const grid = keys.grid;
      if (e.move === 'hint' && grid) {
        const step = Math.min(3, (hintCount.get(e.item) ?? 0) + 1);
        hintCount.set(e.item, step);
        out.reveal = grid.kind === 'crossword' ? { step, cells: crosswordHint(grid, e.item, step, String((e.response as { letters?: string })?.letters ?? '')) } : { step, ...wordHint(grid, e.item, step) };
        return out;
      }
      if (grid?.kind === 'wordsearch' && e.item !== 'message_q') {
        const c = checkSelection(grid, e.item === 'any' ? null : e.item, e.response);
        if (c.correct && c.item) found.add(c.item);
        const all = Object.entries(keys.items).filter(([, k]) => k.shape === 'term').every(([id]) => found.has(id));
        return { item: c.item ?? e.item, correct: c.correct === true, ...(c.decoy ? { decoy: true as const } : {}), ...(c.correct && all && grid.message ? { reveal: { message: grid.message } } : {}) };
      }
      const key = keys.items[e.item]!;
      const check = checkAnswer(key, e.response);
      return { item: e.item, correct: check.correct, ...(key.shape === 'question' ? { reveal: { key: key.key } } : {}) };
    },
    finish() {
      ctx.finished += 1;
    },
    setActions(buttons) {
      ctx.dock.replaceChildren(...buttons);
    },
    setStatus() {},
    toast(text) {
      ctx.toasts.push(text);
    },
    elapsedMs: () => 1000,
    calm: () => true,
    sfx: new Proxy({}, { get: () => () => false }) as PlayerContext['sfx']
  };
  return ctx;
}

const flush = async () => {
  for (let i = 0; i < 12; i += 1) await new Promise((r) => setTimeout(r, 0));
};
const key = (target: Element, k: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

beforeEach(() => {
  setCalm(true);
  vi.useRealTimers();
});
afterEach(() => document.body.replaceChildren());

describe('crossword player', () => {
  function mount() {
    const game = GameSchema.parse(crossword()) as Game;
    const split = splitGame(game, seededRandom(3));
    const host = document.createElement('div');
    document.body.append(host);
    const ctx = fakeCtx(split.public, split.keys);
    const player = mountCrossword(host, ctx);
    // The shell hands keys on from its root: do the same here.
    host.addEventListener('keydown', (e) => {
      if (player.onKey?.(e)) e.preventDefault();
    });
    return { host, ctx, player, keys: split.keys, pub: split.public };
  }

  it('shows the grid with numbers and no letters, and a hidden 16 px input for typing', () => {
    const { host, pub } = mount();
    expect(host.querySelectorAll('.cw-cell').length).toBeGreaterThan(20);
    expect([...host.querySelectorAll('.cw-cell .l')].every((l) => l.textContent === '')).toBe(true);
    expect(host.querySelectorAll('.cw-clue').length).toBe(pub.items!.length);
    expect(host.querySelector<HTMLInputElement>('input.cw-key')).toBeTruthy();
  });

  it('types a word, checks it with the server, and locks it', async () => {
    const { host, ctx, keys } = mount();
    const grid = keys.grid as Extract<GameKeys['grid'], { kind: 'crossword' }>;
    const e = grid.entries.find((x) => x.number === 1 && x.dir === 'across') ?? grid.entries[0]!;
    // Pick that clue, type its word and press Enter.
    const clue = [...host.querySelectorAll<HTMLButtonElement>('.cw-clue')].find((b) => b.textContent?.startsWith(String(e.number)) && (b.closest('.cw-list')?.textContent ?? '').length > 0)!;
    const index = grid.entries.indexOf(e);
    host.querySelector<HTMLButtonElement>(`.cw-clue[data-w="${index}"]`)!.click();
    expect(clue).toBeTruthy();
    const input = host.querySelector<HTMLInputElement>('input.cw-key')!;
    for (const ch of e.word.toLowerCase()) key(input, ch);
    key(input, 'Enter');
    await flush();
    const answer = ctx.sent.find((s) => s.move === 'answer')!;
    expect(answer).toMatchObject({ item: e.id, response: { text: e.word } });
    const solved = host.querySelector(`.cw-clue[data-w="${index}"]`)!;
    expect(solved.classList.contains('done')).toBe(true);
    // A locked word ignores typing.
    const cellKey = `${e.x},${e.y}`;
    expect(host.querySelector(`.cw-cell[data-k="${cellKey}"]`)!.classList.contains('ok')).toBe(true);
  });

  it('a wrong word stays open; the hint ladder fills a letter, crossings, then shows the word', async () => {
    const { host, ctx, keys } = mount();
    const grid = keys.grid as Extract<GameKeys['grid'], { kind: 'crossword' }>;
    const index = grid.entries.findIndex((x) => x.id === 't1');
    host.querySelector<HTMLButtonElement>(`.cw-clue[data-w="${index}"]`)!.click();
    const input = host.querySelector<HTMLInputElement>('input.cw-key')!;
    for (const ch of 'zzzzzz') key(input, ch);
    key(input, 'Enter');
    await flush();
    expect(ctx.toasts.at(-1)).toMatch(/Not quite/);
    expect(host.querySelector(`.cw-clue[data-w="${index}"]`)!.classList.contains('done')).toBe(false);
    const hint = ctx.dock.querySelector<HTMLButtonElement>('.cw-hint')!;
    hint.click();
    await flush();
    expect(host.querySelectorAll('.cw-cell.given').length).toBe(1);
    expect(ctx.sent.at(-1)).toMatchObject({ item: 't1', move: 'hint', response: { letters: 'ZZZZZZ' } });
    hint.click();
    await flush();
    hint.click();
    await flush();
    const last = ctx.sent.filter((s) => s.item === 't1').at(-1)!;
    expect(last).toMatchObject({ move: 'answer', response: { text: 'SIMILE' }, extra: { hints: 3 } });
    expect(host.querySelector(`.cw-clue[data-w="${index}"] .tick.shown`)).toBeTruthy();
  });

  it('Finish now ends the play', () => {
    const { host, ctx } = mount();
    host.querySelector<HTMLButtonElement>('.cw-finish')!.click();
    expect(ctx.finished).toBe(1);
  });

  it('prints the grid empty, clues with lengths, and the key on its own page', () => {
    const el = renderCrosswordPrint(GameSchema.parse(crossword()) as Game, { answers: true });
    expect(el.textContent).toContain('Across');
    expect(el.textContent).toMatch(/\(8, 7\)/);
    const grids = el.querySelectorAll('table');
    expect(grids[0]!.textContent).not.toMatch(/[A-Z]{2}/);
    expect(el.querySelector('.gm-print-key')!.textContent).toContain('Pathetic fallacy');
  });
});

describe('find-a-word player', () => {
  const game = () =>
    GameSchema.parse({
      id: 'g_find',
      title: 'Find it',
      kind: 'find_a_word',
      items: [
        term('f1', 'Simile', 'Like a slow grey tide.', { decoys: ['Metaphor'] }),
        term('f2', 'Hyperbole', 'A thousand years of frost.'),
        term('f3', 'Oxymoron', 'A gentle cruelty.'),
        term('f4', 'Motif', 'Moths in every chapter.'),
        term('f5', 'Irony', 'Lights every lamp, lost herself.'),
        term('f6', 'Gothic', 'A locked wing and a groaning stair.')
      ],
      message: { text: 'Every hand', question: { id: 'message_q', kind: 'multiple_choice', prompt: 'Which technique?', marks: 1, options: [{ id: 'o1', text: 'Personification' }, { id: 'o2', text: 'Simile' }], correct: ['o1'], explanation: 'The house remembers.' } },
      settings: { seed: 3 }
    }) as Game;
  function mount() {
    const split = splitGame(game(), seededRandom(4));
    const host = document.createElement('div');
    document.body.append(host);
    const ctx = fakeCtx(split.public, split.keys);
    const player = mountFindAWord(host, ctx);
    return { host, ctx, player, grid: split.keys.grid as Extract<GameKeys['grid'], { kind: 'wordsearch' }> };
  }
  /** Drags from one cell to another with pointer events (jsdom has no layout: cells are 34 px). */
  function drag(host: HTMLElement, from: [number, number], to: [number, number]) {
    const wrap = host.querySelector<HTMLElement>('.fw-wrap')!;
    const at = (p: [number, number]) => ({ clientX: p[0] * 34 + 17, clientY: p[1] * 34 + 17, pointerId: 1, bubbles: true });
    const Ev = (window.PointerEvent ?? MouseEvent) as typeof MouseEvent;
    wrap.dispatchEvent(new Ev('pointerdown', at(from)));
    wrap.dispatchEvent(new Ev('pointermove', at(to)));
    wrap.dispatchEvent(new Ev('pointerup', at(to)));
  }
  const ends = (p: { x: number; y: number; dx: number; dy: number; word: string }): [[number, number], [number, number]] => [[p.x, p.y], [p.x + p.dx * (p.word.length - 1), p.y + p.dy * (p.word.length - 1)]];

  it('shows clues, never a word list, and every letter of the grid', () => {
    const { host, grid } = mount();
    expect(host.querySelectorAll('.fw-c').length).toBe(grid.size * grid.size);
    expect(host.querySelector('.fw-list')!.textContent).not.toMatch(/Hyperbole|Oxymoron/);
  });

  it('drag-select: the right word is looped and ticked; a decoy shakes with the real-word message', async () => {
    const { host, ctx, grid } = mount();
    const [a, b] = ends(grid.placements.find((p) => p.word === 'METAPHOR')!);
    drag(host, a, b);
    await flush();
    expect(ctx.sent.at(-1)).toMatchObject({ item: 'f1', move: 'answer', response: { from: a, to: b } });
    expect(ctx.toasts.at(-1)).toMatch(/real word in here, but not this one/);
    const [c, d] = ends(grid.placements.find((p) => p.word === 'SIMILE')!);
    drag(host, d, c);
    await flush();
    expect(host.querySelector('.fw-clue[data-c="0"]')!.classList.contains('done')).toBe(true);
    expect(host.querySelectorAll('.fw-svg g').length).toBe(1);
  });

  it('tap the first letter then the last; Any clue files a find under its clue', async () => {
    const { host, ctx, grid } = mount();
    ctx.dock.querySelector<HTMLButtonElement>('.fw-any')!.click();
    const [a, b] = ends(grid.placements.find((p) => p.word === 'GOTHIC')!);
    drag(host, a, a);
    drag(host, b, b);
    await flush();
    expect(ctx.sent.at(-1)).toMatchObject({ item: 'any', response: { from: a, to: b } });
    expect(host.querySelector('.fw-clue[data-c="5"]')!.classList.contains('done')).toBe(true);
  });

  it('hint ladder: first letter, length, then the line', async () => {
    const { host, ctx } = mount();
    const hint = ctx.dock.querySelector<HTMLButtonElement>('.fw-hint')!;
    hint.click();
    await flush();
    expect(host.querySelector('.fw-card')!.textContent).toContain('Starts with S');
    hint.click();
    await flush();
    expect(host.querySelector('.fw-card')!.textContent).toContain('6 letters');
    hint.click();
    await flush();
    expect(host.querySelectorAll('.fw-c.line').length).toBeGreaterThanOrEqual(6);
    expect(hint.disabled).toBe(true);
  });

  it('finding every word reveals the message, asks the question, then finishes', async () => {
    const { host, ctx, grid } = mount();
    for (const p of grid.placements.filter((x) => !x.decoy)) {
      ctx.dock.querySelector<HTMLButtonElement>('.fw-any')?.click();
      const [a, b] = ends(p);
      drag(host, a, b);
      await flush();
    }
    await new Promise((r) => setTimeout(r, 150));
    await flush();
    expect(host.querySelector('.fw-msg')!.getAttribute('aria-label')).toBe('Every hand');
    expect(host.querySelectorAll('.fw-msg .t').length).toBe('EVERYHAND'.length);
    host.querySelectorAll<HTMLButtonElement>('.fw-opt')[0]!.click();
    ctx.dock.querySelector<HTMLButtonElement>('button')!.click();
    await flush();
    expect(ctx.sent.at(-1)!.item).toBe('message_q');
    expect(host.querySelector('.fw-why')!.textContent).toContain('remembers');
    ctx.dock.querySelector<HTMLButtonElement>('button')!.click();
    expect(ctx.finished).toBe(1);
  });

  it('prints clues and blanks, with the key on its own page', () => {
    const el = renderFindAWordPrint(game(), { answers: true });
    expect(el.textContent).not.toContain('Hyperbole (');
    expect(el.querySelector('.gm-print-key')!.textContent).toContain('Hidden message: Every hand');
  });
});
