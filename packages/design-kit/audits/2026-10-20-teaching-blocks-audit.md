# Teaching Hub block design-language audit

**When:** 20 October 2026
**Source:** `main` at `b2f031f76`
**Scope:** all 60 lesson block types in `NEW_BLOCK_TYPES` (`apps/teaching/src/blocks/create-block.ts`), rendered as a student sees them and as a teacher sees them. Block editors are not covered.

## How it was checked

1. Every block type was rendered from its default content (plus filler text for the prose blocks) on a local preview page with the real Teaching stylesheets, at 1100px and 390px.
2. For every heading, label, paragraph, button and toggle inside each block, the browser's **computed** font, size, weight, case, colour, fill, radius, border and height were read. 508 elements in all.
3. Each block's CSS was scanned for raw hex, raw px/rem font sizes, off-token radii and raw shadows.
4. Screenshots of each family were compared side by side.

Live activity blocks (peer feedback, brainstorm, question drop) show "Loading…" without a server, so their running states were checked from source, not screenshots.

## Verdict

The tokens are mostly respected. The **grammar** is not shared. Each block family invented its own way of saying "this is the label", "this is the title", "this is what you read", "press this", "switch this view", and "nothing here yet". Read in a row on one lesson page, the blocks look like they came from four or five different products that share a palette.

The worst issue is hierarchy. The **Heading block, the thing meant to structure a lesson, is weaker than the titles inside other blocks.** A section heading is 17px, the same size as body copy. A subsection heading is 15px, smaller than body copy. Meanwhile the brainstorm prompt, question-drop prompt and every toolkit card title are 21px.

The critical thinking and analogy blocks are the most internally consistent family. That is fine as a specialised look. They drift from each other in small ways listed below.

## Family scorecard

| Family | Blocks | Internal consistency | Matches the rest of the hub |
|---|---|---|---|
| Prose | rich text, heading, callout, quote, definition, code, divider, spacer, HTML, HTML app, equation | Low | Sets the baseline, but the baseline is wrong (16px body, weak headings) |
| Media | image, gallery, video, embed, audio, attachment, diagram, chart, whiteboard, mind map, concept map | Medium | Empty states differ in five ways |
| Structure | columns, section, tabs, accordion, table, timeline, card stack, collection, anthology, outcomes, curriculum lines | Low | Three different view switches; card stack is a different weight class |
| Self practice | question set, flashcards, cloze, self check, quiz question | Medium | Uses kit `.btn` but without variants; inner panels don't fill the block |
| Live activities | peer feedback, brainstorm, question drop, classroom tools, countdown | Medium | Peer feedback / brainstorm / question drop share a grammar. Classroom tools has its own button skin with a different primary colour |
| Critical thinking toolkit | skill, tool, value, thinking move, question quadrant, concept features, intentions, reflection | High | Specialised, intentional. Off-scale sizes in the CSS |
| Analogy | analogy types, seven analogy moves, fluid analogy | High | Specialised. Eyebrow and title row differ from the toolkit it sits beside |
| Teacher / annotation | teacher note, annotation, Discern, Kaplan attachments | Medium | Annotation element cards run a private dark palette and a serif |

## Findings

### 1. Headings: no shared title level

Computed sizes of the thing a reader would call "the title of this block":

| Size / weight / colour | Where |
|---|---|
| 21px / 700 / navy | Heading block (page variant), every toolkit and analogy card title |
| 21px / 600 / ink | Brainstorm prompt, question drop prompt |
| 17px / 700 / navy | **Heading block (section variant)**, toolkit step titles |
| 17px / 700 / paper | Countdown title |
| 16px / 700 / navy | Toolkit subheads, quadrant names, analogy step titles, "What do I need to do" |
| 16px / 600 / ink | Quiz question prompt |
| 15px / 600 / ink | Callout title, **Heading block (subsection variant)**, definition term |
| 13px / 700 / navy | Analogy "Build the bridge" |

- Seven title sizes and two title colours (navy vs ink) for the same job.
- `.block-heading--section` is `--text-md` (17px) and `--text-lg` is used only by `--page` (`apps/teaching/src/styles/app.css:5347-5358`). The kit says `--text-lg` is section headings and `--text-md` is reading copy and card titles.
- Peer feedback has no prompt title at all, only an eyebrow. Its siblings brainstorm and question drop both have a 21px prompt.
- Chart, table, timeline, gallery, mind map and concept map have no title slot, so a teacher has to put a Heading block above them. Toolkit cards carry their own title. Two models for the same need.

