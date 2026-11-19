import { describe, expect, it } from 'vitest';
import { GAME_KINDS, GameSchema } from '../../src/games/core/schema';
import { gameIssues, gameItems, gameWarnings, splitGame } from '../../src/games/core/model';
import {
  autoPlace, callSigns, emptyState, fnv1a, pairTeams, pickVariant, placementProblem, resolveRound, rng, settleAll, shipLine, shipsFor,
  squareLabel, standings,
  type FleetState, type Given, type Pairing, type RoundInput, type Ship, type ShipId, type Shot, type Team
} from '../../src/games/kinds/fleet-week/rules';

const sa = (id: string, prompt: string, accepted: string[]) => ({
  id, shape: 'question' as const,
  question: { id, kind: 'short_answer', prompt, marks: 1, accepted },
  pieces: [], outcomes: [], skills: [], tech: []
});
export function fleetGame(over: Record<string, unknown> = {}) {
  return GameSchema.parse({
    id: 'fw', title: 'Harbour week', kind: 'fleet_week',
    columns: ['Ada', 'Bram', 'Cora', 'Dov', 'Esme'],
    rows: ['Fear', 'Pride', 'Home', 'Loss', 'Hope'],
    squares: Array.from({ length: 25 }, (_, i) => ({ variants: [sa(`q${i}a`, `Question ${i} A?`, [`a${i}`]), sa(`q${i}b`, `Question ${i} B?`, [`b${i}`])] })),
    recall: [0, 1, 2, 3].map((i) => sa(`r${i}`, `Recall line ${i}?`, [`line ${i}`])),
    ...over
  });
}

