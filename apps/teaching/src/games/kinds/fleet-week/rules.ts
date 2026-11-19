/**
 * Fleet week, pure rules (spec docs/superpowers/specs/2026-11-19-fleet-week-design.md §1,
 * plan docs/superpowers/plans/2026-11-19-fleet-week-1-engine.md).
 *
 * Grid helpers, ship placement, teams, scrambled call signs, question variants,
 * round resolution and standings. No DOM and no Node imports: this file is
 * bundled for the browser and, through core/server-entry.ts, for the Netlify
 * functions (_shared/game-rules.mjs). Every random choice comes from a seeded
 * source, so the same inputs always give the same output.
 */
import { seededRandom, shuffleWith } from '../../generators/random';

// ---------------------------------------------------------------------------
// Grid (§1.1; plan decision 1)
// ---------------------------------------------------------------------------

/** Squares per side. Squares are indexed 0..24, `index = row * 5 + col`. */
export const GRID = 5;
export const SQUARES = GRID * GRID;
const ROW_LETTERS = 'ABCDE';

/** Ship sizes by id: s0 is the three, s1 and s2 the twos, s3 the one (§1.2; decision 2). */
export const SHIP_SIZES = [3, 2, 2, 1] as const;
export const SHIP_IDS = ['s0', 's1', 's2', 's3'] as const;
export type ShipId = (typeof SHIP_IDS)[number];
/** A placed ship. Its squares are in a straight line. */
export type Ship = { id: ShipId; squares: number[] };
export type Team = { id: string; owners: string[]; ghost?: boolean };
export type Match = { id: string; teams: [string, string] };
export type Pairing = { teams: Team[]; matches: Match[] };
export type Rng = () => number;
/** One question variant handed to one player for one square (§1.1). */
export type Given = { owner: string; square: number; variant: number };

/** FNV-1a, 32-bit, unsigned. A cheap stable string hash for seeds and tests (decision 10). */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Seeded random source: mulberry32 over fnv1a(seed) (decision 10). */
export function rng(seed: string): Rng {
  return seededRandom(fnv1a(seed));
}

/** Row of a square, 0..4 (decision 1). */
export function rowOf(i: number): number {
  return Math.floor(i / GRID);
}

/** Column of a square, 0..4 (decision 1). */
export function colOf(i: number): number {
  return i % GRID;
}

/** Screen label of a square, 'A1'..'E5': row letter, column number (decision 1). */
export function squareLabel(i: number): string {
  return `${ROW_LETTERS[rowOf(i)]}${colOf(i) + 1}`;
}

function onGrid(i: number): boolean {
  return Number.isInteger(i) && i >= 0 && i < SQUARES;
}

/** Orthogonal neighbours of a square that are on the chart ("touch", decision 3). */
function neighbours(i: number): number[] {
  const out: number[] = [];
  if (rowOf(i) > 0) out.push(i - GRID);
  if (rowOf(i) < GRID - 1) out.push(i + GRID);
  if (colOf(i) > 0) out.push(i - 1);
  if (colOf(i) < GRID - 1) out.push(i + 1);
  return out;
}

/** The squares of a ship from `start`, going right ('h') or down ('v'); null if it leaves the chart (§1.1). */
export function shipLine(start: number, size: number, dir: 'h' | 'v'): number[] | null {
  if (!onGrid(start) || size < 1) return null;
  if (dir === 'h' && colOf(start) + size > GRID) return null;
  if (dir === 'v' && rowOf(start) + size > GRID) return null;
  return Array.from({ length: size }, (_, k) => start + k * (dir === 'h' ? 1 : GRID));
}

function sizeOf(id: ShipId): number {
  return SHIP_SIZES[SHIP_IDS.indexOf(id)];
}

// ---------------------------------------------------------------------------
// Placement (§1.2, §1.3 placement; decisions 2 and 3)
// ---------------------------------------------------------------------------

/**
 * The ships a team member places (decision 2). Team of two: first member s0 and
 * s3, second s1 and s2. Team of three: [s0], [s1, s3], [s2]. Anyone else (a
 * late joiner, a stranger) and the ghost place nothing.
 */
export function shipsFor(team: Team, owner: string): ShipId[] {
  const at = team.owners.indexOf(owner);
  if (at < 0) return [];
  const split: ShipId[][] = team.owners.length === 3 ? [['s0'], ['s1', 's3'], ['s2']] : [['s0', 's3'], ['s1', 's2']];
  return split[at] ? [...split[at]] : [];
}

