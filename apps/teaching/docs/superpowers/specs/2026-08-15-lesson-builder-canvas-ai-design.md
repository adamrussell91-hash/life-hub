# Teaching Hub — Lesson builder canvas, whole-lesson AI, Clementine long-run

**Date:** 2026-08-15  
**Status:** Approved for implementation planning  
**Product name:** Teaching Hub  
**Slice:** Replace the lesson-editor form stack with a three-region builder (palette, page, chat); let every agent mutate the whole lesson; give Professor Clementine Haig a Knowledge Hub–style long-run job  
**Depends on:** Existing block schemas, `LESSON_BLOCK_GROUPS`, nested drop rules (`COLUMN_CHILD_TYPES`, `SECTION_CHILD_TYPES`, `TAB_CHILD_TYPES`), lesson draft save/autosave, AI panel/proposals/SSE, archive kernel, print pipeline (`openPrintLesson`)  
**Supersedes (lesson editor chrome only):** A4 \| AI mode tabs and selected-block gate in `2026-08-11-ai-agent-integration-design.md`. Block types and student render stay.

## Goal

Teachers compose a lesson by dragging block-type cards onto a page that looks like the lesson, and by chatting. Chat can create, edit, reorder, and delete anything in that lesson (title, cover, visibility, every block type, nested layout). Clementine can take minutes, keep full context, and return one Acceptable plan. Manual building never depends on AI being up.

## Locked decisions

| Topic | Choice |
|-------|--------|
| Delivery | One build (not phased shipping). Units in code stay separable. |
| Chrome | Family rail \| lesson page \| agent chat. A4 is not a mode. |
| Width | Left rail and chat each shelve independently. Type cards are a flyout, not a fourth column. |
| Flyout | Must not trap the page. Recedes during drag. Page beside it stays usable. Escape / click-away / same-family toggles it closed. |
| Editing | Page-first. Text-like blocks inline. Heavy blocks: real render + slim inspector on the selected block. |
| Reorder | Drag blocks on the page. No up/down button towers. |
| Print | Small printer control, top-right of the page column. Existing print path. No page-count banner. |
| AI mutation | Proposals only. One plan, one Accept (or Reject / Regenerate). Never silent write. Never publish. |
| Selection | Hint for chat, never a gate. Empty lesson is valid. |
| Wait | Page stays editable. Plan is from a snapshot at send. Stale Accept warns, then replaces (no silent merge). |
| Long-run | Clementine: async job (minutes), full lesson JSON, archive pull, server-side transcript. Not a short Netlify hop. |
| Other agents | Same tools, faster/shorter path. If the turn is too big, they say so and point at Clementine. |
| DnD library | Native HTML5 only. |
| Icons | Adam’s Teaching Hub page-content icons, mapped 1:1 to palette types at implementation (folder supplied then). |
| Look | Cotton glass — existing Teaching Hub materials (`app.css`, Inter, paper, navy accent, agent colours). Brainstorm wireframes are structure only; do not ship grey boxes, stacked letter-options, or “mockup” chrome. |

## Out of scope

- Leave Teaching Hub and return later to a finished job (durable-offline jobs)
- Partial Accept (keep some proposed blocks, dump others)
- Streaming blocks onto the page with no Accept — **won’t do**
- Pure WYSIWYG editors for maps, questions, tables, html apps (inspector stays)
- Homepage / unit / class-homepage editors switching to this canvas
- SortableJS
- Notion / Central Node writes
- Auto-publish from AI — **won’t do**
- Student-view redesign (students already consume these blocks)

## The view

**Look:** Cotton glass already in the app — warm paper canvas, Inter, navy accent, existing buttons, existing AI agent chrome. Do not implement the brainstorm companion’s grey wireframes.

### Top bar

Unchanged in role: lesson title in context bar, Save, Publish, History.

### Left — block families

