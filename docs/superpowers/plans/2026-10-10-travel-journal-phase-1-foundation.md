# Travel journal Phase 1 — Foundation and realistic layout

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a fixture-driven continuous journal renderer inside Travel that matches Codex Binding UI revision 2 (sizing matrix, toolbar, moments, KL/Istanbul patterns, transitions) at 390px and desktop — no live storage.

**Architecture:** Add a journal route and pure render modules under `apps/travel/src/journal/`. Feed invented fixture records (two legs, multi-day, sparse/dense moments). Reuse Travel shell and design-kit CSS only. No R2, no journal API, no itinerary schema changes.

**Tech Stack:** Travel Vite + TypeScript, vitest, design-kit CSS/JS, bundled SVG patterns.

**Spec:** `docs/superpowers/specs/2026-10-10-travel-journal-design.md`  
**Product authority:** `docs/future-build-ideas/travel-journal-spec-plan.md`

## Global Constraints

- Extend existing Travel app only — no new site/repo/session/design system.
- Do not modify itinerary schema version 1 or booking records.
- Do not invent palette tokens, type scale, or navy mobile bar; use kit CSS as checked in.
- Inter 400/500/600/700 only; dates via `format-display-date` (`dd/mm/yy`); times `HH:mm` 24h.
- One main reading scroll; no nested scroll on legs/days/map previews/photo groups.
- Decorative SVG: `aria-hidden="true"`, `pointer-events: none`.
- Pattern opacity 0.06–0.10 (hard max 0.12); pattern-off leaves spacing unchanged.
- No live media upload, EXIF, edit persistence, WebGL map mount, export, or sharing in Phase 1.
- Before any PR that touches runtime: `npm run pre-pr-check` from repo root (exit 0).
- UI failure register: read `docs/CURSOR-UI-FAILURES.md`; check applicable IDs (esp. L*, S*, R4 for any sheet stubs).
- Evidence required: screenshots at 390×844 and 1440×900 with fixture data (not generated mockups).

---

## File Structure

| File | Responsibility |
| --- | --- |
| `apps/travel/src/journal/types.ts` | Fixture/read-model types mirroring Codex journal records (Phase 1 subset) |
| `apps/travel/src/journal/fixtures/kl-istanbul.ts` | Two-leg fixture: KL + Istanbul, days, moments, transition, media placeholders |
| `apps/travel/src/journal/patterns/kul.svg` | Malaysian batik-inspired botanical motif (bundled, licence note in sibling `.md`) |
| `apps/travel/src/journal/patterns/ist.svg` | Ottoman Iznik-inspired tulip/carnation motif + licence note |
| `apps/travel/src/journal/patterns/LICENCES.md` | Source + licence for pattern artwork |
| `apps/travel/src/journal/patterns/registry.ts` | `pattern_id` → SVG URL / currentColor mapping |
| `apps/travel/src/journal/layout.ts` | Pure helpers: column widths, photo layout choice, map-preview placement |
| `apps/travel/src/journal/render-journal.ts` | DOM renderer: toolbar, legs, days, moments, transition, pattern layers |
| `apps/travel/src/journal/render-moment.ts` | Single moment article (media grid, metadata, reflection, audio stub) |
| `apps/travel/src/journal/render-toolbar.ts` | Title + Chapter + Add moment toolbar |
| `apps/travel/src/journal/chapter-jump.ts` | Searchable chapter list overlay (legs/days) |
| `apps/travel/src/styles/journal.css` | Journal layout geometry only (kit tokens; no new palette) |
| `apps/travel/src/app/router.ts` | Add `journal` route variant |
| `apps/travel/src/app/main.ts` | Wire journal route → renderer with fixtures |
| `apps/travel/src/views/trip-page.ts` | Entry control to open journal for current trip (fixture mode OK) |
| `apps/travel/tests/unit/journal-layout.test.ts` | Layout helpers |
| `apps/travel/tests/unit/journal-router.test.ts` | Route parse/build |
| `apps/travel/tests/unit/journal-render.test.ts` | DOM structure smoke (happy-dom) |

---

### Task 1: Journal route

**Files:**
- Modify: `apps/travel/src/app/router.ts`
- Modify: `apps/travel/tests/unit/router.test.ts` (or create `tests/unit/journal-router.test.ts`)
- Modify: `apps/travel/src/app/main.ts` (stub paint only after Task 4)

