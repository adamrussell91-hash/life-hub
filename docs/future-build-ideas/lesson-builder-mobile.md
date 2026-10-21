# Lesson builder on a phone

The lesson builder is the desktop three-column layout squeezed into 390px. There is no phone mode in `lesson-editor.ts` or `lesson-canvas/*`, and the only rule under 720px applies when chat is open. This doc proposes a separate phone mode rather than a pile of CSS patches.

**Status:** concept. Nothing here is a build brief until Adam names a slice.

## What a teacher does on a phone

Not compose a 40-block lesson on a canvas. On a phone a teacher:

- checks a lesson before class
- fixes a typo or a line in a block
- adds one activity
- reorders a few blocks
- gets an idea down on the bus

The phone mode should be built for those jobs, one thing at a time.

## What is broken now (21/10/26 screenshot, 390px)

| Symptom | Cause |
|---|---|
| "Blocks" sits in its own left column | `.lesson-builder` keeps the rail column (`auto`, or `2.5rem` shelved) unless chat is open (`styles/app.css`, `.lesson-builder` and the single `max-width: 720px` rule) |
| Blocks flyout would run off the screen | `.lesson-palette` flyout is `position: absolute; left: 100%; width: 17.5rem` with no phone override |
| Block text wraps to three lines | Grip lane (`padding-left: 1.75rem` on `.lesson-page__blocks`), ⋯ padding (`2.75rem` right) and the Alchemy beaker (another `2.75rem` plus spacing, `styles/alchemy-assistant.css`). Grip and delete are hover-only, so they do not work on touch anyway |
| Title cut off ("Assumptions of Cour") | The visible title is a single-line `<input>` overlay (`teacher/entity-page-title.ts`), so it cannot wrap |
| "LESSON" eyebrow overlaps the title | The overlay sits on top of a hidden banner title sized differently (`clamp(text-lg, 3.4vw, text-2xl)` vs `text-xl` plus padding and a dashed border). The two layers are not tied together |
| "Lesson" select and Lines chips in two cramped columns | `.lesson-page__meta` is `display: flex` with no wrap |
| Chat button floats over blocks; no edit actions at the bottom | The FAB is the only phone affordance; the bottom bar is the hub's Dashboard / Chat / Classes / More |

The author pill on the cover was not found in the banner or page code; it needs tracing before the cover is reworked.

## The idea: one thing at a time

1. **Editing bottom bar.** Inside a lesson, the hub bar is replaced by **＋ Block · Arrange · Clare · Preview**, with a back chevron to the hub. The rail column and the chat FAB go. The lesson gets the full width.
2. **Read cleanly, tap to edit.** On the page, blocks show no grip, ⋯ or beaker. Tapping a block opens it full screen with a docked **Done** at the bottom. Edit, Duplicate, Ask Alchemy and Delete live in the sheet header. Long-press opens the same actions without opening the block. This gives back about 6rem of width on every block.
3. **Arrange is its own view.** An outline with one row per block (icon and title) and large drag handles, like reordering a list on iOS. Moving blocks stops competing with editing them.
4. **Add where you are.** A thin "＋" line between blocks as you scroll; tapping it opens a picker sheet: search, then Recent, then the block groups and Compositions. **＋ Block** in the bar inserts after the block in view. There is no slash menu today, and a picker sheet suits a phone keyboard better than one.
5. **Short cover, title underneath.** On phones the cover is a strip of about 6rem. The title sits below it in a wrapping text box. "Change cover" moves into the ⋮ menu.
6. **Details on one line.** "Lesson · 2 lines · 3 outcomes ›" opens a sheet with type, Lines and outcomes.
7. **Build by describing it.** See Slice C below.

## Slices

| Slice | Contents | Rough size | Risk |
|---|---|---|---|
| **Fixes** | Title overlap and wrapping, meta row wrap, drop the rail column under 720px, flyout fits the screen | 1 PR, about 100–200 lines, mostly CSS | Low. The title overlay is shared with other page types, so keep the change to phones |
| **A** | Phone mode in `lesson-editor.ts`, editing bottom bar, tap-to-edit sheet, add-block picker sheet | 2–3 PRs, about 1,000–1,500 lines | Highest. About 60 block types have to edit in the sheet; inline kinds (text, whiteboard, mind map) need a decision. Testing them at 390px is most of the work |
| **B** | Arrange view, short cover with title below, one-line details sheet | 1–2 PRs, about 500–800 lines | Medium. Nested blocks (`section`, `columns`, `tabs`) complicate Arrange; v1 could reorder top-level blocks only |
| **C** | "Describe it": add blocks by describing them | 1 PR, about 400–700 lines once cut down (below) | Medium |

