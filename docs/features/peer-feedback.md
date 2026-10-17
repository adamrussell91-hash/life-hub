# Peer feedback block

Students write a short answer, swap it anonymously with a classmate, give one strength and one suggestion, then read the feedback on their own answer. No student accounts.

## Running it

1. Add **Learning → Peer feedback** to a lesson. Set the question and the two feedback boxes (they default to "One thing that works well…" and "One suggestion or question…"). Publish the lesson.
2. On the lesson page, press **Start activity** on the block. A six-digit code appears; **Show on board** puts it full screen for the projector.
3. Students open the lesson link, type the code and pick a coloured symbol (6 colours × 6 shapes = 36 places). Taken symbols grey out as others join.
4. Students write and press **Hand it in**. The teacher sees each answer arrive, plus a row of symbols still writing. Untick **In the swap** to leave an answer out.
5. **Start the swap.** Each included answer goes to exactly one other student, never its writer. Students see "Someone's answer" and fill in the two boxes.
6. **Hand feedback back** (or **Hand back what's in** if some are still writing). Students see the two feedback cards on their own answer. The teacher sees every answer with its feedback and who gave it.
7. **Start a new activity** for the next class (fresh code, fresh session), or **End** to close it. Activities also close after 12 hours.

Both pages update by themselves every few seconds while visible; there is no refresh button. A poll only repaints when the step changes, so typing is never interrupted. Every keystroke is saved on the device, so a reload or a dropped connection loses nothing. Answers and feedback are write-once.

## Implementation

- UI: `apps/teaching/src/blocks/peer-feedback.ts` and `.css`. Teacher controls render on the block in the lesson canvas (mode `teacher` with a lesson id); students render in the published lesson. The editor only holds the three prompts.
- Teacher API: `POST /api/lessons/:id/peer-feedback/:block` behind the operator session gate. Actions `status`, `start`, `review` (with `exclude`), `results`, `end`.
- Student API: `POST /api/published/peer-feedback/:id/:block` on the public-student gate. Actions `status`, `join`, `submit`, `feedback`. Status never exposes the code, token hashes, other students' answers or the swap order. The list of taken symbols is only returned while joining is open.
- Errors carry codes (`wrong_code`, `taken`, `new_session`, `not_joined`, `wrong_phase`, …) so the page reacts without matching message text.
- Storage: one create-only blob per claim, answer and review under `peer_feedback/{lesson}/{block}/{session}/`. Only the teacher writes the round state and the frozen swap. A student proves their symbol with a random token kept on the device (hashed on the server).
- The block must be live in both the draft and published lesson on every call, so a deleted block can't be reached through an old activity.
- Print gives the question and the two feedback prompts with ruled lines.

## Verification

- `node --test tests/unit/peer-feedback.test.js`: swap rules, symbol claims, moderation, write-once, session isolation, ending, deleted content, real handlers.
- `cd apps/teaching && npx vitest run tests/unit/peer-feedback-block.test.ts`: schema, palette, editor, print.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome node tests/browser/peer-feedback.spec.mjs`: one teacher and two students in real browser contexts through the production handlers (isolated fixture storage): wrong code, taken symbol, draft reload, failed send, swap, returned feedback, 390px without sideways scroll. Screenshots land in `/tmp/peer-feedback-*.png`.
