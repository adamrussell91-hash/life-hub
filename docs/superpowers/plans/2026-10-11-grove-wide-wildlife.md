# Grove Wide Wildlife Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax.

**Goal:** Earned wildlife roams through completed weekly zones in Year/Term views, with realistic habitat and motion, and all 20 animal models have reachable use.

**Architecture:** Separate pure/cooperatively prepared route planning from frame-time motion and Three.js actors. Geographic navigation uses the solved world, open weekly ownership, dated eligibility and actual water footprints. Preserve existing local Day/Week encounters and bound the shared population.

**Tech Stack:** Existing TypeScript, Three.js 0.180.0, Vitest, native Playwright browser verification; no new packages.

**Spec:** docs/superpowers/specs/2026-10-11-grove-wide-wildlife-design.md

## Global Constraints

- At most 11 visible actors; two rotating companions, no per-week population multiplication.
- Completion history, region ownership, terrain, milestone definitions and task records are not mutated.
- Year/Term cutoff is min(period end, today), not the anchor. No future or closed-region routes; region end must be on/after animal earnedOn.
- Dry routes avoid water, slope>0.5 and trunks within 1m. Water routes remain within connected rendered water at sampled elevation; legal dry bird landings.
- Route preparation is cancellable and outside frame updates, yielding in bounded chunks or off-thread; no new dependencies.
- Removed Wildlife credits UI stays removed; catalogue/provenance data stays intact.
- All existing pause/reduced-motion/hidden/offscreen/disposal semantics and Day/Week local routes remain functional.
- Existing public/private asset delivery and deployment secrets are unchanged.

## Review Focus

- Sparse completed regions separated by closed land or rivers: remain separate, no forced jump (Task1).
- Historic term or Year anchor earlier than earned milestones: cutoff eligibility and future exclusion (Task2).
- Same geometry with dense dynamic tree obstacles: routes must not inherit stale obstacle assumptions (Task1).
- View disposal while async routes/models load: cancellation and complete cleanup (Task2).
- Long sessions, panning and paused zero-delta frames: route continuity, bounded allocation and no phase resets (Task2/3).

### Task 1: Safe multi-region route planning

**Files:** Create focused domain modules under apps/tasks/src/domain/grove/ for wide navigation/roaming (annual-roaming.ts plus a separate navigation file if graph implementation warrants it); add tests/unit/grove-annual-roaming.test.ts. Reuse annual-wildlife.ts, geography.ts and existing world metadata; modify these only for shared safety/performance utilities where needed.

**Interfaces:** Export type RoamingEncounter={id:string;species:WildlifeSpecies;earnedOn:string;swimming:boolean;baby:boolean}, type RoamingRoute={id:string;points:PathPoint[];regionIds:string[];mode:'land'|'water'|'flight'} and async function buildAnnualRoamingRoutes(world:AnnualWorld,plan:AnnualGrovePlan,encounters:readonly RoamingEncounter[],signal?:AbortSignal):Promise<RoamingRoute[]>. Returned routes have positive length and at least two points; invalid/unreachable encounters produce no route. IDs uniquely identify encounters/model IDs; at most 11 incoming encounter groups. Deterministic routes depend on world, period, eligible regions, ID and obstacles. Planner retains no Three.js resources. Route geometry supports selecting new destinations along connected habitat; it may be an ordered connected circuit whose changing destination indices the motion controller chooses, rather than a regenerated graph every frame.

- [ ] Write behavioural failing tests for adjacent completed-region travel, closed/disconnected/future regions, earned-date exclusion, current tree obstacles, aquatic dry gaps/waterfall exclusion, safe bird landing and species habitat preference.
- [ ] Run focused tests and record expected RED before implementing.
- [ ] Implement bounded navigation graph/candidate preparation and safe connected routes; yield during expensive preparation and honour cancellation. Keep metadata/safety in domain modules.
- [ ] Run focused GREEN and full Tasks suite once before commit; report outputs and pre-existing noise truthfully.
- [ ] Self-review, commit task, write report with interfaces and red/green evidence.

### Task 2: Encounters, motion and renderer integration

**Files:** Modify domain/grove/companions.ts and add focused encounter/motion modules as appropriate; modify views/grove/annual-animals.ts and grove-world-preview/renderer.ts; tests/unit/grove-companions.test.ts and new wide wildlife/motion/integration test files.

**Interfaces:** Consume buildAnnualRoamingRoutes and its exported types from Task1. Existing createAnnualAnimals(world,plan,focusKey?,heightScale?) API may add optional trailing signal/options without breaking callers. Renderer owns cancellation, scene-specific actor resources and clock continuity across pan/zoom; graph route planning stays out of animate. Keep callbacks/health diagnostics compatible and add non-private route/population diagnostics needed for browser checks.

- [ ] Write failing tests for all20model encounter reachability with unchanged milestone dates; Year/Term cutoff vs early anchor; <=11actors; Day/Week locality; per-species activity states, pause/zero delta, safe baby trailing, bird flight, swimmer height and culling consistency; async cancellation/model failure cleanup and panning continuity.
- [ ] Run focused RED before implementation.
- [ ] Integrate wide routes only for Year/Term; distribute encounter starts across open habitat, move between varying destinations with species-appropriate speed and deterministic variable rests/feeding/sleep when supported. Birds lift during inter-landing flights. Parent/baby use route-distance trailing.
- [ ] Wire original stag as companion and purchased deer/stag/fox/rabbit as deterministic alternates; retain original milestone species, early dates and maximum population.
- [ ] Preserve pause/reduced-motion/disposal and immutable geography; ensure loading obsolete requests cannot append actors. Run focused GREEN and full Tasks suite once, self-review and commit/report.

### Task 3: Native verification and production release

**Files:** Owner-controlled work/ scripts and user outputs for native evidence; committed documentation records final behaviour/limitations only. No unrelated source changes.

- [ ] Run native Chrome/WebKit fixtures with all earned milestones and multiple completed weeks; assert actual land/water/flight route coverage, model reachability diagnostics, open-zone gating, no errors, pan/zoom continuity, pause and teardown at1440/390.
- [ ] Measure dense-history native desktop frame distribution/navigation preparation and allocation counts; verify physical phone remains explicitly unmeasured.
- [ ] Run npm run pre-pr-check and full production build serially; close any discovered runtime defects through implementer and review.
- [ ] Independent whole-branch review, fix/re-review, then push/PR/merge/deploy within user's existing publication request and verify live signed-in readiness and synthetic wide fixture behaviour without modifying real records.
- [ ] Save final source/evidence/recovery report and archive own completed ledger.