- Icon rail for existing lesson groups: Basic, Media, Teaching, Learning, Visualisation, Layout.
- Layout omits homepage-only `collection`.
- Extra family: **Compositions** (cards from `GET /api/compositions`). Drop/click inserts; a tiny confirm chooses **copy** vs **linked** (same semantics as today).
- Click a family → flyout of type cards (icon, name, one-line description).
- Click the same family again, Escape, or click-away → flyout closes.
- Entire rail can **shelve** to a thin left-edge tab (“Blocks”). Unshelve restores the rail (cards stay closed until a family is clicked).
- Shelved/open remembered per teacher in `localStorage`.
- First visit: rail **open**, cards **closed**, chat **open** (discoverable). After that, last preference wins.

### Flyout and drop

- Cards overlay the left of the page. They do not add a persistent column.
- **During an active drag**, the flyout recedes (hidden or non-interactive) so every gap on the page is a drop target. The flyout must not sit on top of the drop line.
- Gold insert line: before first block, between blocks, after last; same inside columns, tabs, and sections.
- Drop allowed only if that type is already allowed in that parent (existing child-type lists). Invalid drop: visible hint, no insert.
- **Click a card** (no drag): insert at the last chosen gap, or at the end of the lesson root.
- Drag payload is the insert-menu value (includes embed presets where those exist today).
- Reorder existing blocks with the same gap line and the same validity rules.

### Middle — lesson page

Looks like the lesson, not a stack of admin forms.

- **Cover** is the cover image on the page (click to change; existing library/URL/clear behaviour).
- **Title** is the page heading (click to rename). Same field as `lesson.title`.
- **Text-like (inline):** `rich_text`, `heading`, `callout`, `quote`, `definition`, `code`.
- **Heavy (render + inspector on selection):** `image`, `gallery`, `video`, `embed`, `audio`, `attachment`, `table`, `question_set`, `timeline`, `flashcards`, `cloze`, `self_check`, `chart`, `equation`, `diagram`, `mind_map`, `concept_map`, `html`, `html_app`, `accordion`, `section`, `columns`, `spacer`, `tabs`, `divider`.
- Inspector is **on the selected block**, compact, scrolls inside itself. It is not a second app sidebar (chat owns the right).
- Selected/hover toolbar: visibility (students & teacher / existing options), duplicate, delete, drag handle. No permanent up/down/duplicate/delete column.
- **⋯ page menu:** save as lesson template; other rare actions that are currently fat canvas buttons.
- **Print:** icon button, top-right of the page column, `aria-label="Print"`. Calls `openPrintLesson`. No A4 tab. Command-palette “Open A4 Preview” focuses this control / runs print.

### Right — chat

- Always the agent panel (Ann, Clementine, Hammond, Clare). Last-used agent still default.
- Can **shelve** independently to a thin right-edge strip (agent colour + name). Unshelve restores the thread.
- Long-run **working** state is visible on the unshelved panel and as a pulse on the shelved strip so Accept is not missed.
- No “Working with: block” empty state that blocks the composer.
- If a block is selected, a small optional hint may show; clearing selection does not disable send.
- Capability chips remain optional shortcuts. Freeform chat is the product.
- Keyboard: `[` toggles the left rail, `]` toggles chat (when focus is not in an input).

## Palette data

Keep `LESSON_BLOCK_GROUPS` as the family source. Add a descriptions map (one line per insert-menu type) next to existing `INSERT_MENU_LABEL`. Icon URLs/paths map from type → Adam’s assets under `public/` once the files are in the repo.

## AI tools and apply

Request schema changes:

- `selected_block_id` **optional** (hint only).
- `scope` no longer required as `block | section` gate; default is whole lesson.
- Include `lesson_snapshot_at` (ISO) from the client; server also stores the snapshot it used.

New / extended proposals (Zod-validated before the client can Accept):

| Kind | Effect on Accept |
|------|------------------|
| `replace_lesson` | Set `title` and/or `cover` if present; replace `blocks` with the proposed tree (new ids via existing clone helpers). Cap: 48 root-or-nested blocks counted across the tree. |
| `replace_block` | Unchanged, but target may be any id in the snapshot, not “the selection”. |
| `replace_section` | Unchanged, same id rule. |
| `insert_blocks` | Unchanged; raise max from 12 to 48. Anchor optional when inserting into an empty lesson (append root). |
| `delete_blocks` | Remove one or more ids from the tree. |
| `reorder_blocks` | Parent id + ordered child ids (lesson root uses a sentinel). |
| `review_only` | Unchanged. |

