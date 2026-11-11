import { describe, expect, it } from 'vitest';
import { normaliseAnswer } from '@/games/core/model';
import { OPTIONS, buildOptions, cardsOf, dealHands, teamMatchRules, type TeamMatchState, type TeamMatchView } from '@/games/kinds/team-match/rules';
import { rulesHarness } from './games-rules-harness';
import { teamMatchGame } from './games-team-match-fixture';

// Teams deal round-robin: team 0 = AA CC EE GG, team 1 = BB DD FF HH.
const SEATS = ['AA', 'BB', 'CC', 'DD', 'EE', 'FF', 'GG', 'HH'];

function setup(settings: Parameters<typeof teamMatchGame>[0] = {}, seats = SEATS, teams = 2) {
  const h = rulesHarness<TeamMatchState>(teamMatchRules, teamMatchGame(settings), { seats, teams });
  h.start();
  const round = (team: number) => h.k.teams[team]!.round!;
  const holder = (team: number) => Object.entries(round(team).hands).find(([, hand]) => hand.includes(round(team).right))![0];
  const nonHolder = (team: number) => Object.keys(round(team).hands).find((o) => o !== holder(team))!;
  const ini = (owner: string) => owner.slice(2);
  const tap = (owner: string, option: string, team = h.seats[owner]!.team!) => h.move(ini(owner), { item: round(team).item, move: 'tap', response: { option } });
  const tapRight = (team: number) => tap(holder(team), round(team).right, team);
  const tapFalse = (team: number) => {
    const o = nonHolder(team);
    return tap(o, round(team).hands[o]![0]!, team);
  };
  const view = (role: 'teacher' | 'board' | 'student', owner = 'o_AA') => h.view(role, owner) as TeamMatchView;
  return { h, round, holder, nonHolder, tap, tapRight, tapFalse, view };
}

describe('Team match: the deal', () => {
  it('gives each team 12 different options split across its members, with exactly one holder', () => {
    const { h, round } = setup();
    for (const team of [0, 1]) {
      const r = round(team);
      expect(r.opts).toHaveLength(OPTIONS);
      expect(new Set(r.opts.map((o) => normaliseAnswer(o.text))).size).toBe(OPTIONS);
      const hands = Object.values(r.hands);
      expect(hands).toHaveLength(4);
      expect(hands.map((x) => x.length).sort()).toEqual([3, 3, 3, 3]);
      expect(hands.flat().sort()).toEqual(r.opts.map((o) => o.id).sort());
      expect(hands.filter((x) => x.includes(r.right))).toHaveLength(1);
      // Only this team's members hold options.
      expect(Object.keys(r.hands).every((o) => h.seats[o]!.team === team)).toBe(true);
    }
  });

  it('builds options from the item’s own misreadings first, then other answers', () => {
    const { h } = setup();
    const cards = cardsOf(h.ctx);
    const card = cards.find((c) => c.item === 'q1')!;
    expect(card.answer).toBe('Onomatopoeia');
    expect([...card.lures].sort()).toEqual(['Personification', 'Sibilance']);
    let i = 0;
    const random = () => ((i = (i * 9301 + 49297) % 233280) / 233280);
    const { opts, right } = buildOptions(card, cards, random);
    const texts = opts.map((o) => o.text);
    expect(texts).toEqual(expect.arrayContaining(['Onomatopoeia', 'Sibilance', 'Personification']));
    expect(opts.find((o) => o.id === right)?.text).toBe('Onomatopoeia');
    // Lures go to non-holders first, so every phone has something that looks right.
    const hands = dealHands(opts, right, new Set(card.lures.map(normaliseAnswer)), ['m1', 'm2', 'm3'], random);
    const holder = Object.keys(hands).find((m) => hands[m]!.includes(right))!;
    const lureIds = opts.filter((o) => card.lures.includes(o.text)).map((o) => o.id);
    for (const m of Object.keys(hands)) if (m !== holder) expect(hands[m]!.some((id) => lureIds.includes(id))).toBe(true);
  });

  it('with one member left, that member holds all 12', () => {
    const hands = dealHands(
      Array.from({ length: 12 }, (_, i) => ({ id: `o${i}`, text: `t${i}` })),
      'o3',
      new Set(),
      ['solo'],
      Math.random
    );
    expect(hands.solo).toHaveLength(12);
  });
});

