import { describe, expect, it } from 'vitest';
import { applyAnswer, autoGoal, buy, newRunner, nextItem, shopRows, type Runner } from '@/games/kinds/points-rush/engine';
import { pointsRushRules, type RushState } from '@/games/kinds/points-rush/rules';
import { leaks, rulesHarness, type Harness } from './games-rules-harness';
import { ANSWERS, RUSH, WRONG } from './games-wager-rush-fixtures';

type View = Record<string, any>;

function answerCur(h: Harness<RushState>, ini: string, right: boolean) {
  const you = (h.view('student', `o_${ini}`) as View).you;
  const cur = you.cur;
  const text = (right ? ANSWERS : WRONG)[cur.item];
  const response = cur.q.mode === 'choice' ? { selected: [cur.q.options.find((o: { text: string }) => o.text === text).id] } : { text };
  h.advance(1500);
  return { cur, ack: h.move(ini, { item: cur.item, move: 'answer', response }) };
}

describe('points rush engine', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  let seed = 3;
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);

  it('brings a missed item back 3 to 6 questions later, until it is right', () => {
    const r: Runner = newRunner(ids, rand);
    nextItem(r, ids, rand, 0);
    const missed = r.cur!.item;
    applyAnswer(r, false, rand, 0);
    const due = r.back[0].due;
    expect(due - r.answered).toBeGreaterThanOrEqual(3);
    expect(due - r.answered).toBeLessThanOrEqual(6);
    const seen: string[] = [];
    let backAt = -1;
    for (let n = 0; n < 7; n++) {
      nextItem(r, ids, rand, 0);
      seen.push(r.cur!.item);
      if (r.cur!.back) {
        backAt = n;
        break;
      }
      applyAnswer(r, true, rand, 0);
    }
    expect(seen.at(-1)).toBe(missed);
    expect(backAt + 1).toBe(due - 1 + 1);
    // Wrong again: it's queued again.
    applyAnswer(r, false, rand, 0);
    expect(r.back.map((b) => b.item)).toContain(missed);
    expect(r.rec[missed]).toMatchObject({ first: false, tries: 2, fixed: false });
  });

  it('scores 100 × multiplier, adds the streak bonus every third, and insurance keeps the streak once', () => {
    const r = newRunner(ids, rand);
    r.points = 1000;
    expect(buy(r, 'mult')).toBe(true); // ×2 for 300
    expect(buy(r, 'streak')).toBe(true); // +100 per 3 in a row for 250
    expect(buy(r, 'ins')).toBe(true); // 200
    expect(r.points).toBe(250);
    expect(buy(r, 'ins')).toBe(false); // one held at a time
    for (let n = 0; n < 3; n++) {
      nextItem(r, ids, rand, 0);
      applyAnswer(r, true, rand, 0);
    }
    expect(r.points).toBe(250 + 200 * 3 + 100);
    expect(r.earned).toBe(700);
    nextItem(r, ids, rand, 0);
    const v = applyAnswer(r, false, rand, 0);
    expect(v).toMatchObject({ insurance_used: true, streak: 3 });
    expect(r.up.ins).toBe(0);
    nextItem(r, ids, rand, 0);
    applyAnswer(r, false, rand, 0);
    expect(r.streak).toBe(0);
  });

  it('prices the shop and refuses what can’t be bought', () => {
    const r = newRunner(ids, rand);
    expect(shopRows(r).map((x) => [x.key, x.cost, x.can])).toEqual([
      ['mult', 300, false],
      ['streak', 250, false],
      ['ins', 200, false]
    ]);
    r.points = 10_000;
    for (let n = 0; n < 3; n++) buy(r, 'mult');
    expect(shopRows(r)[0]).toMatchObject({ level: 3, cost: null, can: false });
    expect(buy(r, 'mult')).toBe(false);
  });

  it('suggests a goal from the class size when the teacher sets none', () => {
    expect(autoGoal(24, 8)).toBe(51_000);
    expect(autoGoal(0, 5)).toBe(1000);
  });
});

