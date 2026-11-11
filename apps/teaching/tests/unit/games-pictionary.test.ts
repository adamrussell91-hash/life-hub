import { describe, expect, it } from 'vitest';
import { GameSchema, type Game } from '@/games/core/schema';
import { ROOM_LIMITS } from '@/games/core/room-protocol';
import { simplify, StrokeStream, type StrokeBatch } from '@/games/kinds/pictionary/canvas';
import { applyStroke, botMove, guessPoints, judgeGuess, pictionaryRules, promptsOf, type PicRound, type PictionaryBoardView, type PictionaryPhoneView, type PictionaryState } from '@/games/kinds/pictionary/rules';
import { splitGame } from '@/games/core/model';
import { leaks, rulesHarness } from './games-rules-harness';
import { fakeApi, kindRoomView, textOf } from './games-kind-api';

// Invented content only ("The Lantern House", a made-up novella).
export function pictionaryGame(settings: Record<string, unknown> = {}): Game {
  return GameSchema.parse({
    id: 'pc1',
    kind: 'pictionary',
    title: 'Draw the Lantern House',
    items: [
      { id: 'p1', shape: 'term', term: 'Pathetic fallacy', accept: [], draw_prompt: 'A storm that matches a sad mood', clues: [], pieces: ['kp_ab12'] },
      { id: 'p2', shape: 'term', term: 'Foreshadowing', clues: [], pieces: ['kp_cd34'] },
      { id: 'p3', shape: 'quote', text: 'The lantern went out on the thirteenth stair.', speaker: '', accept: ['lantern stair'], pieces: [] }
    ],
    settings
  });
}

const SEATS = ['AA', 'BB', 'CC', 'DD'];
const setup = (settings: Record<string, unknown> = {}) => {
  const h = rulesHarness(pictionaryRules, pictionaryGame(settings), { seats: SEATS });
  h.start();
  return h;
};
type H = ReturnType<typeof setup>;
const k = (h: H) => h.k as PictionaryState;
const board = (h: H) => h.view('board', 'board') as PictionaryBoardView;
const phone = (h: H, ini: string) => h.view('student', `o_${ini}`) as PictionaryPhoneView;
const ANSWERS: Record<string, string> = { p1: 'Pathetic fallacy', p2: 'Foreshadowing', p3: 'lantern stair' };

describe('Pictionary guesses', () => {
  const { keys } = splitGame(pictionaryGame());
  const prompts = promptsOf(keys);
  it('takes small slips, key words of a quote, and says Close! for one key word', () => {
    const p1 = prompts.get('p1')!;
    expect(judgeGuess(p1, 'pathetic fallacy').right).toBe('Pathetic fallacy');
    expect(judgeGuess(p1, 'Pathetic falacy').right).toBe('Pathetic fallacy');
    expect(judgeGuess(p1, 'fallacy')).toEqual({ right: null, close: true });
    expect(judgeGuess(p1, 'storm')).toEqual({ right: null, close: false });
    const p3 = prompts.get('p3')!;
    expect(p3.blanks).toBe('lantern stair');
    expect(judgeGuess(p3, 'the lantern on the stair').right).toBe('lantern stair');
    expect(judgeGuess(p3, 'lantern')).toEqual({ right: null, close: true });
  });
  it('the drawer draws the draw prompt, not the term', () => {
    expect(prompts.get('p1')!.prompt).toBe('A storm that matches a sad mood');
    expect(prompts.get('p2')!.prompt).toBe('Foreshadowing');
  });
  it('scores guessers by speed (at least 40)', () => {
    expect(guessPoints(0)).toBe(200);
    expect(guessPoints(10_000)).toBe(180);
    expect(guessPoints(75_000)).toBe(40);
  });
});