/** True when the squares run in one straight, unbroken line (in any order). */
function isStraight(squares: number[]): boolean {
  if (squares.length <= 1) return true;
  const sorted = [...squares].sort((a, b) => a - b);
  const step = sorted[1] - sorted[0];
  if (step !== 1 && step !== GRID) return false;
  return sorted.every((s, k) => k === 0 || s - sorted[k - 1] === step);
}

/** True when every square is on the chart and a sideways line does not wrap onto the next row. */
function staysOnChart(squares: number[]): boolean {
  if (!squares.every(onGrid)) return false;
  const sorted = [...squares].sort((a, b) => a - b);
  const sideways = sorted.length > 1 && sorted[1] - sorted[0] === 1;
  return !sideways || sorted.every((s) => rowOf(s) === rowOf(sorted[0]));
}

/**
 * Why a player's layout cannot stand, or null when it can (§1.3 placement; decision 3).
 * `ships` is the player's own layout; `fleet` is the team chart so far (ships the
 * player owns are ignored there, so they can move their own ships). Checked in
 * order: every owned ship present at its size, straight lines, on the chart, no
 * overlap with anything, no orthogonal touch with a partner's ship. A player's
 * own two ships may touch each other.
 */
export function placementProblem(ships: Ship[], owner: string, team: Team, fleet: Ship[]): string | null {
  const mine = shipsFor(team, owner);
  const ids = ships.map((s) => s.id);
  const complete = mine.length > 0 && ids.length === mine.length && mine.every((id) => ids.includes(id))
    && ships.every((s) => s.squares.length === sizeOf(s.id));
  if (!complete) return 'Place each of your ships.';
  if (!ships.every((s) => isStraight(s.squares))) return 'Ships go in a straight line.';
  if (!ships.every((s) => staysOnChart(s.squares))) return 'That ship would leave the chart.';
  const partner = fleet.filter((s) => !mine.includes(s.id)).flatMap((s) => s.squares);
  const own = ships.flatMap((s) => s.squares);
  if (new Set(own).size !== own.length || own.some((s) => partner.includes(s))) return 'Ships can’t overlap.';
  if (own.some((s) => neighbours(s).some((n) => partner.includes(n)))) return 'Keep a square of sea between your ships and your partner’s.';
  return null;
}

/** Search budget for a layout that keeps the touch rule before it is dropped (decision 3). */
const TOUCH_TRIES = 200;

/**
 * Place `ids` at random on a chart that already holds `fleet`, keeping clear of
 * `partnerSquares` (§3.5 never places; decision 3). A randomised backtracking
 * search: it keeps the touch rule for up to 200 tries, then drops it. Overlap is
 * never allowed. Returns the ships in `ids` order.
 */
export function autoPlace(ids: ShipId[], fleet: Ship[], partnerSquares: number[], random: Rng): Ship[] {
  const taken = new Set(fleet.flatMap((s) => s.squares));
  const nearPartner = new Set(partnerSquares.flatMap((s) => [s, ...neighbours(s)]));
  const options = ids.map((id) => {
    const lines: number[][] = [];
    for (let start = 0; start < SQUARES; start++) {
      for (const dir of sizeOf(id) === 1 ? (['h'] as const) : (['h', 'v'] as const)) {
        const line = shipLine(start, sizeOf(id), dir);
        if (line && !line.some((s) => taken.has(s))) lines.push(line);
      }
    }
    return shuffleWith(lines, random);
  });

  const search = (keepTouch: boolean, budget: number): number[][] | null => {
    let tries = 0;
    const chosen: number[][] = [];
    const used = new Set<number>();
    const step = (k: number): boolean => {
      if (k === ids.length) return true;
      for (const line of options[k]) {
        if (++tries > budget) return false;
        if (line.some((s) => used.has(s) || (keepTouch && nearPartner.has(s)))) continue;
        chosen.push(line);
        line.forEach((s) => used.add(s));
        if (step(k + 1)) return true;
        chosen.pop();
        line.forEach((s) => used.delete(s));
      }
      return false;
    };
    return step(0) ? chosen : null;
  };

  const lines = search(true, TOUCH_TRIES) ?? search(false, Number.POSITIVE_INFINITY) ?? [];
  return lines.map((squares, k) => ({ id: ids[k], squares }));
}

// ---------------------------------------------------------------------------
// Teams and matches (§1.2)
// ---------------------------------------------------------------------------

/** The ghost fleet: no players, it only receives fire (§1.2). */
export const GHOST_ID = 'ghost';

