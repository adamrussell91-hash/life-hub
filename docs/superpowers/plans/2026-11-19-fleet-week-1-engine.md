# Fleet week, plan 1: engine (schema, pure rules, lesson-mode server)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `fleet_week` game kind's content schema, its deterministic rules (teams, placement, call signs, round resolution, scoring) and the lesson-mode campaign server, so a whole game can be played through the API and tested in minutes.

**Architecture:** Content is a 5 × 5 grid of question pairs plus four recall lines, published like every game kind (`splitGame` keeps questions and keys server-side; the public copy carries only labels). A pure `resolveRound(prev, input) → next` in `apps/teaching/src/games/kinds/fleet-week/rules.ts` turns one round's committed shots into the next cumulative state. It is bundled to `_shared/game-rules.mjs` and called lazily by `_shared/fleet-week.mjs` the first time a request arrives after a round closes, writing the result create-only so racing requests produce one round.

**Tech stack:** TypeScript + zod (app), Vitest (pure tests), Node ESM Netlify functions + Netlify Blobs, `node:test` with the in-memory `memoryStore` (server tests), esbuild via `scripts/generate-alchemy-schema.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-19-fleet-week-design.md`. This plan covers build-order steps 2 and 3 (§1, §3.1–3.3, §3.5 and the pure and server rows of §8). Later plans: 2 (repo mockup, then phone: place, fire, report, recall, then signals), 3 (control room and board reveal), 4 (week-mode clock, events fold, Results panel, organiser path).

**Privacy:** all fixtures use invented names and invented questions. No real students, classes or texts.

---

## Decisions this plan locks in (where the spec leaves room)

1. **Squares** are indexed `0..24`, `index = row * 5 + col`. Rows are lettered A–E on screen and columns 1–5 (screen only; the data uses indexes).
2. **Ships:** `SHIP_SIZES = [3, 2, 2, 1]`, ship ids `s0..s3`. Team of two: first member places `s0` (3) and `s3` (1), second places `s1` and `s2`. Team of three: `[s0]`, `[s1, s3]`, `[s2]`. A late joiner places nothing. A ghost fleet is auto-placed.
3. **"Touch"** means orthogonally adjacent. A player's ship may not overlap any ship on the team chart and may not be orthogonally adjacent to a partner's ship. Their own two ships may touch each other. `autoPlace` tries the rule and, if no layout fits in 200 tries, drops the touch rule (never the overlap rule).
4. **Recall lines** are short-answer `QuestionItem`s, one per ship (`recall[i]` belongs to ship `s{i}`).
5. **Half damage** is `Math.max(1, Math.floor(full / 2))`, so hit 2 → 1, sure hit 4 → 2, returning hit 3 → 1.
6. **Damage-report deadline:** a hit made in round R is settled when round `R + 1` closes (or `R + 2` if the teacher rejected the report once). At settlement: filed and not since rejected → full; otherwise → half. Open hits at the reveal settle the same way. If the firing player has no teammate left, the hit settles full at once.
7. **Two teammates firing one square in one round:** the earlier commit counts. The later becomes `dup`. It is still marked and recorded but deals no damage and does not return.
8. **Lesson-mode "connected":** a player is *active* in round R if they placed (round 0) or committed a shot in round R − 1, or have called `fleet_state` since the round opened (`seen` timestamps on the clock record, written at most once per round per player). The round closes early when every active player has spent four shots. Otherwise it closes at the cap or on **Next round**.
9. **Correctness** is decided at `fleet_answer` time with `checkAnswer` (any `pending` result counts as wrong) and stored on the shot. `resolveRound` only reads the stored `correct`, which keeps it pure.
10. **Randomness** in the rules (pings, auto-placement, team shuffle) comes from a seeded `mulberry32(hashString(seed))`. The seed is `${campaign.id}:${round}` or similar, so the same inputs always give the same output.
11. **Call signs** use `hash(viewer + '|' + subject)`, with `hash` injected. The server passes an HMAC-SHA256 of the match secret, cut to 32 bits. Collisions within one viewer's screen probe forward in the order players joined, so a late joiner never changes anyone else's existing call sign.

---

## File map