### 2. Eyebrows (small uppercase labels): five treatments

| Treatment | Where |
|---|---|
| 11px / 700 / High Sea ink + crown icon | Toolkit (skill, tool, value, move, quadrant, concept, intentions, reflection) |
| 11px / 700 / navy, no icon | Analogy family |
| 11px / 600 / muted | Peer feedback, brainstorm, question drop, quiz question, outcomes |
| 11px / 700 / muted | Question set "Your response", toolkit inner labels |
| 12px / 600 / muted, wider tracking (0.96px) | Classroom tools, countdown |
| 15px / 600 + icon, title case | Callout ("ⓘ Information"), then a second title under it |

The eyebrow is the clearest family signal you have. Toolkit and analogy sit next to each other in lessons but use different eyebrow colours and only one has the icon. Classroom tools is 1px bigger and tracked differently from everything else.

### 3. Body text: off the scale, and three reading sizes

- **Rich text, definitions, question prompts, toolkit guides, analogy text and quiz text compute to 16px.** 16px is not a step on the kit scale (15 or 17). Nothing sets a size, so they inherit the browser default. `.block-rich-text` has no font-size rule at all.
- Quote, toolkit definitions and question-set prompts are 17px (`--text-md`, the kit's reading size). A question-set prompt (17px) sits inside a list item at 16px.
- Peer feedback task text is 15px.
- **Callout body is 13px muted grey** (`app.css:5378`). A callout is meant to be the thing students notice. It is the smallest, palest prose on the page.
- Quadrant definitions, analogy type descriptions and compact sentence frames are 13px.
- Value list items (Clarity, Accuracy, …) are **11px, not uppercase**. The kit reserves 11px for uppercase micro-labels only.

### 4. Buttons: one kit, five local skins

| Skin | Look | Where |
|---|---|---|
| Kit `.btn` with a variant | 15px / 600, 14px radius | Peer feedback, brainstorm, question drop, quiz, Discern, Kaplan, anthology, card stack |
| Kit `.btn` with **no variant**, then restyled per block | Same shape, white at 88% instead of the kit's 62% | Flashcards, cloze, self check, toolkit "Show pairs", "Show an example", quadrant responses |
| `.ct-btn` / `.ct-btn--go` | 13px / 600, cotton fill; **primary is Wave blue** | Classroom tools (Start, Roll, Reset) |
| `.ct-chip` | 13px / 500 pill, 27px tall | Classroom tools tool list, divider |
| `.tk-chip` (`hub-list__chip`) | 16px / 400 pill, navy fill or white | Toolkit "Tools it uses" / "Skills in play" |
| `.tk-note__toggle` | 16px / 700 text button | Toolkit teacher notes |
| `.word-help-bar__btn` | 12px / 400 muted text button | Dictionary scan under rich text |

- The kit primary is navy. Classroom tools' primary is Wave. On a lesson page "Start" looks like a different kind of action from "Start brainstorm".
- Flashcards / cloze / self check use bare `.btn` and then paint them, so they bypass the variant system. Card stack uses `.btn--ghost` for the same Previous / Next job.
- Self-check's single button is full-width; flashcards and cloze centre a row of buttons; the toolkit left-aligns. No rule for alignment.

### 5. Toggles and view switches: four controls for one job

The kit locks `.hub-pills` for "switch the view". In blocks:

| Control | Where |
|---|---|
| `.hub-pills` (kit) | Anthology (By text / By theme / …) |
| Underline tabs, 15px, 36px tall | Tabs block |
| Solid navy segmented bar, square inner corners | Analogy Level 1 / 2 / 3 |
| `aria-pressed` text button | Dictionary scan |

Disclosure (show / hide) also splits: native `<details>` with the browser ▶ marker (accordion, "Chart data"), `.tk-note__toggle`, self-check's full-width "Show answer" button, and the callout motion toggle.

### 6. Containers: cards inside cards, inconsistently

Every block already sits in a white card (`.lesson-blocks .block`, 20px radius, `--elev-1`). Then:

- **Second card inside:** callout (shore), definition (bordered), code, accordion, table, question drop (cotton), quiz question (cotton), flashcards / cloze / self check (bordered panel), mind map (cotton), toolkit title boxes, countdown (navy), teacher note (peach), anthology pill bar.
- **Third level:** flashcards (block → panel → card).
- **Flat inside the card:** rich text, heading, quote, peer feedback, brainstorm, outcomes, classroom tools.

Question drop and quiz question have an inner cotton panel. Brainstorm and peer feedback, built on the same `.pf-` / `.qz-` grammar, do not.

Flashcards, cloze and self check panels have a max width but are left-aligned, so they leave a ragged empty strip on the right of the block at desktop width.

Card stack is a full-bleed navy card with `--elev-4`, the heaviest shadow in the kit, inside a block card with `--elev-1`. It reads as a different weight class from everything around it.

The heading block sits in the same white card as everything else, so a heading looks like a small content card rather than a divider between sections.

### 7. Colour

- **Fill colours with meaning:** navy fill (tool card, countdown, card stack, analogy active level, skill chips), High Sea fill (value card, current value chip, value mini), pastels (question quadrant, analogy boxes). Inside the toolkit this is a deliberate code: skill = white, tool = navy, value = orange. Outside it, navy fill means "hero" (countdown, card stack) and also "selected" (analogy level). Same colour, two meanings.
- Title colour is navy in heading / toolkit / analogy, ink in callout / brainstorm / question drop / quiz.
- `#fff` is written as a literal 38 times in toolkit rules, 34 in analogy, 59 in annotation, and in the shared block card (`app.css:1569`). There is no `--white` / surface token, so this is understandable, but it means the block surface cannot be themed in one place.
- Annotation's literary-element cards use their own palette: `#15161c`, `#1b1c22`, `#33343d`, `#d7d2c8`, `#1b2a4a`, `#c96b4a`, `#9aa4b2`, `#f7b733`, `#a98bff` (27 uses of the dark three alone).

### 8. Empty and unavailable states: five versions

| Look | Where |
|---|---|
| 13px muted, indented | Image, video, embed, collection, anthology, annotation, outcomes |
| 15px muted | Audio, attachment, diagram |
| 16px ink (not muted) | Gallery, three times, one per empty slot |
| 12px muted | Whiteboard |
| 13px muted in its own bordered card | Curriculum lines |

### 9. Typeface

- The kit says **Inter only**. `index.html` also loads **Newsreader** and it is used for the annotation element cards (7 rules), morphology word matrix and word-help word cards. It is a nice choice for "a word as an object", but it is undocumented. Either write it into the kit as the one allowed display face for word-study surfaces, or remove it.
- Three buttons fall back to **Arial** because they do not inherit the font: `.ct-trigger` (classroom tools open / close), and `.graph-stage__expand` (mind map, concept map). They are icon-only, so the leak is invisible today but will show the moment a label is added.
- `.an-levels__btn` has no font size, so it computes to the browser's 13.33px.

### 10. Focus and touch size

- Analogy level buttons use a **marine** focus outline (`toolkit.css:1444`). The kit says focus is always Wave.
- Below 44px tall at phone width: classroom tool chips (27px), toolkit chips (32px), teacher-note toggles (32px), tabs (36px), anthology pills (35px). The analogy level bar explicitly sets 44px, so the rule is known but not applied everywhere.
- No horizontal overflow at 390px in any block checked.

### 11. CSS hygiene by family

| Family | Off-scale font sizes | Raw hex | Off-token radii | Raw shadows |
|---|---|---|---|---|
| Toolkit (`toolkit.css`, `.tk-`) | 21 (`11px` ×14, `12px` ×2, `16px`, `20px`, `0.8em`, `0.85rem`, `1.15rem`) | 39 | 3 | 8 |
| Analogy (`.an-`) | 10 (`11px`, `12px`) | 34 | 5 | 1 |
| Annotation | 2, plus 27 `var()` fallbacks that disagree with the real token (e.g. `var(--text-xs, 0.8125rem)` when `--text-xs` is 0.75rem) | 140+ | 28 (`999px`, `10px`, `4px`, `2px`, …) | 5 |
| Classroom tools | 8 (mostly timer `clamp()`s, which are fine for a big clock) | 0 | 0 | 2 |
| Peer feedback / brainstorm / quiz | 2 | 5 | 1 | 3 |
| Prose, media, structure, practice (`app.css`) | 1 (embed `10px`) | 11 | 2 | 2 |
| Discern, Kaplan, word help | 0 | 0 | 0 | 2 |

Discern and Kaplan are the cleanest stylesheets in the hub. Use them as the model.

## Every block

Columns: **Eyebrow** = small label above the title. **Title** = computed title size. **Body** = computed reading size. **Actions** = button skin. **Shell** = what sits inside the white block card.

| Block | Eyebrow | Title | Body | Actions | Shell | Notes |
|---|---|---|---|---|---|---|
| Rich text | none | none (headings stripped by design) | 16px | Dictionary scan text button 12px | flat | Body off-scale |
| Heading | none | page 21 / **section 17** / **subsection 15** | — | — | own white card | Weaker than block titles |
| Callout | 15px label + icon | 15px / 600 ink | **13px muted** | motion toggle | shore card | Two titles; body too small and pale |
| Quote | — | — | 17px | — | left rule | Matches kit |
| Definition | — | 15px / 600 | 16px | — | bordered card | |
| Code | — | — | 13px mono | — | inset | |
| Divider | — | — | — | `.ct-chip`, `.ct-trigger` (Arial) | line | Carries classroom tools |
| Spacer, Columns, Section | — | — | — | — | — | Layout only |
| HTML, HTML app, Equation | — | — | inherits | — | — | Author content |
| Image, Video, Embed | — | none | 13px empty | — | flat | |
| Gallery | — | none | **16px ink** empty | — | flat | Empty text not muted |
| Audio, Attachment, Diagram | — | none | 15px empty | kit audio player | flat | |
| Chart | — | none | axis labels scale with width (≈20px at 820px) | native `<details>` | flat | No title slot; label size not fixed |
| Mind map, Concept map | — | none | node text | `.hub-icon-btn` (Arial) | cotton panel | |
| Whiteboard | — | none | 12px empty | — | flat | |
| Table | — | none | 15px | — | bordered | |
| Accordion | — | 16px / 600 summary | 15px | native ▶ marker | bordered | Browser marker, not a kit chevron |
| Tabs | — | — | — | underline tabs 15px, 36px | flat | Not `.hub-pills` |
| Timeline | — | — | 13–17px | — | cotton rows | |
| Card stack | big index "01" | 32px | — | `.btn--ghost` | **navy card, elev-4** | Heaviest block |
| Collection | — | — | 13px empty | — | flat | |
| Anthology | — | — | 13px | `.hub-pills` + `.btn--secondary` | pill bar | Only block using the kit view switch |
| Outcomes | 11 / 600 muted ("OUTCOMES" as `h2`) | — | 13px | — | flat | Eyebrow marked up as a heading |
| Curriculum lines | — | — | 13px empty in bordered card | — | own map | Specialised |
| Question set | 11 / 700 muted ("Your response") | number badge | 16–17px | — | flat | |
| Flashcards | — | card face | 13px status | bare `.btn`, centred | panel → card | Three levels; panel not centred |
| Cloze | — | — | 16px | bare `.btn`, centred | panel | Panel not centred |
| Self check | — | — | — | bare `.btn`, full width | panel | |
| Quiz question | 11 / 600 muted | **16px / 600** | 13px | kit `.btn` variants | cotton panel | Prompt smaller than siblings |
| Peer feedback | 11 / 600 muted | **none** | 15–16px | kit `.btn` variants | flat | No prompt title |
| Brainstorm | 11 / 600 muted | 21 / 600 ink | 13px | kit `.btn` variants | flat | |
| Question drop | 11 / 600 muted | 21 / 600 ink | 13px | kit `.btn` variants | cotton panel | |
| Classroom tools | **12 / 600, wider** | — | — | `.ct-chip`, `.ct-btn` (Wave primary) | flat | Own button skin |
| Countdown | 12 / 600 paper | 17 / 700 paper | 13px | — | navy card | |
| Teacher note | — | 15 / 600 + "Only you see this" pill | 15px | — | peach card | |
| Annotation | — | — | serif + private palette | chips | own system | Specialised |
| Skill | 11 / 700 High Sea + icon | 21 / 700 navy | 17 / 16px | navy pills | title box | |
| Tool | same | 21 / 700 white on navy | 17px white | white pills, bare `.btn` | navy box | |
| Value | same | 21 / 700 depth on High Sea | 17px | bare `.btn` | orange box | Value chips **11px body** |
| Thinking move | same | 21 / 700 sentence | 16px | — | flat | |
| Question quadrant | same | 16 / 700 cell names | 13px defs | bare `.btn`, 56px | pastel grid | |
| Concept features | same | — | 13–16px | — | flat | |
| Thinking intentions | same | — | prompt only | — | flat | |
| Thinking reflection | same | callout title 15px | 16px | — | callout inside | Callout nested in a block |
| Analogy types | 11 / 700 **navy, no icon** | 21 / 700 | 16 / 13px | — | list cards | |
| Analogy moves (×7) | 11 / 700 navy | 21 / 700 + icon box + badge | 17 / 16px | navy segmented levels, bare `.btn` | title box with left rule | Marine focus ring |
| Fluid analogy | 11 / 700 navy | 21 / 700 | 16px | same | same | |

## What a shared grammar would look like

This is a proposal, not a spec. Nothing below is built.

| Role | One rule for every block |
|---|---|
| Lesson heading (Heading block) | Page `--text-xl`, section `--text-lg` / 700 navy, subsection `--text-md` / 600 navy. Drawn on the canvas, not inside a white card, so it divides the lesson |
| Block eyebrow | `--text-2xs` / 700 / caps tracking. Colour by family: High Sea ink for thinking blocks (toolkit **and** analogy), muted for everything else. One optional 14px icon |
| Block title | `--text-lg` / 700 / navy for every block that has one. Quiz question and peer feedback prompts move up to it |
| Inner title | `--text-md` / 700 / navy (toolkit steps, quadrant cells, analogy steps, callout title) |
| Reading copy | `--text-md` (17px) / ink. Set once on `.lesson-blocks .block`. Callout body joins it |
| Secondary copy | `--text-sm` / muted: captions, status, help |
| Empty state | One `.block-empty` style: `--text-sm` / muted, no box |
| Actions | Kit `.btn` with a variant, always. Primary is navy. Classroom tools' "go" uses `.btn--primary` |
| Chips that link or filter | One chip: `--text-sm`, 44px hit area on phone |
| View switch | `.hub-pills`, including Tabs block and analogy levels |
| Show / hide | One disclosure with a kit chevron, replacing native `<details>` markers |
| Inner panel | At most one level inside the block card. If used, centred |
| Focus | Wave, everywhere |

### Order to fix, if you want to

1. **Heading block sizes and body copy size.** Two small rules, biggest visible change on every lesson. (`app.css:5347-5358` and a font-size on `.lesson-blocks .block`.)
2. **Callout body** up to reading size and ink colour.
3. **Eyebrows:** pick one size and weight; give the analogy family the toolkit's High Sea eyebrow and icon.
4. **Buttons:** variants on flashcards / cloze / self check / toolkit; classroom tools onto `.btn`.
5. **View switches:** Tabs block and analogy levels onto `.hub-pills`.
6. **Empty states** onto one class.
7. **Annotation palette and Newsreader:** decide whether they are a sanctioned specialised look. If yes, write them into the kit. If no, map them to tokens.
8. **Toolkit / analogy CSS hygiene:** replace `11px` / `12px` / `#fff` literals with tokens. No visual change.

Each step is one commit. Steps 1 to 6 together would fit in a single PR.

## Built, 20 October 2026

Steps 1 to 6 above, then the wider ask: one block anatomy for every block. Step 7 (annotation palette and Newsreader) is still open.

- **Roles:** `apps/teaching/src/styles/block-anatomy.css` holds eyebrow, title, subtitle, body, secondary, switch, disclosure, actions, pager and empty. Every block renderer tags its parts with them; block CSS keeps layout and identity only.
- **Slot order:** eyebrow → title → body → view switch → content → disclosure → actions or pager.
- **Kept on purpose:** toolkit skill / tool / value boxes, griffin eyebrow, quadrant grid, sentence frames; analogy icon title box, level badge, types list, tiers and organisers; card stack tints (the tint is stored author content). Countdown lost its marine fill. The Close Reading bridge is a plain form.
- **Guards:** `apps/teaching/tests/unit/block-text-baseline.test.ts` (every seed lesson block and every block type render the same text as main before the restyle) and `apps/teaching/tests/browser/block-anatomy.spec.ts` (sizes, weights and colours per role; actions last; 44px controls at 390px), on `apps/teaching/block-anatomy.html`.
- **Screenshots:** `2026-10-20-teaching-blocks/before/` and `after/`, one per family at 1100px and 390px.
