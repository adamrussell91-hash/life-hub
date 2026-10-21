# Decision Maker Plan 1: Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay Decision Maker's foundations on Problem Solver's engine:
- the model catalogue, the section compass, the copied graphics and the colour tokens;
- a `decision` session kind that frames a decision in three answers and opens Explore;
- its own API endpoints over a separate store;
- page renders for build reference;
- landing and session mockups in the set design language, approved by Adam before Plan 2 starts.

**Architecture:**
- Decision Maker gets its own package, `packages/decision-book/`, which holds data only: catalogue, compass, model definition, glyphs and CSS.
- It plugs into Problem Solver's single engine. A plan step can name its tools explicitly. Sessions carry a `kind` whose frame keys and fixed model come from a table. The HTTP handler factories accept a store prefix, a run path and the allowed kinds.
- Problem Solver's behaviour is unchanged, and every existing Problem Solver test stays green.

**Tech Stack:** Node ESM (`.mjs`), `node:test` (root `tests/unit`), Netlify functions, an encrypted R2 cognitive store, and plain HTML and CSS for the mockups.

**Spec:** `docs/superpowers/specs/2026-10-21-decision-book-design.md`.
**Branch and worktree:** `claude/decision-book` in `/Users/adamrussell/Projects/life-hub-decision-book`. Run every command from that worktree's root.
**Graphics source (never committed as a folder, only copied glyphs):** `/Users/adamrussell/Desktop/Decision Book Graphics`.

**Public repo rule:** life-hub is public. No book text, scans or page renders are committed. `.db-book/` is git-ignored.

---

## File structure

| File | Responsibility |
| --- | --- |
| `packages/decision-book/catalogue.mjs` (new) | The 52 models as data: section, title, pages, chart family, tier, kit folder, book "see also", and whether it reuses a Problem Solver tool |
| `packages/decision-book/compass.mjs` (new) | The section compass (about me or others × understand or improve) and `parseCompass` |
| `packages/decision-book/model.mjs` (new) | `DECISION_MODEL`, the `decision_book` model and its steps |
| `packages/decision-book/decision-book.css` (new) | The `.dm-scope` colour and motion tokens |
| `packages/decision-book/glyphs/{models,sections,identity}/*.svg` (new, copied) | The approved emblems, renamed to catalogue ids and section keys |
| `scripts/import-decision-book-glyphs.mjs` (new) | Copies the glyphs from the graphics folder |
| `packages/problem-solver/steps.mjs` (modify) | Explicit tool lists on plan entries; the `decision_book` plan; model lookup that includes `DECISION_MODEL` |
| `netlify/functions/_shared/problem-solver/session.mjs` (modify) | `KIND_FRAMES`, `frameKeysOf`, kind-aware create, frame and summary |
| `netlify/functions/_shared/problem-solver/coach-schema.mjs` (modify) | Accept the decision frame keys |
| `netlify/functions/_shared/problem-solver/coach.mjs` (modify) | Frame-phase tool list and suggestion rule per kind |
| `netlify/functions/_shared/problem-solver/scripted-coach.mjs` (modify) | Scripted decision framing for tests and local dev |
| `netlify/functions/_shared/problem-solver/service.mjs` (modify) | `kinds` option; create validates the kind |
| `netlify/functions/_shared/problem-solver/store.mjs` (modify) | `DECISION_BOOK_PREFIX`; prefix parameter |
| `netlify/functions/problem-solver.mjs`, `problem-solver-run.mjs` (modify) | Options for prefix, run path and kinds |
| `netlify/functions/decision-book.mjs`, `decision-book-run.mjs` (new) | `/api/decision-book` and `/api/decision-book/run` |
| `packages/problem-solver/types.ts` (modify) | `kind` and `frame` types |
| `.gitignore` (modify) | `.db-book/` |
| `docs/mockups/decision-maker/{landing,session,set}.html` (new) | Design mockups for approval |
| `tests/unit/decision-book-*.test.js` (new) | Catalogue, compass, glyphs, steps, session, coach and HTTP tests |

---

### Task 1: The model catalogue

**Files:**
- Create: `packages/decision-book/catalogue.mjs`
- Test: `tests/unit/decision-book-catalogue.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/decision-book-catalogue.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGUE, CATALOGUE_IDS, FAMILIES, REUSED_TOOL_IDS, SECTIONS, catalogueEntry, modelsInSection } from '../../packages/decision-book/catalogue.mjs';

const RANGES = { 1: [10, 49], 2: [52, 81], 3: [84, 123], 4: [126, 149] };

test('52 entries: 18, 13, 13 and 8 per section', () => {
  assert.equal(CATALOGUE.length, 52);
  assert.deepEqual(SECTIONS.map((s) => modelsInSection(s.id).length), [18, 13, 13, 8]);
});

test('ids are unique; only the four reused Problem Solver tools lack the dm_ prefix', () => {
  assert.equal(new Set(CATALOGUE_IDS).size, CATALOGUE_IDS.length);
  assert.deepEqual([...REUSED_TOOL_IDS].sort(), ['double_loop', 'morphological', 'pareto', 'swot']);
  for (const entry of CATALOGUE) assert.equal(entry.id.startsWith('dm_'), !entry.reuse, entry.id);
});

test('every family and tier is known; exactly seven lenses', () => {
  for (const entry of CATALOGUE) {
    assert.ok(FAMILIES.includes(entry.family), `${entry.id} family ${entry.family}`);
    assert.ok(['worksheet', 'lens'].includes(entry.tier), entry.id);
  }
  assert.deepEqual(CATALOGUE.filter((e) => e.tier === 'lens').map((e) => e.id), [
    'dm_choice_overload', 'dm_outside_box', 'dm_consequences', 'dm_sinus_bourdieu', 'dm_long_tail', 'dm_black_box', 'dm_future'
  ]);
});

test('pages sit inside their section and run in book order', () => {
  for (const section of SECTIONS) {
    const [lo, hi] = RANGES[section.id];
    let last = 0;
    for (const entry of modelsInSection(section.id)) {
      const [first, end] = entry.pages;
      assert.ok(first >= lo && end <= hi && first <= end, `${entry.id} pages ${entry.pages}`);
      assert.ok(first > last, `${entry.id} out of order`);
      last = end;
    }
  }
});

test('see-also links resolve, never point at themselves, and kit folders are unique per section', () => {
  for (const entry of CATALOGUE) {
    for (const id of entry.seeAlso) {
      assert.ok(catalogueEntry(id), `${entry.id} -> ${id}`);
      assert.notEqual(id, entry.id);
    }
  }
  const kits = CATALOGUE.map((e) => `${e.section}/${e.kit}`);
  assert.equal(new Set(kits).size, kits.length);
  assert.equal(catalogueEntry('nope'), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/unit/decision-book-catalogue.test.js`
Expected: FAIL, with `Cannot find module '.../packages/decision-book/catalogue.mjs'`.

- [ ] **Step 3: Write the catalogue**

