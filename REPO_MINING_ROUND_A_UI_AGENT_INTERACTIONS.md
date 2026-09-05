# REPO MINING ROUND A — UI & Agent Interactions

**Scope:** Floating UI · Zag · assistant-ui · Tool UI  
**Date:** 2026-09-05  
**Constraint:** Vanilla DOM + Vite/TS umbrella. Design kit authoritative. No React migration. No wholesale library installs.  
**Code changes this round:** none (audit only; see § Any changes made).

---

## Executive summary

### Strongest opportunities

1. **Chat scroll contract** (mine assistant-ui) — replace soft 80px pin with intentional user-scroll interrupt + jump-to-latest. Biggest daily UX win in Life personality chat.
2. **Thin `@floating-ui/dom` positioning helper** — kill duplicated menu geometry across design-kit, Tasks, Teaching; leave visuals alone.
3. **Focus trap (mine Zag, do not install Zag)** — morphing dialog / command palette / confirm overlays currently Escape-only; Tab escapes.
4. **Structured non-write agent objects** (mine Tool UI) — option-list + citations + plan status as typed SSE siblings of existing confirm-cards.
5. **Confirm-card receipts** — lock applied proposals into past-tense cards instead of disappearing into prose lines.

### Biggest immediate UX wins

- Life chat: scroll interrupt + “jump to latest” + Escape→Stop.
- Umbrella menus: one shared `positionHubFloating` using Floating UI geometry.
- Accessibility: slim focus-trap in morphing dialog + hub command search.

### Strongest cross-hub improvements

- Shared floating positioner (filter menus, card menus, schedule overflow, later chart tips).
- Shared focus-trap utility in design-kit.
- Typed interactive agent segments (Tasks Clare choices, Knowledge citations, Teaching lesson picks, Life confirm receipts).

### What should NOT be adopted

- React stacks: `@floating-ui/react*`, Zag-as-UI-kit, entire `assistant-ui`, entire Tool UI / shadcn registry.
- Chakra UI, Radix-as-chrome, Tailwind glass clones, ChatGPT visual language.
- Generic 30-component agent UI library.
- Replacing morphing popover/dialog, confirm-card, hub-pills, or adaptive-slider.
- Attachments, branch/edit/regenerate, tool timelines, virtualization, CSS `overflow-anchor` as the primary scroll fix.

---

## Current Life Hub baseline

### Architecture

| Layer | Stack |
|-------|--------|
| Design kit | `packages/design-kit` — flat CSS + ESM JS (no React) |
| Teaching / Knowledge / Tasks | symlink `design-kit` → kit; Vite + TypeScript SPA |
| Life | plain JS modules; loads kit CSS/JS directly |
| Chat transport (Life) | SSE / job poll → Netlify Functions → Anthropic tool loop |
| Agent writes | propose → `.confirm-card` → confirm API (locked design-kit contract) |

### Shared interaction primitives (good enough — do not reinvent)

- Morphing popover / morphing dialog
- Hub filter menu (`.hub-menu`)
- Command search (`openHubCommandSearch`; Teaching enhances local palette)
- Mobile More sheet (native `<dialog>`)
- Toast / copy-confirm / timed undo
- Confirm-card styles
- AI bar / agent listbox
- Chat prose CSS
- Adaptive slider, card swipe, hub compose, view-on-map

### Real gaps (from code, not invention)

| Gap | Evidence |
|-----|----------|
| Manual menu geometry duplicated | `hub-filter-menu.js` `positionMenu`; Tasks `card-menu.ts`; Teaching `schedule-overflow.ts` — viewport-only flip, hardcoded 6/12 pads, no `autoUpdate` |
| No shared tooltip kit | Life chart tips: multiple `getBoundingClientRect` helpers with hardcoded −56/−44/−40 offsets; protocol tips are hub-local |
| No focus trap | Morphing dialog listens for Escape only; Tab can leave overlay |
| Chat scroll is soft-pin | `isChatPinned` = within 80px of bottom; any scroll updates stick; confirm cards force scroll to bottom unconditionally |
| Composer Escape does not Stop | `chat-composer.js` handles Enter only; Stop is click-only |
| Message actions always visible | Every user/assistant bubble gets Copy (+ Retry on user); no last/hover gating |
| No assistant regenerate / edit | Product currently: Copy + user Retry only |
| Tasks Clare not streamed | Wait-line rotation + full dump response |
| Tool outcomes mostly prose or confirm | Search → `🔍 Searched…` chip; no citation cards; no choice objects |
| No generic response-segment type | Closest: `takeCompletedChatBlocks` + typed SSE events |
| Zod exists as root **devDependency** only | Not a client schema runtime for agent UI |

