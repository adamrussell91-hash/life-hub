import { describe, expect, it } from 'vitest';
import { GAME_KINDS, GameSchema } from '../../src/games/core/schema';
import { gameIssues, gameItems, gameWarnings, splitGame } from '../../src/games/core/model';
import {
  autoPlace, callSigns, fnv1a, pairTeams, pickVariant, placementProblem, rng, shipLine, shipsFor, squareLabel,
  type Given, type Ship, type ShipId, type Team
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
  it('gives a returning square the other variant', () => {
    expect(pickVariant(5, 'ann', match, [], 2, { not: 0 })).toBe(1);
    expect(pickVariant(5, 'ann', match, [], 2, { not: 1 })).toBe(0);
  });
  it('uses the only variant when there is one', () => expect(pickVariant(5, 'ann', match, [], 1, { not: 0 })).toBe(0));
});
