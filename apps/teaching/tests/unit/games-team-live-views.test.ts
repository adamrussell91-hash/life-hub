import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomView, Role } from '@/games/core/room-protocol';
import type { KindViewApi } from '@/games/live/kind-views';
import { liveKind } from '@/games/live/kind-views';
import { setCalm } from '@/games/motion/motion';
import { sfx } from '@/games/sound/sfx';
import { printFor } from '@/games/solo/registry';
import { jeopardyRules, type JeopardyState } from '@/games/kinds/jeopardy/rules';
import { teamMatchRules, type TeamMatchState } from '@/games/kinds/team-match/rules';
import '@/games/kinds';
import { rulesHarness, type Harness } from './games-rules-harness';
import { jeopardyGame, responseFor } from './games-jeopardy-fixture';
import { teamMatchGame } from './games-team-match-fixture';

const SEATS = ['AA', 'BB', 'CC', 'DD', 'EE', 'FF', 'GG', 'HH'];

/** The room view a viewer would get, built from the harness (the shell's part kept small). */
function roomView<K>(h: Harness<K>, kind: 'jeopardy' | 'team_match', role: Role, owner: string, rules: { view: (c: typeof h.ctx, k: K, r: Role, o: string) => unknown }): RoomView {
  const teams = [...new Set(Object.values(h.seats).map((s) => s.team as number))].sort();
  const ranked = [...teams].sort((a, b) => (h.teamScores[b] ?? 0) - (h.teamScores[a] ?? 0));
  const seat = h.seats[owner];
  return {
    room: 'room_test',
    code: '123456',
    kind,
    style: 'custom',
    title: 'Test',
    phase: 'playing',
    now: h.now,
    seats: Object.values(h.seats),
    ticker: [],
    leaderboard: [],
    teams: teams.map((t) => ({ team: t, score: h.teamScores[t] ?? 0, members: Object.values(h.seats).filter((s) => s.team === t).map((s) => s.initials), rank: ranked.indexOf(t) + 1 })),
    kind_view: rules.view(h.ctx, h.k, role, owner),
    ...(seat ? { you: { owner, seat } } : {}),
    seq: 1
  } as RoomView;
}

function fakeApi(owner: string) {
  const dock = document.createElement('div');
  document.body.append(dock);
  const api: KindViewApi & { moves: unknown[]; controls: Array<{ name: string; data?: unknown }>; toasts: string[]; dock: HTMLElement } = {
    moves: [],
    controls: [],
    toasts: [],
    dock,
    move: vi.fn(async (e) => {
      api.moves.push(e);
      return { item: e.item };
    }),
    control: vi.fn(async (name: string, data?: unknown) => {
      api.controls.push({ name, ...(data !== undefined ? { data } : {}) });
    }),
    serverNow: () => 1_800_000_000_000,
    calm: () => true,
    sfx,
    toast: (t: string) => void api.toasts.push(t),
    setActions: (buttons: HTMLElement[]) => dock.replaceChildren(...buttons),
    owner
  };
  return api;
}

beforeEach(() => {
  setCalm(true);
  document.body.replaceChildren();
});
afterEach(() => setCalm(false));