Fixes plus A and B: about 5–7 PRs and 2,000–2,500 lines, plus a lot of checking at 390px. Hardest part: keeping desktop and phone in one codebase without breaking desktop, and getting every block type to edit properly in a sheet.

**Suggested order:** Fixes first, since they are needed whichever direction is chosen. Then a one-to-two-day spike on Slice A with five representative block types (text, thinking intentions, image, quiz question, whiteboard) in the tap-to-edit sheet, to prove the sheet before committing to the full build.

## Slice C, kept small

A free-form "Clare edits your lesson" feature would be large and open-ended. Alchemy already has most of the machinery, but for text edits only:

- **Suggestions:** `AgentProposal` (`alchemy/agent-client.ts`) swaps `oldStr` for `newStr` in one field of one block.
- **Apply and undo:** `withProposal` and `withoutProposal` (`alchemy/apply-proposal.ts`), checked against `BlockSchema`, which the server also uses (generated by `scripts/generate-alchemy-schema.mjs`).
- **Accept / Dismiss / out of date:** `alchemy/review-state.ts`, shown in `ann-review.ts` and `ann-bar.ts`.
- **Background jobs** with progress, scoped to a lesson or a block.

So the only missing piece is adding blocks. To keep Slice C small:

1. **One new suggestion type: "insert these blocks after block X".** No move or delete by request. Arrange (Slice B) moves blocks better, and tapping deletes them better. Language is a poor way to say "the third one up".
2. **The screen says where.** "Describe it" is a third tab in the add-block picker from Slice A. New blocks go wherever "＋" was tapped, so Clare never has to resolve "after the intentions". No new chat surface.
3. **Drafts the teacher accepts.** New blocks appear faded in place with Accept and Dismiss, using the existing review store. Dismiss removes them, so undo comes free.
4. **A short list of block types.** About 10–15 common ones (text, heading, callout, teacher note, thinking intentions, quiz question …) plus saved compositions. Clare picks a composition and fills in its words rather than authoring columns or tabs from scratch.
5. **Validate before showing.** Every new block passes `BlockSchema` on the server; a failing block is dropped with a note, never half-shown.
6. **No voice build.** The phone keyboard's microphone already dictates into the "Describe it" box.

A cheaper first test: a "Describe it" option in the desktop palette, to prove the insert suggestion before any phone work. Later, if wanted: "turn these notes into a lesson outline" (many inserts at once), and move or delete by request if teachers actually ask for it.

## Failure register entries any brief must cite

From [`docs/CURSOR-UI-FAILURES.md`](../CURSOR-UI-FAILURES.md):

- **R1:** re-render on a matchMedia change when the DOM differs (phone mode switch)
- **R2:** no horizontal page scroll (flyout, cover)
- **R4:** bottom-sheet rules, 16px inputs, docked 44px actions (edit sheet, picker, details sheet)
- **R5:** no hiding a control without a phone replacement (grip, ⋯, beaker, rail)
- **R6:** sheets sit above the tab bar
- **R7:** Back closes the sheet
- **L6:** chips stay on one line (Lines chips in the details sheet)
- **L13:** corner controls reserve a gutter on their host
- **S3:** the Alchemy Lab column showed the page through it as a see-through sheet at 390px
- **T2:** no mid-word title breaks (wrapping title)

## Open questions

- Should the editing bar fully replace the hub bar, or slide up above it? Replacing gives more room but changes the hub's navigation inside one page.
- Inline kinds (text, whiteboard, mind map): edit in place on the phone with only the actions moved, or always open the sheet?
- Does Preview mean "as a student sees it" or "as it will project"?
- Should Arrange handle nested blocks in v1?
- Which 10–15 block types go on Clare's list for Slice C?
- Where does the author pill on the cover come from, and does it survive the short cover?

## History

- **2026-10-21:** First draft from a 390px screenshot of the lesson builder: diagnosis, phone mode concept, slice sizes, a cut-down Slice C built on Alchemy suggestions, and the failure register entries to cite.