**Interfaces:**
- Produces: `Route` may be `{ name: 'journal'; tripId: string; momentId?: string }`
- Produces: `journalRoute(tripId: string, momentId?: string): string` → `#/trip/${id}/journal` or `#/trip/${id}/journal/${momentId}`

- [ ] **Step 1: Write failing route tests**

```ts
import { describe, expect, it } from 'vitest';
import { parseRoute, journalRoute } from '@/app/router';

describe('journal routes', () => {
  it('parses #/trip/:tripId/journal', () => {
    expect(parseRoute('#/trip/trp_abc/journal')).toEqual({
      name: 'journal',
      tripId: 'trp_abc'
    });
  });

  it('parses optional moment id', () => {
    expect(parseRoute('#/trip/trp_abc/journal/mom_1')).toEqual({
      name: 'journal',
      tripId: 'trp_abc',
      momentId: 'mom_1'
    });
  });

  it('builds journal hashes', () => {
    expect(journalRoute('trp_1')).toBe('#/trip/trp_1/journal');
    expect(journalRoute('trp_1', 'mom_9')).toBe('#/trip/trp_1/journal/mom_9');
  });

  it('does not break existing city/date trip routes', () => {
    expect(parseRoute('#/trip/trp_abc/lis/2027-03-04')).toEqual({
      name: 'trip',
      tripId: 'trp_abc',
      cityId: 'lis',
      date: '2027-03-04'
    });
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd apps/travel && npx vitest run tests/unit/journal-router.test.ts
```

Expected: FAIL (journalRoute / journal route missing).

- [ ] **Step 3: Implement route parse/build**

Extend `Route` and `parseRoute` so `trip/:id/journal` and `trip/:id/journal/:momentId` win before the city/date branch. Keep invalid paths falling back to trips list. Add `journalRoute`.

- [ ] **Step 4: Run test — expect PASS**

```bash
cd apps/travel && npx vitest run tests/unit/journal-router.test.ts tests/unit/router.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/travel/src/app/router.ts apps/travel/tests/unit/journal-router.test.ts apps/travel/tests/unit/router.test.ts
git commit -m "feat(travel): add journal hash route"
```

---

### Task 2: Fixture types and KL–Istanbul records

**Files:**
- Create: `apps/travel/src/journal/types.ts`
- Create: `apps/travel/src/journal/fixtures/kl-istanbul.ts`
- Create: `apps/travel/tests/unit/journal-layout.test.ts` (fixture shape assertions in this or a dedicated fixture test)

**Interfaces:**
- Produces types: `JournalFixture`, `JournalLeg`, `JournalDay`, `JournalMoment`, `JournalMedia`, `JournalTransition` (read-model; lifecycle always `live` in fixtures)
- Produces: `klIstanbulFixture(): JournalFixture` with two legs (`kul`, `ist`), ≥3 days, ≥8 moments covering: 1-photo, 2-photo, 3+-photo with View all, portrait, text-only, long place name, long reflection (>6 lines), empty day marker, one transition flight KL→IST, one day with located moments for map-preview placeholder

- [ ] **Step 1: Write failing fixture integrity test**

```ts
import { describe, expect, it } from 'vitest';
import { klIstanbulFixture } from '@/journal/fixtures/kl-istanbul';

describe('klIstanbulFixture', () => {
  it('has two legs with distinct pattern ids and one transition', () => {
    const j = klIstanbulFixture();
    expect(j.legs).toHaveLength(2);
    expect(j.legs[0]?.pattern_id).toBe('kul');
    expect(j.legs[1]?.pattern_id).toBe('ist');
    expect(j.transitions).toHaveLength(1);
    expect(j.moments.some((m) => m.media_ids.length === 0 && m.text)).toBe(true);
    expect(j.moments.some((m) => m.media_ids.length >= 4)).toBe(true);
    expect(j.moments.some((m) => (m.place?.name.length ?? 0) > 40)).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/travel && npx vitest run tests/unit/journal-layout.test.ts
```

- [ ] **Step 3: Implement types + fixture**