describe('fleet_week schema', () => {
  it('is the fourteenth kind', () => expect(GAME_KINDS).toContain('fleet_week'));
  it('fills settings defaults', () => {
    const g = fleetGame();
    expect(g.kind === 'fleet_week' && g.settings).toEqual({ rounds: 5, round_cap_s: 240, placement_cap_s: 120, answer_s: 60, cutoff: '20:00' });
  });
  it('lists every variant and recall line as items', () => expect(gameItems(fleetGame())).toHaveLength(54));
  it('publishes cleanly when complete', () => expect(gameIssues({ game: { games: [fleetGame()] } })).toEqual([]));
  it('blocks empty squares and missing recall lines', () => {
    const g = fleetGame({ squares: [], recall: [] });
    const issues = gameIssues({ game: { games: [g] } }).join(' ');
    expect(issues).toMatch(/25 squares/);
    expect(issues).toMatch(/recall line/);
  });
  it('warns about a square with one variant', () => {
    const g = fleetGame();
    if (g.kind === 'fleet_week') g.squares[3].variants = [g.squares[3].variants[0]];
    expect(gameWarnings({ game: { games: [g] } }).join(' ')).toMatch(/one question/);
  });
  it('split keeps every question off the public copy', () => {
    const { public: pub, keys } = splitGame(fleetGame(), () => 0.5);
    const text = JSON.stringify(pub);
    expect(text).not.toMatch(/Question 0 A|a0|line 0/);
    expect(pub).toMatchObject({ kind: 'fleet_week', columns: ['Ada', 'Bram', 'Cora', 'Dov', 'Esme'] });
    expect(keys.live?.fleet?.squares[0]).toEqual(['q0a', 'q0b']);
    expect(keys.live?.fleet?.recall).toEqual(['r0', 'r1', 'r2', 'r3']);
    expect(keys.items.q0a).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Pure rules, part 1: grid, placement, teams, call signs, variants
// ---------------------------------------------------------------------------

const pairOfTwo: Team = { id: 't1', owners: ['ann', 'ben'] };
const ship = (id: ShipId, squares: number[]): Ship => ({ id, squares });
/** ann (first member) owns s0 (3) and s3 (1); ben owns s1 and s2. */
const annShips = () => [ship('s0', [0, 1, 2]), ship('s3', [4])];
const benShips = () => [ship('s1', [20, 21]), ship('s2', [13, 18])];

describe('fleet_week grid', () => {
  it('labels squares A1 to E5', () => {
    expect(squareLabel(0)).toBe('A1');
    expect(squareLabel(7)).toBe('B3');
    expect(squareLabel(24)).toBe('E5');
  });
  it('labels a square off the chart as ?', () => {
    expect([squareLabel(-1), squareLabel(25), squareLabel(2.5)]).toEqual(['?', '?', '?']);
  });
  it('builds a line inside the chart', () => {
    expect(shipLine(0, 3, 'h')).toEqual([0, 1, 2]);
    expect(shipLine(2, 3, 'v')).toEqual([2, 7, 12]);
  });
  it('gives null for a line that would leave the chart', () => {
    expect(shipLine(3, 3, 'h')).toBeNull();
    expect(shipLine(15, 3, 'v')).toBeNull();
    expect(shipLine(24, 2, 'h')).toBeNull();
    expect(shipLine(24, 1, 'h')).toEqual([24]);
  });
});

describe('fleet_week ship ownership', () => {
  it('splits a team of two: first takes the three and the one', () => {
    expect(shipsFor(pairOfTwo, 'ann')).toEqual(['s0', 's3']);
    expect(shipsFor(pairOfTwo, 'ben')).toEqual(['s1', 's2']);
  });
  it('splits a team of three one, two, one', () => {
    const trio: Team = { id: 't1', owners: ['ann', 'ben', 'eve'] };
    expect([shipsFor(trio, 'ann'), shipsFor(trio, 'ben'), shipsFor(trio, 'eve')]).toEqual([['s0'], ['s1', 's3'], ['s2']]);
  });
  it('gives a stranger and the ghost nothing', () => {
    expect(shipsFor(pairOfTwo, 'zed')).toEqual([]);
    expect(shipsFor({ id: 'ghost', owners: [], ghost: true }, 'ann')).toEqual([]);
  });
});

describe('fleet_week placementProblem', () => {
  it('accepts a valid layout', () => {
    expect(placementProblem(annShips(), 'ann', pairOfTwo, [])).toBeNull();
    expect(placementProblem(benShips(), 'ben', pairOfTwo, annShips())).toBeNull();
  });
  it('lets a player’s own two ships touch', () => {
    expect(placementProblem([ship('s0', [0, 1, 2]), ship('s3', [3])], 'ann', pairOfTwo, [])).toBeNull();
  });
  it('asks for every ship', () => {
    expect(placementProblem([ship('s0', [0, 1, 2])], 'ann', pairOfTwo, [])).toBe('Place each of your ships.');
    expect(placementProblem([ship('s0', [0, 1, 2]), ship('s1', [4, 9])], 'ann', pairOfTwo, [])).toBe('Place each of your ships.');
  });
  it('wants straight lines', () => {
    expect(placementProblem([ship('s0', [0, 1, 6]), ship('s3', [4])], 'ann', pairOfTwo, [])).toBe('Ships go in a straight line.');
  });
  it('keeps ships on the chart', () => {
    expect(placementProblem([ship('s0', [3, 4, 5]), ship('s3', [24])], 'ann', pairOfTwo, [])).toBe('That ship would leave the chart.');
    expect(placementProblem([ship('s0', [15, 20, 25]), ship('s3', [4])], 'ann', pairOfTwo, [])).toBe('That ship would leave the chart.');
  });
  it('refuses overlap', () => {
    expect(placementProblem([ship('s0', [0, 1, 2]), ship('s3', [2])], 'ann', pairOfTwo, [])).toBe('Ships can’t overlap.');
    expect(placementProblem([ship('s1', [0, 5]), ship('s2', [13, 18])], 'ben', pairOfTwo, annShips())).toBe('Ships can’t overlap.');
  });
  it('keeps a square of sea from the partner’s ships', () => {
    expect(placementProblem([ship('s1', [5, 10]), ship('s2', [13, 18])], 'ben', pairOfTwo, annShips()))
      .toBe('Keep a square of sea between your ships and your partner’s.');
  });
  it('ignores the player’s own earlier layout when they move ships', () => {
    expect(placementProblem([ship('s0', [10, 11, 12]), ship('s3', [24])], 'ann', pairOfTwo, [...annShips()])).toBeNull();
  });
});

describe('fleet_week autoPlace', () => {
  it('always finds a valid layout beside a partner’s ships', () => {
    for (let s = 0; s < 50; s++) {
      const placed = autoPlace(['s1', 's2'], annShips(), annShips().flatMap((x) => x.squares), rng(`seed-${s}`));
      expect(placed.map((x) => x.id)).toEqual(['s1', 's2']);
      expect(placementProblem(placed, 'ben', pairOfTwo, annShips())).toBeNull();
    }
  });
  it('places a whole fleet with no partner', () => {
    const placed = autoPlace(['s0', 's1', 's2', 's3'], [], [], rng('ghost'));
    expect(placed.flatMap((x) => x.squares)).toHaveLength(8);
    expect(new Set(placed.flatMap((x) => x.squares)).size).toBe(8);
  });
  it('is deterministic for a seed', () => {
    expect(autoPlace(['s0', 's3'], [], [], rng('a'))).toEqual(autoPlace(['s0', 's3'], [], [], rng('a')));
  });
});

describe('fleet_week pairTeams', () => {
  const owners = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
  const everyoneOnce = (n: number, teams: Team[]) =>
    expect(teams.flatMap((t) => t.owners).sort()).toEqual(owners(n).sort());
  it('pairs eight into four teams and two matches', () => {
    const p = pairTeams(owners(8), rng('class'));
    expect(p.teams.map((t) => t.owners.length)).toEqual([2, 2, 2, 2]);
    expect(p.teams.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4']);
    expect(p.matches).toEqual([{ id: 'm1', teams: ['t1', 't2'] }, { id: 'm2', teams: ['t3', 't4'] }]);
    everyoneOnce(8, p.teams);
  });
  it('makes a team of three from an odd class', () => {
    const p = pairTeams(owners(9), rng('class'));
    expect(p.teams.map((t) => t.owners.length)).toEqual([2, 2, 2, 3]);
    expect(p.matches).toHaveLength(2);
    everyoneOnce(9, p.teams);
  });
  it('adds a ghost fleet for an odd number of teams', () => {
    const p = pairTeams(owners(6), rng('class'));
    expect(p.teams).toHaveLength(4);
    expect(p.teams[3]).toEqual({ id: 'ghost', owners: [], ghost: true });
    expect(p.matches).toEqual([{ id: 'm1', teams: ['t1', 't2'] }, { id: 'm2', teams: ['t3', 'ghost'] }]);
    everyoneOnce(6, p.teams);
  });
  it('shuffles by seed', () => {
    expect(pairTeams(owners(8), rng('a'))).toEqual(pairTeams(owners(8), rng('a')));
    expect(pairTeams(owners(8), rng('a'))).not.toEqual(pairTeams(owners(8), rng('b')));
  });
});

describe('fleet_week callSigns', () => {
  const joined = ['ann', 'ben', 'cat', 'dan'];
  it('is stable for the same inputs', () => {
    expect(callSigns('ann', joined, fnv1a)).toEqual(callSigns('ann', joined, fnv1a));
  });
  it('names everyone with a rank and a name', () => {
    const signs = callSigns('ann', joined, fnv1a);
    expect(Object.keys(signs)).toEqual(joined);
    for (const s of Object.values(signs)) expect(s).toMatch(/^(Captain|Commander|Admiral|Ensign|Bosun) [A-Z][a-z]+$/);
  });
  it('is unique within one viewer, even when every hash collides', () => {
    const many = Array.from({ length: 30 }, (_, i) => `s${i}`);
    expect(new Set(Object.values(callSigns('ann', many, fnv1a))).size).toBe(30);
    expect(new Set(Object.values(callSigns('ann', many, () => 7))).size).toBe(30);
  });
  it('numbers the extras once all 120 signs are used', () => {
    const crowd = Array.from({ length: 123 }, (_, i) => `s${i}`);
    const signs = callSigns('ann', crowd, () => 0);
    expect(new Set(Object.values(signs)).size).toBe(123);
    expect([signs.s120, signs.s121, signs.s122]).toEqual(['Captain Kestrel 2', 'Captain Kestrel 3', 'Captain Kestrel 4']);
    expect(new Set(Object.values(callSigns('ann', crowd, fnv1a))).size).toBe(123);
  });
  it('differs between viewers', () => {
    const a = callSigns('ann', joined, fnv1a);
    const b = callSigns('ben', joined, fnv1a);
    expect(joined.filter((s) => a[s] !== b[s]).length).toBeGreaterThanOrEqual(3);
  });
  it('leaves existing signs alone when someone joins late', () => {
    const before = callSigns('ann', joined, () => 0);
    const after = callSigns('ann', [...joined, 'eve'], () => 0);
    expect(after).toMatchObject(before);
    expect(callSigns('ann', [...joined, 'eve'], fnv1a)).toMatchObject(callSigns('ann', joined, fnv1a));
  });
});

describe('fleet_week pickVariant', () => {
  const match = ['ann', 'ben', 'cat', 'dan'];
  it('starts with the first variant', () => expect(pickVariant(5, 'ann', match, [], 2)).toBe(0));
  it('gives the partner the other variant', () => {
    const given: Given[] = [{ owner: 'ann', square: 5, variant: 0 }];
    expect(pickVariant(5, 'ben', match, given, 2)).toBe(1);
  });
  it('ignores other squares and other matches', () => {
    const given: Given[] = [{ owner: 'ann', square: 6, variant: 0 }, { owner: 'zed', square: 5, variant: 0 }];
    expect(pickVariant(5, 'ben', match, given, 2)).toBe(0);
  });
  it('picks the least given when both are taken', () => {
    const given: Given[] = [{ owner: 'ann', square: 5, variant: 0 }, { owner: 'ben', square: 5, variant: 1 }, { owner: 'cat', square: 5, variant: 0 }];
    expect(pickVariant(5, 'dan', match, given, 2)).toBe(1);
  });
  it('prefers a variant this player has not had for the square', () => {
    expect(pickVariant(5, 'ann', match, [{ owner: 'ann', square: 5, variant: 0 }], 2)).toBe(1);
    const given: Given[] = [{ owner: 'ann', square: 5, variant: 1 }, { owner: 'ben', square: 5, variant: 0 }];
    expect(pickVariant(5, 'ann', match, given, 2)).toBe(0);
  });
  it('gives a returning square the other variant', () => {
    expect(pickVariant(5, 'ann', match, [], 2, { not: 0 })).toBe(1);
    expect(pickVariant(5, 'ann', match, [], 2, { not: 1 })).toBe(0);
  });
  it('uses the only variant when there is one', () => expect(pickVariant(5, 'ann', match, [], 1, { not: 0 })).toBe(0));
});

// ---------------------------------------------------------------------------
// Pure rules, part 2: resolveRound, settlement, standings
// ---------------------------------------------------------------------------

/** t1 (ann, ben) v t2 (cat, dan). Both fleets: s0 A1–A3, s3 A5, s1 E1–E2, s2 C4–D4. */
const duel: Pairing = { teams: [{ id: 't1', owners: ['ann', 'ben'] }, { id: 't2', owners: ['cat', 'dan'] }], matches: [{ id: 'm1', teams: ['t1', 't2'] }] };
const duelPlacements = () => ({ ann: annShips(), ben: benShips(), cat: annShips(), dan: benShips() });

const input = (pairing: Pairing, round: number, over: Partial<RoundInput> = {}): RoundInput => ({
  pairing, round, seed: 'fw', placements: {}, shots: [], filed: {}, rejected: {}, recalls: {}, ...over
});
const placed = (pairing: Pairing = duel, placements: Record<string, Ship[]> = duelPlacements()) =>
  resolveRound(emptyState(pairing), input(pairing, 0, { placements }));
const shot = (seq: number, owner: string, square: number, over: Partial<Shot> = {}): Shot => ({
  seq, owner, square, sure: false, variant: 0, item: `q${square}a`, correct: true, returning: false, ...over
});
const play = (state: FleetState, round: number, shots: Shot[], over: Partial<RoundInput> = {}, pairing: Pairing = duel) =>
  resolveRound(state, input(pairing, round, { shots, ...over }));
const results = (state: FleetState) => state.log[state.log.length - 1].results;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value as object).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('fleet_week resolveRound: placement', () => {
  it('builds fleets from placements at round 0', () => {
    const s = placed();
    expect(s.round).toBe(0);
    expect(s.fleets.t1).toEqual([ship('s0', [0, 1, 2]), ship('s1', [20, 21]), ship('s2', [13, 18]), ship('s3', [4])]);
    expect(s.fleets.t2.flatMap((x) => x.squares).sort((a, b) => a - b)).toEqual([0, 1, 2, 4, 13, 18, 20, 21]);
  });
  it('auto-places a player who never placed, keeping clear of the partner', () => {
    const s = placed(duel, { ann: annShips(), cat: annShips(), dan: benShips() });
    const benPart = s.fleets.t1.filter((x) => x.id === 's1' || x.id === 's2');
    expect(benPart).toHaveLength(2);
    expect(placementProblem(benPart, 'ben', duel.teams[0], s.fleets.t1)).toBeNull();
  });
  it('keeps a valid layout when the teammate never placed', () => {
    const pair: Pairing = { teams: [{ id: 't1', owners: ['a', 'b'] }, { id: 't2', owners: ['c', 'd'] }], matches: [{ id: 'm1', teams: ['t1', 't2'] }] };
    const bShips = [ship('s1', [0, 1]), ship('s2', [2, 3])];
    for (let k = 0; k < 30; k++) {
      const s = resolveRound(emptyState(pair), input(pair, 0, { seed: `seed-${k}`, placements: { b: bShips } }));
      expect(s.fleets.t1.filter((x) => x.id === 's1' || x.id === 's2')).toEqual(bShips);
      expect(new Set(s.fleets.t1.flatMap((x) => x.squares)).size).toBe(8);
    }
  });
  it('auto-places the ghost fleet, and the ghost can be hit', () => {
    const p = pairTeams(['ann', 'ben'], rng('g'));
    expect(p.matches[0].teams).toEqual(['t1', 'ghost']);
    const s0 = placed(p, {});
    const ghostSquares = s0.fleets.ghost.flatMap((x) => x.squares);
    expect(new Set(ghostSquares).size).toBe(8);
    const s1 = play(s0, 1, [shot(1, 'ann', ghostSquares[0])], {}, p);
    expect(results(s1)[0]).toMatchObject({ outcome: 'hit', target: 'ghost' });
    expect(s1.charts.ghost[ghostSquares[0]]).toBe('hit');
  });
});

describe('fleet_week resolveRound: shots', () => {
  it('right on a ship is a hit; damage waits for settlement', () => {
    const s1 = play(placed(), 1, [shot(1, 'ann', 0)]);
    expect(results(s1)[0]).toMatchObject({ outcome: 'hit', target: 't2', ship: 's0', damage: 2 });
    expect(s1.charts.t2[0]).toBe('hit');
    expect(s1.damage.t1).toBe(0);
    expect(s1.hits[0]).toMatchObject({ owner: 'ann', team: 't1', target: 't2', square: 0, round: 1, full: 2, due: 2, status: 'owed' });
    const s2 = play(s1, 2, [], { filed: { [s1.hits[0].id]: 1 } });
    expect(s2.hits[0].status).toBe('full');
    expect(s2.damage.t1).toBe(2);
  });
  it('right off a ship is a miss', () => {
    const s1 = play(placed(), 1, [shot(1, 'ann', 6)]);
    expect(results(s1)[0]).toMatchObject({ outcome: 'miss', damage: 0 });
    expect(s1.charts.t2[6]).toBe('miss');
    expect(s1.hits).toEqual([]);
  });
  it('wrong is a dud that returns two rounds later with the other variant', () => {
    const s1 = play(placed(), 1, [shot(1, 'ann', 0, { correct: false })]);
    expect(results(s1)[0].outcome).toBe('dud');
    expect(s1.charts.t2[0]).toBeUndefined();
    expect(s1.returns).toEqual([{ owner: 'ann', square: 0, variant: 1, due: 3 }]);
  });
  it('no answer in time is a dud', () => {
    const s1 = play(placed(), 1, [shot(1, 'ann', 0, { correct: null, variant: 1 })]);
    expect(results(s1)[0].outcome).toBe('dud');
    expect(s1.returns).toEqual([{ owner: 'ann', square: 0, variant: 0, due: 3 }]);
  });
  it('sure and right on a ship is worth 4', () => {
    const s1 = play(placed(), 1, [shot(1, 'ann', 0, { sure: true })]);
    expect(s1.hits[0].full).toBe(4);
    expect(play(s1, 2, [], { filed: { [s1.hits[0].id]: 1 } }).damage.t1).toBe(4);
  });
  it('sure and wrong pings a line of the firing team’s chart that holds an unhit ship square', () => {
    // cat sinks t1's one-square ship at A5, so column 5 holds no unhit ship square.
    const s1 = play(placed(), 1, [shot(1, 'cat', 4)]);
    const allowed = ['row:A', 'row:C', 'row:D', 'row:E', 'col:1', 'col:2', 'col:3', 'col:4'];
    const lines = new Set<string>();
    for (let k = 0; k < 20; k++) {
      const s2 = play(s1, 2, [shot(k, 'ann', 7, { sure: true, correct: false })], {}, duel);
      expect(s2.pings).toHaveLength(1);
      expect(s2.pings[0]).toMatchObject({ to: 't2', about: 't1', round: 2 });
      expect(allowed).toContain(s2.pings[0].line);
      lines.add(s2.pings[0].line);
    }
    expect(lines.size).toBeGreaterThan(1);
  });
  it('unsure and wrong sends no ping', () => {
    expect(play(placed(), 1, [shot(1, 'ann', 7, { correct: false })]).pings).toEqual([]);
  });
  it('a returning hit is worth one more, and the return is used up', () => {
    const s1 = play(placed(), 1, [shot(1, 'ann', 0, { correct: false })]);
    const s3 = play(play(s1, 2, []), 3, [shot(1, 'ann', 0, { returning: true, variant: 1 })]);
    expect(s3.hits[0].full).toBe(3);
    expect(s3.returns).toEqual([]);
    expect(play(s3, 4, []).damage.t1).toBe(1);
  });
  it('a teammate firing the same square later in the round is a dup', () => {
    const s1 = play(placed(), 1, [shot(2, 'ben', 0, { correct: false }), shot(1, 'ann', 0)]);
    expect(results(s1).map((r) => r.outcome)).toEqual(['hit', 'dup']);
    expect(s1.hits).toHaveLength(1);
    expect(s1.returns).toEqual([]);
    expect(results(play(s1, 2, [shot(1, 'ben', 0)]))[0]).toMatchObject({ outcome: 'dup', damage: 0 });
  });
  it('an earlier teammate dud, void or practice shot leaves the square open', () => {
    const s1 = play(placed(), 1, [shot(1, 'ann', 0, { correct: false }), shot(2, 'ben', 0), shot(3, 'ann', 6, { voided: true }), shot(4, 'ben', 6)]);
    expect(results(s1).map((r) => r.outcome)).toEqual(['dud', 'hit', 'void', 'miss']);
    expect(s1.hits).toHaveLength(1);
  });
  it('keeps hits apart when two owners commit at the same time', () => {
    const s1 = play(placed(), 1, [shot(1, 'cat', 0), shot(1, 'ann', 0)]);
    expect(results(s1).map((r) => r.owner)).toEqual(['ann', 'cat']);
    const ids = s1.hits.map((h) => h.id);
    expect(new Set(ids).size).toBe(2);
    const annHit = s1.hits.find((h) => h.owner === 'ann') as (typeof s1.hits)[number];
    const s2 = play(s1, 2, [], { filed: { [annHit.id]: 1 } });
    expect(Object.fromEntries(s2.hits.map((h) => [h.owner, h.status]))).toEqual({ ann: 'full', cat: 'half' });
  });
  it('a stranger, an unmatched team or a square off the chart is void', () => {
    const odd: Pairing = { ...duel, teams: [...duel.teams, { id: 't3', owners: ['eve'] }] };
    const s0 = placed(odd, { ...duelPlacements() });
    const s1 = play(s0, 1, [shot(1, 'zed', 0), shot(2, 'eve', 0), shot(3, 'ann', 25), shot(4, 'ann', -1)], {}, odd);
    expect(results(s1).map((r) => r.outcome)).toEqual(['void', 'void', 'void', 'void']);
    expect(s1.charts.t1).toEqual({});
    expect(s1.charts.t2).toEqual({});
    expect(s1.charts.t3).toEqual({});
    expect(s1.hits).toEqual([]);
  });
  it('refuses a round out of order', () => {
    const s1 = play(placed(), 1, []);
    expect(() => play(s1, 1, [])).toThrow('Fleet week: round 1 out of order');
    expect(() => play(s1, 3, [])).toThrow('Fleet week: round 3 out of order');
    expect(() => play(emptyState(duel), 1, [])).toThrow('Fleet week: round 1 out of order');
  });
  it('a voided shot records nothing and does not return', () => {
    const s1 = play(placed(), 1, [shot(1, 'ann', 0, { voided: true }), shot(2, 'ben', 6, { voided: true, correct: false })]);
    expect(results(s1).map((r) => r.outcome)).toEqual(['void', 'void']);
    expect(s1.charts.t2).toEqual({});
    expect(s1.hits).toEqual([]);
    expect(s1.returns).toEqual([]);
  });
  it('first-try accuracy counts fresh hits, misses and duds only', () => {
    const s1 = play(placed(), 1, [shot(1, 'ann', 0), shot(2, 'ann', 6), shot(3, 'ann', 7, { correct: false }), shot(4, 'ann', 8, { voided: true })]);
    expect(s1.first_try.ann).toEqual({ right: 2, total: 3 });
    const s3 = play(play(s1, 2, []), 3, [shot(1, 'ann', 7, { returning: true, variant: 1 })]);
    expect(s3.first_try.ann).toEqual({ right: 2, total: 3 });
  });
});

describe('fleet_week resolveRound: damage reports', () => {
  it('not filed by the deadline sticks at half: 2 → 1, 4 → 2', () => {
    const s1 = play(placed(), 1, [shot(1, 'ann', 0), shot(2, 'ben', 1, { sure: true })]);
    const s2 = play(s1, 2, []);
    expect(s2.hits.map((h) => h.status)).toEqual(['half', 'half']);
    expect(s2.damage.t1).toBe(3);
  });
  it('rejected once then refiled counts in full, settled one round later', () => {
    const s1 = play(placed(), 1, [shot(1, 'ann', 0)]);
    const id = s1.hits[0].id;
    const s2 = play(s1, 2, [], { rejected: { [id]: 1 } });
    expect(s2.hits[0]).toMatchObject({ status: 'owed', due: 3, rejected: 1 });
    expect(s2.damage.t1).toBe(0);
    const s3 = play(s2, 3, [], { filed: { [id]: 3 }, rejected: { [id]: 1 } });
    expect(s3.hits[0].status).toBe('full');
    expect(s3.damage.t1).toBe(2);
  });
  it('a player with no teammate gets full damage at once', () => {
    const solo: Pairing = { teams: [{ id: 't1', owners: ['ann'] }, { id: 't2', owners: ['cat', 'dan'] }], matches: [{ id: 'm1', teams: ['t1', 't2'] }] };
    const s0 = placed(solo, { ann: annShips(), cat: annShips(), dan: benShips() });
    expect(s0.fleets.t1.map((x) => x.id).sort()).toEqual(['s0', 's1', 's2', 's3']);
    const s1 = play(s0, 1, [shot(1, 'ann', 0)], {}, solo);
    expect(s1.hits[0].status).toBe('full');
    expect(s1.damage.t1).toBe(2);
  });
  it('a team of three all fire, and any teammate can file the report', () => {
    const trio: Pairing = { teams: [{ id: 't1', owners: ['ann', 'ben', 'eve'] }, { id: 't2', owners: ['cat', 'dan'] }], matches: [{ id: 'm1', teams: ['t1', 't2'] }] };
    const s0 = placed(trio, { ann: [ship('s0', [0, 1, 2])], ben: [ship('s1', [20, 21]), ship('s3', [4])], eve: [ship('s2', [13, 18])], cat: annShips(), dan: benShips() });
    expect(s0.fleets.t1).toHaveLength(4);
    const s1 = play(s0, 1, [shot(1, 'ann', 0), shot(2, 'ben', 6), shot(3, 'eve', 13)], {}, trio);
    expect(results(s1).map((r) => r.outcome)).toEqual(['hit', 'miss', 'hit']);
    expect(s1.hits.map((h) => h.status)).toEqual(['owed', 'owed']);
    const eveHit = s1.hits[1].id;
    const s2 = play(s1, 2, [], { filed: { [eveHit]: 1 } }, trio);
    expect(s2.hits.map((h) => h.status)).toEqual(['half', 'full']);
    expect(s2.damage.t1).toBe(3);
  });
});

describe('fleet_week resolveRound: sinking and ending', () => {
  it('a right recall line adds 2 at the next resolve', () => {
    const s1 = play(placed(), 1, [shot(1, 'ann', 4)]);
    expect(s1.sinks).toEqual([{ target: 't2', ship: 's3', by: 'ann', team: 't1', round: 1, recall: 'pending', bonus: 0 }]);
    const s2 = play(s1, 2, [], { filed: { [s1.hits[0].id]: 1 }, recalls: { 't2:s3': true } });
    expect(s2.sinks[0]).toMatchObject({ recall: 'right', bonus: 2 });
    expect(s2.damage.t1).toBe(4);
  });
  it('a wrong recall line still sinks the ship, with no bonus', () => {
    const s1 = play(placed(), 1, [shot(1, 'ann', 4)]);
    const s2 = play(s1, 2, [], { recalls: { 't2:s3': false } });
    expect(s2.sinks).toHaveLength(1);
    expect(s2.sinks[0]).toMatchObject({ recall: 'wrong', bonus: 0 });
    expect(s2.damage.t1).toBe(1);
  });
  it('sinking the whole fleet ends the match; later shots are practice', () => {
    const squares = [0, 1, 2, 4, 13, 18, 20, 21];
    const s1 = play(placed(), 1, squares.map((sq, k) => shot(k + 1, k < 4 ? 'ann' : 'ben', sq)));
    expect(s1.sinks).toHaveLength(4);
    expect(s1.ended.m1).toBe(true);
    const s2 = play(s1, 2, [shot(1, 'ann', 6), shot(2, 'cat', 0)]);
    expect(results(s2).map((r) => r.outcome)).toEqual(['practice', 'practice']);
    expect(s2.charts.t2[6]).toBeUndefined();
    expect(s2.charts.t1).toEqual({});
    expect(s2.first_try).toEqual(s1.first_try);
  });
});

describe('fleet_week settleAll', () => {
  it('settles every open hit and every pending recall at the reveal', () => {
    const s1 = play(placed(), 1, [shot(1, 'ann', 4), shot(2, 'ben', 0, { sure: true })]);
    const done = settleAll(s1, { filed: { [s1.hits[1].id]: 1 }, rejected: {}, recalls: {} });
    expect(done.hits.map((h) => h.status)).toEqual(['half', 'full']);
    expect(done.sinks[0]).toMatchObject({ recall: 'none', bonus: 0 });
    expect(done.damage.t1).toBe(5);
    expect(s1.hits[0].status).toBe('owed');
  });
});

describe('fleet_week standings', () => {
  const owners2 = (t: string) => [`${t}a`, `${t}b`];
  const eight: Pairing = {
    teams: ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'].map((id) => ({ id, owners: owners2(id) })),
    matches: [{ id: 'm1', teams: ['t1', 't2'] }, { id: 'm2', teams: ['t3', 't4'] }, { id: 'm3', teams: ['t5', 't6'] }, { id: 'm4', teams: ['t7', 't8'] }]
  };
  it('ranks by damage, then ships sunk, then first-try accuracy', () => {
    const s = emptyState(eight);
    Object.assign(s.damage, { t1: 4, t2: 6, t3: 4, t4: 4, t5: 2, t6: 2 });
    s.sinks.push({ target: 't4', ship: 's3', by: 't3a', team: 't3', round: 1, recall: 'wrong', bonus: 0 });
    Object.assign(s.first_try, { t5a: { right: 1, total: 2 }, t6a: { right: 2, total: 2 }, t6b: { right: 1, total: 2 } });
    const table = standings(s, eight);
    expect(table.map((m) => m.winner)).toEqual(['t2', 't3', 't6', null]);
    expect(table[0].teams.map((t) => t.team)).toEqual(['t2', 't1']);
    expect(table[1].teams[0]).toEqual({ team: 't3', damage: 4, sunk: 1, accuracy: 0 });
    expect(table[2].teams[0]).toMatchObject({ team: 't6', accuracy: 0.75 });
  });
  it('never crowns the ghost', () => {
    const p = pairTeams(['ann', 'ben'], rng('g'));
    expect(standings(emptyState(p), p)[0].winner).toBeNull();
  });
});

describe('fleet_week resolveRound: purity', () => {
  it('is deterministic and never mutates its input', () => {
    const s0 = placed(duel, { ann: annShips(), cat: annShips() });
    const s1 = play(s0, 1, [shot(1, 'ann', 0), shot(2, 'ben', 7, { sure: true, correct: false }), shot(3, 'cat', 4)]);
    const in2 = input(duel, 2, { shots: [shot(1, 'ann', 1, { sure: true }), shot(2, 'dan', 9, { correct: false })], filed: { [s1.hits[0].id]: 1 }, recalls: {} });
    const frozenPrev = deepFreeze(structuredClone(s1));
    const frozenInput = deepFreeze(structuredClone(in2));
    const a = resolveRound(frozenPrev, frozenInput);
    const b = resolveRound(structuredClone(s1), structuredClone(in2));
    expect(a).toEqual(b);
    expect(frozenPrev).toEqual(s1);
    expect(placed(duel, { ann: annShips() })).toEqual(placed(duel, { ann: annShips() }));
    expect(() => resolveRound(deepFreeze(emptyState(duel)), deepFreeze(input(duel, 0, { placements: duelPlacements() })))).not.toThrow();
  });
});

describe('fleet_week plans 2–4 helpers', () => {
  it('pairTeamsMixed pairs the strongest with the weakest, seeded', async () => {
    const { pairTeamsMixed, rng } = await import('../../src/games/kinds/fleet-week/rules');
    const acc = { a: 0.9, b: 0.8, c: 0.7, d: 0.4, e: 0.3, f: 0.1 };
    const p = pairTeamsMixed(Object.keys(acc), acc, rng('mix'));
    const teams = p.teams.filter((t) => !t.ghost).map((t) => [...t.owners].sort().join(''));
    expect(teams.sort()).toEqual(['af', 'be', 'cd']);
    expect(p.teams.some((t) => t.ghost)).toBe(true);
    expect(pairTeamsMixed(Object.keys(acc), acc, rng('mix'))).toEqual(p);
    // Odd class: the middle player joins a pair; unknown accuracy counts as the mean.
    const odd = pairTeamsMixed(['a', 'b', 'c', 'd', 'e'], { a: 1, b: 0.75, d: 0.25, e: 0 }, rng('odd'));
    expect(odd.teams.filter((t) => !t.ghost).map((t) => t.owners.length).sort()).toEqual([2, 3]);
    expect(odd.teams.flatMap((t) => t.owners).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('squareStats, hardestSquares and calibration read the round log', async () => {
    const { squareStats, hardestSquares, calibration } = await import('../../src/games/kinds/fleet-week/rules');
    const r = (owner: string, square: number, correct: boolean | null, extra: Record<string, unknown> = {}) => ({
      seq: 1, owner, square, sure: false, variant: 0, item: 'x', correct, returning: false, outcome: correct ? 'miss' : 'dud', target: 't2', damage: 0, ...extra
    });
    const log = [
      { round: 1, results: [r('a', 0, false, { sure: true }), r('b', 0, true), r('a', 5, null), r('b', 5, true, { outcome: 'void', voided: true })] },
      { round: 3, results: [r('a', 0, true, { returning: true })] }
    ] as never;
    const stats = squareStats({ log });
    expect(stats).toHaveLength(25);
    expect(stats[0]).toEqual({ square: 0, answered: 3, right: 2, first: { answered: 2, right: 1 }, returning: { answered: 1, right: 1 } });
    expect(stats[5]).toMatchObject({ answered: 1, right: 0 });
    expect(hardestSquares(stats).map((h) => h.square)).toEqual([5, 0]);
    expect(calibration({ log })).toEqual({
      a: { sure: { answered: 1, right: 0 }, unsure: { answered: 2, right: 1 } },
      b: { sure: { answered: 0, right: 0 }, unsure: { answered: 1, right: 1 } }
    });
  });
});