Accept applies to the **draft** and triggers existing autosave. Never publish. Reject discards the proposal. Regenerate re-runs against the **current** draft (new snapshot).

**Stale snapshot:** if the draft changed after `lesson_snapshot_at`, Accept shows a confirm: the plan will **replace** using her proposal (replace_lesson replaces the lesson fields she proposed; smaller kinds apply to current tree and may fail if ids vanished). Cancel leaves the plan pending. No automatic merge.

`applyProposalToBlocks` today only returns `blocks`. Lesson-level apply must also return title/cover patches.

## Clementine long-run

Clementine’s school/voice prompts stay; **remove** “work on the selected block only.”

Long-run path (Clementine, or any turn the server classifies as too large for the fast function):

1. Teacher sends a message. Client keeps the page editable.
2. Server snapshots the draft lesson, pulls Knowledge Hub archive (`archiveKernel` as today), attaches server-side transcript for this `lesson_id` + agent (Blob or equivalent; not a 20-message browser trim). Last 50 turns is enough.
3. Job runs on the existing Knowledge Hub research worker (same secret as `archiveKernel`; new lesson-proposal job). Teaching Hub does not put this on a short Netlify function timeout.
4. Client polls or resumes SSE until `proposal` | `error` | timeout.
5. Chat shows one plan card. Page unchanged until Accept.

Fast path (Ann / Hammond / Clare, small turns): existing `/api/ai/chat` SSE **with the new tools** and optional selection. If the model cannot finish a whole-lesson emit, the reply says so in character — no fake six-block success.

Full lesson JSON goes to Clementine. Fast path may send a compact outline (ids, types, titles/headings) plus the hinted block’s full JSON.

## Failure

| Failure | Result |
|---------|--------|
| Invalid drop | Hint; no insert |
| Inspector content fails schema | Last valid block kept; error on that inspector |
| Job fail / timeout / archive fail | Chat says so; page untouched; retry allowed |
| Tool payload fails Zod | Not Acceptable; error in chat (optional one repair pass as today) |
| Accept target ids missing | Apply fails; draft unchanged; message on the card |
| Anthropic / kernel down | Manual builder and print still work |

## Architecture

```
lesson-editor
  palette     (families, cards, DnD payload)
  canvas      (page, gaps, inline/inspector, shelve left)
  chat        (agents, working pulse, proposal card, shelve right)
       │
       ├─ existing draft save / autosave
       ├─ POST /api/ai/chat          (fast SSE)
       └─ POST /api/ai/jobs + poll   (Clementine / long-run)
              │
              ▼
         validated proposal
              │
         Accept → apply → autosave draft
```

Palette must not import chat. Chat must not write the lesson except through Accept → apply. Canvas owns selection.

## Tests

Unit tests, same style as the repo:

- Palette families = lesson groups; no Collection; compositions family present when the list is non-empty (empty list: family disabled / hidden, not a dead drop).
- Drop at a gap inserts the type; invalid child refused; click-to-insert fallback.
- Reorder by drag; no up/down requirement.
- Shelve left and chat independently; preference round-trips.
- Flyout closes on Escape; during drag the page is the drop target.
- Print control invokes the existing print helper; A4 tab absent from the lesson editor.
- AI request succeeds with no `selected_block_id` and with an empty `blocks` array.
- `replace_lesson` Accept updates title/cover/blocks; Reject leaves draft unchanged.
- Stale-snapshot Accept uses the confirm path; Cancel keeps the pending plan.
- Long-run failure leaves the lesson untouched; working/pulse states are representable.
- Existing block schema and student render tests stay green.

## Acceptance

1. Teacher can build a lesson entirely by hand: family → card → drop/click → edit (inline or inspector), including reorder and nested legal drops.
2. Lesson column remains usable with chat and/or rail shelved; flyout never blocks drop or page controls.
3. Print is a small control and still prints.
4. Teacher can send “build a lesson on X with six block types” to Clementine with no block selected, on an empty or existing lesson, keep editing while she works, and Accept/Reject one plan.
5. Every agent can propose changes to any part of the lesson; nothing is reserved as “not AI-editable.”
6. If AI is down, the canvas still works.