| File | Responsibility |
|---|---|
| `apps/teaching/src/games/core/schema.ts` (modify) | `fleet_week` in `GAME_KINDS`/`GAME_KIND_INFO`; `FleetWeekSchema`; union entry; limits |
| `apps/teaching/src/games/core/model.ts` (modify) | `gameItems`, `gameIssues`, `splitGame` (`keys.live.fleet`), `LiveContent.fleet` |
| `apps/teaching/src/games/kinds/fleet-week/rules.ts` (create) | Pure: types, grid helpers, placement, teams, call signs, variant choice, `resolveRound`, `settleAll`, `standings` |
| `apps/teaching/src/games/kinds/fleet-week/index.ts` (create) | Empty registration stub (players arrive in plan 2) |
| `apps/teaching/src/games/kinds/index.ts` (modify) | `import './fleet-week';` |
| `apps/teaching/src/games/glyphs.ts`, `arcade.ts` (modify) | Exhaustive maps get a `fleet_week` entry |
| `apps/teaching/src/games/core/server-entry.ts` (modify) | Re-export the fleet rules |
| `netlify/functions/_shared/fleet-week.mjs` (create) | Campaign storage, lazy resolution, teacher and student actions |
| `netlify/functions/_shared/games.mjs` (modify) | Dispatch `fleet_*` / `signals` student actions before the `live_only` check |
| `netlify/functions/games.mjs` (modify) | Dispatch `campaign_*`, `void_shot`, `reject_report` teacher actions |
| `apps/teaching/tests/unit/games-fleet-week.test.ts` (create) | Vitest: schema, split, rules |
| `tests/unit/fleet-week.test.js` (create) | node:test: server actions |
| `tests/unit/helpers/fleet-fixture.mjs` (create) | Invented grid, roster of eight, store seeding |
| `apps/teaching/tests/unit/games-core.test.ts`, `games-editor.test.ts` (modify) | Kind count 13 → 14 |

---

## Task 1: Schema and publish split

**Files:** modify `schema.ts`, `model.ts`, `glyphs.ts`, `arcade.ts`, `kinds/index.ts`; create `kinds/fleet-week/index.ts`; test `apps/teaching/tests/unit/games-fleet-week.test.ts`; update the count tests.

- [ ] **Step 1: Write the failing tests** in `games-fleet-week.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GAME_KINDS, GameSchema } from '../../src/games/core/schema';
import { gameIssues, gameItems, gameWarnings, splitGame } from '../../src/games/core/model';

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
  it('publishes cleanly when complete', () => expect(gameIssues({ games: [fleetGame()] })).toEqual([]));
  it('blocks empty squares and missing recall lines', () => {
    const g = fleetGame({ squares: [], recall: [] });
    const issues = gameIssues({ games: [g] }).join(' ');
    expect(issues).toMatch(/25 squares/);
    expect(issues).toMatch(/recall line/);
  });
  it('warns about a square with one variant', () => {
    const g = fleetGame();
    if (g.kind === 'fleet_week') g.squares[3].variants = [g.squares[3].variants[0]];
    expect(gameWarnings({ games: [g] }).join(' ')).toMatch(/one question/);
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
```

- [ ] **Step 2:** Run `cd apps/teaching && npx vitest run tests/unit/games-fleet-week.test.ts`. Expect it to FAIL because `fleet_week` is not a kind.

- [ ] **Step 3: Implement the schema.**
  - In `schema.ts`, append `'fleet_week'` to `GAME_KINDS`.
  - Add `fleet_week: { label: 'Fleet week', solo: false, live: false, team: true, shapes: ['question'] }` to `GAME_KIND_INFO`.
  - Add `fleetLabel: 40` to `GAME_LIMITS`.
  - Add the schema below and put it in the `GameSchema` union:

```ts
/** Fleet week (spec 2026-11-19): a 5 × 5 grid; every square holds two short-answer variants; one recall line per ship. */
export const FLEET_SIZE = 5;
export const FleetSquareSchema = z.object({ variants: z.array(QuestionItemSchema).max(2).default([]) });
export const FleetWeekSchema = z.object({
  ...base,
  kind: z.literal('fleet_week'),
  columns: z.array(z.string().max(GAME_LIMITS.fleetLabel)).max(FLEET_SIZE).default([]),
  rows: z.array(z.string().max(GAME_LIMITS.fleetLabel)).max(FLEET_SIZE).default([]),
  /** Row-major, index = row * 5 + col. */
  squares: z.array(FleetSquareSchema).max(FLEET_SIZE * FLEET_SIZE).default([]),
  /** recall[i] is ship s{i}'s line (sizes 3, 2, 2, 1). */
  recall: z.array(QuestionItemSchema).max(4).default([]),
  settings: z
    .object({
      rounds: z.number().int().min(2).max(8).default(5),
      round_cap_s: z.number().int().min(60).max(600).default(240),
      placement_cap_s: z.number().int().min(30).max(300).default(120),
      answer_s: z.number().int().min(20).max(120).default(60),
      cutoff: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('20:00')
    })
    .prefault({})
});
```

  - The public copy is `PublicFleetWeekSchema = { id, title, kind: 'fleet_week', columns, rows }`. Add it wherever `PublicGameSchema` unions the public kinds. Follow how `answer_chain` appears there.

