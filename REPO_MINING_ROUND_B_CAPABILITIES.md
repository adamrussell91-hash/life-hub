# REPO MINING ROUND B — Capabilities

**Date:** 2026-09-05  
**Scope:** Repos 5–10 (AI Mock, MiniSearch, Motion, SortableJS, Pragmatic DnD, Tiptap)  
**Constraint:** Local audit + prototypes only. No push / PR / merge. No commit unless separately instructed.  
**Round A note:** `REPO_MINING_ROUND_A_UI_AGENT_INTERACTIONS.md` was **not present** on local or `origin/main`. Round B complements the **live** design-kit interaction stack (`hub-command-search`, morphing dialog/popover, hub-motion) and ECC ACI seams instead of competing with an absent Round A doc.

---

## Executive summary

Life Hub already has more capability in these domains than a greenfield product would. The correct Round B outcome is **not** six new dependencies.

| Repo | Classification | One-line verdict |
|------|----------------|------------------|
| **AI Mock** | **C / E** — mine, defer package | Existing Anthropic DI + mock-api already own the test boundary; aimock is heavier than the gap |
| **MiniSearch** | **B → A** | Strongest integrate candidate: fuzzy/prefix entity search behind Cmd+K |
| **Motion** | **C / F** | Design-kit motion stack already covers hub needs; reject Motion as a runtime dep |
| **SortableJS** | **F** (shared) / **E** (trivial flat lists only) | DOM-owned order + no keyboard a11y; loses to current Tasks board |
| **Pragmatic DnD** | **B / E** | Winner of DnD comparison for Teaching nested blocks; do **not** replace Tasks Kanban |
| **Tiptap** | **B** | Prototype `rich_text` blocks only; keep lesson/page as typed block trees |

**Dependencies actually worth adding soon:** MiniSearch (Cmd+K / entity index). Possibly Tiptap core+StarterKit for Teaching/Tasks `rich_text` after a real-surface prototype. Nothing else from this round as a default install.

---

## Existing Life Hub baseline

### Architecture (live)

- Umbrella apps: Life (vanilla JS), Knowledge / Tasks / Teaching (Vite + TypeScript, vanilla DOM).
- Shared chrome: `packages/design-kit/` (tokens, motion, command search, morphing, feedback/undo).
- Agents: Netlify `chat.mjs` + Anthropic client DI; folded hub agents (Clare, Clementine, Ann) on separate paths.
- Persistence: Teaching/Tasks block JSON; Knowledge Markdown bodies; Life records + Central Node markdown; Research embeddings separate from UX search.

### Search today

| Surface | Mechanism | Gap |
|---------|-----------|-----|
| Cmd/Ctrl+K (Life/Knowledge/Tasks) | `openHubCommandSearch` — **substring** `.includes` | No fuzzy, prefix, ranking, cross-entity corpus |
| Teaching search palette | Client titles + block text scan | Substring; good structure, weak typo tolerance |
| Knowledge archive UX | Manifest substring | Fine for titles; not full-body FTS |
| Knowledge research | `lexicalRetrieve` + vectors + RRF | **Semantic retrieval** — must stay separate |
| Tasks filters / `searchEntities` | In-memory substring | Typos miss |

Navigation/search UX and AI retrieval are already correctly separated. MiniSearch belongs on the former only.

### Motion today

`motion.css` + `hub-motion.js` (~37 KB source with morphing-dialog) — reveal, stagger, count-up, magnet, reduced-motion. Plus morphing dialog/popover, card-swipe, Tasks container-transform, Knowledge graph/timeline customs. **No View Transitions API.** No Framer/Motion dependency.

### Drag-and-drop today

**No SortableJS / Pragmatic / dnd-kit.** Teaching: HTML5 grip DnD + pure `Block[]` transforms (`drop.ts`). Tasks: custom pointer + **keyboard** Kanban (`sprint-board.ts`) with live region and touch thresholds. Timed undo exists in design-kit (`offerTimedUndo`) for user-initiated feedback — not a universal undo stack.

### Editors today

| Hub | Format | Engine |
|-----|--------|--------|
| Teaching / Tasks pages | Typed block tree; `rich_text.content.html` | Custom contenteditable + sanitize allowlist |
| Knowledge | Markdown `body` string | `<textarea>` + custom MD→HTML |
| Specialised Teaching blocks | Structured JSON | Dedicated editors (quiz, chart, html_app, …) |

