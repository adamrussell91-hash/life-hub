# Alchemy Lab: review inside the lesson

Date: 20 October 2026
Status: approved by Adam 20 Oct; built on `claude/alchemy-in-lesson`
Builds on: `2026-10-20-alchemy-agent-design.md` (PRs 972 and 973, merged)

## Why

Ann's review now works, but she works in a small window. Whole-lesson reviews live in the narrow side column that is shared with chat, and block questions open a modal that covers the lesson. In both, a suggestion is a bare fragment away from the text it changes, so Adam has to flick between the panel and the lesson to judge each one.

Direction A puts the review in the lesson itself, like reviewing tracked changes in a document.

## What Adam sees

### Ann's bar

A slim bar at the top of the lesson canvas, below the context bar. It stays in view as the lesson scrolls.

| State | Bar shows |
|---|---|
| Idle | **Improve with Ann**, plus "Rules: *note*" with a Change link. Same picker as today. |
| Working | One live line (the latest progress step) and a counter, "6 searches · 4 notes read". The counter opens the research trail: every search and every note opened, in order. Notes behind a suggestion link to the note; others show their title (progress lines carry titles, not ids). Adam can keep editing. |
| Done | "4 suggestions" with **Previous**, **Next**, **Accept all** and **Close review**. Ann's summary sits in a line below the bar and expands to its full text. "Ann stopped early" shows here when it applies. |
| Error | Ann's message and **Try again**. |

Reopening a lesson with a finished review shows the Done state, minus suggestions already accepted or dismissed. **Close review** hides the bar's Done state and the cards until the next review; the review stays readable through the trail.

The context bar's **Alchemy Lab** item opens and focuses the bar. The side column keeps only the cross-domain connections search, under its own heading, and no longer holds Ann.

### Suggestions in place

For each pending suggestion:

- The target block's row gets an accent rule down its left edge and a small count badge when it has more than one suggestion.
- A suggestion card sits at the bottom of that block's row, in the lesson flow. It holds:
  - **The change in context.** The sentence (or up to about 220 characters) around the edit, taken from the block's current text, with the old words struck through and the new words highlighted. Markup is shown as text, not rendered.
  - Ann's reason.
  - The quoted passage and the note's title as a link, or "Ann's own idea".
  - **Accept** and **Dismiss**.
- **Previous** and **Next** scroll the next pending card into view, focus it, and briefly pulse its block's accent rule.
- Accepted: the card shrinks to "Applied · Undo" for the undo window, then disappears. Dismissed: the card disappears. Stale (its words are no longer on the page): the card says so in one line, with Dismiss.
- A suggestion on a nested block (inside a section, tabs or columns) shows on its top-level row, naming the nested block ("In tab 2: rich text").

### Asking about one block

The beaker on a block opens an ask box at the bottom of that row, not a modal: a one-line text field ("What should Ann do with this block?"), **Ask Ann** and **Cancel**. While she works, the same live line and counter show in the box. Her suggestions arrive as the same in-place cards. Only one block ask runs at a time; a second beaker press while one runs focuses the running one.

### Phone (below 720px)

The bar stays at the top in a compact form: the live line or "4 suggestions" with Previous and Next; the rest goes behind a **More** button. Cards run full width at the bottom of their rows. All buttons are at least 44px tall.

## How it is built

### Units

| Unit | File | Does |
|---|---|---|
| Review state | `apps/teaching/src/alchemy/review-state.ts` | One store per open lesson: the current job, local decisions (accepted, dismissed, stale), the focused suggestion, and listeners. Bar, cards and block asks all read it; nothing else holds review state. |
| Ann's bar | `apps/teaching/src/alchemy/ann-bar.ts` | Renders the four states and the research trail from the store. Starts reviews and follows jobs (existing `agent-client.ts`). |
| In-place cards | `apps/teaching/src/alchemy/inline-cards.ts` | Attaches a card to each row with a pending suggestion. Re-attaches after every redraw (see below). Accept, dismiss and undo reuse the patch logic in `agent-cards.ts`, moved into a shared `apply-proposal.ts`. |
| Change in context | `apps/teaching/src/alchemy/change-context.ts` | Pure function: field text, `oldStr`, `newStr` → `{before, removed, added, after}` trimmed to the surrounding sentence. Unit tested. |
| Block ask | `apps/teaching/src/alchemy/block-assistant.ts` | Keeps the beaker; swaps the dialog for the inline ask box, writing its job into the same store. |
| Trail | in `ann-bar.ts` | Progress lines that start "Searching:" or "Reading:" become the trail; this needs no server change. |

### Living with redraws

`mount-page.ts` rebuilds every block row on each change (`root.replaceChildren()`). The cards and ask box are therefore not part of the row; they are attached by a `MutationObserver` on the canvas, the same way the beaker buttons are, keyed by block id. Their state lives in the review store, so a redraw never loses a card, a half-typed ask or a pending accept. Pointer and key events inside a card or ask box stop at its edge, so clicking one never selects or opens the block's editor.

### Removed

- `agent-panel.ts`'s Ann section in the side column, and the column's Ann header. The connections search stays.
- The block dialog (`.alchemy-review`) and its CSS.

### Server

No server changes. The job, progress lines, decisions, patches and quote checks are unchanged.

## Failure modes to check (from `docs/CURSOR-UI-FAILURES.md`)

- **V1:** every element toggled with `hidden` that has a `display` rule also gets `[hidden]{display:none}`. Check that the bar's states and the trail hide fully.
- **V2 and V4:** the bar's count, Previous/Next and the cards all read one store. Check that after accepting a suggestion, the count drops and Next skips it.
- **V7:** a redraw must not reset the view. Check that after typing in the lesson, the open trail, the focused card and a half-typed block ask all survive.
- **S3:** the bar, cards and ask box have a solid `var(--paper)` surface. Check that no lesson text shows through at 390px.
- **R2 and R3:** no horizontal scroll at 390px, and Previous/Next/Accept fit on one row.
- **L13:** a card or badge must not sit on the block's first line of text. Check that the badge clears the ⋯ menu and the beaker.

## Testing

- Unit: `change-context.ts` (start, middle and end of field, markup, repeated words), the review store (decisions, stale, focus order), and the cards re-attaching after a simulated redraw.
- Teaching vitest: bar states from a scripted job; accept, undo, dismiss, stale and Accept all; block ask from beaker press to card.
- Local mock walk-through at desktop and 375px, with screenshots: start, working with trail open, done, step through with Previous and Next, accept, undo, block ask. Confirm editing during a review keeps the cards.
- `npm run pre-pr-check`, then one PR with auto-merge on.
