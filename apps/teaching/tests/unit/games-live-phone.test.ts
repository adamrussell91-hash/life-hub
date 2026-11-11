import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveJoin } from '@/games/api';
import type { PublicGame } from '@/games/core/schema';
import type { RoomView, Seat } from '@/games/core/room-protocol';
import { setCalm } from '@/games/motion/motion';
import { openLivePhone } from '@/games/live/phone';
import { FakeWS, makeView } from './games-live-fakes';

// Invented content only.
const GROUPS = [
  ['Sibilance', 'Assonance', 'Plosives', 'Rhyme'],
  ['Crypt', 'Turret', 'Moor', 'Cellar'],
  ['Unreliable', 'Omniscient', 'Naive', 'Intrusive'],
  ['Dramatic', 'Situational', 'Verbal', 'Cosmic']
];
const tileId = (gi: number, ti: number) => `t${gi}${ti}`;
const WALL: PublicGame = {
  id: 'g_wall', title: 'Week 5 wall', kind: 'connections', solo: false, live: true, count: 16, settings: { mistakes: 4 },
  walls: [{ id: 'w1', title: 'Wall one', tiles: GROUPS.flatMap((g, gi) => g.map((text, ti) => ({ id: tileId(gi, ti), text }))) }]
} as unknown as PublicGame;
const CAST = [
  { id: 'c_ida', name: 'Ida Marsh' },
  { id: 'c_fenn', name: 'Old Fenn' },
  { id: 'c_rook', name: 'Captain Rook' }
];
const WHO: PublicGame = {
  id: 'g_who', title: 'Who said it on the Salt Road', kind: 'who_said_it', solo: false, live: true, count: 2, settings: { seconds: 20 }, cast: CAST,
  items: [{ id: 'q1', shape: 'quote', text: 'The road remembers every cart.' }, { id: 'q2', shape: 'quote', text: 'Honestly, it is just a road.' }]
} as unknown as PublicGame;

const ME: Seat = { owner: 'own_ab', initials: 'AB', connected: true, score: 0 };

function joinReply(game: PublicGame): LiveJoin {
  return { room: 'room_test_0001', ticket: 'tkt.sig', ws_base: 'wss://rooms.test/g', http_base: 'https://rooms.test/g', initials: 'AB', game_id: game.id };
}

const settle = async () => {
  for (let i = 0; i < 30; i += 1) await new Promise((r) => setTimeout(r, 0));
};

async function joined(game: PublicGame, style: 'race' | 'paced') {
  const join = vi.fn(async () => joinReply(game));
  const host = document.createElement('div');
  document.body.append(host);
  const phone = openLivePhone({ game, join, host, connect: { WebSocketImpl: FakeWS, fetchImpl: undefined } });
  const root = phone.root;
  const dockButton = (text: string) => [...root.querySelectorAll<HTMLButtonElement>('.gm-solo__dock button')].find((b) => b.textContent === text);
  const boxes = [...root.querySelectorAll<HTMLInputElement>('.gl-code__box')];
  boxes[0].value = '482913';
  boxes[0].dispatchEvent(new Event('input'));
  dockButton('Join')!.click();
  await settle();
  expect(join).toHaveBeenCalledWith(game.id, '482913');
  const ws = FakeWS.last();
  ws.open();
  // Like the room: a student's view has no seats, only `you` and the top five.
  const base = makeView({ kind: game.kind, style, title: game.title, seats: [], you: { owner: ME.owner, seat: ME } });
  ws.push({ t: 'snapshot', view: base });
  let seq = base.seq;
  const patch = (p: Partial<RoomView>) => {
    seq += 1;
    ws.push({ t: 'delta', seq, now: Date.now(), patch: p });
  };
  return { phone, root, ws, patch, dockButton, base };
}

beforeEach(() => {
  setCalm(true);
  FakeWS.reset();
});
afterEach(() => document.body.replaceChildren());