Fragility hotspot: `createRichTextEditor` (selection wrap / list rebuild). No `execCommand`, but still hand-rolled PM-less editing.

### AI testing today

Strong **Availability / Delivery** coverage (`persona`, `context-delivery`, chat-function DI). Streaming + tool loops covered at Anthropic client and handler seams. Browser tests cover Confirm UX, not intermediate stream/tool theatre. **Behaviour** stage uses deterministic `evaluateConstraintBehaviour` helper — not live-model eval. No CopilotKit/aimock.

ECC final consolidation already absorbed Delivery proof + Behaviour fixtures into Life Hub seams — Round B must not create a second AI runtime or eval framework.

---

## Repo 5 — AI Mock

**Source:** https://github.com/CopilotKit/aimock (`@copilotkit/aimock@1.39.0`, ~7.2 MB unpacked, zero runtime deps)

### What it is

HTTP mock **server** + fixture DSL + record/replay + chaos, emulating OpenAI/Anthropic/Gemini/Bedrock + MCP/A2A/AG-UI/vector/search/speech.

### Capability fit vs Life Hub

| Need | aimock | Life Hub already |
|------|--------|------------------|
| Deterministic LLM replies | Yes | `mockedStream` / DI `streamMessage` |
| Streaming / tool rounds | Yes | `anthropic-client.test.js`, `chat-function.test.js` |
| Chaos / mid-stream disconnect | Yes | Partial hand SSE cases |
| Anthropic Messages SSE | Yes | Client hardcodes `api.anthropic.com`; no `ANTHROPIC_BASE_URL` |
| Hub app SSE for Playwright | No (wrong layer) | `scripts/mock-api.mjs` |
| ACI Behaviour | Indirect | `evaluateConstraintBehaviour` |

### Critical question

> Does AI Mock provide a materially better deterministic test boundary than Life Hub already has?

**No.** The valuable Life Hub boundary is **semantic** (`streamMessage` events → chat handler → UI), not Anthropic HTTP. aimock’s strength (provider-wire fidelity, multi-protocol chaos, record/replay) does not fix the real gap: **named Behaviour scenarios** and thicker multi-turn theatre on the **existing** DI + mock-api.

### Classification: **C (mine) / E (defer package)**

**Do not install.** Mine:

1. Named multi-turn scenario files (context + stream events + behaviour asserts + negative control).
2. Chaos patterns as extra SSE frames in `anthropic-client` tests (truncate / disconnect).
3. Optional later: `baseUrl` on `createAnthropicClient` **only if** wire-level record/replay becomes a real need.

**Prototype run:** Scenario shape exercised against `evaluateConstraintBehaviour` — good reply passes, “overhead press session” fails with constraint present, negative control allows unconstrained reply (`/opt/cursor/artifacts/aimock-mined-scenario-shape.mjs`).

### Scores (0–5)

| Dimension | Score | Note |
|-----------|------:|------|
| User value | 0 | Test-only |
| Functional improvement | 2 | Indirect via better tests |
| UX improvement | 1 | Browser stream theatre only if scripts thicken |
| Cross-hub usefulness | 3 | Shared scenario format possible |
| Architecture compatibility | 2 | Base URL mismatch; package overweight |
| Native/non-React fit | 4 | Node HTTP server fine |
| Accessibility | n/a | |
| Mobile quality | n/a | |
| Performance | 3 | Dev/test only |
| Implementation cost (5=cheap) | 2 | Integration tax high |
| Maintenance cost (5=low) | 2 | Large surface |
| Testability | 5 | That’s its job |
| Data-integrity risk (5=low) | 5 | Test-only |
| Duplication risk (5=distinct) | 1 | Duplicates DI/mock-api |

**Overall:** Mine patterns; reject dependency.

---

## Repo 6 — MiniSearch

**Source:** https://github.com/lucaong/minisearch (`minisearch@7.2.0`, ~6 KB gzip useful path, zero deps)

### Why it fits