- [ ] **Step 4: Implement the model** (`model.ts`).
  - `gameItems`: `case 'fleet_week': return [...game.squares.flatMap((s) => s.variants), ...game.recall];`
  - `gameIssues`, `case 'fleet_week'`. These are blocking, in the teacher's words:
    - `${where} needs all 25 squares filled.` when any square has 0 variants or fewer than 25 squares exist.
    - `${where} needs five row and five column labels.` when any label is blank.
    - `${where} needs a recall line for each of the four ships.` when there are fewer than four non-empty recall items.
    - Each variant also gets the existing per-question check that runs for other Question items. Copy how `wager` items are checked.
  - `gameWarnings`: `${where}: square ${label} has only one question, so partners may share answers.` Here `label` is `${'ABCDE'[row]}${col + 1}`.
  - `LiveContent.fleet?: { columns: string[]; rows: string[]; squares: string[][]; recall: string[] }`. It holds item ids. The question heads stay in `keys.live.items` as `PublicItem`s, which is how other live-only kinds keep theirs.
  - `splitGame`: fleet_week publishes `{ id, title, kind, columns, rows }`. Its keys get `live.fleet` plus `live.items` (every variant and recall question split with `splitQuestionItem`). `keys.items[id]` is the ItemKey, as for other kinds.
  - Make `count` = 25 for scoring (`gameTotal`).

- [ ] **Step 5: Register the kind on the client.**
  - `glyphs.ts`: add an `SVG` entry (a simple hull and mast, matching the stroke style of the existing glyphs) and `GAME_KIND_BLURB.fleet_week = 'A week-long hunt: every square is a question.'`.
  - `arcade.ts`: `NOUNS.fleet_week = ['square', 'squares']`.
  - Create `kinds/fleet-week/index.ts` as `export {};` with a one-line comment that the campaign player registers in plan 2.
  - Add `import './fleet-week';` to `kinds/index.ts`.
  - Update `games-core.test.ts:23` and `games-editor.test.ts:61` from 13 to 14.

- [ ] **Step 6:** Run `cd apps/teaching && npx vitest run tests/unit/games-fleet-week.test.ts tests/unit/games-core.test.ts tests/unit/games-editor.test.ts tests/unit/games-arcade.test.ts`. All PASS.
- [ ] **Step 7:** Commit: `Games: Fleet week schema and publish split`.

---

## Task 2: Pure rules, part 1 (grid, placement, teams, call signs, variants)

**Files:** create `apps/teaching/src/games/kinds/fleet-week/rules.ts`; extend `games-fleet-week.test.ts`.

Types (export all):

```ts
export const SHIP_SIZES = [3, 2, 2, 1] as const;
export type ShipId = 's0' | 's1' | 's2' | 's3';
export type Ship = { id: ShipId; squares: number[] };           // squares in a straight line
export type Team = { id: string; owners: string[]; ghost?: boolean };
export type Match = { id: string; teams: [string, string] };
export type Pairing = { teams: Team[]; matches: Match[] };
export type Rng = () => number;

export function rng(seed: string): Rng;                          // mulberry32(fnv1a(seed))
export function rowOf(i: number): number; export function colOf(i: number): number;
export function squareLabel(i: number): string;                  // 'A1'..'E5'
export function shipLine(start: number, size: number, dir: 'h' | 'v'): number[] | null; // null if off-grid
export function shipsFor(team: Team, owner: string): ShipId[];   // decision 2
export function placementProblem(ships: Ship[], owner: string, team: Team, fleet: Ship[]): string | null;
export function autoPlace(ids: ShipId[], fleet: Ship[], partnerSquares: number[], random: Rng): Ship[];
export function pairTeams(owners: string[], random: Rng): Pairing;
export function callSigns(viewer: string, joined: string[], hash: (s: string) => number): Record<string, string>;
export function pickVariant(square: number, owner: string, matchOwners: string[], given: Given[], count: number, returning?: { not: number }): number;
export type Given = { owner: string; square: number; variant: number };
```

`placementProblem` returns these messages, checked in order:
- `'Place each of your ships.'` when an id is missing or not owned per `shipsFor`.
- `'Ships go in a straight line.'`
- `'That ship would leave the chart.'`
- `'Ships can’t overlap.'`
- `'Keep a square of sea between your ships and your partner’s.'`

`pairTeams`:
1. Shuffle the owners.
2. Cut them into twos.
3. If the count is odd, the last owner joins the previous team as a third.
4. Pair the teams into matches in order.
5. If the team count is odd, add `{ id: 'ghost', owners: [], ghost: true }` and match it with the last team.

Team ids are `t1…tn`, match ids `m1…mn`. "Mixed by accuracy" balancing is deferred to plan 4: the conventions map found no existing balancer. The open action takes `balance: 'random'` only for now.

`callSigns`:
- `RANKS = ['Captain', 'Commander', 'Admiral', 'Ensign', 'Bosun']`.
- `NAMES` is 24 bird and weather words: Kestrel, Lark, Pike, Gannet, Petrel, Squall, Tern, Osprey, Heron, Curlew, Plover, Merlin, Skua, Shearwater, Fulmar, Dunlin, Gale, Swift, Kittiwake, Puffin, Wren, Sleet, Corsair, Marlin.
- 120 combinations. For each subject in `joined` order, start at `hash(viewer + '|' + subject) % 120` and probe forward until the slot is free.

