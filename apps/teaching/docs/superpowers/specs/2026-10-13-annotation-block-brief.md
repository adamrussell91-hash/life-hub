# Annotation block: build brief (steps 1 and 2)

**Date:** 2026-10-13
**App:** `apps/teaching`
**Status:** Build brief for Cursor. Slices 1a to 2c. Nothing past step 2 is in scope.
**Concept doc (governs):** `docs/future-build-ideas/annotation-block.md`. Its "Critical review" section and verdict table win over any idea above it.

## What Adam gets

A new block, `annotation`, that shows a poem (or any prose) with Adam's annotations drawn on it, and a **layer slider** along the bottom. Text only at the left; drag right and each named layer overlays on top of the last (1 Structure, 2 Imagery, ...). Layers not yet revealed leave small "something is here" markers. A Teacher notes layer sits at the far right and never reaches students.

**Governing principle.** This is Adam's annotation tool, not a student activity block. Students view and reveal. Nothing collects student input. No accounts, no taps stored, no heatmap, no read tracking, no replies.

## Out of scope (do not build, do not stub)

- Threads and thread focus (the accordion fold).
- Voice clips and voice feedback.
- Anthology / unit view; notes to flashcards.
- Anything that collects student input: commits, ballots, heatmaps, read tracking, replies, paragraph builder.
- Alchemy or AI suggestions, the table's Scanner pane, auto-annotation.
- Scansion, rhyme or performance overlays; ghost words; zoom levels (the slider replaces them).
- Feedback mode on student drafts.

P4 applies to the brief too: no "coming soon", no disabled placeholder buttons, no phase wording in any user-visible string.

## Read first

- `CLAUDE.md`, `AGENTS.md`: the pre-PR gate. Run `npm run pre-pr-check` from the repo root; exit 0 before opening or updating a PR.
- `docs/CURSOR-UI-FAILURES.md`: run the check for every ID in "Failure modes" below before ticking anything.
- Patterns to copy (all verified present):
  - `apps/teaching/src/schemas/block.ts`: `ImageBlockSchema` (W3C-style `annotations`), `leafBlockSchemas`, `VisibilitySchema`, `blockLayout`, `blockTimestamps`.
  - `apps/teaching/src/blocks/registry.ts`, `render.ts` (`RenderMode = 'teacher' | 'student' | 'print'`, `wrapBlock`), `editors.ts`, `create-block.ts`, `block-meta.ts`.
  - `apps/teaching/src/blocks/embed-url.ts` (`parseEmbedInput`, `embedFrameSrc`), `video-url.ts` (`parseVideoInput`, `parseStartTime`, `videoEmbedSrc`), `url-safety.ts` (`isHttpUrl`).
  - `apps/teaching/src/blocks/sanitize.ts` (`sanitizeRichTextHtml`), `sanitize-blocks.ts` (`sanitizeBlocksDeep`), `walk-blocks.ts`.
  - `apps/teaching/src/blocks/visibility.ts` (`filterBlocksForStudent`) **and its production twin** `netlify/functions/_shared/teaching-student.mjs`.
  - `apps/teaching/design-kit/js/hub-image-annotate.js` (link to `packages/design-kit/`): the existing annotation JSON shape.
  - `packages/design-kit/js/hub-list.js`: the list builder (I13).
  - House spec format: `apps/teaching/docs/superpowers/specs/2026-09-05-ann-reflection-coach-design.md`. Slice format (Must / Must-not / Verify / Files) as in `docs/proposals/challenge-sprints-build.md`.

## Decisions made in this brief