Cmd+K is already a shared primitive but only does substring match. Entity corpora (lessons, tasks, notes, agents, actions) will keep growing. MiniSearch adds prefix, fuzzy, BM25 ranking, field boosts, autosuggest, JSON serialize, incremental `replace` — without touching Knowledge’s hybrid/semantic research path.

### Prototype results (479 Life Hub–shaped docs)

| Query | MiniSearch | Current substring |
|-------|------------|-------------------|
| `cognativ` / `cognative load` | Hits Cognitive Load lesson + note | **Miss** |
| `chadwik` | Hits Chadwick | **Miss** |
| `working mem` | Working Memory + Memory unit | Partial |
| `photosyn` | Photosynthesis lessons | Match |
| Index 479 docs | ~9 ms | — |
| Serialized index | ~116 KB | — |
| Queries | &lt;3 ms | — |

**Config lesson:** default OR+fuzzy can soft-match noise (`central node` → “Metacognition” notes). Use `combineWith: 'AND'` for multi-term Cmd+K queries — verified: AND returns only Central Node entities.

### Classification: **B (prototype on real Cmd+K) → A (integrate)**

Smallest integration:

1. Optional MiniSearch behind `openHubCommandSearch` / Teaching `enhanceSearchPalette` when groups are large or `searchEngine: 'minisearch'` is opted in.
2. Index fields: `label`, `hint`, `tags`; store `type`, `hub`, destination.
3. Do **not** replace `lexicalRetrieve` / embeddings / RRF.
4. Privacy: client-side index of already-loaded operator data only; no new server corpus.

### Scores

| Dimension | Score |
|-----------|------:|
| User value | 5 |
| Functional improvement | 5 |
| UX improvement | 5 |
| Cross-hub usefulness | 5 |
| Architecture compatibility | 5 |
| Native/non-React fit | 5 |
| Accessibility | 4 (palette already keyboarded) |
| Mobile quality | 4 |
| Performance | 5 |
| Implementation cost | 4 |
| Maintenance cost | 5 |
| Testability | 5 |
| Data-integrity risk | 5 |
| Duplication risk | 4 (orthogonal to semantic search) |

**Overall:** Highest-confidence integrate from Round B.

---

## Repo 7 — Motion

**Source:** https://github.com/motiondivision/motion (`motion@13.2.0`; vanilla `animate` ~22 KB gzip; React path larger)

### Audit vs design-kit

Life Hub already ships intentional, reduced-motion-aware motion. Morphing dialog/popover already do FLIP/spring jobs Motion would sell. Adding Motion duplicates ownership and invites “startup SaaS” animation drift against design-kit rules.

Highest-value **gaps** are product, not library:

- Cmd+K open/close still abrupt.
- Full remounts (“Loading board…”) skip polish.
- No View Transitions for hub section changes.
- Agent stream arrival / tool-chip expansion could use subtler presence cues — achievable with CSS + existing kit.

### Classification: **C (mine) / F (reject dependency)**

Mine: `animateView` pairing ideas, spring curve references, reduced-motion config shape. Implement any needed primitives **inside** `packages/design-kit` (CSS / small JS), not via `motion`.

### Scores

| Dimension | Score |
|-----------|------:|
| User value | 2 |
| Functional improvement | 1 |
| UX improvement | 3 |
| Cross-hub usefulness | 3 |
| Architecture compatibility | 2 (duplicates kit) |
| Native/non-React fit | 4 (vanilla exists) |
| Accessibility | 4 (has reduced-motion API) |
| Mobile quality | 3 |
| Performance | 3 |
| Implementation cost | 3 |
| Maintenance cost | 2 |
| Testability | 3 |
| Data-integrity risk | 5 |
| Duplication risk | 1 |

**Overall:** Reject as dependency; mine selectively into design-kit.

---

## Repo 8 — SortableJS

**Source:** https://github.com/SortableJS/Sortable (`sortablejs@1.15.7`, ~15 KB gzip min)

### Fit

Easy flat-list reordering with animation, handles, auto-scroll, multi-list `group`. **No keyboard/ARIA implementation in source.** **DOM owns order** during drag — conflicts with Teaching’s immutable `Block[]` transforms and Tasks’ `onCardMoved` persistence model.

Tasks `initBoard` already provides pointer + keyboard + live region + touch thresholds — Sortable would be a **regression** on a11y.