`pickVariant`:
- With `returning`, return the variant that is not `returning.not` (when `count` = 2).
- Otherwise, prefer a variant no one else in `matchOwners` has been given for this square. Ties go to the lower index.
- If both variants are taken, choose the one given the fewest times.

- [ ] **Step 1: Write failing tests:**
  - `shipLine` is null at the edge.
  - `placementProblem` returns each of the five messages, and null for a valid layout.
  - `autoPlace` always returns valid ships across 50 seeds when the partner's ships are already down.
  - `pairTeams` with 8 owners gives 4 teams of 2 and 2 matches. With 9 owners it gives 3 teams of 2 and one of 3, plus 2 matches. With 6 owners it gives 3 teams + ghost and 2 matches. Every owner appears exactly once.
  - `callSigns`:
    - stable for the same inputs;
    - unique within one viewer;
    - for one subject, viewer A's sign ≠ viewer B's for at least 3 of 4 subjects with a test hash (`fnv1a`);
    - appending a late joiner leaves existing signs unchanged.
  - `pickVariant`:
    - gives the partner the other variant;
    - a returning square gets the other variant.
- [ ] **Step 2:** Run, see FAIL.
- [ ] **Step 3:** Implement. Keep the file free of DOM and Node imports, because it is bundled for both.
- [ ] **Step 4:** Run, see PASS.
- [ ] **Step 5:** Commit: `Games: Fleet week placement, teams and call signs`.

---

## Task 3: Pure rules, part 2 (`resolveRound`, settlement, standings)

**Files:** `rules.ts`, `games-fleet-week.test.ts`.

```ts
export type Shot = {
  seq: number; owner: string; square: number; sure: boolean; variant: number; item: string;
  correct: boolean | null;   // null = no answer in time
  returning: boolean; voided?: boolean;
};
export type Hit = {
  id: string; owner: string; team: string; target: string; square: number; round: number;
  full: number; due: number; rejected: number; status: 'owed' | 'full' | 'half';
};
export type SinkRecord = { target: string; ship: ShipId; by: string; round: number; recall: 'pending' | 'right' | 'wrong' | 'none'; bonus: number };
export type Ping = { to: string; about: string; line: string; round: number };   // line 'row:B' or 'col:3'
export type Return = { owner: string; square: number; variant: number; due: number };
export type Outcome = 'hit' | 'miss' | 'dud' | 'dup' | 'void' | 'practice';
export type ShotResult = Shot & { outcome: Outcome; target: string; ship?: ShipId; damage: number };

export type FleetState = {
  round: number;                                   // last resolved round (0 = placement)
  fleets: Record<string, Ship[]>;                  // team id → ships (frozen after round 0)
  charts: Record<string, Record<number, 'hit' | 'miss'>>; // target team → known squares
  damage: Record<string, number>;                  // dealt BY team
  first_try: Record<string, { right: number; total: number }>;
  hits: Hit[]; sinks: SinkRecord[]; pings: Ping[]; returns: Return[];
  given: Given[]; ended: Record<string, boolean>;  // match id → over
  log: Array<{ round: number; results: ShotResult[] }>;
};
export type RoundInput = {
  pairing: Pairing; round: number; seed: string;
  placements: Record<string, Ship[]>;              // owner → ships (round 0 only; missing → autoPlace)
  shots: Shot[];                                   // all owners' shots for this round
  filed: Record<string, number>;                   // hit id → round filed
  rejected: Record<string, number>;                // hit id → times rejected
  recalls: Record<string, boolean>;                // `${target}:${ship}` → answered right
};
export function emptyState(pairing: Pairing): FleetState;
export function resolveRound(prev: FleetState, input: RoundInput): FleetState;
export function settleAll(state: FleetState, input: Pick<RoundInput, 'filed' | 'rejected' | 'recalls'>): FleetState; // at the reveal
export function standings(state: FleetState, pairing: Pairing): Array<{ match: string; teams: Array<{ team: string; damage: number; sunk: number; accuracy: number }>; winner: string | null }>;
export function rivalOf(pairing: Pairing, team: string): string;
export function teamOf(pairing: Pairing, owner: string): Team | undefined;
```

`resolveRound` order. It is pure: clone `prev` first and never mutate it.
1. **Round 0:** build `fleets` from `placements`. Any missing owner (and the ghost) is filled by `autoPlace(shipsFor…, rng(seed + owner))`. Return.
2. **Settle due hits:** for every `hit` with `status === 'owed'`:
   - recompute `due = hit.round + 1 + min(rejected[hit.id] ?? 0, 1)`.
   - If `due <= input.round - 1`, or the round is `input.round` and `due === input.round`, settle it: `filed[hit.id] != null && filed[hit.id] > (last rejection round)` gives full. A rejection clears the filing, and the server deletes `filed` on reject. Anything else gives half. Add the damage to the firing team.
   - Concretely: settle when `input.round >= due`.
