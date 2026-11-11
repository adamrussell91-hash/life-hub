import { describe, expect, it } from 'vitest';
import { captainOf, clampWager, jeopardyRules, pickingTeam, tileGain, type JeopardyState, type JeopardyView } from '@/games/kinds/jeopardy/rules';
import { leaks, rulesHarness } from './games-rules-harness';
import { jeopardyGame, responseFor } from './games-jeopardy-fixture';

// Teams deal round-robin: team 0 = AA CC EE GG, team 1 = BB DD FF HH.
const SEATS = ['AA', 'BB', 'CC', 'DD', 'EE', 'FF', 'GG', 'HH'];
const T0 = ['AA', 'CC', 'EE', 'GG'];
const T1 = ['BB', 'DD', 'FF', 'HH'];

function setup(opts: { final?: boolean; seats?: string[] } = {}) {
  const h = rulesHarness<JeopardyState>(jeopardyRules, jeopardyGame(opts), { seats: opts.seats ?? SEATS, teams: 2 });
  h.start();
  const tileItem = (tile: string) => h.keys.live?.jeopardy?.categories.flatMap((c) => c.tiles).find((t) => t.id === tile)?.item as string;
  const answer = (ini: string, item: string, right: boolean) => h.move(ini, { item, move: 'answer', response: responseFor(h.keys, item, right) });
  /** Everyone in `right` answers right, everyone in `wrong` answers wrong. */
  const play = (item: string, right: string[], wrong: string[]) => {
    for (const s of right) answer(s, item, true);
    for (const s of wrong) answer(s, item, false);
  };
  const view = (role: 'teacher' | 'board' | 'student', ini = 'AA') => h.view(role, role === 'student' ? `o_${ini}` : role) as JeopardyView;
  return { h, tileItem, answer, play, view };
}

describe('Jeopardy rules: scoring', () => {
  it('scores value × the share right, picking team ×1.5, rounded to 10', () => {
    const { h, tileItem, play } = setup();
    expect(pickingTeam(h.ctx, h.k)).toBe(0);
    expect(h.control('pick', { tile: 't_n1' })).toBeUndefined();
    expect(h.k.phase).toBe('clue');
    expect(h.timer).toBe(h.now + 20_000);
    const item = tileItem('t_n1');
    play(item, ['AA', 'CC', 'EE', 'BB', 'DD'], ['GG', 'FF', 'HH']);
    // Everyone answered: answers close on their own.
    expect(h.k.phase).toBe('closed');
    h.control('reveal');
    expect(h.k.phase).toBe('revealed');
    // 100 × 3/4 × 1.5 = 112.5 → 110; 100 × 2/4 = 50.
    expect(h.teamScores).toEqual({ 0: 110, 1: 50 });
    expect(h.k.used.t_n1).toEqual({ team: 0, gain: 110 });
  });

  it('counts only connected members (and anyone who answered before dropping)', () => {
    const { h, tileItem, play } = setup();
    h.seats.o_HH!.connected = false; // absent, never answered: not counted
    h.control('pick', { tile: 't_n2' });
    const item = tileItem('t_n2');
    play(item, ['BB', 'DD'], ['FF']);
    play(item, ['AA', 'CC'], ['EE', 'GG']);
    h.seats.o_GG!.connected = false; // answered, then dropped: still counted
    h.control('reveal');
    // Team 1: 200 × 2/3 = 133 → 130. Team 0 (picked): 200 × 2/4 × 1.5 = 150.
    expect(h.teamScores).toEqual({ 0: 150, 1: 130 });
  });

  it('gives a team nobody answered on 0, and ignores a second answer', () => {
    const { h, tileItem, answer } = setup();
    h.control('pick', { tile: 't_s1' });
    const item = tileItem('t_s1');
    answer('AA', item, false);
    answer('AA', item, true);
    h.control('reveal');
    expect(h.teamScores[0] ?? 0).toBe(0);
    expect(h.teamScores[1] ?? 0).toBe(0);
    expect(h.events.filter((e) => e.owner === 'o_AA')).toHaveLength(1);
  });

  it('tileGain matches the spec edge cases', () => {
    expect(tileGain({ value: 300, n: 0, r: 0, answered: 0, pick: true, bonus: 1.5 })).toBe(0);
    expect(tileGain({ value: 300, n: 3, r: 3, answered: 3, pick: true, bonus: 1.5 })).toBe(450);
    expect(tileGain({ value: 300, n: 3, r: 1, answered: 3, pick: false, bonus: 1.5 })).toBe(100);
    expect(tileGain({ value: 0, n: 4, r: 1, answered: 4, pick: true, bonus: 1, wager: 400 })).toBe(-200);
    expect(tileGain({ value: 0, n: 4, r: 0, answered: 0, pick: true, bonus: 1, wager: 400 })).toBe(0);
  });

  it('stores every answer as the student’s own live_solo event with the tile’s value and category', () => {
    const { h, tileItem, answer } = setup();
    h.control('pick', { tile: 't_n3' });
    const res = answer('BB', tileItem('t_n3'), true);
    // Locked in: no verdict on the phone until the reveal.
    expect(res).toEqual({ item: 'i_n3' });
    expect(h.events).toHaveLength(1);
    expect(h.events[0]).toMatchObject({ owner: 'o_BB', item: 'i_n3', move: 'answer', correct: true, strength: 'live_solo', extra: { tile: 't_n3', cat: 'c_nar', value: 300 } });
  });

  it('refuses answers once closed, and the timer closes answers', () => {
    const { h, tileItem, answer } = setup();
    h.control('pick', { tile: 't_n1' });
    h.tick();
    expect(h.k.phase).toBe('closed');
    expect(answer('AA', tileItem('t_n1'), true)).toMatchObject({ error: { code: 'closed' } });
  });
});