### Classification: **F** as shared hub standard; **E** only for a future trivial flat list with no keyboard requirement (unlikely in this product).

---

## Repo 9 — Pragmatic Drag and Drop

**Source:** https://github.com/atlassian/pragmatic-drag-and-drop (`@atlaskit/pragmatic-drag-and-drop@3.1.0`, element adapter ~4 KB gzip)

### Fit

Headless, framework-agnostic, **app owns state**. Hitbox packages (`closest-edge`, `list-item`, `tree-item`) match Teaching nested parents (`root` / `section` / `column` / `tab` in `drop.ts`). Auto-scroll optional. Keyboard **not** built-in for vanilla — but Teaching currently relies on mouse/HTML5 grips; Tasks already has custom keyboard and should keep it.

### Classification: **B / E**

Prototype **only if** Teaching nested HTML5 DnD shows real pain (touch hit-testing, drop indicators, nested edge cases). Wire events → existing `reorderSiblings` / insert helpers. Do **not** replace Tasks Kanban. Skip React drop-indicator / ADS a11y packages.

---

## SortableJS vs Pragmatic DnD verdict

| Criterion | SortableJS | Pragmatic DnD | Life Hub winner |
|-----------|------------|---------------|-----------------|
| Vanilla | Yes | Yes | Tie |
| Bundle | ~15 KB gz | ~4 KB + hitbox | Pragmatic |
| Touch | Good | Native + helpers | Slight Sortable ease |
| Keyboard a11y | **Missing** | Bring-your-own | **Current Tasks board** |
| Nested trees | Groups (awkward) | Hitbox instructions | **Pragmatic** |
| State ownership | DOM | App | **Pragmatic** (matches `drop.ts`) |
| Persistence integration | Read DOM back | Emit → pure transforms | **Pragmatic** |
| Complexity | Low API, wrong model | More glue, right model | Context-dependent |

**Winner: Pragmatic DnD** for any *new* shared/Teaching nested DnD work.  
**Winner for Tasks Kanban: keep custom `initBoard`.**  
**SortableJS: reject as hub standard.**

Drag correctness reminder (product rule): visual move ≠ done. Verify `{sets, resets}` + persisted status/order + derived counts + reload. Prefer existing `offerTimedUndo` for destructive/ambiguous moves — not a universal undo framework.

---

## Repo 10 — Tiptap

**Source:** https://github.com/ueberdosis/tiptap (`@tiptap/core` + StarterKit; usable floor **~150+ KB gzip** with ProseMirror)

### Editor boundary (critical)

Teaching lessons are **typed block trees**, not one rich document. Specialised blocks (question_set, chart, html_app, timeline, columns, …) must remain Life Hub components.

**Recommended architecture:**

```text
Lesson / page
  └── blocks[]
        ├── rich_text  → Tiptap engine (HTML persist)
        ├── heading, callout, …
        └── specialised Teaching blocks (unchanged)
```

Do **not** migrate the whole lesson into one ProseMirror schema.

### Data integrity

- Today: `rich_text.content.html` + `sanitizeRichTextHtml` allowlist (`p br strong em u ul ol li a blockquote`).
- Prototype: `@tiptap/html` `generateJSON` → `generateHTML` round-trip preserved bold/lists/blockquote; append edit survived (`roundTripOk: true`).
- Note: Tiptap emits `<li><p>…</p></li>`; sanitize **allows** nested `p`, so student render stays compatible.
- Persist **HTML** (lowest migration cost). Optional dual JSON later — do not force proprietary-only storage.
- Knowledge: keep Markdown textarea for now; Tiptap Markdown path is a later Knowledge-only prototype if wiki-link UX demands it.
- AI insert later: structured HTML/JSON into a `rich_text` block or new block type — block tree already supports that seam.

### Classification: **B (prototype)**

Prototype on one Teaching lesson `rich_text` block: load → edit → save → reload → student render. Share with Tasks `page_blocks` only after Teaching proves round-trip. Bundle cost is the main tax — justify with real editing pain (lists, paste, history, links).

### Scores