3. **Settle pending recalls** from earlier rounds: `recalls[key] === true` → `right`, +2 bonus to the sinking team; `false` or missing → `wrong`/`none`, no bonus.
4. **Resolve shots** sorted by `seq`. For each shot, take `team = teamOf`, `target = rivalOf`, `match = matchOf`:
   - `voided` → `void`. Records nothing on the chart and does not return.
   - `ended[match]` → `practice`. Recorded for accuracy only.
   - The square is already in `charts[target]`, or an earlier shot this round by a teammate already took that square → `dup`.
   - `correct !== true` → `dud`. Push `Return { owner, square, variant: other, due: round + 2 }`. If `sure`, also push a `Ping` to `target` about `team`: choose with `rng(seed + seq)` from the row and column lines of `fleets[team]` that still hold an unhit ship square.
   - Right, and not on a ship → `miss`, `charts[target][square] = 'miss'`.
   - Right, and on ship X → `hit`.
     - `full = (sure ? 4 : 2) + (returning ? 1 : 0)`.
     - `charts[target][square] = 'hit'`.
     - Push a `Hit` with `due = round + 1`. If the firing owner's team has no other owner, set `status: 'full'` and apply the damage at once.
     - If every square of X is now hit, push a `SinkRecord { recall: 'pending' }`.
     - If every ship of `target` is now sunk, set `ended[match] = true`.
   - `first_try` counts only shots with `returning === false` and an outcome in `hit`/`miss`/`dud`.
   - Remove the matching `returns` entry for `(owner, square)` when a returning shot is fired.
5. Push `{ round, results }` to `log`, and set `state.round = input.round`.

`settleAll` runs steps 2 and 3 treating every hit as due, and treats pending recalls as settled.

`standings`:
- Sort by damage, then ships sunk *by* the team, then first-try accuracy (`right / total`, 0 when there are no shots).
- `winner` is `null` on a full tie.
- The ghost team is never the winner unless it is the only team with damage, which cannot happen because the ghost never fires.

- [ ] **Step 1: Write failing tests,** one `it` per row. Build a tiny fixture: two teams of two, with known placements via round 0. Cover:
  - right on ship → hit, damage applies only after settlement;
  - right off ship → miss;
  - wrong → dud plus a return due at round+2 with the other variant;
  - no answer → dud;
  - sure+right → 4;
  - sure+wrong → ping naming a line that contains an unhit ship square;
  - unsure+wrong → no ping;
  - returning hit → +1;
  - filed by due → full;
  - not filed → half (2 → 1, 4 → 2);
  - rejected once then refiled → full, settled one round later;
  - partnerless → full at once;
  - sinking with recall right → +2 bonus at the next resolve, and recall wrong → no bonus but still in `sinks`;
  - whole fleet sunk → `ended`, and later shots → `practice`;
  - teammate `dup`;
  - voided shot;
  - ghost fleet is auto-placed and can be hit;
  - team of three: all three can fire, and a hit's report is owed by "anyone else";
  - `standings` tie-break (damage tie → sunk → accuracy);
  - determinism: `resolveRound` twice on deep-cloned inputs gives `toEqual` results, and `prev` is unchanged (`Object.freeze` deep in the test).
- [ ] **Step 2:** Run, see FAIL. **Step 3:** Implement. **Step 4:** Run, see PASS.
- [ ] **Step 5:** Add to `core/server-entry.ts`: `export * as fleet from '../kinds/fleet-week/rules';`. Run `node scripts/generate-alchemy-schema.mjs` and confirm `netlify/functions/_shared/game-rules.mjs` now exports `fleet`. Also regenerate `teaching-ai-runtime.mjs` if `tests/unit/teaching-ai-runtime-fresh.test.js` fails: `node scripts/generate-teaching-ai-runtime.mjs`.
- [ ] **Step 6:** Commit: `Games: Fleet week round resolution and scoring`.

---

## Task 4: Server, campaign storage and lazy resolution

**Files:** create `netlify/functions/_shared/fleet-week.mjs`, `tests/unit/helpers/fleet-fixture.mjs`, `tests/unit/fleet-week.test.js`.

Keys (add to `gameKeys(lesson)` in `_shared/game-store.mjs`):

```
campaign(game, id)          games/{lesson}/{game}/campaigns/{id}                  config (create-only, then etag for reveal/close/members)
current(game, classKey)     games/{lesson}/{game}/campaigns/current/{class}       { id }
clock(game, id)             …/campaigns/{id}/clock                                { round, opened_at, closes_at, seen: {owner: round}, done: {owner: round} }  etag
fleet(game, id, owner)      …/campaigns/{id}/fleet/{owner}                        Ship[] (create-only)
shots(game, id, r, owner)   …/campaigns/{id}/shots/{r}/{owner}                    Shot-with-pending[] (etag append)
resolved(game, id, r)       …/campaigns/{id}/resolved/{r}                         FleetState (create-only)
reports(game, id, owner)    …/campaigns/{id}/reports/{owner}                      { filed: {hitId: {round, text, writing}}, recall: {key: {round, answer, correct, writing}} } (etag)
seen(game, id, owner)       …/campaigns/{id}/seen/{owner}                         signal ids (plan 2)
```