1. **Dedicated block, not a `rich_text` mode.** Stanza and line structure needs its own schema; `rich_text` stores a sanitised HTML string and cannot anchor reliably.
2. **Periodic Table data: vendor a JSON snapshot into the hub; do not fetch at runtime.**
   - The student view is a static published snapshot (`lesson-publish.mjs`). A runtime fetch from GitHub Pages would put a third-party network dependency, a CORS question and a failure state into every student page load, and a table edit could silently recolour or re-symbol a published lesson.
   - The table has **no JSON today**. Its data is inline JS in `Periodic-Table-of-Literary-Elements.html` (`taxonomyRoot`, built with `T(name, def, effect, example, related[])`). Colours come from `FAMILY_COLORS`. **Symbols are generated at page load in table order** (`gen()` picks 2 to 3 letters and avoids collisions), so a symbol can change when a technique is added or reordered. A snapshot must therefore **freeze** symbols and give each technique a stable `id` (slug of the name).
   - Annotations store the technique `id` plus the snapshot `version`. Display data (symbol, colour, definition, effect) is looked up from the snapshot at render time, so a table refresh never rewrites lessons.
   - Refresh is a manual script (`apps/teaching/scripts/sync-literary-elements.mjs`) that parses the widgets file and rewrites the snapshot with a diff. Existing ids and symbols are preserved; only additions are new.
   - Counts to assert: 5 families, 21 subgroups (4 + 4 + 3 + 8 + 2), about 310 techniques. Family display names: `Descriptive`, `Repetitive`, `Comparative`, `Structural`, `Intertextual & Metafictional` (key `Intertextual`).
3. **Deep links (`#el=enjambment&pane=drill`) are a separate, tiny, optional slice in the `widgets` repo** (see Slice W below). Nothing in steps 1 and 2 depends on it. Until it ships, the technique chip shows the definition and effect inline from the snapshot and offers no external link.
4. **Teacher-notes stripping happens at publish, in the `.mjs` twin**, not only in the browser. See 2c.

## Data contract

Zod-ish sketch. Names are a guide; follow `schemas/block.ts` conventions (`.strict()` where siblings do, `blockLayout`, `blockTimestamps`, `visibility`).

```ts
// content of block_type: 'annotation'
AnnotationBlockContent = {
  title?: string,
  attribution?: string,                // poet, source
  text: {                              // structured text
    kind: 'verse' | 'prose',
    stanzas: Array<{ id: string; lines: Array<{ id: string; text: string }> }>,
    // prose: each paragraph is one "stanza" with a single line holding the paragraph text.
    // Tokens are derived at render from `text` (split on whitespace/punctuation).
    // Never store tokens: offsets below index into the line string.
  },
  layers: Layer[],                     // ordered; slider stop order = array order
  annotations: Annotation[],
  settings: {
    show_markers: boolean,             // default true; false = cold read
    default_layer_id?: string          // where the slider opens for students; default 'text only'
  }
}

Layer = {
  id: string,
  name: string,                        // "Structure", "Imagery", "Context", "Gender lens"
  kind: 'family' | 'free' | 'lens' | 'teacher',
  family?: FamilyKey,                  // when kind === 'family': 'Descriptive' | ... | 'Intertextual'
  colour: string,                      // token name from a fixed palette, not raw hex typed by Adam
  symbol?: string,                     // free layers only; family layers use element symbols
  sublayers?: Array<{ id: string; name: string; subgroup?: string }>  // family layers: the 21 subgroups
}
// Exactly one kind:'teacher' layer is allowed, always last, not reorderable, not deletable
// except by deleting the whole feature on the block ("Remove teacher notes").

Annotation = {
  id: string,
  layer_id: string,
  sublayer_id?: string,
  anchor: {
    granularity: 'word' | 'phrase' | 'line' | 'stanza',   // derived from the fields below, stored for cheap filtering
    stanza: string,                    // stanza id
    line?: string,                     // line id
    start?: number, end?: number,      // char offsets into that line's text, [start, end)
    quote: { exact: string; prefix?: string; suffix?: string }   // W3C TextQuoteSelector
  },
  technique?: { id: string; table_version: string },      // set => layer/sublayer/colour/symbol come from the table
  body: {
    html: string,                      // rich text, sanitised with sanitizeRichTextHtml
    attachments: Array<
      | { kind: 'link';  url: string; label?: string }              // isHttpUrl
      | { kind: 'video'; url: string; start_seconds?: number }      // parseVideoInput / parseStartTime
      | { kind: 'audio'; url: string; title?: string }              // same rules as AudioBlock
      | { kind: 'image'; url: string; alt_text: string }            // same rules as ImageBlock
      | { kind: 'block'; block_id: string }                         // link to another block in the lesson
    >
  },
  created_at, updated_at
}
```