| Dimension | Score |
|-----------|------:|
| User value | 4 (Teaching/Tasks authors) |
| Functional improvement | 5 |
| UX improvement | 4 |
| Cross-hub usefulness | 3 (Teaching/Tasks; Knowledge later) |
| Architecture compatibility | 4 if rich_text-only; **1 if whole-lesson PM** |
| Native/non-React fit | 5 (`@tiptap/core`) |
| Accessibility | 3 |
| Mobile quality | 3 |
| Performance | 2 (bundle) |
| Implementation cost | 2 |
| Maintenance cost | 3 |
| Testability | 4 |
| Data-integrity risk | 3 (HTML round-trip needed) |
| Duplication risk | 4 (replaces fragile custom editor) |

**Overall:** Prototype rich_text-only; veto whole-lesson PM.

---

## Cross-repo combinations

| Combination | Verdict |
|-------------|---------|
| **AI Mock patterns + ACI** | **Yes** — scenario files on existing DI + `evaluateConstraintBehaviour`; no aimock package |
| **MiniSearch + Cmd+K** | **Yes** — primary integrate path; Round A–style combobox/palette stays UI |
| **Motion + DnD** | Prefer DnD library animation / CSS; do not stack Motion |
| **Tiptap + Floating UI** | Tiptap bubble menus need positioning; use whatever Round A / kit settles — don’t duplicate |
| **Tiptap + Tool UI** | Future: AI proposes HTML → confirm → insert `rich_text`; don’t build now |
| **MiniSearch + Tiptap** | Index `label`/extracted plain text from HTML/Markdown; keep searchable fields denormalised |

---

## Umbrella opportunities

1. MiniSearch-backed global entity/command search (Cmd+K).
2. Shared AI behaviour scenario fixtures (mined, not aimock).
3. Design-kit motion gaps (palette presence, view transitions) without Motion dep.

## Life Hub opportunities

- Cmd+K entity reach (agents, Central Node, fitness/nutrition destinations).
- Subtle chat status/stream presence via kit CSS — not Motion.
- Search events helper (`searchEvents`) still underused vs palette — feed into MiniSearch groups if desired.

## Knowledge Hub opportunities

- MiniSearch for archive title/tag/excerpt UX (optional); **keep** hybridRetrieve for research.
- Defer Tiptap; Markdown textarea remains the right format for interoperability.
- Graph already has its own interaction language.

## Tasks Hub opportunities

- Keep custom Kanban; add `offerTimedUndo` on status/date drag commits where missing.
- MiniSearch for task/project titles in Cmd+K / hub search.
- `page_blocks` inherit Teaching `rich_text` Tiptap only after Teaching prototype.

## Teaching Hub opportunities

- **Tiptap** for `rich_text` engine.
- Pragmatic DnD only if nested drop indicators/touch demand it — state stays in `drop.ts`.
- MiniSearch for lesson/unit palette ranking + typos.

## Agent infrastructure opportunities

- Thicken mock-api / DI scenarios (tool theatre, stream interrupt).
- Behaviour scenarios with negative controls (already helper-ready).
- Reject aimock as production or CI dependency.

---

## Architecture implications

- One search UX engine (MiniSearch) ≠ one retrieval engine (embeddings).
- One DnD philosophy: **app-owned state**; Tasks keyboard board stays bespoke.
- One editor philosophy: **block tree owns structure**; Tiptap is an engine inside `rich_text`.
- One AI test philosophy: **semantic DI + ACI helpers**; no second mock runtime.

## Data-format implications

| Domain | Keep | Change only if |
|--------|------|----------------|
| Teaching `rich_text` HTML | Yes | Tiptap still emits sanitizable HTML |
| Teaching block tree JSON | Yes | Never collapse to single PM doc |
| Knowledge Markdown | Yes | Separate future decision |
| Cmd+K groups | In-memory | Optional serialized MiniSearch cache |

## Mobile/accessibility implications

- SortableJS fails Tasks keyboard contract — rejected.
- Pragmatic requires custom keyboard if used on boards that need it.
- MiniSearch improves mobile typo recovery on small keyboards.
- Motion library not required for `prefers-reduced-motion` (kit already handles).

## Performance/bundle implications