describe('live phone', () => {
  it('joins with the code and shows You’re in with the initials', async () => {
    const { root } = await joined(WALL, 'race');
    expect(root.querySelector('.gl-in__badge')?.textContent).toBe('AB');
    expect(root.querySelector('.gl-in__h')?.textContent).toBe('You’re in');
  });

  it('race: mounts the solo player and a move goes to the room, resolved by its ack', async () => {
    const { root, ws, patch, dockButton } = await joined(WALL, 'race');
    patch({ phase: 'playing', you: { owner: ME.owner, seat: ME, rank: 1 } });
    await settle();
    expect(root.querySelectorAll('.cx-tile')).toHaveLength(16);
    // No rank while nobody has scored.
    expect(root.querySelector('.gm-solo__status')?.textContent).toBe('0 of 4 groups');
    patch({ leaderboard: [{ initials: 'CD', score: 1, rank: 1 }], you: { owner: ME.owner, seat: ME, rank: 2 } });
    expect(root.querySelector('.gm-solo__status')?.textContent).toBe('0 of 4 groups · 2nd');
    for (let ti = 0; ti < 4; ti += 1) root.querySelector<HTMLButtonElement>(`.cx-tile[data-id="${tileId(0, ti)}"]`)!.click();
    dockButton('Submit')!.click();
    await settle();
    const [move] = ws.sentOf('move');
    expect(move.event).toMatchObject({ item: 'w1', move: 'guess', response: { tiles: [0, 1, 2, 3].map((ti) => tileId(0, ti)) } });
    ws.push({ t: 'ack', rid: move.rid, result: { item: 'w1', correct: true, reveal: { group: { id: 'grp1', label: 'Sound devices', why: 'Sound.', difficulty: 1, tiles: [0, 1, 2, 3].map((ti) => tileId(0, ti)) } } } as never });
    await settle();
    expect(root.querySelector('.gm-solo__body')?.textContent).toContain('Sound devices');
  });

  it('frosts the screen while paused', async () => {
    const { root, patch } = await joined(WALL, 'race');
    patch({ phase: 'playing' });
    await settle();
    const pause = root.querySelector<HTMLElement>('.gl-pause')!;
    expect(pause.hidden).toBe(true);
    patch({ phase: 'paused' });
    expect(pause.hidden).toBe(false);
    patch({ phase: 'playing' });
    expect(pause.hidden).toBe(true);
  });

  it('paced: picks a card, locks in once, then shows Right · +points after the reveal', async () => {
    const { root, ws, patch, dockButton } = await joined(WHO, 'paced');
    const t = Date.now();
    const item = { item: 'q1', index: 0, of: 2, opened_at: t, ends_at: t + 20_000, answered: [] as string[] };
    patch({ phase: 'playing', item });
    await settle();
    const cards = [...root.querySelectorAll<HTMLButtonElement>('.ws-pc')];
    expect(cards).toHaveLength(3);
    expect(dockButton('Nobody: it’s fake')).toBeTruthy();
    expect(dockButton('Lock in')!.disabled).toBe(true);
    cards[0].click();
    expect(root.querySelector('.ws-pick')?.textContent).toContain('Ida Marsh');
    dockButton('Lock in')!.click();
    await settle();
    const [move] = ws.sentOf('move');
    expect(move.event).toMatchObject({ item: 'q1', move: 'answer', response: { speaker: 'c_ida' } });
    ws.push({ t: 'ack', rid: move.rid, result: { item: 'q1' } });
    await settle();
    expect(root.textContent).toContain('Locked in');
    patch({
      item: { ...item, answered: ['own_ab'], revealed: { counts: { c_ida: 1, fake: 1 }, reveal: { speaker: 'c_ida', source: 'Chapter 1' } } },
      you: { owner: ME.owner, seat: { ...ME, score: 120 }, last: { item: 'q1', correct: true }, rank: 1 }
    });
    await settle();
    expect(root.querySelector('.ws-result .ws-big')?.textContent).toBe('+120');
    expect(root.querySelector('.gm-solo__toast')?.textContent).toBe('Right · +120');
  });

  it('treats the room’s kick close code as final', async () => {
    const { root, ws } = await joined(WALL, 'race');
    ws.readyState = 3;
    ws.onclose?.({ code: 4003 });
    expect(root.querySelector('.gl-gone__h')?.textContent).toBe('You’re out of this game');
    expect(FakeWS.all).toHaveLength(1);
  });

  it('says so politely when replaced or kicked', async () => {
    const one = await joined(WALL, 'race');
    one.ws.push({ t: 'replaced' });
    expect(one.root.querySelector('.gl-gone__h')?.textContent).toBe('Playing on another device');
    document.body.replaceChildren();
    const two = await joined(WALL, 'race');
    two.ws.push({ t: 'kicked' });
    expect(two.root.querySelector('.gl-gone__h')?.textContent).toBe('You’re out of this game');
  });
});
