import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublishedLesson } from '@/schemas/published-lesson';
import type { Lesson } from '@/schemas/lesson';
import type { Arcade, EventResult, GameClient, SoloEvent } from '@/games/api';
import { mountGameArcade } from '@/games/arcade';
import { registerPlayer, registerPrint, unregisterForTests, type PlayerContext } from '@/games/solo/registry';
import { cleanVsHinted, formatTime, openSoloPlayer } from '@/games/solo/shell';
import { renderGamesForPrint } from '@/games/print';
import { renderPrintLesson } from '@/print/render-print-lesson';
import { setCalm } from '@/games/motion/motion';

// Invented content only.
const pub = (over: Record<string, unknown> = {}) => ({ id: 'g_cross', title: 'Technique crossword', kind: 'crossword', solo: true, live: true, count: 3, settings: {}, items: [], ...over });
const lesson = {
  lesson_id: 'lesson_gm',
  title: 'Harbour Lights games',
  blocks: [],
  published_at: '2026-11-09T09:00:00.000Z',
  schema_version: 1,
  pedagogical_mode: 'game',
  game: { version: 'v1', games: [pub(), pub({ id: 'g_wall', title: 'Points rush', kind: 'points_rush', count: 16 })] }
} as unknown as PublishedLesson;

const arcade = (over: Partial<Arcade> = {}): Arcade => ({ identity: { need: null, initials: 'AB' }, games: [], closed: false, results: {}, ...over });

function fakeClient() {
  const sent: SoloEvent[][] = [];
  let plays = 0;
  const c = {
    sent,
    load: vi.fn(async () => arcade()),
    claim: vi.fn(async () => arcade()),
    start: vi.fn(async () => ({ play_id: `play_${++plays}`, game: null })),
    send: vi.fn(async (_g: string, _p: string, events: SoloEvent[]) => {
      sent.push(events);
      return { results: events.map((e): EventResult => ({ item: e.item, ...(e.move === 'answer' ? { correct: e.response === 'right' } : {}) })) };
    }),
    finish: vi.fn(async () => ({ score: { right: 2, answered: 3, total: 3 }, best: { play_id: 'play_1', right: 2, answered: 3, at: '' }, latest: { play_id: 'play_1', right: 2, answered: 3, at: '' }, boxed: 1 }))
  };
  return c;
}

/** A stub player: three buttons in the dock, each sends a move. */
let ctxSeen: PlayerContext | null = null;
const disposed = vi.fn();
function registerStub() {
  registerPlayer('crossword', {
    mount(host, ctx) {
      ctxSeen = ctx;
      host.append(Object.assign(document.createElement('p'), { className: 'stub', textContent: `Stub ${ctx.game.title}` }));
      ctx.setStatus('0 of 3');
      return { dispose: disposed, onKey: (e) => e.key === 'ArrowRight' };
    }
  });
}

const flush = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise((r) => setTimeout(r, 0));
};

beforeEach(() => {
  localStorage.clear();
  setCalm(true);
  ctxSeen = null;
  disposed.mockClear();
});
afterEach(() => {
  unregisterForTests('crossword');
  document.querySelectorAll('.gm-solo').forEach((n) => n.remove());
  document.body.replaceChildren();
  document.documentElement.classList.remove('gm-solo-open');
});

function mountArcade(c: GameClient) {
  const host = document.createElement('div');
  document.body.append(host);
  mountGameArcade(host, { lesson, classId: 'class_gm', client: c, renderHero: () => undefined });
  return host;
}

describe('registry in the arcade', () => {
  it('a kind with no player still says Coming next', async () => {
    // Every kind now has a player somewhere in the bundle; take points rush's away for this test.
    unregisterForTests('points_rush');
    const c = fakeClient();
    const host = mountArcade(c);
    await flush();
    host.querySelector<HTMLButtonElement>('[data-game-id="g_wall"] .gm-card__play')!.click();
    expect(host.querySelector('[data-game-id="g_wall"] .gm-card__soon')?.textContent).toContain('Coming next');
    expect(document.querySelector('.gm-solo')).toBeNull();
    expect(c.start).not.toHaveBeenCalled();
  });

  it('a registered kind opens the solo shell and starts a play', async () => {
    registerStub();
    const c = fakeClient();
    const host = mountArcade(c);
    await flush();
    host.querySelector<HTMLButtonElement>('[data-game-id="g_cross"] .gm-card__play')!.click();
    await flush();
    const shell = document.querySelector('.gm-solo')!;
    expect(shell.getAttribute('role')).toBe('dialog');
    expect(c.start).toHaveBeenCalledWith('g_cross');
    expect(shell.querySelector('.stub')?.textContent).toBe('Stub Technique crossword');
    expect(shell.querySelector('.gm-solo__status')?.textContent).toBe('0 of 3');
    expect(ctxSeen?.playId).toBe('play_1');
    expect(document.documentElement.classList.contains('gm-solo-open')).toBe(true);
  });
});

