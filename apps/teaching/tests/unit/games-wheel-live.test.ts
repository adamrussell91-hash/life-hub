import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomView } from '@/games/core/room-protocol';
import type { KindViewApi } from '@/games/live/kind-views';
import { setCalm } from '@/games/motion/motion';
import { SFX_NAMES, type Sfx } from '@/games/sound/sfx';
import { WHEEL, WHEEL_SEGMENTS, wheelRules, type WheelState } from '@/games/kinds/wheel/rules';
import { mountWheelBoard, mountWheelPhone, omegaFor, puzzleRows, segmentAt, spinSeconds, travel } from '@/games/kinds/wheel/live';
import { rulesHarness } from './games-rules-harness';
import { makeView } from './games-live-fakes';
import { LINES, wheelGame } from './games-wheel-fixture';

// Invented content only.
const SEATS = ['AA', 'BB', 'CC', 'DD', 'EE', 'FF'];

function room() {
  const h = rulesHarness<WheelState>(wheelRules, wheelGame(), { seats: SEATS, teams: 2 });
  h.start();
  const view = (role: 'teacher' | 'board' | 'student', owner: string): RoomView =>
    makeView({ kind: 'wheel', style: 'custom', phase: 'playing', now: h.now, kind_view: h.view(role, owner) } as Partial<RoomView>);
  return { h, view };
}

function fakeApi(h: { now: number }, owner: string) {
  const dock = document.createElement('div');
  document.body.append(dock);
  const sfx = Object.fromEntries(SFX_NAMES.map((n) => [n, vi.fn(() => true)])) as unknown as Sfx;
  const api: KindViewApi & { dock: HTMLElement } = {
    move: vi.fn(async (e) => ({ item: e.item, correct: false })),
    control: vi.fn(async () => undefined),
    serverNow: () => h.now,
    calm: () => true,
    sfx,
    toast: vi.fn(),
    setActions: (b) => dock.replaceChildren(...b),
    owner,
    dock
  };
  return api;
}

beforeEach(() => {
  document.body.replaceChildren();
  setCalm(true);
});
afterEach(() => setCalm(false));

describe('Wheel physics', () => {
  it('omegaFor lands on the chosen segment from any angle, inside the room’s spin time', () => {
    for (const [theta, target, power] of [
      [0, 3, 0.2],
      [123.4, 8, 0.9],
      [-777, 12, 0.5],
      [40, 0, 1]
    ] as const) {
      const w = omegaFor(theta, target, power, 0.4);
      expect(segmentAt(theta + travel(w))).toBe(target);
      expect(travel(w)).toBeGreaterThan(700);
      expect(spinSeconds(w)).toBeLessThan(WHEEL.spinMs / 1000 - 0.3);
    }
  });
  it('wraps a line into board rows by word', () => {
    expect(puzzleRows('EVERY LAMP I LIT WAS A DOOR.')).toEqual(['EVERY LAMP I', 'LIT WAS A', 'DOOR.']);
    expect(puzzleRows('ABCDEFGHIJKLMNOPQRS')).toEqual(['ABCDEFGHIJKLMN', 'OPQRS']);
  });
});

