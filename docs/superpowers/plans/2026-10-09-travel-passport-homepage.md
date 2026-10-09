# Travel Passport Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Travel `#/` into an interactive visited-countries map over a timeline of all trips, with New trip retained.

**Architecture:** Extend trip list summaries with `countries`. Pure helpers compute the visited set (past-only) and match free-text country names to Natural Earth. A new `passport-map` SVG component fills visited countries and emits tap events. `trips-list` composes map + timeline cards + existing New trip form; card highlight follows map selection.

**Tech Stack:** Vite Travel SPA (TypeScript), d3-geo, topojson-client, `world-atlas/countries-110m`, existing `zoomable` helper, Netlify `travel-trips` list via `tripSummary()`, vitest + happy-dom, root `pre-pr-check`.

**Spec:** `docs/superpowers/specs/2026-10-09-travel-passport-homepage-design.md`

## Global Constraints

- Visited fill = trips with `end_date` **before** today (UTC `YYYY-MM-DD`); in-progress and upcoming do not fill.
- One timeline for all trips; sort `start_date` descending.
- Map tap highlights matching cards and scrolls to the first; does not auto-open a trip.
- Unmatched country strings never invent a fill.
- Design kit tokens only; no new map library; do not merge with per-trip `world-map.ts`.
- Phone map height `min(42vh, 280px)`; R4 on New trip form at 390.
- Branch: `cursor/travel-passport-homepage-b59d` off latest `origin/main`.
- Run `node scripts/pre-pr-check.mjs` (exit 0) before opening/updating the PR.

## File map

| File | Role |
|------|------|
| `netlify/functions/_shared/travel-schema.mjs` | `tripSummary()` adds `countries` |
| `apps/travel/src/types.ts` | `TripSummary.countries: string[]` |
| `apps/travel/scripts/mock-api.ts` | List summaries include `countries` |
| `apps/travel/src/lib/visited-countries.ts` | Pure: alias match, visited set, filter trips |
| `apps/travel/tests/unit/visited-countries.test.ts` | Unit tests for helpers |
| `apps/travel/src/components/passport-map.ts` | Countries SVG map |
| `apps/travel/src/views/trips-list.ts` | Homepage composition |
| `apps/travel/src/styles/travel.css` | Passport map + timeline card styles |
| `tests/unit/` (root) | Optional schema summary assertion if existing travel schema tests cover `tripSummary` |

---

### Task 1: TripSummary includes countries

**Files:**
- Modify: `netlify/functions/_shared/travel-schema.mjs` (`tripSummary`)
- Modify: `apps/travel/src/types.ts` (`TripSummary`)
- Modify: `apps/travel/scripts/mock-api.ts` (GET `/api/travel-trips` summaries)
- Test: `apps/travel/tests/unit/trip-summary-countries.test.ts` (new; import schema via relative path from travel tests **or** add root `tests/unit/travel-trip-summary.test.js` — prefer root node:test next to other schema tests if one exists; otherwise a small vitest that duplicates the unique-country logic in a shared pure export)

**Interfaces:**
- Consumes: full `Trip` with `cities[].country`
- Produces: `tripSummary(trip)` → `{ id, title, start_date, end_date, cities: string[], countries: string[] }` where `countries` is unique `city.country` values in first-appearance order (skip empty/whitespace)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/travel-trip-summary.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { tripSummary } from '../../netlify/functions/_shared/travel-schema.mjs';

test('tripSummary lists unique countries in first-appearance order', () => {
  const summary = tripSummary({
    id: 'trp_x',
    title: 'T',
    start_date: '2026-01-01',
    end_date: '2026-01-10',
    cities: [
      { name: 'Lisbon', country: 'Portugal' },
      { name: 'Porto', country: 'Portugal' },
      { name: 'Seoul', country: 'South Korea' },
      { name: 'Nowhere', country: '  ' }
    ]
  });
  assert.deepEqual(summary.cities, ['Lisbon', 'Porto', 'Seoul', 'Nowhere']);
  assert.deepEqual(summary.countries, ['Portugal', 'South Korea']);
});
```

(If `tripSummary` requires a full validated trip, build a minimal object that matches what `tripSummary` actually reads — only the fields it uses — do not call `validateTrip` in this test.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/travel-trip-summary.test.js`  
Expected: FAIL (no `countries` on summary)

- [ ] **Step 3: Implement summary + types + mock**

In `travel-schema.mjs`:

```js
export function tripSummary(trip) {
  const countries = [];
  const seen = new Set();
  for (const city of trip.cities || []) {
    const country = typeof city.country === 'string' ? city.country.trim() : '';
    if (!country || seen.has(country)) continue;
    seen.add(country);
    countries.push(country);
  }
  return {
    id: trip.id,
    title: trip.title,
    start_date: trip.start_date,
    end_date: trip.end_date,
    cities: (trip.cities || []).map((c) => c.name),
    countries
  };
}
```

In `types.ts`:

```ts
export interface TripSummary {
  id: string;
  title: string;
  start_date: IsoDate;
  end_date: IsoDate;
  cities: string[];
  countries: string[];
}
```

In `mock-api.ts` list handler, mirror the same `countries` unique-trim logic when building summaries.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/travel-trip-summary.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/travel-schema.mjs apps/travel/src/types.ts apps/travel/scripts/mock-api.ts tests/unit/travel-trip-summary.test.js
git commit -m "Travel: include countries on trip list summaries"
```

---

### Task 2: Visited-country pure helpers

**Files:**
- Create: `apps/travel/src/lib/visited-countries.ts`
- Create: `apps/travel/tests/unit/visited-countries.test.ts`

**Interfaces:**
- Consumes: `TripSummary[]`, atlas country names (`string`), today ISO date
- Produces:
  - `normalizeCountryKey(name: string): string` — trim + lowercase
  - `matchAtlasCountry(raw: string, atlasNames: Iterable<string>): string | null`
  - `visitedAtlasCountries(trips: TripSummary[], atlasNames: Iterable<string>, todayIso: string): Set<string>`
  - `tripsForAtlasCountry(trips: TripSummary[], atlasCountry: string, atlasNames: Iterable<string>): TripSummary[]`

Alias table (minimum):

```ts
const ALIASES: Record<string, string> = {
  uk: 'United Kingdom',
  'u.k.': 'United Kingdom',
  'united kingdom': 'United Kingdom',
  'great britain': 'United Kingdom',
  britain: 'United Kingdom',
  usa: 'United States of America',
  us: 'United States of America',
  'u.s.': 'United States of America',
  'u.s.a.': 'United States of America',
  'united states': 'United States of America',
  'united states of america': 'United States of America',
  korea: 'South Korea',
  'south korea': 'South Korea',
  'republic of korea': 'South Korea',
  turkiye: 'Turkey',
  türkiye: 'Turkey'
};
```

Visited rule: include a trip’s countries only when `trip.end_date < todayIso`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  matchAtlasCountry,
  tripsForAtlasCountry,
  visitedAtlasCountries
} from '@/lib/visited-countries';
import type { TripSummary } from '@/types';

const ATLAS = ['Portugal', 'Malaysia', 'United Kingdom', 'United States of America', 'South Korea', 'Turkey'];

function trip(partial: Partial<TripSummary> & Pick<TripSummary, 'id' | 'end_date' | 'countries'>): TripSummary {
  return {
    title: partial.title ?? partial.id,
    start_date: partial.start_date ?? '2020-01-01',
    cities: partial.cities ?? [],
    ...partial
  };
}

describe('matchAtlasCountry', () => {
  it('matches exact and aliases', () => {
    expect(matchAtlasCountry('Portugal', ATLAS)).toBe('Portugal');
    expect(matchAtlasCountry('UK', ATLAS)).toBe('United Kingdom');
    expect(matchAtlasCountry('USA', ATLAS)).toBe('United States of America');
    expect(matchAtlasCountry('Korea', ATLAS)).toBe('South Korea');
    expect(matchAtlasCountry('Narnia', ATLAS)).toBeNull();
  });
});

describe('visitedAtlasCountries', () => {
  const today = '2026-10-09';
  it('fills only finished trips', () => {
    const trips = [
      trip({ id: 'past', end_date: '2025-01-01', countries: ['Portugal'] }),
      trip({ id: 'now', start_date: '2026-10-01', end_date: '2026-10-20', countries: ['Malaysia'] }),
      trip({ id: 'future', start_date: '2027-03-01', end_date: '2027-03-10', countries: ['South Korea'] })
    ];
    const visited = visitedAtlasCountries(trips, ATLAS, today);
    expect([...visited].sort()).toEqual(['Portugal']);
  });
});

describe('tripsForAtlasCountry', () => {
  it('returns all trips that map to that atlas country', () => {
    const trips = [
      trip({ id: 'a', end_date: '2025-01-01', countries: ['UK'] }),
      trip({ id: 'b', end_date: '2024-01-01', countries: ['United Kingdom'] }),
      trip({ id: 'c', end_date: '2024-01-01', countries: ['Portugal'] })
    ];
    expect(tripsForAtlasCountry(trips, 'United Kingdom', ATLAS).map((t) => t.id).sort()).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/travel && npm test -- tests/unit/visited-countries.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Implement `visited-countries.ts`**

Implement the four exports with the alias table above. `matchAtlasCountry`: try alias map → exact case-insensitive against atlas set. `visitedAtlasCountries`: for each finished trip, match each country into a `Set`. `tripsForAtlasCountry`: trips whose any country matches the given atlas name (all trips, not only finished — so highlighting works for history cards; map fill still past-only).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/travel && npm test -- tests/unit/visited-countries.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/travel/src/lib/visited-countries.ts apps/travel/tests/unit/visited-countries.test.ts
git commit -m "Travel: visited-country matching helpers for passport map"
```