describe('solo shell', () => {
  it('batches moves, saves every one before finishing, then shows the finish card', async () => {
    registerStub();
    const c = fakeClient();
    const onClose = vi.fn();
    const shell = openSoloPlayer({ game: pub() as never, client: c, onClose });
    await flush();
    const ctx = ctxSeen!;
    void ctx.emit({ item: 't1', move: 'answer', response: 'right' });
    void ctx.emit({ item: 't2', move: 'hint' });
    void ctx.emit({ item: 't2', move: 'answer', response: 'right' });
    void ctx.emit({ item: 't3', move: 'answer', response: 'wrong' });
    await flush();
    expect(c.send).not.toHaveBeenCalled();
    ctx.finish();
    await flush();
    expect(c.sent.flat().map((e) => e.item)).toEqual(['t1', 't2', 't2', 't3']);
    expect(c.finish).toHaveBeenCalledWith('g_cross', 'play_1');
    expect(c.send.mock.invocationCallOrder[0]).toBeLessThan(c.finish.mock.invocationCallOrder[0]);
    const card = shell.root.querySelector('.gm-finish')!;
    expect(card.querySelector('.gm-finish__num')?.textContent).toBe('2');
    expect(card.textContent).toContain('/ 3');
    const stats = Object.fromEntries([...card.querySelectorAll('.gm-finish__stat')].map((d) => [d.querySelector('dt')!.textContent, d.querySelector('dd')!.textContent]));
    expect(stats).toMatchObject({ Clean: '1', 'With hints': '1', Best: '2/3', Latest: '2/3' });
    expect(stats.Time).toMatch(/^\d+:\d{2}$/);
    expect(card.textContent).toContain('1 card goes back to box 1');
    expect(disposed).toHaveBeenCalled();
    const dock = [...shell.root.querySelectorAll('.gm-solo__dock button')].map((b) => b.textContent);
    expect(dock).toEqual(['Play again', 'Back to games']);
  });

  it('Play again starts a new play; Back to games closes and reports a finished play', async () => {
    registerStub();
    const c = fakeClient();
    const onClose = vi.fn();
    const shell = openSoloPlayer({ game: pub() as never, client: c, onClose });
    await flush();
    ctxSeen!.finish();
    await flush();
    [...shell.root.querySelectorAll<HTMLButtonElement>('.gm-solo__dock button')].find((b) => b.textContent === 'Play again')!.click();
    await flush();
    expect(c.start).toHaveBeenCalledTimes(2);
    expect(ctxSeen!.playId).toBe('play_2');
    shell.root.querySelector<HTMLButtonElement>('.gm-solo__back')!.click();
    await flush();
    expect(document.querySelector('.gm-solo')).toBeNull();
    expect(onClose).toHaveBeenCalledWith({ finished: true });
  });

  it('a network failure at finish keeps the answers and offers Try again', async () => {
    registerStub();
    const c = fakeClient();
    let down = true;
    c.send.mockImplementation(async (_g, _p, events) => {
      if (down) throw Object.assign(new Error('Network request failed'), { code: 'network_error' });
      c.sent.push(events);
      return { results: events.map((e) => ({ item: e.item })) };
    });
    const shell = openSoloPlayer({ game: pub() as never, client: c, queue: { retryDelaysMs: [1], drainAttempts: 1 } });
    await flush();
    void ctxSeen!.emit({ item: 't1', move: 'answer', response: 'right' });
    ctxSeen!.finish();
    await flush();
    expect(c.finish).not.toHaveBeenCalled();
    expect(shell.root.querySelector('[role="alert"]')?.textContent).toContain('kept here');
    down = false;
    shell.root.querySelector<HTMLButtonElement>('.gm-solo__dock button')!.click();
    await flush();
    expect(c.sent.flat().map((e) => e.item)).toEqual(['t1']);
    expect(c.finish).toHaveBeenCalledTimes(1);
    expect(shell.root.querySelector('.gm-finish')).toBeTruthy();
  });

  it('passes keys to the player and Escape closes', async () => {
    registerStub();
    const c = fakeClient();
    const shell = openSoloPlayer({ game: pub() as never, client: c });
    await flush();
    const right = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    shell.root.dispatchEvent(right);
    expect(right.defaultPrevented).toBe(true);
    shell.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await flush();
    expect(document.querySelector('.gm-solo')).toBeNull();
  });

  it('a failed start shows an error with Try again', async () => {
    registerStub();
    const c = fakeClient();
    c.start.mockRejectedValueOnce(new Error('Homework has closed.'));
    const shell = openSoloPlayer({ game: pub() as never, client: c });
    await flush();
    expect(shell.root.querySelector('[role="alert"]')?.textContent).toBe('Homework has closed.');
    shell.root.querySelector<HTMLButtonElement>('.gm-solo__dock button')!.click();
    await flush();
    expect(shell.root.querySelector('.stub')).toBeTruthy();
  });

  it('counts clean against hinted and formats time', () => {
    expect(cleanVsHinted(new Set(['a', 'b', 'c']), new Set(['b', 'x']))).toEqual({ clean: 2, hinted: 1 });
    expect(formatTime(134_000)).toBe('2:14');
  });
});

describe('print hook', () => {
  const draft = { games: [{ id: 'g_cross', kind: 'crossword', title: 'Technique crossword', items: [] }, { id: 'g_wager', kind: 'wager', title: '' }] } as never;

  it('kinds without a renderer print a one-line note', () => {
    const out = renderGamesForPrint(draft)!;
    expect(out.querySelectorAll('.gm-print__game')).toHaveLength(2);
    expect(out.textContent).toContain('Crossword: plays on screen.');
    expect(out.textContent).toContain('Wager');
  });

  it('a registered renderer prints the game with its answer key', () => {
    registerPrint('crossword', (game, { answers }) => {
      const d = document.createElement('div');
      d.className = 'cw-print';
      d.textContent = `grid for ${game.title}${answers ? ' + key' : ''}`;
      return d;
    });
    const doc = renderPrintLesson({ id: 'lesson_gm', title: 'Harbour Lights games', pedagogical_mode: 'game', blocks: [], game: draft } as unknown as Lesson);
    expect(doc.querySelector('.cw-print')?.textContent).toBe('grid for Technique crossword + key');
  });

  it('a lesson that is not a game prints no games', () => {
    const doc = renderPrintLesson({ id: 'l', title: 'Plain', blocks: [] } as unknown as Lesson);
    expect(doc.querySelector('.gm-print')).toBeNull();
  });
});
