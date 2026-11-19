import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Game } from '@/games/core/schema';
import type { FleetCampaignState, FleetControlApi } from '@/games/kinds/fleet-week/control-api';
import { fleetControlApi } from '@/games/kinds/fleet-week/control-api';
import { chartMarks, fleetLauncher, hardestSquares, openFleetControlRoom, type FleetControlRoom } from '@/games/kinds/fleet-week/control-room';

// Invented people and content only.
const GAME = {
  id: 'g_fleet', title: 'Poetry fleet', kind: 'fleet_week', solo: false, live: false,
  columns: ['Form', 'Voice', 'Image', 'Sound', 'Theme'], rows: ['Poem A', 'Poem B', 'Poem C', 'Poem D', 'Poem E'],
  squares: [], recall: [], settings: { rounds: 4, round_cap_s: 180, placement_cap_s: 120, answer_s: 60, cutoff: '20:00' }
} as unknown as Game;
const CLASSES = [{ id: 'c_10x', name: '10X' }, { id: 'c_11y', name: '11Y' }];

const member = (owner: string, name: string, over = {}) => ({ owner, student_id: `s_${owner}`, name, initials: name.split(' ').map((p) => p[0]).join(''), shots: 0, done: false, seen: true, ...over });

function makeState(over: Partial<FleetCampaignState> = {}): FleetCampaignState {
  return {
    campaign_id: 'camp1', mode: 'lesson', round: 1, rounds: 4, closes_at: Date.now() + 120000, revealed_at: null, closed_at: null,
    teams: [
      { id: 't1', ghost: false, members: [member('o1', 'Pip Marlow', { shots: 2, done: true }), member('o2', 'Juno Castell')], fleet: [{ id: 's0', squares: [0, 1, 2] }], damage: 4 },
      { id: 't2', ghost: false, members: [member('o3', 'Rafe Okonjo'), member('o4', 'Tilly Brandt')], fleet: [{ id: 's0', squares: [10, 15, 20] }], damage: 2 }
    ],
    matches: [{ id: 'm1', teams: ['t1', 't2'], ended: false }],
    owed: [{ hit: 'h1', team: 't1', by: 'Pip Marlow', square: 10, round: 1, due: 2, rejected: 0, filed: { by: 'Juno Castell', text: 'Because the rhyme is half-rhyme.', round: 1 } }],
    flags: [{ kind: 'answer', owner: 'o3', name: 'Rafe Okonjo', round: 1, square: 7, seq: 1234, pastes: 1, away: 0, jumps: 0, writing: { base: '', steps: [[1, 0, 0, 'enjambment']], ms: 4000 } }],
    log: [{ round: 0, results: [] }],
    standings: [{ match: 'm1', teams: [{ team: 't1', damage: 4, sunk: 0, accuracy: 0.5 }, { team: 't2', damage: 2, sunk: 0, accuracy: 0.25 }], winner: 't1' }],
    ...over
  };
}

