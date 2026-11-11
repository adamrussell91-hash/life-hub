import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventResult, SoloEvent } from '@/games/api';
import type { RoomView } from '@/games/core/room-protocol';
import { liveKind, type KindViewApi } from '@/games/live/kind-views';
import { setCalm } from '@/games/motion/motion';
import { sfx } from '@/games/sound/sfx';
import { pointsRushRules } from '@/games/kinds/points-rush/rules';
import { wagerRules } from '@/games/kinds/wager/rules';
import { renderWagerPrint } from '@/games/kinds/wager/print';
import '@/games/kinds';
import { rulesHarness } from './games-rules-harness';
import { makeView, flush } from './games-live-fakes';
import { RUSH, WAGER } from './games-wager-rush-fixtures';

// Invented content only. Views are fed the rules' own kind_view, so these are the screens a real room would draw.

type Role = 'teacher' | 'student' | 'board';
function api(over: Partial<KindViewApi> = {}): KindViewApi & { moves: SoloEvent[]; controls: Array<{ name: string; data?: unknown }>; actions: HTMLElement[] } {
  const moves: SoloEvent[] = [];
  const controls: Array<{ name: string; data?: unknown }> = [];
  const out = {
    moves,
    controls,
    actions: [] as HTMLElement[],
    move: async (e: SoloEvent): Promise<EventResult> => {
      moves.push(e);
      return { item: e.item };
    },
    control: async (name: string, data?: unknown) => void controls.push({ name, data }),
    serverNow: () => Date.now(),
    calm: () => true,
    sfx,
    toast: vi.fn(),
    owner: 'o_AB',
    ...over
  } as KindViewApi & { moves: SoloEvent[]; controls: Array<{ name: string; data?: unknown }>; actions: HTMLElement[] };
  out.setActions = (b: HTMLElement[]) => void (out.actions = b);
  return out;
}
const view = (kind: RoomView['kind'], kv: unknown, over: Partial<RoomView> = {}) => ({ ...makeView({ kind, style: 'custom' as RoomView['style'], phase: 'playing', ...over }), kind_view: kv }) as RoomView;

beforeEach(() => setCalm(true));
afterEach(() => document.body.replaceChildren());