describe('Wheel board', () => {
  it('draws the wheel, the masked puzzle, teams and the used letters; never the line', () => {
    const { h, view } = room();
    const host = document.createElement('div');
    document.body.append(host);
    const board = mountWheelBoard(host, fakeApi(h, 'board'));
    board.update(view('board', 'board'));
    expect(host.querySelectorAll('.wf-rot path')).toHaveLength(WHEEL_SEGMENTS.length);
    expect(host.textContent).toContain('BANKRUPT');
    expect(host.querySelectorAll('.wf-cell:not(.is-e)')).toHaveLength(22); // 21 letters + the full stop
    expect(host.querySelectorAll('.wf-cell.is-on')).toHaveLength(1);
    expect(host.querySelectorAll('.wf-used span')).toHaveLength(26);
    expect(host.querySelectorAll('.wf-team')).toHaveLength(2);
    expect(host.querySelector('.wf-team.is-turn')?.textContent).toContain('Team 1');
    expect(host.textContent!.toUpperCase()).not.toContain('LAMP');
    expect(board.controls?.(view('board', 'board')).map((c) => c.name)).toEqual(['reveal', 'spin']);
  });

  it('spins to the room’s segment (calm: jumps), opens the letter question, shows the counts on close', () => {
    const { h, view } = room();
    const host = document.createElement('div');
    document.body.append(host);
    const board = mountWheelBoard(host, fakeApi(h, 'board'));
    board.update(view('board', 'board'));
    (h.ctx as { random: () => number }).random = () => (5 + 0.5) / 16; // 900
    h.control('spin');
    board.update(view('board', 'board'));
    const rot = host.querySelector('.wf-rot')!.getAttribute('transform')!;
    const theta = Number(/rotate\(([-\d.]+)\)/.exec(rot)![1]);
    expect(segmentAt(theta)).toBe(5);
    h.advance(WHEEL.spinMs);
    h.tick();
    board.update(view('board', 'board'));
    expect(host.querySelector('.wf-status')!.textContent).toContain('900');
    h.advance(WHEEL.valueMs);
    h.tick();
    board.update(view('board', 'board'));
    const panel = host.querySelector('.wf-panel')!;
    expect(panel.hasAttribute('hidden')).toBe(false);
    expect(panel.querySelectorAll('.wf-opt')).toHaveLength(4);
    expect(panel.querySelectorAll('.wf-dots i')).toHaveLength(3);
    h.control('close');
    board.update(view('board', 'board'));
    expect(panel.classList.contains('is-result')).toBe(true);
    expect(panel.querySelectorAll('.wf-opt.is-right')).toHaveLength(1);
  });

  it('turns letters over, then reveals the whole line after a solve', () => {
    const { h, view } = room();
    const host = document.createElement('div');
    document.body.append(host);
    const board = mountWheelBoard(host, fakeApi(h, 'board'));
    board.update(view('board', 'board'));
    h.k.round['0'] = 500;
    h.control('letter', { letter: 'E' });
    board.update(view('board', 'board'));
    expect(host.querySelectorAll('.wf-cell.is-on')).toHaveLength(1 + 2); // EVERY has two Es
    h.advance(5000);
    h.tick();
    h.move('BB', { item: 'pz0', move: 'solve', response: { text: LINES[0] } });
    board.update(view('board', 'board'));
    expect(host.querySelector('.wf-solved')?.textContent).toContain('Team 2');
    expect(host.textContent!.toUpperCase()).not.toContain('LAMP');
    h.control('reveal');
    board.update(view('board', 'board'));
    expect(host.querySelectorAll('.wf-cell.is-on')).toHaveLength(22);
    expect(host.querySelector('.wf-status')!.textContent).toContain(LINES[0]);
  });
});

