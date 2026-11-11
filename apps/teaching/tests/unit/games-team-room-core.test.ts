import { describe, expect, it } from 'vitest';
import { initialState, nextAlarm, publicView, reduce, botTurn } from '@/games/core/room-core';
import type { RoomState, Role, ControlOp, SoloEvent } from '@/games/core/room-protocol';
import { splitGame } from '@/games/core/model';
import { seededRandom } from '@/games/generators/random';
import type { Game } from '@/games/core/schema';
import '@/games/core/room-rules-index';
import type { JeopardyView } from '@/games/kinds/jeopardy/rules';
import { jeopardyGame, responseFor } from './games-jeopardy-fixture';
import { teamMatchGame } from './games-team-match-fixture';
import { RUSH } from './games-wager-rush-fixtures';
import { leaks } from './games-rules-harness';

// Jeopardy and Team match played through the real room reducer (style 'custom'), not the rules harness.
// Invented content only.

const ROSTER: Record<string, string> = { s_aa: 'AA', s_bb: 'BB', s_cc: 'CC', s_dd: 'DD' };

function room(game: Game, teams = 2) {
  const split = splitGame(game, seededRandom(3));
  let now = 1_000_000;
  const state: RoomState = initialState(
    { room: 'room_t', code: '482913', lesson_id: 'lesson_t', class_id: 'class_t', game: split.public, keys: split.keys, style: 'custom', roster: ROSTER, teams: { count: teams }, fold_url: 'dev://fold', opened_at: now },
    now
  );
  const effects: unknown[] = [];
  const act = (a: Parameters<typeof reduce>[1]) => {
    const r = reduce(state, a, now);
    effects.push(...r.effects);
    return r;
  };
  const send = (owner: string, role: Role, msg: Parameters<typeof reduce>[1] extends infer A ? (A extends { type: 'msg'; msg: infer M } ? M : never) : never) => act({ type: 'msg', owner, role, msg });
  act({ type: 'connect', owner: 'teacher', role: 'teacher' });
  for (const [id, ini] of Object.entries(ROSTER)) act({ type: 'connect', owner: id, role: 'student', initials: ini, student_id: id });
  const control = (op: ControlOp, owner = 'teacher', role: Role = 'teacher') => send(owner, role, { t: 'control', op });
  const move = (owner: string, event: SoloEvent) => send(owner, 'student', { t: 'move', event });
  const advance = (ms: number) => {
    now += ms;
    act({ type: 'tick' });
  };
  const start = () => {
    control({ op: 'start' });
    advance(10_000);
    expect(state.phase).toBe('playing');
  };
  const view = (role: Role, owner: string) => publicView(state, role, owner, now);
  const teamOf = (owner: string) => state.seats[owner]?.team;
  return { state, split, act, control, move, advance, start, view, teamOf, effects, now: () => now };
}

describe('Jeopardy through room-core', () => {
  it('plays a tile: captain picks, everyone answers, reveal scores the team share', () => {
    const r = room(jeopardyGame());
    r.start();
    const v0 = r.view('board', 'board').kind_view as JeopardyView;
    expect(v0.phase).toBe('pick');
    const team = v0.turn!.team;
    const captain = Object.keys(ROSTER).find((id) => r.view('student', id).kind_view && (r.view('student', id).kind_view as JeopardyView).me?.captain);
    expect(captain).toBeDefined();
    expect(r.teamOf(captain!)).toBe(team);
    // A non-captain cannot pick; the captain can.
    const other = Object.keys(ROSTER).find((id) => id !== captain)!;
    r.control({ op: 'kind', name: 'pick', data: { tile: 't_n1' } }, other, 'student');
    expect((r.view('board', 'board').kind_view as JeopardyView).phase).toBe('pick');
    r.control({ op: 'kind', name: 'pick', data: { tile: 't_n1' } }, captain!, 'student');
    expect((r.view('board', 'board').kind_view as JeopardyView).phase).toBe('clue');
    // Nothing in any view gives the answer away while the clue is open.
    const answer = 'First person';
    for (const [role, owner] of [['board', 'board'], ['teacher', 'teacher'], ['student', 's_aa']] as const) {
      const kv = r.view(role, owner).kind_view as JeopardyView;
      expect(kv.cur?.answer, role).toBeUndefined();
      expect(JSON.stringify(kv)).not.toMatch(/"correct"/);
    }
    for (const id of Object.keys(ROSTER)) r.move(id, { item: 'i_n1', move: 'answer', response: responseFor(r.split.keys, 'i_n1', r.teamOf(id) === team) } as SoloEvent);
    expect((r.view('board', 'board').kind_view as JeopardyView).phase).toBe('closed');
    r.control({ op: 'kind', name: 'reveal' });
    const after = r.view('board', 'board');
    expect((after.kind_view as JeopardyView).phase).toBe('revealed');
    expect((after.kind_view as JeopardyView).cur?.answer).toContain(answer);
    const scores = Object.fromEntries(after.teams!.map((t) => [t.team, t.score]));
    expect(scores[team]).toBe(150); // all of the picking team right: 100 × 1.5
    expect(scores[1 - team]).toBe(0);
  });

  it('the dev bots can play a whole board through the reducer without breaking anything', () => {
    const r = room(jeopardyGame());
    r.start();
    const rnd = seededRandom(9);
    for (let step = 0; step < 4000 && r.state.phase === 'playing'; step++) {
      for (const id of Object.keys(ROSTER)) {
        const turn = botTurn(r.state, id, r.now(), rnd);
        if (turn && 'move' in turn) r.move(id, turn.move);
        else if (turn) r.control({ op: 'kind', name: turn.control.name, data: turn.control.data }, id, 'student');
      }
      const kv = r.view('board', 'board').kind_view as JeopardyView;
      if (kv.phase === 'closed' || kv.phase === 'final_closed' || kv.phase === 'final_reveal') r.control({ op: 'kind', name: 'reveal' });
      else if (kv.phase === 'revealed') r.control({ op: 'kind', name: 'next' });
      r.advance(1000);
    }
    const kv = r.view('board', 'board').kind_view as JeopardyView;
    expect(['done', 'final_reveal']).toContain(kv.phase);
  });
});

