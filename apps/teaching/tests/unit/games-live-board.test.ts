import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LiveOpen } from '@/games/api';
import type { PublicGame } from '@/games/core/schema';
import type { RoomView, Seat } from '@/games/core/room-protocol';
import { setCalm } from '@/games/motion/motion';
import { openLiveBoard } from '@/games/live/board';
import { qrMatrix } from '@/games/live/qr';
import { FakeWS, makeView } from './games-live-fakes';

// Invented content only. Full names live nowhere in a room view; the board must only ever show initials.
const WORDS = ['Sibilance', 'Assonance', 'Plosives', 'Rhyme', 'Crypt', 'Turret', 'Moor', 'Cellar', 'Unreliable', 'Omniscient', 'Naive', 'Intrusive', 'Dramatic', 'Situational', 'Verbal', 'Cosmic'];
const WALL: PublicGame = {
  id: 'g_wall', title: 'Week 5 wall', kind: 'connections', solo: false, live: true, count: 16, settings: { mistakes: 4 },
  walls: [{ id: 'w1', title: 'Wall one', tiles: WORDS.map((text, k) => ({ id: `t${k}`, text })) }]
} as unknown as PublicGame;
const OPEN: LiveOpen = { room: 'room_test_0001', code: '482913', teacher_ticket: 'tkt.teacher', board_ticket: 'tkt.board', ws_base: 'wss://rooms.test/g', http_base: 'https://rooms.test/g', game_id: 'g_wall', join_url: 'https://class.test/?join=482913', game: WALL };

const INITIALS = ['AB', 'CD', 'EF', 'GH', 'IJ', 'KL', 'MN', 'OP'];
const seats = (n: number, over: Partial<Seat> = {}): Seat[] => INITIALS.slice(0, n).map((initials, k) => ({ owner: `own_${initials.toLowerCase()}`, initials, connected: true, score: 8 - k, ...over }));

function board(open: LiveOpen = OPEN) {
  const host = document.createElement('div');
  document.body.append(host);
  const b = openLiveBoard({ open, host, connect: { WebSocketImpl: FakeWS, fetchImpl: undefined } });
  const ws = FakeWS.last();
  ws.open();
  let seq = 1;
  const snap = (over: Partial<RoomView>) => ws.push({ t: 'snapshot', view: makeView({ seq, ...over }) });
  const patch = (p: Partial<RoomView>) => {
    seq += 1;
    ws.push({ t: 'delta', seq, now: Date.now(), patch: p });
  };
  return { b, root: b.root, ws, snap, patch };
}

beforeEach(() => {
  setCalm(true);
  FakeWS.reset();
});
afterEach(() => document.body.replaceChildren());

