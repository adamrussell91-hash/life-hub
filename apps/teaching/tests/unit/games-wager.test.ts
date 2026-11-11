import { describe, expect, it } from 'vitest';
import { clampBet, splitPot, wagerRules, wagerSettings, type WagerState } from '@/games/kinds/wager/rules';
import { leaks, rulesHarness, type Harness } from './games-rules-harness';
import { WAGER } from './games-wager-rush-fixtures';

type View = Record<string, any>;
const SEATS = ['AB', 'CD', 'EF', 'GH'];

/** The public option id for an option text on the current question (ids are fresh at publish). */
function opt(h: Harness<WagerState>, text: string): string {
  const v = h.view('board', 'board') as View;
  const o = v.item.options.find((x: { text: string }) => x.text === text);
  if (!o) throw new Error(`no option ${text}`);
  return o.id;
}
const bet = (h: Harness<WagerState>, ini: string, text: string, amount: number) => {
  const v = h.view('board', 'board') as View;
  return h.move(ini, { item: v.item.id, move: 'answer', response: { selected: [opt(h, text)] }, extra: { bet: amount }, time_ms: 4000 });
};
const pts = (h: Harness<WagerState>, ini: string) => h.k.points[`o_${ini}`];

function game(seats = SEATS) {
  const h = rulesHarness(wagerRules, WAGER, { seats });
  h.start();
  return h;
}

describe('wager settings and bets', () => {
  it('defaults to 100 points, minimum 10, 30 seconds, half bonus', () => {
    expect(wagerSettings({})).toEqual({ start: 100, min_bet: 10, seconds: 30, house_bonus: 0.5, rescue: true, final_all_in: true });
  });
  it('clamps a bet to the minimum and to everything held', () => {
    const s = wagerSettings({});
    expect(clampBet(s, 100, 3)).toBe(10);
    expect(clampBet(s, 100, 500)).toBe(100);
    expect(clampBet(s, 100, 'lots')).toBe(10);
    expect(clampBet(s, 6, 50)).toBe(6);
  });
  it('splits a pot in proportion to bets with nothing lost to rounding', () => {
    const shares = splitPot(100, [{ owner: 'a', bet: 10 }, { owner: 'b', bet: 20 }, { owner: 'c', bet: 30 }]);
    expect(Object.values(shares).reduce((n, v) => n + v, 0)).toBe(100);
    expect(shares).toEqual({ a: 17, b: 33, c: 50 });
    expect(splitPot(0, [{ owner: 'a', bet: 10 }])).toEqual({ a: 0 });
  });
});

