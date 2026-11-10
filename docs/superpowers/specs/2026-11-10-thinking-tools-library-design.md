# Thinking tools library: snares, new tools and a Browse all page

Date: 10 November 2026
Status: approved in chat (follow-up to Thinking Threads, PR 1431); spec and plan in one file

## Why

Thinking Threads gave the eight tools and eight protocols one map and one front door. An outside catalogue of thinking cards (sorted into Actions, Insights, Frames and Snares) was compared with the map on 10 November. About 15% of it was already covered. What it adds:

- **Snares** (biases and fallacies): almost none exist in the hubs. These are the biggest gain.
- **A few worksheet-style actions** Problem Solver lacks: Impact vs Effort, Stakeholder Map, Assumptions Map, Rose/Thorn/Bud.
- **A few general mental models** Wayfinder lacks: First Principles, Second-Order Thinking, Hanlon's Razor, Circle of Competence, Probabilistic Thinking, Scout Mindset.
- **Its sorting:** four families make a good browse view over everything the map already holds.

The marketing frames (media channels, brand archetypes) are left out.

## Licence and wording (mandatory)

The outside catalogue is CC BY-NC-ND, and this repo is public. **No wording, structure or artwork from it goes in the repo.** Every snare, tool and model is written in our own words from general knowledge of well-known ideas (sunk cost, SWOT and the like belong to no one). Do not open or quote the catalogue's transcription. Examples use invented situations. The library artwork is Adam's own build-kit art (`apps/tasks/public/thinking-tools/*.jpg`).

## 1. Snares in the map

`packages/thinking-map/snares.mjs`, pure data, no AI.

```js
// Snare: { id: 'sn_<name>', title, when, check, signals: string[], counters: string[], tells: RegExp }
//   when:     what it looks like from the inside, one line, second person ("You keep going because of what you've already put in.")
//   check:    the one question to ask yourself, one line
//   signals:  from SIGNALS; at least one
//   counters: 1–3 map option ids that help (e.g. 'protocol:refinery', 'protocol:tribunal', 'dm_record', 'rb_occam'); every one must exist
//   tells:    keyword RegExp (case-insensitive) used on situation, digest and step text
export const SNARES;                                   // frozen, about 40
export function getSnare(id);                          // Snare | null
export function snaresFor({ signals = [], text = '', limit = 6 }); // Snare[] ranked: tells match 3, each signal overlap 1; ties in list order; score 0 dropped
```

About 40 snares, for example: confirmation bias, sunk cost, planning fallacy, survivorship bias, anchoring, availability, base-rate neglect, status quo bias, loss aversion, framing, halo effect, fundamental attribution error, curse of knowledge, Dunning–Kruger, overconfidence, hindsight, gambler's fallacy, regression to the mean, selection bias, cherry-picking, anecdote over data, false cause, hasty generalisation, slippery slope, straw man, ad hominem, appeal to tradition, appeal to authority, false dilemma, middle-ground fallacy, composition/division, McNamara fallacy (only what's measurable counts), cobra effect, law of the instrument, ingroup bias, reactance, illusory truth, neglect of probability, imposter feelings, just-world thinking.

Snares are **not** map options: `allOptions()` and `shortlist()` never return them, so the guide can never offer a snare as a detour. `index.mjs` re-exports `SNARES`, `getSnare`, `snaresFor`.

**Families.** Every option gains `family: 'action' | 'insight' | 'frame' | null` (null only for `kind: 'tool'`). Export `FAMILIES = ['action', 'insight', 'frame', 'snare']`. Defaults by tool, in a new `packages/thinking-map/families.mjs`:

| Tool | Default |
|---|---|
| problem-solver (`ps:` process models), decision-book, get-things-done | action |
| rules-book, change-book, collaboration-book, communication-book | insight |
| question-book chapters | frame |
| protocols | action |

Per-id overrides in the same file where a model is plainly another family (for example Decision Maker’s perspective models such as `dm_role_playing` → frame). Keep overrides few.

