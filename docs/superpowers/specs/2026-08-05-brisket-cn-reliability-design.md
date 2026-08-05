# Brisket + Central Node Reliability

**Date:** 2026-08-05  
**Status:** Approved  
**Deploy rule:** Local commits only until Adam asks to push.  
**Slice:** Second pack from the 2026-08-05 feedback dump (after Nutrition charts polish).

## Problem

1. **Save doesn’t update Nutrition / Central Node UI** until a hard reload. Confirm already calls `refresh({ manual: true })`, but an in-flight refresh can be joined (`activeRefresh` / sync coalesce), returning a pre-write snapshot with `changed === false`, which skips section re-render.
2. **Brisket food research goes quiet** after web search + Food Library save. `save_food_library_entry` is fire-and-forget (no `tool_result` continuation), so the anthropic client often stops the turn before macros text or `log_entry`. Adam has to re-prompt (“done”) to get numbers.
3. **Central Node can miss the log** while the meal still saves. `syncCentralNodeAfterLog` soft-fails into an empty `catch`; the user gets no signal that CN didn’t update.

## Out of scope

- Sticky “Researching…” / unread chat badge / larger avatars (chat UX slice)
- Macro-tile packing, empty meal tiles, skincare polish, CN protein tile layout (layout slice)
- Chadwick workout builder stuck
- Failing the whole meal confirm when CN sync fails (Adam chose warn-only)
- Changing Nutrition chart rendering (already shipped)

## Decisions

### 1. Post-write refresh — abort + fresh sync + always re-render

Adam choice **A**.

- When refresh is triggered from `onRecordWritten` (post-confirm), **do not** return/join `activeRefresh`.
- Abort any in-flight refresh/sync for that path (or mark it superseded) and start a **new** live sync.
- After that sync settles, **always re-render** the current section (Nutrition, Central Node, Home, etc.) even if `result.changed === false`, so UI cannot stay on a stale paint.
- Keep the existing behaviour for ordinary background / manual Refresh where joining or skipping unchanged redraw is fine — only the post-write path is special (e.g. `refresh({ manual: true, force: true })` or a dedicated `refreshAfterWrite()`).

### 2. Food library tool rounds — continue after save

Adam choice **A** (continue turn; no sticky Researching UI in this slice).

- Treat `save_food_library_entry` like `search_exercise_library`: execute → emit `tool_result` → continue model rounds.
- Goal: one user message can produce search → save → macro narration and/or `log_entry` proposal without a second prompt.
- Keep existing client search events (“Looking that up…”) as-is for this slice; durable researching state is deferred to chat UX.

### 3. CN soft-fail — warn in chat, meal still succeeds

Adam choice **A**.

- Meal / record confirm remains successful when the private data write succeeds.
- If Central Node sync fails or cannot apply (decode failure, empty seed, write error, unexpected no-op after a log that should mutate), include a structured signal on the confirm response (e.g. `centralNodeUpdated: false` + optional reason).
- Client shows a short ephemeral/chat warning after confirm, e.g. “Logged, but Central Node didn’t update — try Refresh.”
- Do not roll back the meal file write.

### 4. Approach

Targeted fixes in `app-controller` refresh, anthropic tool-loop, and chat-confirm → chat-controller. No full chat rewrite.

## Files (expected)

- `js/app/app-controller.js` — post-write refresh abort + force re-render
- `js/app/main.js` — wire `onRecordWritten` to the force path if needed
- `netlify/functions/_shared/anthropic-client.mjs` / `chat.mjs` — continue rounds after food library save
- `netlify/functions/chat-confirm.mjs` — return CN sync status; stop silent empty-catch for client visibility (server may still soft-fail meal success)
- `js/app/chat-controller.js` / `chat-api.js` — surface CN warning after confirm
- Unit / integration tests for refresh force path, tool continuation, confirm CN flag
- `service-worker.js` — bump if client shell files change

## Success criteria

- After confirming a meal on Nutrition (or overlay chat), macros / meal log / CN update without a manual page reload.
- A Brisket turn that searches and saves a food can continue and produce numbers or a log proposal in the same stream without re-prompting.
- If CN sync fails, the meal still saves and the UI shows an explicit short warning.
- Existing confirm / chat / refresh tests updated; new coverage for the three behaviours above.

## Queued after this slice

1. Chat UX (researching state, unread badge, larger avatars)  
2. Layout & polish (macro tile, empty meal tiles, CN protein tile, skincare)  
3. Chadwick workout builder stuck  