describe('Team match through room-core', () => {
  type TMView = { me?: { round?: { item: string; options: Array<{ id: string; text: string }> } }; lanes?: Array<{ team: number; step: number }> };
  it('deals each team one prompt; only the holder has the answer; a wrong tap sends the team back', () => {
    const r = room(teamMatchGame({ track: 6 }));
    r.start();
    const answers = Object.values(r.split.keys.items).map((k) => (k.shape === 'term' ? k.answers[0] : '')).filter(Boolean) as string[];
    const byTeam = new Map<number, string[]>();
    for (const id of Object.keys(ROSTER)) byTeam.set(r.teamOf(id)!, [...(byTeam.get(r.teamOf(id)!) ?? []), id]);
    for (const [, members] of byTeam) {
      const views = members.map((id) => r.view('student', id).kind_view as TMView);
      const items = new Set(views.map((v) => v.me?.round?.item));
      expect(items.size).toBe(1);
      const ids = views.flatMap((v) => v.me!.round!.options.map((o) => o.id));
      expect(new Set(ids).size).toBe(ids.length); // no option dealt twice
      expect(ids.length).toBe(12);
    }
    // The board and other teams never get a team's hand.
    const [t0, t1] = [...byTeam.values()];
    const hand0 = (r.view('student', t0![0]!).kind_view as TMView).me!.round!.options.map((o) => o.id);
    expect(leaks(r.view('student', t1![0]!), hand0)).toEqual([]);
    expect(leaks(r.view('board', 'board').kind_view, hand0)).toEqual([]);
    expect(answers.length).toBeGreaterThan(0);

    // Team 0: the holder taps right (step 1), then a mate taps a wrong option (back to 0).
    const lane = () => (r.view('board', 'board').kind_view as TMView).lanes!.find((l) => l.team === r.teamOf(t0![0]!))!.step;
    const answerOf = (item: string) => {
      const k = r.split.keys.items[item]!;
      return (k.shape === 'term' ? k.answers[0] : '')!.toLowerCase();
    };
    const hands = t0!.map((id) => ({ id, round: (r.view('student', id).kind_view as TMView).me!.round! }));
    const item = hands[0]!.round.item;
    const holder = hands.find((h) => h.round.options.some((o) => o.text.toLowerCase() === answerOf(item)))!;
    expect(holder).toBeDefined();
    r.move(holder.id, { item, move: 'tap', response: { option: holder.round.options.find((o) => o.text.toLowerCase() === answerOf(item))!.id } } as SoloEvent);
    expect(lane()).toBe(1);
    const next = t0!.map((id) => ({ id, round: (r.view('student', id).kind_view as TMView).me!.round! }));
    const ans2 = answerOf(next[0]!.round.item);
    const wrong = next.flatMap((h) => h.round.options.filter((o) => o.text.toLowerCase() !== ans2).map((o) => ({ id: h.id, o })))[0]!;
    r.move(wrong.id, { item: next[0]!.round.item, move: 'tap', response: { option: wrong.o.id } } as SoloEvent);
    expect(lane()).toBe(0);

    // Both teams to the end through the dev bots: holders tap.
    const rnd = () => 0.1; // holders tap, nobody taps a near miss
    for (let i = 0; i < 40 && r.state.phase === 'playing'; i++) {
      for (const id of Object.keys(ROSTER)) {
        const turn = botTurn(r.state, id, r.now(), rnd);
        if (turn && 'move' in turn) r.move(id, turn.move);
      }
      r.advance(2000);
    }
    expect(r.state.phase).toBe('ended');
  });
});

describe('Points rush through room-core', () => {
  it('ends on its own when its clock runs out: the alarm is the rush end, and the tick there brings the podium', () => {
    const r = room(RUSH);
    r.start();
    const endsAt = r.state.ends_at!;
    expect(endsAt).toBeGreaterThan(r.now());
    expect(nextAlarm(r.state)).toBe(endsAt);
    r.advance(endsAt - r.now() - 1);
    expect(r.state.phase).toBe('playing');
    r.advance(1);
    expect(r.state.phase).toBe('ended');
  });
});