| Candidate | Approx cost | Notes |
|-----------|-------------|-------|
| MiniSearch | ~6 KB gz | Easy win |
| Pragmatic core | ~4–10 KB gz | Only if Teaching needs it |
| Tiptap+PM | ~150+ KB gz | Gate on proven editing pain |
| Motion animate | ~22 KB gz | Duplicates kit — skip |
| aimock | ~7 MB unpacked (dev) | Skip |

---

## Final candidate table

| Candidate | Repo | Hub(s) | Current Problem | Capability Added | Classification | Value | Cost | Risk | Verdict |
|-----------|------|--------|-----------------|------------------|----------------|------:|-----:|-----:|---------|
| Cmd+K MiniSearch | MiniSearch | Umbrella | Substring-only palette | Fuzzy/prefix/rank entity search | **B→A** | 5 | 2 | Low | **Integrate after thin palette prototype** |
| rich_text Tiptap | Tiptap | Teaching/Tasks | Fragile contenteditable | Mature editing engine, keep HTML | **B** | 4 | 4 | Med | **Prototype one block type** |
| AI scenario fixtures | AI Mock (mine) | Agents | Behaviour stage thin | Named multi-turn + behaviour + negative control | **C** | 4 | 2 | Low | **Mine into tests/mock-api** |
| Teaching Pragmatic DnD | Pragmatic | Teaching | Nested HTML5 limits | Headless nested hitbox → `drop.ts` | **B/E** | 3 | 3 | Med | **Only if DnD pain proven** |
| Kit view-transition / palette motion | Motion (mine) | Umbrella | Abrupt remounts/palette | Spatial state clarity | **C** | 3 | 2 | Low | **Mine into design-kit** |
| Drag timed undo | (kit already) | Tasks/Teaching | Drag commits lack undo | `offerTimedUndo` on persist | **A (existing)** | 3 | 1 | Low | **Use kit; no new lib** |
| SortableJS hub DnD | SortableJS | Tasks/Teaching | — | Easy lists | **F** | 2 | 2 | High a11y | **Reject** |
| Motion dependency | Motion | All | — | Springs/layout | **F** | 2 | 3 | Dup | **Reject** |
| aimock package | AI Mock | Agents | — | HTTP multi-provider mock | **E/F** | 2 | 4 | Dup | **Defer/reject install** |
| Whole-lesson PM | Tiptap | Teaching | — | Single doc schema | **F** | 2 | 5 | High | **Reject** |
| MiniSearch for research | MiniSearch | Knowledge | — | Replace hybridRetrieve | **F** | 1 | 3 | High | **Reject** |

---

## Dependencies actually worth adding

1. **`minisearch`** — Cmd+K / entity / Teaching title search.
2. **`@tiptap/core` + `@tiptap/starter-kit` (+ `@tiptap/pm`)** — only after successful `rich_text` prototype; HTML persist.

Optional later: `@atlaskit/pragmatic-drag-and-drop` (+ hitbox) for Teaching only.

## Mechanisms worth mining without dependency

1. aimock **scenario / chaos / multi-turn** patterns → DI fixtures + mock-api scripts.
2. Motion **view-transition / spring** ideas → design-kit CSS/JS.
3. Pragmatic **app-owned state + edge hitbox** thinking → improve Teaching drop indicators without installing (if pain is small).
4. ACI Behaviour must/must-not + negative controls (already in-repo) — extend coverage, don’t replace.

## Prototypes worth building

1. MiniSearch behind real `openHubCommandSearch` with live nav + a sample Teaching/Tasks corpus (`combineWith: 'AND'`).
2. One Teaching `rich_text` block on Tiptap with save/reload/student render.
3. Named Chadwick/Clare behaviour scenario files driving `mockedStream` + `evaluateConstraintBehaviour`.
4. (Conditional) Pragmatic drop indicator on nested Teaching canvas.

## Rejected ideas

- Installing aimock / Motion / SortableJS as default dependencies.
- Replacing Tasks Kanban with SortableJS or Pragmatic.
- Whole-lesson ProseMirror document.
- MiniSearch as semantic research replacement.
- Universal undo framework.
- Stacking Motion on top of DnD animation.

## Recommended implementation sequence