**Anchor resolution.** Try `{stanza, line, start, end}` first and accept it if `line.text.slice(start, end) === quote.exact`. If not, search the stanza, then the whole text, for `quote.exact` disambiguated by `prefix`/`suffix`. If still no match, mark the annotation **orphaned**: keep it, list it in the editor under "Needs re-anchoring", and do not draw it in student or print views (never silently draw it in the wrong place; D1). Granularity drawing: word and phrase = underline; line = margin bar; stanza or paragraph = gutter bracket.

## Slices

Build in order. One PR per slice unless Adam says otherwise. Each slice ticks only when its Verify list passes (P1, P5).

### 1a. Schema, render, sanitise, publish plumbing

**Must**
- Add `AnnotationBlockSchema` to `schemas/block.ts` and to `leafBlockSchemas`; add `'annotation'` to `BlockTypeSchema`. Export the inferred types.
- Pure helpers in a new `blocks/annotation-anchor.ts`: `resolveAnchor`, `buildAnchor(selection)`, `granularityOf`, `orphans(block)`. No DOM.
- `renderAnnotationBlock` in `render.ts` for all three `RenderMode`s, registered in `registry.ts`, with an icon and a description in `block-meta.ts` and an entry in `create-block.ts` (insert menu).
  - **teacher and student:** text with anchors drawn by granularity; clicking or focusing an anchor opens its body in a side panel (desktop) or a bottom sheet (390px).
  - **print:** all layers up to the last non-teacher layer, bodies as numbered footnotes; attachments reduced to labelled URLs via the existing `renderPrintFallback`. No teacher layer in print, ever.
- Annotation `body.html` goes through `sanitizeRichTextHtml`. Attachment URLs go through `isHttpUrl`; video through `parseVideoInput`; embeds through `parseEmbedInput`/`embedFrameSrc`. **No new sanitiser, no new URL parser.**
- Extend `sanitize-blocks.ts` (`sanitizeBlocksDeep`) to sanitise every `annotations[].body.html`, **and mirror the same change in `netlify/functions/_shared/teaching-student.mjs` `sanitizeBlocksDeep`**, which today only handles `rich_text`/`html`. The published snapshot is built there, not from the TS file.
- Add the block to `search-text.ts` (so lesson search finds annotation text).

**Must-not**
- No `innerHTML` with unsanitised strings; no `iframe` except through `embedFrameSrc`.
- No token arrays in storage. No student input of any kind (no click counts, no localStorage of "seen").
- No second renderer for the same data (V8): the teacher, student and print views share one layout function and differ only by mode flags.
- No new npm dependency for text anchoring. The W3C selector logic is about 80 lines; write it.

**Verify**
- `cd apps/teaching && npm run test:unit` green. New tests in `tests/unit/annotation-anchor.test.ts`: exact hit; line edited by one word, quote fallback still hits; duplicated quote resolved by prefix; deleted text gives orphan; offsets past end of line clamp to orphan.
- Round trip: `AnnotationBlockSchema.parse` on a fixture "Dulce et Decorum Est" opening stanza (public domain) with one word, one phrase, one line and one stanza annotation.
- Sanitise test: an annotation body with `<script>`, `onerror=` and a `javascript:` link is clean after `sanitizeBlocksDeep` **in both** the TS and the `.mjs` implementation (`tests/unit/teaching-student.test.js` pattern).
- Manual at 1440 and 390: underline, margin bar and gutter bracket are visibly different; tap an annotation, body opens, close returns focus to the anchor; `document.documentElement.scrollWidth === innerWidth` at 390.
- Print preview (`open-print.ts`) shows footnotes, no side panel.