**Integrity.** `mapProblems()` also checks: unique snare ids with the `sn_` prefix, `when` and `check` present, at least one valid signal, every counter is a real option, every option has a family unless it is a tool, and every protocol is a counter for at least one snare except Fates and Horizon.

## 2. The guide watches for snares

At the joints `before_commit` and `returned` only:

- `guide.mjs` builds `snaresFor({ signals: signalsFromText(situation + digest + step), text: same, limit: 6 })` and passes it to `checkInPrompt` as `snares`.
- The prompt lists them (`- id | title | when`) under **SNARES TO WATCH** and allows, alongside any verdict, an optional `"caution": {"snareId": "...", "line": "one line naming what in the work looks like this"}`. Instruction: only when something in the work actually shows it; most check-ins have no caution.
- `guide.mjs` keeps the caution only if `snareId` is in the list it sent; it adds `title` and `check` from the data. Response shape: `{ verdict, …, caution?: { snareId, title, line, check } }`.
- No extra model call. Route logging is unchanged; cautions are not recorded in `route`.

**Client.** Where a check-in result is shown (`checkin-card.ts`, and the strip tick on `carry_on`), a caution adds one quiet line: **Watch for: {title}.** {line}, with the `check` question folded under "Ask yourself" and links to its counters (opening the Detour flow for that option, same as the Detour menu). A caution never blocks and is dismissible.

## 3. Four new Problem Solver tools

Toolkit tools, registered everywhere existing tools are (tools index, `PsToolId`, `steps.mjs` book steps, `glyphs.ts` emblem, `canvas.ts` renderer map, coach selection in `netlify/functions/_shared/problem-solver/knowledge/selection.mjs` and `scripted-coach.mjs`, the preview scripts, and every test that lists tools).

| id | Name | Step | Shape |
|---|---|---|---|
| `impact_effort` | Impact vs Effort | decide | quadrant: quick wins, big bets, fill-ins, drop. Quick wins can become tasks. Complete with items in 2+ quadrants |
| `stakeholder_map` | Stakeholder map | define | quadrant: power × interest (manage closely, keep satisfied, keep informed, monitor). Complete with 3+ people placed |
| `assumptions_map` | Assumptions map | analyse | quadrant: important × known (test first, watch, act on, park). "Test first" items can become tasks. Complete with 3+ |
| `rose_thorn_bud` | Rose, Thorn, Bud | improve | three lists: what's working, what isn't, what could grow. Buds can become tasks. Complete with an entry in all three |

The three quadrants share one renderer: generalise `render/eisenhower.ts` into a config-driven quadrant view (labels, axes, colours) and keep `createEisenhowerView` as a thin wrapper so its tests still pass. Rose/Thorn/Bud reuses the after-action-review or SWOT list renderer pattern. Keyboard and labelled controls as the existing renderers do. People in the stakeholder map are roles in examples and tests ("site manager"), never names.

## 4. Six new Wayfinder models

A fifth Wayfinder section, ours not the book's: `{ key: 'models', title: 'Ways of Seeing', route: 'models' }`. Entries built with the shared `listTool` / `pathTool` families like the other `rb_` tools, each with catalogue row, tool definition (when, failureModes, three steps, exercise, pairsWell, chart), and a flat indigo glyph matching the current Rules Book glyph set:

`rb_first_principles`, `rb_second_order`, `rb_hanlon`, `rb_circle_competence`, `rb_probabilistic`, `rb_scout`.

`SECTION_SIGNALS['rules-book'].models` and any needed `ID_SIGNALS` go in `signals.mjs`. Each new model links to at least one option in another tool (for example second-order → `causal_map` resolves to Problem Solver; probabilistic → `dm_record`; scout → `protocol:refinery` via NEW_LINKS with a why).

## 5. Browse all

A new route `#/think-library` in `apps/tasks/src/app/main.ts`, linked from the front door ("Browse all tools", under the situation box) and from the nav item's page.

