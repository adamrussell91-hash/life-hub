import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventResult, SoloEvent } from '@/games/api';
import type { Game, PublicGame } from '@/games/core/schema';
import { setCalm } from '@/games/motion/motion';
import { playerFor, printFor, type PlayerContext } from '@/games/solo/registry';
import { tileFontPx } from '@/games/kinds/connections/player';
import '@/games/kinds';

// Invented content only.
const GROUPS = [
  { id: 'g_sound', label: 'Sound devices', why: 'Each works on how words sound.', difficulty: 1, tiles: ['Sibilance', 'Assonance', 'Plosives', 'Rhyme'] },
  { id: 'g_place', label: 'Gothic places', why: 'Places that trap a character.', difficulty: 2, tiles: ['Crypt', 'Turret', 'Moor', 'Cellar'] },
  { id: 'g_narr', label: 'Kinds of narrator', why: 'Who tells it, and how far to trust them.', difficulty: 3, tiles: ['Unreliable', 'Omniscient', 'Naive', 'Intrusive'] },
  { id: 'g_irony', label: '___ irony', why: 'Cosmic and Omniscient both sound god-like.', difficulty: 4, tiles: ['Dramatic', 'Situational', 'Verbal', 'Cosmic'] }
];
const tileId = (w: string, gi: number, ti: number) => `${w}t${gi}${ti}`;
const wallTiles = (w: string) => GROUPS.flatMap((g, gi) => g.tiles.map((text, ti) => ({ id: tileId(w, gi, ti), text })));
const groupIds = (w: string, gi: number) => GROUPS[gi].tiles.map((_, ti) => tileId(w, gi, ti));

function publicGame(walls = ['w1'], mistakes = 4): PublicGame {
  return { id: 'g_wall', title: 'Week 5 wall', kind: 'connections', solo: true, live: true, count: 16 * walls.length, settings: { mistakes }, walls: walls.map((id) => ({ id, title: id === 'w1' ? 'Wall one' : 'Wall two', tiles: wallTiles(id) })) };
}

/** The server's marking, in miniature: right groups come back with their reveal; a pass shows every group when `revealAll`. */
function serverEmit(revealAll: boolean) {
  return vi.fn(async (e: SoloEvent): Promise<EventResult> => {
    const w = e.item;
    const groups = GROUPS.map((g, gi) => ({ id: g.id, label: g.label, why: g.why, difficulty: g.difficulty, tiles: groupIds(w, gi) }));
    if (e.move === 'pass') return revealAll ? ({ item: w, reveal: { groups } } as unknown as EventResult) : { item: w };
    const picked = (e.response as { tiles: string[] }).tiles;
    const hit = groups.find((g) => picked.every((t) => g.tiles.includes(t)));
    if (hit) return { item: w, correct: true, reveal: { group: hit } };
    const oneAway = groups.some((g) => picked.filter((t) => g.tiles.includes(t)).length === 3);
    return { item: w, correct: false, ...(oneAway ? { one_away: true as const } : {}) };
  });
}

function setup(opts: { walls?: string[]; mistakes?: number; revealAll?: boolean } = {}) {
  const host = document.createElement('div');
  const dock = document.createElement('div');
  document.body.append(host, dock);
  const emit = serverEmit(opts.revealAll ?? true);
  const ctx: PlayerContext = {
    game: publicGame(opts.walls, opts.mistakes),
    playId: 'play_1',
    emit,
    finish: vi.fn(),
    setActions: vi.fn((b: HTMLElement[]) => dock.replaceChildren(...b)),
    setStatus: vi.fn(),
    toast: vi.fn(),
    elapsedMs: () => 1000,
    calm: () => true,
    sfx: { tick: vi.fn(), lock: vi.fn(), right: vi.fn(), wrong: vi.fn(), reveal: vi.fn(), fanfare: vi.fn(), whoosh: vi.fn(), click: vi.fn(), ding: vi.fn(), buzz: vi.fn(), coin: vi.fn() } as unknown as PlayerContext['sfx']
  };
  const player = playerFor('connections')!.mount(host, ctx);
  const tile = (id: string) => host.querySelector<HTMLButtonElement>(`.cx-tile[data-id="${id}"]`)!;
  const dockButton = (text: string) => [...dock.querySelectorAll('button')].find((b) => b.textContent === text)!;
  const pick = (ids: string[]) => ids.forEach((id) => tile(id).click());
  return { host, dock, ctx, emit, player, tile, dockButton, pick };
}