```js
// packages/decision-book/catalogue.mjs
// The Decision Book's models as data (Krogerus and Tschäppeler). `pages` are the first and
// last printed pages; `kit` is the model's folder in the graphic kit; `seeAlso` holds only the
// book's own cross-references. A model reused from Problem Solver keeps that tool's id;
// every other id starts with `dm_`. No book text lives here.

export const SECTIONS = Object.freeze([
  Object.freeze({ id: 1, key: 'improve_yourself', title: 'How to improve yourself', compass: 'self_improve' }),
  Object.freeze({ id: 2, key: 'understand_yourself', title: 'How to understand yourself better', compass: 'self_understand' }),
  Object.freeze({ id: 3, key: 'understand_others', title: 'How to understand others better', compass: 'others_understand' }),
  Object.freeze({ id: 4, key: 'improve_others', title: 'How to improve others', compass: 'others_improve' })
]);

/** Shared chart families (`oneoff` is drawn bespoke; `table` is a reused Problem Solver chart). */
export const FAMILIES = Object.freeze(['quadrant', 'plot', 'scales', 'curve', 'tension', 'path', 'list', 'table', 'oneoff']);

const W = 'worksheet';
const L = 'lens';
const m = (section, id, title, pages, family, tier, kit, seeAlso = [], reuse = false) =>
  Object.freeze({ id, section, title, pages: Object.freeze(pages), family, tier, kit, seeAlso: Object.freeze(seeAlso), reuse });

export const CATALOGUE = Object.freeze([
  m(1, 'dm_eisenhower', 'The Eisenhower matrix', [10, 11], 'quadrant', W, '01-eisenhower-matrix'),
  m(1, 'swot', 'The SWOT analysis', [12, 13], 'quadrant', W, '02-swot-analysis', [], true),
  m(1, 'dm_bcg_box', 'The BCG box', [14, 15], 'quadrant', W, '03-bcg-box'),
  m(1, 'dm_project_portfolio', 'The project portfolio matrix', [16, 19], 'plot', W, '04-project-portfolio-matrix'),
  m(1, 'dm_feedback_analysis', 'The feedback analysis', [20, 21], 'tension', W, '05-feedback-analysis'),
  m(1, 'dm_whitmore', 'The John Whitmore model', [22, 23], 'list', W, '06-john-whitmore-model', ['dm_flow']),
  m(1, 'dm_rubber_band', 'The rubber band model', [24, 25], 'tension', W, '07-rubber-band-model', ['swot']),
  m(1, 'dm_feedback_box', 'The feedback box', [26, 27], 'quadrant', W, '08-feedback-box'),
  m(1, 'dm_yes_no', 'The Yes/No rule', [28, 29], 'path', W, '09-yes-no-rule'),
  m(1, 'dm_choice_overload', 'The choice overload', [30, 31], 'curve', L, '10-choice-overload'),
  m(1, 'dm_gap_in_market', 'The gap-in-the-market model', [32, 33], 'plot', W, '11-gap-in-the-market-model'),
  m(1, 'morphological', 'The morphological box and SCAMPER', [34, 37], 'table', W, '12-morphological-box-and-scamper', ['dm_outside_box'], true),
  m(1, 'dm_gift', 'The gift model', [38, 39], 'plot', W, '13-gift-model'),
  m(1, 'dm_outside_box', 'Thinking outside the box', [40, 41], 'oneoff', L, '14-thinking-outside-the-box', ['morphological']),
  m(1, 'dm_consequences', 'The consequences model', [42, 43], 'curve', L, '15-consequences-model', ['dm_stop_rule']),
  m(1, 'dm_unconscious', 'The theory of unconscious thinking', [44, 45], 'path', W, '16-theory-of-unconscious-thinking'),
  m(1, 'dm_stop_rule', 'The Stop Rule', [46, 47], 'path', W, '17-stop-rule'),
  m(1, 'dm_buyers_decision', 'The buyer’s decision model', [48, 49], 'path', W, '18-buyers-decision-model'),
  m(2, 'dm_flow', 'The flow model', [52, 53], 'plot', W, '01-flow-model'),
  m(2, 'dm_johari', 'The Johari window', [54, 55], 'quadrant', W, '02-johari-window'),
  m(2, 'dm_dissonance', 'The cognitive dissonance model', [56, 57], 'tension', W, '03-cognitive-dissonance'),
  m(2, 'dm_unimaginable', 'The unimaginable model', [58, 59], 'quadrant', W, '04-unimaginable-model', ['dm_black_box', 'dm_future']),
  m(2, 'dm_elbaek', 'The Uffe Elbæk model', [60, 61], 'scales', W, '05-uffe-elbaek-model'),
  m(2, 'dm_energy', 'The energy model', [62, 63], 'scales', W, '06-energy-model', ['dm_crossroads']),
  m(2, 'dm_political_compass', 'The political compass', [64, 65], 'plot', W, '07-political-compass'),
  m(2, 'dm_performance', 'The personal performance model', [66, 67], 'scales', W, '08-personal-performance', ['dm_rubber_band', 'dm_flow']),
  m(2, 'dm_making_of', 'The making-of model', [68, 71], 'list', W, '09-making-of-model'),
  m(2, 'dm_potential_trap', 'The personal potential trap', [72, 73], 'curve', W, '10-personal-potential-trap'),
  m(2, 'dm_hard_choice', 'The hard choice model', [74, 75], 'quadrant', W, '11-hard-choice-model'),
  m(2, 'dm_cognitive_bias', 'Cognitive bias', [76, 77], 'list', W, '12-cognitive-bias'),
  m(2, 'dm_crossroads', 'The crossroads model', [78, 81], 'list', W, '13-crossroads-model'),
  m(3, 'dm_rumsfeld', 'The Rumsfeld matrix', [84, 87], 'quadrant', W, '01-rumsfeld-matrix', ['dm_black_swan']),
  m(3, 'dm_swiss_cheese', 'The Swiss cheese model', [88, 91], 'path', W, '02-swiss-cheese-model', ['dm_result_optimisation']),
  m(3, 'dm_maslow', 'The Maslow pyramids', [92, 93], 'list', W, '03-maslow-pyramids'),
  m(3, 'dm_sinus_bourdieu', 'The Sinus Milieu and Bourdieu models', [94, 97], 'plot', L, '04-sinus-milieu-and-bourdieu'),
  m(3, 'double_loop', 'The double-loop learning model', [98, 101], 'path', W, '05-double-loop-learning', ['dm_black_box'], true),
  m(3, 'dm_appreciative', 'The AI (appreciative inquiry) model', [102, 103], 'quadrant', W, '06-ai-appreciative-inquiry'),
  m(3, 'pareto', 'The Pareto principle', [104, 105], 'table', W, '07-pareto-principle', ['dm_long_tail'], true),
  m(3, 'dm_long_tail', 'The long-tail model', [106, 107], 'curve', L, '08-long-tail-model', ['pareto']),
  m(3, 'dm_conflict', 'The conflict resolution model', [108, 111], 'list', W, '09-conflict-resolution'),
  m(3, 'dm_black_swan', 'The black swan model', [112, 113], 'curve', W, '10-black-swan-model', ['dm_rumsfeld', 'dm_black_box']),
  m(3, 'dm_chasm', 'The chasm: the diffusion model', [114, 117], 'curve', W, '11-chasm-diffusion-model', ['pareto', 'dm_long_tail']),
  m(3, 'dm_black_box', 'The black box model', [118, 119], 'oneoff', L, '12-black-box-model', ['dm_black_swan']),
  m(3, 'dm_prisoners', 'The prisoner’s dilemma', [120, 123], 'quadrant', W, '13-prisoners-dilemma'),
  m(4, 'dm_team', 'The team model', [126, 127], 'scales', W, '01-team-model'),
  m(4, 'dm_hersey_blanchard', 'The Hersey–Blanchard model', [128, 131], 'quadrant', W, '02-hersey-blanchard'),
  m(4, 'dm_role_playing', 'The role-playing model (Belbin and de Bono)', [132, 135], 'list', W, '03-role-playing-belbin-de-bono', ['dm_drexler_sibbet']),
  m(4, 'dm_result_optimisation', 'The result optimisation model', [136, 137], 'path', W, '04-result-optimisation'),
  m(4, 'dm_pm_triangle', 'The project management triangle', [138, 139], 'tension', W, '05-project-management-triangle'),
  m(4, 'dm_drexler_sibbet', 'The Drexler/Sibbet team performance model', [140, 143], 'path', W, '06-drexler-sibbet', ['dm_role_playing']),
  m(4, 'dm_expectations', 'The expectations model', [144, 145], 'curve', W, '07-expectations-model'),
  m(4, 'dm_future', 'How will we decide in the future?', [146, 149], 'curve', L, '08-closing-essay-future-decisions')
]);

export const CATALOGUE_IDS = Object.freeze(CATALOGUE.map((entry) => entry.id));

/** Problem Solver tool ids Decision Maker uses as they are. */
export const REUSED_TOOL_IDS = Object.freeze(CATALOGUE.filter((entry) => entry.reuse).map((entry) => entry.id));

/** @param {string} id */
export function catalogueEntry(id) {
  return CATALOGUE.find((entry) => entry.id === id) ?? null;
}

/** @param {number} section 1 to 4 */
export function modelsInSection(section) {
  return CATALOGUE.filter((entry) => entry.section === section);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/unit/decision-book-catalogue.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/decision-book/catalogue.mjs tests/unit/decision-book-catalogue.test.js
git commit -m "Decision Maker: the model catalogue

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The section compass

**Files:**
- Create: `packages/decision-book/compass.mjs`
- Test: `tests/unit/decision-book-compass.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/decision-book-compass.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPASS, COMPASS_IDS, compassSections, parseCompass } from '../../packages/decision-book/compass.mjs';
import { SECTIONS } from '../../packages/decision-book/catalogue.mjs';

