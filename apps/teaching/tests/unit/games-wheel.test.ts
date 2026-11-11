import { describe, expect, it } from 'vitest';
import {
  WHEEL,
  WHEEL_SEGMENTS,
  lettersNeededFromEvents,
  lettersOf,
  maskBoard,
  puzzleBoard,
  recognitionScore,
  solveForm,
  wheelRules,
  type WheelState,
  type WheelView
} from '@/games/kinds/wheel/rules';
import { leaks, rulesHarness } from './games-rules-harness';
import { LINES, responseFor, wheelGame } from './games-wheel-fixture';

// Teams deal round-robin: team 0 = AA CC EE, team 1 = BB DD FF.
const SEATS = ['AA', 'BB', 'CC', 'DD', 'EE', 'FF'];
const T0 = ['AA', 'CC', 'EE'];

function setup(seats = SEATS) {
  const h = rulesHarness<WheelState>(wheelRules, wheelGame(), { seats, teams: 2 });
  h.start();
  /** Make the next spin land on segment `i`. */
  const landOn = (i: number) => {
    (h.ctx as { random: () => number }).random = () => (i + 0.5) / WHEEL_SEGMENTS.length;
  };
  const segOf = (v: number | 'bankrupt' | 'lose') => WHEEL_SEGMENTS.indexOf(v);
  const spinTo = (v: number | 'bankrupt' | 'lose') => {
    landOn(segOf(v));
    expect(h.control('spin')).toBeUndefined();
    expect(h.k.stage).toBe('spinning');
    h.advance(WHEEL.spinMs);
    h.tick(); // landed
  };
  const view = (role: 'teacher' | 'board' | 'student', ini = 'AA') => h.view(role, role === 'student' ? `o_${ini}` : role) as WheelView;
  const answer = (ini: string, right: boolean) => h.move(ini, { item: h.k.q!.item, move: 'answer', response: responseFor(h.keys, h.k.q!.item, right) });
  /** Spin a value, answer the letter question (who's right), close it. */
  const earn = (v: number, right: string[], wrong: string[] = []) => {
    spinTo(v);
    expect(h.k.stage).toBe('landed');
    h.advance(WHEEL.valueMs);
    h.tick();
    expect(h.k.stage).toBe('question');
    for (const s of right) answer(s, true);
    for (const s of wrong) answer(s, false);
    if (h.k.stage === 'question') h.control('close');
    expect(h.k.stage).toBe('qclosed');
    h.advance(WHEEL.qclosedMs);
    h.tick();
  };
  const solve = (ini: string, text: string) => h.move(ini, { item: `pz${h.k.p}`, move: 'solve', response: { text } });
  return { h, landOn, spinTo, view, answer, earn, solve };
}

describe('Wheel: puzzle text', () => {
  it('normalises to A–Z with punctuation filled in, and masks hidden letters', () => {
    expect(puzzleBoard('  Éclair’s   café, child! ')).toBe('ECLAIR’S CAFE, CHILD!');
    expect(lettersOf('AB, C')).toEqual(['A', 'B', 'C']);
    expect(maskBoard('THE DEAD, CHILD.', ['D'])).toBe('___ D__D, ____D.');
    expect(solveForm('the dead do not wander — child')).toBe('THEDEADDONOTWANDERCHILD');
  });
});

describe('Wheel: spins', () => {
  it('the room picks the landing; Bankrupt wipes the round score only, then play passes on', () => {
    const { h, spinTo, earn } = setup();
    earn(500, ['AA', 'CC'], ['EE']);
    expect(h.k.stage).toBe('letter');
    h.control('letter', { letter: 'L' }, { owner: h.k.captain!, role: 'student' });
    expect(h.k.round['0']).toBe(500 * 2); // LAMP, LIT
    h.advance(10_000);
    h.tick(); // same team spins again
    expect(h.k.stage).toBe('turn');
    expect(h.k.order[h.k.turn % 2]).toBe(0);
    h.k.bank['0'] = 300;
    spinTo('bankrupt');
    expect(h.k.landed).toEqual({ seg: WHEEL_SEGMENTS.indexOf('bankrupt'), lost: 1000 });
    expect(h.k.round['0']).toBe(0);
    expect(h.k.bank['0']).toBe(300);
    h.advance(WHEEL.stampMs);
    h.tick();
    expect(h.k.stage).toBe('turn');
    expect(h.k.order[h.k.turn % 2]).toBe(1);
  });

  it('Lose a turn passes play on with the round score kept', () => {
    const { h, spinTo } = setup();
    h.k.round['0'] = 400;
    spinTo('lose');
    expect(h.k.round['0']).toBe(400);
    h.advance(WHEEL.stampMs);
    h.tick();
    expect(h.k.order[h.k.turn % 2]).toBe(1);
  });

  it('only the captain (or the teacher/board) spins, and only on a turn', () => {
    const { h } = setup();
    const notCap = T0.map((i) => `o_${i}`).find((o) => o !== h.k.captain)!;
    expect(h.control('spin', {}, { owner: notCap, role: 'student' })).toMatchObject({ error: { code: 'not_captain' } });
    expect(h.control('spin', { power: 0.9 }, { owner: h.k.captain!, role: 'student' })).toBeUndefined();
    expect(h.k.spin?.power).toBe(0.9);
    expect(h.control('spin')).toMatchObject({ error: { code: 'not_now' } });
  });
});