describe('Jeopardy rules: turns and captains', () => {
  it('rotates the picking team each tile and the captain each time a team picks', () => {
    const { h } = setup();
    const capIni = (team: number) => h.ctx.seat(captainOf(h.ctx, h.k, team) as string)?.initials;
    expect(capIni(0)).toBe('AA');
    // Only the picking team's captain may pick from a phone.
    expect(h.control('pick', { tile: 't_n1' }, { owner: 'o_CC', role: 'student' })).toMatchObject({ error: { code: 'not_captain' } });
    expect(h.control('aim', { tile: 't_n1' }, { owner: 'o_AA', role: 'student' })).toBeUndefined();
    expect(h.k.aim).toBe('t_n1');
    h.control('pick', { tile: 't_n1' }, { owner: 'o_AA', role: 'student' });
    h.control('reveal');
    h.control('next');
    expect(pickingTeam(h.ctx, h.k)).toBe(1);
    expect(capIni(1)).toBe('BB');
    h.control('pick', { tile: 't_n2' }, { owner: 'o_BB', role: 'student' });
    h.control('reveal');
    h.control('next');
    expect(pickingTeam(h.ctx, h.k)).toBe(0);
    expect(capIni(0)).toBe('CC');
    // A disconnected captain is skipped over.
    h.seats.o_CC!.connected = false;
    expect(capIni(0)).toBe('EE');
  });

  it('refuses a played tile', () => {
    const { h } = setup();
    h.control('pick', { tile: 't_n1' });
    h.control('reveal');
    h.control('next');
    expect(h.control('pick', { tile: 't_n1' })).toMatchObject({ error: { code: 'used' } });
  });
});