### Personality / identity (preserve)

- Agent accents, avatars, status lines, protocol pills, bubble borders
- Confirm-card for durable writes (never silent writes)
- Cotton Glass tokens — not ChatGPT / Chakra / shadcn look

---

## Floating UI findings

### What it does

Positioning library: `computePosition` + middleware (`offset`, `flip`, `shift`, `size`, `hide`, `autoPlacement`, `arrow`, `inline`) + DOM `autoUpdate`. Framework packages exist; **vanilla path is `@floating-ui/dom`**.

### Compatible

- `@floating-ui/dom` — pure ESM, tree-shakeable, ~5–8 kB gzip for a menu kit.
- Fits design-kit absolute/fixed menus without changing chrome.

### Improves

- Clipping ancestors (scroll containers), not only viewport.
- Horizontal shift + flip without ad-hoc Math.min/max.
- Re-anchor on scroll/resize via `autoUpdate`.
- Virtual elements for cursor-follow chart tips later.

### Duplicates / does not replace

- Morphing popover FLIP animation, phone-centre, 72px mobile bottom pad.
- Menu ARIA/keyboard (kit already owns that).
- Visual styling.

### Decision

| Package / idea | Class |
|----------------|-------|
| `@floating-ui/dom` via thin `positionHubFloating` | **B. PROTOTYPE** → promote to A after one kit surface |
| React/Vue Floating UI | **F. REJECT** |
| Replace morphing-popover with Floating UI | **F. REJECT** |
| Chart tip shared helper using virtual elements | **E. DEFER** (after menu helper lands) |

### Cost / risk

- **Cost:** low in Vite hubs; Life is unbundled ESM — needs vendor under kit, CDN ESM, or fold Life into a small bundle for this import. That import strategy is the main risk.
- **Risk:** medium until Life consumption path is chosen; geometry risk itself is low.
- **Hubs:** all (menus); Life charts later.
- **Scope:** umbrella-wide design-kit helper.
- **Design language:** geometry only; keep `.hub-menu` / morph classes.
- **Verify:** Playwright — viewport edge, scroll container, resize, mobile bottom chrome clearance.

---

## Zag findings

### What it does

Framework-agnostic state machines for accessible controls, with React/Vue/Solid/Svelte/Preact **and** `@zag-js/vanilla`. Headless connect/spreadProps model.

### Compatible in theory, wrong fit in practice

Vanilla adapter exists, but each machine pulls a heavy shared graph (`dom-query`, focus-trap package, etc.). One dialog machine is ~14 kB gzip alone — larger than the entire current filter-menu helper.

### Where complexity is real vs overkill

| Machine | Verdict | Why |
|---------|---------|-----|
| dialog | **C. MINE** focus trap / restore | Morphing dialog Escape-only |
| menu | **C. MINE** typeahead | Kit has arrows/Home/End; missing letter typeahead |
| combobox | **C. MINE** listbox highlight | optionPicker / command search incomplete combobox wiring |
| popover / tooltip / tabs / select / editable / toast / clipboard / accordion / splitter / tree / tags / presence | **F. REJECT** | Kit or native already simpler |

### Decision

**Do not install Zag packages.** Mine ~30–80 LOC patterns into design-kit.

### Cost / risk

- Integrating Zag: high bundle + parallel headless kit vs locked morphing surfaces.
- Mining focus-trap: low cost, high a11y value, clear verification (Tab cycles, restore focus).

---

## assistant-ui findings

### What it does

React chat SDK: thread, composer, streaming viewport, message actions, attachments, tool UI hooks, markdown/streamdown, branches, etc.

### Compatible

**Patterns only.** Importing the library requires React. Reject runtime.

### Material improvements (reimplement natively)

