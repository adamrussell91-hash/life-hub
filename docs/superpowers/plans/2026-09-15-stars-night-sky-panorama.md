# Stars Night-Sky Panorama Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed-frame, zoom/annual-rotation "Stars" night sky (`apps/knowledge/src/stars/*`) with a horizontally-pannable panorama where every saved constellation and unconnected note is positioned by its creation month along an unbounded timeline, virtualized by distance from the current view so it scales to thousands of notes.

**Architecture:** A new pure module (`timeline.ts`) turns dates into a continuous "month index" axis and provides the interpolation/inertia math. A second pure module (`skyIndex.ts`) buckets notes and saved constellations by month. A new rendering module (`panorama.ts`) owns a single canvas + a small pool of invisible hit-test buttons (bounded to the visible window) and draws three layers per frame: a static backdrop, month-glow "haze" for everything off-screen, and canvas-drawn glyphs/points for the handful of months currently in view. `horizon.ts` is rewritten from a fixed 12-tick annual arc into a slider over the same unbounded month-index value, driven by (and driving) the panorama's own drag-with-inertia camera — one shared value, two input surfaces. `view.ts`, `schema.ts`, `client.ts`, and the Netlify persistence function get small, targeted edits to wire this in and stop treating `sky.x` as meaningful.

**Tech Stack:** TypeScript, Vite, Vitest, Canvas 2D (no WebGL/3D), Zod.

**Source spec:** [`docs/superpowers/specs/2026-09-15-stars-night-sky-panorama-design.md`](../specs/2026-09-15-stars-night-sky-panorama-design.md), sections 1–6. Section 7 ("Detail view polish") is a separate follow-on plan — it touches a different screen (the constellation detail view) and ships independently.

