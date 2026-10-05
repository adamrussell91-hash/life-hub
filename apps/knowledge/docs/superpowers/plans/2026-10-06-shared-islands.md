# Shared Islands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A book's island has one coastline, shared by the Archipelago and the book's own map. Linked neighbours in the same notebook meet by rope bridge (1 link), stone bridge (2 links) or shared land with a border road (3+ links).

**Architecture:**
- A new pure module, `islandShape.ts`, turns a book key into soft "hills" in island units.
- Both layouts place those hills as `AtlasLand`.
- The terrain renderer splits sources into base (decides the coast), relief (notes, which only lift land inland) and seeds (decide colour only). It samples noise in a frame tied to island space, so the coast is identical at any zoom.
- The Archipelago relaxes linked books together inside each sea and emits `crossings`.
- The book view builds its map in the Archipelago's space, scaled up, with chapters as wedge regions and linked neighbours at the edge.

**Tech Stack:** TypeScript, Vite, Vitest (jsdom for view tests), canvas terrain renderer, SVG line layers.

Spec: `apps/knowledge/docs/superpowers/specs/2026-10-05-shared-islands-design.md`.

**Where things run:**
- All commands run from `apps/knowledge/`.
- Unit tests: `npx vitest run src/shelf`.
- The full suite is `npm test`. `tsc` already reports unrelated errors on `main`, so only check that no new errors appear in `src/shelf/`.

---

## File structure

| File | Responsibility |
|---|---|
| `src/shelf/islandShape.ts` (new) | Book key → shape; heights, reach and shore; `landFor`, `neckLand`; `islandRadius`; `SEA_LEVEL`, `COAST`. |
| `src/shelf/islandShape.test.ts` (new) | Shape tests. |
| `src/shelf/atlasTerrain.ts` | Base, relief and seed sources; `TerrainFrame`; pure `terrainField`. |
| `src/shelf/atlasTerrain.test.ts` (new) | Coast unaffected by notes, same at any zoom, voting. |
| `src/shelf/atlasLayout.ts` | New types (`AtlasContext`, `AtlasCrossing`, `MeetingKind`, `TerrainFrame`). `buildAtlas(book, now, context?)` lays the book out inside its shared coast. |
| `src/shelf/archipelagoLayout.ts` | Shared shapes, option C relaxation, `crossings`, necks, `atlasContext`. |
| `src/shelf/crossingsSvg.ts` (new) | `bridgeSvg`, `borderRoadSvg`, shared by both views. |
| `src/shelf/archipelagoView.ts` | Draws crossings; ships only on far routes; legend. |
| `src/shelf/atlasView.ts` | Draws neighbour crossings and labels; cache key; sea-life land. |
| `src/shelf/view.ts` | Passes `atlasContext` into `buildAtlas`. |
| `src/shelf/bookshelf.css` | `.map-bridge*`, `.map-road*`. |

---

### Task 1: `islandShape.ts`

**Files:**
- Create: `src/shelf/islandShape.ts`
- Create: `src/shelf/islandShape.test.ts`
- Modify: `src/shelf/atlasLayout.ts`: add `vote?: boolean` to `AtlasLand`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/shelf/islandShape.test.ts
import { describe, expect, it } from "vitest";
import { SEA_LEVEL, islandShape, landFor, neckLand, reachAt, shapeHeight, shoreAt } from "./islandShape";

const keys = ["make it stick", "peak", "discourses", "range", "neuroscience: exploring the brain", "a", "b", "c", "d", "e", "f", "g"];

describe("islandShape", () => {
  it("is the same for the same book and different between books", () => {
    expect(islandShape("peak")).toEqual(islandShape("peak"));
    expect(islandShape("peak")).not.toEqual(islandShape("range"));
  });

  it("is roughly round: no sausages", () => {
    for (const key of keys) {
      const shape = islandShape(key);
      const reach = Array.from({ length: 72 }, (_, i) => reachAt(shape, (i / 72) * Math.PI * 2));
      expect(Math.min(...reach)).toBeGreaterThan(0.6);
      expect(Math.max(...reach)).toBeLessThan(1.3);
      expect(Math.max(...reach) / Math.min(...reach)).toBeLessThan(1.9);
    }
  });

  it("puts the shore where the land meets the sea", () => {
    const shape = islandShape("peak");
    const p = shoreAt(shape, 1);
    expect(shapeHeight(shape.base, p.x * 0.97, p.y * 0.97)).toBeGreaterThan(SEA_LEVEL);
    expect(shapeHeight(shape.base, p.x * 1.03, p.y * 1.03)).toBeLessThan(SEA_LEVEL);
  });

  it("keeps islets offshore", () => {
    for (const key of keys) for (const s of islandShape(key).islets) expect(Math.hypot(s.x, s.y)).toBeGreaterThan(1.15);
  });
});

describe("landFor", () => {
  it("places the shape in world space, scaled, voting for its book unless told not to", () => {
    const shape = islandShape("peak");
    const land = landFor(shape, 100, 200, 50, "peak");
    const first = shape.base[0]!;
    expect(land[0]).toMatchObject({ province: "peak", x: 100 + first.x * 50, y: 200 + first.y * 50, sigma: first.sigma * 50, vote: true });
    expect(land).toHaveLength(shape.base.length + shape.islets.length);
    expect(landFor(shape, 0, 0, 1, "peak", false).every(l => l.vote === false)).toBe(true);
  });
});

