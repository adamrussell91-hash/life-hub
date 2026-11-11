import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GameSchema, type Game } from '@/games/core/schema';
import { articulateBot, articulateRules, type ArticulateBoardView, type ArticulatePhoneView, type ArticulateState } from '@/games/kinds/articulate/rules';
import { leaks, rulesHarness } from './games-rules-harness';
import { fakeApi, kindRoomView, textOf } from './games-kind-api';

// Invented content only (a made-up novella, "The Lantern House").
const TERMS: Array<[string, string, string[], string, string]> = [
  ['t1', 'Pathetic fallacy', ['weather', 'mood', 'emotion'], 'Weather or nature that mirrors a character’s feelings', 'Rain lashes the windows as Mira grieves.'],
  ['t2', 'Foreshadowing', ['hint', 'future', 'later'], 'A hint early on of what will happen later', 'The keeper warns Mira to keep to the lit rooms.'],
  ['t3', 'Personification', ['human', 'alive'], 'Giving human qualities to something that is not human', 'The house held its breath.'],
  ['t4', 'Symbolism', ['represents', 'stands'], 'An object that stands for a bigger idea', 'The lantern stands for hope.'],
  ['t5', 'Motif', ['repeat', 'pattern'], 'An image or idea that keeps coming back in a text', 'Stairs appear in every chapter.'],
  ['t6', 'Juxtaposition', ['contrast', 'side'], 'Two things placed side by side to show a contrast', 'The warm kitchen beside the frozen cellar.'],
  ['t7', 'Hyperbole', ['exaggerate'], 'Deliberate exaggeration for effect', 'A thousand stairs to the attic.']
];

export function articulateGame(settings: Record<string, unknown> = {}): Game {
  return GameSchema.parse({
    id: 'ar1',
    kind: 'articulate',
    title: 'Lantern House terms',
    items: TERMS.map(([id, term, banned, def, ex]) => ({ id, shape: 'term', term, banned, clues: [{ kind: 'definition', text: def }, { kind: 'example', text: ex }], pieces: ['kp_ab12'] })),
    settings
  });
}

const SEATS = ['AA', 'BB', 'CC', 'DD', 'EE', 'FF'];
const board = (h: ReturnType<typeof setup>) => h.view('board', 'board') as ArticulateBoardView;
const phone = (h: ReturnType<typeof setup>, ini: string) => h.view('student', `o_${ini}`) as ArticulatePhoneView;
const setup = (settings: Record<string, unknown> = {}) => {
  const h = rulesHarness(articulateRules, articulateGame(settings), { seats: SEATS, teams: 2 });
  h.start();
  return h;
};
const k = (h: ReturnType<typeof setup>) => h.k as ArticulateState;
const termOf = (id: string) => TERMS.find((t) => t[0] === id)?.[1] ?? '';