**Files**: `src/schemas/block.ts`, `src/blocks/{annotation-anchor,render,registry,create-block,block-meta,sanitize-blocks,search-text}.ts`, `netlify/functions/_shared/teaching-student.mjs`, `src/styles/` (follow where `block-*` CSS lives), `tests/unit/annotation-*.test.ts`, `tests/unit/teaching-student.test.js`, `fixtures/` (poem fixture).

### 1b. Teacher editor

**Must**
- `createAnnotationEditor` in `editors.ts`, wired in `registry.ts`.
- **Text entry:** paste a poem; blank line = new stanza, newline = new line. A "Prose" toggle treats each paragraph as one stanza. Editing text never deletes an annotation; it re-resolves anchors and surfaces orphans.
- **Create an annotation:** select text in the teacher view (word, phrase), or click a line gutter (line), or a stanza gutter (stanza). The editor opens **beside the text, in view, at body text size** (I11) with: layer picker, body (the kit's existing rich-text editing, the same one `rich_text` uses), attachments list, technique picker (2b adds the table; in 1b the picker is hidden, not disabled).
- **Attachments:** Add link / video (with start time field, accepts `?t=` URLs via `parseStartTime`) / audio / image / link to another block (picker lists blocks of the same lesson via `walk-blocks.ts`, live blocks only).
- Annotations list, attachments list and layer list are **kit list builders** (`hub-list.js`): add, reorder, ··· menu, press-and-hold delete with Undo (I13).
- Names and choices use `askTextCard` / `askSelectCard`, never `window.prompt` (I10).
- "Needs re-anchoring" panel lists orphans; clicking one lets Adam re-select the text.

**Must-not**
- No hand-rolled ↑ ↓ / Remove buttons. No `window.prompt`/`confirm`/`alert`.
- Escape inside the annotation body or any text field must not close the editor panel (I8).
- Saving must not wait on anything slow (I9); autosave in the same way sibling editors do.
- A repaint after save must keep the selected annotation, the panel scroll and the page scroll (V7, I12).

**Verify**
- Unit: creating a word annotation yields offsets whose slice equals `quote.exact`; reordering attachments persists; deleting then Undo restores it.
- `grep -rn "window.prompt\|window.confirm\|alert(" src/blocks` over changed files returns nothing; `grep -n "textContent = '↑'\|'Remove'" src/blocks` returns nothing.
- Browser (Playwright, `tests/browser/`): select a phrase, choose a layer, type a body, add a YouTube link with `t=90`, save, reload, the annotation is still anchored and the video opens at 90 s.
- Manual at 1440 and 390: editor panel is visible without scrolling when an anchor is selected; all controls reachable by keyboard (Tab, Enter, Esc).

**Files**: `src/blocks/editors.ts` (or a new `annotation-editor.ts` imported from it, to keep `editors.ts` from growing past 2,700 lines), `src/blocks/registry.ts`, `src/blocks/create-block.ts`, styles, tests.

### 2a. Layers and the slider

**Must**
- Layers editor (kit list builder): add a free-named layer, add a lens layer, reorder, rename, pick a colour from the fixed palette, set a symbol for free layers. Layers can be added before any annotation exists.
- **Slider** along the bottom of the block, rendered as a real `<input type="range">` (min 0, step 1, max = number of stops) plus visible stop labels. Stop 0 = "Text only". Moving to stop *n* shows layers 1..*n* cumulatively.
- **Colour chips**, one per revealed layer, in the layer colour; each is a `<button aria-pressed>` that toggles that layer off or on independently of the slider (so Imagery can be shown alone after revealing four layers). Family layers expand their sub-layer chips under the layer chip, each independently toggleable.
- **Markers:** an anchor in a not-yet-revealed (or toggled-off) layer shows a small coloured dot, or the layer symbol, at its anchor. `settings.show_markers === false` removes them all (cold read). Marker colour must not be the only cue: each also carries the layer symbol or a `title`/aria label with the layer name (never "something is here" as the only label).
- **State** lives in one object outside the repaint function: `{ stop, toggled: Set<layerId|sublayerId>, openAnnotationId }`. The slider, chips, markers and text all derive from it (V2, V7). Changing it from the keyboard, the slider or a chip updates the others.
- **Keyboard on a projector:** with the slider focused, Left/Right (and Up/Down) step the stop, Home = Text only, End = last visible stop. Also, when the block has focus but no text control is focused, Left/Right step the stop. A visible focus ring at least 3 px.
- Student view always opens at `default_layer_id` (default Text only) on each load. Do not persist the position (no storage of student state).
- Print mode ignores the slider and prints every non-teacher layer.

**Must-not**
- No student state stored anywhere, including `localStorage`.
- Do not hide the slider at 390 (R5). At phone width: slider full width at the bottom of the block, chips in one horizontally scrolling row (inside its own `overflow-x:auto`, not the page), sub-layer chips behind the layer chip in a sheet.
- No more than one row of layer chips on desktop before it scrolls or collapses (L5, L6).
- No animation that loops or pulses markers (M1). A short fade on reveal is fine and must respect `prefers-reduced-motion`.

**Verify**
- Unit (`annotation-layers.test.ts`, pure): visible set for stop 0, 2, last; toggle off layer 1 at stop 3; markers list for a given state; `show_markers:false` gives none; teacher layer excluded from the student visible set.
- Browser: at 1440 drag/arrow through every stop on the fixture; chip colours match marker colours; toggling a chip does not move the slider; resize 1440 to 390 to 1440 without reload keeps the stop and toggles (R1).
- At 390: every stop is reachable by tap or arrow keys; `scrollWidth === innerWidth`; chips `getClientRects().length === 1` each; slider thumb target at least 44 px.
- Keyboard-only run-through of a 5-layer fixture with no mouse.

**Files**: `src/blocks/annotation-layers.ts` (pure state and selectors), `render.ts`, the editor file, styles, `tests/unit/annotation-layers.test.ts`, `tests/browser/annotation.spec.ts`.

### 2b. Periodic Table mapping

**Must**
- Add `src/data/literary-elements.json` (vendored snapshot) with:
  ```
  { version, source: "widgets@<short sha>", families: [{ key, name, colour }],
    subgroups: [{ id, family, name, definition }],
    techniques: [{ id, symbol, name, subgroup, definition, effect, example, related: [id] }] }
  ```
  Family colours copied from `FAMILY_COLORS` as hex; the editor maps them to the palette (check contrast against the text background in light and dark, adjusting the tint used for underlines, not the identity colour). Related names resolved to ids; unresolved names are dropped and logged by the script.
- `apps/teaching/scripts/sync-literary-elements.mjs`: reads the widgets HTML (path or URL argument), evaluates only the data section, regenerates the symbols with the same algorithm as the page for **new** techniques only, preserves existing ids and symbols, prints a diff summary, and fails loudly if counts fall outside 5 families / 21 subgroups / 280 to 340 techniques. The script is run by hand; it is not part of the build.
- Loader `src/blocks/literary-elements.ts`: typed access, `lookupTechnique(id)`, `subgroupsOf(family)`. Import the JSON lazily (`import()`) so it stays out of the entry bundle (W4); the student view loads it only when a block contains a technique-tagged annotation.
- **Family layer:** in the layers editor, "Add from the Periodic Table" offers the 5 families. Choosing one creates a layer with `kind:'family'` and its subgroups as sub-layers (e.g. Comparative → Figurative, Symbolic, Contrast). Adam may delete sub-layers he doesn't want.
- **Technique tag:** in the annotation editor, a searchable technique picker (type-ahead over name and symbol, grouped by family then subgroup). Choosing a technique sets `technique`, and **automatically** sets `layer_id` (creating the family layer if missing), `sublayer_id`, colour and marker symbol. If Adam has put the annotation on a free layer deliberately, tagging keeps that layer and still shows the element tile.
- **Element tile** (symbol over name, family colour) in the annotation body; expandable to show definition, effect, example and related techniques from the snapshot.
- Markers for family layers show the **element symbol** in the family colour.

**Must-not**
- No runtime fetch from GitHub Pages or the widgets repo. No dependence on network for rendering a published lesson.
- Do not store definitions or effects on the annotation (only `technique.id` and `table_version`); do not rewrite lessons when the snapshot is refreshed. If a stored id is missing from the snapshot, render the annotation without the tile and list it in the editor under "Needs attention" (never throw, never blank).
- No link to the widgets table in the product until Slice W exists.
- Do not touch the widgets repo in this PR.

**Verify**
- Run the sync script against the current widgets file: output counts printed; re-run produces zero diff (idempotent).
- Unit: every technique id and symbol is unique; every `related` id exists; all 5 families have a colour; each of the 21 subgroups has at least one technique.
- Unit (D4): tagging "Enjambment" (and one technique from each family) sets the right family layer, sub-layer, colour and symbol; use real technique names from the snapshot, not invented ones.
- `vite build`: the JSON is in its own chunk; entry `index-*.js` under 300 kB (W4).
- Manual at 1440 and 390: the technique picker is usable on a phone (full-width sheet, not a clipped dropdown, S5); tiles do not wrap mid-symbol (L6).

**Files**: `src/data/literary-elements.json`, `scripts/sync-literary-elements.mjs`, `src/blocks/literary-elements.ts`, editor and renderer files, styles, tests.

### 2c. Teacher-notes layer: stripped before it reaches students

**Must**
- The `teacher` layer and every annotation on it are **removed from the published snapshot**, not hidden in the browser.
- Implement the strip in **both** places, kept in step:
  - `netlify/functions/_shared/teaching-student.mjs` `filterBlocksForStudent`: for any block with `block_type === 'annotation'`, drop layers with `kind === 'teacher'`, drop annotations whose `layer_id` is one of them, and also drop any annotation `attachments` of kind `block` that point at a `teacher_only` block. This is the production path used by `lesson-publish.mjs` (draft → `filterBlocksForStudent` → snapshot) and re-applied where `published-lesson.mjs`, `published-unit.mjs` and `published-class.mjs` read blocks. Check each of those for a second filter call and add the strip wherever they call `filterBlocksForStudent`.
  - `src/blocks/visibility.ts` `filterBlocksForStudent` (used by `print/render-print-lesson.ts` and `schedule/build-published-class.ts`) and `scripts/mock-api.ts` (inherits it).
- Both implementations recurse through `section`, `columns` and `tabs`, as the existing filter does. An annotation block nested in a tab must be stripped too.
- `render.ts` in `student` and `print` modes also ignores any `teacher` layer it somehow receives (defence in depth); teacher mode shows it as the last slider stop, labelled "Teacher notes", visually distinct (not a pastel chip that reads as a student layer).
- A block whose `visibility` is `teacher_only` is dropped whole by the existing filter, as before.
- The teacher layer cannot be turned into a normal layer by editing `kind` in the UI. Moving annotations onto it is allowed; moving them off it asks via `askSelectCard`.

**Must-not**
- No client-side-only hiding (CSS, `hidden`, or `if (mode==='student')` alone).
- The student payload must not contain the strings of any teacher note, the teacher layer's name, or its id in `annotations[].layer_id`. A "Teacher notes" stop must not appear at all (a slider with a dead last stop is a leak and a P4 failure).
- Do not let the two filter implementations drift: a shared fixture drives both tests.

**Verify**
- Unit, TS (`tests/unit/visibility.test.ts` extended) and JS (`tests/unit/teaching-student.test.js` extended), same fixture: a block with a teacher layer containing the sentinel text `SECRET-TEACHER-NOTE`; after `filterBlocksForStudent` + `sanitizeBlocksDeep`, `JSON.stringify(result)` does not contain the sentinel, the teacher layer id, or `"kind":"teacher"`. Cover: top level, inside a section, inside columns, inside tabs.
- Integration through the real path (W2): publish a lesson containing the fixture via `lesson-publish.mjs` (use the existing integration pattern in `tests/integration/`), fetch the published lesson via `published-lesson.mjs`, assert no sentinel. Name this test in the PR ledger.
- Manual: publish the fixture; open the student URL in a private window; View Source / network tab response contains no `SECRET-TEACHER-NOTE`; slider ends at the last real layer; teacher view still shows Teacher notes as the final stop.
- Print (`render-print-lesson.ts`): no teacher note in the printed lesson.

**Files**: `netlify/functions/_shared/teaching-student.mjs`, `netlify/functions/{lesson-publish,published-lesson,published-unit,published-class}.mjs` (only if they bypass the shared filter), `src/blocks/visibility.ts`, `src/blocks/render.ts`, `tests/unit/{visibility.test.ts,teaching-student.test.js}`, `tests/integration/`.

### Slice W (separate, optional, `widgets` repo, do not start without Adam)

Add hash deep links to `English/Tools/Widgets/Periodic-Table-of-Literary-Elements.html`: `#el=<technique-id>&pane=<pane>` selects the element and opens the named pane (Compare, Bond, Relations, Drill, Flash, Write & Grade, Revise, Scanner). Ids must be the same slugs as the hub snapshot. This is independent of steps 1 and 2; when it lands, a one-line follow-up in the hub adds a "Drill this technique" link on the element tile. Workable without the hub; test in the widgets repo only.

## Failure modes (from `docs/CURSOR-UI-FAILURES.md`)

Run the check for each before ticking any UI item. Feature-specific checks:

| ID | Why it applies | Check for this feature |
|---|---|---|
| **L1** | Text column plus side panel | At 1440, the annotation block's right edge matches sibling blocks ±1px; grid tracks use `minmax(0, Nfr)`; the poem column does not collapse to ~400px when the panel is closed. |
| **L2** | Annotation cards and tiles | Collapsed annotation row at most 56 px tall; element tile at most 72 px. Measure and state in the PR. |
| **L5** | Layers and slider controls on phone | At 390 the controls (slider, chip row, settings) occupy at most 2 rows. |
| **L6** | Layer chips, element tiles, markers | Every chip and tile has `getClientRects().length === 1` at 390 and 1440; long layer names truncate with ellipsis and `title`. |
| **L11** | Markers and anchor decorations | Markers are children of the element the CSS positions them against; screenshot a marker at the end of a line and on a wrapped line. |
| **S1** | Reusing kit list builder and `renderPrintFallback`, `embedFrameSrc` | Grep CSS for ID- or parent-scoped selectors on anything reused; screenshot each reused piece next to its original home. |
| **S3** | Annotation side panel, bottom sheet, technique picker | No underlying poem text visible through the open panel or sheet (`background: var(--paper)`, `backdrop-filter: none`). |
| **S5** | Technique and layer pickers | Dropdown/sheet paints above the slider and the next block at both widths. |
| **V1** | Panel, chips, sub-layer rows toggled with `hidden` | Every toggled element with a `display:` rule has `.x[hidden]{display:none}`; after hiding, `offsetHeight === 0`. |
| **V2** | Slider, chips, markers, open annotation | Change the stop by keyboard, then by dragging, then by a chip: all four stay in agreement every time. |
| **V7** | Stop, toggles, open annotation, editor selection | Reveal to stop 3, toggle one layer off, open an annotation, save in the editor: all three survive the repaint. |
| **V8** | Teacher, student, print renderers | One layout function; `grep` shows a single place that draws anchors. |
| **R1** | Different DOM per breakpoint (side panel vs bottom sheet) | Resize 390 → 1440 → 390 without reload; panel and sheet swap correctly, state kept. |
| **R2** | Chip row, long lines | `document.documentElement.scrollWidth === innerWidth` at 390 with the longest fixture line and 8 layers. |
| **R3** | Every new component | A 390 screenshot of slider, chip row, annotation sheet, technique picker, editor, layers editor. |
| **R5** | Slider and chips must not vanish on phone | At 390 every stop is reachable by tap from every other stop. |
| **R6** | Bottom sheet and slider vs fixed tab bar | Sheet and slider are fully tappable above the tab bar on a phone. |
| **D3** | Screenshots | Acceptance screenshots use a real lesson Adam names (not demo data); the fixture is a public-domain poem. |
| **D4** | Technique → layer mapping | One test per family using real technique names from the snapshot. |
| **T1** | Annotation text, tiles, chips | Every text node uses a kit size token; no computed size above the stated max; `grep -n "font-size[^}]*font:inherit"` over changed CSS returns nothing. |
| **I2** | Anchors, chips, stops | Anchors are `<button>` or `<a href>`; Tab and Enter open them. No click handlers on bare spans. |
| **I3** | Empty states | A block with no annotations or one layer says what to do ("Select text to add a note"); no dead buttons. |
| **I8** | Editor text fields | A test focuses the body field, dispatches Escape, asserts the panel is still open. |
| **I10** | Naming layers, choosing a block to link | `grep -rn "window.prompt\|confirm(\|alert(" src/blocks` over changed files returns nothing. |
| **I11** | Annotation editing | Selecting an annotation opens its editor beside it, in view, at body text size; every layer has a rename control. |
| **I12** | Remount after save | Scroll down the poem, edit an annotation, save: window scroll is unchanged. |
| **I13** | Layers, annotations, attachments, sub-layers | Each list: add, reorder via menu, press-and-hold delete, Undo, covered by a test using `hold()`. |
| **W1** | Any new fetch | `grep -n "fetch('/"` over changed files returns nothing. |
| **W2** | Teacher strip works in tests but not in production | The integration test through `lesson-publish.mjs` and `published-lesson.mjs` is named in the PR ledger. |
| **W4** | Table JSON | `vite build`: entry `index-*.js` under 300 kB; the JSON has its own chunk. |
| **P1** | Mockup comparison | If Adam supplies a mockup, put the screenshot beside it and write the deviations. Without one, list the slice's Must items with a pass line each. |
| **P4** | Placeholders and phase wording | `grep -rnE "Phase [0-9]|arrives in|is built|coming soon"` over view strings returns nothing; no `button[disabled]` at rest. |
| **P5** | Partial build as the whole build | The PR ledger lists every Must in the slice as done or not done; do not mark the PR ready with any open. |

New failures found in review become entries in the register in the same PR.

## Acceptance (end of step 2)

On a lesson Adam names, with a real poem: five layers (three from the table, one free, Teacher notes), 15 or more annotations covering all four granularities, one with a timed video and one with an image. Adam drags the slider on a laptop and a phone, and arrows through it on a projector. A student URL opened in a private window shows no teacher layer in the page source. Print shows all student layers as footnotes.

## Open questions (for Adam, not blockers for 1a)

1. **Copyright.** Contemporary poems on public student pages: does the block need a "teacher-supplied text, not published publicly" setting that withholds the text from the student payload? (Suggest: decide before 1a merges; if yes, it is one more field and one more strip in 2c.)
2. **Chip colours for Adam's own layers.** Fixed palette of 8 (suggested) or free colour picker? A fixed palette keeps contrast safe.
3. **Technique on a free layer.** When Adam tags a technique on an annotation he put on a free layer, keep it on the free layer with a tile (as drafted) or move it to the family layer?
4. **Marker for many layers on one spot.** Stack up to three dots then a "+n"? Confirm.
5. **Block links in annotations.** Should a student see a link to a block that sits inside a `teacher_only` section? Brief drops it; confirm.
6. **Slice W timing.** Do the deep links first (cheap, independent) or after 2b?