describe('Wheel: earning letters', () => {
  it('half the team right earns the letter; fewer passes play on', () => {
    const { h, earn } = setup();
    earn(300, ['AA'], ['CC', 'EE']);
    expect(h.k.stage).toBe('turn');
    expect(h.k.order[h.k.turn % 2]).toBe(1);
    // Team 1: BB DD FF; 2 of 3 right.
    earn(300, ['BB', 'DD'], ['FF']);
    expect(h.k.stage).toBe('letter');
  });

  it('only the spinning team answers the letter question; answers close when all are in', () => {
    const { h, spinTo, answer } = setup();
    spinTo(400);
    h.advance(WHEEL.valueMs);
    h.tick();
    expect(answer('BB', true)).toMatchObject({ error: { code: 'not_yours' } });
    // Locked in, no verdict yet (so the team can't pass the answer round).
    const ack = answer('AA', true);
    expect(ack).toEqual({ item: h.k.q!.item });
    answer('CC', true);
    answer('EE', false);
    expect(h.k.stage).toBe('qclosed');
    expect(h.k.q).toMatchObject({ r: 2, n: 3, ok: true });
    const marked = h.events.filter((e) => e.move === 'answer');
    expect(marked.map((e) => [e.owner, e.correct, e.strength])).toEqual([
      ['o_AA', true, 'live_solo'],
      ['o_CC', true, 'live_solo'],
      ['o_EE', false, 'live_solo']
    ]);
  });

  it('a consonant scores each copy × the spin value; a missing one passes play on', () => {
    const { h, earn } = setup();
    earn(250, ['AA', 'CC']);
    const cap = h.k.captain!;
    // "EVERY LAMP I LIT WAS A DOOR." has two Rs.
    h.control('letter', { letter: 'R' }, { owner: cap, role: 'student' });
    expect(h.k.last).toEqual({ letter: 'R', count: 2, vowel: false, won: 500 });
    expect(h.k.round['0']).toBe(500);
    expect(h.k.stage).toBe('revealing');
    expect(h.timer).toBe(h.now + WHEEL.flipBaseMs + 2 * WHEEL.flipEachMs);
    h.advance(5000);
    h.tick();
    expect(h.k.order[h.k.turn % 2]).toBe(0);
    earn(900, ['AA', 'CC']);
    h.control('letter', { letter: 'Z' }, { owner: h.k.captain!, role: 'student' });
    expect(h.k.last).toMatchObject({ count: 0, won: 0 });
    h.advance(5000);
    h.tick();
    expect(h.k.order[h.k.turn % 2]).toBe(1);
  });

  it('consonants need an earned letter; used letters can’t be called again', () => {
    const { h, earn } = setup();
    expect(h.control('letter', { letter: 'T' })).toMatchObject({ error: { code: 'not_now' } });
    earn(500, ['AA', 'CC']);
    h.control('letter', { letter: 'T' });
    h.advance(5000);
    h.tick();
    earn(500, ['AA', 'CC']);
    expect(h.control('letter', { letter: 't' })).toMatchObject({ error: { code: 'used' } });
  });

  it('a vowel costs 250 of the round score, needs no question, and can be bought on a turn', () => {
    const { h } = setup();
    expect(h.control('letter', { letter: 'A' })).toMatchObject({ error: { code: 'short' } });
    h.k.round['0'] = 600;
    expect(h.control('letter', { letter: 'A' }, { owner: h.k.captain!, role: 'student' })).toBeUndefined();
    expect(h.k.round['0']).toBe(350);
    expect(h.k.last).toMatchObject({ letter: 'A', vowel: true, won: 0 });
    expect(h.events.filter((e) => e.move === 'answer')).toHaveLength(0);
  });
});

