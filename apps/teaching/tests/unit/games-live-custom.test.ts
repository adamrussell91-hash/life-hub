import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveJoin, LiveOpen } from '@/games/api';
import type { PublicGame } from '@/games/core/schema';
import type { RoomView, Seat, TeamView } from '@/games/core/room-protocol';
import { setCalm } from '@/games/motion/motion';
import { openLiveBoard } from '@/games/live/board';
import { openLivePhone } from '@/games/live/phone';
import { registerLiveKind, type KindViewApi } from '@/games/live/kind-views';
import { FakeWS, makeView } from './games-live-fakes';

// The plug-in seam for kinds with their own rules (style 'custom'): the shells mount a registered live view.
// A dummy kind view stands in for a real one. Invented content only.

const KIND = 'battles';
const GAME = { id: 'g_dummy', title: 'Dummy battle', kind: KIND, solo: false, live: true, count: 1, settings: {} } as unknown as PublicGame;
const OPEN: LiveOpen = { room: 'room_test_0001', code: '482913', teacher_ticket: 'tkt.teacher', board_ticket: 'tkt.board', ws_base: 'wss://rooms.test/g', game_id: 'g_dummy', game: GAME };

type Probe = { side: 'board' | 'phone'; host: HTMLElement; api: KindViewApi; views: RoomView[]; disposed: boolean; keys: string[] };
let probes: Probe[] = [];
registerLiveKind(KIND, {
  board(host, api) {
    const p: Probe = { side: 'board', host, api, views: [], disposed: false, keys: [] };
    probes.push(p);
    host.append(Object.assign(document.createElement('div'), { className: 'dummy-board', textContent: 'Dummy board' }));
    return {
      update: (v) => void p.views.push(v),
      onKey: (e) => (e.key === 'x' ? (p.keys.push('x'), true) : false),
      controls: (v) => [
        { label: 'Spin', name: 'spin', data: { round: (v.kind_view as { round?: number } | undefined)?.round ?? 0 }, primary: true },
        { label: 'Skip', name: 'skip', key: 'K' }
      ],
      dispose: () => void (p.disposed = true)
    };
  },
  phone(host, api) {
    const p: Probe = { side: 'phone', host, api, views: [], disposed: false, keys: [] };
    probes.push(p);
    const go = Object.assign(document.createElement('button'), { textContent: 'Lock in' });
    api.setActions?.([go]);
    host.append(Object.assign(document.createElement('div'), { className: 'dummy-phone' }));
    return { update: (v) => void p.views.push(v), dispose: () => void (p.disposed = true) };
  }
});

const SEATS: Seat[] = ['AB', 'CD', 'EF', 'GH'].map((initials, k) => ({ owner: `own_${initials.toLowerCase()}`, initials, connected: true, score: 40 - k * 10, team: k % 2 }));
const TEAMS: TeamView[] = [
  { team: 0, name: 'Kestrels', score: 300, members: ['AB', 'EF'], rank: 1 },
  { team: 1, name: 'Otters', score: 200, members: ['CD', 'GH'], rank: 2 }
];
const TEAM_LB = [
  { initials: 'Kestrels', score: 300, rank: 1, team: 0 },
  { initials: 'Otters', score: 200, rank: 2, team: 1 }
];

function board() {
  const host = document.createElement('div');
  document.body.append(host);
  const b = openLiveBoard({ open: OPEN, host, connect: { WebSocketImpl: FakeWS, fetchImpl: undefined } });
  const ws = FakeWS.last();
  ws.open();
  let seq = 1;
  const snap = (over: Partial<RoomView>) => ws.push({ t: 'snapshot', view: makeView({ kind: KIND, style: 'custom', seq, ...over }) });
  const patch = (p: Partial<RoomView>) => {
    seq += 1;
    ws.push({ t: 'delta', seq, now: Date.now(), patch: p });
  };
  const button = (text: string) => [...b.root.querySelectorAll<HTMLButtonElement>('.gl-controls button')].find((x) => x.textContent === text);
  const controls = () => ws.sentOf('control').map((m) => m.op);
  return { b, root: b.root, ws, snap, patch, button, controls };
}

