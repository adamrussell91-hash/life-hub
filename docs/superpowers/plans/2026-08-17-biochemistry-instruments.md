# Biochemistry Instruments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development and implement each task in red-green-refactor order. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Biochemistry/Electrolytes blood panel physiological groupings, purpose-fit instruments, and inline on-demand trend charts.

**Architecture:** A pure grouping module assigns each marker to one of four ordered groups. A focused instrument renderer owns meter, tube, protein-band, and inline-trend DOM/SVG; `render-bloods.js` delegates only the Biochemistry/Electrolytes category to it. Existing chart functions and `bandDomain` remain the source of truth for trend and reference-range geometry.

**Tech Stack:** Browser ES modules, DOM/SVG, CSS design-kit tokens, Node test runner.

---

## File map

- Create `js/app/bloods-biochem-groups.js` — ordered group definitions and pure marker assignment.
- Create `js/app/bloods-instruments.js` — instrument geometry, rendering, and inline expansion.
- Create `tests/unit/bloods-biochem-groups.test.js` — grouping contract.
- Create `tests/unit/bloods-instruments.test.js` — geometry and rendering contract.
- Modify `js/app/bloods-charts.js` — export a reusable explicit trend renderer without changing existing marker selection.
- Modify `js/app/render-bloods.js` — delegate the one category.
- Modify `tests/unit/render-bloods.test.js` — integration and interaction coverage.
- Modify `tests/unit/bloods-charts.test.js` — geometry/CSS parity coverage.
- Modify `css/app.css` — responsive, token-only instrument styles.

### Task 1: Pure physiological grouping

**Files:**
- Create: `tests/unit/bloods-biochem-groups.test.js`
- Create: `js/app/bloods-biochem-groups.js`

- [ ] **Step 1: Write the failing grouping tests**

Test that `groupBiochemistryMarkers(markers)`:

```js
const groups = groupBiochemistryMarkers([
  marker('sodium'),
  marker('creatinine'),
  marker('alpha_1_globulin'),
  marker('mystery_marker')
]);

assert.deepEqual(groups.map(group => group.id), [
  'electrolytes',
  'kidney',
  'protein',
  'other'
]);
assert.deepEqual(groups.map(group => group.markers.map(item => item.key)), [
  ['sodium'],
  ['creatinine'],
  ['alpha_1_globulin'],
  ['mystery_marker']
]);
```

Also assert no marker is duplicated and empty groups are omitted.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test tests/unit/bloods-biochem-groups.test.js
```

Expected: module-not-found failure because the grouping module does not exist.

- [ ] **Step 3: Implement the minimal grouping module**

Export `BIOCHEM_GROUPS` and `groupBiochemistryMarkers(markers)`. Use `Set` membership for known keys, preserve marker order within groups, and append every unclaimed marker to `other`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same command. Expected: all grouping tests pass.

### Task 2: Instrument geometry and SVG

**Files:**
- Create: `tests/unit/bloods-instruments.test.js`
- Create: `js/app/bloods-instruments.js`

- [ ] **Step 1: Write failing geometry tests**

Define the desired API:

```js
const tube = tubeLayout(marker('creatinine'), { height: 160, padding: 8 });
assert.ok(tube.fillY >= 8 && tube.fillY <= 152);
assert.ok(tube.bandY >= 8);
assert.ok(tube.bandHeight >= 0);