describe('wager payouts', () => {
  it('pays right answers their bet back, half again, and the pot by bet share', () => {
    const h = game();
    expect(h.timer).toBe(h.now + 30_000);
    bet(h, 'AB', 'Personification', 80); // right
    bet(h, 'CD', 'Personification', 20); // right
    bet(h, 'EF', 'Pathetic fallacy', 60); // wrong: the real misreading
    bet(h, 'GH', 'Metaphor', 40); // wrong
    h.control('close');
    const board = h.view('board', 'board') as View;
    expect(board.stage).toBe('closed');
    expect(board.riding[opt(h, 'Personification')]).toBe(100);
    expect(board.riding[opt(h, 'Pathetic fallacy')]).toBe(60);
    // Nothing applied before the reveal.
    expect(pts(h, 'AB')).toBe(100);
    h.control('reveal');
    // Pot 100 split 80:20 → 80 and 20; bonus 40 and 10.
    expect(pts(h, 'AB')).toBe(100 + 40 + 80);
    expect(pts(h, 'CD')).toBe(100 + 10 + 20);
    expect(pts(h, 'EF')).toBe(40);
    expect(pts(h, 'GH')).toBe(60);
    const mine = (h.view('student', 'o_AB') as View).you.result;
    expect(mine).toMatchObject({ bet: 80, bonus: 40, share: 80, change: 120, correct: true });
    expect((h.view('board', 'board') as View).pot).toBe(0);
    expect(h.seats.o_AB.score).toBe(220);
  });

  it('takes the minimum bet from anyone who did not answer, into the pot', () => {
    const h = game(['AB', 'CD']);
    bet(h, 'AB', 'Personification', 50);
    h.advance(31_000);
    h.tick();
    expect((h.view('board', 'board') as View).stage).toBe('closed');
    h.control('reveal');
    expect(pts(h, 'CD')).toBe(90);
    expect(pts(h, 'AB')).toBe(100 + 25 + 10);
    const noAnswer = h.events.find((e) => e.owner === 'o_CD' && e.move === 'bet');
    expect(noAnswer?.extra).toMatchObject({ bet: 10, no_answer: true });
    expect(h.events.some((e) => e.owner === 'o_CD' && e.move === 'answer')).toBe(false);
  });

  it('rolls the pot over when nobody is right, then pays it out as a jackpot', () => {
    const h = game(['AB', 'CD']);
    bet(h, 'AB', 'Metaphor', 30);
    bet(h, 'CD', 'Hyperbole', 50);
    h.control('next'); // close
    h.control('next'); // reveal
    expect((h.view('board', 'board') as View).pot).toBe(80);
    expect(h.ticker[0].text).toMatch(/jackpot 80/);
    h.control('next'); // standings
    h.control('next'); // question 2
    const v = h.view('board', 'board') as View;
    expect(v.index).toBe(1);
    expect(v.carried).toBe(80);
    bet(h, 'AB', 'A sense of the uncanny', 20);
    bet(h, 'CD', 'Dramatic irony', 10);
    h.control('reveal');
    // Pot = 80 carried + 10 wrong = 90, all to AB.
    expect(pts(h, 'AB')).toBe(70 + 10 + 90);
    expect(pts(h, 'CD')).toBe(40);
    expect((h.view('board', 'board') as View).pot).toBe(0);
  });

  it('rescues anyone under the minimum to 10, flags it, and keeps them out of calibration', () => {
    const h = game(['AB', 'CD']);
    bet(h, 'AB', 'Metaphor', 100); // all in, wrong
    bet(h, 'CD', 'Personification', 10);
    h.control('reveal');
    expect(pts(h, 'AB')).toBe(0);
    h.control('next');
    h.control('next'); // question 2 opens
    expect(pts(h, 'AB')).toBe(10);
    expect((h.view('student', 'o_AB') as View).you.rescued).toBe(true);
    bet(h, 'AB', 'A sense of the uncanny', 10);
    h.control('reveal');
    const q2bet = h.events.filter((e) => e.owner === 'o_AB' && e.move === 'bet').at(-1);
    expect(q2bet?.extra).toMatchObject({ rescued: true, bet: 10 });
    // Only the first (unrescued) round counts toward calibration.
    expect(h.k.calibration.o_AB).toHaveLength(1);
  });

  it('doubles the house bonus on the final question and allows all in', () => {
    const h = game(['AB', 'CD']);
    for (let q = 0; q < 2; q++) {
      const v = h.view('board', 'board') as View;
      const right = v.item.options[0].id; // any pick; scores don't matter here
      h.move('AB', { item: v.item.id, move: 'answer', response: { selected: [right] }, extra: { bet: 10 } });
      h.control('reveal');
      h.control('next');
      h.control('next');
    }
    const v = h.view('board', 'board') as View;
    expect(v.final).toBe(true);
    expect(v.bonus).toBe(1);
    const held = pts(h, 'AB');
    bet(h, 'AB', 'Unreliable narrator', held);
    bet(h, 'CD', 'Intrusive narrator', 20);
    h.control('reveal');
    expect(pts(h, 'AB')).toBe(held + held + v.carried + 20);
    const allIn = h.events.filter((e) => e.owner === 'o_AB' && e.move === 'bet').at(-1);
    expect(allIn?.extra).toMatchObject({ all_in: true, final: true, confidence: 1 });
    h.control('next'); // standings
    h.control('calibration');
    expect((h.view('board', 'board') as View).calibration.map((r: { initials: string }) => r.initials)).toEqual(['AB', 'CD']);
    h.control('next');
    expect(h.ended).toBe(true);
  });

  it('marks every answer through the shared marker and records bets for calibration', () => {
    const h = game(['AB']);
    bet(h, 'AB', 'Personification', 40);
    h.control('close');
    const answer = h.events.find((e) => e.move === 'answer');
    expect(answer).toMatchObject({ owner: 'o_AB', item: 'q1', correct: true, strength: 'live_solo', time_ms: 4000 });
    const b = h.events.find((e) => e.move === 'bet');
    expect(b).toMatchObject({ correct: true, extra: { bet: 40, held: 100, confidence: 0.4, rescued: false } });
  });

  it('refuses answers after close and from a stale question', () => {
    const h = game(['AB']);
    h.control('close');
    expect(bet(h, 'AB', 'Personification', 40)).toHaveProperty('error');
    const h2 = game(['AB']);
    expect(h2.move('AB', { item: 'q2', move: 'answer', response: { selected: ['x'] } })).toHaveProperty('error');
    expect(h2.move('AB', { item: 'q1', move: 'answer', response: { selected: ['not-an-option'] } })).toHaveProperty('error');
  });

  it('flags a wrong option that drew at least 30% of the points as a confident misconception', () => {
    const h = game();
    bet(h, 'AB', 'Pathetic fallacy', 90);
    bet(h, 'CD', 'Pathetic fallacy', 50);
    bet(h, 'EF', 'Personification', 20);
    bet(h, 'GH', 'Personification', 10);
    h.control('reveal');
    for (let q = 1; q < 3; q++) {
      h.control('next');
      h.control('next');
      h.control('reveal');
    }
    const v = h.view('board', 'board') as View;
    expect(v.misconceptions[0]).toMatchObject({ text: 'Pathetic fallacy', index: 0 });
  });
});

describe('wager views', () => {
  it('never leak the answer before the reveal, nor anyone else’s bet to a student', () => {
    const h = game();
    const right = 'Personification';
    bet(h, 'AB', right, 70);
    bet(h, 'CD', 'Metaphor', 30);
    for (const stage of ['open', 'closed']) {
      if (stage === 'closed') h.control('close');
      const student = h.view('student', 'o_AB') as View;
      const boardV = h.view('board', 'board') as View;
      // The right option's id must not be marked anywhere before the reveal.
      expect(student.right).toBeUndefined();
      expect(boardV.right).toBeUndefined();
      expect(JSON.stringify(student)).not.toContain('correct');
      expect(student.you.result).toBeUndefined();
      expect(leaks(student, ['o_CD', 'CD'])).toEqual([]);
      expect(leaks(boardV, ['kp_wg01'])).toEqual([]);
    }
    h.control('reveal');
    const after = h.view('student', 'o_AB') as View;
    expect(after.right).toEqual([opt(h, right)]);
    expect(leaks(after, ['o_CD', '"CD"'])).toEqual([]);
  });
});