describe('Pictionary rules', () => {
  it('runs a round: the drawer gets the prompt, guessers get blanks, right guesses score and are marked at the close', () => {
    const h = setup({ seconds: 60 });
    h.control('next_round');
    const r = k(h).round!;
    expect(r.drawer).toBe('o_AA');
    // The alarm wakes first for the 40 s hint; the round itself runs 60 s.
    expect(h.timer).toBe(h.now + 40_000);
    expect(k(h).round?.seconds).toBe(60);
    const answer = ANSWERS[r.item]!;
    const prompt = promptsOf(h.keys).get(r.item)!;
    expect(phone(h, 'AA').role).toBe('drawer');
    expect(phone(h, 'AA').prompt).toBe(prompt.prompt);
    expect(phone(h, 'BB').role).toBe('guesser');
    expect(phone(h, 'BB').blanks?.lengths.length).toBeGreaterThan(0);
    // A wrong try first, then right after 10 s.
    expect(h.move('BB', { item: r.item, move: 'guess', response: { text: 'a storm' } })).toEqual({ item: r.item, correct: false });
    h.advance(10_000);
    expect(h.move('BB', { item: r.item, move: 'guess', response: { text: answer } })).toEqual({ item: r.item, correct: true });
    expect(h.seats.o_BB!.score).toBe(180);
    expect(h.seats.o_AA!.score).toBe(20);
    expect(phone(h, 'BB').mine).toMatchObject({ got: true, s: 10, points: 180 });
    expect(phone(h, 'BB').answer).toBeTruthy();
    // Nobody else learns the answer, and the board shows initials only.
    expect(leaks(phone(h, 'CC'), [answer, prompt.prompt])).toEqual([]);
    expect(leaks(board(h), [answer, prompt.prompt])).toEqual([]);
    expect(board(h).got).toEqual([{ initials: 'BB', s: 10 }]);
    expect(JSON.stringify(board(h))).not.toContain('a storm');
    // Nothing marked while the round runs.
    expect(h.events.filter((e) => e.move === 'guess')).toHaveLength(0);
    h.move('CC', { item: r.item, move: 'guess', response: { text: 'thunder' } });
    // The alarms ring as the room sets them: the 40 s hint, then time runs out.
    h.advance(r.started_at + 40_000 - h.now);
    h.tick();
    h.advance(r.started_at + r.seconds * 1000 - h.now);
    h.tick();
    expect(board(h).phase).toBe('reveal');
    expect(board(h).answer).toBe(prompt.answer);
    const guesses = h.events.filter((e) => e.move === 'guess');
    expect(guesses).toEqual([
      expect.objectContaining({ owner: 'o_BB', item: r.item, correct: true, time_ms: 10_000, strength: 'live_solo', extra: { guesses: 2 } }),
      expect.objectContaining({ owner: 'o_CC', item: r.item, correct: false, extra: expect.objectContaining({ guesses: 1 }) })
    ]);
    expect(h.events.find((e) => e.move === 'draw')).toMatchObject({ owner: 'o_AA', extra: { got: 1, of: 3, void: false } });
    expect(board(h).gallery[0]).toMatchObject({ drawer: 'AA', got: 1, of: 3, void: false });
  });

  it('ends the round when everyone has it, then rotates the drawer', () => {
    const h = setup();
    h.control('next_round');
    const r = k(h).round!;
    for (const ini of ['BB', 'CC', 'DD']) h.move(ini, { item: r.item, move: 'guess', response: { text: ANSWERS[r.item] } });
    expect(board(h).phase).toBe('reveal');
    expect(board(h).closed).toBe('all');
    h.control('next_round');
    expect(k(h).round!.drawer).toBe('o_BB');
  });

  it('the room’s alarm wakes at 40 s for the hint (nobody needs to move), then at the end', () => {
    const h = setup();
    h.control('next_round');
    const r = k(h).round!;
    expect(h.timer).toBe(r.started_at + 40_000);
    h.advance(40_000);
    h.tick();
    expect(k(h).phase).toBe('draw');
    expect(board(h).blanks?.first?.length).toBeGreaterThan(0);
    expect(h.timer).toBe(r.started_at + r.seconds * 1000);
    h.advance(r.seconds * 1000 - 40_000);
    h.tick();
    expect(k(h).phase).toBe('reveal');
  });

  it('a pause (the alarm firing late) comes off the round’s clock', () => {
    const h = setup();
    h.control('next_round');
    const r = k(h).round!;
    const started = r.started_at;
    h.advance(40_000 + 30_000);
    h.tick();
    expect(k(h).phase).toBe('draw');
    expect(r.started_at).toBe(started + 30_000);
    expect(h.timer).toBe(r.started_at + r.seconds * 1000);
  });

  it('+15 s keeps the hint alarm when it hasn’t rung yet', () => {
    const h = setup();
    h.control('next_round');
    h.control('more_time');
    const r = k(h).round!;
    expect(r.seconds).toBe(90);
    expect(h.timer).toBe(r.started_at + 40_000);
  });

  it('views are copies: a second guess changes the view the room last sent (no shared arrays)', () => {
    const h = setup();
    h.control('next_round');
    const r = k(h).round!;
    const guesser = SEATS.find((s) => `o_${s}` !== r.drawer)!;
    h.move(guesser, { item: r.item, move: 'guess', response: { text: 'metaphor' } });
    const before = phone(h, guesser);
    const sentBoard = board(h);
    const sent = JSON.stringify(before);
    h.move(guesser, { item: r.item, move: 'guess', response: { text: 'tone' } });
    expect(JSON.stringify(before)).toBe(sent);
    expect(phone(h, guesser).mine?.tries).toHaveLength(2);
    h.control('end_round');
    expect(sentBoard.gallery).toHaveLength(0);
    expect(board(h).gallery).toHaveLength(1);
  });

  it('first letters appear after 40 s, never before', () => {
    const h = setup();
    h.control('next_round');
    expect(phone(h, 'BB').blanks?.first).toBeUndefined();
    h.advance(40_000);
    expect(phone(h, 'BB').blanks?.first?.length).toBeGreaterThan(0);
  });

  it('Disqualify drawing voids the round: points come back off, nothing is marked', () => {
    const h = setup();
    h.control('next_round');
    const r = k(h).round!;
    h.move('BB', { item: r.item, move: 'guess', response: { text: ANSWERS[r.item] } });
    expect(h.seats.o_BB!.score).toBeGreaterThan(0);
    h.control('disqualify');
    expect(h.seats.o_BB!.score).toBe(0);
    expect(h.seats.o_AA!.score).toBe(0);
    expect(h.events.filter((e) => e.move === 'guess')).toHaveLength(0);
    expect(h.events.find((e) => e.move === 'draw')).toMatchObject({ extra: { void: true } });
    expect(board(h).gallery[0]?.void).toBe(true);
  });

  it('relays strokes to the board only; guessers’ views never change with a stroke', () => {
    const h = setup();
    h.control('next_round');
    const r = k(h).round!;
    const before = JSON.stringify(phone(h, 'BB'));
    expect(h.move('AA', { item: r.item, move: 'draw', response: { s: 1, c: 1, w: 0, p: [10, 10, 20, 20], from: 0 } })).toEqual({ item: r.item });
    expect(h.move('AA', { item: r.item, move: 'draw', response: { s: 1, c: 1, w: 0, p: [30, 30], from: 2 } })).toEqual({ item: r.item });
    expect(board(h).strokes).toEqual([{ c: 1, w: 0, p: [10, 10, 20, 20, 30, 30] }]);
    // A repeated batch adds only what's new; the stroke end replaces the live points.
    h.move('AA', { item: r.item, move: 'draw', response: { s: 1, c: 1, w: 0, p: [30, 30, 40, 40], from: 2 } });
    expect(board(h).strokes![0]!.p).toEqual([10, 10, 20, 20, 30, 30, 40, 40]);
    h.move('AA', { item: r.item, move: 'draw', response: { s: 1, c: 1, w: 0, p: [10, 10, 40, 40], full: true } });
    expect(board(h).strokes![0]!.p).toEqual([10, 10, 40, 40]);
    expect(JSON.stringify(phone(h, 'BB'))).toBe(before);
    expect(JSON.stringify(phone(h, 'BB'))).not.toContain('strokes');
    // Only the drawer draws; strokes aren't events.
    expect(h.move('BB', { item: r.item, move: 'draw', response: { s: 9, p: [1, 1] } })).toMatchObject({ error: { code: 'not_drawer' } });
    expect(h.events).toHaveLength(0);
    h.move('AA', { item: r.item, move: 'draw', response: { undo: true } });
    expect(board(h).strokes).toEqual([]);
    expect(h.move('AA', { item: r.item, move: 'draw', response: { s: 2, p: [1, 2, 3] } })).toMatchObject({ error: { code: 'bad_stroke' } });
  });

  it('caps a drawing and clamps points to the square', () => {
    const r = { strokes: [] } as unknown as PicRound;
    expect(applyStroke(r, { s: 1, p: [-50, 2000], from: 0 })).toBeNull();
    expect(r.strokes[0]!.p).toEqual([0, 1000]);
    for (let i = 2; i < 400; i++) applyStroke(r, { s: i, p: [1, 1], from: 0 });
    expect(r.strokes.length).toBe(300);
    expect(applyStroke(r, { s: 999, p: [1, 1], from: 0 })).toBe('too_much');
  });

  it('the teacher can draw from the laptop: the laptop’s board gets the prompt (held to peek), students never do', () => {
    const h = setup();
    expect(board(h).prompt).toBeUndefined();
    h.control('teacher_draws');
    const r = k(h).round!;
    expect(r.drawer).toBe('teacher');
    const prompt = promptsOf(h.keys).get(r.item)!.prompt;
    expect((h.view('teacher', 'teacher') as PictionaryBoardView).prompt).toBe(prompt);
    // The laptop runs the board ticket, so the board view must carry it or nobody can draw.
    expect(board(h).prompt).toBe(prompt);
    for (const s of SEATS) expect(leaks(phone(h, s), [prompt])).toEqual([]);
    expect(h.control('stroke', { s: 1, p: [5, 5], from: 0 })).toBeUndefined();
    expect(board(h).strokes).toHaveLength(1);
    expect(h.control('stroke', { s: 1, p: [5, 5] }, { owner: 'o_BB', role: 'student' })).toMatchObject({ error: { code: 'not_drawer' } });
    // Every seat guesses when the teacher draws.
    expect(board(h).guessers).toBe(4);
  });
});