const segments = proteinBandLayout([
  marker('alpha_1_globulin', 3),
  marker('gamma_globulin', 12)
]);
assert.equal(segments.reduce((sum, item) => sum + item.fraction, 0), 1);
assert.ok(segments[1].fraction > segments[0].fraction);
```

Render each instrument into the test fake DOM and assert an accessible SVG label, current value text, reference text, historical marks, and status text.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
node --test tests/unit/bloods-instruments.test.js
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement minimal geometry and renderers**

Use `bandDomain` for meter and tube scales. Export `tubeLayout`, `proteinBandLayout`, and `renderBiochemistryGroups`. Build SVG with `createElementNS`, `viewBox`, `role="img"`, and an explicit `aria-label`. Render values and statuses as HTML text beside the visual.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the focused command. Expected: all instrument tests pass.

### Task 3: Reusable inline trend

**Files:**
- Modify: `js/app/bloods-charts.js`
- Modify: `tests/unit/bloods-instruments.test.js`
- Modify: `js/app/bloods-instruments.js`

- [ ] **Step 1: Add failing expansion tests**

Render two markers with history, dispatch each marker control's click listener, and assert:

```js
assert.equal(host.querySelectorAll('.bloods-instrument-trend').length, 1);
assert.match(host.querySelector('.bloods-instrument-trend').textContent, /Sodium/);
```

Click a second marker and assert the first trend is replaced. Click the second again and assert the trend collapses. Assert a one-draw marker is not a button.

- [ ] **Step 2: Verify RED**

Run the instrument test. Expected: no inline trend container exists.

- [ ] **Step 3: Export and reuse the trend renderer**

Export `trendChartSvg(root, marker, options)` from `bloods-charts.js` as the existing line-chart implementation. Keep `markerVisual` behaviour unchanged. In the instrument renderer, maintain one expanded key per category render, set `aria-expanded`, and replace/remove the inline host on activation.

- [ ] **Step 4: Verify GREEN**

Run the instrument test and existing chart test:

```bash
node --test tests/unit/bloods-instruments.test.js tests/unit/bloods-charts.test.js
```

Expected: both suites pass.

### Task 4: Category integration

**Files:**
- Modify: `tests/unit/render-bloods.test.js`
- Modify: `js/app/render-bloods.js`

- [ ] **Step 1: Write the failing integration test**

Render a `Biochemistry/Electrolytes` category containing sodium, creatinine, alpha globulin, and an unknown marker. Assert four `.bloods-instrument-group` blocks in the intended order and no standard `.bloods-metric-grid` or `.bloods-rows` treatment inside that category. Render a Liver Function category in the same model and assert its standard chart remains.

- [ ] **Step 2: Verify RED**

```bash
node --test tests/unit/render-bloods.test.js
```

Expected: the category still uses the standard renderer.

- [ ] **Step 3: Add the narrow render branch**

In `categoryCard`, after category-level summary/combined content and before the standard chart/list split:

```js
if (category.id === 'Biochemistry/Electrolytes') {
  body.append(renderBiochemistryGroups(root, category.markers, { flareMarks: model.flareMarks }));
  article.append(body);
  return article;
}
```

Do not alter any other category path.

- [ ] **Step 4: Verify GREEN**

Run the render and instrument tests. Expected: both pass.

### Task 5: Token-only responsive styling

**Files:**
- Modify: `tests/unit/bloods-charts.test.js`
- Modify: `css/app.css`

- [ ] **Step 1: Extend the failing geometry parity test**

Read instrument constants and assert matching CSS aspect ratios for:

```js
['.bloods-instrument-meter', `${METER_WIDTH} / ${METER_HEIGHT}`],
['.bloods-tube', `${TUBE_WIDTH} / ${TUBE_HEIGHT}`],
['.bloods-protein-band', `${PROTEIN_WIDTH} / ${PROTEIN_HEIGHT}`]
```

Also assert the new CSS block contains only existing semantic token references for colour.

- [ ] **Step 2: Verify RED**

Run `node --test tests/unit/bloods-charts.test.js`. Expected: missing CSS selectors.

- [ ] **Step 3: Add styles**

Use existing spacing, type, radius, line, surface, status, and focus tokens. Ensure marker buttons are at least 44px high, tubes wrap, group headings remain readable, protein labels do not overflow, and narrow screens do not scroll horizontally.

- [ ] **Step 4: Verify GREEN**

Run the chart and instrument tests. Expected: both pass.

### Task 6: Full verification

- [ ] Run all unit and integration tests:

```bash
npm test
```

- [ ] Build the production web output:

```bash
npm run build
```

- [ ] Inspect `git diff --check` and `git diff --stat`.
- [ ] Verify the Bloods page in a browser at desktop and narrow-phone widths, including keyboard expansion and collapse.
- [ ] Re-read `docs/superpowers/specs/2026-08-17-biochemistry-instruments-design.md` and confirm every requirement is represented.

No commit is created unless Adam explicitly requests one.