describe('wager live views', () => {
  it('registers a board and a phone', () => {
    expect(liveKind('wager')).toBeTruthy();
    expect(liveKind('points_rush')).toBeTruthy();
  });

  it('phone: answer, then a bet that snaps to 10s with Min / ¼ / ½ / All in, then lock in', async () => {
    const h = rulesHarness(wagerRules, WAGER, { seats: ['AB', 'CD'] });
    h.start();
    const host = document.createElement('div');
    document.body.append(host);
    const a = api();
    const phone = liveKind('wager')!.phone(host, a);
    phone.update(view('wager', h.view('student', 'o_AB')));
    const opts = [...host.querySelectorAll<HTMLButtonElement>('.wg-ans')];
    expect(opts).toHaveLength(4);
    const next = a.actions[0] as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    opts.find((b) => b.textContent?.includes('Personification'))!.click();
    (a.actions[0] as HTMLButtonElement).click();
    const range = host.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(range.step).toBe('10');
    expect(range.min).toBe('10');
    expect(range.max).toBe('100');
    range.value = '47';
    range.dispatchEvent(new Event('input'));
    expect(host.querySelector('.wg-bet__amt')?.textContent).toBe('50');
    const chips = [...host.querySelectorAll<HTMLButtonElement>('.wg-chips button')];
    expect(chips.map((c) => c.textContent)).toEqual(['Min', '¼', '½', 'All in']);
    chips[3].click();
    expect(a.actions[0].textContent).toBe('Lock in 100 points');
    chips[0].click();
    expect(a.actions[0].textContent).toBe('Lock in 10 points');
    chips[2].click();
    (a.actions[0] as HTMLButtonElement).click();
    await flush();
    expect(a.moves[0]).toMatchObject({ item: 'q1', move: 'answer', extra: { bet: 50 } });
    // The room takes it; the phone shows the lock.
    h.move('AB', a.moves[0]);
    phone.update(view('wager', h.view('student', 'o_AB')));
    expect(host.textContent).toContain('Locked in');
    expect(host.textContent).toContain('Personification');
    phone.dispose();
  });

  it('phone: after the reveal shows "+N (bet, bonus, pot share)"', () => {
    const h = rulesHarness(wagerRules, WAGER, { seats: ['AB', 'CD'] });
    h.start();
    const kv = h.view('board', 'board') as { item: { options: Array<{ id: string; text: string }> } };
    const id = (t: string) => kv.item.options.find((o) => o.text === t)!.id;
    h.move('AB', { item: 'q1', move: 'answer', response: { selected: [id('Personification')] }, extra: { bet: 80 } });
    h.move('CD', { item: 'q1', move: 'answer', response: { selected: [id('Pathetic fallacy')] }, extra: { bet: 64 } });
    h.control('reveal');
    const host = document.createElement('div');
    document.body.append(host);
    const phone = liveKind('wager')!.phone(host, api());
    phone.update(view('wager', h.view('student', 'o_AB')));
    expect(host.textContent).toContain('+104 (bet 80, bonus 40, pot share 64)');
    const lost = document.createElement('div');
    document.body.append(lost);
    const p2 = liveKind('wager')!.phone(lost, api({ owner: 'o_CD' }));
    p2.update(view('wager', h.view('student', 'o_CD')));
    expect(lost.textContent).toContain('−64');
    expect(lost.textContent).toMatch(/The answer was [A-D] · Personification/);
  });

  it('board: options, pot and locked dots; riding after close; standings and calibration controls', async () => {
    const h = rulesHarness(wagerRules, WAGER, { seats: ['AB', 'CD', 'EF'] });
    h.start();
    const host = document.createElement('div');
    host.className = 'gl-board';
    document.body.append(host);
    const board = liveKind('wager')!.board(host, api({ owner: 'board' }));
    board.update(view('wager', h.view('board', 'board')));
    expect(host.querySelectorAll('.wg-opt')).toHaveLength(4);
    expect(host.querySelector('.wg-pot__num')?.textContent).toBe('0');
    expect(host.querySelector('.wg-locked__n')?.textContent).toBe('0 / 3 locked in');
    expect(board.controls?.(view('wager', h.view('board', 'board'))).map((c) => c.name)).toEqual(['add_time', 'close']);
    const kv = h.view('board', 'board') as { item: { options: Array<{ id: string; text: string }> } };
    const id = (t: string) => kv.item.options.find((o) => o.text === t)!.id;
    h.move('AB', { item: 'q1', move: 'answer', response: { selected: [id('Metaphor')] }, extra: { bet: 40 } });
    board.update(view('wager', h.view('board', 'board')));
    expect(host.querySelector('.wg-locked__n')?.textContent).toBe('1 / 3 locked in');
    // Nothing on the board names who chose what.
    expect(host.textContent).not.toContain('AB');
    h.control('close');
    board.update(view('wager', h.view('board', 'board')));
    expect(host.querySelector('.wg-board')?.classList.contains('is-closed')).toBe(true);
    const metaphor = [...host.querySelectorAll<HTMLElement>('.wg-opt')].find((c) => c.textContent?.includes('Metaphor'))!;
    expect(metaphor.querySelector('.wg-opt__ride b')?.textContent).toBe('40');
    expect(host.querySelector('.is-right')).toBeNull();
    h.control('reveal');
    board.update(view('wager', h.view('board', 'board')));
    await new Promise((r) => setTimeout(r, 200));
    expect(host.querySelector('.wg-opt.is-right')?.textContent).toContain('Personification');
    for (let q = 0; q < 2; q++) {
      h.control('next');
      h.control('next');
      h.control('reveal');
    }
    h.control('standings');
    board.update(view('wager', h.view('board', 'board')));
    expect(host.querySelectorAll('.gl-lb__row').length).toBe(3);
    expect(board.controls?.(view('wager', h.view('board', 'board'))).map((c) => c.name)).toEqual(['calibration', 'next']);
    h.control('calibration');
    board.update(view('wager', h.view('board', 'board')));
    expect(host.querySelectorAll('.wg-plot__dot').length).toBeGreaterThan(0);
    expect(host.textContent).toContain('Teacher only');
    board.dispose();
  });

  it('prints a question sheet and a key', () => {
    const sheet = renderWagerPrint(WAGER, { answers: true });
    expect(sheet.textContent).toContain('Start with 100 points');
    expect(sheet.querySelector('.gm-print-key')?.textContent).toContain('B. Personification');
    expect(renderWagerPrint(WAGER, { answers: false }).querySelector('.gm-print-key')).toBeNull();
  });
});