const flush = async () => {
  for (let i = 0; i < 20; i += 1) await new Promise((r) => setTimeout(r, 0));
};

beforeEach(() => setCalm(true));
afterEach(() => document.body.replaceChildren());

describe('Connections player', () => {
  it('lays out sixteen tiles and enables Submit at four picks', () => {
    const { host, dockButton, pick } = setup();
    expect(host.querySelectorAll('.cx-wall .cx-tile')).toHaveLength(16);
    expect(dockButton('Submit').disabled).toBe(true);
    expect(dockButton('Deselect').disabled).toBe(true);
    pick(groupIds('w1', 0).slice(0, 3));
    expect(dockButton('Submit').disabled).toBe(true);
    pick([groupIds('w1', 1)[0], groupIds('w1', 1)[1]]);
    // A fifth pick is ignored.
    expect(host.querySelectorAll('.cx-tile.is-sel')).toHaveLength(4);
    expect(dockButton('Submit').disabled).toBe(false);
    dockButton('Deselect').click();
    expect(host.querySelectorAll('.cx-tile.is-sel')).toHaveLength(0);
  });

  it('a right guess sends the four tiles and slides the group to the top with its label and why', async () => {
    const { host, emit, dockButton, pick, ctx } = setup();
    pick(groupIds('w1', 2));
    dockButton('Submit').click();
    await flush();
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ item: 'w1', move: 'guess', response: { tiles: groupIds('w1', 2) } }), { now: true });
    const row = host.querySelector('.cx-wall > .cx-row')!;
    expect(row.classList.contains('cx-row--3')).toBe(true);
    expect(row.textContent).toContain('Kinds of narrator');
    expect(row.textContent).toContain('Who tells it, and how far to trust them.');
    expect(row.textContent).toContain('Unreliable, Omniscient, Naive, Intrusive');
    expect(host.querySelectorAll('.cx-wall .cx-tile')).toHaveLength(12);
    expect(ctx.setStatus).toHaveBeenLastCalledWith('1 of 4 groups');
  });

  it('a wrong guess costs a mistake, keeps the picks, and says "One away…" when three belong', async () => {
    const { host, dockButton, pick, ctx } = setup();
    pick([...groupIds('w1', 0).slice(0, 3), groupIds('w1', 1)[0]]);
    dockButton('Submit').click();
    await flush();
    expect(ctx.toast).toHaveBeenCalledWith('One away…');
    expect(host.querySelectorAll('.cx-left i.is-gone')).toHaveLength(1);
    expect(host.querySelectorAll('.cx-tile.is-sel')).toHaveLength(4);
    expect(host.querySelectorAll('.cx-row')).toHaveLength(0);
    // The same four again is not sent twice.
    dockButton('Submit').click();
    await flush();
    expect(ctx.toast).toHaveBeenLastCalledWith('Already guessed');
  });

  it('a wrong guess that is not close gives no one-away toast', async () => {
    const { dockButton, pick, ctx } = setup();
    pick([groupIds('w1', 0)[0], groupIds('w1', 1)[0], groupIds('w1', 2)[0], groupIds('w1', 3)[0]]);
    dockButton('Submit').click();
    await flush();
    expect(ctx.toast).not.toHaveBeenCalledWith('One away…');
  });

  it('out of mistakes reveals every group not found, then the end card with the guess history', async () => {
    const { host, emit, dockButton, pick, ctx } = setup({ mistakes: 2 });
    pick(groupIds('w1', 0));
    dockButton('Submit').click();
    await flush();
    for (const wrongPick of [
      [groupIds('w1', 1)[0], groupIds('w1', 2)[0], groupIds('w1', 3)[0], groupIds('w1', 1)[1]],
      [groupIds('w1', 1)[2], groupIds('w1', 2)[2], groupIds('w1', 3)[2], groupIds('w1', 1)[3]]
    ]) {
      dockButton('Deselect').click();
      pick(wrongPick);
      dockButton('Submit').click();
      await flush();
    }
    expect(emit).toHaveBeenCalledWith({ item: 'w1', move: 'pass' }, { now: true });
    const rows = [...host.querySelectorAll('.cx-row')];
    expect(rows).toHaveLength(4);
    expect(rows.filter((r) => r.classList.contains('cx-row--missed'))).toHaveLength(3);
    expect(host.querySelectorAll('.cx-wall .cx-tile')).toHaveLength(0);
    expect(host.querySelector('.cx-done')!.textContent).toContain('Out of mistakes');
    expect(host.querySelector('.cx-big')!.textContent).toBe('1 of 4');
    // Three guesses, four squares each, every tile coloured by its real group.
    expect(host.querySelectorAll('.cx-mini i')).toHaveLength(12);
    expect(host.querySelectorAll('.cx-mini .cx-mini--unknown')).toHaveLength(0);
    dockButton('See my score').click();
    expect(ctx.finish).toHaveBeenCalled();
  });

  it('out of mistakes without groups from the server leaves the rest as plain tiles', async () => {
    const { host, dockButton, pick } = setup({ mistakes: 1, revealAll: false });
    pick([groupIds('w1', 1)[0], groupIds('w1', 2)[0], groupIds('w1', 3)[0], groupIds('w1', 0)[0]]);
    dockButton('Submit').click();
    await flush();
    expect(host.querySelectorAll('.cx-row')).toHaveLength(0);
    expect(host.querySelectorAll('.cx-tile.is-left')).toHaveLength(16);
    expect([...host.querySelectorAll<HTMLButtonElement>('.cx-tile')].every((b) => b.disabled)).toBe(true);
    expect(host.querySelector('.cx-big')!.textContent).toBe('0 of 4');
  });

  it('solving the wall shows Perfect, then plays the next wall in sequence', async () => {
    const { host, dockButton, pick, ctx } = setup({ walls: ['w1', 'w2'] });
    for (let gi = 0; gi < 4; gi += 1) {
      pick(groupIds('w1', gi));
      dockButton('Submit').click();
      await flush();
    }
    expect(host.querySelector('.cx-done')!.textContent).toContain('Wall solved');
    expect(host.querySelector('.cx-big')!.textContent).toBe('Perfect');
    expect(ctx.setStatus).toHaveBeenLastCalledWith('Wall 1 of 2 · 4 of 4 groups');
    dockButton('Next wall').click();
    expect(host.querySelectorAll('.cx-wall .cx-tile')).toHaveLength(16);
    expect(host.querySelector('.cx-tile')!.getAttribute('data-id')!.startsWith('w2')).toBe(true);
    expect(host.querySelector('.cx-done')).toBeNull();
  });

  it('plays from the keyboard: arrows move, Space picks, Enter submits', async () => {
    const { host, emit, player, tile } = setup();
    const key = (k: string) => player.onKey!(new KeyboardEvent('keydown', { key: k }));
    expect(key('ArrowRight')).toBe(true);
    const tiles = [...host.querySelectorAll<HTMLButtonElement>('.cx-tile')];
    expect(document.activeElement).toBe(tiles[0]);
    expect(key('ArrowDown')).toBe(true);
    expect(document.activeElement).toBe(tiles[4]);
    for (const id of groupIds('w1', 0)) {
      tile(id).focus();
      expect(key(' ')).toBe(true);
    }
    expect(host.querySelectorAll('.cx-tile.is-sel')).toHaveLength(4);
    expect(key('Enter')).toBe(true);
    await flush();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(host.querySelectorAll('.cx-row')).toHaveLength(1);
  });

  it('sizes tile text by its longest word', () => {
    expect(tileFontPx('Moor')).toBe(13);
    expect(tileFontPx('Situational')).toBe(10.5);
    expect(tileFontPx('Onomatopoeias')).toBe(9.5);
    expect(tileFontPx('Big red bus')).toBe(13);
  });
});

describe('Connections print', () => {
  const full = {
    id: 'g_wall',
    title: 'Week 5 wall',
    kind: 'connections',
    walls: [{ id: 'w1', title: 'Wall one', groups: GROUPS.map((g) => ({ ...g, shape: 'group', pieces: [], outcomes: [], skills: [], tech: [] })) }],
    settings: { mistakes: 4 }
  } as unknown as Game;

  it('prints the sixteen tiles to cut up, and the groups only on the key page', () => {
    const out = printFor('connections')!(full, { answers: true });
    expect(out.querySelectorAll('.gm-print-cx__tile')).toHaveLength(16);
    const key = out.querySelector('.gm-print-key')!;
    expect(key.textContent).toContain('Sound devices');
    expect(key.textContent).toContain('Places that trap a character.');
    key.remove();
    for (const g of GROUPS) {
      expect(out.textContent).not.toContain(g.label);
      expect(out.textContent).not.toContain(g.why);
    }
  });

  it('leaves the key out for students', () => {
    const out = printFor('connections')!(full, { answers: false });
    expect(out.querySelector('.gm-print-key')).toBeNull();
    expect(out.querySelectorAll('.gm-print-cx__tile')).toHaveLength(16);
  });
});
