# Clare supercharge — Life Hub chat desk

**Date:** 2026-08-25  
**Repo:** `tasks-hub`  
**Route:** `#/clare` plus a floating overlay from any page  
**Status:** Implement

## Problem

Clare DeMind is already a desk (morning sweep, brain dump, sprints, ADHD tools, confirm-before-write). The surface is still a form: one briefing card, one textarea, one result that replaces the last. Life Hub already has the chat window Adam uses — overlay panel, bubbles, composer, New chat, protocol pills, and proposal cards with a visible **Saving…** state. Tasks Hub should use that window, not a parallel kit.

## Decisions

### 1. Same window as Life Hub

Tasks Hub chat is Clare only. Chrome matches Life Hub:

| Piece | Behaviour |
|-------|-----------|
| Panel | `#chat-view` lives in `#chat-view-home`. Overlay reparents it and sets `data-panel-mode="overlay"` |
| Overlay | Fixed bottom-right, above the FAB, glass + kit tokens, max-height ~70vh |
| FAB | `💬` bottom-right, `aria-label="Chat with Clare"`. Hidden on `#/clare`. Toggle opens/closes overlay |
| New chat | Clears the thread and starts a fresh morning sweep |
| Hero | Compact Clare strip (mark + name + role). Auto-collapses after the first user message or first reply in that thread. Tap to expand/collapse |
| Messages | `#chat-messages` list. User bubbles right-aligned; Clare bubbles left with a Wave accent bar |
| Composer | `#chat-form` + `#chat-input` + **Send**. Enter sends; Shift+Enter is a new line (dumps stay multi-line) |
| Error | `#chat-error` banner, role=alert |
| Unread | Dot on the FAB when Clare replies while the window is closed |

`#/clare` is the full-page Chat section (same panel, not overlay). Navigating away parks the panel in `#chat-view-home` so the thread survives.

Do not invent colours, type, radii, or a second button system. Overlay glass uses `--hub-glass-fill`, `--hub-elev-card`, `--radius-lg`, `--wave`.

### 2. Desk stays; it talks in the thread

Every dump, sprint, and ADHD tool is a chat turn. Do not replace the last card.

- First open / New chat: Clare posts the **morning sweep** as an assistant message.
- Empty send, or a briefing protocol with an empty composer: load that briefing into the thread.
- Text send: `processDumpWithClare` — voice, questions, parked notes, toolkit, then proposal cards.
- Protocol pills stay (Clare can / When stuck). Hover cards stay one sentence.
- Domain stays a `.hub-filter` next to Send.
- Framework library + calibration stay behind a details row on the page, hidden in overlay.

Wait copy still rotates Clare’s lines in a status bubble (`chat-message--status`). No “Thinking…” / “Working…”.

### 3. Writes stay confirm-before-write

Proposal cards sit in the message list (Life Hub `record-proposal` shape, kit `.btn`s):

- Title, chips, optional reasoning, minutes (`.hub-search`), framework (`.hub-filter`).
- **Confirm** / **Discard**.
- Confirm: `disabled`, label **Saving…**, dimmed. Success replaces the card with “Saved.” Failure re-enables and restores the label.
- Same store path: `acceptClareBatch`. No silent writes. No Notion at runtime.

After Confirm, stay in the thread. Do not reboot the desk or show the cube.

### 4. Out of scope

- Live Anthropic / streaming `/api/chat`. Local mock + existing `/api/clare` is enough.
- Multi-agent picker (Life Hub roster). Clare is the only Tasks Hub chat agent.
- Lesson-builder chat column.

## Files

- `src/chat/render-chat.ts` — messages, safe markdown, proposal cards, unread, busy
- `src/chat/chat-panel.ts` — overlay open/close (Life Hub `createChatPanelController`)
- `src/chat/build-chat-view.ts` — panel + FAB markup
- `src/chat/clare-controller.ts` — desk → thread
- `src/chat/clare-session.ts` — one panel for page + overlay
- `src/views/clare.ts` — `#/clare` attaches the same panel
- `src/styles/views.css` — Life Hub chat layout on kit tokens
- `tests/unit/render-chat.test.ts`, `chat-panel.test.ts`, updated `clare-view.test.ts`

## Success criteria

- Overlay chat from Board / Today / anywhere looks and behaves like Life Hub’s window.
- `#/clare` is the same conversation, full page.
- Morning sweep opens the thread. Dumps append. Confirm shows **Saving…** then **Saved.**
- Unit tests cover collapse, overlay reparent, wait-line rotation, and Confirm busy state.
