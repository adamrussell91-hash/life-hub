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

function onGrid(i: number): boolean {
  return Number.isInteger(i) && i >= 0 && i < SQUARES;
}

/** Screen label of a square, 'A1'..'E5': row letter, column number; '?' off the chart (decision 1). */
export function squareLabel(i: number): string {
  return onGrid(i) ? `${ROW_LETTERS[rowOf(i)]}${colOf(i) + 1}` : '?';
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
 * Place `ids` at random on a chart that already holds `fleet` (§3.5 "never
 * places ships"; decision 3). No square of a new ship may overlap `fleet` or
 * another new ship. The new ships should also not touch `partnerSquares`
 * orthogonally; they may touch each other. A backtracking search over the
 * shuffled candidate lines keeps that touch rule for up to 200 candidate tries;
 * if it finds nothing it searches again without it. Returns the ships in `ids`
 * order, or fewer ships only if no non-overlapping layout exists at all.
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
  let extra = 1;
  for (const subject of joined) {
    if (subject in out) continue;
    let k = ((hash(`${viewer}|${subject}`) % SIGNS) + SIGNS) % SIGNS;
    if (used.size >= SIGNS) {
      // All 120 are taken: number the extras with a running counter so each stays unique.
      out[subject] = `${signAt(k)} ${++extra}`;
      continue;
    }
    while (used.has(k)) k = (k + 1) % SIGNS;
    used.add(k);
    out[subject] = signAt(k);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Question variants (§1.1)
// ---------------------------------------------------------------------------

/**
 * Which of a square's `count` variants a player gets (§1.1). A returning square
 * gets a variant other than `returning.not`. Otherwise prefer a variant this
 * owner has not been given for this square, then one nobody else in the match
 * has been given (fewest times wins), then the lower index.
 */
export function pickVariant(square: number, owner: string, matchOwners: string[], given: Given[], count: number, returning?: { not: number }): number {
  if (count <= 1) return 0;
  if (returning) return returning.not === 0 ? 1 : 0;
  const mine = Array.from({ length: count }, () => 0);
  const others = Array.from({ length: count }, () => 0);
  for (const g of given) {
    if (g.square !== square || g.variant < 0 || g.variant >= count) continue;
    if (g.owner === owner) mine[g.variant]++;
    else if (matchOwners.includes(g.owner)) others[g.variant]++;
  }
  let best = 0;
  for (let v = 1; v < count; v++) {
    if (mine[v] < mine[best] || (mine[v] === mine[best] && others[v] < others[best])) best = v;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Round resolution (§1.3–§1.7, §3.2; decisions 5–7, 9 and 10)
// ---------------------------------------------------------------------------

/** One committed shot. `correct` is decided at answer time (decision 9); null means no answer in time. */
export type Shot = {
  /** Commit time in ms (server clock); ties broken by owner. Not unique across owners. */
  seq: number; owner: string; square: number; sure: boolean; variant: number; item: string;
  correct: boolean | null;
  returning: boolean; voided?: boolean;
};
/** A hit waiting on (or settled by) its damage report (§1.6; decision 6). */
export type Hit = {
  id: string; owner: string; team: string; target: string; square: number; round: number;
  full: number; due: number; rejected: number; status: 'owed' | 'full' | 'half';
};
/** A sunk ship. `by` is the player who landed the last hit and owes the recall line; `team` is theirs (§1.5). */
export type SinkRecord = { target: string; ship: ShipId; by: string; team: string; round: number; recall: 'pending' | 'right' | 'wrong' | 'none'; bonus: number };
/** A sonar ping: `about` team's chart has a ship square on `line` ('row:B' or 'col:3'), told to team `to` (§1.4). */
export type Ping = { to: string; about: string; line: string; round: number };
/** A dud square coming back to its player with the other variant (§1.4). */
export type Return = { owner: string; square: number; variant: number; due: number };
export type Outcome = 'hit' | 'miss' | 'dud' | 'dup' | 'void' | 'practice';
/** A resolved shot. `damage` is the hit's full value before its report settles; 0 for anything else. */
export type ShotResult = Shot & { outcome: Outcome; target: string; ship?: ShipId; damage: number };

/** Cumulative campaign state after a round (§3.1). */
export type FleetState = {
  /** Last resolved round (0 = placement). */
  round: number;
  /** Team id → ships, frozen after round 0. */
  fleets: Record<string, Ship[]>;
  /** Target team id → squares known to its rival. */
  charts: Record<string, Record<number, 'hit' | 'miss'>>;
  /** Damage dealt BY each team. */
  damage: Record<string, number>;
  /** Owner → first-try answers (fresh shots only). */
  first_try: Record<string, { right: number; total: number }>;
  hits: Hit[]; sinks: SinkRecord[]; pings: Ping[]; returns: Return[];
  given: Given[];
  /** Match id → over (a fleet was sunk outright). */
  ended: Record<string, boolean>;
  log: Array<{ round: number; results: ShotResult[] }>;
};
export type RoundInput = {
  pairing: Pairing; round: number; seed: string;
  /** Owner → ships (round 0 only; missing or invalid → autoPlace). */
  placements: Record<string, Ship[]>;
  /** Every owner's shots for this round. */
  shots: Shot[];
  /** Hit id → round filed. The server deletes the entry when the teacher rejects a report. */
  filed: Record<string, number>;
  /** Hit id → times rejected. */
  rejected: Record<string, number>;
  /** `${target}:${ship}` → recall line answered right. */
  recalls: Record<string, boolean>;
};

/** Damage table (§1.7; decision 5). */
export const DAMAGE = { hit: 2, sure: 4, returning: 1, sink_bonus: 2 } as const;

/** Half damage for a hit whose report did not land in time: never below 1 (decision 5). */
export function halfDamage(full: number): number {
  return Math.max(1, Math.floor(full / 2));
}

/** The state before placement: every team and match known, nothing on the charts (§3.1). */
export function emptyState(pairing: Pairing): FleetState {
  const perTeam = <T>(make: () => T) => Object.fromEntries(pairing.teams.map((t) => [t.id, make()]));
  return {
    round: -1,
    fleets: perTeam(() => [] as Ship[]),
    charts: perTeam(() => ({}) as Record<number, 'hit' | 'miss'>),
    damage: perTeam(() => 0),
    first_try: {},
    hits: [], sinks: [], pings: [], returns: [], given: [],
    ended: Object.fromEntries(pairing.matches.map((m) => [m.id, false])),
    log: []
  };
}

/** A deep copy; state and input are plain JSON, so this keeps resolveRound from touching its arguments. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Round 0 (§1.3 placement; decision 2). First accept every owner's submitted
 * layout that stands against the layouts already accepted (in team order), so a
 * missing teammate can never cost anyone their layout. Then auto-place the
 * owners with no valid layout, then any ships nobody owns (a team of one, the ghost).
 */
function buildFleet(team: Team, placements: Record<string, Ship[]>, seed: string): Ship[] {
  const fleet: Ship[] = [];
  const squaresOf = (ships: Ship[]) => ships.flatMap((s) => s.squares);
  const unplaced: string[] = [];
  for (const owner of team.owners) {
    const ids = shipsFor(team, owner);
    if (!ids.length) continue;
    const own = placements[owner];
    if (own && placementProblem(own, owner, team, fleet) === null) {
      fleet.push(...ids.map((id) => ({ id, squares: [...(own.find((s) => s.id === id) as Ship).squares].sort((a, b) => a - b) })));
    } else {
      unplaced.push(owner);
    }
  }
  for (const owner of unplaced) fleet.push(...autoPlace(shipsFor(team, owner), fleet, squaresOf(fleet), rng(seed + owner)));
  const missing = SHIP_IDS.filter((id) => !fleet.some((s) => s.id === id));
  if (missing.length) fleet.push(...autoPlace([...missing], fleet, squaresOf(fleet), rng(seed + team.id)));
  return SHIP_IDS.map((id) => fleet.find((s) => s.id === id) as Ship);
}

/** Settle one owed hit: filed and not since rejected → full, else half (decision 6). */
function settleHit(state: FleetState, hit: Hit, filed: Record<string, number>): void {
  hit.status = filed[hit.id] != null ? 'full' : 'half';
  state.damage[hit.team] = (state.damage[hit.team] ?? 0) + (hit.status === 'full' ? hit.full : halfDamage(hit.full));
}

/** Settle owed hits whose deadline has passed by `round`, or all of them when `round` is omitted (the reveal). */
function settleHits(state: FleetState, input: Pick<RoundInput, 'filed' | 'rejected'>, round?: number): void {
  for (const hit of state.hits) {
    if (hit.status !== 'owed') continue;
    hit.rejected = input.rejected[hit.id] ?? 0;
    hit.due = hit.round + 1 + Math.min(hit.rejected, 1);
    if (round === undefined || round >= hit.due) settleHit(state, hit, input.filed);
  }
}

/** Settle recall lines owed for ships sunk before `round`, or all of them when `round` is omitted (the reveal) (§1.5). */
function settleRecalls(state: FleetState, recalls: Record<string, boolean>, round?: number): void {
  for (const sink of state.sinks) {
    if (sink.recall !== 'pending' || (round !== undefined && sink.round >= round)) continue;
    const answer = recalls[`${sink.target}:${sink.ship}`];
    sink.recall = answer === true ? 'right' : answer === false ? 'wrong' : 'none';
    if (answer === true) {
      sink.bonus = DAMAGE.sink_bonus;
      state.damage[sink.team] = (state.damage[sink.team] ?? 0) + sink.bonus;
    }
  }
}

/** Lines ('row:A'…, 'col:1'…) of a team's chart that still hold an unhit ship square (§1.4 sonar ping). */
function linesWithOpenShipSquares(state: FleetState, team: string): string[] {
  const chart = state.charts[team] ?? {};
  const open = (state.fleets[team] ?? []).flatMap((s) => s.squares).filter((sq) => chart[sq] !== 'hit');
  const rows = [...new Set(open.map(rowOf))].sort((a, b) => a - b).map((r) => `row:${ROW_LETTERS[r]}`);
  const cols = [...new Set(open.map(colOf))].sort((a, b) => a - b).map((c) => `col:${c + 1}`);
  return [...rows, ...cols];
}

function countFirstTry(state: FleetState, shot: Shot, outcome: Outcome): void {
  if (shot.returning || !['hit', 'miss', 'dud'].includes(outcome)) return;
  const tally = (state.first_try[shot.owner] ??= { right: 0, total: 0 });
  tally.total++;
  if (shot.correct === true) tally.right++;
}

/**
 * Resolve one closed round into the next cumulative state (§3.2; plan Task 3).
 * Pure: `prev` and `input` are never mutated, and the same inputs give the same
 * output. Round 0 builds the fleets. A firing round settles hits whose report
 * deadline has passed, settles recall lines from earlier sinks, then resolves
 * the round's shots in `seq` order (§1.4–§1.7).
 */
export function resolveRound(prev: FleetState, input: RoundInput): FleetState {
  const state = clone(prev);
  const { pairing, round, seed } = input;
  if (round !== prev.round + 1) throw new Error(`Fleet week: round ${round} out of order`);
  for (const t of pairing.teams) {
    state.charts[t.id] ??= {};
    state.damage[t.id] ??= 0;
  }
  for (const m of pairing.matches) state.ended[m.id] ??= false;

  if (round === 0) {
    for (const t of pairing.teams) state.fleets[t.id] = buildFleet(t, input.placements ?? {}, seed);
    state.round = 0;
    return state;
  }

  settleHits(state, input, round);
  settleRecalls(state, input.recalls, round);

  const shots = clone(input.shots).sort((a, b) => a.seq - b.seq || (a.owner < b.owner ? -1 : a.owner > b.owner ? 1 : 0));
  const results: ShotResult[] = [];
  for (const shot of shots) {
    const team = teamOf(pairing, shot.owner);
    const match = team && matchOf(pairing, team.id);
    if (!team || !match || !onGrid(shot.square)) {
      // Not a shot this campaign can place: a stranger, a team with no match, or a square off the chart.
      results.push({ ...shot, outcome: 'void', target: team ? rivalOf(pairing, team.id) : '', damage: 0 });
      continue;
    }
    const target = rivalOf(pairing, team.id);
    const chart = (state.charts[target] ??= {});
    const result = (outcome: Outcome, extra: Partial<ShotResult> = {}): ShotResult => ({ ...shot, outcome, target, damage: 0, ...extra });
    state.given.push({ owner: shot.owner, square: shot.square, variant: shot.variant });
    if (shot.returning) {
      const at = state.returns.findIndex((r) => r.owner === shot.owner && r.square === shot.square);
      if (at >= 0) state.returns.splice(at, 1);
    }

    let res: ShotResult;
    const ship = (state.fleets[target] ?? []).find((s) => s.squares.includes(shot.square));
    if (shot.voided) {
      res = result('void');
    } else if (state.ended[match.id]) {
      res = result('practice');
    } else if (chart[shot.square]) {
      // Already hit or missed, before or earlier this round (the chart updates as shots resolve).
      // A dud, void or practice shot leaves the square open to a teammate (§1.4).
      res = result('dup');
    } else {
      if (shot.correct !== true) {
        res = result('dud');
        state.returns.push({ owner: shot.owner, square: shot.square, variant: shot.variant === 0 ? 1 : 0, due: round + 2 });
        const lines = shot.sure ? linesWithOpenShipSquares(state, team.id) : [];
        if (lines.length) {
          const pick = lines[Math.floor(rng(seed + shot.owner + shot.seq)() * lines.length)];
          state.pings.push({ to: target, about: team.id, line: pick, round });
        }
      } else if (!ship) {
        chart[shot.square] = 'miss';
        res = result('miss');
      } else {
        chart[shot.square] = 'hit';
        const full = (shot.sure ? DAMAGE.sure : DAMAGE.hit) + (shot.returning ? DAMAGE.returning : 0);
        const alone = !team.owners.some((o) => o !== shot.owner);
        const hit: Hit = {
          id: `h${round}-${shot.owner}-${shot.seq}`, owner: shot.owner, team: team.id, target, square: shot.square, round,
          full, due: round + 1, rejected: 0, status: 'owed'
        };
        if (alone) settleHit(state, hit, { [hit.id]: round });
        state.hits.push(hit);
        if (ship.squares.every((sq) => chart[sq] === 'hit')) {
          state.sinks.push({ target, ship: ship.id, by: shot.owner, team: team.id, round, recall: 'pending', bonus: 0 });
          const fleet = state.fleets[target] ?? [];
          if (fleet.every((s) => s.squares.every((sq) => chart[sq] === 'hit'))) state.ended[match.id] = true;
        }
        res = result('hit', { ship: ship.id, damage: full });
      }
    }
    countFirstTry(state, shot, res.outcome);
    results.push(res);
  }

  state.log.push({ round, results });
  state.round = round;
  return state;
}

/** At the reveal: settle every open hit as if due, and every pending recall line (§1.6, §1.7; decision 6). */
export function settleAll(state: FleetState, input: Pick<RoundInput, 'filed' | 'rejected' | 'recalls'>): FleetState {
  const next = clone(state);
  settleHits(next, input);
  settleRecalls(next, input.recalls);
  return next;
}

// ---------------------------------------------------------------------------
// Standings (§1.7)
// ---------------------------------------------------------------------------

export type TeamStanding = { team: string; damage: number; sunk: number; accuracy: number };
export type MatchStanding = { match: string; teams: TeamStanding[]; winner: string | null };

/**
 * Each match's table and winner (§1.7): most damage dealt, then ships sunk by the
 * team, then first-try accuracy (right / total, 0 with no shots). A full tie has
 * no winner, and the ghost never wins.
 */
export function standings(state: FleetState, pairing: Pairing): MatchStanding[] {
  const row = (id: string): TeamStanding => {
    const team = pairing.teams.find((t) => t.id === id);
    const tallies = (team?.owners ?? []).map((o) => state.first_try[o]).filter(Boolean);
    const right = tallies.reduce((n, t) => n + t.right, 0);
    const total = tallies.reduce((n, t) => n + t.total, 0);
    return { team: id, damage: state.damage[id] ?? 0, sunk: state.sinks.filter((s) => s.team === id).length, accuracy: total ? right / total : 0 };
  };
  const compare = (a: TeamStanding, b: TeamStanding) => b.damage - a.damage || b.sunk - a.sunk || b.accuracy - a.accuracy;
  return pairing.matches.map((m) => {
    const teams = m.teams.map(row).sort(compare);
    const [top, next] = teams;
    const ghost = pairing.teams.find((t) => t.id === top.team)?.ghost;
    const winner = !ghost && (!next || compare(top, next) !== 0) ? top.team : null;
    return { match: m.id, teams, winner };
  });
}