describe('Jeopardy live views', () => {
  it('registers a board and a phone, and a print', () => {
    expect(liveKind('jeopardy')).toBeTruthy();
    expect(printFor('jeopardy')).toBeTruthy();
  });

  it('board: draws the grid and teams; a teacher tap picks; the clue shows, then the reveal', async () => {
    const h = rulesHarness<JeopardyState>(jeopardyRules, jeopardyGame(), { seats: SEATS, teams: 2 });
    h.start();
    const host = document.createElement('div');
    document.body.append(host);
    const api = fakeApi('teacher');
    const board = liveKind('jeopardy')!.board(host, api);
    board.update(roomView(h, 'jeopardy', 'teacher', 'teacher', jeopardyRules));
    expect(host.querySelectorAll('.jp-cat')).toHaveLength(3);
    expect(host.querySelectorAll('.jp-tile[data-tile]')).toHaveLength(9);
    expect(host.querySelectorAll('.jp-team')).toHaveLength(2);
    expect(host.querySelector('.jp-team.turn')?.textContent).toContain('Kestrels');
    expect(host.querySelector('.jp-turn')?.textContent).toContain('captain AA');
    (host.querySelector('.jp-tile[data-tile="t_n1"]') as HTMLButtonElement).click();
    expect(api.controls).toEqual([{ name: 'pick', data: { tile: 't_n1' } }]);
    h.control('pick', { tile: 't_n1' });
    board.update(roomView(h, 'jeopardy', 'teacher', 'teacher', jeopardyRules));
    await new Promise((r) => setTimeout(r, 0));
    board.update(roomView(h, 'jeopardy', 'teacher', 'teacher', jeopardyRules));
    expect(host.querySelector('.jp-clue')?.hasAttribute('hidden')).toBe(false);
    expect(host.querySelector('.jp-c-q')?.textContent).toContain('Which point of view');
    expect(host.querySelectorAll('.jp-c-opt')).toHaveLength(4);
    expect(board.controls?.(roomView(h, 'jeopardy', 'teacher', 'teacher', jeopardyRules))).toEqual([{ label: 'Close answers', name: 'close', primary: true }]);
    for (const s of SEATS) h.move(s, { item: 'i_n1', move: 'answer', response: responseFor(h.keys, 'i_n1', s < 'E') });
    h.control('reveal');
    board.update(roomView(h, 'jeopardy', 'teacher', 'teacher', jeopardyRules));
    expect(host.querySelectorAll('.jp-c-opt.is-right')).toHaveLength(1);
    expect(host.querySelector('.jp-c-opt.is-right .txt')?.textContent).toBe('First person');
    expect(host.querySelectorAll('.jp-rc')).toHaveLength(2);
    h.control('next');
    board.update(roomView(h, 'jeopardy', 'teacher', 'teacher', jeopardyRules));
    await new Promise((r) => setTimeout(r, 0));
    expect(host.querySelector('.jp-tile[data-tile="t_n1"]')?.classList.contains('used')).toBe(true);
    board.dispose();
  });

  it('phone: the captain picks a tile; everyone answers and locks in; the result shows', async () => {
    const h = rulesHarness<JeopardyState>(jeopardyRules, jeopardyGame(), { seats: SEATS, teams: 2 });
    h.start();
    const host = document.createElement('div');
    document.body.append(host);
    const api = fakeApi('o_AA');
    const phone = liveKind('jeopardy')!.phone(host, api);
    phone.update(roomView(h, 'jeopardy', 'student', 'o_AA', jeopardyRules));
    expect(host.querySelector('.jpp-cap')?.textContent).toContain('captain');
    const v100 = [...host.querySelectorAll<HTMLButtonElement>('.jpp-pvals button')].find((b) => b.textContent === '100')!;
    v100.click();
    expect(api.controls[0]).toEqual({ name: 'aim', data: { tile: 't_n1' } });
    const go = api.dock.querySelector<HTMLButtonElement>('.jpp-cta')!;
    expect(go.textContent).toBe('Pick Narrators · 100');
    go.click();
    expect(api.controls[1]).toEqual({ name: 'pick', data: { tile: 't_n1' } });
    h.control('pick', { tile: 't_n1' });
    phone.update(roomView(h, 'jeopardy', 'student', 'o_AA', jeopardyRules));
    // The quiz player draws the options; pick one and lock in.
    const opt = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('First person'));
    expect(opt).toBeTruthy();
    opt!.click();
    const lock = api.dock.querySelector<HTMLButtonElement>('.jpp-cta')!;
    expect(lock.textContent).toBe('Lock in');
    expect(lock.disabled).toBe(false);
    lock.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(api.moves).toHaveLength(1);
    const sent = api.moves[0] as { item: string; response: unknown };
    expect(sent.item).toBe('i_n1');
    h.move('AA', sent as never);
    phone.update(roomView(h, 'jeopardy', 'student', 'o_AA', jeopardyRules));
    expect(host.textContent).toContain('Locked in');
    h.control('reveal');
    phone.update(roomView(h, 'jeopardy', 'student', 'o_AA', jeopardyRules));
    expect(host.querySelector('.jpp-wait')?.textContent).toContain('Right');
    expect(host.querySelector('.jpp-break')?.textContent).toContain('Picking bonus');
    phone.dispose();
  });

  it('phone: a non-captain waits; a Double captain gets the wager slider', () => {
    const h = rulesHarness<JeopardyState>(jeopardyRules, jeopardyGame(), { seats: SEATS, teams: 2 });
    h.start();
    const host = document.createElement('div');
    document.body.append(host);
    const api = fakeApi('o_CC');
    const phone = liveKind('jeopardy')!.phone(host, api);
    phone.update(roomView(h, 'jeopardy', 'student', 'o_CC', jeopardyRules));
    expect(host.textContent).toContain('Captain AA is choosing');
    h.control('pick', { tile: 't_g2' });
    const apiA = fakeApi('o_AA');
    const hostA = document.createElement('div');
    document.body.append(hostA);
    const phoneA = liveKind('jeopardy')!.phone(hostA, apiA);
    phoneA.update(roomView(h, 'jeopardy', 'student', 'o_AA', jeopardyRules));
    const range = hostA.querySelector<HTMLInputElement>('.jpp-range')!;
    expect(range.max).toBe('500');
    range.value = '300';
    range.dispatchEvent(new Event('input'));
    apiA.dock.querySelector<HTMLButtonElement>('.jpp-cta')!.click();
    expect(apiA.controls.at(-1)).toEqual({ name: 'wager', data: { amount: 300 } });
    phone.update(roomView(h, 'jeopardy', 'student', 'o_CC', jeopardyRules));
    expect(host.textContent).toContain('wagering');
  });

  it('prints the board, the clues and the key', () => {
    const out = printFor('jeopardy')!(jeopardyGame(), { answers: true });
    expect(out.querySelectorAll('.gm-print-jp__board > div')).toHaveLength(3 + 9);
    expect(out.textContent).toContain('Mira tells the story');
    expect(out.querySelector('.gm-print-key')?.textContent).toContain('200 (Double): The double');
    expect(printFor('jeopardy')!(jeopardyGame(), { answers: false }).querySelector('.gm-print-key')).toBeNull();
  });
});