const key = (k: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
const settle = async () => {
  for (let i = 0; i < 30; i += 1) await new Promise((r) => setTimeout(r, 0));
};

beforeEach(() => {
  setCalm(true);
  FakeWS.reset();
  probes = [];
});
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('live board: kinds with their own rules', () => {
  it('mounts the kind’s board while playing, keeps it under the pause, and updates it with every view', () => {
    const { root, snap, patch } = board();
    snap({ phase: 'playing', seats: SEATS, kind_view: { round: 1 } });
    expect(probes).toHaveLength(1);
    const p = probes[0]!;
    expect(root.querySelector('.gl-kind__stage .dummy-board')).toBeTruthy();
    expect(p.views.at(-1)?.kind_view).toEqual({ round: 1 });
    patch({ phase: 'paused' });
    expect(root.querySelector<HTMLElement>('.gl-pause')!.hidden).toBe(false);
    expect(root.querySelector('.dummy-board')).toBeTruthy();
    expect(p.disposed).toBe(false);
    patch({ phase: 'playing', kind_view: { round: 2 } });
    expect(probes).toHaveLength(1);
    expect(p.views.map((v) => (v.kind_view as { round: number }).round)).toEqual([1, 1, 2]);
    expect(p.api.owner).toBe('board');
  });

  it('merges the kind’s controls into the bar, sends them as kind ops, and gives the kind its keys first', () => {
    const { snap, button, controls } = board();
    snap({ phase: 'playing', seats: SEATS, kind_view: { round: 3 } });
    const spin = button('Spin')!;
    expect(spin.classList.contains('gl-btn--primary')).toBe(true);
    expect(button('End')).toBeTruthy();
    spin.click();
    expect(controls().at(-1)).toEqual({ op: 'kind', name: 'spin', data: { round: 3 } });
    // Space runs the kind's primary button; its own key letter runs that button.
    key(' ');
    expect(controls().at(-1)).toEqual({ op: 'kind', name: 'spin', data: { round: 3 } });
    key('k');
    expect(controls().at(-1)).toEqual({ op: 'kind', name: 'skip' });
    // A key the kind handles never reaches the shell.
    const before = controls().length;
    key('x');
    expect(probes[0]!.keys).toEqual(['x']);
    expect(controls()).toHaveLength(before);
    // The kind's api sends the same op.
    void probes[0]!.api.control('reveal_pot', { n: 1 });
    expect(controls().at(-1)).toEqual({ op: 'kind', name: 'reveal_pot', data: { n: 1 } });
  });

  it('keeps the kind’s last screen a moment after the end, then the podium (teams rise for team games)', () => {
    vi.useFakeTimers();
    const { root, snap, patch } = board();
    snap({ phase: 'playing', seats: SEATS, teams: TEAMS, leaderboard: TEAM_LB });
    patch({ phase: 'ended', kind_view: { final: true } });
    expect(root.querySelector('.dummy-board')).toBeTruthy();
    expect(probes[0]!.views.at(-1)?.phase).toBe('ended');
    vi.advanceTimersByTime(1300);
    expect(probes[0]!.disposed).toBe(true);
    expect(root.querySelector('.dummy-board')).toBeNull();
    const pods = [...root.querySelectorAll('.gl-pod')];
    expect(pods.map((p) => p.querySelector('.gl-pod__name')?.textContent)).toEqual(['Otters', 'Kestrels', undefined]);
    expect(root.querySelector('.gl-pod--p1 .gl-av--team')?.textContent).toBe('1');
    expect(root.querySelector('.gl-pod--p1 .gl-pod__members')?.textContent).toBe('AB · EF');
  });

  it('a kind with no live view yet gets a polite state, not a crash', () => {
    const { root, snap, button } = board();
    snap({ kind: 'not_a_kind' as RoomView['kind'], phase: 'playing', seats: SEATS });
    expect(root.querySelector('.gl-kind')?.textContent).toContain('This game’s screens are coming');
    expect(button('End')).toBeTruthy();
  });

  it('team lobby: a column per team; tap a chip then a team to move it; shuffle', () => {
    const { root, snap, controls, button } = board();
    snap({ phase: 'lobby', seats: SEATS, teams: TEAMS });
    const cols = [...root.querySelectorAll<HTMLElement>('.gl-team')];
    expect(cols).toHaveLength(2);
    expect(cols.map((c) => [...c.querySelectorAll('.gl-chip__i')].map((x) => x.textContent))).toEqual([['AB', 'EF'], ['CD', 'GH']]);
    expect(cols[1]!.querySelector('.gl-team__head')?.textContent).toContain('Otters');
    root.querySelector<HTMLElement>('.gl-team [data-owner="own_ab"]')!.click();
    expect(root.querySelector('[data-owner="own_ab"]')?.classList.contains('is-picked')).toBe(true);
    root.querySelectorAll<HTMLElement>('.gl-team__head')[1]!.click();
    expect(controls().at(-1)).toEqual({ op: 'move_team', owner: 'own_ab', team: 1 });
    button('Shuffle teams')!.click();
    expect(controls().at(-1)).toEqual({ op: 'shuffle_teams' });
    // Drag works too.
    const drop = new Event('drop', { bubbles: true }) as Event & { dataTransfer: { getData(): string } };
    Object.assign(drop, { dataTransfer: { getData: () => 'own_cd' } });
    root.querySelectorAll<HTMLElement>('.gl-team')[0]!.dispatchEvent(drop);
    expect(controls().at(-1)).toEqual({ op: 'move_team', owner: 'own_cd', team: 0 });
  });

  it('team leaderboard: L lays the teams over the kind’s board, team badges, no student names', () => {
    const { root, snap } = board();
    snap({ phase: 'playing', seats: SEATS, teams: TEAMS, leaderboard: TEAM_LB });
    key('l');
    const lb = root.querySelector<HTMLElement>('.gl-kind__lb')!;
    expect(lb.hidden).toBe(false);
    expect([...lb.querySelectorAll('.gl-lb__name')].map((n) => n.textContent)).toEqual(['Kestrels', 'Otters']);
    expect(lb.querySelectorAll('.gl-av--team')).toHaveLength(2);
    expect(root.querySelector('.dummy-board')).toBeTruthy();
    key('l');
    expect(lb.hidden).toBe(true);
  });
});

describe('live phone: kinds with their own rules', () => {
  async function joined(you: RoomView['you'], extra: Partial<RoomView> = {}) {
    const join = vi.fn(async (): Promise<LiveJoin> => ({ room: 'room_test_0001', ticket: 'tkt.sig', ws_base: 'wss://rooms.test/g', initials: 'AB', game_id: GAME.id, owner: 'own_ab' }));
    const host = document.createElement('div');
    document.body.append(host);
    const phone = openLivePhone({ game: GAME, join, host, connect: { WebSocketImpl: FakeWS, fetchImpl: undefined } });
    const root = phone.root;
    const boxes = [...root.querySelectorAll<HTMLInputElement>('.gl-code__box')];
    boxes[0]!.value = '482913';
    boxes[0]!.dispatchEvent(new Event('input'));
    [...root.querySelectorAll<HTMLButtonElement>('.gm-solo__dock button')].find((b) => b.textContent === 'Join')!.click();
    await settle();
    const ws = FakeWS.last();
    ws.open();
    let seq = 1;
    ws.push({ t: 'snapshot', view: makeView({ kind: KIND, style: 'custom', seats: [], you, seq, ...extra }) });
    const patch = (p: Partial<RoomView>) => {
      seq += 1;
      ws.push({ t: 'delta', seq, now: Date.now(), patch: p });
    };
    return { root, ws, patch };
  }

  it('lobby says which team you’re on, in the team colour, and follows a move', async () => {
    const me = SEATS[1]!;
    const { root, patch } = await joined({ owner: me.owner, seat: me }, { teams: [TEAMS[0]!, { ...TEAMS[1]!, members: ['CD', 'GH'] }].map((t) => (t.team === 1 ? t : { ...t, members: [] })) });
    expect(root.querySelector('.gl-in__team')?.textContent).toBe('You’re on the Otters');
    expect(root.querySelector<HTMLElement>('.gl-in')!.style.getPropertyValue('--gl-team')).toBe('var(--game-team-2)');
    patch({ you: { owner: me.owner, seat: { ...me, team: 0 } } });
    expect(root.querySelector('.gl-in__team')?.textContent).toBe('You’re on the Kestrels');
  });

  it('mounts the kind’s phone view: moves and kind controls go to the room, the dock is the kind’s', async () => {
    const me = SEATS[0]!;
    const { root, ws, patch } = await joined({ owner: me.owner, seat: me });
    patch({ phase: 'playing', kind_view: { prompt: 'Pick one' } });
    const p = probes.find((x) => x.side === 'phone')!;
    expect(p).toBeTruthy();
    expect(root.querySelector('.dummy-phone')).toBeTruthy();
    expect(p.views.at(-1)?.kind_view).toEqual({ prompt: 'Pick one' });
    expect(p.api.owner).toBe('own_ab');
    expect([...root.querySelectorAll('.gm-solo__dock button')].map((b) => b.textContent)).toEqual(['Lock in']);
    const moved = p.api.move({ item: 'i1', move: 'judge', response: { pick: 'a' } });
    const sent = ws.sentOf('move').at(-1)!;
    expect(sent.event).toMatchObject({ item: 'i1', move: 'judge', response: { pick: 'a' } });
    ws.push({ t: 'ack', rid: sent.rid, result: { item: 'i1', correct: true } });
    await expect(moved).resolves.toEqual({ item: 'i1', correct: true });
    void p.api.control('captain_pick', { tile: 't3' });
    expect(ws.sentOf('control').at(-1)?.op).toEqual({ op: 'kind', name: 'captain_pick', data: { tile: 't3' } });
    patch({ phase: 'paused' });
    expect(root.querySelector<HTMLElement>('.gl-pause')!.hidden).toBe(false);
    expect(p.disposed).toBe(false);
  });

  it('a kind with no phone view yet says so', async () => {
    const me = SEATS[0]!;
    const { root, patch } = await joined({ owner: me.owner, seat: me }, { kind: 'not_a_kind' as RoomView['kind'] });
    patch({ phase: 'playing' });
    expect(root.querySelector('.gm-solo__stage')?.textContent).toContain('This game’s screens are coming');
  });
});