/**
 * Pair a class into teams and matches (§1.2). Shuffle, cut into twos; an odd
 * last owner joins the previous team as a third. Teams t1…tn are matched in
 * order (m1 = t1 v t2, …); an odd team out plays the ghost fleet.
 * "Mixed by accuracy" balancing is deferred to plan 4.
 */
export function pairTeams(owners: string[], random: Rng): Pairing {
  const shuffled = shuffleWith(owners, random);
  const groups: string[][] = [];
  for (let i = 0; i < shuffled.length; i += 2) groups.push(shuffled.slice(i, i + 2));
  const last = groups[groups.length - 1];
  if (groups.length > 1 && last.length === 1) groups[groups.length - 2].push(...(groups.pop() as string[]));
  const teams: Team[] = groups.map((g, k) => ({ id: `t${k + 1}`, owners: g }));
  if (teams.length % 2 === 1) teams.push({ id: GHOST_ID, owners: [], ghost: true });
  const matches: Match[] = [];
  for (let k = 0; k + 1 < teams.length; k += 2) matches.push({ id: `m${k / 2 + 1}`, teams: [teams[k].id, teams[k + 1].id] });
  return { teams, matches };
}

/** The team an owner plays for (§1.2). */
export function teamOf(pairing: Pairing, owner: string): Team | undefined {
  return pairing.teams.find((t) => t.owners.includes(owner));
}

/** The match a team plays in (§1.2). */
export function matchOf(pairing: Pairing, team: string): Match | undefined {
  return pairing.matches.find((m) => m.teams.includes(team));
}

/** The team's opponent in its match, or '' if it has none (§1.2). */
export function rivalOf(pairing: Pairing, team: string): string {
  const m = matchOf(pairing, team);
  if (!m) return '';
  return m.teams[0] === team ? m.teams[1] : m.teams[0];
}

// ---------------------------------------------------------------------------
// Call signs (§1.8; decision 11)
// ---------------------------------------------------------------------------

export const RANKS = ['Captain', 'Commander', 'Admiral', 'Ensign', 'Bosun'] as const;
export const NAMES = [
  'Kestrel', 'Lark', 'Pike', 'Gannet', 'Petrel', 'Squall', 'Tern', 'Osprey', 'Heron', 'Curlew', 'Plover', 'Merlin',
  'Skua', 'Shearwater', 'Fulmar', 'Dunlin', 'Gale', 'Swift', 'Kittiwake', 'Puffin', 'Wren', 'Sleet', 'Corsair', 'Marlin'
] as const;
const SIGNS = RANKS.length * NAMES.length;

function signAt(k: number): string {
  return `${RANKS[Math.floor(k / NAMES.length)]} ${NAMES[k % NAMES.length]}`;
}

/**
 * Every subject's call sign as one viewer sees it (§1.8; decision 11). Each
 * subject starts at `hash(viewer + '|' + subject) % 120` and probes forward past
 * signs already used on this viewer's screen, in `joined` order, so a late
 * joiner never changes anyone's existing sign. The server injects an HMAC of
 * the match secret as `hash`.
 */
export function callSigns(viewer: string, joined: string[], hash: (s: string) => number): Record<string, string> {
  const used = new Set<number>();
  const out: Record<string, string> = {};
  for (const subject of joined) {
    if (subject in out) continue;
    let k = ((hash(`${viewer}|${subject}`) % SIGNS) + SIGNS) % SIGNS;
    let probes = 0;
    while (used.has(k) && probes < SIGNS) { k = (k + 1) % SIGNS; probes++; }
    used.add(k);
    // More than 120 subjects cannot all be unique; number the overflow.
    out[subject] = probes < SIGNS ? signAt(k) : `${signAt(k)} ${used.size}`;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Question variants (§1.1)
// ---------------------------------------------------------------------------

/**
 * Which of a square's `count` variants a player gets (§1.1). A returning square
 * gets a variant other than `returning.not`. Otherwise prefer a variant nobody
 * else in the match has been given for this square (lowest index first), else
 * the one given the fewest times.
 */
export function pickVariant(square: number, owner: string, matchOwners: string[], given: Given[], count: number, returning?: { not: number }): number {
  if (count <= 1) return 0;
  if (returning) return returning.not === 0 ? 1 : 0;
  const times = Array.from({ length: count }, () => 0);
  for (const g of given) {
    if (g.square === square && g.owner !== owner && matchOwners.includes(g.owner) && g.variant >= 0 && g.variant < count) times[g.variant]++;
  }
  let best = 0;
  for (let v = 1; v < count; v++) if (times[v] < times[best]) best = v;
  return best;
}