describe('Wheel: private solving', () => {
  it('a wrong solve locks that student for 20 s; the lock ends on time', () => {
    const { h, solve } = setup();
    expect(solve('BB', 'every lamp I lit was a window')).toEqual({ item: 'pz0', correct: false });
    expect(solve('BB', LINES[0]!)).toMatchObject({ error: { code: 'locked' } });
    h.advance(19_000);
    expect(solve('BB', LINES[0]!)).toMatchObject({ error: { code: 'locked', message: 'Solve is locked for 1 s.' } });
    h.advance(1000);
    expect(solve('BB', LINES[0]!)).toEqual({ item: 'pz0', correct: true });
    expect(h.events.filter((e) => e.move === 'solve').map((e) => e.correct)).toEqual([false, true]);
  });

  it('the first right solve wins the round for that team (round + 500); later solves are recorded until the reveal', () => {
    const { h, earn, solve, view } = setup();
    earn(500, ['AA', 'CC']);
    h.control('letter', { letter: 'L' }); // 2 Ls → team 0 round 1000
    h.advance(5000);
    h.tick();
    h.advance(10_000);
    // A team 1 student solves first, punctuation and case don't matter.
    expect(solve('DD', 'every lamp i lit was a door')).toEqual({ item: 'pz0', correct: true });
    expect(h.k.stage).toBe('solved');
    expect(h.k.winner).toEqual({ team: 1, bank: WHEEL.solveBonus });
    expect(h.teamScores).toEqual({ 1: 500 });
    expect(h.k.round).toEqual({ 0: 0, 1: 0 });
    // Still masked while others solve for their record.
    expect(view('board').line).toBeUndefined();
    h.advance(4000);
    expect(solve('AA', LINES[0]!)).toEqual({ item: 'pz0', correct: true });
    expect(h.k.solves.o_AA).toMatchObject({ first: false, shown: 2, total: 21 });
    expect(h.teamScores).toEqual({ 1: 500 });
    h.advance(WHEEL.solvedMs);
    h.tick();
    expect(h.k.stage).toBe('revealed');
    expect(solve('BB', LINES[0]!)).toMatchObject({ error: { code: 'closed' } });
    expect(view('student', 'BB').line).toBe(LINES[0]);
  });

  it('the round banks for the solving team, with their round score', () => {
    const { h, earn, solve } = setup();
    earn(500, ['AA', 'CC']);
    h.control('letter', { letter: 'L' });
    h.advance(5000);
    h.tick();
    solve('EE', LINES[0]!);
    expect(h.k.winner).toEqual({ team: 0, bank: 1000 + WHEEL.solveBonus });
    expect(h.teamScores).toEqual({ 0: 1500 });
  });

  it('a first solve mid-spin waits for the landing, then shows', () => {
    const { h, landOn, solve } = setup();
    landOn(0);
    h.control('spin');
    solve('BB', LINES[0]!);
    expect(h.k.stage).toBe('spinning');
    expect(h.k.pending).toBe(true);
    h.advance(WHEEL.spinMs);
    h.tick();
    h.advance(WHEEL.valueMs);
    h.tick();
    expect(h.k.stage).toBe('solved');
  });

  it('letters needed: letters showing at the first right solve; a 0-letter solve inside 3 s is an outlier', () => {
    const { h, earn, solve } = setup();
    h.advance(1500);
    solve('FF', LINES[0]!); // 0 letters, 1.5 s: had the text open
    expect(h.k.solves.o_FF).toMatchObject({ shown: 0, total: 21, pct: 0, outlier: true });
    h.control('reveal');
    h.control('explain');
    h.control('close');
    h.control('reveal');
    h.control('totals');
    h.control('next_puzzle');
    expect(h.k.p).toBe(1);
    h.advance(1000);
    earn(500, ['BB', 'DD']);
    h.control('letter', { letter: 'D' }); // THE DEAD DO NOT WANDER, CHILD.: D×5
    h.advance(6000);
    h.tick();
    solve('AA', LINES[1]!);
    expect(h.k.solves.o_AA).toMatchObject({ shown: 5, total: 23, outlier: false });
    const ev = h.events.filter((e) => e.move === 'solve' && e.correct);
    expect(ev.map((e) => e.extra)).toEqual([
      { letters_showing: 0, letters_total: 21, letters_pct: 0, outlier: true, first: true },
      { letters_showing: 5, letters_total: 23, letters_pct: 22, outlier: false, first: true }
    ]);
    const table = lettersNeededFromEvents(h.events);
    expect(table.o_FF?.pz0?.outlier).toBe(true);
    expect(table.o_AA?.pz1?.shown).toBe(5);
    // Recognition score leaves the outlier out; not solved counts 0.
    expect(recognitionScore([table.o_FF?.pz0, null])).toBe(0);
    expect(recognitionScore([table.o_AA?.pz1])).toBeCloseTo(1 - 5 / 23);
    expect(recognitionScore([table.o_FF?.pz0])).toBeNull();
  });
});

