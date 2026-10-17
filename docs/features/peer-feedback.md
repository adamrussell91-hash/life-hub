# Peer feedback block

Students write a short answer, swap it anonymously with a classmate, give one strength and one suggestion, then read the feedback on their own answer. No student accounts.

## Running it

1. Add **Learning → Peer feedback** to a lesson. Set the question and the two feedback boxes (they default to "One thing that works well…" and "One suggestion or question…"). Publish the lesson.
2. On the lesson page, press **Start activity** on the block. A six-digit code appears; **Show on board** puts it full screen for the projector.
3. Students open the lesson link, type the code and press **Join**. That's all: no account, no name, and no choosing. The server quietly gives each device a coloured symbol (6 colours × 6 shapes = 36 places). Students never see symbols.
4. Students write and press **Hand it in**. The teacher sees each answer arrive, plus a row of symbols still writing. Untick **In the swap** to leave an answer out.
5. **Start the swap.** Each included answer goes to exactly one other student, never its writer. Students see "Someone's answer" and fill in the two boxes.
6. **Hand feedback back** (or **Hand back what's in** if some are still writing). Students see the two feedback cards on their own answer, with no hint of who wrote them. The teacher sees every answer by symbol, with its feedback and who gave it, as it arrives.
7. **Start a new activity** for the next class (fresh code, fresh session), or **End** to close it. Activities also close after 12 hours.

## Notes on the text (annotate mode)

In the block editor, **How students give feedback** switches between **Two feedback boxes** (above) and **Notes on the text**.

- **The swap.** Each answer goes to the next two people round a shuffled ring, so everyone reviews two pieces and gets two back, never their own. With only two pieces in the swap, each gets one reader.
- **Giving.** The student sees "Piece 1 of 2". They tap a sentence (tapping the next or previous sentence grows the selection), or drag to pick exact words. Then they press a feedback button. A button that asks a question ("Should be:") needs a short answer; a plain comment works without any button. Up to 20 notes per piece. **Send, then piece 2**, then **Send feedback**. Unsent notes are kept on the device.
- **Feedback buttons** are one bank shared by every notes-on-the-text block in every lesson. Edit them in the block editor and press **Save buttons** (saved on their own, not with the lesson). Each button has a label, a colour, an optional question, and an optional resource only the teacher sets: a link, a video with a start time, or the **technique card** matching what the reviewer typed ("metaphor" opens the Metaphor card). Resources are attached when the writer reads the note, so fixing a link fixes it everywhere.
- **Teacher view.** Every piece shows both layers by symbol, with each note, its status and **Remove** (any note) or **Release** (held notes). **Show:** chips focus on one student: their own piece plus every note they gave.
- **Getting it back.** The writer sees their piece with **Reviewer 1** and **Reviewer 2** layers (toggle each), a summary such as "2 × Needs evidence · 1 × Great quote", and taps a highlight to read the notes and any resource. Students never see symbols or who reviewed them.
- Notes and comments go through the same word check: flagged notes are held until released.

## Behaviour problems

- **Word check.** Answers and feedback are checked on the server for abusive words, including common dodges: sh1t, fuuuck, f.u.c.k, f u c k, and phrases like "kill yourself". Words that turn up in normal English analysis ("bloody", "hate", "gay" in older poems) are left out on purpose. It is a rough net; kids will get round it.
- **Flagged answers** are marked **Flagged words** and start out of the swap. Tick **In the swap** to put one back.
- **Flagged feedback** is held: the writer can't see it. The teacher row shows it in red with **Release** (the writer sees it) or **Remove** (the writer never sees it). The summary line counts how many are held.
- **Show student symbols.** A switch on the teacher view. While it's on, every student sees their own symbol small in the top-right corner of the block (within about five seconds). Walk the room or ask a student to scroll back to the block, and match the symbol you saw in the teacher view to a student. Switch it off to hide them again.

## Updates

Both pages update by themselves every few seconds while visible; there is no refresh button. A poll only repaints when the step changes, so typing is never interrupted. Every keystroke is saved on the device, so a reload or a dropped connection loses nothing. Answers and feedback are write-once.

## Implementation

- UI: `apps/teaching/src/blocks/peer-feedback.ts` and `.css`. Teacher controls render on the block in the lesson canvas (mode `teacher` with a lesson id); students render in the published lesson. The editor only holds the three prompts.
- Teacher API: `POST /api/lessons/:id/peer-feedback/:block` behind the operator session gate. Actions `status`, `start`, `review` (with `exclude`), `results`, `end`.
- Teacher actions also include `symbols` (`show: true|false`), `release` and `remove` (`reviewer: <symbol>`).
- Student API: `POST /api/published/peer-feedback/:id/:block` on the public-student gate. Actions `status`, `join`, `submit`, `feedback`. A device sends only `{ session, token }`; the server maps the token to a symbol, and returns that symbol only while the teacher has symbols switched on. Status never exposes the code, token hashes, other students' answers, symbols or the swap order. Flagged feedback is withheld until released.
- Word check: `netlify/functions/_shared/peer-feedback-filter.mjs`.
- Annotate mode: UI in `apps/teaching/src/blocks/peer-annotate.ts` (+ `.css`), bank editor in `peer-annotate-bank.ts`, shared helpers in `peer-feedback-ui.ts`. Block content `mode: 'comments' | 'annotate'` (default `comments`); the activity records the mode when it starts. Student action `annotate` with `{ piece, notes: [{ start, end, code_id?, answer?, comment? }] }`; the server takes each quote from the text. Teacher actions `release_note` / `remove_note` with `{ reviewer, writer, note }`. Storage adds `annotations/{reviewer}/{writer}` (create-only) and `note_moderation/{reviewer}/{writer}` (teacher).
- Button bank: `GET`/`PUT /api/peer-feedback/bank` behind the operator session gate (`netlify/functions/peer-feedback-bank.mjs`, rules in `_shared/peer-feedback-bank.mjs`). Stored at `peer_feedback_bank`; https links only; at most 12 buttons.
- Errors carry codes (`wrong_code`, `taken`, `new_session`, `not_joined`, `wrong_phase`, …) so the page reacts without matching message text.
- Storage: one create-only blob per claim, token, answer and review under `peer_feedback/{lesson}/{block}/{session}/`, plus teacher-written `moderation/{symbol}`. Only the teacher writes the round state, the frozen swap and moderation. Tokens are stored hashed.
- The block must be live in both the draft and published lesson on every call, so a deleted block can't be reached through an old activity.
- Print gives the question and the two feedback prompts with ruled lines.

## Verification

- `node --test tests/unit/peer-feedback.test.js`: swap rules, silent symbols, Show student symbols, flagged answers and feedback, release and remove, write-once, session isolation, ending, deleted content, real handlers.
- `cd apps/teaching && npx vitest run tests/unit/peer-feedback-block.test.ts`: schema, palette, editor, print.
- `node --test tests/unit/peer-annotate.test.js`: two readers each (one each with two pieces), note checks, held and removed notes, the bank and its endpoint.
- `cd apps/teaching && npx vitest run tests/unit/peer-annotate.test.ts`: sentence splitting, giving notes, layers and cards, video start times, technique matching, the editor's mode switch and bank.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome node tests/browser/peer-annotate.spec.mjs`: bank editor save, a teacher and three students through annotate mode, flagged and removed notes, two layers back, technique card and video link, 390px. Screenshots in `/tmp/peer-annotate-*.png`.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome node tests/browser/peer-feedback.spec.mjs`: one teacher and two students in real browser contexts through the production handlers (isolated fixture storage): wrong code, symbols hidden by default and never stored on the device, Show student symbols on and off, draft reload, failed send, swap, flagged feedback held and removed, returned feedback, 390px without sideways scroll. Screenshots land in `/tmp/peer-feedback-*.png`.