---

### Task 3: Passport map component

**Files:**
- Create: `apps/travel/src/components/passport-map.ts`
- Modify: `apps/travel/src/styles/travel.css` (passport map classes)
- Test: `apps/travel/tests/unit/passport-map.test.ts` (render + click callback with happy-dom)

**Interfaces:**
- Consumes: `visited: Set<string>` (atlas names), optional `selected: string | null`
- Produces: `renderPassportMap(host, options) => { setVisited, setSelected, destroy }`
- Options: `{ visited: Set<string>; selected?: string | null; onSelect: (atlasCountry: string | null) => void }`

Implementation notes:

- Import `countries-110m` from `world-atlas/countries-110m.json` and `feature` from `topojson-client`.
- `geoNaturalEarth1()` + `fitExtent` on Sphere (same view size spirit as trip map: viewBox `0 0 1000 540`).
- Draw each country path; class `passport-country`; add `is-visited` when name ∈ visited; `is-on` when selected.
- Click visited path → `onSelect(name)`; click same again or background → `onSelect(null)`.
- Wire `zoomable(svg, wrap)`.
- Host structure: `.passport` > svg; CSS height `min(42vh, 280px)` on phone via media query, taller on desktop (e.g. `min(52vh, 420px)`).

- [ ] **Step 1: Write the failing interaction test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { renderPassportMap } from '@/components/passport-map';

describe('renderPassportMap', () => {
  it('notifies onSelect when a visited country path is clicked', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const onSelect = vi.fn();
    renderPassportMap(host, {
      visited: new Set(['Portugal']),
      onSelect
    });
    const path = host.querySelector('path.passport-country.is-visited') as SVGPathElement | null;
    expect(path).toBeTruthy();
    path!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSelect).toHaveBeenCalledWith('Portugal');
  });
});
```

(If Natural Earth path for Portugal is hard to find in happy-dom without full layout, assert via `data-country="Portugal"` attribute set on each path.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/travel && npm test -- tests/unit/passport-map.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement passport-map + CSS**

Implement as above. Use kit CSS variables for fills (e.g. visited fill `var(--pastel-sage)` / stroke `var(--success)` or navy soft — pick from tokens already used in Travel). Unvisited: light land wash + quiet stroke `var(--line)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/travel && npm test -- tests/unit/passport-map.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/travel/src/components/passport-map.ts apps/travel/src/styles/travel.css apps/travel/tests/unit/passport-map.test.ts
git commit -m "Travel: passport countries map with visited fill and tap"
```

---

### Task 4: Homepage timeline + map wiring

**Files:**
- Modify: `apps/travel/src/views/trips-list.ts`
- Modify: `apps/travel/src/styles/travel.css` (timeline card highlight / muted states)
- Test: `apps/travel/tests/unit/trips-list-passport.test.ts` (render with mocked `listTrips`, assert map host + card order + highlight class)

**Interfaces:**
- Consumes: `listTrips()`, `renderPassportMap`, `visitedAtlasCountries`, `tripsForAtlasCountry`, `tripRoute`
- Produces: updated `#/` view

Behaviour:

1. Load trips; sort by `start_date` descending for the timeline.
2. Build atlas name list once from the topojson countries features.
3. `visited = visitedAtlasCountries(trips, atlasNames, todayIso)`.
4. Render title/subcopy: e.g. `N trips · K countries visited`.
5. Render passport map; onSelect → set `data-active-country` on matching `.trips-list__card` via `data-trip-id`, add `.is-map-hit` / mute others with `.is-dimmed`, `scrollIntoView({ block: 'nearest' })` on first match.
6. Cards: keep link behaviour; richer hierarchy (h3, dates+status line, chips). Add `data-trip-id`, `data-countries` not required if filter uses helper.
7. Keep New trip form + import unchanged (R4 classes already present).