**Design decisions made while planning (not fully pinned down in the spec):**
- The old pinch/scroll **zoom** on the sky is removed. The spec's interaction list (§3) is pan + scrubber + hover + click only; zoom has no role once position means "when," not "where," so keeping it would let you zoom into empty scatter with nothing to reveal.
- The horizon scrubber becomes a straight glass-pill **slider** over `[minMonthIndex, maxMonthIndex]` rather than trying to stretch the old fixed 12-point curved arc over an unbounded number of years. Year-boundary tick marks give orientation.
- Notes with no `created_at` cannot be placed on the timeline and are excluded from the panorama (they still count in the toolbar's total-notes text).
- `SavedConstellation.sky.y/rotation/scale` keep being written by the existing index-based formula at save time (unchanged formula) — the spec only asks that `x` stop being stored. Unconnected notes have no stored record, so their vertical scatter is computed on the fly from a hash of their `pageId`, matching §1's "seeded from the item's id" for the case that doesn't already have stored data.

---

## Task 1: Timeline math module

**Files:**
- Create: `apps/knowledge/src/stars/timeline.ts`
- Test: `apps/knowledge/src/stars/timeline.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  MONTH_WIDTH_PX,
  clampMonthIndex,
  currentMonthIndex,
  dateFromMonthIndex,
  formatMonthIndex,
  monthIndexForRatio,
  monthIndexFromDate,
  monthIndexFromIso,
  monthDeltaForPixels,
  ratioForMonthIndex,
  screenXForMonth,
  stepInertia,
} from "./timeline";

describe("Stars timeline math", () => {
  it("converts dates to a continuous month index and back", () => {
    expect(monthIndexFromDate(new Date(Date.UTC(2000, 0, 15)))).toBe(0);
    expect(monthIndexFromDate(new Date(Date.UTC(2001, 0, 15)))).toBe(12);
    expect(monthIndexFromDate(new Date(Date.UTC(1999, 11, 15)))).toBe(-1);
    const roundTrip = dateFromMonthIndex(monthIndexFromDate(new Date(Date.UTC(2026, 8, 15))));
    expect(roundTrip.getUTCFullYear()).toBe(2026);
    expect(roundTrip.getUTCMonth()).toBe(8);
  });

  it("parses ISO strings and rejects missing/invalid ones", () => {
    expect(monthIndexFromIso("2026-09-15T00:00:00.000Z")).toBe(monthIndexFromDate(new Date("2026-09-15T00:00:00.000Z")));
    expect(monthIndexFromIso(undefined)).toBeNull();
    expect(monthIndexFromIso("")).toBeNull();
    expect(monthIndexFromIso("not-a-date")).toBeNull();
  });

  it("reports the current month index against a supplied clock", () => {
    expect(currentMonthIndex(new Date(Date.UTC(2026, 8, 1)))).toBe(monthIndexFromDate(new Date(Date.UTC(2026, 8, 1))));
  });

  it("formats a month index as a short human label", () => {
    expect(formatMonthIndex(monthIndexFromDate(new Date(Date.UTC(2026, 8, 1))))).toBe("Sep 2026");
  });

  it("clamps to a range, tolerating an inverted range", () => {
    expect(clampMonthIndex(50, 0, 10)).toBe(10);
    expect(clampMonthIndex(-5, 0, 10)).toBe(0);
    expect(clampMonthIndex(5, 0, 10)).toBe(5);
    expect(clampMonthIndex(5, 10, 0)).toBe(10);
  });

  it("maps month index to screen x centered on the camera", () => {
    expect(screenXForMonth(0, 0, 1000, MONTH_WIDTH_PX)).toBe(500);
    expect(screenXForMonth(1, 0, 1000, MONTH_WIDTH_PX)).toBe(500 + MONTH_WIDTH_PX);
    expect(screenXForMonth(-1, 0, 1000, MONTH_WIDTH_PX)).toBe(500 - MONTH_WIDTH_PX);
  });

  it("converts a pixel drag delta into a month delta", () => {
    expect(monthDeltaForPixels(MONTH_WIDTH_PX, MONTH_WIDTH_PX)).toBe(1);
    expect(monthDeltaForPixels(-MONTH_WIDTH_PX * 2, MONTH_WIDTH_PX)).toBe(-2);
  });

  it("decays inertia to exactly zero below the minimum velocity", () => {
    let velocity = 1;
    let steps = 0;
    while (velocity !== 0 && steps < 500) {
      velocity = stepInertia(velocity, 0.9, 0.01);
      steps += 1;
    }
    expect(velocity).toBe(0);
    expect(steps).toBeGreaterThan(1);
  });

  it("maps a month index to a slider ratio and back", () => {
    expect(ratioForMonthIndex(5, 0, 10)).toBeCloseTo(0.5, 5);
    expect(ratioForMonthIndex(-5, 0, 10)).toBe(0);
    expect(ratioForMonthIndex(15, 0, 10)).toBe(1);
    expect(monthIndexForRatio(0.5, 0, 10)).toBeCloseTo(5, 5);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/knowledge && npx vitest run src/stars/timeline.test.ts`
Expected: FAIL — `Cannot find module './timeline'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```ts
// apps/knowledge/src/stars/timeline.ts
export const MONTH_WIDTH_PX = 240;
const EPOCH_YEAR = 2000;

export function monthIndexFromParts(year: number, month: number): number {
  return (year - EPOCH_YEAR) * 12 + month;
}

export function monthIndexFromDate(date: Date): number {
  return monthIndexFromParts(date.getUTCFullYear(), date.getUTCMonth());
}

export function monthIndexFromIso(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return monthIndexFromDate(date);
}

export function dateFromMonthIndex(monthIndex: number): Date {
  const year = EPOCH_YEAR + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12;
  return new Date(Date.UTC(year, month, 1, 12));
}

export function currentMonthIndex(now: Date = new Date()): number {
  return monthIndexFromDate(now);
}

export function formatMonthIndex(monthIndex: number): string {
  return dateFromMonthIndex(monthIndex).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function clampMonthIndex(value: number, min: number, max: number): number {
  if (min > max) return min;
  return Math.max(min, Math.min(max, value));
}

export function screenXForMonth(
  monthIndex: number,
  centerMonthIndex: number,
  viewportWidth: number,
  monthWidth: number = MONTH_WIDTH_PX,
): number {
  return viewportWidth / 2 + (monthIndex - centerMonthIndex) * monthWidth;
}

export function monthDeltaForPixels(deltaPx: number, monthWidth: number = MONTH_WIDTH_PX): number {
  return deltaPx / monthWidth;
}

export function stepInertia(velocity: number, friction: number, minVelocity: number): number {
  const next = velocity * friction;
  return Math.abs(next) < minVelocity ? 0 : next;
}

export function ratioForMonthIndex(value: number, min: number, max: number): number {
  const span = Math.max(1, max - min);
  return Math.max(0, Math.min(1, (value - min) / span));
}

export function monthIndexForRatio(ratio: number, min: number, max: number): number {
  return min + Math.max(0, Math.min(1, ratio)) * (max - min);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/knowledge && npx vitest run src/stars/timeline.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/knowledge/src/stars/timeline.ts apps/knowledge/src/stars/timeline.test.ts
git commit -m "feat(stars): add timeline math for the night-sky panorama"
```

---

## Task 2: Month-bucket index for notes and constellations

**Files:**
- Create: `apps/knowledge/src/stars/skyIndex.ts`
- Test: `apps/knowledge/src/stars/skyIndex.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/knowledge/src/stars/skyIndex.test.ts
import { describe, expect, it } from "vitest";
import { buildSkyIndex, skyIndexRange, unconnectedEntries } from "./skyIndex";
import type { PageManifestEntry } from "../domain/page";
import type { SavedConstellation } from "./schema";
import { monthIndexFromIso } from "./timeline";

function entry(id: string, createdAt?: string): PageManifestEntry {
  return { id, title: id, area: "notes", tags: [], excerpt: "", created_at: createdAt };
}

function constellation(id: string, createdAt: string, noteIds: string[]): SavedConstellation {
  const notes = noteIds.map(pageId => ({ pageId, title: pageId, excerpt: "", role: "role" }));
  return {
    version: 1,
    query: id,
    title: id,
    symbol: { templateId: "spiral", label: "Spiral", meaning: "meaning" },
    notes,
    relations: [{ sourceId: noteIds[0]!, targetId: noteIds[1]!, type: "extends", explanation: "x" }],
    synthesis: { summary: "s", claims: [{ text: "c", sourceIds: [noteIds[0]!] }], tensions: [], gaps: [] },
    id,
    createdAt,
    updatedAt: createdAt,
    sky: { y: 0.5, rotation: 0, scale: 1 },
  };
}

describe("unconnectedEntries", () => {
  it("excludes entries referenced by any saved constellation", () => {
    const entries = [entry("a"), entry("b"), entry("c")];
    const saved = [constellation("stars_1", "2026-01-01T00:00:00.000Z", ["a", "b"])];
    expect(unconnectedEntries(entries, saved).map(item => item.id)).toEqual(["c"]);
  });
});

describe("buildSkyIndex", () => {
  it("buckets unconnected notes and constellations by their creation month", () => {
    const entries = [entry("a", "2026-01-10T00:00:00.000Z"), entry("b", "2026-01-20T00:00:00.000Z"), entry("c", "2026-03-01T00:00:00.000Z")];
    const saved = [constellation("stars_1", "2026-03-05T00:00:00.000Z", ["c"])];
    const index = buildSkyIndex(entries, saved);
    const januaryIndex = monthIndexFromIso("2026-01-10T00:00:00.000Z")!;
    const marchIndex = monthIndexFromIso("2026-03-05T00:00:00.000Z")!;
    expect(index.get(januaryIndex)?.notes).toHaveLength(2);
    expect(index.get(marchIndex)?.constellations).toHaveLength(1);
    expect(index.get(marchIndex)?.notes).toHaveLength(0);
  });

  it("skips entries with no usable creation date", () => {
    const entries = [entry("a", undefined), entry("b", "not-a-date")];
    const index = buildSkyIndex(entries, []);
    expect(index.size).toBe(0);
  });
});

describe("skyIndexRange", () => {
  it("spans from the earliest bucket to the latest, including the fallback month", () => {
    const entries = [entry("a", "2020-01-01T00:00:00.000Z")];
    const index = buildSkyIndex(entries, []);
    const fallback = monthIndexFromIso("2026-09-15T00:00:00.000Z")!;
    const range = skyIndexRange(index, fallback);
    expect(range.min).toBe(monthIndexFromIso("2020-01-01T00:00:00.000Z"));
    expect(range.max).toBe(fallback);
  });

  it("falls back to a year before the given month when the index is empty", () => {
    const fallback = monthIndexFromIso("2026-09-15T00:00:00.000Z")!;
    const range = skyIndexRange(new Map(), fallback);
    expect(range).toEqual({ min: fallback - 12, max: fallback });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/knowledge && npx vitest run src/stars/skyIndex.test.ts`
Expected: FAIL — `Cannot find module './skyIndex'`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/knowledge/src/stars/skyIndex.ts
import type { PageManifestEntry } from "../domain/page";
import type { SavedConstellation } from "./schema";
import { monthIndexFromIso } from "./timeline";

export type PanoramaNote = { pageId: string; title: string; monthIndex: number };

export type MonthBucket = {
  monthIndex: number;
  notes: PanoramaNote[];
  constellations: SavedConstellation[];
};

export function unconnectedEntries(entries: PageManifestEntry[], saved: SavedConstellation[]): PageManifestEntry[] {
  const connected = new Set(saved.flatMap(item => item.notes.map(note => note.pageId)));
  return entries.filter(entry => !connected.has(entry.id));
}

export function buildSkyIndex(entries: PageManifestEntry[], saved: SavedConstellation[]): Map<number, MonthBucket> {
  const buckets = new Map<number, MonthBucket>();
  function bucketFor(monthIndex: number): MonthBucket {
    let bucket = buckets.get(monthIndex);
    if (!bucket) {
      bucket = { monthIndex, notes: [], constellations: [] };
      buckets.set(monthIndex, bucket);
    }
    return bucket;
  }
  for (const entry of unconnectedEntries(entries, saved)) {
    const monthIndex = monthIndexFromIso(entry.created_at);
    if (monthIndex === null) continue;
    bucketFor(monthIndex).notes.push({ pageId: entry.id, title: entry.title, monthIndex });
  }
  for (const item of saved) {
    const monthIndex = monthIndexFromIso(item.createdAt);
    if (monthIndex === null) continue;
    bucketFor(monthIndex).constellations.push(item);
  }
  return buckets;
}

export function skyIndexRange(index: Map<number, MonthBucket>, fallbackMonthIndex: number): { min: number; max: number } {
  if (index.size === 0) return { min: fallbackMonthIndex - 12, max: fallbackMonthIndex };
  const keys = [...index.keys()];
  return { min: Math.min(...keys, fallbackMonthIndex), max: Math.max(...keys, fallbackMonthIndex) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/knowledge && npx vitest run src/stars/skyIndex.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/knowledge/src/stars/skyIndex.ts apps/knowledge/src/stars/skyIndex.test.ts
git commit -m "feat(stars): bucket notes and constellations by creation month"
```

---

## Task 3: Make `sky.x` optional in the schema (stop relying on stored x)

**Files:**
- Modify: `apps/knowledge/src/stars/schema.ts:107-118`
- Test: `apps/knowledge/src/stars/schema.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the end of `apps/knowledge/src/stars/schema.test.ts` (new `describe` block, keep the existing `describe("Stars proposal schema", ...)` above it untouched):

```ts
import { SavedConstellationSchema } from "./schema";

function savedConstellation(sky: Record<string, unknown>) {
  const base = proposal();
  return {
    ...base,
    id: "stars_abc123",
    createdAt: "2026-09-11T10:00:00.000Z",
    updatedAt: "2026-09-11T10:00:00.000Z",
    sky,
  };
}

describe("SavedConstellation sky placement", () => {
  it("accepts a sky object with no x (position is now derived from createdAt)", () => {
    const result = SavedConstellationSchema.safeParse(savedConstellation({ y: 0.5, rotation: 0.2, scale: 1 }));
    expect(result.success).toBe(true);
  });

  it("still accepts legacy saved data that has an x field, ignoring it", () => {
    const result = SavedConstellationSchema.safeParse(savedConstellation({ x: 0.4, y: 0.5, rotation: 0.2, scale: 1 }));
    expect(result.success).toBe(true);
  });

  it("still requires y within its historical bounds", () => {
    const result = SavedConstellationSchema.safeParse(savedConstellation({ y: 5, rotation: 0.2, scale: 1 }));
    expect(result.success).toBe(false);
  });
});
```

(Add the `import { SavedConstellationSchema } from "./schema";` line to the existing top-of-file import block instead of inline if the file already imports from `"./schema"` — check first with `grep -n "^import" apps/knowledge/src/stars/schema.test.ts`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/knowledge && npx vitest run src/stars/schema.test.ts`
Expected: FAIL — current schema requires `x` (`z.number().min(0.08).max(0.92)` with no `.optional()`), so the first new test fails.

- [ ] **Step 3: Update the schema**

In `apps/knowledge/src/stars/schema.ts`, change the `sky` field on `SavedConstellationSchema` (around line 111-116):

```ts
  sky: z.object({
    x: z.number().min(0).max(1).optional(),
    y: z.number().min(0.12).max(0.84),
    rotation: z.number(),
    scale: z.number().min(0.7).max(1.3),
  }),
```

(Only the `x` line changes — it gains `.optional()` and a wider `min(0).max(1)` so legacy stored values still parse; `y`, `rotation`, `scale` are unchanged.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/knowledge && npx vitest run src/stars/schema.test.ts`
Expected: PASS (all existing tests plus the 3 new ones).

- [ ] **Step 5: Commit**

```bash
git add apps/knowledge/src/stars/schema.ts apps/knowledge/src/stars/schema.test.ts
git commit -m "feat(stars): make sky.x optional, position is derived from createdAt"
```

---

## Task 4: Stop writing `sky.x` on save (frontend local store + Netlify function)

**Files:**
- Modify: `apps/knowledge/src/stars/client.ts:41-50`
- Modify: `netlify/functions/_shared/knowledge-stars.mjs:137-146`
- Modify: `tests/unit/knowledge-stars.test.js:61`

- [ ] **Step 1: Update the frontend local-store placement**

In `apps/knowledge/src/stars/client.ts`, replace `localPlacement` (lines 41-50):

```ts
function localPlacement(index: number) {
  const angle = index * 2.399963229728653;
  const ring = 0.16 + (index % 5) * 0.055;
  return {
    y: Math.max(0.12, Math.min(0.84, 0.48 + Math.sin(angle) * ring)),
    rotation: ((index * 37) % 360) * Math.PI / 180,
    scale: 0.82 + (index % 4) * 0.1,
  };
}
```

- [ ] **Step 2: Update the Netlify persistence function**

In `netlify/functions/_shared/knowledge-stars.mjs`, replace `skyPlacement` (lines 137-146):

```js
function skyPlacement(index) {
  const angle = index * 2.399963229728653;
  const ring = 0.16 + (index % 5) * 0.055;
  return {
    y: Math.max(0.12, Math.min(0.84, 0.48 + Math.sin(angle) * ring)),
    rotation: ((index * 37) % 360) * Math.PI / 180,
    scale: 0.82 + (index % 4) * 0.1
  };
}
```

- [ ] **Step 3: Update the existing test that asserts on `sky.x`**

In `tests/unit/knowledge-stars.test.js`, in the `'Stars persistence stores one approved object...'` test, replace line 61:

```diff
-  assert.ok(saved.sky.x >= 0.08 && saved.sky.x <= 0.92);
+  assert.ok(saved.sky.y >= 0.12 && saved.sky.y <= 0.84);
```

- [ ] **Step 4: Run both affected test suites**

Run: `cd apps/knowledge && npx vitest run src/stars` (expect all Stars unit tests still passing — nothing here has its own new test, this task is a direct behavioral change covered by Task 3's schema tests plus this Netlify test)
Run: `node --test tests/unit/knowledge-stars.test.js` (from the repo root)
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/knowledge/src/stars/client.ts netlify/functions/_shared/knowledge-stars.mjs tests/unit/knowledge-stars.test.js
git commit -m "feat(stars): stop writing an unused sky.x on save"
```

---

## Task 5: Trim `canvas.ts` to shared drawing primitives, add a test for its seeded RNG

The current `mountStarsSky`, `annualSkyRotation`, `rotatePoint`, `miniSymbol`, and the `SkyCamera`/zoom constants are being replaced wholesale by the new `panorama.ts` in Task 6. `mountStarsSymbol` (used by the proposal/detail screens) is untouched. This task removes the now-dead code and exports the primitives `panorama.ts` will need.

**Files:**
- Modify: `apps/knowledge/src/stars/canvas.ts`
- Modify: `apps/knowledge/src/stars/canvas.test.ts`

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `apps/knowledge/src/stars/canvas.test.ts` (its only test targets `annualSkyRotation`, which this task removes):

```ts
import { describe, expect, it } from "vitest";
import { random, seedOf } from "./canvas";

describe("Stars canvas seeding", () => {
  it("produces an identical sequence for the same seed", () => {
    const genA = random(seedOf("stars_example"));
    const genB = random(seedOf("stars_example"));
    expect([genA(), genA(), genA()]).toEqual([genB(), genB(), genB()]);
  });

  it("produces a different first value for a different seed", () => {
    const genA = random(seedOf("stars_one"));
    const genB = random(seedOf("stars_two"));
    expect(genA()).not.toBeCloseTo(genB(), 6);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/knowledge && npx vitest run src/stars/canvas.test.ts`
Expected: FAIL — `seedOf` and `random` are not currently exported from `canvas.ts`.

- [ ] **Step 3: Trim and export from canvas.ts**

In `apps/knowledge/src/stars/canvas.ts`:

1. Add `export` to the `seedOf` and `random` function declarations (lines 10 and 16).
2. Delete these now-unused exports/declarations entirely, along with anything that only exists to support them:
   - `mountStarsSky` (lines 425-635, the whole function)
   - `annualSkyRotation` (lines 392-397)
   - `rotatePoint` (lines 399-406)
   - `miniSymbol` (lines 408-417)
   - `SKY_MIN_SCALE`, `SKY_MAX_SCALE`, `SKY_ZOOM_STEP`, `SkyCamera` (lines 419-423)
3. Keep everything else (`configureCanvas`, `css`, `prefersReducedMotion`, `STAR_TINTS`, `pickTint`, `DustStar`, `buildDust`, `drawDust`, `drawNebula`, `drawMilkyWay`, `drawVignette`, `ShootingStar`, `drawShootingStars`, `stepShootingStars`, `Ripple`, `stepRipples`, `drawRipples`, `revealDelay`, `relationForSegment`, `bindParallax`, `mountStarsSymbol`) exactly as-is, and add `export` to any of these that aren't already exported but that `panorama.ts` will need in Task 6: `configureCanvas`, `css`, `prefersReducedMotion`, `DustStar` (type), `buildDust`, `drawDust`, `drawNebula`, `drawMilkyWay`, `drawVignette`, `ShootingStar` (type), `drawShootingStars`, `stepShootingStars`, `Ripple` (type), `stepRipples`, `drawRipples`, `bindParallax`.

- [ ] **Step 4: Run the tests and typecheck**

Run: `cd apps/knowledge && npx vitest run src/stars/canvas.test.ts`
Expected: PASS (2 tests).

Run: `cd apps/knowledge && npx tsc --noEmit -p . 2>&1 | grep "stars/" || true`
Expected: no new errors referencing files under `stars/` other than `view.ts` (which still imports the now-deleted `mountStarsSky` — that's expected and gets fixed in Task 8; ignore it for this task).

- [ ] **Step 5: Commit**

```bash
git add apps/knowledge/src/stars/canvas.ts apps/knowledge/src/stars/canvas.test.ts
git commit -m "refactor(stars): trim canvas.ts to shared drawing primitives"
```

---

## Task 6: New panorama renderer

This is the core rendering module. Its visual output isn't unit-testable (consistent with the pre-existing `mountStarsSky`/`mountStarsSymbol`, which were never unit tested either — only their pure helper functions were, which is why Tasks 1 and 2 exist). This task is verified by a manual check in the running app (Task 9) rather than an automated test.

**Files:**
- Create: `apps/knowledge/src/stars/panorama.ts`

- [ ] **Step 1: Write the implementation**

```ts
// apps/knowledge/src/stars/panorama.ts
import { buildStarsLayout } from "./templates";
import { createStarPopover } from "./popover";
import type { PageManifestEntry } from "../domain/page";
import type { SavedConstellation } from "./schema";
import {
  bindParallax,
  buildDust,
  configureCanvas,
  css,
  drawDust,
  drawMilkyWay,
  drawNebula,
  drawRipples,
  drawShootingStars,
  drawVignette,
  prefersReducedMotion,
  random,
  seedOf,
  stepRipples,
  stepShootingStars,
  type DustStar,
  type Ripple,
  type ShootingStar,
} from "./canvas";
import { buildSkyIndex, skyIndexRange, type MonthBucket } from "./skyIndex";
import { MONTH_WIDTH_PX, clampMonthIndex, monthDeltaForPixels, screenXForMonth, stepInertia } from "./timeline";

const RESOLVED_BUFFER_MONTHS = 1.5;
const FRICTION = 0.94;
const MIN_VELOCITY = 0.0005;

type ResolvedItem = {
  kind: "constellation" | "note";
  id: string;
  title: string;
  screenX: number;
  screenY: number;
  constellation?: SavedConstellation;
};

export type PanoramaHandlers = {
  onSelectConstellation: (item: SavedConstellation) => void;
  onCenterChange?: (monthIndex: number) => void;
};

export type PanoramaController = {
  setCenterMonthIndex(monthIndex: number): void;
  getCenterMonthIndex(): number;
  destroy(): void;
};

function noteY(pageId: string): number {
  return 0.12 + random(seedOf(pageId))() * 0.72;
}

function drawGlyph(context: CanvasRenderingContext2D, item: SavedConstellation, cx: number, cy: number, goldColor: string) {
  const layout = buildStarsLayout(item.symbol.templateId, item.notes.length);
  const radius = 26 * item.sky.scale;
  const cos = Math.cos(item.sky.rotation);
  const sin = Math.sin(item.sky.rotation);
  const point = (index: number) => {
    const p = layout.points[index]!;
    const dx = (p.x - 0.5) * radius * 2;
    const dy = (p.y - 0.5) * radius * 2;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  };
  context.save();
  context.strokeStyle = goldColor;
  context.lineWidth = 1.1;
  layout.segments.forEach(segment => {
    const sourceId = item.notes[segment.source]?.pageId;
    const targetId = item.notes[segment.target]?.pageId;
    const relation = item.relations.find(candidate =>
      (candidate.sourceId === sourceId && candidate.targetId === targetId) ||
      (candidate.sourceId === targetId && candidate.targetId === sourceId));
    if (!relation) return;
    context.globalAlpha = 0.85;
    context.setLineDash(["complicates", "contrasts"].includes(relation.type) ? [4, 4] : []);
    const start = point(segment.source);
    const end = point(segment.target);
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  });
  context.setLineDash([]);
  context.fillStyle = "#ffffff";
  layout.points.forEach((_, index) => {
    const p = point(index);
    context.globalAlpha = 0.95;
    context.beginPath();
    context.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
    context.fill();
  });
  context.restore();
}

function drawHaze(context: CanvasRenderingContext2D, x: number, y: number, count: number, color: string) {
  const radius = Math.min(70, 18 + count * 6);
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "transparent");
  context.save();
  context.globalCompositeOperation = "lighter";
  context.globalAlpha = Math.min(0.5, 0.12 + count * 0.05);
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

export function mountStarsPanorama(
  host: HTMLElement,
  constellations: SavedConstellation[],
  entries: PageManifestEntry[],
  initialMonthIndex: number,
  handlers: PanoramaHandlers,
): PanoramaController {
  host.innerHTML = `<canvas class="stars-panorama__canvas" aria-hidden="true"></canvas><div class="stars-panorama__hits"></div>`;
  const canvas = host.querySelector<HTMLCanvasElement>("canvas")!;
  const hitLayer = host.querySelector<HTMLElement>(".stars-panorama__hits")!;
  const reduced = prefersReducedMotion();
  const popover = createStarPopover(host);
  const parallax = bindParallax(host, reduced);
  const skyIndex = buildSkyIndex(entries, constellations);
  const shootSeed = random(seedOf(`panorama-${initialMonthIndex}`));

  let stopped = false;
  let raf = 0;
  let size = { width: 0, height: 0 };
  let dust: DustStar[] = [];
  let colors = { onDark: "white", gold: "white" };
  let shootingStars: ShootingStar[] = [];
  let ripples: Ripple[] = [];
  let center = initialMonthIndex;
  let velocity = 0;
  let dragging = false;
  let dragLast = 0;

  function bounds() {
    return skyIndexRange(skyIndex, initialMonthIndex);
  }

  function setCenter(next: number) {
    const { min, max } = bounds();
    center = clampMonthIndex(next, min - 2, max + 2);
    handlers.onCenterChange?.(center);
  }

  function resolvedItems(): ResolvedItem[] {
    const items: ResolvedItem[] = [];
    for (const bucket of skyIndex.values()) {
      if (Math.abs(bucket.monthIndex - center) > RESOLVED_BUFFER_MONTHS) continue;
      const screenX = screenXForMonth(bucket.monthIndex, center, size.width);
      for (const note of bucket.notes) {
        items.push({ kind: "note", id: note.pageId, title: note.title, screenX, screenY: noteY(note.pageId) * size.height });
      }
      for (const item of bucket.constellations) {
        items.push({ kind: "constellation", id: item.id, title: item.title, screenX, screenY: item.sky.y * size.height, constellation: item });
      }
    }
    return items;
  }

  function hazeBuckets(): MonthBucket[] {
    return [...skyIndex.values()].filter(bucket => Math.abs(bucket.monthIndex - center) > RESOLVED_BUFFER_MONTHS);
  }

  function layoutHits() {
    hitLayer.innerHTML = "";
    for (const item of resolvedItems()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = item.kind === "constellation" ? "stars-panorama__hit is-constellation" : "stars-panorama__hit is-note";
      button.style.left = `${item.screenX}px`;
      button.style.top = `${item.screenY}px`;
      button.setAttribute("aria-label", item.kind === "constellation" ? `Open ${item.title}` : item.title);
      const reveal = () => {
        if (item.kind === "note") popover.showNote({ pageId: item.id, title: item.title, excerpt: "", role: "" }, button);
        else if (item.constellation) popover.showConstellation(item.constellation, button, () => handlers.onSelectConstellation(item.constellation!));
      };
      button.addEventListener("pointerenter", event => { if (event.pointerType === "mouse") reveal(); });
      button.addEventListener("focus", reveal);
      button.addEventListener("pointerleave", () => popover.hideSoon());
      button.addEventListener("blur", () => popover.hideSoon());
      if (item.kind === "constellation") button.onclick = () => handlers.onSelectConstellation(item.constellation!);
      hitLayer.append(button);
    }
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest(".stars-panorama__hit")) return;
    dragging = true;
    velocity = 0;
    dragLast = event.clientX;
    canvas.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: PointerEvent) {
    if (!dragging) return;
    const dx = event.clientX - dragLast;
    dragLast = event.clientX;
    const delta = -monthDeltaForPixels(dx, MONTH_WIDTH_PX);
    setCenter(center + delta);
    velocity = delta;
  }
  function onPointerUp(event: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    try { canvas.releasePointerCapture(event.pointerId); } catch { /* already released */ }
  }
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  const frame = (t: number) => {
    if (stopped) return;
    if (!dragging && Math.abs(velocity) > 0) {
      setCenter(center + velocity);
      velocity = stepInertia(velocity, FRICTION, MIN_VELOCITY);
      layoutHits();
    }
    const context = canvas.getContext("2d")!;
    const { width, height } = size;
    context.clearRect(0, 0, width, height);
    drawNebula(context, width, height, t, 51023, [colors.gold, colors.onDark]);
    drawMilkyWay(context, width, height, t, 61031, colors.onDark);
    parallax.settle();
    drawDust(context, dust, t, parallax.current);
    for (const bucket of hazeBuckets()) {
      const x = screenXForMonth(bucket.monthIndex, center, width);
      if (x < -80 || x > width + 80) continue;
      drawHaze(context, x, height * 0.5, bucket.notes.length + bucket.constellations.length, colors.gold);
    }
    for (const item of resolvedItems()) {
      if (item.kind === "constellation" && item.constellation) {
        drawGlyph(context, item.constellation, item.screenX, item.screenY, colors.gold);
      } else {
        context.save();
        context.globalAlpha = 0.75;
        context.fillStyle = colors.onDark;
        context.beginPath();
        context.arc(item.screenX, item.screenY, 1.6, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    }
    shootingStars = stepShootingStars(shootingStars, width, height, shootSeed, reduced);
    drawShootingStars(context, shootingStars, colors.onDark);
    ripples = stepRipples(ripples);
    drawRipples(context, ripples, colors.gold);
    drawVignette(context, width, height);
    if (!reduced) raf = requestAnimationFrame(frame);
  };

  const layoutAll = () => {
    if (stopped) return;
    const { context, width, height } = configureCanvas(canvas, host.getBoundingClientRect());
    context.clearRect(0, 0, width, height);
    size = { width, height };
    colors = { onDark: css("--on-dark", "white"), gold: css("--pastel-gold", "white") };
    dust = buildDust(934857, width, height, Math.max(220, Math.round((width * height) / 4200)));
    layoutHits();
    if (reduced) frame(0);
  };

  const observer = new ResizeObserver(layoutAll);
  observer.observe(host);
  layoutAll();
  if (!reduced) raf = requestAnimationFrame(frame);

  return {
    setCenterMonthIndex(monthIndex) {
      velocity = 0;
      setCenter(monthIndex);
      layoutHits();
    },
    getCenterMonthIndex() {
      return center;
    },
    destroy() {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      hitLayer.innerHTML = "";
    },
  };
}
```

- [ ] **Step 2: Typecheck the new file in isolation**

Run: `cd apps/knowledge && npx tsc --noEmit -p . 2>&1 | grep "stars/panorama.ts" || echo "no errors in panorama.ts"`
Expected: `no errors in panorama.ts` (errors elsewhere, e.g. in `view.ts` still referencing the deleted `mountStarsSky`, are expected until Task 8).

- [ ] **Step 3: Commit**

```bash
git add apps/knowledge/src/stars/panorama.ts
git commit -m "feat(stars): add the night-sky panorama renderer"
```

---

## Task 7: Rewrite the horizon scrubber as an unbounded slider

**Files:**
- Modify: `apps/knowledge/src/stars/horizon.ts` (full rewrite)

- [ ] **Step 1: Replace the file**

```ts
// apps/knowledge/src/stars/horizon.ts
import { formatMonthIndex, monthIndexForRatio, ratioForMonthIndex } from "./timeline";

export type HorizonArc = {
  setMonthIndex(monthIndex: number): void;
  destroy(): void;
};

export function mountHorizonArc(
  host: HTMLElement,
  options: {
    monthIndex: number;
    minMonthIndex: number;
    maxMonthIndex: number;
    onChange: (monthIndex: number) => void;
    onCommit?: (monthIndex: number) => void;
  },
): HorizonArc {
  let monthIndex = options.monthIndex;
  const { minMonthIndex, maxMonthIndex } = options;

  host.innerHTML = `
    <div class="stars-horizon__track">
      <div class="stars-horizon__ticks"></div>
    </div>
    <button type="button" class="stars-horizon__marker" role="slider" aria-label="Sky position"
      aria-valuemin="${minMonthIndex}" aria-valuemax="${maxMonthIndex}"><span></span></button>
    <output class="stars-horizon__label"></output>
  `;

  const track = host.querySelector<HTMLElement>(".stars-horizon__track")!;
  const ticksLayer = host.querySelector<HTMLElement>(".stars-horizon__ticks")!;
  const marker = host.querySelector<HTMLButtonElement>(".stars-horizon__marker")!;
  const label = host.querySelector<HTMLOutputElement>(".stars-horizon__label")!;

  function ratioFor(value: number) {
    return ratioForMonthIndex(value, minMonthIndex, maxMonthIndex);
  }

  for (let year = Math.ceil(minMonthIndex / 12) * 12; year <= maxMonthIndex; year += 12) {
    const tick = document.createElement("span");
    tick.className = "stars-horizon__tick";
    tick.style.left = `${ratioFor(year) * 100}%`;
    tick.textContent = formatMonthIndex(year).split(" ")[1] ?? "";
    ticksLayer.append(tick);
  }

  function place(value: number) {
    const ratio = ratioFor(value);
    marker.style.left = `${ratio * 100}%`;
    marker.setAttribute("aria-valuenow", String(value));
    marker.setAttribute("aria-valuetext", formatMonthIndex(value));
    label.textContent = formatMonthIndex(value);
  }

  function valueFromClientX(clientX: number) {
    const rect = track.getBoundingClientRect();
    if (rect.width === 0) return monthIndex;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return monthIndexForRatio(ratio, minMonthIndex, maxMonthIndex);
  }

  let dragging = false;
  function onMove(event: PointerEvent) {
    if (!dragging) return;
    const value = valueFromClientX(event.clientX);
    place(value);
    options.onChange(value);
  }
  function onUp(event: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    marker.classList.remove("is-dragging");
    monthIndex = Math.round(valueFromClientX(event.clientX));
    place(monthIndex);
    options.onCommit?.(monthIndex);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  }
  function onDown(event: PointerEvent) {
    dragging = true;
    marker.classList.add("is-dragging");
    onMove(event);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  marker.addEventListener("pointerdown", onDown);
  track.addEventListener("pointerdown", onDown);

  function commitStep(delta: number) {
    monthIndex = Math.max(minMonthIndex, Math.min(maxMonthIndex, monthIndex + delta));
    place(monthIndex);
    options.onChange(monthIndex);
    options.onCommit?.(monthIndex);
  }
  function onKey(event: KeyboardEvent) {
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      commitStep(1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      commitStep(-1);
    }
  }
  marker.addEventListener("keydown", onKey);

  place(monthIndex);

  return {
    setMonthIndex(next) {
      monthIndex = Math.max(minMonthIndex, Math.min(maxMonthIndex, next));
      place(monthIndex);
    },
    destroy() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      host.innerHTML = "";
    },
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/knowledge && npx tsc --noEmit -p . 2>&1 | grep "stars/horizon.ts" || echo "no errors in horizon.ts"`
Expected: `no errors in horizon.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/knowledge/src/stars/horizon.ts
git commit -m "feat(stars): rewrite horizon scrubber as an unbounded month slider"
```

---

## Task 8: Wire `view.ts` to the panorama and the new horizon

**Files:**
- Modify: `apps/knowledge/src/stars/view.ts`

- [ ] **Step 1: Update imports**

Replace:

```ts
import { mountStarsSky, mountStarsSymbol } from "./canvas";
import { mountHorizonArc, type HorizonArc } from "./horizon";
```

with:

```ts
import { mountStarsSymbol } from "./canvas";
import { mountStarsPanorama, type PanoramaController } from "./panorama";
import { mountHorizonArc, type HorizonArc } from "./horizon";
import { buildSkyIndex, skyIndexRange } from "./skyIndex";
import { currentMonthIndex } from "./timeline";
```

- [ ] **Step 2: Replace `month`/`year` state with `centerMonthIndex`, and drop the old "GraphExitMode" `dateFor`/zoom helpers**

Replace:

```ts
  let month = new Date().getMonth();
  let year = new Date().getFullYear();
  let fullscreen = false;
  let canvasTeardown: (() => void) | null = null;
  let horizonArc: HorizonArc | null = null;
  let stopped = false;
```

with:

```ts
  let centerMonthIndex = currentMonthIndex();
  let fullscreen = false;
  let canvasTeardown: (() => void) | null = null;
  let panoramaController: PanoramaController | null = null;
  let horizonArc: HorizonArc | null = null;
  let stopped = false;
```

- [ ] **Step 3: Replace `renderSky()`**

Replace the entire `function renderSky() { ... }` body (from `function renderSky() {` through its closing `}` — everything currently between `const dateFor = ...` and the final `setFullscreen(fullscreen);`) with:

```ts
  function renderSky() {
    const totalNotes = options.entries.length;
    const meta = saved.length
      ? `${saved.length} constellation${saved.length === 1 ? "" : "s"} charted · ${totalNotes} note${totalNotes === 1 ? "" : "s"} in your archive`
      : `${totalNotes} note${totalNotes === 1 ? "" : "s"} waiting to be connected`;
    renderShell(`<div class="stars-sky-wrap" data-stars-sky-wrap>
      <div class="stars-sky-toolbar glass-panel">
        <div><p class="eyebrow">Stars</p><h2>Night sky</h2><p class="stars-sky-toolbar__meta" data-stars-meta>${escapeHtml(meta)}</p></div>
        <form class="stars-search" data-stars-search>
          <label class="sr-only" for="stars-query">Topic or question</label>
          <input id="stars-query" type="search" value="${escapeHtml(query)}" placeholder="What should Clementine connect?" autocomplete="off" required />
          <button type="submit" class="btn btn--primary">Find notes</button>
        </form>
        <button type="button" class="btn btn--ghost stars-fullscreen-btn" data-stars-fullscreen aria-pressed="false">Full screen</button>
      </div>
      ${error ? `<p class="stars-error" role="alert">${escapeHtml(error)}</p>` : ""}
      <section class="stars-sky" data-stars-sky aria-label="Night sky: saved constellations and notes"></section>
      <div class="stars-horizon-row">
        <div class="stars-horizon glass-panel" data-stars-horizon aria-label="Sky position, drag to travel through time"></div>
      </div>
      <button type="button" class="stars-fullscreen-exit btn btn--ghost" data-stars-exit-fullscreen hidden>Exit full screen</button>
    </div>`);
    const sky = host.querySelector<HTMLElement>("[data-stars-sky]")!;

    if (!saved.length && !options.entries.length) {
      sky.insertAdjacentHTML("beforeend", `<div class="stars-empty"><span aria-hidden="true">✦</span><h3>Your sky has no constellations yet</h3><p>Search a topic. Clementine will find the strongest notes, connect them, and propose a synthesis for you to approve.</p></div>`);
    }

    panoramaController = mountStarsPanorama(sky, saved, options.entries, centerMonthIndex, {
      onSelectConstellation: item => {
        selected = item;
        selectedNote = item.notes[0] ?? null;
        selectedRelation = item.relations.find(relation => relation.sourceId === selectedNote?.pageId || relation.targetId === selectedNote?.pageId);
        screen = "detail";
        render();
      },
      onCenterChange: next => {
        centerMonthIndex = next;
        horizonArc?.setMonthIndex(next);
      },
    });
    canvasTeardown = () => panoramaController?.destroy();

    host.querySelector<HTMLFormElement>("[data-stars-search]")!.onsubmit = event => {
      event.preventDefault();
      const input = host.querySelector<HTMLInputElement>("#stars-query");
      void create(input?.value ?? "");
    };

    const skyIndex = buildSkyIndex(options.entries, saved);
    const range = skyIndexRange(skyIndex, currentMonthIndex());
    teardownHorizon();
    const horizonHost = host.querySelector<HTMLElement>("[data-stars-horizon]")!;
    horizonArc = mountHorizonArc(horizonHost, {
      monthIndex: centerMonthIndex,
      minMonthIndex: range.min - 2,
      maxMonthIndex: range.max + 2,
      onChange: next => {
        centerMonthIndex = next;
        panoramaController?.setCenterMonthIndex(next);
      },
      onCommit: next => { centerMonthIndex = next; },
    });

    host.querySelectorAll<HTMLButtonElement>("[data-stars-fullscreen]").forEach(button => {
      button.onclick = () => setFullscreen(!fullscreen);
    });
    host.querySelector<HTMLButtonElement>("[data-stars-exit-fullscreen]")!.onclick = () => setFullscreen(false);
    setFullscreen(fullscreen);
  }
```

Note what this removes relative to the old version: the `dateFor` helper, the `mountSky(m)`/`mountedMonth` remount-per-tick pattern, the `stars-horizon-year` prev/next year buttons and their click handlers, and the discrete `month`/`year` state — all superseded by the continuous `centerMonthIndex` plus the panorama's own drag/inertia camera.

- [ ] **Step 4: Typecheck and run the existing unit tests**

Run: `cd apps/knowledge && npx tsc --noEmit -p . 2>&1 | grep "stars/" || echo "no stars/ errors"`
Expected: `no stars/ errors`.

Run: `cd apps/knowledge && npx vitest run src/stars`
Expected: PASS (every test file under `src/stars`).

- [ ] **Step 5: Commit**

```bash
git add apps/knowledge/src/stars/view.ts
git commit -m "feat(stars): wire the night sky screen to the new panorama and horizon"
```

---

## Task 9: Visual chrome — full-bleed glass HUD, panorama hit-target and horizon-slider CSS

**Files:**
- Modify: `apps/knowledge/src/style.css`

- [ ] **Step 1: Remove CSS for controls that no longer exist**

Using `grep -n` to find each selector's rule block in `apps/knowledge/src/style.css`, delete the full rule body for each of the following (they belonged to the removed sky-zoom buttons, the removed year prev/next buttons, and the removed fixed 12-tick arc):

- `.stars-sky-zoom`, `.stars-sky-zoom .btn`, `.stars-sky-zoom .btn:hover:not(:disabled)`, `.stars-sky-zoom .btn + .btn`
- `.stars-sky-object`, `.stars-sky-object svg`, `.stars-sky-object line`, `.stars-sky-object circle`, `.stars-sky-object:hover, .stars-sky-object:focus-visible`, `.stars-sky-object:hover circle, .stars-sky-object:focus-visible circle`
- `.stars-horizon-year`
- `.stars-horizon__svg`, `.stars-horizon__track` (old path-based rule — a new `.stars-horizon__track` rule is added in Step 3, don't remove that one twice), `.stars-horizon__glow`
- `.stars-horizon__tick`, `.stars-horizon__tick span`, `.stars-horizon__tick:hover, .stars-horizon__tick:focus-visible`, `.stars-horizon__tick.is-current`
- Any fullscreen-mode variants of the above (search for `.stars-sky-wrap.is-fullscreen .stars-sky-zoom`, `.stars-sky-wrap.is-fullscreen .stars-horizon-year`, `.stars-sky-wrap.is-fullscreen .stars-horizon__tick`)

Verify nothing was missed:

```bash
grep -n "stars-sky-zoom\|stars-sky-object\|stars-horizon-year\|stars-horizon__svg\|stars-horizon__glow\|stars-horizon__tick\b" apps/knowledge/src/style.css
```

Expected: no output (the new `.stars-horizon__tick` rule added in Step 3 uses a different structure — a plain `<span>`, not the old path-relative absolutely-positioned button — so it's fine if this grep is run again after Step 3 and finds the *new* rule; run it now, before Step 3, expecting zero matches).

- [ ] **Step 2: Full-bleed sky wrap and glass HUD toolbar**

Find the existing `.stars-sky-wrap { ... }` rule (around line 4822) and `.stars-sky-toolbar { ... }` rule (there are two — one base layout rule around line 4127 and one visual rule around line 4576; leave the layout one at 4127 alone, it only sets flex/grid layout, not colors). Replace the *visual* `.stars-sky-toolbar` rule (the one near line 4576, which currently gives it a solid light background) and the `.stars-sky-wrap` rule with:

```css
.stars-sky-wrap {
  position: relative;
  height: min(88vh, 920px);
  min-height: 480px;
  border-radius: 20px;
  overflow: hidden;
  background: #030812;
}

.stars-sky-toolbar {
  position: absolute;
  inset: 16px 16px auto 16px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 18px;
  border-radius: 16px;
  background: rgba(6, 12, 24, 0.55);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--on-dark);
}

.stars-sky-toolbar h2,
.stars-sky-toolbar .eyebrow,
.stars-sky-toolbar__meta {
  color: var(--on-dark);
}
```

- [ ] **Step 3: Panorama canvas, hit targets, and horizon slider**

Append to the end of `apps/knowledge/src/style.css`:

```css
.stars-sky {
  position: absolute;
  inset: 0;
}

.stars-panorama__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  touch-action: pan-y;
  cursor: grab;
}

.stars-panorama__canvas:active {
  cursor: grabbing;
}

.stars-panorama__hits {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.stars-panorama__hit {
  position: absolute;
  width: 36px;
  height: 36px;
  margin: -18px 0 0 -18px;
  border: none;
  border-radius: 50%;
  background: transparent;
  padding: 0;
  pointer-events: auto;
  cursor: pointer;
}

.stars-panorama__hit.is-constellation {
  width: 64px;
  height: 64px;
  margin: -32px 0 0 -32px;
}

.stars-panorama__hit:focus-visible {
  outline: 2px solid var(--pastel-gold, #fff2d6);
  outline-offset: 2px;
  border-radius: 50%;
}

.stars-horizon-row {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 16px;
  z-index: 5;
}

.stars-horizon {
  position: relative;
  height: 46px;
  border-radius: 999px;
  background: rgba(6, 12, 24, 0.55);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 0 18px;
}

.stars-horizon__track {
  position: absolute;
  left: 18px;
  right: 18px;
  top: 50%;
  height: 2px;
  background: rgba(255, 255, 255, 0.18);
  transform: translateY(-50%);
}

.stars-horizon__ticks {
  position: absolute;
  inset: 0;
}

.stars-horizon__tick {
  position: absolute;
  top: 10px;
  transform: translateX(-50%);
  font-size: 11px;
  color: var(--on-dark-muted);
}

.stars-horizon__marker {
  position: absolute;
  top: 50%;
  width: 16px;
  height: 16px;
  margin: -8px 0 0 -8px;
  border: none;
  border-radius: 50%;
  background: var(--pastel-gold, #fff2d6);
  cursor: grab;
  box-shadow: 0 0 0 4px rgba(255, 242, 214, 0.18);
}

.stars-horizon__marker.is-dragging {
  cursor: grabbing;
}

.stars-horizon__label {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translate(-50%, -6px);
  font-size: 12px;
  color: var(--on-dark);
  white-space: nowrap;
}

body.is-stars-fullscreen .stars-sky-wrap {
  height: 100vh;
  border-radius: 0;
}
```

- [ ] **Step 4: Manual verification**

Use the `run` skill (or `cd apps/knowledge && npm run dev`) to start the Knowledge Hub dev server against local fixture data, open the Stars view, and confirm:
1. The sky fills most of the viewport with a dark background, floating glass toolbar and horizon pill on top (no solid light bars).
2. Dragging left/right across the sky pans smoothly and keeps drifting briefly after release (inertia), then settles.
3. Dragging the horizon slider pans the sky to match, and dragging the sky moves the slider's marker and label to match.
4. Faint glowing patches ("haze") are visible off to the sides where months have notes but aren't in focus; within the focused band, individual faint note points and full constellation glyphs are visible and clickable/hoverable.
5. Opening the view centers on the current real-world month by default.
6. Clicking a constellation glyph opens its existing detail view unchanged.

Take a screenshot for the record if using the Browser tool.

- [ ] **Step 5: Commit**

```bash
git add apps/knowledge/src/style.css
git commit -m "feat(stars): full-bleed panorama chrome with glass HUD toolbar and horizon slider"
```

---

## Task 10: Run the full suite and build

**Files:** none (verification only)

- [ ] **Step 1: Run the full Knowledge Hub test suite**

Run: `cd apps/knowledge && npm test`
Expected: PASS, ~742+ tests (the exact count will have grown by the new test files added in Tasks 1–3, 5).

- [ ] **Step 2: Run the repo-root Node test suite (covers the Netlify function change)**

Run: `npm test` (from the repo root)
Expected: PASS.

- [ ] **Step 3: Build the Knowledge Hub app**

Run: `cd apps/knowledge && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Commit if any of the above required fixes**

If any step above required a code fix, stage exactly the files touched and commit with a message describing what broke and why (e.g. `fix(stars): correct import path surfaced by full test run`). If nothing needed fixing, skip this step — there is nothing to commit.

---

## Task 11: Push the branch and open a PR

**Files:** none (git/GitHub operations only)

- [ ] **Step 1: Push the branch**

```bash
git push -u origin claude/stars-night-sky-panorama
```

- [ ] **Step 2: Open a PR against `main`**

```bash
gh pr create --title "Stars: night-sky panorama redesign" --body "$(cat <<'EOF'
## Summary
- Replaces the fixed-frame, zoom/annual-rotation Stars sky with a horizontally-pannable panorama positioned by creation month (unbounded timeline), per docs/superpowers/specs/2026-09-15-stars-night-sky-panorama-design.md (sections 1-6).
- Virtualizes rendering by distance from the current view: a cheap always-on backdrop, a "haze" density glow for off-screen months, and canvas-drawn glyphs/points only for the handful of months currently in focus — bounded cost regardless of archive size.
- The horizon scrubber and the sky's own drag gesture now drive the same continuous position, with inertia on release.
- `SavedConstellation.sky.x` is no longer written or relied on for placement; existing saved data with a stored `x` still parses (ignored).
- Section 7 (detail-view polish) is a separate follow-on PR.

## Test plan
- [x] `cd apps/knowledge && npm test` (Vitest)
- [x] `npm test` (repo root, covers the Netlify Stars function)
- [x] `cd apps/knowledge && npm run build`
- [x] Manual check in the running dev server: pan with inertia, horizon slider sync, haze/resolve virtualization, default landing on the current month, opening a constellation still works.
EOF
)"
```

- [ ] **Step 3: Report the PR URL and stop for review**

Do not merge. Report the PR URL back and wait for explicit go-ahead before merging to `main` — merging deploys the Knowledge Hub SPA to production (GitHub Pages, per `.github/workflows/pages.yml`) and this change alters the meaning of previously-saved constellation data.