describe('Pictionary stroke streaming', () => {
  it('batches a moving finger to about ten messages a second, inside the room’s burst', () => {
    const s = new StrokeStream(100);
    const sent: StrokeBatch[] = [];
    let t = 0;
    s.down(100, 100, 0, 0);
    // Two seconds of pointer samples every 8 ms, drained every 50 ms.
    for (; t <= 2000; t += 8) {
      s.point(100 + t / 4, 100 + Math.sin(t / 100) * 50);
      if (t % 48 === 0) for (let b = s.take(t); b; b = s.take(t)) sent.push(b);
    }
    s.up();
    for (let b = s.take(t); b; b = s.take(t)) sent.push(b);
    const live = sent.filter((b) => 'p' in b && !('full' in b));
    expect(live.length).toBeGreaterThanOrEqual(15);
    expect(live.length).toBeLessThanOrEqual(22);
    expect(sent.at(-1)).toMatchObject({ s: 1, full: true });
    // Ten a second for ten seconds is 100 moves: well inside the rules' burst and above the default the other kinds get.
    expect(pictionaryRules.burst).toBeGreaterThan(ROOM_LIMITS.burst);
    expect(pictionaryRules.burst!).toBeGreaterThanOrEqual(150);
    // The live batches line up: each starts where the last left off.
    let held = 0;
    for (const b of live) {
      if (!('from' in b)) continue;
      expect(b.from).toBe(held);
      held += b.p.length / 2;
    }
  });

  it('simplifies a straight line to its ends', () => {
    expect(simplify([0, 0, 10, 10, 20, 20, 30, 30])).toEqual([0, 0, 30, 30]);
    expect(simplify([0, 0, 50, 80, 100, 0]).length).toBe(6);
  });
});

