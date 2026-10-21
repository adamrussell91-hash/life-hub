# Brainstorm block — design

Date: 18 October 2026. Status: approved in brainstorm, awaiting spec review.

## Goal

A new Teaching Hub lesson block, `brainstorm`, for quickly gathering student thoughts on one question and showing them on a shared board. Students join on their published lesson with a code, send short answers, and each answer appears on the teacher's projected board as the student's anonymous colour-and-shape symbol, slowly orbiting the question. The teacher reveals the answers when ready, as a grid, a word cloud or AI-suggested groups, then sends them back into orbit.

Safety is set per block so juniors and seniors can run different settings from the same block type.

## Approach

A new block type with its own server module and block file. It reuses peer feedback's existing parts rather than becoming a third peer feedback mode, because the brainstorm flow (open, collect, reveal) does not fit peer feedback's write, swap, review, results phases, and `peer-feedback.ts` is already large.

Reused as is:

- Symbol hand-out per device token (`netlify/functions/_shared/peer-feedback.mjs`, claims and tokens keys): 6 colours × 6 shapes, 36 students per round.
- Symbol drawing and DOM helpers (`apps/teaching/src/blocks/peer-feedback-ui.ts`: `token`, `identityName`, `el`, `button`, `field`, `readJSON`, `writeJSON`).
- Abuse filter `flagText` (`netlify/functions/_shared/peer-feedback-filter.mjs`).
- Operator-gated teacher route plus public student route, polling every 5 seconds, drafts kept on the device.

Where code is shared, move it to a neutral shared module rather than importing peer feedback internals from the new block (for example, symbol hand-out into `_shared/class-symbols.mjs`, used by both).

## Block setup (editor)

| Setting | Options | Default |
|---|---|---|
| Question | text | empty, required to publish |
| Safety mode | Instant unless flagged · Teacher approves each · Hidden until reveal | Teacher approves each |
| Answers per student | 1 · 3 · 5 · Unlimited | 3 |
| Default reveal layout | Grid · Word cloud · Groups | Grid |
| Answer length | max characters | 140 |

Safety modes:

- **Instant unless flagged.** A clean answer goes straight onto the board. A flagged answer waits in the teacher's queue.
- **Teacher approves each.** Every answer waits in the queue until approved.
- **Hidden until reveal.** Answers collect without text showing anywhere. Shapes still orbit, so the teacher can see how many answers there are. On reveal, every unflagged answer appears together, and answering closes, so nobody can copy what they've just seen. Flagged answers stay in the queue.

In every mode, the teacher can remove any answer at any time. A removed answer leaves the board and every student screen.

## Teacher view (block on the lesson page)

Start round → join code shown large. Controls while the round runs:

- **Reveal answers / Back to shapes.** In orbit view, the shapes turn slowly around the question text. Reveal moves each shape into place as an answer card in the current layout. Back to shapes returns them to orbit.
- **Layout** (when revealed): Grid · Word cloud · Groups, switchable live.
- **Symbols on cards:** on or off. Off shows answers with no hint of who wrote them.
- **Students see:** Their answers only · All answers. A live toggle.
- **Show student symbols:** puts each student's own symbol in the corner of their device, so the teacher can match a symbol on the board to a student. Same behaviour as peer feedback.
- **Queue:** held and flagged answers, each with Approve and Remove. A count badge shows when the queue isn't empty.
- **Remove** on every card in every view.
- **End round.** The board stays viewable until a new round starts.

### Orbit

- Each answer is one shape, so a student with three answers has three of their shapes in orbit.
- Rings turn opposite ways at slow, slightly varied speeds. Positions are eased toward their targets every animation frame (`requestAnimationFrame`), never stepped, matching the approved mockup.
- New answers rise in from the bottom edge and ease into a ring.
- Density: two rings up to about 30 shapes, a third ring above that. Shapes shrink a little after about 60 so the orbit stays legible.
- `prefers-reduced-motion`: shapes sit still on their rings, and move between orbit and reveal without the slow spin.

### Layouts