1. **MiniSearch Cmd+K** (highest value / lowest risk).
2. **AI behaviour scenario fixtures** on existing DI (reliability).
3. **Tiptap rich_text prototype** in Teaching (authoring depth).
4. **Timed undo** on important drag commits via kit.
5. **Design-kit motion gaps** (palette / view transitions) without Motion package.
6. **Pragmatic Teaching DnD** only if nested DnD bugs/UX demand it.

## Changes made during audit

### Audit phase
- Local prototypes under `/tmp/round-b-repos`, `/tmp/round-b-proto`, `/opt/cursor/artifacts/`.
- This report file: `REPO_MINING_ROUND_B_CAPABILITIES.md`.

### Implementation follow-up (post “go ahead”)
- Added `minisearch` dependency and vendored ESM at `packages/design-kit/js/vendor/minisearch.js` for unbundled Life.
- New shared helper `packages/design-kit/js/hub-entity-search.js` (prefix/fuzzy/AND).
- Wired MiniSearch into `openHubCommandSearch` filtering.
- Teaching title search uses the same fuzzy helper.
- Cached new modules in Life service worker.
- Mined AI behaviour scenario fixture + unit tests (no aimock package).
- Unit tests: `tests/unit/hub-entity-search.test.js`, `tests/unit/agent-behaviour-scenarios.test.js`.
- Teaching `rich_text` now uses Tiptap (`@tiptap/core` + StarterKit) while persisting sanitised HTML; specialised blocks stay outside ProseMirror.
- Added `apps/teaching/tests/unit/rich-text-tiptap.test.ts` for load→edit→HTML round-trip.
- Tasks board drag already offers timed undo via `offerTimedUndo` on status moves.

## Verification results

| Check | Result |
|-------|--------|
| MiniSearch 479-doc index + typo queries | Pass — fuzzy/prefix beat substring; AND fixes multi-term noise |
| MiniSearch incremental `replace` | Pass |
| Tiptap HTML generateJSON/HTML round-trip | Pass (`roundTripOk: true`) |
| Mined AI scenario + `evaluateConstraintBehaviour` | Pass — constraint present/absent controls behave correctly |
| aimock vs Anthropic client base URL | Confirmed mismatch — would need client change to use HTTP mock |
| Tasks board keyboard vs Sortable | Sortable lacks keyboard — reject for Kanban |
| Round A report on main | **Absent** — complemented live kit + ECC ACI instead |

Artifact evidence:

- `/opt/cursor/artifacts/minisearch-proto-results.json`
- `/opt/cursor/artifacts/round-b-tiptap-minisearch-and.json`
- `/opt/cursor/artifacts/aimock-mined-scenario-shape.mjs`

---

## If Life Hub can take ONLY SIX improvements from repos 5–10

1. **MiniSearch behind Cmd+K / entity search** — repo MiniSearch — umbrella find-anything — beats substring and doesn’t touch semantic retrieval — **integrate** (after thin real-surface prototype).
2. **Named AI behaviour + multi-turn fixtures (mined from aimock)** — repo AI Mock — agents ACI Behaviour stage — beats installing aimock because DI already exists — **mine**.
3. **Tiptap engine for `rich_text` blocks only** — repo Tiptap — Teaching/Tasks authoring — beats rewriting contenteditable and beats whole-lesson PM — **prototype → integrate**.
4. **Pragmatic DnD for Teaching nested blocks (conditional)** — repo Pragmatic — lesson canvas reorder correctness + indicators — beats Sortable’s DOM-owned model — **prototype if pain**.
5. **Design-kit spatial transitions mined from Motion** — repo Motion — palette/remount clarity — beats adding Motion dependency — **mine**.
6. **Drag persistence + timed undo discipline** — inspired by DnD correctness section; uses existing `offerTimedUndo` — Tasks/Teaching — beats universal undo framework — **integrate pattern (no new dep)**.

### Biggest functional improvement

**MiniSearch-powered umbrella Cmd+K / entity search** — instantly makes every hub’s information reachable with typos and partial tokens, without a backend project.

### Biggest UX improvement

**Same MiniSearch Cmd+K** (daily operator feel). Runner-up: Tiptap `rich_text` editing once authoring pain is felt.

### Biggest reliability improvement

**Mined deterministic AI behaviour/multi-turn scenarios on the existing Anthropic DI + ACI helpers** — closes the Behaviour stage without nondeterministic CI or aimock weight.