describe('points rush rules', () => {
  it('gives every seat its own stream, scores right answers and keeps the class total', () => {
    const h = rulesHarness(pointsRushRules, RUSH, { seats: ['AB', 'CD'] });
    h.start();
    expect(h.timer).toBe(h.now + 5 * 60_000);
    const { ack } = answerCur(h, 'AB', true);
    expect(ack).toMatchObject({ correct: true });
    expect(h.seats.o_AB.score).toBe(100);
    answerCur(h, 'CD', true);
    answerCur(h, 'CD', true);
    const board = h.view('board', 'board') as View;
    expect(board.class_earned).toBe(300);
    expect(board.goal).toBe(2000);
    expect(board.top.map((r: { initials: string }) => r.initials)).toEqual(['CD', 'AB']);
    expect(board.stats).toMatchObject({ per_minute: 3, first_pct: 100, upgrades: 0 });
  });

  it('marks every answer with first try and come-back, and brings a miss back', () => {
    const h = rulesHarness(pointsRushRules, RUSH, { seats: ['AB'] });
    h.start();
    const { cur } = answerCur(h, 'AB', false);
    expect(h.seats.o_AB.score).toBe(0);
    let back: View | null = null;
    for (let n = 0; n < 8 && !back; n++) {
      const you = (h.view('student', 'o_AB') as View).you;
      if (you.cur.back) back = you.cur;
      else answerCur(h, 'AB', true);
    }
    expect(back?.item).toBe(cur.item);
    answerCur(h, 'AB', true);
    const marks = h.events.filter((e) => e.item === cur.item && e.move === 'answer');
    expect(marks.map((e) => [e.correct, e.extra?.back])).toEqual([
      [false, false],
      [true, true]
    ]);
    expect(marks.every((e) => typeof e.time_ms === 'number')).toBe(true);
    const ins = (h.view('teacher', 'teacher') as View).insight;
    const row = ins.items.find((x: { item: string }) => x.item === cur.item);
    expect(row).toMatchObject({ first_pct: 0, back_pct: 100 });
    expect(ins.students[0]).toMatchObject({ initials: 'AB', fixed_pct: 100, still: 0 });
  });

  it('sells upgrades from the phone (2 taps: open, buy) and refuses the board buying for a student', () => {
    const h = rulesHarness(pointsRushRules, RUSH, { seats: ['AB'] });
    h.start();
    for (let n = 0; n < 3; n++) answerCur(h, 'AB', true);
    expect(h.control('buy', { up: 'mult' }, { owner: 'o_AB', role: 'student' })).toBeUndefined();
    expect(h.seats.o_AB.score).toBe(0);
    expect((h.view('student', 'o_AB') as View).you.mult).toBe(2);
    expect(h.control('buy', { up: 'ins' }, { owner: 'o_AB', role: 'student' })).toHaveProperty('error');
    expect(h.control('buy', { up: 'sabotage' }, { owner: 'o_AB', role: 'student' })).toHaveProperty('error');
    expect(h.control('buy', { up: 'mult' })).toHaveProperty('error');
    answerCur(h, 'AB', true);
    expect(h.seats.o_AB.score).toBe(200);
    // Spending never lowers the class goal's total.
    expect((h.view('board', 'board') as View).class_earned).toBe(500);
  });

  it('ends when the time is up and refuses moves after', () => {
    const h = rulesHarness(pointsRushRules, RUSH, { seats: ['AB'] });
    h.start();
    answerCur(h, 'AB', true);
    h.advance(5 * 60_000);
    h.tick();
    expect(h.ended).toBe(true);
    const you = (h.view('student', 'o_AB') as View).you;
    expect(you.cur).toBeNull();
    expect(you.summary).toMatchObject({ first_right: 1, tried: 1 });
    expect(answerCur).toBeDefined();
    expect(h.move('AB', { item: 'i1', move: 'answer', response: { selected: ['x'] } })).toHaveProperty('error');
  });

  it('lets the teacher set the goal and records milestones', () => {
    const h = rulesHarness(pointsRushRules, RUSH, { seats: ['AB'] });
    h.start();
    h.control('goal', { goal: 400 });
    answerCur(h, 'AB', true);
    answerCur(h, 'AB', true);
    expect((h.view('board', 'board') as View).milestones).toEqual([25, 50]);
    expect(h.ticker[0].text).toBe('Class goal 50%');
  });

  it('never shows a student the answer, the other seats or the terms', () => {
    const h = rulesHarness(pointsRushRules, RUSH, { seats: ['AB', 'CD'] });
    h.start();
    for (let n = 0; n < 6; n++) answerCur(h, 'AB', n % 2 === 0);
    answerCur(h, 'CD', true);
    const v = h.view('student', 'o_AB');
    expect(leaks(v, ['o_CD', '"CD"', 'Analepsis', 'Sibilance'])).toEqual([]);
    expect(JSON.stringify(v)).not.toMatch(/"correct":\[/);
    // The board names initials only and never a term (it may be projected).
    expect(leaks(h.view('board', 'board'), ['Analepsis', 'Sibilance', 'o_AB'])).toEqual([]);
  });
});