- [ ] **Step 1: Write the failing list test**

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/api/travel', () => ({
  listTrips: vi.fn(async () => ({
    trips: [
      {
        id: 'trp_future',
        title: 'Future',
        start_date: '2027-03-01',
        end_date: '2027-03-10',
        cities: ['Seoul'],
        countries: ['South Korea']
      },
      {
        id: 'trp_past',
        title: 'Past',
        start_date: '2025-01-01',
        end_date: '2025-01-10',
        cities: ['Lisbon'],
        countries: ['Portugal']
      }
    ]
  })),
  createTrip: vi.fn()
}));

import { listTrips } from '@/api/travel';
import { renderTripsList } from '@/views/trips-list';

describe('renderTripsList passport homepage', () => {
  beforeEach(() => {
    vi.mocked(listTrips).mockClear();
  });

  it('renders passport map and upcoming card before finished', async () => {
    const canvas = document.createElement('div');
    await renderTripsList(canvas, { isCurrent: () => true });
    expect(canvas.querySelector('.passport')).toBeTruthy();
    const ids = [...canvas.querySelectorAll('.trips-list__card')].map((el) =>
      el.getAttribute('data-trip-id')
    );
    expect(ids[0]).toBe('trp_future');
    expect(ids[1]).toBe('trp_past');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/travel && npm test -- tests/unit/trips-list-passport.test.ts`  
Expected: FAIL (no `.passport`)

- [ ] **Step 3: Implement trips-list composition + CSS**

Rewrite `renderTripsList` to include the map host and timeline section as specified. Preserve empty state + New trip.

- [ ] **Step 4: Run tests**

Run: `cd apps/travel && npm test -- tests/unit/trips-list-passport.test.ts tests/unit/visited-countries.test.ts tests/unit/passport-map.test.ts`  
Expected: PASS

Also: `cd apps/travel && npm run typecheck`  
Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add apps/travel/src/views/trips-list.ts apps/travel/src/styles/travel.css apps/travel/tests/unit/trips-list-passport.test.ts
git commit -m "Travel: passport map and trip timeline on Trips homepage"
```

---

### Task 5: Manual verification + PR

**Files:** none required beyond fixes discovered in testing

- [ ] **Step 1: Start Travel locally**

```bash
cd apps/travel && npm run dev -- --host 127.0.0.1 --port 5177
```

Sign in with local passphrase `travel-hub-local`. Ensure at least one finished trip (past `end_date`) with `country: Portugal` and one upcoming trip exist (import fixture and/or create).

- [ ] **Step 2: Desktop (~1280) checks**

- Screenshot `#/`: map + timeline + New trip  
- Confirm Portugal (or finished country) is filled; upcoming country is not  
- Tap filled country → matching card(s) highlight and scroll into view  
- Tap card → opens trip  
- Clear selection (tap ocean / same country again)

- [ ] **Step 3: Phone (390) checks**

- Screenshot map + cards  
- `document.documentElement.scrollWidth === innerWidth`  
- New trip form: open/create path; measure `[data-part="form-actions"]` buttons ≥ 44px and row bottom ≤ `innerHeight` (R4)  
- Record: `checked: R2 R4 L1` (and any other failure-register IDs that apply)

- [ ] **Step 4: pre-pr-check + PR**

```bash
cd /agent/repos/life-hub && node scripts/pre-pr-check.mjs
```

Expected: `pre-pr-check PASSED`

Push branch `cursor/travel-passport-homepage-b59d`, open/update draft PR with summary + screenshots/video artifacts under `/opt/cursor/artifacts/`.

- [ ] **Step 5: Commit any polish fixes found in manual pass**

```bash
git add -A
git commit -m "Travel: polish passport homepage from manual pass"
git push -u origin cursor/travel-passport-homepage-b59d
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Past-only country fill | 2, 3, 4 |
| One timeline all trips, start_date desc | 4 |
| Map tap → highlight cards | 3, 4 |
| Card → trip route | 4 (existing links) |
| Summary `countries` | 1 |
| Alias matching / no silent wrong fill | 2 |
| Phone map height + R4 New trip | 3, 4, 5 |
| Per-trip world-map unchanged | (no task touches it) |
| pre-pr-check + evidence | 5 |