describe('Pictionary board and phone', () => {
  const mount = async () => {
    await import('@/games/kinds/pictionary/live');
    const { liveKind } = await import('@/games/live/kind-views');
    const { setCalm } = await import('@/games/motion/motion');
    setCalm(true);
    return liveKind('pictionary')!;
  };

  it('board paints the drawing and lists who got it; the phone guesses and goes green', async () => {
    const live = await mount();
    const h = setup();
    h.control('next_round');
    const r = k(h).round!;
    const host = document.createElement('div');
    document.body.append(host);
    const b = live.board(host, fakeApi('board'));
    const room = () => kindRoomView('pictionary', board(h), { ends_at: h.timer });
    b.update(room());
    expect(host.querySelector('canvas')).not.toBeNull();
    expect(textOf(host)).toContain('AA');
    expect(b.controls?.(room()).map((c) => c.name)).toEqual(['disqualify', 'more_time', 'end_round']);
    const gh = document.createElement('div');
    document.body.append(gh);
    const api = fakeApi('o_BB', { onMove: (e) => h.move('BB', e) as never });
    const p = live.phone(gh, api);
    p.update(kindRoomView('pictionary', phone(h, 'BB')));
    // R4: the guess box goes in the phone's docked action row.
    const dock = document.createElement('div');
    dock.append(...((api.actions ?? []) as HTMLElement[]));
    gh.append(dock);
    const input = gh.querySelector('form input') as HTMLInputElement;
    expect(input.getAttribute('enterkeyhint')).toBe('send');
    expect(Number.parseFloat(getComputedStyle(input).fontSize || '16')).toBeGreaterThanOrEqual(16);
    input.value = ANSWERS[r.item]!;
    gh.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise((res) => setTimeout(res, 0));
    expect(api.moves[0]).toMatchObject({ item: r.item, move: 'guess', response: { text: ANSWERS[r.item] } });
    p.update(kindRoomView('pictionary', phone(h, 'BB')));
    expect(gh.querySelector('.pc-gotit')).not.toBeNull();
    b.update(room());
    expect(textOf(host)).toContain('BB');
    // The drawer's phone has the pad and the prompt.
    const dh = document.createElement('div');
    document.body.append(dh);
    const dapi = fakeApi('o_AA', { onMove: (e) => h.move('AA', e) as never });
    const d = live.phone(dh, dapi);
    d.update(kindRoomView('pictionary', phone(h, 'AA')));
    expect(dh.querySelector('.pc-pad canvas')).not.toBeNull();
    expect(textOf(dh)).toContain(promptsOf(h.keys).get(r.item)!.prompt);
    expect(dh.querySelectorAll('.pc-tools button').length).toBe(6);
    expect(((dapi.actions ?? []) as HTMLElement[]).map((a) => a.textContent)).toEqual(['Undo', 'Clear']);
    b.dispose();
    p.dispose();
    d.dispose();
  });
});

describe('Pictionary dev bot (Simulate class)', () => {
  it('the drawer draws and guessers guess until the round closes', () => {
    const h = setup();
    h.control('next_round');
    const r = k(h).round!;
    for (let i = 0; i < 400 && k(h).phase === 'draw'; i++) {
      for (const s of SEATS) {
        const turn = botMove(h.ctx, k(h), `o_${s}`);
        if (turn) expect('error' in h.move(s, turn.move)).toBe(false);
      }
      h.advance(1000);
    }
    expect(r.strokes.length).toBeGreaterThan(0);
    expect(k(h).phase).toBe('reveal');
    expect(r.closed).toBe('all');
  });
});