- **Grid:** answer cards in columns (3 on desktop, 2 narrower, 1 at 390px), newest last.
- **Word cloud:** case-insensitive counts, size by count. An answer of three words or fewer counts as one phrase; a longer answer adds its words, stop words removed. Each phrase or word appears once, however many answers it came from.
- **Groups:** one tap sends the on-board answers to Claude, which returns 3–6 named groups. Cards move into labelled columns. The teacher can drag a card to another group and rename a group. The grouping is saved on the server, so polling never repeats the AI call. A Regroup button runs it again on demand. Answers that arrive after grouping land in a "New" group until the next regroup.

## Student view (published lesson)

- Join with the code (no account). Device token kept locally, as in peer feedback.
- Question, answer box, "2 of 3 left" counter, and a list of their own sent answers with each one's status (on the board, waiting, removed shows as "Not shown").
- In **All answers** mode, they also see the board as the teacher has it: neutral dots while the teacher's board is in orbit, and the answer text only once the teacher reveals. Only answers currently on the board, never held, flagged or removed answers, and never symbols.
- With Show student symbols on, their own symbol appears in the block's corner.
- Drafts are kept on the device so a reload loses nothing.

## Server

New shared module `netlify/functions/_shared/brainstorm.mjs`, teacher function `brainstorm.mjs` (operator gate, `/api/lessons/:id/brainstorm/:block`) and public function `published-brainstorm.mjs` (`/api/published/brainstorm/:lesson/:block`, added to `public-student-routes.mjs`).

Blob keys:

```
brainstorm/{lesson}/{block}/activity                        { session, code, open, revealed, layout, students_see, show_symbols, symbols_on_cards }
brainstorm/{lesson}/{block}/{session}/claims/{symbol}       { token_hash }
brainstorm/{lesson}/{block}/{session}/tokens/{token_hash}   { symbol }
brainstorm/{lesson}/{block}/{session}/answers/{symbol}/{n}  { text, flagged, status: pending | shown | removed, created_at }
brainstorm/{lesson}/{block}/{session}/groups                { groups: [{ id, name, answer_ids[] }], made_at }
```

Rules the server enforces (never the client):

- The cap per student comes from the block's saved content, not the request.
- Whether an answer starts as `pending` or `shown` follows the safety mode. Flagged answers always start `pending`.
- In Hidden until reveal, the student response never contains other students' text before reveal.
- Student responses include only `shown` answers, without symbols. The student's own answers include their status.
- Grouping sends Claude only `shown` answer text: no symbols, no names, no lesson content beyond the question. It uses the existing `anthropic-client.mjs` with a small model and a strict JSON reply, and rejects any reply that names answer IDs it wasn't given.

Teacher actions: `status`, `start`, `end`, `reveal`, `hide`, `layout`, `students_see`, `symbols`, `symbols_on_cards`, `approve`, `remove`, `group`, `move`, `rename_group`. Student actions: `status`, `join`, `submit`.

## Block wiring

Add `brainstorm` wherever `question_drop` is registered: `schemas/block.ts` (type list and Zod schema), `blocks/registry.ts`, `blocks/render.ts`, `blocks/editors.ts`, `blocks/create-block.ts`, `blocks/block-meta.ts` (description and a vector icon), `blocks/search-text.ts` (the question), `schemas/publish-block-issues.ts` (empty question blocks publishing) and `netlify/functions/_shared/teaching-block-schema.mjs` (regenerate if generated).

## Out of scope (v1)

- Export or saving a board into the lesson as a permanent record.
- Images or drawings as answers.
- Voting or liking answers.
- More than 36 students in one round.

## Testing

- Server unit tests: per-student cap; each safety mode's starting status; flagged always pending; Hidden until reveal leaking nothing before reveal; removed and pending answers never in student responses; symbols never in student board data; grouping receiving only shown text and rejecting unknown IDs; teacher actions refused without the operator gate.
- Block tests: editor defaults and saved settings; student counter and statuses.
- Browser check on a local preview at desktop and 390px: orbit is smooth with 10 and 70 shapes, reveal and back, all three layouts, queue approve and remove, students-see toggle on a second tab, reduced motion.
- `npm run pre-pr-check` passes before the PR.