function fakeApi(state: () => FleetCampaignState) {
  const api = {
    open: vi.fn(async () => state()),
    state: vi.fn(async () => state()),
    next: vi.fn(async () => state()),
    voidShot: vi.fn(async () => state()),
    rejectReport: vi.fn(async () => state()),
    reveal: vi.fn(async () => ({ ...state(), revealed_at: Date.now() })),
    close: vi.fn(async () => ({ ...state(), closed_at: Date.now() }))
  } satisfies FleetControlApi;
  return api;
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const buttonNamed = (root: HTMLElement, text: string) => [...root.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement | undefined;

let room: FleetControlRoom | null = null;
afterEach(() => {
  room?.dispose();
  room = null;
  document.body.replaceChildren();
});

async function opened(over: Partial<FleetCampaignState> = {}) {
  const api = fakeApi(() => makeState(over));
  room = openFleetControlRoom(document.body, { lessonId: 'l1', game: GAME, classes: CLASSES, api, pollMs: 60000 });
  buttonNamed(room.root, 'Open campaign')!.click();
  await flush();
  return { api, root: room.root };
}

describe('Fleet week control api', () => {
  it('posts each action with the game, class and campaign', async () => {
    const call = vi.fn(async () => ({}));
    const api = fleetControlApi(call as never);
    await api.open('g', 'c', { rounds: 3, round_cap_s: 120 });
    await api.voidShot('g', 'c', { round: 2, owner: 'o', seq: 9 }, 'camp');
    await api.rejectReport('g', 'c', 'h1', 'camp');
    expect(call.mock.calls).toEqual([
      ['campaign_open', { game_id: 'g', class_id: 'c', mode: 'lesson', rounds: 3, round_cap_s: 120 }],
      ['void_shot', { game_id: 'g', class_id: 'c', campaign_id: 'camp', round: 2, owner: 'o', seq: 9 }],
      ['reject_report', { game_id: 'g', class_id: 'c', campaign_id: 'camp', hit: 'h1' }]
    ]);
  });
});

describe('Fleet week control room', () => {
  it('opens a campaign for the chosen class in lesson mode with the settings defaults', async () => {
    const api = fakeApi(() => makeState());
    room = openFleetControlRoom(document.body, { lessonId: 'l1', game: GAME, classes: CLASSES, api, pollMs: 60000 });
    const pill = [...room.root.querySelectorAll<HTMLButtonElement>('.hub-pills__btn')].find((b) => b.textContent === '11Y')!;
    pill.click();
    buttonNamed(room.root, 'Open campaign')!.click();
    await flush();
    expect(api.open).toHaveBeenCalledWith('g_fleet', 'c_11y', { rounds: 4, round_cap_s: 180 });
    expect(room.root.querySelector('.fc-phase')!.textContent).toContain('Round 1 of 4');
    expect(room.root.querySelector('.fc-time')!.textContent).toMatch(/\d:\d\d left/);
  });

  it('Next round calls campaign_next', async () => {
    const { api, root } = await opened();
    buttonNamed(root, 'Next round')!.click();
    await flush();
    expect(api.next).toHaveBeenCalledWith('g_fleet', 'c_10x', 'camp1');
  });

  it('renders real names grouped by team, who has fired, owed reports and flags', async () => {
    const { root } = await opened();
    const teams = [...root.querySelectorAll('.fc-team__name')].map((n) => n.textContent);
    expect(teams).toEqual(['Pip Marlow & Juno Castell', 'Rafe Okonjo & Tilly Brandt']);
    expect(root.textContent).toContain('Fired 2');
    expect(root.textContent).toContain('Because the rhyme is half-rhyme.');
    expect(root.querySelector('.fc-flag')!.textContent).toContain('Rafe Okonjo');
    expect(root.querySelector('.fc-flag')!.textContent).toContain('1 paste');
  });

  it('voids a flagged shot and rejects a filed report', async () => {
    const { api, root } = await opened();
    buttonNamed(root, 'Void shot')!.click();
    await flush();
    expect(api.voidShot).toHaveBeenCalledWith('g_fleet', 'c_10x', { round: 1, owner: 'o3', seq: 1234 }, 'camp1');
    buttonNamed(root, 'Reject report')!.click();
    await flush();
    expect(api.rejectReport).toHaveBeenCalledWith('g_fleet', 'c_10x', 'h1', 'camp1');
  });

  it('reveal needs a confirm, then shows the board with names and no typed answers', async () => {
    const { api, root } = await opened({
      log: [{ round: 1, results: [
        { owner: 'o1', name: 'Pip Marlow', seq: 1, square: 10, target: 't2', outcome: 'hit', correct: true, sure: false, damage: 2, answer: 'SECRET-WRONG' } as never,
        { owner: 'o3', name: 'Rafe Okonjo', seq: 2, square: 3, target: 't1', outcome: 'miss', correct: true, sure: false, damage: 0 },
        { owner: 'o4', name: 'Tilly Brandt', seq: 3, square: 7, target: 't1', outcome: 'dud', correct: false, sure: false, damage: 0, answer: 'WRONG-ANSWER' } as never,
        { owner: 'o2', name: 'Juno Castell', seq: 4, square: 7, target: 't2', outcome: 'dud', correct: false, sure: true, damage: 0 }
      ] }]
    });
    buttonNamed(root, 'Reveal')!.click();
    await flush();
    expect(api.reveal).not.toHaveBeenCalled();
    const cancel = buttonNamed(root, 'Cancel')!;
    cancel.click();
    expect(root.querySelector<HTMLElement>('.fc-confirm')!.hidden).toBe(true);
    buttonNamed(root, 'Reveal')!.click();
    buttonNamed(root, 'Reveal now')!.click();
    await flush();
    await flush();
    expect(api.reveal).toHaveBeenCalledTimes(1);
    const board = root.querySelector('.fc-board')!;
    expect(board).toBeTruthy();
    expect(board.textContent).toContain('Pip Marlow & Juno Castell win');
    expect(board.textContent).toContain('Rafe Okonjo & Tilly Brandt');
    expect(board.textContent).toContain('B3 (Poem B · Image): 0 of 2 right');
    expect(board.textContent).not.toContain('WRONG-ANSWER');
    expect(board.textContent).not.toContain('SECRET-WRONG');
    expect(board.querySelectorAll('.fc-chart__cell.is-hit').length).toBe(1);
    expect(board.querySelectorAll('.fc-chart__cell.is-miss').length).toBe(1);
  });

  it('close campaign needs a confirm', async () => {
    const { api, root } = await opened();
    buttonNamed(root, 'Close campaign')!.click();
    expect(api.close).not.toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>('.fc-confirm__yes')!.click();
    await flush();
    expect(api.close).toHaveBeenCalledTimes(1);
    expect(root.querySelector('.fc-phase')!.textContent).toContain('Closed');
  });

  it('polls campaign_state on its interval', async () => {
    vi.useFakeTimers();
    try {
      const api = fakeApi(() => makeState());
      room = openFleetControlRoom(document.body, { lessonId: 'l1', game: GAME, classes: CLASSES, api });
      buttonNamed(room.root, 'Open campaign')!.click();
      await vi.advanceTimersByTimeAsync(0);
      expect(api.state).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(2000);
      expect(api.state).toHaveBeenCalledWith('g_fleet', 'c_10x', 'camp1');
    } finally {
      room?.dispose();
      room = null;
      vi.useRealTimers();
    }
  });
});

describe('Fleet week helpers and launcher', () => {
  it('marks charts and ranks the hardest squares', () => {
    const s = makeState({ log: [{ round: 1, results: [
      { owner: 'o1', name: 'A', seq: 1, square: 4, target: 't2', outcome: 'miss', correct: true, sure: false, damage: 0 },
      { owner: 'o2', name: 'B', seq: 2, square: 4, target: 't2', outcome: 'hit', correct: true, sure: false, damage: 2 }
    ] }] });
    expect(chartMarks(s, 't2').get(4)).toBe('hit');
    expect(hardestSquares(s)).toEqual([]);
  });

  it('offers Run Fleet week only for Fleet week games', () => {
    const api = fakeApi(() => makeState());
    const panel = fleetLauncher({ games: [GAME], classes: CLASSES, classId: 'c_10x', lessonId: 'l1', api })!;
    document.body.append(panel);
    const run = buttonNamed(panel, 'Run Fleet week')!;
    expect(run.disabled).toBe(false);
    run.click();
    expect(document.querySelector('.fc')).toBeTruthy();
    document.querySelector<HTMLButtonElement>('.fc-top .btn')!.click();
    expect(fleetLauncher({ games: [], classes: CLASSES, classId: null, lessonId: 'l1', api })).toBeNull();
  });
});