Campaign config:

```js
{ id, lesson, game_id, version, class_id, mode: 'lesson', secret /* 32 hex, server only */, created_at,
  settings: { rounds, round_cap_ms, placement_cap_ms, answer_ms },
  pairing, joined /* owners in join order */, students /* owner → student id */,
  revealed_at: null, closed_at: null }
```

Core helpers (export the first four for tests):
- `hashFor(secret)`: `(s) => createHmac('sha256', secret).update(s).digest().readUInt32BE(0)`.
- `roundClosed(campaign, clock, now)`: lesson mode. True if `now >= clock.closes_at`, or `clock.next === clock.round`, or every active owner (decision 8) has `done[owner] === clock.round`.
- `ensureResolved(store, k, campaign, now) → { state, clock }`. While the current round is closed:
  1. Read the fleets (round 0) or the shots for `clock.round`, plus all reports.
  2. Call `fleet.resolveRound(prevState, input)`.
  3. `setJSON(resolved(r), state, { onlyIfNew: true })`. If `modified === false`, read the stored copy and use that instead.
  4. Advance the clock with an etag. The next round is `r + 1`, `opened_at = now`, `closes_at = now + cap`. On an etag conflict, re-read and continue.

  Stop after `settings.rounds`. The state then waits for the reveal.
- Unanswered committed shots at close become `correct: null`.

- [ ] **Step 1:** Write the fixture.
  - Invented roster of eight: `st_01`…`st_08`, names like 'Ivo Penn' and 'Lena Moss'.
  - `fleetLesson()` publishes a game with `fleetGame` content via the same publish path `games.test.js` uses, so keys exist at `games/gl1/keys/{v}`.
  - `whoFleet(n)` returns `{ class_id: 'class1', class_token }`, mirroring `who(n)` in `sprint-store.js`, and seeds claims into `memoryStore` from `tests/unit/helpers/lab-store.js`, so `onlyIfNew` and `onlyIfMatch` work.
- [ ] **Step 2:** Write the failing tests:
  - `campaign_open` creates config, pairing and clock.
  - Opening twice for one class returns the existing campaign.
  - Round 0 closes at the placement cap.
  - `ensureResolved` called twice concurrently (`Promise.all`) writes `resolved/0` exactly once. Count writes with `store.writes`.
  - After the cap, every fleet exists, auto-placed where missing.
- [ ] **Step 3:** Run (`node --import ./scripts/test-network-guard.mjs --test tests/unit/fleet-week.test.js`) and see FAIL. Implement. Run and see PASS.
- [ ] **Step 4:** Commit: `Games: Fleet week campaign storage and lazy resolution`.

---

## Task 5: Server, student actions

Dispatch in `_shared/games.mjs`:
- Before the `live_only` 409, add `if (action.startsWith('fleet_') || action === 'signals') return fleetStudentAction(store, lessonId, body, { classId, student, owner, now, keys })`.
- Add the actions to `ACTIONS`.
- `published-games.mjs` already forwards everything except `join`.

Actions (all call `ensureResolved` first):

| Action | Body | Returns / effect |
|---|---|---|
| `fleet_state` | `{ game_id }` | The player's view (below). Records `clock.seen[owner] = round` once per round. |
| `fleet_place` | `{ game_id, ships: Ship[] }` | Round 0 only. Rejected with `placementProblem` text (422). The fleet blob is written create-only; a second call gets 409 "Your ships are already at sea." |
| `fleet_commit` | `{ game_id, square, sure }` | Firing round, fewer than 4 shots, square not known on the chart. Returning squares are allowed only for their owner. If an unanswered shot is already open, return it unchanged (reload-safe). Otherwise append `{ seq, square, sure, variant, item, deadline: now + answer_ms, returning }` and return `{ question: PublicQuestion, deadline }`. |
| `fleet_answer` | `{ game_id, answer, writing }` | Applies to the open shot. If `now > deadline + 2000` it is stored `correct: null` with 409 `late`. Otherwise `checkAnswer(keys.items[item], answer)` → `correct = result.correct === true`, and `cleanWritingLog(writing)` is stored. Returns `{ ok: true }` only. Never right or wrong (spec §1.9: nothing resolves before the close). On the fourth answer, set `clock.done[owner] = round`. |
| `fleet_report` | `{ game_id, hit, text, writing }` | Only for a teammate of `hit.owner` (not the owner), while the hit is `owed`. `text` 1–300 chars. Stored in `reports/{owner}.filed`. |
| `fleet_recall` | `{ game_id, ship_key, answer, writing }` | Only for `sink.by`, once. Marked with `checkAnswer` against `recall[ship]`. Stored in `reports/{owner}.recall`. Returns `{ ok: true }`. |
| `signals` | — | Plan 2. For now return `{ events: [] }`. |