describe("neckLand", () => {
  it("fills the strait between two shores with land, half for each book, water either side", () => {
    const neck = neckLand({ x: 0, y: 0 }, { x: 40, y: 0 }, 50, "a", "b");
    expect(neck.map(n => n.province)).toEqual(["a", "b"]);
    expect(shapeHeight(neck, 20, 0)).toBeGreaterThan(SEA_LEVEL);
    expect(shapeHeight(neck, 20, 45)).toBeLessThan(SEA_LEVEL);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/shelf/islandShape.test.ts`
Expected: FAIL, because the module can't be resolved.

- [ ] **Step 3: Add `vote` to `AtlasLand`** in `src/shelf/atlasLayout.ts`:

```ts
/** Extra land shaping a province: peninsulas, islets, and (with a negative amp) bays. `vote: false` shapes the coast without claiming colour. */
export type AtlasLand = { province: string; x: number; y: number; amp: number; sigma: number; stretch?: number; angle?: number; vote?: boolean };
```

- [ ] **Step 4: Write `src/shelf/islandShape.ts`**

```ts
import type { AtlasLand } from "./atlasLayout";

/**
 * A book's coastline, shared by the Archipelago and the book's own map. Shapes are in
 * island units (centre 0, 0; the coast lies near radius 1) and depend only on the book's
 * key, so a book keeps its outline as its notes change; only its size moves. Each source
 * is a soft hill; the coast is where their sum crosses SEA_LEVEL.
 */

export const SEA_LEVEL = 0.42;
/** An island's coast sits at about COAST × its packing radius, leaving its islets room before the next island. */
export const COAST = 0.86;

export type ShapeSource = { x: number; y: number; amp: number; sigma: number; stretch: number; angle: number };
export type IslandShape = { base: ShapeSource[]; islets: ShapeSource[] };
type Hill = { x: number; y: number; amp: number; sigma: number; stretch?: number; angle?: number };
type Pt = { x: number; y: number };

export function islandRadius(noteCount: number) {
  return Math.round(58 + Math.sqrt(Math.max(0, noteCount)) * 17);
}

function hash(text: string) {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function rolls(key: string) {
  let n = 0;
  return () => hash(`${key}#${(n += 1)}`);
}

// A lone body of amp 1 meets the sea at radius 1 when exp(-1 / (2σ²)) = SEA_LEVEL.
const BODY_SIGMA = Math.sqrt(1 / (2 * Math.log(1 / SEA_LEVEL)));

export function islandShape(key: string): IslandShape {
  const roll = rolls(`${key}:shape`);
  // Near-round: never stretched past 1.3, so no island reads as a sausage.
  const base: ShapeSource[] = [{ x: 0, y: 0, amp: 1, sigma: BODY_SIGMA * 0.92, stretch: 1 + roll() * 0.3, angle: roll() * Math.PI }];
  // Headlands: short and broad, spread round the coast so no two crowd one side.
  const heads = 3 + Math.floor(roll() * 3);
  const turn = roll() * Math.PI * 2;
  for (let k = 0; k < heads; k += 1) {
    const a = turn + ((k + 0.2 + roll() * 0.6) / heads) * Math.PI * 2;
    const dist = 0.55 + roll() * 0.2;
    base.push({ x: Math.cos(a) * dist, y: Math.sin(a) * dist, amp: 0.35 + roll() * 0.25, sigma: 0.2 + roll() * 0.08, stretch: 1.2 + roll() * 0.6, angle: a });
  }
  if (roll() < 0.6) {
    // A bay pressed into one shore.
    const a = roll() * Math.PI * 2;
    base.push({ x: Math.cos(a) * 0.85, y: Math.sin(a) * 0.85, amp: -0.45, sigma: 0.2, stretch: 1.5, angle: a + Math.PI / 2 });
  }
  const islets: ShapeSource[] = [];
  const count = Math.floor(roll() * 3);
  for (let k = 0; k < count; k += 1) {
    const a = roll() * Math.PI * 2;
    const dist = 1.22 + roll() * 0.14;
    islets.push({ x: Math.cos(a) * dist, y: Math.sin(a) * dist, amp: 0.75, sigma: 0.06 + roll() * 0.04, stretch: 1 + roll() * 0.6, angle: roll() * Math.PI });
  }
  return { base, islets };
}

/** One hill's height at (x, y): the same formula as the terrain renderer, without its noise. */
export function sourceHeight(s: Hill, x: number, y: number) {
  const k = Math.max(0.2, s.stretch ?? 1);
  const c = Math.cos(s.angle ?? 0);
  const si = Math.sin(s.angle ?? 0);
  const ex = x - s.x;
  const ey = y - s.y;
  const u = ex * c + ey * si;
  const v = ey * c - ex * si;
  return s.amp * Math.exp(-(u * u / k + v * v * k) / (2 * s.sigma * s.sigma));
}

export function shapeHeight(sources: Hill[], x: number, y: number) {
  let e = 0;
  for (const s of sources) e += sourceHeight(s, x, y);
  return e;
}

/** How far the coast reaches along a bearing, in island units: the first point out from the centre that is sea. */
export function reachAt(shape: IslandShape, angle: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  for (let r = 0.02; r < 2; r += 0.01) if (shapeHeight(shape.base, c * r, s * r) < SEA_LEVEL) return r - 0.005;
  return 2;
}

/** Where the coast faces a bearing, in island units. */
export function shoreAt(shape: IslandShape, angle: number): Pt {
  const r = reachAt(shape, angle);
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
}

/** A shape placed in world space (centre x, y; coast radius r) as Atlas land for the terrain renderer. */
export function landFor(shape: IslandShape, x: number, y: number, r: number, province: string, vote = true): AtlasLand[] {
  return [...shape.base, ...shape.islets].map(s => ({ province, x: x + s.x * r, y: y + s.y * r, amp: s.amp, sigma: s.sigma * r, stretch: s.stretch, angle: s.angle, vote }));
}

/**
 * Two joined books: a neck of land filling the strait between their facing shores `a`
 * and `b`, `width` across. Each half votes for its own book, so the border falls midway.
 */
export function neckLand(a: Pt, b: Pt, width: number, fromKey: string, toKey: string): AtlasLand[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  // amp 0.8 meets the sea about 1.14σ out, so across = width / 2.3 gives the neck its width.
  const across = width / 2.3;
  const along = len / 4 + width * 0.6;
  const sigma = Math.sqrt(along * across);
  const stretch = along / across;
  return ([[fromKey, 0.25], [toKey, 0.75]] as const).map(([province, t]) => ({ province, x: a.x + dx * t, y: a.y + dy * t, amp: 0.8, sigma, stretch, angle, vote: true }));
}
```

- [ ] **Step 5: Run the tests and tune if needed**

Run: `npx vitest run src/shelf/islandShape.test.ts`
Expected: PASS.

If the roundness bounds fail for a key, adjust only the headland constants: `dist` (0.55 + 0.2), `amp` (0.35 + 0.25) and `stretch` (1.2 + 0.6). Shrink them until the reach stays between 0.6 and 1.3. Don't loosen the test.

- [ ] **Step 6: Commit**

```bash
git add src/shelf/islandShape.ts src/shelf/islandShape.test.ts src/shelf/atlasLayout.ts
git commit -m "Knowledge: one coastline per book, in island units"
```

---

### Task 2: Terrain: base, relief and seeds; noise frame; `terrainField`

**Files:**
- Modify: `src/shelf/atlasLayout.ts` (types).
- Modify: `src/shelf/atlasTerrain.ts:14-160`.
- Create: `src/shelf/atlasTerrain.test.ts`.

- [ ] **Step 1: Add types** to `src/shelf/atlasLayout.ts`.

On `AtlasProvince`, add:

```ts
  /** A linked neighbouring book shown at the edge of this book's map. */
  neighbour?: boolean;
```

Above `AtlasModel`, add:

```ts
type Pt = { x: number; y: number };
/** Maps world space to noise space (noise = world / unit + offset), so one island's coast wobbles the same at any zoom. */
export type TerrainFrame = { unit: number; ox: number; oy: number };
```

On `AtlasModel`, add:

```ts
  frame?: TerrainFrame;
  /** The book's own island in this map's space: centre and coast radius. */
  island?: { x: number; y: number; r: number };
```

- [ ] **Step 2: Write the failing tests**

```ts
// src/shelf/atlasTerrain.test.ts
import { describe, expect, it } from "vitest";
import type { AtlasModel, AtlasTown } from "./atlasLayout";
import { terrainField } from "./atlasTerrain";
import { SEA_LEVEL, islandShape, landFor } from "./islandShape";

const shape = islandShape("peak");
function model(over: Partial<AtlasModel> = {}): AtlasModel {
  return {
    width: 2000, height: 2000, bounds: { x: 0, y: 0, w: 2000, h: 2000 }, source: "themes",
    provinces: [{ id: "peak", label: "Peak", x: 1000, y: 1000, radius: 60, explored: true, colour: 0 }],
    towns: [], roads: [], routes: [], fogs: [], land: landFor(shape, 1000, 1000, 100, "peak"),
    ...over,
  };
}
const town = (id: string, x: number, y: number): AtlasTown =>
  ({ note: { id } as AtlasTown["note"], province: "peak", x, y, size: 6, peak: true, faded: false, isNew: false, themes: [] });
const bearings = Array.from({ length: 24 }, (_, i) => (i / 24) * Math.PI * 2);
function coastAlong(field: ReturnType<typeof terrainField>, cx: number, cy: number, angle: number, zoom = 1) {
  for (let r = 1; r < 400 * zoom; r += 1) if (field(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r).e < SEA_LEVEL) return r;
  return Infinity;
}

describe("terrainField", () => {
  it("draws the coast from the island's shape alone: notes raise hills but never move the shore", () => {
    const bare = terrainField(model());
    const settled = terrainField(model({ towns: [town("a", 1000, 1000), town("b", 1040, 990), town("c", 960, 1030), town("d", 1060, 1050)] }));
    for (const a of bearings) expect(coastAlong(settled, 1000, 1000, a)).toBe(coastAlong(bare, 1000, 1000, a));
    expect(settled(1000, 1000).e).toBeGreaterThan(bare(1000, 1000).e);
  });

  it("draws the same coast at any zoom when the frame maps back to the same place", () => {
    const k = 3.5;
    const near = terrainField(model());
    const zoomed = terrainField(model({
      width: 2000 * k, height: 2000 * k,
      provinces: [{ id: "peak", label: "Peak", x: 1000 * k, y: 1000 * k, radius: 60 * k, explored: true, colour: 0 }],
      land: landFor(shape, 1000 * k, 1000 * k, 100 * k, "peak"),
      frame: { unit: k, ox: 0, oy: 0 },
    }));
    for (const a of bearings) expect(Math.abs(coastAlong(zoomed, 1000 * k, 1000 * k, a, k) / k - coastAlong(near, 1000, 1000, a))).toBeLessThanOrEqual(1.5);
  });

  it("lets land shape the coast without claiming colour when it doesn't vote", () => {
    const field = terrainField(model({
      provinces: [
        { id: "west", label: "West", x: 960, y: 1000, radius: 60, explored: true, colour: 0 },
        { id: "east", label: "East", x: 1040, y: 1000, radius: 60, explored: true, colour: 1 },
      ],
      land: landFor(shape, 1000, 1000, 100, "peak", false),
    }));
    expect(field(950, 1000).region).toBe(0);
    expect(field(1050, 1000).region).toBe(1);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run src/shelf/atlasTerrain.test.ts`
Expected: FAIL, because `terrainField` isn't exported.

- [ ] **Step 4: Rewrite the source model and sampling in `src/shelf/atlasTerrain.ts`**

Replace `const SEA = 0.42;` with:

```ts
import { SEA_LEVEL } from "./islandShape";
import type { TerrainFrame } from "./atlasLayout";

const SEA = SEA_LEVEL;
const NO_FRAME: TerrainFrame = { unit: 1, ox: 0, oy: 0 };
```

Replace everything from the `/** \`stretch\` > 1 draws the hill out…` comment through the end of `sources()`, and the per-pixel loop inside `renderTerrain`, with the following:

```ts
/** Base hills shape the coast; relief (notes) only lifts land that is already land; seeds only claim colour. */
const BASE = 0;
const RELIEF = 1;
const SEED = 2;

/** `stretch` > 1 draws the hill out along `angle`; round when absent. */
type Source = { kind: number; vote: boolean; x: number; y: number; amp: number; sigma: number; region: number; cos: number; sin: number; along: number; across: number };

function source(kind: number, x: number, y: number, amp: number, sigma: number, region: number, vote: boolean, stretch = 1, angle = 0): Source {
  const k = Math.sqrt(Math.max(0.2, stretch));
  return { kind, vote, x, y, amp, sigma, region, cos: Math.cos(angle), sin: Math.sin(angle), along: 1 / (k * k), across: k * k };
}

function fade(c: [number, number, number]): [number, number, number] {
  return [0, 1, 2].map(i => Math.round(c[i]! * 0.4 + UNEXPLORED[i]! * 0.6)) as [number, number, number];
}

function sources(atlas: AtlasModel): { list: Source[]; colours: Array<[number, number, number]> } {
  const colours: Array<[number, number, number]> = [];
  const index = new Map<string, number>();
  atlas.provinces.forEach(p => {
    index.set(p.id, colours.length);
    const colour = PASTELS[p.colour % PASTELS.length]!;
    colours.push(!p.explored ? UNEXPLORED : p.neighbour ? fade(colour) : colour);
  });
  index.set("loose", colours.length);
  colours.push(LOOSE);
  const list: Source[] = atlas.towns.map(t =>
    source(RELIEF, t.x, t.y, (t.peak ? 1.5 : 1) * (0.62 + Math.min(0.5, t.size * 0.05)), t.peak ? 46 : 60, index.get(t.province) ?? -1, index.has(t.province)));
  // Every province is a seed: it colours the land nearest it. Equal reach, so regions split evenly between seeds.
  for (const p of atlas.provinces) list.push(source(SEED, p.x, p.y, 0, p.radius * 2, index.get(p.id)!, true));
  for (const l of atlas.land ?? []) {
    const region = index.get(l.province) ?? -1;
    list.push(source(BASE, l.x, l.y, l.amp, l.sigma, region, (l.vote ?? true) && region >= 0 && l.amp > 0, l.stretch, l.angle));
  }
  return { list, colours };
}

/** Height and region at a point, from the given sources. Noise is sampled in the frame's space. */
function sampler(list: Source[], seed: number, frame: TerrainFrame) {
  const n1 = noise(seed);
  const n2 = noise(seed * 3 + 1);
  const { unit, ox, oy } = frame;
  return (candidates: Iterable<number>, x: number, y: number) => {
    const nx = x / unit + ox;
    const ny = y / unit + oy;
    // Two octaves of warp: broad bends, then a craggier edge.
    const wx = x + ((n1(nx / 70, ny / 70) - 0.5) * 70 + (n2(nx / 19 + 40, ny / 19) - 0.5) * 16) * unit;
    const wy = y + ((n2(nx / 70, ny / 70) - 0.5) * 70 + (n1(nx / 19, ny / 19 + 40) - 0.5) * 16) * unit;
    let base = (n1(nx / 24, ny / 24) - 0.5) * 0.14;
    let relief = 0;
    let best = Infinity;
    let region = -1;
    for (const k of candidates) {
      const src = list[k]!;
      const ex = wx - src.x;
      const ey = wy - src.y;
      const u = ex * src.cos + ey * src.sin;
      const v = ey * src.cos - ex * src.sin;
      const d2 = u * u * src.along + v * v * src.across;
      if (src.kind !== SEED) {
        const h = src.amp * Math.exp(-d2 / (2 * src.sigma * src.sigma));
        if (src.kind === RELIEF) relief += h;
        else base += h;
      }
      if (src.vote) {
        const weighted = d2 / (src.sigma * src.sigma);
        if (weighted < best) {
          best = weighted;
          region = src.region;
        }
      }
    }
    // Notes raise hills inland but never move the shore.
    const t = Math.max(0, Math.min(1, (base - SEA) / 0.15));
    return { e: base + relief * t * t * (3 - 2 * t), region };
  };
}

/** The land as a function, for tests and anything that asks "is this land?" without a canvas. */
export function terrainField(atlas: AtlasModel, seed = 7) {
  const { list } = sources(atlas);
  const sample = sampler(list, seed, atlas.frame ?? NO_FRAME);
  const all = list.map((_, i) => i);
  return (x: number, y: number) => sample(all, x, y);
}
```

Inside `renderTerrain`, replace the setup and first loop with:

```ts
  const { list, colours } = sources(atlas);
  const frame = atlas.frame ?? NO_FRAME;
  const sample = sampler(list, seed, frame);
  const elevation = new Float32Array(w * h);
  const region = new Int16Array(w * h).fill(-1);

  // Bin sources into blocks so each pixel only weighs the hills that can reach it.
  const BLOCK = 24;
  const bw = Math.ceil(w / BLOCK);
  const bh = Math.ceil(h / BLOCK);
  const bins: number[][] = Array.from({ length: bw * bh }, () => []);
  list.forEach((src, i) => {
    const reach = (src.sigma * 3 * Math.sqrt(Math.max(src.along, src.across)) + 60 * frame.unit) * resolution;
    const x0 = Math.max(0, Math.floor((src.x * resolution - reach) / BLOCK));
    const x1 = Math.min(bw - 1, Math.floor((src.x * resolution + reach) / BLOCK));
    const y0 = Math.max(0, Math.floor((src.y * resolution - reach) / BLOCK));
    const y1 = Math.min(bh - 1, Math.floor((src.y * resolution + reach) / BLOCK));
    for (let by = y0; by <= y1; by += 1) for (let bx = x0; bx <= x1; bx += 1) bins[by * bw + bx]!.push(i);
  });

  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      const at = sample(bins[Math.floor(j / BLOCK) * bw + Math.floor(i / BLOCK)]!, i / resolution, j / resolution);
      elevation[j * w + i] = at.e;
      region[j * w + i] = at.region;
    }
  }
```

The colouring loop after it is unchanged.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/shelf/atlasTerrain.test.ts src/shelf/islandShape.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shelf/atlasTerrain.ts src/shelf/atlasTerrain.test.ts src/shelf/atlasLayout.ts
git commit -m "Knowledge: terrain coast comes from shape alone; notes only lift land; zoom-stable noise"
```

---

### Task 3: Archipelago: shared shapes, option C, crossings, necks, `atlasContext`

**Files:**
- Modify: `src/shelf/atlasLayout.ts` (context types).
- Modify: `src/shelf/archipelagoLayout.ts`.
- Modify: `src/shelf/archipelagoLayout.test.ts`.

- [ ] **Step 1: Add context types** to `src/shelf/atlasLayout.ts`, after `TerrainFrame`:

```ts
/** How a linked neighbour in the same sea meets a book: a rope bridge (1 link), a stone bridge (2) or shared land (3+). */
export type MeetingKind = "rope" | "stone" | "joined";
/** A neighbour as the Archipelago places it: centre, packing radius, terrain colour, and the facing shores (`a` on this book, `b` on theirs). */
export type AtlasNeighbour = { key: string; label: string; kind: MeetingKind; count: number; x: number; y: number; r: number; colour: number; a: Pt; b: Pt };
/** What a book's own map borrows from the Archipelago, in Archipelago space. */
export type AtlasContext = { island: { x: number; y: number; r: number }; neighbours: AtlasNeighbour[] };
```

- [ ] **Step 2: Write the failing tests** (append to `src/shelf/archipelagoLayout.test.ts`; also update the import line).

```ts
import { atlasContext, buildArchipelago, islandRadius, packCircles } from "./archipelagoLayout";
import { terrainField } from "./atlasTerrain";
import { SEA_LEVEL } from "./islandShape";

describe("crossings", () => {
  // One notebook: Hub shares 3 links with Three, 2 with Two, 1 with One. Far is in another notebook, linked 4 times.
  const linked = (from: string, to: string, n: number) => Array.from({ length: n }, (_, i) => [
    entry(`${from}-${to}-${i}`, from, { connected: [`${to}-${from}-${i}`] }),
    entry(`${to}-${from}-${i}`, to, { connected: [`${from}-${to}-${i}`] }),
  ]).flat();
  const shelf = buildShelf([...linked("Hub", "Three", 3), ...linked("Hub", "Two", 2), ...linked("Hub", "One", 1), ...linked("Hub", "Far", 4), entry("h", "Hub")], {
    books: [
      { label: "Hub", notebook: "Sea" }, { label: "Three", notebook: "Sea" }, { label: "Two", notebook: "Sea" },
      { label: "One", notebook: "Sea" }, { label: "Far", notebook: "Other" },
    ],
    placements: [],
  });
  const map = buildArchipelago(shelf, Date.parse("2026-10-03T00:00:00Z"));
  const kind = (other: string) => map.crossings.find(c => [c.from, c.to].includes(other))!.kind;
  const field = terrainField(map.terrain, 13);
  const pair = (a: string, b: string) => [a, b].sort().join("|");
  const joined = new Set(map.crossings.filter(c => c.kind === "joined").map(c => pair(c.from, c.to)));

  it("bridges or joins neighbours in one sea by how many links they share, and leaves other seas to faint routes", () => {
    expect(kind("one")).toBe("rope");
    expect(kind("two")).toBe("stone");
    expect(kind("three")).toBe("joined");
    expect(kind("far")).toBe("far");
  });

  it("pulls joined books shore to shore", () => {
    const hub = map.islands.find(i => i.key === "hub")!;
    const three = map.islands.find(i => i.key === "three")!;
    expect(Math.hypot(hub.x - three.x, hub.y - three.y) - hub.r - three.r).toBeLessThan(20);
  });

  it("joins land across the neck of joined books and keeps open sea between every other pair", () => {
    for (const c of map.crossings.filter(c => c.kind === "joined")) expect(field((c.a.x + c.b.x) / 2, (c.a.y + c.b.y) / 2).e).toBeGreaterThan(SEA_LEVEL);
    for (const a of map.islands) for (const b of map.islands) {
      if (a.key >= b.key || joined.has(pair(a.key, b.key))) continue;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const t = (a.r + (d - a.r - b.r) / 2) / d;
      expect(field(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t).e).toBeLessThan(SEA_LEVEL);
    }
  });

  it("tells a book's own map where its island sits and which neighbours meet it", () => {
    const ctx = atlasContext(map, "hub")!;
    const hub = map.islands.find(i => i.key === "hub")!;
    expect(ctx.island).toEqual({ x: hub.x, y: hub.y, r: hub.r });
    expect(ctx.neighbours.map(n => [n.key, n.kind, n.count]).sort()).toEqual([["one", "rope", 1], ["three", "joined", 3], ["two", "stone", 2]]);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run src/shelf/archipelagoLayout.test.ts`
Expected: FAIL, because `atlasContext` and `crossings` don't exist yet.

- [ ] **Step 4: Change `src/shelf/archipelagoLayout.ts`**

1. Imports and re-export:

```ts
import type { AtlasContext, AtlasLand, AtlasModel, AtlasProvince, AtlasTown, MeetingKind } from "./atlasLayout";
import { COAST, islandRadius, islandShape, landFor, neckLand, shoreAt } from "./islandShape";
export { islandRadius } from "./islandShape";
```

   Delete the local `islandRadius` function.

2. Types and constants, after `Passage`:

```ts
export type CrossingKind = MeetingKind | "far";
/** How two linked books meet. `a` and `b` are their facing shores (`a` on `from`). */
export type Crossing = { from: string; to: string; count: number; kind: CrossingKind; a: { x: number; y: number }; b: { x: number; y: number } };
```

   Add `crossings: Crossing[];` to `ArchipelagoModel`. Next to the constants, add:

```ts
/** Three or more links and two neighbouring books share one landmass. */
export const JOIN_AT = 3;
const JOIN_GAP = 14;
const BRIDGE_GAP = 100;
/** A strait wider than this gets no bridge: the link stays a faint route. */
const MAX_STRAIT = 170;
```

3. Tier rule, relaxation and crossings (new functions, above `buildArchipelago`):

```ts
export function crossingKind(count: number): MeetingKind {
  return count >= JOIN_AT ? "joined" : count === 2 ? "stone" : "rope";
}

/** Option C: inside one sea, linked books are pulled together; every other pair keeps its gap. Deterministic. */
function relaxSea(list: BookModel[], centres: Map<string, { x: number; y: number }>, passages: Passage[]) {
  const keys = new Set(list.map(b => b.key));
  const radius = new Map(list.map(b => [b.key, islandRadius(b.noteCount)]));
  const pairKey = (a: string, b: string) => [a, b].sort().join("\u0000");
  const gapFor = new Map<string, number>();
  for (const p of passages) {
    if (keys.has(p.from) && keys.has(p.to)) gapFor.set(pairKey(p.from, p.to), crossingKind(p.count) === "joined" ? JOIN_GAP : BRIDGE_GAP);
  }
  if (!gapFor.size) return;
  const ids = [...keys].sort();
  const separate = () => {
    for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) {
      const p = centres.get(ids[i]!)!;
      const q = centres.get(ids[j]!)!;
      const min = radius.get(ids[i]!)! + radius.get(ids[j]!)! + (gapFor.get(pairKey(ids[i]!, ids[j]!)) ?? ISLAND_GAP);
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d >= min) continue;
      const push = (min - d) / 2;
      p.x -= (dx / d) * push;
      p.y -= (dy / d) * push;
      q.x += (dx / d) * push;
      q.y += (dy / d) * push;
    }
  };
  for (let it = 0; it < 240; it += 1) {
    for (const [pair, gap] of gapFor) {
      const [a, b] = pair.split("\u0000") as [string, string];
      const p = centres.get(a)!;
      const q = centres.get(b)!;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const pull = (d - (radius.get(a)! + radius.get(b)! + gap)) * 0.06;
      p.x += (dx / d) * pull;
      p.y += (dy / d) * pull;
      q.x -= (dx / d) * pull;
      q.y -= (dy / d) * pull;
    }
    separate();
  }
  for (let it = 0; it < 60; it += 1) separate();
}

/** Where island `i`'s coast faces a bearing, in world space. */
function shoreToward(i: Island, angle: number) {
  const s = shoreAt(islandShape(i.key), angle);
  return { x: i.x + s.x * i.r * COAST, y: i.y + s.y * i.r * COAST };
}

function crossingsFor(islands: Island[], passages: Passage[]): Crossing[] {
  const byKey = new Map(islands.map(i => [i.key, i]));
  return passages.flatMap(p => {
    const a = byKey.get(p.from);
    const b = byKey.get(p.to);
    if (!a || !b) return [];
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const pa = shoreToward(a, angle);
    const pb = shoreToward(b, angle + Math.PI);
    const strait = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    const kind: CrossingKind = a.sea === b.sea && strait <= MAX_STRAIT ? crossingKind(p.count) : "far";
    return [{ from: p.from, to: p.to, count: p.count, kind, a: pa, b: pb }];
  });
}

/** The terrain colour index for a book: five kit pastels, then the book palette. */
function paletteColour(book: BookModel) {
  return 5 + Math.max(0, BOOK_PALETTE.findIndex(s => s.fill === book.swatch.fill));
}

/** What a book's own map needs from the Archipelago: where its island sits and how its linked neighbours meet it. */
export function atlasContext(model: ArchipelagoModel, key: string): AtlasContext | undefined {
  const island = model.islands.find(i => i.key === key);
  if (!island) return undefined;
  const byKey = new Map(model.islands.map(i => [i.key, i]));
  const neighbours = model.crossings.flatMap(c => {
    if (c.kind === "far" || (c.from !== key && c.to !== key)) return [];
    const other = byKey.get(c.from === key ? c.to : c.from)!;
    return [{
      key: other.key, label: other.label, kind: c.kind, count: c.count, x: other.x, y: other.y, r: other.r,
      colour: paletteColour(other.book), a: c.from === key ? c.a : c.b, b: c.from === key ? c.b : c.a,
    }];
  });
  return { island: { x: island.x, y: island.y, r: island.r }, neighbours };
}
```

4. In `buildArchipelago`, compute passages first and relax each sea:

```ts
  const passages = passagesFor(books);
  // Pack each sea's islands locally, pull linked books together, then pack the seas.
  const local = names.map(name => {
    const list = groups.get(name)!;
    const centres = packCircles(list.map(b => ({ id: b.key, r: islandRadius(b.noteCount) })), ISLAND_GAP, shape);
    relaxSea(list, centres, passages);
    // ...extent and return unchanged
```

   At the end, replace the return with:

```ts
  const crossings = crossingsFor(islands, passages);
  return { width, height, bounds, islands, seas, passages, crossings, terrain: terrainModel(islands, crossings, width, height, bounds) };
```

5. In `terrainModel(islands, crossings, width, height, bounds)`:
   - Provinces lose `stretch` and `angle`, and use `paletteColour`:

```ts
  const provinces: AtlasProvince[] = islands.map(island => ({
    id: island.key,
    label: island.label,
    x: island.x,
    y: island.y,
    radius: island.r * 0.6,
    explored: island.book.noteCount > 0,
    colour: paletteColour(island.book),
  }));
```

   - Land comes from the shared shapes, plus necks:

```ts
  const byKey = new Map(islands.map(i => [i.key, i]));
  const necks = crossings.filter(c => c.kind === "joined").flatMap(c =>
    neckLand(c.a, c.b, 0.5 * Math.min(byKey.get(c.from)!.r, byKey.get(c.to)!.r) * COAST, c.from, c.to));
  const land: AtlasLand[] = [...islands.flatMap(i => landFor(islandShape(i.key), i.x, i.y, i.r * COAST, i.key)), ...necks];
  return { width, height, bounds, source: "themes", provinces, towns, roads: [], routes: [], fogs: [], land };
```

6. Delete `coastline()`. `rolls` stays, because `chartLandmarks` uses it.

- [ ] **Step 5: Run the shelf tests**

Run: `npx vitest run src/shelf`
Expected: PASS, including the existing "never lets islands overlap" test.

If "keeps open sea" fails for a bridged pair, raise `BRIDGE_GAP` in steps of 10, up to `ISLAND_GAP`. If "joins land across the neck" fails, raise the neck's `amp` from 0.8 to 0.9.

- [ ] **Step 6: Commit**

```bash
git add src/shelf/archipelagoLayout.ts src/shelf/archipelagoLayout.test.ts src/shelf/atlasLayout.ts
git commit -m "Knowledge: islands share their book's shape; linked books in a sea pull together and bridge or join"
```

---

### Task 4: `crossingsSvg.ts` and styles

**Files:**
- Create: `src/shelf/crossingsSvg.ts`
- Create: `src/shelf/crossingsSvg.test.ts`
- Modify: `src/shelf/bookshelf.css` (append).

- [ ] **Step 1: Write the failing test**

```ts
// src/shelf/crossingsSvg.test.ts
import { describe, expect, it } from "vitest";
import { borderRoadSvg, bridgeSvg } from "./crossingsSvg";

describe("crossing drawings", () => {
  it("draws a rope bridge as two ropes with planks, and a stone bridge as a deck on arches", () => {
    const rope = bridgeSvg("rope", { x: 0, y: 0 }, { x: 100, y: 0 }, 4);
    expect(rope.match(/map-bridge__rope/g)).toHaveLength(2);
    expect((rope.match(/map-bridge__plank/g) ?? []).length).toBeGreaterThan(5);
    const stone = bridgeSvg("stone", { x: 0, y: 0 }, { x: 100, y: 0 }, 4, " is-on");
    expect(stone).toContain("map-bridge--stone is-on");
    expect(stone.match(/map-bridge__deck/g)).toHaveLength(1);
    expect((stone.match(/map-bridge__arch/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("draws a border road with a town at each end", () => {
    const road = borderRoadSvg({ x: 0, y: 0 }, { x: 80, y: 20 }, 4);
    expect(road.match(/map-road__town/g)).toHaveLength(2);
    expect(road).toContain("map-road__line");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/shelf/crossingsSvg.test.ts`
Expected: FAIL, because the module can't be resolved.

- [ ] **Step 3: Write `src/shelf/crossingsSvg.ts`**

```ts
/**
 * Bridges and border roads between linked books, as SVG for a map's screen-space line
 * layer. `w` is the deck's half-width in screen pixels, so callers scale it with zoom;
 * `extra` adds state classes (" is-on", " is-dim").
 */
type Pt = { x: number; y: number };
const f = (n: number) => n.toFixed(1);

export function bridgeSvg(kind: "rope" | "stone", a: Pt, b: Pt, w: number, extra = ""): string {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const nx = -uy;
  const ny = ux;
  // Each end runs a little onto land so the bridge sits on the shore.
  const A = { x: a.x - ux * w * 1.5, y: a.y - uy * w * 1.5 };
  const B = { x: b.x + ux * w * 1.5, y: b.y + uy * w * 1.5 };
  const L = len + w * 3;
  const at = (t: number, side: number) => ({ x: A.x + (B.x - A.x) * t + nx * w * side, y: A.y + (B.y - A.y) * t + ny * w * side });
  let svg = "";
  if (kind === "stone") {
    const [p1, p2, p3, p4] = [at(0, 1), at(1, 1), at(1, -1), at(0, -1)];
    svg += `<path class="map-bridge__deck" d="M${f(p1.x)},${f(p1.y)}L${f(p2.x)},${f(p2.y)}L${f(p3.x)},${f(p3.y)}L${f(p4.x)},${f(p4.y)}Z"/>`;
    const arches = Math.max(2, Math.round(L / (w * 4.5)));
    for (let i = 0; i < arches; i += 1) {
      const s = at((i + 0.15) / arches, -1);
      const e = at((i + 0.85) / arches, -1);
      const m = { x: (s.x + e.x) / 2 - nx * w, y: (s.y + e.y) / 2 - ny * w };
      svg += `<path class="map-bridge__arch" d="M${f(s.x)},${f(s.y)}Q${f(m.x)},${f(m.y)} ${f(e.x)},${f(e.y)}"/>`;
    }
  } else {
    // A rope bridge sags; planks hang between its two ropes.
    const sag = { x: (A.x + B.x) / 2 - nx * w, y: (A.y + B.y) / 2 - ny * w };
    const point = (t: number) => {
      const s = 1 - t;
      return { x: s * s * A.x + 2 * s * t * sag.x + t * t * B.x, y: s * s * A.y + 2 * s * t * sag.y + t * t * B.y };
    };
    for (const side of [-0.45, 0.45]) {
      const o = { x: nx * w * side, y: ny * w * side };
      svg += `<path class="map-bridge__rope" d="M${f(A.x + o.x)},${f(A.y + o.y)}Q${f(sag.x + o.x)},${f(sag.y + o.y)} ${f(B.x + o.x)},${f(B.y + o.y)}"/>`;
    }
    const planks = Math.max(3, Math.round(L / Math.max(3, w * 1.1)));
    for (let i = 1; i < planks; i += 1) {
      const p = point(i / planks);
      svg += `<path class="map-bridge__plank" d="M${f(p.x + nx * w * 0.55)},${f(p.y + ny * w * 0.55)}L${f(p.x - nx * w * 0.55)},${f(p.y - ny * w * 0.55)}"/>`;
    }
  }
  return `<g class="map-bridge map-bridge--${kind}${extra}">${svg}</g>`;
}

/** The road over the border between two joined books: a paper casing under a dashed ink line, a town at each end. */
export function borderRoadSvg(a: Pt, b: Pt, w: number, extra = ""): string {
  const c = { x: (a.x + b.x) / 2 + (b.y - a.y) * 0.08, y: (a.y + b.y) / 2 - (b.x - a.x) * 0.08 };
  const d = `M${f(a.x)},${f(a.y)}Q${f(c.x)},${f(c.y)} ${f(b.x)},${f(b.y)}`;
  const towns = [a, b].map(p => `<circle class="map-road__town" cx="${f(p.x)}" cy="${f(p.y)}" r="${f(Math.max(2, w * 0.7))}"/>`).join("");
  return `<g class="map-road${extra}"><path class="map-road__casing" d="${d}" style="stroke-width:${f(w * 1.6)}px"/><path class="map-road__line" d="${d}"/>${towns}</g>`;
}
```

- [ ] **Step 4: Append styles to `src/shelf/bookshelf.css`**

```css
/* Bridges and border roads between linked books (crossingsSvg.ts): map ink by day, moonlit by night. */
.atlas { --map-ink: #22324a; --map-deck: #f5eedb; }
.atlas[data-sky="night"] { --map-ink: #ece2c6; --map-deck: #1b2a4a; }
.map-bridge, .map-road { transition: opacity 200ms ease; }
.map-bridge.is-dim, .map-road.is-dim { opacity: 0.35; }
.map-bridge__deck { fill: var(--map-deck); stroke: var(--map-ink); stroke-width: 1; }
.map-bridge__arch, .map-bridge__plank { fill: none; stroke: var(--map-ink); stroke-width: 0.8; }
.map-bridge__rope { fill: none; stroke: var(--map-ink); stroke-width: 0.9; }
.map-bridge.is-on .map-bridge__deck, .map-bridge.is-on .map-bridge__rope { stroke-width: 1.6; }
.map-road__casing { fill: none; stroke: var(--map-deck); stroke-linecap: round; opacity: 0.85; }
.map-road__line { fill: none; stroke: var(--map-ink); stroke-width: 1.3; stroke-dasharray: 5 4; }
.map-road.is-on .map-road__line { stroke-width: 2; }
.map-road__town { fill: var(--map-deck); stroke: var(--map-ink); stroke-width: 1; }
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run src/shelf/crossingsSvg.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shelf/crossingsSvg.ts src/shelf/crossingsSvg.test.ts src/shelf/bookshelf.css
git commit -m "Knowledge: rope and stone bridges and border roads as map SVG"
```

---

### Task 5: Archipelago view draws crossings

**Files:**
- Modify: `src/shelf/archipelagoView.ts` (imports, legend, `terrainKey`, the routes loop in `draw()` at ~189–213, the `passages` option for sea life at ~537).

- [ ] **Step 1: Imports**

```ts
import { chartLandmarks, shorePoint, type ArchipelagoModel, type Island } from "./archipelagoLayout";
import { borderRoadSvg, bridgeSvg } from "./crossingsSvg";
```

- [ ] **Step 2: Cache key**, because joining changes the land:

```ts
function terrainKey(model: ArchipelagoModel) {
  return `${model.islands.map(i => `${i.key}:${i.x},${i.y},${i.book.noteCount}`).join("|")}#${model.crossings.map(c => c.kind[0]).join("")}`;
}
```

- [ ] **Step 3: Replace the routes loop** (`for (const passage of model.passages) { … }`) with:

```ts
    let svg = "";
    const focus = selected ?? hovered;
    // Bridge decks are about four world units across each side, kept legible at any zoom.
    const deck = Math.max(1.6, Math.min(9, 4 * scale));
    for (const crossing of model.crossings) {
      const a = byKey.get(crossing.from);
      const b = byKey.get(crossing.to);
      if (!a || !b) continue;
      const on = focus === crossing.from || focus === crossing.to;
      const dim = Boolean(focus) && !on;
      const state = `${on ? " is-on" : ""}${dim ? " is-dim" : ""}`;
      let mid: { x: number; y: number };
      if (crossing.kind === "rope" || crossing.kind === "stone") {
        const p = S(crossing.a.x, crossing.a.y);
        const q = S(crossing.b.x, crossing.b.y);
        svg += bridgeSvg(crossing.kind, p, q, deck, state);
        mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 - deck * 3 };
      } else if (crossing.kind === "joined") {
        // From a little inland on one side, over the border, to a little inland on the other.
        const inland = (i: Island, shore: { x: number; y: number }) => S(i.x + (shore.x - i.x) * 0.55, i.y + (shore.y - i.y) * 0.55);
        const p = inland(a, crossing.a);
        const q = inland(b, crossing.b);
        svg += borderRoadSvg(p, q, deck, state);
        mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 - deck * 3 };
      } else {
        const p = S(shorePoint(a, b).x, shorePoint(a, b).y);
        const q = S(shorePoint(b, a).x, shorePoint(b, a).y);
        const bend = 0.18 * Math.hypot(q.x - p.x, q.y - p.y);
        const nx = -(q.y - p.y) / (Math.hypot(q.x - p.x, q.y - p.y) || 1);
        const ny = (q.x - p.x) / (Math.hypot(q.x - p.x, q.y - p.y) || 1);
        const c = { x: (p.x + q.x) / 2 + nx * bend, y: (p.y + q.y) / 2 + ny * bend };
        // Far routes are a faint web until you pick (or point at) an island; then its own routes come up.
        svg += `<path class="isles-route${state}" d="M${p.x},${p.y} Q${c.x},${c.y} ${q.x},${q.y}" style="stroke-width:${(0.6 + Math.log2(crossing.count + 1) * (on ? 0.5 : 0.28)).toFixed(2)}px" />`;
        mid = { x: (p.x + 2 * c.x + q.x) / 4, y: (p.y + 2 * c.y + q.y) / 4 };
      }
      // Counts only for the island in focus: on the whole shelf they'd bury the map.
      if (on) {
        const text = `${crossing.count} ${crossing.count === 1 ? "link" : "links"}`;
        const bw = text.length * 6.6 + 14;
        placed.push({ x: mid.x - bw / 2, y: mid.y - 10, w: bw, h: 20 });
        parts.push(`<button type="button" class="isles-route-count is-on" style="left:${mid.x}px;top:${mid.y}px" data-passage="${esc(crossing.from)}|${esc(crossing.to)}" aria-label="${esc(`${crossing.count} linked notes between ${a.label} and ${b.label}`)}">${text}</button>`);
      }
    }
    lines.innerHTML = svg;
```

- [ ] **Step 4: Ships only work far routes.** In `mountSeaLife(..., { passages: … })`, use:

```ts
    passages: model.crossings.filter(c => c.kind === "far").flatMap(p => {
```

  The callback body is unchanged; it reads `p.from`, `p.to` and `p.count`, which `Crossing` has.

- [ ] **Step 5: Legend.** Replace `<li><i class="atlas-key atlas-key--road"></i>Sea route: notes linked across two books</li>` with:

```html
        <li><i class="atlas-key atlas-key--road"></i>Rope bridge: a neighbouring book you linked once; stone bridge: twice</li>
        <li><i class="atlas-key atlas-key--road"></i>Shared land and a border road: neighbours you linked three or more times</li>
        <li><i class="atlas-key atlas-key--road"></i>Dotted route: links to a book across the sea</li>
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/shelf`
Expected: PASS.

Also run `npx tsc --noEmit -p . 2>&1 | grep "src/shelf/\(archipelago\|crossings\|islandShape\|atlasTerrain\)"`.
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/shelf/archipelagoView.ts
git commit -m "Knowledge: the islands map draws bridges, border roads and far routes"
```

---

### Task 6: The book's own map inside its shared coast

**Files:**
- Modify: `src/shelf/atlasLayout.ts` (types, constants, `buildAtlas`).
- Modify: `src/shelf/atlasLayout.test.ts`.

- [ ] **Step 1: Types.** Add to `src/shelf/atlasLayout.ts`:

```ts
/** A linked neighbour met at this book's coast, in this map's space: a bridge from shore to shore, or a road from a town over the border. */
export type AtlasCrossing = { key: string; label: string; kind: MeetingKind; count: number; from: Pt; to: Pt; fromId?: string; toId?: string };
```

  On `AtlasModel`, add `crossings?: AtlasCrossing[];`.

- [ ] **Step 2: Write the failing tests.** In `src/shelf/atlasLayout.test.ts`:
   - Update the imports.
   - Replace the "province per chapter" test.
   - Add the new tests to `describe("buildAtlas")`.

```ts
import { buildAtlas, groupChapters, noteThemes, type AtlasContext } from "./atlasLayout";
import { terrainField } from "./atlasTerrain";
import { SEA_LEVEL, islandShape } from "./islandShape";
```

```ts
  it("makes a region per chapter round the island in reading order, fogging the unwritten ones", () => {
    expect(atlas.source).toBe("chapters");
    expect(atlas.provinces.map(p => p.explored)).toEqual([true, true, false, false, false, false, false, false]);
    // Clockwise from the north-west: bearings increase once unwrapped from the start.
    const { x, y } = atlas.island!;
    const start = -0.75 * Math.PI;
    const turns = atlas.provinces.map(p => ((Math.atan2(p.y - y, p.x - x) - start) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI));
    expect([...turns].sort((a, b) => a - b)).toEqual(turns);
  });

  it("draws the book as the same island it is on the Archipelago, scaled up, its shape not claiming colour", () => {
    const shape = [...islandShape(book.key).base, ...islandShape(book.key).islets];
    const own = atlas.land!.filter(l => l.province === book.key);
    expect(own).toHaveLength(shape.length);
    const r = own[0]!.sigma / shape[0]!.sigma;
    expect(r).toBeCloseTo(atlas.island!.r);
    own.forEach((l, i) => {
      expect(l.x).toBeCloseTo(atlas.island!.x + shape[i]!.x * r);
      expect(l.vote).toBe(false);
    });
  });

  it("keeps every placed town on land and loose notes on an islet offshore", () => {
    const field = terrainField(atlas);
    const { x, y, r } = atlas.island!;
    for (const t of atlas.towns) {
      if (t.province === "loose") expect(Math.hypot(t.x - x, t.y - y)).toBeGreaterThan(r);
      expect(field(t.x, t.y).e).toBeGreaterThan(SEA_LEVEL);
    }
  });

  it("shows a joined neighbour at the edge with a road over the border, instead of a sea route", () => {
    const context: AtlasContext = {
      island: { x: 500, y: 500, r: 100 },
      neighbours: [{ key: "peak", label: "Peak", kind: "joined", count: 3, x: 720, y: 500, r: 110, colour: 5, a: { x: 590, y: 500 }, b: { x: 610, y: 500 } }],
    };
    const joined = buildAtlas(book, Date.parse("2026-10-03T00:00:00.000Z"), context);
    expect(joined.provinces.find(p => p.id === "peak")).toMatchObject({ neighbour: true });
    expect(joined.crossings).toEqual([expect.objectContaining({ key: "peak", kind: "joined", count: 3, fromId: "d" })]);
    expect(joined.routes).toEqual([]);
    const { x, y, r } = joined.island!;
    const k = r / (100 * 0.86);
    expect(terrainField(joined)(x + 100 * k, y).e).toBeGreaterThan(SEA_LEVEL);
  });
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run src/shelf/atlasLayout.test.ts`
Expected: FAIL, because `atlas.island` is undefined.

- [ ] **Step 4: Rewrite the geometry in `buildAtlas`**

1. Imports and constants at the top of `src/shelf/atlasLayout.ts`:

```ts
import { COAST, islandRadius, islandShape, landFor, neckLand, reachAt } from "./islandShape";
```

```ts
export const WORLD_HEIGHT = 1100;
const MAP_WIDTH = 1500;
/** The book's coast radius on its own map. */
const VIEW_R = 340;
/** Regions start in the north-west and run clockwise in reading order. */
const START = -0.75 * Math.PI;
```

   Remove `PROVINCE_SPACING`.

2. Signature: `export function buildAtlas(book: BookModel, now = Date.now(), context?: AtlasContext): AtlasModel {`. Keep the buckets code as is, then replace everything from `const count = …` down to (but not including) `relax(towns, provinces);` with:

```ts
  const width = MAP_WIDTH;
  const height = WORLD_HEIGHT;
  const cx = width / 2;
  const cy = height / 2;
  const seed = hash(book.key) * Math.PI * 2;
  const here = context?.island ?? { x: 0, y: 0, r: islandRadius(book.noteCount) };
  // The book's island is the same shape as on the Archipelago, scaled so its coast sits at VIEW_R.
  const k = VIEW_R / (here.r * COAST);
  const view = (p: Pt) => ({ x: cx + (p.x - here.x) * k, y: cy + (p.y - here.y) * k });
  const shape = islandShape(book.key);
  const reach = (angle: number) => reachAt(shape, angle) * VIEW_R;
  const land: AtlasLand[] = landFor(shape, cx, cy, VIEW_R, book.key, false);

  // Chapters (or themes) become wedges round the island, sized by their notes; empty ones keep a sliver.
  const weights = buckets.map(b => Math.max(1, b.notes.length));
  const total = weights.reduce((sum, n) => sum + n, 0) || 1;
  let turn = START;
  const spans = weights.map(weight => {
    const from = turn;
    const span = (weight / total) * Math.PI * 2;
    turn += span;
    return { from, span };
  });
  const provinces: AtlasProvince[] = buckets.map((bucket, i) => {
    const { from, span } = spans[i]!;
    const mid = from + span / 2;
    const d = buckets.length > 1 ? reach(mid) * 0.55 : 0;
    return { id: bucket.id, label: bucket.label, detail: bucket.detail, start: bucket.start, end: bucket.end, x: cx + Math.cos(mid) * d, y: cy + Math.sin(mid) * d, radius: VIEW_R * 0.32, explored: bucket.notes.length > 0, colour: i };
  });
  const regionAt = (angle: number) => {
    const t = (((angle - START) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const i = spans.findIndex(s => t >= s.from - START && t < s.from - START + s.span);
    return provinces[i < 0 ? provinces.length - 1 : i]?.id;
  };
```

   Keep the `towns` array and the `settle` helper unchanged. Then replace the bucket settling and loose-notes blocks with:

```ts
  buckets.forEach((bucket, i) => {
    const { from, span } = spans[i]!;
    bucket.notes.forEach((note, n) => {
      const t = (n + 0.5) / bucket.notes.length;
      // Spread through the region's wedge, earlier pages nearer the middle of the island.
      const a = buckets.length > 1 ? from + span * (0.1 + 0.8 * ((n * 0.618034 + 0.31) % 1)) : n * 2.399963 + seed;
      const d = reach(a) * (buckets.length > 1 ? 0.22 + 0.58 * Math.sqrt(t) : 0.78 * Math.sqrt(t));
      settle(note, provinces[i]!.id, cx + Math.cos(a) * d, cy + Math.sin(a) * d);
    });
  });
  if (book.loose.length) {
    // Loose notes wait on the largest islet offshore, grown to hold them (or one raised south-east).
    const islet = [...shape.islets].sort((a, b) => b.sigma - a.sigma)[0] ?? { x: 0.95, y: 0.95, sigma: 0.08 };
    const bearing = Math.atan2(islet.y, islet.x);
    const spread = 26 * Math.sqrt(book.loose.length);
    const sigma = Math.max(islet.sigma * VIEW_R, spread * 0.9 + 22);
    const out = Math.max(Math.hypot(islet.x, islet.y) * VIEW_R, reach(bearing) + sigma * 1.25 + 30);
    const hx = cx + Math.cos(bearing) * out;
    const hy = cy + Math.sin(bearing) * out;
    land.push({ province: "loose", x: hx, y: hy, amp: 0.85, sigma, vote: true });
    book.loose.forEach((note, n) => {
      const angle = n * 2.399963;
      const dist = 26 * Math.sqrt(n + 0.5);
      settle(note, "loose", hx + Math.cos(angle) * dist, hy + Math.sin(angle) * dist * 0.7);
    });
  }
```

3. After `relax(towns, provinces);`, keep placed towns inside the coast:

```ts
  for (const town of towns) {
    if (town.province === "loose") continue;
    const a = Math.atan2(town.y - cy, town.x - cx);
    const max = reach(a) * 0.86;
    if (Math.hypot(town.x - cx, town.y - cy) > max) {
      town.x = cx + Math.cos(a) * max;
      town.y = cy + Math.sin(a) * max;
    }
  }
```

4. Neighbours, after the roads block:

```ts
  // Linked neighbours at the edge: their own shapes (faded), and a neck of shared land for joined ones.
  const neighbours = context?.neighbours ?? [];
  for (const n of neighbours) {
    const centre = view(n);
    const coast = n.r * COAST * k;
    land.push(...landFor(islandShape(n.key), centre.x, centre.y, coast, n.key));
    provinces.push({ id: n.key, label: n.label, x: centre.x, y: centre.y, radius: coast * 0.5, explored: true, colour: n.colour, neighbour: true });
    if (n.kind === "joined") {
      const shore = view(n.a);
      land.push(...neckLand(shore, view(n.b), 0.5 * Math.min(VIEW_R, coast), regionAt(Math.atan2(shore.y - cy, shore.x - cx)) ?? book.key, n.key));
    }
  }
```

5. Routes and crossings. Change the `routes` construction to skip neighbours, and build `crossings` from the same `perBook` map:

```ts
  const nextDoor = new Set(neighbours.map(n => n.key));
  const busiest = (toBook: string) => {
    const entry = perBook.get(toBook);
    return entry ? [...entry.from].sort((a, b) => b[1] - a[1])[0]![0] : undefined;
  };
  const routes: AtlasRoute[] = [...perBook].filter(([toBook]) => !nextDoor.has(toBook)).map(([toBook, entry]) => {
    const fromId = busiest(toBook)!;
    const town = byId.get(fromId)!;
    const side = town.y < height * 0.42 ? "north" : town.y > height * 0.62 ? "south" : town.x < width / 2 ? "west" : "east";
    return { fromId, toBook, toLabel: entry.label, count: entry.count, side, x: town.x, y: town.y };
  });
  const crossings: AtlasCrossing[] = neighbours.map(n => {
    const fromId = busiest(n.key);
    const town = fromId ? byId.get(fromId) : undefined;
    const toId = book.links.find(l => l.toBook === n.key && l.fromId === fromId)?.toId;
    const here = view(n.a);
    const there = view(n.b);
    if (n.kind !== "joined") return { key: n.key, label: n.label, kind: n.kind, count: n.count, from: here, to: there, fromId, toId };
    // The road runs from the town with most links to that book, over the border, into its land.
    const centre = view(n);
    const to = { x: there.x + (centre.x - there.x) * 0.45, y: there.y + (centre.y - there.y) * 0.45 };
    return { key: n.key, label: n.label, kind: n.kind, count: n.count, from: town ? { x: town.x, y: town.y } : here, to, fromId, toId };
  });
```

6. Fog drifts off the nearest shore. Replace the fog loop with:

```ts
  const fogs: AtlasFog[] = [];
  for (const town of towns) {
    if (!town.note.gaps.length || fogs.length >= 6) continue;
    // Open questions drift offshore, just beyond the coast nearest the town that asked.
    const a = Math.atan2(town.y - cy, town.x - cx);
    const d = Math.max(reach(a), Math.hypot(town.x - cx, town.y - cy)) + 110;
    fogs.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, text: town.note.gaps[0]!, noteId: town.note.id });
  }
```

7. Bounds and return:

```ts
  const xs = [cx - VIEW_R * 1.15, cx + VIEW_R * 1.15, ...towns.map(t => t.x), ...fogs.map(f => f.x)];
  const ys = [cy - VIEW_R * 1.15 - 40, cy + VIEW_R * 1.15, ...towns.map(t => t.y), ...fogs.map(f => f.y)];
  const bx = Math.max(0, Math.min(...xs) - 40);
  const by = Math.max(0, Math.min(...ys) - 40);
  const bounds = { x: bx, y: by, w: Math.min(width, Math.max(...xs) + 40) - bx, h: Math.min(height, Math.max(...ys) + 40) - by };
  return {
    width, height, bounds, source, provinces, towns, roads, routes, fogs, land, crossings,
    frame: { unit: k, ox: here.x - cx / k, oy: here.y - cy / k },
    island: { x: cx, y: cy, r: VIEW_R },
  };
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/shelf`
Expected: PASS.

If "keeps towns apart" fails after clamping, lower the clamp from 0.86 to 0.8 of `reach`.

- [ ] **Step 6: Commit**

```bash
git add src/shelf/atlasLayout.ts src/shelf/atlasLayout.test.ts
git commit -m "Knowledge: a book's map is its archipelago island, scaled up, with chapters as regions and neighbours at the edge"
```

---

### Task 7: Book view draws neighbours; the shelf passes context

**Files:**
- Modify: `src/shelf/atlasView.ts`.
- Modify: `src/shelf/view.ts:873`.

- [ ] **Step 1: Imports and cache key** in `atlasView.ts`:

```ts
import { borderRoadSvg, bridgeSvg } from "./crossingsSvg";
```

```ts
function terrainKey(book: BookModel, atlas: AtlasModel) {
  return `${book.key}|${atlas.width}|${atlas.towns.map(t => `${t.note.id}:${t.x.toFixed(0)},${t.y.toFixed(0)}:${t.peak ? 1 : 0}`).join(";")}|${atlas.provinces.map(p => `${p.id}${p.explored ? 1 : 0}${p.neighbour ? "n" : ""}`).join(",")}|${(atlas.crossings ?? []).map(c => c.kind).join(",")}`;
}
```

- [ ] **Step 2: Draw crossings and their labels** in `drawMarks()`, right after the `for (const route of atlas.routes) { … }` loop and before `lines.innerHTML = svg;`:

```ts
    const deck = Math.max(2.5, Math.min(12, 10 * scale));
    for (const crossing of atlas.crossings ?? []) {
      const p = S(crossing.from.x, crossing.from.y);
      const q = S(crossing.to.x, crossing.to.y);
      const hot = selected && selected === crossing.fromId ? " is-on" : "";
      svg += crossing.kind === "joined" ? borderRoadSvg(p, q, deck, hot) : bridgeSvg(crossing.kind, p, q, deck, hot);
      const text = `${crossing.kind === "joined" ? "Over the border:" : "Bridge to"} ${crossing.label}`;
      const lw = Math.min(w - 24, text.length * 7.2 + 40);
      const x = Math.min(w - lw - 8, Math.max(8, q.x - lw / 2));
      const y = Math.min(h - 38, Math.max(10, q.y + 12));
      routeRects.push({ x, y, w: lw, h: 28 });
      routeLabels.push(`<button type="button" class="atlas-route-label" style="left:${x}px;top:${y}px;max-width:${lw}px;--c:${handlers.swatchFor(crossing.key)?.fill ?? "var(--shallow)"}" data-route="${esc(crossing.key)}">${esc(text)}<span> · ${crossing.count}</span></button>`);
    }
```

- [ ] **Step 3: Province labels skip neighbours and stop assuming columns.** Change:

```ts
    const columnWidth = Math.max(110, Math.min(240, 260 * scale));
    // ...
    const named = [...atlas.provinces.filter(p => !p.neighbour).map(p => ({ id: p.id, label: p.label, explored: p.explored, x: p.x, y: p.y, r: p.radius, start: p.start, end: p.end }))];
```

- [ ] **Step 4: Route clicks open neighbours at the linked note.** In `release`:

```ts
      else if (target?.dataset.route) {
        const key = target.dataset.route;
        const route = atlas.routes.find(r => r.toBook === key);
        const crossing = atlas.crossings?.find(c => c.key === key);
        handlers.goBook(key, crossing?.toId ?? book.links.find(l => l.toBook === route?.toBook && l.fromId === route?.fromId)?.toId);
      } else showCard(undefined);
```

- [ ] **Step 5: Sea life keeps clear of the island and its neighbours.** In `mountSeaLife(world, { … lands: … })`:

```ts
    lands: [
      ...(atlas.island ? [{ x: atlas.island.x, y: atlas.island.y, r: atlas.island.r * 1.35 + 60 }] : []),
      ...atlas.provinces.map(p => ({ x: p.x, y: p.y, r: p.neighbour ? p.radius * 2.8 + 60 : p.radius * 1.6 + 70 })),
      ...atlas.towns.map(t => ({ x: t.x, y: t.y, r: 150 })),
    ],
```

- [ ] **Step 6: Legend.** After the Road item, add:

```html
        <li><i class="atlas-key atlas-key--road"></i>Bridge: a neighbouring book you linked once or twice</li>
        <li><i class="atlas-key atlas-key--road"></i>Border road: a neighbour you linked three or more times shares your land</li>
```

- [ ] **Step 7: `view.ts` passes context.** Update the import and the call at :873:

```ts
import { atlasContext, buildArchipelago } from "./archipelagoLayout";
```

```ts
      const context = atlasContext(buildArchipelago(books, Date.now(), phone.matches ? "tall" : "wide"), book.key);
      atlasTeardown = mountAtlas(shell.querySelector<HTMLElement>("[data-map]")!, book, buildAtlas(book, Date.now(), context), {
```

- [ ] **Step 8: Run tests and type-check**

Run: `npx vitest run src/shelf`
Expected: PASS.

Run: `npx tsc --noEmit -p . 2>&1 | grep "^src/shelf/" | grep -v constellation`
Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add src/shelf/atlasView.ts src/shelf/view.ts
git commit -m "Knowledge: a book's map shows its bridged and joined neighbours; the shelf hands it its place"
```

---

### Task 8: Look at it in the browser

**Files:** none in the repo. A gitignored local data copy is used for the preview.

- [ ] **Step 1: Give local data some cross-book links.** Local notes have none. In the gitignored copy `migrated/data-repo/manifest.json`, pick two books in one notebook and add 3 mutual `connected` ids between their notes. Pick a third book and add 1 mutual link to one of the first two. Pick a fourth and add 2. Do not commit this.
- [ ] **Step 2:** Start the dev server (`knowledge-engravings` launch config) and open `#bookshelf`, then Islands. Check:
   - The islands are rounder.
   - The joined pair shares land, with a dashed border and a road.
   - The rope and stone bridges render.
   - The far route is a dotted line.
   - Hovering brings up counts.
- [ ] **Step 3:** Open a joined book. Check:
   - Its coast matches its island on the Archipelago.
   - Chapters are regions inside the coast.
   - The neighbour is faded at the edge, with the road and the "Over the border" label.
   - Clicking the label opens the neighbour.
- [ ] **Step 4:** Switch the sky to night (`document.querySelector('.atlas').dataset.sky = 'night'`). Bridges and roads should turn pale.
- [ ] **Step 5:** Run the full suite: `npm test`. It should pass apart from failures that already fail on `main`; record any.
- [ ] **Step 6:** Screenshot both views for Adam.