describe('Wheel phone', () => {
  it('the captain spins with Hold to spin; others wait; Solve is always there', async () => {
    const { h, view } = room();
    const cap = h.k.captain!;
    const capApi = fakeApi(h, cap);
    const host = document.createElement('div');
    document.body.append(host);
    const phone = mountWheelPhone(host, capApi);
    phone.update(view('student', cap));
    const spin = capApi.dock.querySelector<HTMLButtonElement>('[data-wf="spin"]')!;
    expect(spin.textContent).toContain('Hold to spin');
    spin.click();
    await Promise.resolve();
    expect(capApi.control).toHaveBeenCalledWith('spin', { power: 0.6 });
    expect(capApi.dock.querySelector('[data-wf="solve"]')).not.toBeNull();

    const other = SEATS.map((s) => `o_${s}`).find((o) => o !== cap && h.seats[o]?.team === 1)!;
    const api2 = fakeApi(h, other);
    const host2 = document.createElement('div');
    document.body.append(host2);
    const phone2 = mountWheelPhone(host2, api2);
    phone2.update(view('student', other));
    expect(host2.textContent).toContain('about to spin');
    expect(api2.dock.querySelector('[data-wf="spin"]')).toBeNull();
    expect(host2.querySelectorAll('.wf-mini i:not(.is-sp)')).toHaveLength(22);
  });

  it('the letter question goes to the spinning team; the captain gets unused consonants only', async () => {
    const { h, view } = room();
    (h.ctx as { random: () => number }).random = () => 0.5 / 16; // 300
    h.control('spin');
    h.advance(WHEEL.spinMs);
    h.tick();
    h.advance(WHEEL.valueMs);
    h.tick();
    const api = fakeApi(h, 'o_AA');
    const host = document.createElement('div');
    document.body.append(host);
    const phone = mountWheelPhone(host, api);
    phone.update(view('student', 'o_AA'));
    const opts = host.querySelectorAll<HTMLButtonElement>('.wf-ph-opt');
    expect(opts).toHaveLength(4);
    opts[1]!.click();
    const lock = [...api.dock.querySelectorAll('button')].find((b) => b.textContent === 'Lock in')!;
    expect(lock.disabled).toBe(false);
    lock.click();
    await Promise.resolve();
    expect(api.move).toHaveBeenCalledWith(expect.objectContaining({ item: h.k.q!.item, move: 'answer' }));
    // Team 2 isn't asked.
    const api2 = fakeApi(h, 'o_BB');
    const host2 = document.createElement('div');
    document.body.append(host2);
    mountWheelPhone(host2, api2).update(view('student', 'o_BB'));
    expect(host2.querySelectorAll('.wf-ph-opt')).toHaveLength(0);
    expect(host2.textContent).toContain('earning a letter');

    // Earned: the captain's keyboard.
    h.k.used = ['T'];
    h.k.stage = 'letter';
    h.k.value = 300;
    const cap = h.k.captain!;
    const capApi = fakeApi(h, cap);
    const host3 = document.createElement('div');
    document.body.append(host3);
    mountWheelPhone(host3, capApi).update(view('student', cap));
    const cons = host3.querySelectorAll<HTMLButtonElement>('.wf-keys:not(.wf-keys--v) button');
    expect(cons).toHaveLength(21);
    expect([...cons].find((b) => b.textContent === 'T')!.disabled).toBe(true);
    const vowels = host3.querySelectorAll<HTMLButtonElement>('.wf-keys--v button');
    expect([...vowels].every((b) => b.disabled)).toBe(true); // round 0 < 250
    [...cons].find((b) => b.textContent === 'R')!.click();
    const call = [...capApi.dock.querySelectorAll('button')].find((b) => b.textContent === 'Call R')!;
    call.click();
    await Promise.resolve();
    expect(capApi.control).toHaveBeenCalledWith('letter', { letter: 'R' });
  });

  it('Solve opens a private 16px-ready box; a wrong guess locks it; the line never shows before the reveal', async () => {
    const { h, view } = room();
    const api = fakeApi(h, 'o_DD');
    const host = document.createElement('div');
    document.body.append(host);
    const phone = mountWheelPhone(host, api);
    phone.update(view('student', 'o_DD'));
    api.dock.querySelector<HTMLButtonElement>('[data-wf="solve"]')!.click();
    const input = host.querySelector<HTMLInputElement>('input.wf-input')!;
    expect(input.getAttribute('aria-label')).toBe('Your solve');
    input.value = 'every lamp i lit was a window';
    input.dispatchEvent(new Event('input'));
    [...api.dock.querySelectorAll('button')].find((b) => b.textContent === 'Submit solve')!.click();
    await vi.waitFor(() => expect(api.move).toHaveBeenCalledWith({ item: 'pz0', move: 'solve', response: { text: 'every lamp i lit was a window' } }));
    // The room's lock arrives with the next view.
    h.move('DD', { item: 'pz0', move: 'solve', response: { text: 'every lamp i lit was a window' } });
    await vi.waitFor(() => expect(host.querySelector('input.wf-input')).toBeNull());
    phone.update(view('student', 'o_DD'));
    const solve = api.dock.querySelector<HTMLButtonElement>('[data-wf="solve"]')!;
    expect(solve.disabled).toBe(true);
    expect(solve.textContent).toMatch(/Solve locked · \d+ s/);
    expect(host.textContent!.toUpperCase()).not.toContain('LAMP');
    phone.dispose();
  });

  it('after the explain reveal a student sees their letters needed', () => {
    const { h, view } = room();
    h.advance(6000);
    h.move('CC', { item: 'pz0', move: 'solve', response: { text: LINES[0] } });
    h.control('reveal');
    h.control('explain');
    h.control('close');
    h.control('reveal');
    const api = fakeApi(h, 'o_CC');
    const host = document.createElement('div');
    document.body.append(host);
    mountWheelPhone(host, api).update(view('student', 'o_CC'));
    expect(host.textContent).toContain('0 of 21');
    expect(host.textContent).toContain('Letters needed');
  });
});