- **Look:** the approved build-kit direction, scoped to this page: warm ivory `#FAF3E6` canvas, deep ink `#142338` text, accents ultramarine `#133CC4`, vermilion `#DE3822`, marigold `#F4AD14`. Editorial serif for the page title and card titles (use the serif Tasks already loads, or Georgia stack), the usual sans for controls. Dark mode keeps the page readable (ink background, ivory text, same accents).
- **Tabs:** All, Actions, Insights, Frames, Snares (buttons with `aria-pressed`, counts). A search box filters by title and `when`.
- **Family banner:** on a family tab, its artwork (`/tasks/thinking-tools/<family>.jpg`, lazy, empty alt since the heading says it) beside a two-line description in our words. The All tab uses `welcome.jpg`.
- **Cards:** every map option except tool-level ones, plus every snare, plus Problem Solver toolkit tools (from the tools index, ids without a book prefix, family action). Each card: inline SVG cover, family label, title, `when` line, tool name.
- **Cover recipes:** a small vocabulary (circles, arcs, rectangles, arrows, dotted paths, tick marks) in `library-covers.ts`. Tailored: `impact_effort` (quadrant, large tokens, dotted route to the quick-win corner), `rb_second_order` (three linked shapes, last bending), `sn_confirmation` (cobalt aperture with evidence inside and outside). Every other card uses its family mark, varied by a stable hash of its id so the grid isn't uniform.
- **Opening:** a model or tool card opens its tool (`toolRoute`, plus the model where that tool's route accepts one). A Problem Solver toolkit tool opens Problem Solver. A snare card expands in place: when, "Ask yourself" check, and counters as links.
- **Phone (390px):** one column, tabs and search wrap, image and title stay together, no horizontal scroll.

## Out of scope

- Snares in Teaching (a fallacies lens or quiz kind) — later, if wanted.
- Live editable diagram templates beyond the three new quadrant tools.
- Changing how the guide shortlists, or making snares detours.

## Tests (unit, invented situations)

- Map: snare integrity, `snaresFor` ranking, families on every non-tool option, snares absent from `allOptions` and `shortlist`.
- Guide: mocked model returning a valid caution, a caution with an unknown `snareId` (dropped), no caution; cautions only at the two joints.
- Problem Solver: each new tool's complete rule and task slots; the shared quadrant renderer for all four quadrant tools (Eisenhower tests unchanged).
- Wayfinder: the six new tools build and render; catalogue and glyph present for each.
- Library: family filter, search, snare card expands, cover recipe chosen per id.
- Browser walk at desktop and 390px: front door → Browse all → each tab → a snare → a tool card opens its tool; a check-in with a caution.

This touches `packages/` and `apps/tasks`, so `pre-pr-check` runs the full Tasks suite.

## Build (one PR, phases as commits, three chunks)

Branch `claude/thinking-tools-library`. Agents write code and tests, run only their own new and touched tests, and do not commit. The lead commits each phase and runs `pre-pr-check` once at the end.

- **Chunk 1 (Opus): map + guide + Wayfinder.** Owns `packages/thinking-map/**`, `netlify/functions/_shared/thinking-guide/**`, `packages/rules-book/**`, related tests. Commits: "Snares and families in the thinking map", "Guide watches for snares", "Wayfinder: Ways of Seeing".
- **Chunk 2 (Sonnet), in parallel with chunk 1: Problem Solver tools.** Owns `packages/problem-solver/**` (not books.mjs), `apps/tasks/src/views/problem-solver/canvas.ts`, `netlify/functions/_shared/problem-solver/**`, the preview scripts, related tests. Commit: "Problem Solver: Impact vs Effort, Stakeholder map, Assumptions map, Rose Thorn Bud".
- **Chunk 3 (Sonnet), after chunk 1: Tasks UI.** Owns `apps/tasks/src/views/thinking/**` (new `library.ts`, `library-covers.ts`, `library.css`; caution display in `checkin-card.ts` and `thread-strip.ts`; types), the route in `main.ts`, the front-door link, the art in `apps/tasks/public/thinking-tools/`. Commit: "Browse all and snare cautions".
- **Finish (lead):** `pre-pr-check`, browser walk desktop + 390px, open the PR ready with auto-merge.

Size: smaller than the Thinking Threads build (no new store, API or protocol work); the runtime AI cost is unchanged apart from a few more prompt lines at two joints.