describe('Team match live views', () => {
  it('registers a board, a phone and a print', () => {
    expect(liveKind('team_match')).toBeTruthy();
    expect(printFor('team_match')).toBeTruthy();
  });

  it('board: one lane per team with the track; a wrong tap shows in the feed; the setting button', () => {
    const h = rulesHarness<TeamMatchState>(teamMatchRules, teamMatchGame(), { seats: SEATS, teams: 2 });
    h.start();
    const host = document.createElement('div');
    document.body.append(host);
    const api = fakeApi('teacher');
    const board = liveKind('team_match')!.board(host, api);
    board.update(roomView(h, 'team_match', 'teacher', 'teacher', teamMatchRules));
    expect(host.querySelectorAll('.tm-lane')).toHaveLength(2);
    expect(host.querySelectorAll('.tm-lane:first-child .tm-cell')).toHaveLength(12);
    expect(board.controls?.(roomView(h, 'team_match', 'teacher', 'teacher', teamMatchRules))).toEqual([{ label: 'Wrong tap: Back 3', name: 'wrong_tap', data: { mode: 'start' } }]);
    const r = h.k.teams[0]!.round!;
    const holder = Object.entries(r.hands).find(([, x]) => x.includes(r.right))![0];
    h.move(holder.slice(2), { item: r.item, move: 'tap', response: { option: r.right } });
    const r2 = h.k.teams[0]!.round!;
    const other = Object.keys(r2.hands).find((o) => !r2.hands[o]!.includes(r2.right))!;
    h.move(other.slice(2), { item: r2.item, move: 'tap', response: { option: r2.hands[other]![0] } });
    board.update(roomView(h, 'team_match', 'teacher', 'teacher', teamMatchRules));
    expect(host.querySelector('.tm-feed')?.textContent).toContain('wrong tap');
    expect(host.querySelector('.tm-srow .st')?.textContent).toMatch(/\/12/);
    // The teacher's false-tap view
    (host.querySelector('.tm-insight-btn') as HTMLButtonElement).click();
    expect(host.querySelector('.tm-ins')?.textContent).toContain('when the answer was');
    expect(host.querySelector('.tm-tbl')).not.toBeNull();
    board.dispose();
  });

  it('phone: shows the team question and only this member’s answers; a tap sends the option', async () => {
    const h = rulesHarness<TeamMatchState>(teamMatchRules, teamMatchGame(), { seats: SEATS, teams: 2 });
    h.start();
    const host = document.createElement('div');
    document.body.append(host);
    const api = fakeApi('o_AA');
    const phone = liveKind('team_match')!.phone(host, api);
    phone.update(roomView(h, 'team_match', 'student', 'o_AA', teamMatchRules));
    const r = h.k.teams[0]!.round!;
    const mine = r.hands.o_AA!;
    const buttons = [...api.dock.querySelectorAll<HTMLButtonElement>('.tmp-opt')];
    expect(buttons.map((b) => b.dataset.o).sort()).toEqual([...mine].sort());
    expect(host.querySelectorAll('.tmp-mate')).toHaveLength(4);
    expect(host.querySelector('.tmp-q p')?.textContent).toBeTruthy();
    buttons[0]!.click();
    await new Promise((x) => setTimeout(x, 0));
    expect(api.moves[0]).toEqual({ item: r.item, move: 'tap', response: { option: mine[0] } });
    phone.dispose();
  });

  it('prints a matching sheet and its key', () => {
    const out = printFor('team_match')!(teamMatchGame(), { answers: true });
    expect(out.querySelectorAll('ol li')).toHaveLength(14);
    expect(out.querySelector('.gm-print-key')?.textContent).toContain('Personification');
  });
});