describe('Jeopardy rules: Double and Final', () => {
  it('Double: the captain wagers first; the picking team wins or loses its share of the wager', () => {
    const { h, tileItem, play } = setup();
    h.control('pick', { tile: 't_g2' });
    expect(h.k.phase).toBe('wager');
    expect(h.k.cur?.max_wager).toBe(500);
    // The clue stays hidden while the captain wagers.
    expect(h.view('board', 'board')).toMatchObject({ cur: { double: true } });
    expect((h.view('board', 'board') as JeopardyView).cur?.item).toBeUndefined();
    expect(h.control('wager', { amount: 300 }, { owner: 'o_CC', role: 'student' })).toMatchObject({ error: { code: 'not_captain' } });
    h.control('wager', { amount: 300 }, { owner: 'o_AA', role: 'student' });
    expect(h.k.phase).toBe('clue');
    expect(h.k.cur?.wager).toBe(300);
    const item = tileItem('t_g2');
    play(item, ['AA', 'CC', 'EE', 'BB'], ['GG', 'DD', 'FF', 'HH']);
    h.control('reveal');
    // Picking team: 300 × (3 − 1) / 4 = 150. Other team scores the tile as usual: 200 × 1/4 = 50.
    expect(h.teamScores).toEqual({ 0: 150, 1: 50 });
  });

  it('Double: a wager is clamped to 10s inside the cap, and the timer sets the floor', () => {
    expect(clampWager(1234, 500)).toBe(500);
    expect(clampWager(5, 500)).toBe(100);
    expect(clampWager(347, 500)).toBe(350);
    expect(clampWager('x', 500)).toBe(100);
    const { h } = setup();
    h.control('pick', { tile: 't_g2' });
    h.tick();
    expect(h.k.phase).toBe('clue');
    expect(h.k.cur?.wager).toBe(100);
  });

  it('Final: every team wagers, everyone answers, reveal team by team (lowest first)', () => {
    const { h, tileItem, play, view } = setup();
    // Play the whole board quickly: team 0 wins every tile it picks.
    let guard = 0;
    while (h.k.phase === 'pick' && guard++ < 20) {
      const free = h.keys.live!.jeopardy!.categories.flatMap((c) => c.tiles).find((t) => !h.k.used[t.id]) as { id: string };
      h.control('pick', { tile: free.id });
      if (h.k.phase === 'wager') h.control('wager', { amount: 100 });
      play(tileItem(free.id), T0, T1);
      h.control('reveal');
      h.control('next');
    }
    expect(h.k.phase).toBe('final_wager');
    const s0 = h.teamScores[0] ?? 0;
    expect(h.teamScores[1] ?? 0).toBe(0);
    // Team 1 has 0: it can wager nothing. Team 0 wagers up to its score.
    expect(view('student', 'BB').me?.max_wager).toBe(0);
    const cap0 = h.ctx.seat(captainOf(h.ctx, h.k, 0) as string)!.initials;
    const cap1 = h.ctx.seat(captainOf(h.ctx, h.k, 1) as string)!.initials;
    h.control('wager', { amount: 999999 }, { owner: `o_${cap0}`, role: 'student' });
    expect(h.k.final?.wagers[0]).toBe(s0);
    // Another team's wager amount is hidden from students until the reveal.
    expect(view('student', cap1).final?.wagers?.[0]).toBeUndefined();
    h.control('wager', { amount: 50 }, { owner: `o_${cap1}`, role: 'student' });
    expect(h.k.phase).toBe('final_clue');
    const fin = 'i_fin';
    play(fin, ['AA', 'CC', 'BB', 'DD', 'FF'], ['EE', 'GG', 'HH']);
    expect(h.k.phase).toBe('final_closed');
    h.control('reveal');
    // Lowest score first: team 1, whose wager was clamped to 0.
    expect(h.k.final?.shown).toBe(1);
    expect(h.k.final?.results?.[0]).toMatchObject({ team: 1, gain: 0 });
    expect(h.teamScores[0]).toBe(s0);
    h.control('reveal');
    // Team 0: s0 × (2 − 2) / 4 = 0 … they split evenly.
    expect(h.k.final?.results?.[1]).toMatchObject({ team: 0, r: 2, n: 4 });
    expect(h.k.phase).toBe('done');
    h.control('next');
    expect(h.ended).toBe(true);
  });

  it('Final: a team that wins its share gains, and finish() reveals what is left', () => {
    const { h, play } = setup({ seats: ['AA', 'BB', 'CC', 'DD'] });
    h.control('final');
    expect(h.k.phase).toBe('final_wager');
    h.ctx.addTeamScore(0, 400);
    h.control('wager', { amount: 400, team: 0 });
    h.control('wager', { amount: 0, team: 1 });
    play('i_fin', ['AA', 'CC', 'BB'], ['DD']);
    h.finish();
    // Team 0: 400 × (2 − 0)/2 = 400. Team 1: 0.
    expect(h.teamScores[0]).toBe(800);
    expect(h.k.phase).toBe('done');
  });
});

describe('Jeopardy rules: views', () => {
  it('never shows a key before the reveal, to any viewer', () => {
    const { h, tileItem, answer, view } = setup();
    h.control('pick', { tile: 't_n3' });
    answer('AA', tileItem('t_n3'), true);
    // AA's phone shows AA's own typed answer; nobody else's view holds the term.
    expect(view('student', 'AA').me?.text).toBe('intrusive narrator');
    for (const role of ['teacher', 'board', 'student'] as const) {
      const v = view(role, 'BB');
      expect(leaks(v, ['intrusive narrator', 'intrusive']), role).toEqual([]);
      expect(v.cur?.answer).toBeUndefined();
      expect(JSON.stringify(v)).not.toMatch(/"correct"/);
    }
    // The student sees the clue (its definition), not the term.
    expect(view('student').cur?.item).toMatchObject({ shape: 'term' });
    h.control('reveal');
    expect(view('student').cur?.answer).toBe('intrusive narrator');
    expect(view('student').me).toMatchObject({ answered: true, correct: true });
  });

  it('hides which tiles are Doubles until played, and keeps names off students’ answered lists', () => {
    const { h, tileItem, answer, view } = setup();
    expect(JSON.stringify(view('student'))).not.toMatch(/double":true/);
    h.control('pick', { tile: 't_n1' });
    answer('AA', tileItem('t_n1'), true);
    expect(view('board').cur?.answered[0]).toEqual(['AA']);
    expect(view('student', 'BB').cur?.answered[0]).toBe(1);
    // Ceilings (names) are teacher only.
    expect(view('board').insight?.ceilings).toBeUndefined();
    h.control('reveal');
    expect(view('teacher').insight?.ceilings?.find((c) => c.initials === 'AA')?.by_cat).toEqual({ c_nar: 100 });
    expect(view('teacher').insight?.cells).toEqual([{ tile: 't_n1', cat: 'c_nar', value: 100, right: 1, answered: 1 }]);
  });

  it('shows the picking team’s captain on every view, and the student who is captain knows it', () => {
    const { view } = setup();
    expect(view('board').turn).toEqual({ team: 0, captain: 'AA' });
    expect(view('student', 'AA').me).toMatchObject({ team: 0, captain: true });
    expect(view('student', 'BB').me).toMatchObject({ team: 1, captain: true });
    expect(view('student', 'CC').me).toMatchObject({ team: 0, captain: false });
  });
});