| # | Mechanism | Life Hub problem | Class |
|---|-----------|------------------|-------|
| 1 | User-scroll interrupt (`scrollTop`↓ + unchanged `scrollHeight`) + ResizeObserver follow | Soft 80px pin false-unpins / fails to follow content growth | **C. MINE** |
| 2 | Jump-to-latest control when unpinned | No rejoin after scrolling up during stream | **C. MINE** |
| 3 | Turn top-anchor + bottom reserve spacer | Long replies chase bottom; question scrolls away | **B. PROTOTYPE** |
| 4 | Tail-only incomplete-markdown repair | Mid-stream `**` / `` ` `` flicker | **C. MINE** |
| 5 | Escape → Stop (IME-safe) | Stop is mouse-only | **A. INTEGRATE NOW** (tiny) |
| 6 | Action chrome: last / `:focus-within` / hide while running | Copy on every split bubble is noisy | **D. DESIGN REF** |

### Reject aggressively

Full React runtime; attachments; tool/CoT timelines; branch/edit/regenerate; dictation; virtualization; their visual kit; CSS `overflow-anchor` as primary fix; moving composer into scroll footer.

### Cost / risk

- (1)(2)(5)(6): small, agent-chat-specific, Life-first; port patterns to Tasks/Knowledge later.
- (3): larger; prototype on Life only.
- Preserve personality accents — only behaviour changes.

### Verify

Browser chat tests: stream while scrolled up; expand confirm card; Escape stops; jump button; long multi-bubble reply.

---

## Tool UI findings

### What it does

Schema-driven React components that render tool outputs as interactive chat surfaces (option-list, plan, citation, approval-card, charts, media, social posts, …). Zod + registry + assistant-ui wiring.

### Compatible

**Schema + interaction model only.** Library is React + Radix + Tailwind + shadcn registry — fights vanilla + design kit.

### Strategic answer

> Stop prose when the user must **choose**, **confirm a durable write**, or **inspect structured data the model should not restate**. Prose frames; the object owns structure.

Life Hub **already does this for writes** via confirm-cards + SSE (`record_proposal`, `cn_patch_proposal`, `action_proposal`). Missing: **non-write** interactive objects and **receipts**.

### Keep / mine (3–5 primitives, not 30)

| Primitive | Hub value | Class |
|-----------|-----------|-------|
| Option list (decision) | Clare triage; Teaching lesson pick; Knowledge relation; ambiguous Life fields | **B. PROTOTYPE** |
| Citation / link-preview | Replace `🔍 Searched…` chips; Knowledge sources | **B. PROTOTYPE** |
| Plan / step status | Multi-step agent work visibility | **E. DEFER** slightly behind choices |
| Diff inside confirm-card | Enrich CN / os_propose diffs | **C. MINE** into existing card |
| Receipt (past-tense lock) | After Confirm, card stays locked instead of vanishing to prose | **C. MINE** |

### Reject

Tool UI dependency; charts/tables/sliders/media/social in chat (dashboards + kit already own those); Approval Card replacing `.confirm-card`; generic `tool_ui` blob event.

### Agent response segment

- **Yes, narrow:** formalise what already exists — `prose | write_proposal | choice | sources | plan`.
- **No** generic dumping-ground segment type.
- **Defer** a framework until a second non-write interactive type ships; one new SSE event + one renderer is enough.

### Cost / risk

- Extending SSE is medium (server + client + persona prompts).
- Must not weaken confirm-card write contract.
- Zod is available in the monorepo as a **devDependency** — prefer hand-asserted JSON shapes on the wire; do not pull Zod into every hub client.

---

## Cross-repo combinations

| Combo | Verdict |
|-------|---------|
| **Floating UI + Zag** | Use Floating UI for geometry; mine Zag focus/typeahead — **do not** use Zag popper. Strong for menus once both land. |
| **assistant-ui + Tool UI** | Best strategic combo as **pattern quarry**: robust thread behaviour + structured interactive objects. Implement natively on Life SSE + confirm-card spine. |
| **Zag + agent UI** | Only focus-trap / listbox patterns for slash or attachment menus **if** those menus appear. Do not Zag the chat shell. |
| Floating UI alone for menus | Sufficient for geometry if keyboard stays kit-owned. |

---

## Agent chat UX opportunities

Priority for Life (then Tasks Clare parity):

1. Intentional scroll interrupt + follow (`MINE` assistant-ui).
2. Jump-to-latest.
3. Escape → Stop.
4. Tail markdown repair while streaming.
5. Quieter action chrome.
6. Turn top-anchor (prototype).
7. Tasks: real streaming (separate product work; not from these repos directly).
8. Citation cards + choice objects (Tool UI patterns).

Do **not** make personalities visually identical. Shared shell behaviour; per-agent accent/avatar/status/protocol remain.

---

## Structured-agent-output opportunities

| Instead of prose… | Render… | First hub |
|-------------------|---------|-----------|
| “Which of these five tasks?” | Option-list → select → confirm or feed next turn | Tasks |
| “Here are sources…” | Citation cards | Knowledge / Life web search |
| “I’ll do A then B then C” | Plan checklist updating in place | Life / Tasks |
| Applied write summary line only | Receipt on confirm-card | Life (all agents) |
| CN patch prose + weak list | Diff block inside confirm-card | Life Hammond |

Writes remain: propose → `.confirm-card` → apply. Never soft option-list for durable mutations.

---

## Accessibility improvements

| Improvement | Source | Where |
|-------------|--------|-------|
| Focus trap + restore | Zag (mine) | Morphing dialog, command palette, confirm overlays |
| Menu typeahead | Zag (mine) | `hub-filter-menu`, Tasks card-menu |
| Escape → Stop | assistant-ui (mine) | Life composer / document while busy |
| Stronger listbox / `aria-activedescendant` | Zag combobox patterns | Kit command search (Teaching already stronger) |
| Floating geometry near edges | Floating UI | Menus/tooltips — helps sighted + keyboard users who open near edges |

Native `<dialog showModal>` (mobile More) already manages focus — prefer that pattern for true modals when morphing is not required.

---

## Mobile improvements

- Floating UI `shift`/`flip` with mobile bottom pad (72px) as middleware padding — menus above bottom chrome.
- Chat: visual-viewport composer already good; add Escape→Stop and jump-to-latest (thumb-friendly).
- Action chrome: hide Copy until last/focus — reduces clutter on small screens.
- Reject: hover-only affordances without `:focus-within`.

---

## Performance implications

| Adoption | Bundle | Load strategy |
|----------|--------|---------------|
| `@floating-ui/dom` menu kit | ~5–8 kB gzip | Design-kit helper; tree-shake middleware; lazy-ok but tiny enough global |
| Zag packages | tens of kB per machine + shared floor | **Reject** |
| assistant-ui / Tool UI | React tree | **Reject** |
| Native mines (scroll, trap, Escape, option-list) | near-zero | Ship in existing modules; option-list only on chat routes |

Do not make Teaching pay for Life-only chat segment renderers — keep chat structured UI behind chat entry points / dynamic import where non-trivial.

---

## Final scored candidate table

Scores are 0–5 averages across: usefulness, UX impact, functionality, cross-hub, a11y, native compat, impl cost (5=cheap), maintenance (5=low), bundle (5=low), duplication risk (5=distinct), verification clarity, frequency. Higher = better candidate.

| Candidate | Source Repo | Hub(s) | User Problem | Proposed Change | Classification | Score | Cost | Risk | Why |
|-----------|-------------|--------|--------------|-----------------|----------------|-------|------|------|-----|
| Intentional chat scroll + jump-to-latest | assistant-ui | Life → Tasks/Knowledge | Stream unpin/jank; no rejoin | Native pin flags + ResizeObserver + jump btn | **C → A after prototype** | 4.6 | Low | Low | Daily pain; ~40 LOC; no dep |
| Escape → Stop | assistant-ui | Life | Stop requires mouse | Composer/doc Escape → abort | **A** | 4.5 | Very low | Very low | Trivial a11y win |
| `positionHubFloating` via `@floating-ui/dom` | Floating UI | All | Menus clip/duplicate geometry | Kit helper; swap filter + card + schedule menus | **B** | 4.3 | Low–med | Med (Life ESM) | Geometry-only; small gzip |
| Slim focus-trap | Zag (mine) | All | Tab escapes overlays | Kit `trapFocus(container)` for morph dialog + command | **C** | 4.2 | Low | Low | Real a11y gap; no Zag runtime |
| Option-list SSE segment | Tool UI (mine) | Tasks, Teaching, Knowledge, Life | Wall-of-text choices | `choice_proposal` event + kit-styled list | **B** | 4.1 | Med | Med | Highest structured-output leverage |
| Confirm-card receipt | Tool UI (mine) | Life (+ Tasks) | Applied writes vanish to prose | Lock card past-tense after confirm | **C** | 4.0 | Low | Low | Extends existing contract |
| Citation / sources cards | Tool UI (mine) | Knowledge, Life | Weak search chips | Typed `sources` event + cards | **B** | 3.9 | Med | Low | Clear UX; scoped |
| Tail markdown repair | assistant-ui | Life | Stream flicker | Close dangling inline in live remainder only | **C** | 3.8 | Low | Low | Local to renderer |
| Turn top-anchor | assistant-ui | Life | Long answers bury question | Anchor user msg + reserve spacer | **B** | 3.7 | Med | Med | Big UX; careful with multi-bubble |
| Menu typeahead | Zag (mine) | All | Long filter lists | Letter jump in hub-menu | **C** | 3.4 | Low | Low | Nice polish |
| Action chrome gating | assistant-ui | Life | Noisy Copy rows | Last/focus-within CSS | **D** | 3.3 | Very low | Low | Polish only |
| Diff-in-confirm | Tool UI (mine) | Life | Weak CN/action diffs | Render structured diff in card | **C** | 3.3 | Low | Low | Hammond/Vera clarity |
| Plan status object | Tool UI (mine) | Life, Tasks | Opaque multi-step work | Updating plan segment | **E** | 3.1 | Med | Med | After choices |
| Chart tip Floating UI | Floating UI | Life | Hardcoded tip offsets | Virtual element + shared tip | **E** | 2.8 | Low | Low | After menu helper |
| Zag packages | Zag | — | — | Install machines | **F** | 1.2 | High | High | Parallel kit + bundle |
| assistant-ui library | assistant-ui | — | — | React chat SDK | **F** | 0.8 | Very high | Very high | Architecture fight |
| Tool UI library | Tool UI | — | — | React component registry | **F** | 0.8 | Very high | Very high | Design-kit fight |

---

## Recommended implementation order

### Immediate

1. **Escape → Stop** in Life `chat-composer.js` / busy document handler (IME-safe).
2. **Chat scroll interrupt + jump-to-latest** in Life `chat-controller.js` / `render-chat.js`.
3. Document import strategy for Floating UI on Life (vendor ESM under design-kit vs small Life bundle).

### Prototype next

4. **`positionHubFloating`** — prototype on `hub-filter-menu.js` + Tasks `card-menu.ts`; measure gzip; then Teaching schedule-overflow.
5. **Focus-trap** — morphing dialog first; then command palette.
6. **`choice_proposal`** — Tasks Clare one workflow (e.g. triage Now/Later/Trash).
7. **Citation cards** for Life web-search + Knowledge sources.
8. **Turn top-anchor** on Life long replies.

### Later / deferred

9. CN diff enrichment; plan status; chart tip Floating UI.
10. Quieter message action chrome.

### Done in follow-up passes

- Confirm-card receipts; menu typeahead; Life search→sources card; turn top-anchor.
- Server-emitted citation URLs from `web_search_tool_result` → SSE `sources`.
- Tasks Clare `dump_stream` SSE (status + voice deltas + dump_result) + client consumer.

### Reject

- Zag / assistant-ui / Tool UI as dependencies.
- Floating UI React packages.
- Replacing morphing popover/dialog, confirm-card, hub-pills, adaptive-slider.
- Attachments, branches, regenerate/edit, tool timelines, chat charts/tables/media/social, generic segment framework.

---

## Any changes made

**None.**

Judgement: this round’s deliverable is the audit. The two “INTEGRATE NOW” chat behaviours and Floating UI helper are clear, but:

- Chat changes need browser exercise against a live/stream fixture (first-pass correctness).
- Floating UI needs an explicit Life ESM consumption decision before install.

No files modified. No dependency added.

---

## Final recommendation

> If we only take 5–8 things from these four repositories, what should they be?

1. **assistant-ui → intentional scroll interrupt + jump-to-latest** (native).
2. **assistant-ui → Escape → Stop** (native).
3. **Floating UI → `@floating-ui/dom` thin kit positioner** for menus only.
4. **Zag → slim focus-trap** mined into design-kit (no Zag install).
5. **Tool UI → option-list** as typed SSE `choice_proposal` (vanilla + kit styles).
6. **Tool UI → citation/sources cards** for search/knowledge.
7. **Tool UI → confirm-card receipt** past-tense lock.
8. **assistant-ui → turn top-anchor** (prototype on Life after scroll contract).

Honourable mention: tail markdown repair; menu typeahead.

Leave the rest.

---

## Appendix — evidence map (key paths)

| Area | Paths |
|------|-------|
| Kit menus | `packages/design-kit/js/hub-filter-menu.js` |
| Kit morph dialog | `packages/design-kit/js/morphing-dialog.js` |
| Kit morph popover | `packages/design-kit/js/morphing-popover.js` |
| Tasks card menu | `apps/tasks/src/views/card-menu.ts` |
| Life chat | `apps/life/js/app/chat-controller.js`, `chat-composer.js`, `render-chat.js`, `core/chat-blocks.js` |
| Confirm pattern | `packages/design-kit/snippets/confirm-card.html`, `actions.css` |
| Knowledge picker | `apps/knowledge/src/ui/optionPicker.ts` |
| Floating UI vanilla | `/tmp/repo-mining/floating-ui/packages/dom` |
| Zag | `/tmp/repo-mining/zag` |
| assistant-ui | `/tmp/repo-mining/assistant-ui` |
| Tool UI components | `/tmp/repo-mining/tool-ui/apps/www/components/tool-ui/*` |

Clones used for mining live under `/tmp/repo-mining/` (not vendored into the umbrella).