describe('points rush live views', () => {
  it('phone: answers from its own stream, bursts the points and opens the 2-tap shop', async () => {
    const h = rulesHarness(pointsRushRules, RUSH, { seats: ['AB'] });
    h.start();
    const host = document.createElement('div');
    document.body.append(host);
    let phoneRef: ReturnType<NonNullable<ReturnType<typeof liveKind>>['phone']> | null = null;
    const a = api({
      move: async (e) => {
        const r = h.move('AB', e);
        setTimeout(() => phoneRef?.update(view('points_rush', h.view('student', 'o_AB'))), 0);
        return 'error' in r ? Promise.reject(new Error(r.error.message)) : r;
      },
      control: async (name, data) => {
        h.control(name, data, { owner: 'o_AB', role: 'student' });
        setTimeout(() => phoneRef?.update(view('points_rush', h.view('student', 'o_AB'))), 0);
      }
    });
    const phone = liveKind('points_rush')!.phone(host, a);
    phoneRef = phone;
    phone.update(view('points_rush', h.view('student', 'o_AB')));
    expect(host.querySelector('.pr-q__eb')?.textContent).toBe('Question 1');
    const ANSWERS = ['Personification', 'Simile', 'Cyclical structure', 'Pathetic fallacy'];
    for (let n = 0; n < 4; n++) {
      const opt = [...host.querySelectorAll<HTMLButtonElement>('.pr-opt')].find((b) => ANSWERS.some((t) => b.textContent?.endsWith(t)));
      const input = host.querySelector<HTMLInputElement>('.pr-input');
      if (opt) opt.click();
      else if (input) {
        const clue = host.querySelector('.pr-q__p')?.textContent ?? '';
        input.value = clue.includes('back in time') ? 'Analepsis' : 'Sibilance';
        input.dispatchEvent(new Event('input'));
        (a.actions[0] as HTMLButtonElement).click();
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    expect(h.seats.o_AB.score).toBeGreaterThanOrEqual(300);
    expect(host.querySelector('.pr-score b')?.textContent).toBe(String(h.seats.o_AB.score).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
    const shopBtn = host.querySelector<HTMLButtonElement>('.pr-shop-btn')!;
    expect(shopBtn.querySelector('.pr-shop-btn__n')).toBeTruthy();
    shopBtn.click();
    const ups = [...host.querySelectorAll<HTMLButtonElement>('.pr-up')];
    expect(ups.map((u) => u.querySelector('.pr-up__nm')?.textContent?.split(' ·')[0])).toEqual(['Multiplier', 'Streak bonus', 'Insurance']);
    ups[0].click();
    await new Promise((r) => setTimeout(r, 100));
    expect((h.view('student', 'o_AB') as { you: { mult: number } }).you.mult).toBe(2);
    phone.dispose();
  });

  it('board: class bar with ticks, top five lanes, class numbers and the teacher views', () => {
    const h = rulesHarness(pointsRushRules, RUSH, { seats: ['AB', 'CD', 'EF'] });
    h.start();
    const host = document.createElement('div');
    host.className = 'gl-board';
    document.body.append(host);
    const board = liveKind('points_rush')!.board(host, api({ owner: 'board' }));
    const answerRight = (ini: string) => {
      const you = (h.view('student', `o_${ini}`) as { you: { cur: { item: string; q: { mode: string; options?: Array<{ id: string; text: string }>; prompt: string } } } }).you;
      const right: Record<string, string> = { i1: 'Personification', i2: 'Simile', i3: 'Cyclical structure', i4: 'Pathetic fallacy', t1: 'Analepsis', t2: 'Sibilance' };
      const t = right[you.cur.item];
      h.move(ini, { item: you.cur.item, move: 'answer', response: you.cur.q.mode === 'choice' ? { selected: [you.cur.q.options!.find((o) => o.text === t)!.id] } : { text: t } });
    };
    answerRight('AB');
    answerRight('AB');
    answerRight('CD');
    board.update(view('points_rush', h.view('board', 'board'), { seats: Object.values(h.seats) }));
    expect(host.querySelectorAll('.pr-tick')).toHaveLength(4);
    expect(host.querySelectorAll('.pr-lane')).toHaveLength(3);
    expect(host.querySelector('.pr-lane .pr-lane__rk')?.textContent).toBe('1');
    expect(host.querySelector('.pr-of')?.textContent).toBe('of 2,000');
    expect(host.textContent).toContain('Answers this minute');
    expect(host.textContent).not.toMatch(/Analepsis|Sibilance/);
    const names = board.controls?.(view('points_rush', h.view('board', 'board'), { seats: Object.values(h.seats) })).map((c) => c.name);
    expect(names).toEqual(['goal', 'add_time', 'show', 'end_now']);
    h.control('show', { view: 'insight' });
    board.update(view('points_rush', h.view('board', 'board')));
    expect(host.textContent).toContain('First try vs when it came back');
    h.control('show', { view: 'anon' });
    board.update(view('points_rush', h.view('board', 'board')));
    expect(host.textContent).toContain('no names');
    expect(host.textContent).not.toMatch(/\bAB\b|\bCD\b/);
    board.dispose();
  });
});

describe('points rush solo player', () => {
  it('plays its own stream against the solo endpoint, then shows the end card and finishes', async () => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    try {
      const { splitGame } = await import('@/games/core/model');
      const { playerFor } = await import('@/games/solo/registry');
      let seed = 5;
      const pub = splitGame(RUSH, () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)).public;
      const emitted: Array<{ e: SoloEvent; now?: boolean }> = [];
      const finish = vi.fn();
      let actions: HTMLElement[] = [];
      const host = document.createElement('div');
      document.body.append(host);
      const player = playerFor('points_rush')!.mount(host, {
        game: pub,
        playId: 'play_1',
        emit: async (e, o) => {
          emitted.push({ e, now: o?.now });
          return { item: e.item, correct: emitted.length !== 2 };
        },
        finish,
        setActions: (b) => void (actions = b),
        setStatus: () => undefined,
        toast: () => undefined,
        elapsedMs: () => 0,
        calm: () => true,
        sfx
      });
      for (let n = 0; n < 3; n++) {
        const opt = host.querySelector<HTMLButtonElement>('.pr-opt');
        const input = host.querySelector<HTMLInputElement>('.pr-input');
        if (opt) opt.click();
        else if (input) {
          input.value = 'Analepsis';
          input.dispatchEvent(new Event('input'));
          (actions[0] as HTMLButtonElement).click();
        }
        await wait(350);
      }
      expect(emitted).toHaveLength(3);
      expect(emitted.every((x) => x.now === true && x.e.move === 'answer')).toBe(true);
      expect(emitted[0].e.extra).toMatchObject({ back: false, n: 1 });
      expect(host.querySelector('.pr-score b')?.textContent).toBe('200');
      const real = Date.now();
      const spy = vi.spyOn(Date, 'now').mockImplementation(() => real + 5 * 60_000 + 1000);
      await wait(400);
      spy.mockRestore();
      expect(host.textContent).toContain('Time! Your points');
      expect(host.textContent).toContain('Fixed when it came back');
      (actions[0] as HTMLButtonElement).click();
      expect(finish).toHaveBeenCalled();
      player.dispose();
    } finally {
      vi.restoreAllMocks();
    }
  });
});