describe('Wheel: explain question', () => {
  it('everyone answers once the puzzle is revealed; marked per student with how early they solved', () => {
    const { h, solve, view } = setup();
    h.advance(5000);
    solve('BB', LINES[0]!);
    h.advance(WHEEL.solvedMs);
    h.tick();
    expect(h.control('explain')).toBeUndefined();
    expect(h.k.stage).toBe('explain');
    const item = h.k.q!.item;
    for (const s of SEATS) h.move(s, { item, move: 'answer', response: responseFor(h.keys, item, s !== 'CC') });
    expect(h.k.stage).toBe('ex_closed');
    // No verdicts before the reveal.
    expect(view('student', 'CC').you?.correct).toBeUndefined();
    h.control('reveal');
    expect(h.k.stage).toBe('ex_revealed');
    const ex = h.events.filter((e) => e.item === item);
    expect(ex).toHaveLength(6);
    expect(ex.find((e) => e.owner === 'o_BB')).toMatchObject({ correct: true, extra: { solved: true, letters_pct: 0, early: true } });
    expect(ex.find((e) => e.owner === 'o_CC')).toMatchObject({ correct: false, extra: { solved: false } });
    expect(view('board').split).toEqual({ early: { n: 1, right: 1 }, late: { n: 5, right: 4 } });
    expect(view('student', 'CC').you?.correct).toBe(false);
    h.control('next');
    expect(h.k.stage).toBe('totals');
  });

  it('the last puzzle’s Next ends the game', () => {
    const { h } = setup();
    for (let p = 0; p < 3; p++) {
      h.control('reveal');
      h.control('next'); // explain
      h.control('next'); // close
      h.control('next'); // reveal
      h.control('next'); // totals
      h.control('next'); // next puzzle / end
    }
    expect(h.ended).toBe(true);
  });
});

describe('Wheel: views never leak the line', () => {
  it('no view holds the puzzle text before the reveal, at any stage', () => {
    const { h, earn, solve, view } = setup();
    const secrets = [LINES[0]!, solveForm(LINES[0]!), puzzleBoard(LINES[0]!), 'WAS A DOOR', 'LAMP'];
    const check = () => {
      for (const v of [view('board'), view('teacher'), ...SEATS.map((s) => view('student', s))]) expect(leaks(v, secrets)).toEqual([]);
    };
    check();
    earn(500, ['AA', 'CC']);
    check();
    h.control('letter', { letter: 'R' });
    check();
    h.advance(5000);
    h.tick();
    solve('BB', 'every lamp i lit was a window');
    check();
    solve('DD', LINES[0]!);
    expect(h.k.stage).toBe('solved');
    check();
    // A student's own solve isn't echoed back either.
    expect(JSON.stringify(view('student', 'DD'))).not.toContain('LAMP');
    h.control('reveal');
    expect(view('board').line).toBe(LINES[0]);
  });

  it('letter-question keys stay hidden until the question closes', () => {
    const { h, spinTo, view, answer } = setup();
    spinTo(500);
    h.advance(WHEEL.valueMs);
    h.tick();
    const v = view('student', 'AA');
    expect(v.q?.item.shape).toBe('question');
    expect(v.q?.result).toBeUndefined();
    expect(JSON.stringify(v)).not.toContain('"answer"');
    answer('AA', true);
    expect(view('student', 'AA').you).toMatchObject({ answered: true });
    expect(view('student', 'AA').you?.correct).toBeUndefined();
    h.control('close');
    expect(view('board').q?.result).toMatchObject({ r: 1, n: 3, ok: false });
    expect(view('student', 'AA').you?.correct).toBe(true);
  });

  it('teacher and board get the letters-needed heat strip; students get their own history only', () => {
    const { h, solve, view } = setup();
    h.advance(8000);
    solve('BB', LINES[0]!);
    const heat = view('teacher').heat!;
    expect(heat.puzzles).toHaveLength(3);
    expect(heat.rows.find((r) => r.initials === 'BB')?.cells[0]).toMatchObject({ shown: 0, outlier: false });
    expect(view('student', 'BB').heat).toBeUndefined();
    expect(view('student', 'BB').you?.history[0]?.solve).toMatchObject({ shown: 0 });
    expect(view('student', 'AA').you?.history[0]?.solve).toBeNull();
    expect(view('teacher').winner?.initials).toBe('BB');
    expect(view('board').winner?.initials).toBeUndefined();
  });
});