Use placeholder image URLs under `apps/travel/public/journal-fixtures/` (small JPEG/PNG committed for layout only) or inline SVG data URLs for Phase 1. Never invent GPS for “unlocated” moments — omit coordinates.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/travel/src/journal apps/travel/public/journal-fixtures apps/travel/tests/unit/journal-layout.test.ts
git commit -m "feat(travel): add journal fixture types and KL–Istanbul data"
```

---

### Task 3: Layout helpers (sizing matrix)

**Files:**
- Create: `apps/travel/src/journal/layout.ts`
- Modify: `apps/travel/tests/unit/journal-layout.test.ts`

**Interfaces:**
- Produces:
  - `photoLayout(count: number): 'single' | 'pair' | 'lead-pair' | 'lead-pair-more'`
  - `storyColumnMaxRem(): 48`
  - `shouldShowDayMapPreview(moments: { coordinates?: { lat: number; lon: number } }[]): boolean` — true iff ≥1 located moment; at most one preview decision per day caller
  - `truncateReflectionLines(text: string, maxLines = 6): { preview: string; remainder: string | null }`

- [ ] **Step 1: Failing tests for photoLayout and map preview rules**

```ts
import { photoLayout, shouldShowDayMapPreview } from '@/journal/layout';

it('maps photo counts to Codex layouts', () => {
  expect(photoLayout(1)).toBe('single');
  expect(photoLayout(2)).toBe('pair');
  expect(photoLayout(3)).toBe('lead-pair');
  expect(photoLayout(5)).toBe('lead-pair-more');
});

it('shows map preview only when a located moment exists', () => {
  expect(shouldShowDayMapPreview([{ coordinates: undefined }])).toBe(false);
  expect(shouldShowDayMapPreview([{ coordinates: { lat: 41.0, lon: 28.9 } }])).toBe(true);
});
```

- [ ] **Step 2: Run — FAIL → implement → PASS → commit**

```bash
git commit -m "feat(travel): journal layout helpers for photo grids and map preview"
```

---

### Task 4: Pattern SVGs + registry

**Files:**
- Create: `apps/travel/src/journal/patterns/kul.svg`, `ist.svg`, `LICENCES.md`, `registry.ts`

**Interfaces:**
- Produces: `getPattern(patternId: string): { href: string; label: string } | null`
- Neutral fallback when unknown or pattern-off

- [ ] **Step 1:** Add lightweight original SVG motifs using `currentColor` (Wave/sand via CSS). Document source/licence in `LICENCES.md` (original work for hub use, or named licence).

- [ ] **Step 2:** Registry maps `kul` / `ist`; unknown → null.

- [ ] **Step 3:** Unit test registry keys.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(travel): bundle KL and Istanbul journal pattern artwork"
```

---

### Task 5: Moment + toolbar + journal renderer

**Files:**
- Create: `apps/travel/src/journal/render-moment.ts`
- Create: `apps/travel/src/journal/render-toolbar.ts`
- Create: `apps/travel/src/journal/chapter-jump.ts`
- Create: `apps/travel/src/journal/render-journal.ts`
- Create: `apps/travel/src/styles/journal.css`
- Modify: `apps/travel/src/app/main.ts` (import CSS + paint journal route)
- Create: `apps/travel/tests/unit/journal-render.test.ts`

**Interfaces:**
- Consumes: fixture + layout + patterns
- Produces: `renderJournal(canvas: HTMLElement, opts: { fixture: JournalFixture; momentId?: string; patternOff?: boolean; onChapterJump?: (id: string) => void }): { destroy(): void }`

DOM order (mandatory): page header (shell) → trip toolbar → leg sections → day sections → moment articles → optional connection fragment → … → leg transition → next leg.

- [ ] **Step 1: Failing happy-dom structure test**

```ts
import { renderJournal } from '@/journal/render-journal';
import { klIstanbulFixture } from '@/journal/fixtures/kl-istanbul';

it('renders toolbar, two leg headings, and a transition', () => {
  const root = document.createElement('div');
  renderJournal(root, { fixture: klIstanbulFixture() });
  expect(root.querySelector('[data-journal-toolbar]')).toBeTruthy();
  expect(root.querySelectorAll('[data-journal-leg]')).toHaveLength(2);
  expect(root.querySelector('[data-journal-transition]')).toBeTruthy();
  expect(root.querySelector('[data-journal-timeline]')).toBeTruthy();
});
```

- [ ] **Step 2: Implement CSS using kit tokens only**

Encode Codex geometry matrix:

| Token use | Phone (<720) | Desktop (≥720) |
| --- | --- | --- |
| Canvas inset | `--space-4` | top `--space-8`, sides `--space-6` |
| Story column | full width | max-width 48rem centred |
| Timeline gutter | 16px + 8px gap | 24px + 16px gap |
| Leg title | `text-lg` / 700 | `text-xl` / 700 |
| Day date | `text-sm` / 600 | same |
| Moment separation | `--space-6` | `--space-8` |
| Photo radius | `--radius-xs` | same |
| Map preview height | 96px | 128px |
| Transition min height | 96px | 128px |
| Audio row min | 48px | 48px |
| Toolbar min height | 48px | 48px |

Timeline: 2px Wave line in gutter; 8px nodes. Pattern layers clipped per leg; header trailing 40% motif cluster on phone.

- [ ] **Step 3: Implement renderers**

- Toolbar: trip title left, Chapter button right, Add moment (second row on narrow). Chapter opens searchable list (48px rows); selecting scrolls to `[id]` and focuses heading.
- Moments: media → metadata → reflection (6-line clamp + Read more) → audio stub row. Text-only: metadata first. Ellipsis 44px hit box (menu stub: disabled actions OK with “Coming in Phase 3”).
- Photos: single 3:2; pair squares; 3+ lead + two squares + View all N (no fetch of hidden originals — fixtures already local).
- Map preview: static schematic button `Open photo stops for this day` — no MapLibre in Phase 1.
- Transition: date, mode glyph, departure/arrival labels; View journey details stub.
- Pattern-off: class on root; spacing unchanged.
- Persist last viewed moment id in `localStorage` key `lifehub.travel.journal.lastView.{tripId}` (fixture trip id).

- [ ] **Step 4: Wire `main.ts`**

On `route.name === 'journal'`, render page header, call `renderJournal` with `klIstanbulFixture()` (ignore live trip fetch for Phase 1 content; still accept tripId in URL for deep links). Add trip-page link/button “Journal” → `journalRoute(tripId)`.

- [ ] **Step 5: Tests PASS + manual viewport check**

```bash
cd apps/travel && npx vitest run tests/unit/journal-*.test.ts
cd ../.. && npm run pre-pr-check
```

Manual: `cd apps/travel && npm run dev` — open `#/trip/fixture/journal` at 390 and 1440. Screenshot and save under `/opt/cursor/artifacts/` (or `docs/` only if Adam asks). Verify: no horizontal overflow; patterns change only at transition; kit mobile bar unchanged (warm white, not navy); Add moment not a fifth nav slot.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(travel): fixture journal renderer with patterns and sizing matrix"
```

---

### Task 6: Motion (after static UI works) + reduced motion

**Files:**
- Modify: `apps/travel/src/journal/render-journal.ts`
- Reuse: `packages/design-kit/js/hub-motion.js` / `motion.css` — no new animation framework

- [ ] **Step 1:** First-visible section/moment: shared 420ms / 8px lift only when motion JS active.
- [ ] **Step 2:** Chapter jump: `scrollIntoView({ behavior })` — smooth only if motion allowed; reduced motion → instant.
- [ ] **Step 3:** Assert with `prefers-reduced-motion: reduce` that content is visible without waiting on animation (content not initially `opacity: 0` unless motion confirmed).
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(travel): journal entrance motion with reduced-motion safe path"
```

---

### Task 7: Phase 1 acceptance evidence

- [ ] **Step 1:** Capture 390×844 and 1440×900: populated two-leg journal, long place name, text-only moment, portrait media, pattern-off, empty day with Add moment.
- [ ] **Step 2:** Confirm checklist vs Codex Scenario C (artwork boundary, one transition, kit chrome).
- [ ] **Step 3:** Record checked failure-register IDs in the PR body.
- [ ] **Step 4:** Run `npm run pre-pr-check` — exit 0 before updating PR.

**Phase 1 done when:** fixture journal is readable at both viewports, geometry matches matrix, patterns licensed/bundled, route works, no live backend.

---

## Spec coverage (Phase 1)

| Codex item | Task |
| --- | --- |
| Foundation / realistic layout sequence §1 | Tasks 1–7 |
| Continuous trip reading structure | Task 5 |
| Destination artwork KL/IST | Task 4–5 |
| Shared kit / Binding UI geometry | Tasks 3, 5 |
| Motion contract (subset) | Task 6 |
| Scenario C | Task 7 |
| Live capture/import/edit/map/export | Deferred Phases 2–4 |