describe('Articulate rules', () => {
  it('runs a turn: the describer sees the card, Got it scores the team, the timer ends the turn', () => {
    const h = setup({ seconds: 30 });
    // Seats are dealt round-robin: team 0 = AA, CC, EE; team 1 = BB, DD, FF.
    expect(board(h).phase).toBe('ready');
    expect(board(h).describer).toBe('AA');
    expect(h.control('start_turn')).toBeUndefined();
    expect(h.timer).toBe(h.now + 30_000);
    const card = phone(h, 'AA').card!;
    expect(phone(h, 'AA').role).toBe('describer');
    expect(card.term).toBe(termOf(card.item));
    expect(card.banned.length).toBeGreaterThan(0);
    h.advance(4000);
    expect(h.move('AA', { item: card.item, move: 'describe', response: { result: 'got' } })).toEqual({ item: card.item });
    expect(h.teamScores[0]).toBe(1);
    expect(h.seats.o_AA!.score).toBe(1);
    const ev = h.events.at(-1)!;
    expect(ev).toMatchObject({ owner: 'o_AA', item: card.item, move: 'describe', strength: 'live_team', time_ms: 4000, extra: { result: 'got' } });
    expect(board(h).cards).toEqual([{ item: card.item, term: termOf(card.item), result: 'got' }]);
    // Somebody else can't press Got it.
    const next = phone(h, 'AA').card!;
    expect(h.move('CC', { item: next.item, move: 'describe', response: { result: 'got' } })).toHaveProperty('error');
    h.tick();
    expect(board(h).phase).toBe('end');
    expect(board(h).why).toBe('time');
    expect(h.timer).toBeUndefined();
    // The card in play when time ran out goes back on top of the deck.
    expect(k(h).deck[0]).toBe(next.item);
  });

  it('allows two passes a turn and puts passed cards at the back of the deck', () => {
    const h = setup();
    h.control('start_turn');
    const first = phone(h, 'AA').card!.item;
    expect(h.move('AA', { item: first, move: 'pass' })).toEqual({ item: first });
    expect(k(h).deck.at(-1)).toBe(first);
    const second = phone(h, 'AA').card!.item;
    h.move('AA', { item: second, move: 'describe', response: { result: 'pass' } });
    expect(phone(h, 'AA').passes_left).toBe(0);
    const third = phone(h, 'AA').card!.item;
    expect(h.move('AA', { item: third, move: 'pass' })).toMatchObject({ error: { code: 'no_passes' } });
    expect(h.events.filter((e) => e.move === 'pass')).toHaveLength(2);
  });

  it('buzzes: the teacher or the other team’s captain, never a teammate', () => {
    const h = setup();
    h.control('start_turn');
    const card = phone(h, 'AA').card!.item;
    // CC is on the describing team; BB captains team 1.
    expect(h.control('buzz', undefined, { owner: 'o_CC', role: 'student' })).toMatchObject({ error: { code: 'not_allowed' } });
    expect(h.control('buzz', undefined, { owner: 'o_DD', role: 'student' })).toMatchObject({ error: { code: 'not_allowed' } });
    expect(phone(h, 'BB').role).toBe('captain');
    expect(phone(h, 'BB').card?.item).toBe(card);
    expect(h.control('buzz', { item: card }, { owner: 'o_BB', role: 'student' })).toBeUndefined();
    expect(h.events.at(-1)).toMatchObject({ owner: 'o_AA', move: 'buzz', item: card, extra: { by: 'captain' } });
    expect(board(h).cards[0]).toMatchObject({ item: card, result: 'buzz' });
    // A buzzed card is out: not back in the deck.
    expect(k(h).deck).not.toContain(card);
    const next = phone(h, 'AA').card!.item;
    expect(h.control('buzz')).toBeUndefined();
    expect(board(h).cards[1]).toMatchObject({ item: next, result: 'buzz', term: termOf(next) });
  });

  it('never shows the card in play to the board, the teacher, guessers or watchers', () => {
    const h = setup();
    h.control('start_turn');
    const card = phone(h, 'AA').card!;
    const t = TERMS.find((x) => x[0] === card.item)!;
    const secrets = [t[1], ...t[2]];
    for (const [role, owner] of [['board', 'board'], ['teacher', 'teacher'], ['student', 'o_CC'], ['student', 'o_EE'], ['student', 'o_DD'], ['student', 'o_FF']] as const) {
      expect(leaks(h.view(role, owner), secrets), `${role} ${owner}`).toEqual([]);
    }
    // And no other card in the deck leaks to anyone but the describer and captain either.
    const rest = TERMS.filter((x) => x[0] !== card.item).flatMap((x) => [x[1], ...x[2]]);
    for (const ini of SEATS) expect(leaks(h.view('student', `o_${ini}`), rest)).toEqual([]);
    expect(leaks(h.view('board', 'board'), rest)).toEqual([]);
  });

  it('rotates describers and teams, then opens the quick check after the last team', () => {
    const h = setup();
    h.control('start_turn');
    h.control('end_turn');
    expect(board(h).next_team).toBe(1);
    h.control('next_turn');
    expect(board(h).describer).toBe('BB');
    h.control('start_turn');
    h.control('end_turn');
    expect(board(h).last_turn).toBe(true);
    h.control('next_turn');
    expect(board(h).phase).toBe('check');
    // Round two: the next member of each team describes.
    h.control('reveal');
    h.control('next_round');
    expect(board(h).describer).toBe('CC');
  });

  it('quick check: every phone gets the round’s terms; answers are marked live_solo and only then revealed', () => {
    const h = setup({ quick_check_items: 3 });
    h.control('start_turn');
    for (let i = 0; i < 3; i++) {
      const c = phone(h, 'AA').card!;
      h.move('AA', { item: c.item, move: 'describe', response: { result: 'got' } });
    }
    h.control('check');
    const p = phone(h, 'CC');
    expect(p.phase).toBe('check');
    const qs = p.check!.questions;
    expect(qs).toHaveLength(3);
    // The round's cards are asked about first.
    const dealt = h.events.filter((e) => e.move === 'describe').map((e) => e.item);
    expect(qs.map((q) => q.item)).toEqual(dealt);
    // Nothing says which option is right before answering.
    expect(JSON.stringify(p)).not.toMatch(/"right"/);
    expect(JSON.stringify(board(h))).not.toMatch(/"right"/);
    const q = qs[0]!;
    const def = TERMS.find((t) => t[0] === q.item)![3];
    const right = q.options.find((o) => o.text === def)!;
    const wrong = q.options.find((o) => o.text !== def)!;
    expect(q.options).toHaveLength(4);
    h.advance(2500);
    expect(h.move('CC', { item: q.item, move: 'answer', response: { option: right.id }, time_ms: 2500 })).toEqual({ item: q.item, correct: true });
    expect(h.events.at(-1)).toMatchObject({ owner: 'o_CC', item: q.item, move: 'answer', correct: true, strength: 'live_solo', extra: { check: 'definition' } });
    // Twice: the first answer stands, nothing new stored.
    const n = h.events.length;
    expect(h.move('CC', { item: q.item, move: 'answer', response: { option: wrong.id } })).toEqual({ item: q.item, correct: true });
    expect(h.events).toHaveLength(n);
    expect(h.move('DD', { item: q.item, move: 'answer', response: { option: wrong.id } })).toEqual({ item: q.item, correct: false });
    expect(h.events.at(-1)).toMatchObject({ owner: 'o_DD', correct: false, extra: { picked: expect.any(String) } });
    const mine = phone(h, 'DD').check!.questions[0]!.answer!;
    expect(mine).toMatchObject({ option: wrong.id, correct: false, right: right.id });
    // Someone who hasn't answered still doesn't see it.
    expect(phone(h, 'EE').check!.questions[0]!.answer).toBeUndefined();
    expect(board(h).check!.questions[0]!.answered).toBe(2);
    expect(board(h).check!.questions[0]!.pct).toBeUndefined();
    h.control('reveal_check');
    expect(board(h).check!.questions[0]!.pct).toBe(50);
    expect(board(h).check!.revealed).toBe(true);
    expect(phone(h, 'CC').mine).toEqual({ described: 0, check_right: 1, check_of: 3 });
    expect(phone(h, 'AA').mine?.described).toBe(3);
  });

  it('skips the quick check when it is turned off', () => {
    const h = setup({ quick_check: false });
    h.control('start_turn');
    h.control('check');
    expect(board(h).phase).toBe('checked');
    expect(phone(h, 'AA').check?.questions).toEqual([]);
  });

  it('teacher view has the per-describer table; the board does not', () => {
    const h = setup();
    h.control('start_turn');
    const c = phone(h, 'AA').card!;
    h.advance(3000);
    h.move('AA', { item: c.item, move: 'describe', response: { result: 'got' } });
    h.control('check');
    const t = h.view('teacher', 'teacher') as ArticulateBoardView;
    expect(t.describers?.[0]).toMatchObject({ initials: 'AA', got: 1, passed: 0, buzzed: 0, avg_s: 3 });
    expect(board(h).describers).toBeUndefined();
  });

  it('a describer with no cards left ends the turn (deck)', () => {
    const h = setup();
    h.control('start_turn');
    for (let i = 0; i < TERMS.length; i++) {
      const c = phone(h, 'AA').card;
      if (!c) break;
      h.move('AA', { item: c.item, move: 'describe', response: { result: 'got' } });
    }
    expect(board(h).phase).toBe('end');
    expect(board(h).why).toBe('deck');
    expect(h.teamScores[0]).toBe(TERMS.length);
  });

  it('the next team still gets cards after a team clears the deck (walk: Start turn did nothing)', () => {
    const h = setup();
    h.control('start_turn');
    // Team 0 gets every card but one, which is buzzed out.
    for (let i = 0; i < TERMS.length - 1; i++) h.move('AA', { item: phone(h, 'AA').card!.item, move: 'describe', response: { result: 'got' } });
    const missed = phone(h, 'AA').card!.item;
    expect(h.control('buzz')).toBeUndefined();
    expect(board(h).why).toBe('deck');
    h.control('next_turn');
    expect(board(h).team).toBe(1);
    expect(h.control('start_turn')).toBeUndefined();
    expect(board(h).phase).toBe('turn');
    // First the card nobody got this round; then, with every card got, the whole deck again.
    expect(phone(h, 'BB').card!.item).toBe(missed);
    h.move('BB', { item: missed, move: 'describe', response: { result: 'got' } });
    expect(board(h).why).toBe('deck');
    h.control('check');
    h.control('reveal_check');
    h.control('next_round');
    expect(h.control('start_turn')).toBeUndefined();
    expect(k(h).deck.length + 1).toBe(TERMS.length);
  });
});