describe('Team match: taps', () => {
  it('a holder’s right tap moves the team one step and deals a new round', () => {
    const { h, round, holder, tapRight } = setup();
    const before = round(0);
    const who = holder(0);
    expect(tapRight(0)).toEqual({ item: before.item, correct: true });
    expect(h.k.teams[0]!.step).toBe(1);
    expect(round(0).n).toBe(before.n + 1);
    expect(h.teamScores[0]).toBe(1);
    expect(h.events.at(-1)).toMatchObject({ owner: who, item: before.item, move: 'tap', correct: true, strength: 'live_team', extra: { holder: true } });
  });

  it('a false tap by a non-holder sends the team back 3 and is logged with what they tapped', () => {
    const { h, round, nonHolder, tapRight, tap } = setup();
    for (let i = 0; i < 4; i++) tapRight(0);
    expect(h.k.teams[0]!.step).toBe(4);
    const r = round(0);
    const who = nonHolder(0);
    const optId = r.hands[who]![0]!;
    const tapped = r.opts.find((o) => o.id === optId)!.text;
    const answer = r.opts.find((o) => o.id === r.right)!.text;
    expect(tap(who, optId)).toEqual({ item: r.item, correct: false });
    expect(h.k.teams[0]!.step).toBe(1);
    expect(h.teamScores[0]).toBe(1);
    expect(h.events.at(-1)).toMatchObject({ owner: who, correct: false, strength: 'live_team', response: { text: tapped }, extra: { holder: false, false_tap: true, tapped, answer } });
    expect(Object.values(h.k.pairs)).toEqual([{ tapped, answer, n: 1, owners: [who] }]);
    expect(h.k.taps[who]?.false_taps).toBe(1);
  });

  it('back to start when the game says so, and the teacher can switch it live', () => {
    const { h, tapRight, tapFalse } = setup({ wrong_tap: 'start' });
    expect(h.k.mode).toBe('start');
    for (let i = 0; i < 5; i++) tapRight(1);
    tapFalse(1);
    expect(h.k.teams[1]!.step).toBe(0);
    expect(h.control('wrong_tap', { mode: 'back3' }, { owner: 'o_BB', role: 'student' })).toMatchObject({ error: { code: 'teacher_only' } });
    h.control('wrong_tap', { mode: 'back3' });
    expect(h.k.mode).toBe('back3');
    for (let i = 0; i < 2; i++) tapRight(1);
    tapFalse(1);
    expect(h.k.teams[1]!.step).toBe(0);
  });

  it('refuses a tap on an option the student doesn’t hold, or from a finished round', () => {
    const { round, holder, nonHolder, tap, tapRight } = setup();
    const r = round(0);
    expect(tap(nonHolder(0), r.right)).toMatchObject({ error: { code: 'stale' } });
    const old = { who: holder(0), id: r.right };
    tapRight(0);
    expect(tap(old.who, old.id)).toMatchObject({ error: { code: 'stale' } });
  });

  it('first to the end wins; play goes on for places; the game ends when every team is home', () => {
    const { h, tapRight } = setup({ track: 6 });
    for (let i = 0; i < 6; i++) tapRight(1);
    expect(h.k.teams[1]!.place).toBe(1);
    expect(h.k.places).toEqual([1]);
    expect(h.k.teams[1]!.round).toBeNull();
    expect(h.ended).toBe(false);
    // Earlier finishers rank above later ones on the team leaderboard.
    expect(h.teamScores[1]).toBe(7);
    for (let i = 0; i < 6; i++) tapRight(0);
    expect(h.k.places).toEqual([1, 0]);
    expect(h.teamScores[0]).toBe(6);
    expect(h.ended).toBe(true);
  });
});