**Player view** (`fleet_state`), built by `viewFor(campaign, state, clock, owner, keys)`:

```js
{ phase: 'placement' | 'firing' | 'waiting' | 'reveal' | 'closed', round, rounds, closes_at,
  labels: { columns, rows },
  me: { sign, ships: ShipId[] /* ids I place */ },
  team: { signs: { [ownerAlias]: sign }, fleet: Ship[] /* my team's ships, mine + partner's */, chart: { [sq]: 'hit'|'miss' } /* damage taken */ },
  rival: { signs: [sign, sign], chart: { [sq]: 'hit'|'miss' }, sunk: ShipId[] },
  shots: { left, open?: { square, sure, question, deadline }, returning: number[] },
  owed: [{ hit, square, question, answer, by: sign }],      // damage reports I owe: the exact variant + partner's typed answer
  recall?: { ship_key, prompt },
  report?: { round, lines: [{ by: sign, square, outcome, damage }], pings: [line] },  // last resolved round from my side
  score: { us, them } }
```

- `ownerAlias` is an opaque per-viewer id: `hashFor(secret)(viewer + '>' + owner).toString(36)`. Real owners never leave the server.
- Rival owners appear only as call signs.
- No model answer, rival fleet, `secret`, student id or name appears anywhere.

- [ ] **Step 1: Write failing tests:**
  - **Leak sweep:** play a full 2-match lesson game (place, 2 firing rounds, a report, a recall), then serialise every student response and assert it contains no:
    - accepted answer text (`a0`, `b0`, `line 0`)
    - secret
    - roster name or `st_0` id
    - rival ship square list (compare against the rival fleet blob)
  - Commit, then commit again → same question and deadline.
  - Answer after the deadline → `late`, stored null.
  - A fifth commit → 409.
  - Firing at a known square → 409.
  - Placement validation messages surface.
  - The round closes early once all active players are done.
  - A report by the shooter themselves → 403.
  - The owed report shows the exact variant prompt and the partner's typed answer.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `Games: Fleet week student actions`.

---

## Task 6: Server, teacher actions

Add a branch in `netlify/functions/games.mjs` (operator gate): `campaign_*`, `void_shot` and `reject_report` → `fleetTeacherAction(store, lessonId, body, { now })`.

| Action | Effect |
|---|---|
| `campaign_open` | `{ game_id, class_id, mode: 'lesson', rounds?, round_cap_s?, balance: 'random' }` |
| | Refuses with 409 `need_roster` when the class has no list, and with 409 `week_mode_later` for `mode: 'week'` until plan 4. |
| | Pairs `joined` = every roster owner (`deviceHash('student:'+class+':'+id)`). |
| `campaign_state` | `{ game_id, class_id }`: real names from the roster, every match, who has fired this round, owed reports, flags (`writing.pastes > 0`, `away > 0`, `jumps > 0`) with the log for replay, and standings. |
| `campaign_next` | Sets `clock.next = clock.round` (lesson mode). |
| `void_shot` | `{ round, owner, seq }`: marks `voided: true` in the shots blob. Allowed only while the round is open, or for the latest resolved round before the next resolves. In that second case, reject with 409 `too_late` in plan 1 and revisit in plan 3. |
| `reject_report` | `{ hit }`: deletes the filing and increments a `rejected` counter stored in the firing team's reports blob. A second rejection is refused (409): "Already returned once." |
| `campaign_reveal` | Sets `revealed_at`, runs `settleAll` and stores `resolved/final`. Students now get `phase: 'reveal'` with real display names (class list display form), both fleets, standings and their own calibration (`sure` right / `sure` total). |
| `campaign_close` | Sets `closed_at` and clears `current/{class}`. |

- [ ] **Step 1: Write failing tests:**
  - Teacher state has names and students' state does not.
  - `campaign_next` closes the round on the next request.
  - Void turns a would-be hit into `void`.
  - Reject once → the report is owed again and the deadline moves one round. Reject twice → 409.
  - Reveal settles owed hits at half and fills in names.
  - Close stops new commits (409 `closed`).
  - Week mode refuses for now.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `Games: Fleet week teacher actions`.

---

## Task 7: Gate and PR

- [ ] Run `node scripts/generate-alchemy-schema.mjs`, then `git status`. The only regenerated bundles should be `game-schema.mjs`, `game-rules.mjs`, `game-room-core.mjs`, `notion-import-core.mjs` if touched, and `teaching-ai-runtime.mjs` if its freshness test fails.
- [ ] Run `cd apps/teaching && npx vitest run tests/unit/games-*.test.ts` and `npm run test:unit`. All pass.
- [ ] Run `npm run pre-pr-check`. Exit 0 is required.
- [ ] Push `claude/nice-clarke-4c49ew`.
  - Open a ready PR "Games: Fleet week engine (schema, rules, lesson-mode server)" with an invented-example-only body.
  - Enable auto-merge (merge commit).

