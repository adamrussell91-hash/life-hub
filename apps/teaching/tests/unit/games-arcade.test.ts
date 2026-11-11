import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublishedLesson } from '@/schemas/published-lesson';
import type { Arcade, GameClient } from '@/games/api';
import { mountGameArcade } from '@/games/arcade';
import { canvasShowsOn } from '@/games/editor-tabs';
import { unregisterForTests } from '@/games/solo/registry';

// Invented content only.
const pub = (over: Record<string, unknown> = {}) => ({ id: 'g', title: '', kind: 'crossword', solo: true, live: true, count: 6, settings: {}, items: [], ...over });
const lesson = {
  lesson_id: 'lesson_gm',
  title: 'Harbour Lights games',
  blocks: [],
  published_at: '2026-11-09T09:00:00.000Z',
  schema_version: 1,
  pedagogical_mode: 'game',
  game: {
    version: 'v1',
    homework_closes_at: '2026-12-18T08:00:00.000Z',
    games: [pub({ id: 'g_cross', title: 'Technique crossword' }), pub({ id: 'g_wager', title: 'Wager on the novel', kind: 'wager', solo: false, count: 5 })]
  }
} as unknown as PublishedLesson;

const arcade = (over: Partial<Arcade> = {}): Arcade => ({ identity: { need: null, initials: 'AB' }, games: [], closed: false, results: {}, ...over });
const client = (first: Arcade, claimed?: Arcade): GameClient => ({
  load: vi.fn(async () => first),
  claim: vi.fn(async () => claimed ?? first),
  start: vi.fn(),
  send: vi.fn(),
  finish: vi.fn()
});
const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(c: GameClient | null) {
  const host = document.createElement('div');
  document.body.append(host);
  mountGameArcade(host, { lesson, classId: 'class_gm', client: c, renderHero: (h) => h.append(Object.assign(document.createElement('p'), { textContent: 'Game' })) });
  return host;
}

afterEach(() => document.body.replaceChildren());

describe('game arcade', () => {
  it('shows a card per game with glyph, kind, chips and best and latest', async () => {
    const host = mount(client(arcade({ results: { g_cross: { best: { play_id: 'a', right: 5, answered: 6, at: '' }, latest: { play_id: 'b', right: 4, answered: 6, at: '' }, plays: 2 } } })));
    await flush();
    const cards = host.querySelectorAll('.gm-card');
    expect(cards).toHaveLength(2);
    const cross = host.querySelector('[data-game-id="g_cross"]')!;
    expect(cross.querySelector('.gm-glyph svg')).toBeTruthy();
    expect(cross.textContent).toContain('Crossword · 6 clues');
    expect(cross.textContent).toContain('Best 5/6');
    expect(cross.textContent).toContain('Latest 4/6');
    expect(cross.querySelector('.gm-chip--live')).toBeTruthy();
    expect(host.textContent).toContain('Homework closes 18/12/26.');
    expect(host.textContent).not.toMatch(/null|undefined/);
  });

  it('solo games say Play, then a polite Coming next; live-only games wait for the teacher', async () => {
    const host = mount(client(arcade()));
    await flush();
    const wager = host.querySelector('[data-game-id="g_wager"]')!;
    expect(wager.querySelector('button')).toBeNull();
    expect(wager.textContent).toContain('Waiting for your teacher');
    const play = host.querySelector<HTMLButtonElement>('[data-game-id="g_cross"] .gm-card__play')!;
    expect(play.textContent).toBe('Play');
    // Crossword has a player now (Phase 3): take it away to see the Coming next path.
    unregisterForTests('crossword');
    play.click();
    expect(host.querySelector('[data-game-id="g_cross"] .gm-card__soon')?.textContent).toContain('Coming next');
  });

  it('asks for initials, then claims', async () => {
    const c = client(arcade({ identity: { need: 'initials', initials: null } }), arcade());
    const host = mount(c);
    await flush();
    const input = host.querySelector<HTMLInputElement>('.gm-gate input')!;
    input.value = 'ab';
    host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(c.claim).toHaveBeenCalledWith('ab');
    expect(host.querySelector('.gm-gate')).toBeNull();
  });

  it('closed homework: solo games say so', async () => {
    const host = mount(client(arcade({ closed: true })));
    await flush();
    expect(host.querySelector('[data-game-id="g_cross"]')?.textContent).toContain('Homework closed');
    expect(host.querySelector('.gm-card__play')).toBeNull();
  });

  it('without a class link, asks to open it from the class page', () => {
    const host = mount(null);
    expect(host.querySelector('.gm-gate')?.textContent).toContain('class page');
  });

  it('the block canvas shows only on Before you play', () => {
    expect(canvasShowsOn('before')).toBe(true);
    expect(canvasShowsOn('games')).toBe(false);
    expect(canvasShowsOn('results')).toBe(false);
  });
});