describe('Team match: members coming and going', () => {
  it('a member who drops: their options go to the rest of the team, same question', () => {
    const { h, round, holder } = setup();
    const before = round(0);
    const gone = holder(0);
    h.seats[gone]!.connected = false;
    teamMatchRules.seatChanged?.(h.ctx, h.k, gone);
    const r = round(0);
    expect(r.item).toBe(before.item);
    expect(r.right).toBe(before.right);
    expect(Object.keys(r.hands)).not.toContain(gone);
    expect(Object.values(r.hands).flat().sort()).toEqual(r.opts.map((o) => o.id).sort());
    expect(Object.values(r.hands).map((x) => x.length).sort()).toEqual([4, 4, 4]);
    expect(Object.values(r.hands).filter((x) => x.includes(r.right))).toHaveLength(1);
    // Back again: dealt across four.
    h.seats[gone]!.connected = true;
    teamMatchRules.seatChanged?.(h.ctx, h.k, gone);
    expect(Object.keys(round(0).hands)).toContain(gone);
  });

  it('a seat the teacher removes: its options are dealt to the rest', () => {
    const { h, round, holder } = setup();
    const gone = holder(0);
    delete h.seats[gone];
    teamMatchRules.seatChanged?.(h.ctx, h.k, gone);
    expect(Object.keys(round(0).hands)).not.toContain(gone);
    expect(Object.values(round(0).hands).flat()).toHaveLength(12);
  });
});

describe('Team match: views', () => {
  it('a student sees only their own options, never which is right, never another team’s', () => {
    const { h, round, view } = setup();
    const r0 = round(0);
    const r1 = round(1);
    for (const owner of Object.keys(r0.hands)) {
      const v = view('student', owner);
      const json = JSON.stringify(v);
      expect(v.me?.round?.options.map((o) => o.id).sort()).toEqual([...r0.hands[owner]!].sort());
      for (const [other, hand] of Object.entries(r0.hands)) if (other !== owner) for (const id of hand) expect(json).not.toContain(id);
      for (const id of r1.opts.map((o) => o.id)) expect(json).not.toContain(id);
      // Nothing marks which option is right: the holder's view looks like everyone else's.
      expect(Object.keys(v.me?.round?.options[0] ?? {}).sort()).toEqual(['id', 'text']);
      expect(v.me?.round?.total).toBe(12);
    }
    // Board and teacher never get options at all.
    for (const role of ['board', 'teacher'] as const) {
      const json = JSON.stringify(view(role, role));
      for (const o of [...r0.opts, ...r1.opts]) expect(json).not.toContain(o.id);
    }
  });

  it('after a tap, the team’s phones see who tapped what; other teams don’t', () => {
    const { h, tapFalse, view } = setup();
    tapFalse(0);
    expect(view('student', 'o_CC').me?.last).toMatchObject({ correct: false, from: 0, to: 0 });
    expect(view('student', 'o_BB').lanes.find((l) => l.team === 0)?.last).toBeNull();
    expect(view('board', 'board').lanes.find((l) => l.team === 0)?.last).toMatchObject({ correct: false });
  });

  it('false-tap insight: anonymous on the board, with names for the teacher', () => {
    const { tapFalse, view } = setup();
    tapFalse(0);
    tapFalse(1);
    const board = view('board', 'board').insight!;
    expect(board.pairs.length).toBeGreaterThan(0);
    expect(board.pairs[0]!.who).toBeUndefined();
    expect(board.students).toBeUndefined();
    const teacher = view('teacher', 'teacher').insight!;
    expect(teacher.pairs[0]!.who?.length).toBe(1);
    expect(teacher.students?.filter((s) => s.false_taps === 1)).toHaveLength(2);
  });
});