describe('live board', () => {
  it('lobby: the QR opens this lesson for the class with the code, since the class site has no join page of its own', () => {
    const { root, snap } = board({ ...OPEN, join_url: undefined, lesson_id: 'lesson_t1', class_id: 'class_t1' });
    snap({ seats: [] });
    const label = root.querySelector('.gl-qr svg')?.getAttribute('aria-label') ?? '';
    expect(label).toMatch(/\/s\/classes\/class_t1\/lessons\/lesson_t1\?join=482913$/);
    expect(root.textContent).not.toMatch(/Go to class\./);
    expect(root.querySelector('.gl-join-card__code')?.textContent).toMatch(/Join live game/);
  });

  it('lobby: huge code, a QR, and a chip per student as they join', () => {
    const { root, ws, snap, patch } = board();
    expect(ws.url).toBe('wss://rooms.test/g/rooms/room_test_0001/ws?ticket=tkt.board');
    snap({ seats: [] });
    expect(root.querySelector('.gl-join-card__code')?.textContent?.replace(/\s/g, '')).toMatch(/482913$/);
    expect(root.querySelector('.gl-qr svg path')).toBeTruthy();
    expect(root.querySelectorAll('.gl-chip')).toHaveLength(0);
    patch({ seats: seats(1) });
    patch({ seats: seats(3) });
    const chips = [...root.querySelectorAll('.gl-chip')].map((c) => c.querySelector('.gl-chip__i')?.textContent);
    expect(chips).toEqual(['AB', 'CD', 'EF']);
    expect(root.querySelector('.gl-lobby__count')?.textContent).toContain('3 players here');
  });

  it('race: the projected leaderboard shows the top five only, initials only', () => {
    const { root, snap } = board();
    const all = seats(8, { progress: { done: 1, total: 4, mistakes: 0, mistakes_max: 4, groups: [1] } });
    snap({ phase: 'playing', seats: all, leaderboard: all.map((s, k) => ({ initials: s.initials, score: s.score, rank: k + 1 })) });
    const projected = root.querySelector<HTMLElement>('.gl-race__side')!;
    const rows = [...projected.querySelectorAll('.gl-lb__row')];
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.querySelector('.gl-lb__name')?.textContent)).toEqual(['AB', 'CD', 'EF', 'GH', 'IJ']);
    // The race wall shows everyone by initials; nothing else names a student.
    expect(root.querySelectorAll('.gl-card')).toHaveLength(8);
    const visible = [...root.querySelectorAll<HTMLElement>('.gl-stage, .gl-top')].map((n) => n.textContent).join(' ');
    for (const s of all) expect(visible).not.toContain(s.owner);
    // The teacher's full ranks stay closed until asked for.
    expect(root.querySelector<HTMLElement>('.gl-ranks')!.hidden).toBe(true);
  });

  it('shows the pause overlay while the room is paused', () => {
    const { root, snap, patch } = board();
    snap({ phase: 'playing', seats: seats(2) });
    const pause = root.querySelector<HTMLElement>('.gl-pause')!;
    expect(pause.hidden).toBe(true);
    patch({ phase: 'paused' });
    expect(pause.hidden).toBe(false);
    patch({ phase: 'playing' });
    expect(pause.hidden).toBe(true);
  });

  it('podium: two teams stand on two steps, winner in the middle, no empty third step', () => {
    const { root, snap } = board();
    snap({
      phase: 'ended',
      kind: 'jeopardy',
      style: 'custom',
      leaderboard: [
        { initials: 'Otters', score: 1370, rank: 1, team: 1 },
        { initials: 'Kestrels', score: 420, rank: 2, team: 0 }
      ],
      teams: [
        { team: 0, score: 420, rank: 2, members: ['AB', 'CD'] },
        { team: 1, score: 1370, rank: 1, members: ['EF', 'GH'] }
      ]
    } as Partial<RoomView>);
    const pods = [...root.querySelectorAll<HTMLElement>('.gl-pod')];
    expect(pods.map((p) => p.querySelector('.gl-pod__block')?.textContent)).toEqual(['2', '1']);
    expect(root.querySelector('.gl-pod--p1 .gl-pod__name')?.textContent).toBe('Otters');
    expect(root.querySelector('.gl-pod--p3')).toBeNull();
  });

  it('Start sends a control with a request id', () => {
    const { root, ws, snap } = board();
    snap({ seats: seats(2) });
    const start = [...root.querySelectorAll<HTMLButtonElement>('.gl-controls button')].find((b) => /^Start/.test(b.textContent ?? ''));
    expect(start).toBeTruthy();
    start!.click();
    const [c] = ws.sentOf('control');
    expect(c.op).toEqual({ op: 'start' });
    expect(c.rid).toBeTruthy();
  });
});

describe('QR encoder', () => {
  it('makes a square matrix with three finder patterns', () => {
    const m = qrMatrix('https://class.test/?join=482913');
    const n = m.length;
    expect(n).toBeGreaterThanOrEqual(21);
    expect((n - 17) % 4).toBe(0);
    for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
      // Finder: dark ring, light ring, dark 3×3 core.
      expect(m[r][c]).toBe(true);
      expect(m[r + 1][c + 1]).toBe(false);
      expect(m[r + 3][c + 3]).toBe(true);
    }
  });
});