test('four quadrants, one per book section, in section order', () => {
  assert.deepEqual(COMPASS_IDS, ['self_improve', 'self_understand', 'others_understand', 'others_improve']);
  assert.deepEqual(COMPASS.map((q) => q.section), [1, 2, 3, 4]);
  for (const q of COMPASS) assert.equal(SECTIONS[q.section - 1].compass, q.id);
});

test('parseCompass keeps known ids in compass order, at most two', () => {
  assert.deepEqual(parseCompass('self_improve'), ['self_improve']);
  assert.deepEqual(parseCompass('others_understand and self_understand'), ['self_understand', 'others_understand']);
  assert.deepEqual(parseCompass('others_improve+self_improve+self_understand'), ['self_improve', 'self_understand']);
  assert.deepEqual(parseCompass('SELF_IMPROVE'), ['self_improve']);
  assert.deepEqual(parseCompass('about me, to understand'), []);
  assert.deepEqual(parseCompass(null), []);
});

test('compassSections maps a stored compass value to section numbers', () => {
  assert.deepEqual(compassSections('self_understand+others_improve'), [2, 4]);
  assert.deepEqual(compassSections(''), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/unit/decision-book-compass.test.js`
Expected: FAIL, with a module not found error for `compass.mjs`.

- [ ] **Step 3: Write the compass**

```js
// packages/decision-book/compass.mjs
// The section compass: the book's four sections as a 2×2 of who the question is about
// (me or others) and what the person wants (understand or improve). A framed decision
// stores one or two quadrant ids joined with '+', e.g. 'self_improve+others_improve'.

export const COMPASS = Object.freeze([
  Object.freeze({ id: 'self_improve', who: 'self', aim: 'improve', section: 1, label: 'Improve yourself' }),
  Object.freeze({ id: 'self_understand', who: 'self', aim: 'understand', section: 2, label: 'Understand yourself' }),
  Object.freeze({ id: 'others_understand', who: 'others', aim: 'understand', section: 3, label: 'Understand others' }),
  Object.freeze({ id: 'others_improve', who: 'others', aim: 'improve', section: 4, label: 'Improve others' })
]);

export const COMPASS_IDS = Object.freeze(COMPASS.map((q) => q.id));

/** Up to two quadrant ids found in the text, in compass order. */
export function parseCompass(text) {
  const words = new Set(String(text ?? '').toLowerCase().match(/[a-z_]+/g) ?? []);
  return COMPASS_IDS.filter((id) => words.has(id)).slice(0, 2);
}

/** Section numbers for a stored compass value. */
export function compassSections(value) {
  return parseCompass(value).map((id) => COMPASS.find((q) => q.id === id).section);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/unit/decision-book-compass.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/decision-book/compass.mjs tests/unit/decision-book-compass.test.js
git commit -m "Decision Maker: the section compass

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Glyphs from the approved graphics

**Files:**
- Create: `scripts/import-decision-book-glyphs.mjs`
- Create (by running the script): `packages/decision-book/glyphs/models/*.svg` (52), `glyphs/sections/*.svg` (4), `glyphs/identity/*.svg` (3)
- Test: `tests/unit/decision-book-glyphs.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/decision-book-glyphs.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { CATALOGUE_IDS, SECTIONS } from '../../packages/decision-book/catalogue.mjs';

const dir = (sub) => new URL(`../../packages/decision-book/glyphs/${sub}/`, import.meta.url);
const names = async (sub) => (await readdir(dir(sub))).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).sort();

test('one emblem per catalogue model, four section emblems, three identity marks', async () => {
  assert.deepEqual(await names('models'), [...CATALOGUE_IDS].sort());
  assert.deepEqual(await names('sections'), SECTIONS.map((s) => s.key).sort());
  assert.deepEqual(await names('identity'), ['book-emblem', 'book-emblem-mono', 'wordmark']);
});

test('every glyph is a plain SVG: no scripts, no remote references, no raster images', async () => {
  for (const sub of ['models', 'sections', 'identity']) {
    for (const file of await readdir(dir(sub))) {
      const svg = await readFile(new URL(file, dir(sub)), 'utf8');
      assert.ok(svg.trimStart().startsWith('<svg'), `${sub}/${file}`);
      assert.ok(!/<script|href="https?:|<image/i.test(svg), `${sub}/${file}`);
    }
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/unit/decision-book-glyphs.test.js`
Expected: FAIL, with `ENOENT` for `glyphs/models/`.

- [ ] **Step 3: Write the import script**

```js
// scripts/import-decision-book-glyphs.mjs
// Copies the approved Decision Book graphics into packages/decision-book/glyphs/: one emblem
// per catalogue model (renamed to its id), the four section emblems (renamed to section keys)
// and the book identity. The artwork is original to this project, so it may be committed;
// book scans never are.
// Usage: node scripts/import-decision-book-glyphs.mjs "/path/to/Decision Book Graphics"
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOGUE, SECTIONS } from '../packages/decision-book/catalogue.mjs';

const source = process.argv[2];
if (!source) {
  console.error('Usage: node scripts/import-decision-book-glyphs.mjs "<Decision Book Graphics folder>"');
  process.exit(1);
}
const out = fileURLToPath(new URL('../packages/decision-book/glyphs/', import.meta.url));
for (const sub of ['models', 'sections', 'identity']) await mkdir(join(out, sub), { recursive: true });

for (const entry of CATALOGUE) {
  await copyFile(join(source, `decision-book-section-0${entry.section}`, 'tools', entry.kit, 'emblem.svg'), join(out, 'models', `${entry.id}.svg`));
}
const sectionDir = join(source, 'decision-book-assets', 'sections');
const sectionFiles = await readdir(sectionDir);
for (const section of SECTIONS) {
  const file = sectionFiles.find((name) => name.startsWith(`0${section.id}-`) && name.endsWith('.svg'));
  if (!file) throw new Error(`No section emblem for section ${section.id} in ${sectionDir}`);
  await copyFile(join(sectionDir, file), join(out, 'sections', `${section.key}.svg`));
}
for (const name of ['book-emblem.svg', 'book-emblem-mono.svg', 'wordmark.svg']) {
  await copyFile(join(source, 'decision-book-completion-kit', 'identity', name), join(out, 'identity', name));
}
console.log(`Copied ${CATALOGUE.length} model emblems, ${SECTIONS.length} section emblems and 3 identity marks.`);
```

- [ ] **Step 4: Run the script**

Run: `node scripts/import-decision-book-glyphs.mjs "/Users/adamrussell/Desktop/Decision Book Graphics"`
Expected: `Copied 52 model emblems, 4 section emblems and 3 identity marks.`

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tests/unit/decision-book-glyphs.test.js`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add scripts/import-decision-book-glyphs.mjs packages/decision-book/glyphs tests/unit/decision-book-glyphs.test.js
git commit -m "Decision Maker: approved emblems, section marks and identity

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Tokens and page renders for build reference

**Files:**
- Create: `packages/decision-book/decision-book.css`
- Modify: `.gitignore` (add `.db-book/` after the existing `.ps-book/` line)

- [ ] **Step 1: Write the token sheet**

```css
/* packages/decision-book/decision-book.css
   Decision Maker's tokens: the kit's paper, ink, red and green, with their tints, scoped to
   .dm-scope the way Problem Solver scopes .ps-scope. Motion matches Problem Solver so the
   two read as a set. */
.dm-scope {
  --dm-paper: #faf8ef;
  --dm-ink: #171813;
  --dm-red: #ef402b;
  --dm-green: #60aa36;
  --dm-soft: #efeee4;
  --dm-line: #c9cabd;
  --dm-green-tint: #e5edda;
  --dm-red-tint: #f8e1d8;
  --dm-ghost: rgba(23, 24, 19, 0.12);
  --dm-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  --dm-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

- [ ] **Step 2: Git-ignore the page renders**

Add this line to `.gitignore`, directly after `.ps-book/`:

```
.db-book/
```

- [ ] **Step 3: Render the book pages for builders (local only, never committed)**

Run:
```bash
mkdir -p .db-book && for f in "/Users/adamrussell/Desktop/Decision Book Graphics/The_Decision_Book_Chapter_PDFs/"*.pdf; do pdftoppm -r 100 -png "$f" ".db-book/$(basename "$f" .pdf)"; done && ls .db-book | wc -l
```
Expected: a count of 150 (pages across the six PDFs: 4 + 40 + 30 + 42 + 26 + 8).

- [ ] **Step 4: Confirm nothing from `.db-book` is staged**

Run: `git status --short | grep db-book || echo clean`
Expected: `clean`

- [ ] **Step 5: Commit**

```bash
git add packages/decision-book/decision-book.css .gitignore
git commit -m "Decision Maker: colour and motion tokens; ignore page renders

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The decision_book model and its plan

**Files:**
- Create: `packages/decision-book/model.mjs`
- Modify: `packages/problem-solver/steps.mjs`
- Test: `tests/unit/decision-book-steps.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/decision-book-steps.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultToolFor, firstStep, nextStepAfter, stepName, stepPlan, toolsForPlanStep } from '../../packages/problem-solver/steps.mjs';
import { MODEL_IDS } from '../../packages/problem-solver/models.mjs';
import { DECISION_MODEL } from '../../packages/decision-book/model.mjs';

test('decision_book plans Explore, Decide and an extra Review', () => {
  assert.deepEqual(stepPlan('decision_book').map((s) => [s.step, s.extra]), [['explore', false], ['decide', false], ['review', true]]);
  assert.equal(firstStep('decision_book'), 'explore');
  assert.equal(nextStepAfter('decision_book', 'explore'), 'decide');
  assert.equal(stepName('decision_book', 'explore'), 'Explore');
  assert.equal(stepName('decision_book', 'review'), 'Review');
});

test('Explore offers the registered catalogue models in catalogue order, with no default', () => {
  // Until Plan 3 registers the dm_ tools, only the four reused Problem Solver tools exist.
  assert.deepEqual(toolsForPlanStep('decision_book', 'explore'), ['swot', 'morphological', 'double_loop', 'pareto']);
  assert.equal(defaultToolFor('decision_book', 'explore'), null);
});

test('Problem Solver never sees decision_book as a model it can choose', () => {
  assert.ok(!MODEL_IDS.includes('decision_book'));
  assert.equal(DECISION_MODEL.id, 'decision_book');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/unit/decision-book-steps.test.js`
Expected: FAIL, with a module not found error for `model.mjs`.

- [ ] **Step 3: Write the model**

```js
// packages/decision-book/model.mjs
// Decision Maker's one process model. It lives here, not in Problem Solver's MODELS, so the
// Problem Solver coach can never choose it; steps.mjs plans it.
export const DECISION_MODEL = Object.freeze({
  id: 'decision_book',
  name: 'Decision Maker',
  steps: Object.freeze([
    Object.freeze({ id: 'explore', name: 'Explore', detail: 'Work the models that fit the decision' }),
    Object.freeze({ id: 'decide', name: 'Decide', detail: 'Settle the decision and what would change it' }),
    Object.freeze({ id: 'review', name: 'Review', detail: 'Compare what you expected with what happened' })
  ])
});
```

- [ ] **Step 4: Change `packages/problem-solver/steps.mjs`**

Add imports below the existing two:

```js
import { DECISION_MODEL } from '../decision-book/model.mjs';
import { CATALOGUE_IDS } from '../decision-book/catalogue.mjs';
```

Replace the `entry` helper:

```js
const entry = (step, book, extra = false, tools = null) => Object.freeze({ step, book: Object.freeze(book), extra, ...(tools ? { tools } : {}) });
```

Add this property inside `PLANS`, after `triz`:

```js
  // Decision Maker: the coach discerns the model, so Explore names its tools (every catalogue
  // model registered as a tool) and has no default.
  decision_book: Object.freeze([
    entry('explore', ['explore'], false, () => CATALOGUE_IDS.filter((id) => TOOLS[id])),
    entry('decide', ['settle']),
    entry('review', ['review'], true)
  ])
```

Replace `stepName`:

```js
const modelDef = (modelId) => MODELS[modelId] ?? (modelId === DECISION_MODEL.id ? DECISION_MODEL : null);

export function stepName(modelId, stepId) {
  const own = modelDef(modelId)?.steps.find((s) => s.id === stepId);
  if (own) return own.name;
  return BOOK_STEPS.find((s) => s.id === stepId)?.name ?? stepId;
}
```

Replace `toolsForPlanStep` and `defaultToolFor`:

```js
/** Tool ids usable in a plan step: its own list when it names one, else registry order. */
export function toolsForPlanStep(modelId, stepId) {
  const step = planStep(modelId, stepId);
  if (step?.tools) return step.tools();
  const books = step?.book ?? [];
  return Object.values(TOOLS).filter((tool) => books.includes(tool.step)).map((tool) => tool.id);
}

/** A step that names its own tools has no default: the coach chooses. */
export function defaultToolFor(modelId, stepId) {
  const step = planStep(modelId, stepId);
  if (step?.tools) return null;
  for (const book of step?.book ?? []) {
    const id = (DEFAULTS[book] ?? []).find((tool) => TOOLS[tool]?.step === book);
    if (id) return id;
  }
  return toolsForPlanStep(modelId, stepId)[0] ?? null;
}
```

- [ ] **Step 5: Run the new test and the Problem Solver step tests**

Run: `node --test tests/unit/decision-book-steps.test.js tests/unit/problem-solver-steps.test.js`
Expected: PASS for both files. The Problem Solver plans are unchanged: their entries have no `tools` key, so the `deepEqual` checks on `[step, book, extra]` still hold.

- [ ] **Step 6: Commit**

```bash
git add packages/decision-book/model.mjs packages/problem-solver/steps.mjs tests/unit/decision-book-steps.test.js
git commit -m "Decision Maker: the decision_book plan on the shared step engine

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Decision sessions frame in three answers

**Files:**
- Modify: `netlify/functions/_shared/problem-solver/session.mjs` (the `FRAME_KEYS` constant, `frameComplete`, `createSession`, the frame branch of `applyCoachTurn`, `summaryRow`)
- Modify: `netlify/functions/_shared/problem-solver/coach-schema.mjs:10` (`FRAME_KEYS`)
- Modify: `packages/problem-solver/types.ts` (`PsSession.kind`, `PsSession.frame`, `PsSummary.kind`)
- Test: `tests/unit/decision-book-session.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/decision-book-session.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCoachTurn, createSession, frameKeysOf, summaryRow } from '../../netlify/functions/_shared/problem-solver/session.mjs';
import { validateCoachTurn } from '../../netlify/functions/_shared/problem-solver/coach-schema.mjs';

let n = 0;
const deps = { now: () => '2026-10-21T10:00:00.000Z', newId: () => `id${(n += 1)}` };
const turn = (fields) => ({ verdict: 'accept', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: null, model: null, suggestion: null, summary: null, exitObjection: null, learning: null, ...fields });

test('a decision session starts in frame with the decision keys', () => {
  const s = createSession({ text: 'Should I take the Sydney job?', kind: 'decision' }, deps);
  assert.equal(s.kind, 'decision');
  assert.equal(s.phase, 'frame');
  assert.equal(s.model, null);
  assert.deepEqual(frameKeysOf(s), ['decision', 'compass', 'known']);
});

test('an unknown kind is refused', () => {
  assert.throws(() => createSession({ text: 'x', kind: 'mystery' }, deps), /kind/);
});

test('three accepted answers open Explore on the fixed model; compass is normalised', () => {
  let s = createSession({ text: 'Should I take the Sydney job?', kind: 'decision' }, deps);
  s = applyCoachTurn(s, turn({ frame: { decision: 'Take the Sydney job or stay.' } }), deps);
  s = applyCoachTurn(s, turn({ frame: { compass: 'self_understand and others_improve', goal: 'ignored' } }), deps);
  assert.equal(s.frame.compass, 'self_understand+others_improve');
  assert.equal(s.frame.goal, undefined);
  assert.equal(s.phase, 'frame');
  s = applyCoachTurn(s, turn({ frame: { known: 'Offer by Friday; partner keen; rent doubles.' } }), deps);
  assert.equal(s.phase, 'explore');
  assert.equal(s.model.id, 'decision_book');
  assert.deepEqual(Object.keys(s.steps), ['explore']);
});

test('a compass answer with no quadrant id is not recorded', () => {
  let s = createSession({ text: 'Should I?', kind: 'decision' }, deps);
  s = applyCoachTurn(s, turn({ frame: { compass: 'not sure' } }), deps);
  assert.equal(s.frame.compass, undefined);
});

test('a full session still needs the coach to choose a model', () => {
  let s = createSession({ text: 'Late rota.' }, deps);
  assert.equal(s.kind, 'full');
  s = applyCoachTurn(s, turn({ frame: { goal: 'g', whatIsTrue: 't', whatCanBeDone: 'c' } }), deps);
  assert.equal(s.phase, 'frame');
  s = applyCoachTurn(s, turn({ frame: null, model: { id: 'seven_step', reason: 'r' } }), deps);
  assert.equal(s.phase, 'define');
});

test('summary rows count frame answers by kind', () => {
  let s = createSession({ text: 'Should I?', kind: 'decision' }, deps);
  s = applyCoachTurn(s, turn({ frame: { decision: 'd' } }), deps);
  const row = summaryRow(s);
  assert.equal(row.kind, 'decision');
  assert.equal(row.frame, 1);
});

test('the coach schema accepts the decision frame keys', () => {
  const result = validateCoachTurn({ verdict: 'accept', message: 'Clear. Who is it about?', frame: { decision: 'd', compass: 'self_improve', known: 'k' } });
  assert.ok(result.ok);
  assert.deepEqual(result.value.frame, { decision: 'd', compass: 'self_improve', known: 'k' });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/unit/decision-book-session.test.js`
Expected: FAIL, because `frameKeysOf` is not exported.

- [ ] **Step 3: Change `session.mjs`**

Add an import below the existing imports:

```js
import { parseCompass } from '../../../../packages/decision-book/compass.mjs';
import { DECISION_MODEL } from '../../../../packages/decision-book/model.mjs';
```

Replace `const FRAME_KEYS = ['goal', 'whatIsTrue', 'whatCanBeDone'];` with:

```js
/**
 * Frame questions per session kind, and the model a kind starts in once framed (null: the
 * coach chooses one). Lightning sessions never frame.
 */
export const KIND_FRAMES = Object.freeze({
  full: Object.freeze({ keys: Object.freeze(['goal', 'whatIsTrue', 'whatCanBeDone']), model: null }),
  decision: Object.freeze({ keys: Object.freeze(['decision', 'compass', 'known']), model: Object.freeze({ id: DECISION_MODEL.id, reason: 'Decision Maker works from The Decision Book.' }) })
});

export const frameKeysOf = (session) => (KIND_FRAMES[session.kind] ?? KIND_FRAMES.full).keys;

/** The answers of this turn that belong to the session's frame; a compass keeps only known quadrants. */
function pickFrame(session, frame) {
  const out = {};
  for (const key of frameKeysOf(session)) {
    if (!frame?.[key]) continue;
    if (key !== 'compass') out[key] = frame[key];
    else if (parseCompass(frame[key]).length) out.compass = parseCompass(frame[key]).join('+');
  }
  return out;
}
```

Replace `frameComplete`:

```js
function frameComplete(session) {
  return frameKeysOf(session).every((key) => Boolean(session.frame[key]));
}
```

In `createSession`, change the signature and the `kind` field, and validate the kind before anything else:

```js
export function createSession({ title = '', text, links = [], kind = 'full' }, deps) {
  if (!KIND_FRAMES[kind]) throw fail(400, 'validation_error', `Unknown session kind: ${kind}`);
```

and in the returned object, replace `kind: 'full',` with `kind,`.

In `applyCoachTurn`, replace the frame branch:

```js
  } else if (next.phase === 'frame') {
    if (turn.verdict === 'accept' && turn.frame) next = { ...next, frame: { ...next.frame, ...pickFrame(next, turn.frame) } };
    const model = (KIND_FRAMES[next.kind] ?? KIND_FRAMES.full).model ?? turn.model;
    if (frameComplete(next) && model) {
      const first = firstStep(model.id);
      next = { ...next, model: { id: model.id, reason: model.reason }, phase: first, steps: { [first]: emptyStep() } };
    }
  } else if (currentStep(next)) {
```

In `summaryRow`, replace the `frame:` line:

```js
    frame: frameKeysOf(session).filter((key) => Boolean(session.frame?.[key])).length,
```

- [ ] **Step 4: Change `coach-schema.mjs`**

Replace line 10:

```js
const FRAME_KEYS = ['goal', 'whatIsTrue', 'whatCanBeDone', 'decision', 'compass', 'known'];
```

The session keeps only the keys that belong to its kind (`pickFrame`), so a Problem Solver session ignores decision keys, and the reverse.

- [ ] **Step 5: Change `packages/problem-solver/types.ts`**

In `PsSession`, replace `kind: 'full' | 'lightning';` with:

```ts
  kind: 'full' | 'lightning' | 'decision';
```

and replace the `frame` line with:

```ts
  frame: { goal?: string; whatIsTrue?: string; whatCanBeDone?: string; decision?: string; compass?: string; known?: string };
```

In `PsSummary`, replace `kind?: 'full' | 'lightning';` with `kind?: 'full' | 'lightning' | 'decision';`.

- [ ] **Step 6: Run the new tests and every Problem Solver test**

Run: `node --test tests/unit/decision-book-session.test.js tests/unit/problem-solver-*.test.js`
Expected: PASS everywhere. Problem Solver's frame behaviour is unchanged: a full session still waits for `turn.model`.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/_shared/problem-solver/session.mjs netlify/functions/_shared/problem-solver/coach-schema.mjs packages/problem-solver/types.ts tests/unit/decision-book-session.test.js
git commit -m "Decision Maker: decision sessions frame in three answers and open Explore

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The coach frame rules per kind

**Files:**
- Modify: `netlify/functions/_shared/problem-solver/coach.mjs` (the `parse` function, lines 100–125)
- Test: `tests/unit/decision-book-coach.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/decision-book-coach.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelCoach } from '../../netlify/functions/_shared/problem-solver/coach.mjs';
import { applyCoachTurn, createSession } from '../../netlify/functions/_shared/problem-solver/session.mjs';

let n = 0;
const deps = { now: () => '2026-10-21T10:00:00.000Z', newId: () => `id${(n += 1)}` };
const base = { verdict: 'accept', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: null, model: null, suggestion: null, summary: null, exitObjection: null, learning: null };

/** A decision session with the decision and compass answered: the next answer completes the frame. */
function twoAnswered() {
  let s = createSession({ text: 'Should I take the Sydney job?', kind: 'decision' }, deps);
  s = applyCoachTurn(s, { ...base, frame: { decision: 'Take the Sydney job or stay.' } }, deps);
  return applyCoachTurn(s, { ...base, frame: { compass: 'self_understand' } }, deps);
}

const reply = (fields) => JSON.stringify({ verdict: 'accept', message: 'That frames it well. I suggest a SWOT analysis first, because the job has clear pros and cons. Shall we start?', ...fields });

test('the frame-completing reply keeps a suggestion for an Explore model', async () => {
  const coach = createModelCoach(async () => reply({ frame: { known: 'Offer by Friday.' }, suggestion: { kind: 'next_tool', tool: 'swot', reason: 'Clear pros and cons.' } }));
  const turn = await coach(twoAnswered());
  assert.deepEqual(turn.suggestion, { kind: 'next_tool', tool: 'swot', reason: 'Clear pros and cons.' });
});

test('a suggestion before the frame is complete is dropped', async () => {
  const s = createSession({ text: 'Should I?', kind: 'decision' }, deps);
  const coach = createModelCoach(async () => reply({ frame: { decision: 'd' }, suggestion: { kind: 'next_tool', tool: 'swot', reason: 'r' } }));
  assert.equal((await coach(s)).suggestion, null);
});

test('a Problem Solver tool outside Explore is refused, then the coach loses the thread', async () => {
  const coach = createModelCoach(async () => reply({ frame: { known: 'k' }, suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'r' } }));
  await assert.rejects(coach(twoAnswered()), /lost the thread/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/unit/decision-book-coach.test.js`
Expected: FAIL on the first test, because the suggestion is `null` (the current rule drops frame suggestions unless the reply sets a model).

- [ ] **Step 3: Change `parse` in `coach.mjs`**

Extend the session import:

```js
import { activeRun, frameKeysOf, reopenProblem, waitingForReview } from './session.mjs';
```

Add these helpers above `parse`:

```js
/** Tools a frame-phase suggestion may name: Explore's models for a decision, else Define tools. */
function frameTools(session) {
  return session.kind === 'decision' ? toolsForPlanStep('decision_book', 'explore') : toolsForBookStep('define');
}

/** True when this reply ends framing: a decision's last frame answer, or a chosen model. */
function endsFrame(session, value) {
  if (session.kind === 'decision') return frameKeysOf(session).every((key) => Boolean(session.frame[key] || value.frame?.[key]));
  return Boolean(value.model);
}
```

In `parse`, replace the frame-suggestion block:

```js
  if (session.phase === 'frame' && (!endsFrame(session, result.value) || result.value.suggestion?.kind === 'next_step')) {
    result.value = { ...result.value, suggestion: null };
  }
```

and replace the `allowed` line:

```js
    const allowed = session.phase === 'frame' || !session.model ? frameTools(session) : toolsForPlanStep(session.model.id, session.phase);
```

- [ ] **Step 4: Run the new tests and the Problem Solver coach tests**

Run: `node --test tests/unit/decision-book-coach.test.js tests/unit/problem-solver-coach.test.js`
Expected: PASS for both.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/problem-solver/coach.mjs tests/unit/decision-book-coach.test.js
git commit -m "Decision Maker: frame-phase suggestion rules per session kind

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Scripted decision framing

**Files:**
- Modify: `netlify/functions/_shared/problem-solver/scripted-coach.mjs` (doc comment, a new `DECISION_FRAME` table, the frame branch of `scriptedCoach`)
- Test: `tests/unit/decision-book-scripted.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/decision-book-scripted.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { applyCoachTurn, createSession, say } from '../../netlify/functions/_shared/problem-solver/session.mjs';

let n = 0;
const deps = { now: () => '2026-10-21T10:00:00.000Z', newId: () => `id${(n += 1)}` };
const step = async (s, text) => {
  const next = text ? say(s, text, deps) : s;
  return applyCoachTurn(next, await scriptedCoach(next), deps);
};

test('the scripted coach frames a decision and suggests the first Explore model', async () => {
  let s = await step(createSession({ text: 'Should I take the Sydney job offer?', kind: 'decision' }, deps));
  assert.equal(s.frame.decision, 'Should I take the Sydney job offer?');
  assert.match(s.turns.at(-1).text, /who is this about/i);
  s = await step(s, 'It is about me and I want to understand what I really want.');
  assert.equal(s.frame.compass, 'self_understand');
  s = await step(s, 'The offer closes Friday and the rent there is double.');
  assert.equal(s.phase, 'explore');
  assert.deepEqual(s.suggestion, { kind: 'next_tool', tool: 'swot', reason: 'A first model with clear sides to weigh.' });
});

test('talk of a team or other people lands on the others side of the compass', async () => {
  let s = await step(createSession({ text: 'Who should lead the new project?', kind: 'decision' }, deps));
  s = await step(s, 'It is about my team and I want to improve how they work together.');
  assert.equal(s.frame.compass, 'others_improve');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/unit/decision-book-scripted.test.js`
Expected: FAIL, because `s.frame.decision` is undefined (the scripted coach asks the Problem Solver goal question).

- [ ] **Step 3: Change `scripted-coach.mjs`**

Add a sentence at the end of the doc comment above `FRAME`: ` A decision session takes its opening message as the decision, then asks who it is about and what is known; the compass comes from the wording (team, others, them … → others; improve, better, change … → improve).`

Add below `FRAME`:

```js
const DECISION_FRAME = [
  ['decision', 'What are you deciding, or trying to see clearly? Put it in one sentence.'],
  ['compass', 'Clear. Who is this about, you or other people, and do you want to understand it or to improve it?'],
  ['known', 'Good. What do you already know: the options, the facts, the deadline and what is at stake?']
];

/** The compass quadrant the scripted coach hears in an answer. */
function heardCompass(text) {
  const who = /\b(team|others?|they|them|staff|people|partner|colleagues?|my (son|daughter|kids|class))\b/i.test(text) ? 'others' : 'self';
  const aim = /\b(improve|better|change|fix|grow|lead|develop)\b/i.test(text) ? 'improve' : 'understand';
  return `${who}_${aim}`;
}

/** Decision framing: the opening message is the decision; then the compass, then what is known. */
function decisionFrameTurn(session, last) {
  const missing = DECISION_FRAME.filter(([key]) => !session.frame[key]);
  const [key] = missing[0];
  const frame = { [key]: key === 'compass' ? heardCompass(last) : last };
  if (missing.length > 1) return { ...base, verdict: 'accept', frame, message: missing[1][1], skillsSeen: ['critical_thinking'] };
  const first = toolsForPlanStep('decision_book', 'explore')[0];
  return {
    ...base,
    verdict: 'accept',
    frame,
    message: 'That frames it well. I suggest starting with one model that lays out the sides to weigh. Shall we begin?',
    suggestion: first ? { kind: 'next_tool', tool: first, reason: 'A first model with clear sides to weigh.' } : null,
    skillsSeen: ['decision_making']
  };
}
```

In `scriptedCoach`, at the top of the `if (session.phase === 'frame') {` branch, before the `turns.length === 1` check, add:

```js
    if (session.kind === 'decision') return decisionFrameTurn(session, last || session.turns[0].text);
```

`toolsForPlanStep` is already imported from `steps.mjs` in this file.

- [ ] **Step 4: Run the new tests and the Problem Solver scripted tests**

Run: `node --test tests/unit/decision-book-scripted.test.js tests/unit/problem-solver-scripted.test.js`
Expected: PASS for both.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/problem-solver/scripted-coach.mjs tests/unit/decision-book-scripted.test.js
git commit -m "Decision Maker: scripted decision framing for tests and local dev

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The Decision Maker API over its own store

**Files:**
- Modify: `netlify/functions/_shared/problem-solver/store.mjs`
- Modify: `netlify/functions/_shared/problem-solver/service.mjs` (signature and `create`)
- Modify: `netlify/functions/problem-solver.mjs`
- Modify: `netlify/functions/problem-solver-run.mjs`
- Create: `netlify/functions/decision-book.mjs`, `netlify/functions/decision-book-run.mjs`
- Test: `tests/unit/decision-book-http.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/decision-book-http.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createDecisionBookHandler, DECISION_BOOK_DEPS } from '../../netlify/functions/decision-book.mjs';
import { createProblemSolverHandler } from '../../netlify/functions/problem-solver.mjs';
import { createMemoryProblemStore, DECISION_BOOK_PREFIX } from '../../netlify/functions/_shared/problem-solver/store.mjs';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';

const NOW = Date.parse('2026-10-21T10:00:00+11:00');
const SECRET = 's'.repeat(32);
const ENV = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET };
const SESSION = createSessionToken({ now: NOW, randomBytes: () => Buffer.alloc(16, 4) }, SECRET).token;

function harness(make, path) {
  const store = createMemoryProblemStore();
  const kicks = [];
  const handler = make({ env: ENV, now: () => NOW, getStore: async () => store, coach: scriptedCoach, invokeRun: async (request, id) => { kicks.push(id); return false; } });
  const call = async (method, body, query = '') => {
    const res = await handler(new Request(`https://life.example${path}${query}`, {
      method,
      headers: { cookie: `life_hub_session=${SESSION}`, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    }));
    return { status: res.status, data: (await res.json()).data };
  };
  return { call, kicks };
}

test('the API uses its own store prefix and run path', () => {
  assert.equal(DECISION_BOOK_PREFIX, 'decision-book/v1');
  assert.deepEqual(DECISION_BOOK_DEPS, { prefix: 'decision-book/v1', runPath: '/api/decision-book/run', kinds: ['decision'] });
});

test('a decision is created, framed in three answers and opens Explore', async () => {
  const { call } = harness(createDecisionBookHandler, '/api/decision-book');
  let { status, data } = await call('POST', { create: { text: 'Should I take the Sydney job offer?', requestId: 'r1' } });
  assert.equal(status, 200);
  let s = data.session;
  assert.equal(s.kind, 'decision');
  for (const [i, text] of ['It is about me and I want to understand it.', 'The offer closes Friday; rent there is double.'].entries()) {
    ({ data } = await call('POST', { id: s.id, revision: s.revision, requestId: `say${i}`, action: 'say', text }));
    s = data.session;
  }
  assert.equal(s.phase, 'explore');
  assert.equal(s.model.id, 'decision_book');
  assert.equal(s.suggestion.tool, 'swot');
  const list = (await call('GET', null, '?list=1')).data.sessions;
  assert.equal(list[0].kind, 'decision');
});

test('each endpoint refuses the other tool’s session kinds', async () => {
  const decision = harness(createDecisionBookHandler, '/api/decision-book');
  assert.equal((await decision.call('POST', { create: { text: 'Late rota.', kind: 'full', requestId: 'r1' } })).status, 400);
  const problem = harness(createProblemSolverHandler, '/api/problem-solver');
  assert.equal((await problem.call('POST', { create: { text: 'Should I?', kind: 'decision', requestId: 'r2' } })).status, 400);
  assert.equal((await problem.call('POST', { create: { text: 'Late rota.', requestId: 'r3' } })).data.session.kind, 'full');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/unit/decision-book-http.test.js`
Expected: FAIL, with a module not found error for `decision-book.mjs`.

- [ ] **Step 3: Change `store.mjs`**

Below `PROBLEM_SOLVER_PREFIX`, add:

```js
export const DECISION_BOOK_PREFIX = 'decision-book/v1';
```

Replace `defaultGetProblemStore`:

```js
/** Encrypted R2 store under `prefix`, or null when R2 or SESSION_SECRET is not configured. */
export async function defaultGetProblemStore(env, prefix = PROBLEM_SOLVER_PREFIX) {
  const { defaultGetCognitiveStore } = await import('../cognitive-store.mjs');
  return defaultGetCognitiveStore(env, { prefix, indexRow: summaryRow });
}
```

- [ ] **Step 4: Change `service.mjs`**

Change the factory signature:

```js
export function createProblemSolverService({ store, coach, kinds = ['full', 'lightning'], now = () => new Date().toISOString(), newId = randomUUID }) {
```

Replace the first two lines of `create`:

```js
    async create(owner, body) {
      const kind = body.kind ?? kinds[0];
      if (!kinds.includes(kind)) throw httpError(400, 'validation_error', `This tool does not start ${kind} sessions.`);
      const make = kind === 'lightning' ? createLightningSession : (input, d) => createSession({ ...input, kind }, d);
```

- [ ] **Step 5: Change `problem-solver.mjs`**

Replace `problemSolverServiceFor`:

```js
export async function problemSolverServiceFor(env, deps = {}) {
  const store = deps.getStore ? await deps.getStore(env) : await defaultGetProblemStore(env, deps.prefix);
  if (!store) throw Object.assign(new Error('Problem Solver storage is not configured.'), { status: 503, code: 'store_unbound' });
  const coach = deps.coach ?? createModelCoach(anthropicModel(env, deps.fetchImpl ?? fetch));
  return createProblemSolverService({ store, coach, ...(deps.kinds ? { kinds: deps.kinds } : {}) });
}
```

Replace the first line of `defaultInvokeRun` and its `fetchImpl` call target:

```js
export async function defaultInvokeRun(request, id, env, fetchImpl = fetch, runPath = '/api/problem-solver/run') {
  const response = await fetchImpl(new URL(runPath, request.url), {
```

and in the handler, pass the run path when kicking:

```js
      try { kicked = await (deps.invokeRun ?? defaultInvokeRun)(request, runId, env, deps.fetchImpl ?? fetch, deps.runPath); } catch { kicked = false; }
```

- [ ] **Step 6: Create the Decision Maker endpoints**

```js
// netlify/functions/decision-book.mjs
// Decision Maker's API: Problem Solver's handler over Decision Maker's own store, run path
// and session kinds. Everything else (revisions, request replay, the queued runner) is shared.
import { createProblemSolverHandler } from './problem-solver.mjs';
import { DECISION_BOOK_PREFIX } from './_shared/problem-solver/store.mjs';

export const config = { path: '/api/decision-book' };

export const DECISION_BOOK_DEPS = Object.freeze({ prefix: DECISION_BOOK_PREFIX, runPath: '/api/decision-book/run', kinds: ['decision'] });

export function createDecisionBookHandler(deps = {}) {
  return createProblemSolverHandler({ ...DECISION_BOOK_DEPS, ...deps });
}

export default createDecisionBookHandler();
```

```js
// netlify/functions/decision-book-run.mjs
// Background runner for Decision Maker coach turns, sharing Problem Solver's runner.
import { createProblemSolverRunHandler } from './problem-solver-run.mjs';
import { DECISION_BOOK_DEPS } from './decision-book.mjs';

export const config = { path: '/api/decision-book/run', background: true };

export function createDecisionBookRunHandler(deps = {}) {
  return createProblemSolverRunHandler({ ...DECISION_BOOK_DEPS, ...deps });
}

export default createDecisionBookRunHandler();
```

`problem-solver-run.mjs` already passes its `deps` into `problemSolverServiceFor(env, deps)`, so the prefix and kinds flow through without a change there.

- [ ] **Step 7: Run the new tests and the Problem Solver HTTP and service tests**

Run: `node --test tests/unit/decision-book-http.test.js tests/unit/problem-solver-http.test.js tests/unit/problem-solver-lightning-service.test.js`
Expected: PASS for all three.

- [ ] **Step 8: Commit**

```bash
git add netlify/functions/_shared/problem-solver/store.mjs netlify/functions/_shared/problem-solver/service.mjs netlify/functions/problem-solver.mjs netlify/functions/decision-book.mjs netlify/functions/decision-book-run.mjs tests/unit/decision-book-http.test.js
git commit -m "Decision Maker: /api/decision-book over its own store

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Mockups in the set design language (approval gate)

The design language is in the spec's "Design language: part of a set" section. Read it, and Problem Solver's mockups (`docs/mockups/problem-solver/landing.html`, `session.html`), before starting. These pages are what Adam approves before any renderer is built in Plan 2.

**Files:**
- Create: `docs/mockups/decision-maker/landing.html`
- Create: `docs/mockups/decision-maker/session.html`
- Create: `docs/mockups/decision-maker/set.html`
- Modify: `.claude/launch.json` (add a `mockups` configuration to the existing list)

- [ ] **Step 1: Build `landing.html`**

Self-contained HTML (inline CSS and inline SVG; no remote assets except the hub font if Problem Solver's mockup loads one the same way). It copies Problem Solver's landing structure section for section and swaps:

- `.ps-scope` tokens for the `.dm-scope` tokens in `packages/decision-book/decision-book.css`, pasted inline;
- the round shape board for a **4×3 square shape board**, with eight tile shapes drawn in red, green, ink and tint: a 2×2 of quarter squares, a diagonally split square, a square with a quarter-circle cut, a forked Y path, a stepped stair, two opposed triangles in a square, a square with an inset square, and a bar split two ways;
- the hero copy for "Decision Maker", with the book emblem from `packages/decision-book/glyphs/identity/book-emblem.svg` inlined;
- the start box: title "New decision", placeholder "What are you deciding, or trying to see clearly? Say it the way you would to a friend.";
- the Lightning card for a **Quick decision** card: "Quick decision. A yes/no check and a stop rule for everyday calls.", with an input and a Go button;
- the problems list for a **Decisions** list. Show three sample cards with **square medals** (a 2×2 that fills one quarter per answer): one at 1 of 3 framing answers; one at Explore with the `dm_eisenhower` emblem inlined in the middle; one Finished. The meta lines use the phase colour chip in this palette;
- "How a session builds" for four square stations (Frame, Explore, Decide, Review) on a ruled line;
- "The toolkit" for **The four sections**: each section emblem from `glyphs/sections/` beside a shelf of four of its model emblems from `glyphs/models/`, with the section title and a one-line aside;
- **Thinking skills you have used**: the twelve skill marks from `packages/problem-solver/glyphs/skills/`, each with a two-tone count bar (ink for Decision Maker, a neutral grey for Problem Solver) and the caption "Across Problem Solver and Decision Maker".

Responsive: at 390px it stacks exactly as Problem Solver's mockup does, with 16px side gutters and no horizontal scroll.

- [ ] **Step 2: Build `session.html`**

The same structure as Problem Solver's `session.html`, in the Decision Maker language:

- back link and title "Should I take the Sydney job offer?";
- the **track**: Frame done, Explore current, Decide and Review faint;
- the **section compass**: the four section emblems in a 2×2 above the canvas, with "Understand yourself" lit and the rest in tint;
- the canvas: an Eisenhower matrix drawn to this edition, with urgency rising to the right and importance rising upwards. The quadrants are labelled decide when (top left), do immediately (top right), do later (bottom left) and delegate (bottom right). It holds four sample pills, one of them contested (an exclamation mark plus the label "contested"), with flat squares and no shadows;
- the coach panel: three messages, a skills row under the coach message, and a suggestion card: "Another angle: The rubber band model. What holds you and what pulls you." with Accept and Not now;
- the skill tray: twelve marks, three filled.

At 390px the matrix reflows into four labelled cards, as the kit's README requires.

- [ ] **Step 3: Build `set.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Problem Solver and Decision Maker</title>
<style>
  body { margin: 0; background: #faf8ef; font-family: system-ui, sans-serif; color: #171813; }
  h1 { font-size: 18px; margin: 16px; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 0 16px 16px; }
  figure { margin: 0; }
  figcaption { font-size: 13px; margin-bottom: 6px; }
  iframe { width: 100%; height: 900px; border: 1px solid #c9cabd; background: #fff; }
  @media (max-width: 900px) { .pair { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<h1>Side by side: the set</h1>
<div class="pair">
  <figure><figcaption>Problem Solver</figcaption><iframe src="../problem-solver/landing.html" title="Problem Solver landing"></iframe></figure>
  <figure><figcaption>Decision Maker</figcaption><iframe src="landing.html" title="Decision Maker landing"></iframe></figure>
  <figure><figcaption>Problem Solver session</figcaption><iframe src="../problem-solver/session.html" title="Problem Solver session"></iframe></figure>
  <figure><figcaption>Decision Maker session</figcaption><iframe src="session.html" title="Decision Maker session"></iframe></figure>
</div>
</body>
</html>
```

- [ ] **Step 4: Serve the mockups and check them**

Add this entry to the `configurations` array in `.claude/launch.json`:

```json
{ "name": "mockups", "runtimeExecutable": "python3", "runtimeArgs": ["-m", "http.server", "4317", "--directory", "docs/mockups"], "port": 4317 }
```

Start it with `preview_start { name: "mockups" }`. Open `/decision-maker/set.html` at desktop width, then `/decision-maker/landing.html` and `/decision-maker/session.html` at 390px (`resize_window` preset mobile). Check:
- no horizontal scroll at 390px (`document.documentElement.scrollWidth <= innerWidth`);
- every emblem renders;
- no gradients or shadows (`getComputedStyle` on cards: `box-shadow` is `none`);
- the two landing pages share the same grid positions.

Take a screenshot of `set.html` and of both mockups at 390px.

- [ ] **Step 5: Commit**

```bash
git add docs/mockups/decision-maker .claude/launch.json
git commit -m "Decision Maker: landing and session mockups in the set language

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Approval gate**

Send Adam the `set.html` screenshot and the two 390px screenshots, and ask for approval of the design language. **Do not start Plan 2 until Adam approves.** Fold any changes he asks for into the mockups (and the spec's design-language section if a rule changes), then commit.

---

### Task 11: Plan 1 check

- [ ] **Step 1: Run every unit test**

Run: `npm run test:unit`
Expected: PASS, including all `problem-solver-*` and `decision-book-*` files.

- [ ] **Step 2: Type-check the Tasks app for Problem Solver files**

Run: `cd apps/tasks && npx tsc --noEmit -p . 2>&1 | grep -E "problem-solver|decision-book" || echo "no problem-solver or decision-book errors"`
Expected: `no problem-solver or decision-book errors`. The Tasks app has pre-existing unrelated errors; the gate is that none are in these paths. If `apps/tasks/node_modules` is missing, run `npm ci` in `apps/tasks` first.

- [ ] **Step 3: Record progress**

Do not push and do not open a PR: Decision Maker ships as one PR at the end of Plan 5. Update the memory file `decision-book-tool.md` with "Plan 1 done (HEAD <sha>)" and the outcome of the mockup approval.