describe('Articulate board and phone', () => {
  const mount = async () => {
    await import('@/games/kinds/articulate/live');
    const { liveKind } = await import('@/games/live/kind-views');
    const { setCalm } = await import('@/games/motion/motion');
    setCalm(true);
    return liveKind('articulate')!;
  };

  it('board shows the team up, the face-down card and landed cards, never the card in play', async () => {
    const live = await mount();
    const h = setup();
    const host = document.createElement('div');
    document.body.append(host);
    const api = fakeApi('board');
    const view = live.board(host, api);
    const room = (role: 'board' | 'teacher' = 'board') => kindRoomView('articulate', h.view(role, role), { teams: [{ team: 0, score: h.teamScores[0] ?? 0, members: [], rank: 1 }, { team: 1, score: h.teamScores[1] ?? 0, members: [], rank: 2 }], ends_at: h.timer });
    view.update(room());
    expect(textOf(host)).toContain('Kestrels, you’re up');
    expect(view.controls?.(room()).map((c) => c.name)).toEqual(['start_turn']);
    h.control('start_turn');
    view.update(room());
    const card = phone(h, 'AA').card!;
    expect(textOf(host)).not.toContain(card.term);
    expect(host.querySelector('.ar-back')).not.toBeNull();
    h.move('AA', { item: card.item, move: 'describe', response: { result: 'got' } });
    view.update(room());
    expect(host.querySelector('.ar-land.is-got')?.textContent).toContain(card.term);
    expect(host.querySelector('.ar-num')?.textContent).toBe('1');
    expect(view.controls?.(room()).map((c) => c.name)).toEqual(['end_turn', 'buzz']);
    h.control('check');
    view.update(room());
    expect(host.querySelectorAll('.ar-qrow').length).toBeGreaterThanOrEqual(3);
    view.dispose();
  });

  it('phone: describer gets Got it and Pass; teammates guess aloud; the quick check answers once', async () => {
    const live = await mount();
    const h = setup();
    h.control('start_turn');
    const host = document.createElement('div');
    document.body.append(host);
    const api = fakeApi('o_AA', { onMove: (e) => h.move('AA', e) as never });
    const v = live.phone(host, api);
    v.update(kindRoomView('articulate', phone(h, 'AA')));
    const card = phone(h, 'AA').card!;
    expect(host.querySelector('.ar-pterm')?.textContent).toBe(card.term);
    expect(api.actions.map((b) => b.textContent)).toEqual(['Pass (2 left)', 'Got it']);
    (api.actions[1] as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(api.moves[0]).toMatchObject({ item: card.item, move: 'describe', response: { result: 'got' } });
    // A teammate sees no card.
    const host2 = document.createElement('div');
    const v2 = live.phone(host2, fakeApi('o_CC'));
    v2.update(kindRoomView('articulate', phone(h, 'CC')));
    expect(textOf(host2)).toContain('Guess out loud');
    expect(host2.querySelector('.ar-pcard')).toBeNull();
    // Quick check.
    h.control('check');
    const api3 = fakeApi('o_DD', { onMove: (e) => h.move('DD', e) as never });
    const host3 = document.createElement('div');
    const v3 = live.phone(host3, api3);
    v3.update(kindRoomView('articulate', phone(h, 'DD')));
    const opts = host3.querySelectorAll<HTMLButtonElement>('.ar-opt');
    expect(opts.length).toBe(4);
    opts[0]!.click();
    opts[1]!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(api3.moves).toHaveLength(1);
    v3.update(kindRoomView('articulate', phone(h, 'DD')));
    expect(host3.querySelector('.ar-opt.is-right')).not.toBeNull();
    expect(api3.actions[0]?.textContent).toBe('Next question');
    v.dispose();
    v2.dispose();
    v3.dispose();
  });
});

describe('Articulate dev bot (Simulate class)', () => {
  it('describes its own card, buzzes as another captain, answers the quick check, and stays quiet otherwise', () => {
    const h = setup();
    expect(articulateBot(h.ctx, k(h), 'o_AA')).toBeNull();
    h.control('start_turn');
    const card = phone(h, 'AA').card!.item;
    // A beat before the describer acts; a teammate never acts.
    expect(articulateBot(h.ctx, k(h), 'o_AA')).toBeNull();
    h.advance(3000);
    const turn = articulateBot(h.ctx, k(h), 'o_AA');
    expect(turn).toMatchObject({ move: { item: card } });
    expect(h.move('AA', (turn as { move: never }).move)).toEqual({ item: card });
    expect(articulateBot(h.ctx, k(h), 'o_CC')).toBeNull();
    // Team 1's captain (BB) sometimes buzzes the card in play; nobody else on team 1 does.
    h.advance(2000);
    const buzzes = Array.from({ length: 200 }, () => articulateBot(h.ctx, k(h), 'o_BB')).filter(Boolean);
    expect(buzzes.length).toBeGreaterThan(0);
    expect(buzzes[0]).toEqual({ control: { name: 'buzz', data: { item: k(h).current } } });
    expect(Array.from({ length: 50 }, () => articulateBot(h.ctx, k(h), 'o_DD')).filter(Boolean)).toEqual([]);
    h.control('check');
    let n = 0;
    for (let move = articulateBot(h.ctx, k(h), 'o_DD'); move && n < 10; move = articulateBot(h.ctx, k(h), 'o_DD'), n++) {
      expect(h.move('DD', (move as { move: never }).move)).not.toHaveProperty('error');
    }
    expect(n).toBe(k(h).check!.questions.length);
    expect(Object.keys(k(h).check!.answers.o_DD!)).toHaveLength(n);
  });
});

describe('Articulate board team name (walk: "Kestrel / s" at 1024)', () => {
  it('shrinks the team name with its panel instead of breaking it mid-word', () => {
    const css = readFileSync(join(__dirname, '../../src/games/kinds/articulate/articulate.css'), 'utf8');
    const h2 = css.match(/\.ar-team h2 \{([^}]*)\}/)?.[1] ?? '';
    expect(h2).not.toContain('anywhere');
    expect(h2).toMatch(/font-size: min\(2\.1em, [\d.]+cqi\)/);
    expect(css).toMatch(/\.ar-team \{[^}]*container-type: inline-size/);
  });
});