## Deviations (as built, Tasks 2–6)

Rules (Tasks 2–3):
- Practice shots (a match already won) do not count toward `first_try`.
- Only an earlier hit or miss on a square makes a later shot `dup`. A dud, void or practice shot leaves the square open.
- `Shot.seq` is the commit time in ms (server clock), per owner. Ties are broken by owner.
- `pickVariant` first prefers a variant this player hasn't been given, then the one least given to others in the match.

Server (Tasks 4–6):
1. Teacher actions live in `_shared/fleet-week-teacher.mjs`, and campaign storage and resolution in `_shared/fleet-week-store.mjs`. `fleet-week.mjs` holds the student actions and the view.
2. The keys are `campaignCurrent`, `campaignClock` and so on, because `gameKeys.current` already exists. `clock.fired[owner] = round` records "committed a shot in round R − 1" for decision 8. A firing round's early close needs at least one active player.
3. Server fixture answers are "Mast A0", "Mast B0" and "Line 0", so the leak sweep can search for them case-sensitively without false matches in hex or base36 ids. Students type them in lower case.
4. Hits reach students as opaque per-team aliases, because real hit ids contain the owner hash.
5. Closing a campaign clears `current/{class}`. The view therefore carries the campaign id, and student actions accept `campaign_id`, so a closed campaign stays readable.
6. `fleet_recall` takes the ship id (`s3`) as `ship_key`. The server adds the rival team.
7. Extra commit refusals:
   - 409 `fired`: the same square twice by one player in one round.
   - 409 `returns_later`: the player's own dud square before it returns.
   - 409 `no_shot`: an answer with no open shot.
8. `void_shot` works only in the open round. Any other round gets `too_late`, to be revisited in plan 3.
9. Students see reveal names as first name and last initial ("Ivo P."). Reveal settles the last resolved state, so shots in a round that is still open are dropped.

**Placement decision (19 Nov):** round 0 closes early only when every rostered player in the pairing (never the ghost) has placed. Otherwise it closes at the placement cap or on **Next round**. Firing rounds keep decision 8 as built.

**Server review fixes (19 Nov):**
- Every seed comes from the secret, never from the campaign id that students see:
  - resolution: `seedFor(secret, 'seed:' + round)`
  - teams: `seedFor(secret, 'teams')`
- A round never closes while a committed shot is still open, whether at the cap or on **Next round**.
  - A shot is open while it is unanswered and `now <= deadline + 2 s`. So the round really closes at the later of the cap (or Next) and the last open deadline plus grace.
  - Once the cap or Next has been reached, no new shots can be committed. A shot already in flight can still be answered.
  - Early close when everyone is done is unchanged.
- An answer whose round has resolved before the answer was written gets 409 `late`, not ok.
- `done` is recorded with the shots:
  - Each commit makes one clock write (`seen`, `fired`, the shot's hold `open[owner] = { round, until }`). On the fourth commit the same write sets `done[owner] = { round, until: deadline + grace }`.
  - The fourth answer brings `until` down to the answer time.
  - A player counts as done once `now > until`, so an unanswered last shot holds the round only until its time runs out.
- Resends are safe:
  - `fleet_answer` with every shot settled, or repeating the last stored answer, re-marks the clock and returns ok.
  - `fleet_place` with the same layout returns ok; a different layout gets 409 `placed`.
  - A lost clock write after an answer is not fatal.
- `updateJSON` (now in `_shared/etag-json.mjs`, shared with `games.mjs`) retries up to 6 times with jittered pauses. The random source and sleep are injectable.
- A damage report is filed in the shooter's reports blob as `filed[hit] = { round, by, text, writing }`, next to `rejected[hit]`:
  - The "already filed?" check runs inside the etag write, so one filing wins.
  - A rejection is a single write.
- Teacher actions load the keys for `campaign.version`.
- `campaign_open` writes the class pointer create-only first, then the clock, then the campaign. If the pointer write loses, nothing else is written. A pointer with no campaign behind it counts as stale after 10 s.

## Self-review against the spec

- §1.1 grid and variants → Tasks 1 and 2. §1.2 teams and ghost → Task 2. §1.3 lesson clock → Task 4 (week clock → plan 4). §1.4 outcomes and confidence → Task 3. §1.5 sinking → Task 3 and Task 5 (`fleet_recall`). §1.6 reports → Tasks 3, 5 and 6. §1.7 scoring → Task 3. §1.8 call signs and anonymity → Tasks 2 and 5. §1.9 two-step commit, server timer and writing logs → Task 5. Flags → Task 6.
- §2 signals → plan 2. §3.4 client → plans 2 and 3. §4 learning data → plan 4 (events are already in `state.log` with `sure`, `returning`, `on_ship` and `voided`, ready to fold). §5 editor → plan 2 (the grid editor is part of the teacher's first screen).
- §8 pure and server rows → Tasks 2 to 6.
