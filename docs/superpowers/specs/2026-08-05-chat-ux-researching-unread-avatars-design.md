# Chat UX: Researching State, Unread Dot, Larger Avatars

**Date:** 2026-08-05  
**Status:** Approved  
**Deploy rule:** Local commits only until Adam asks to push.

## Problem

1. Long agent turns can feel silent after “On it…” / “Looking that up…” — especially multi-tool research — with no sticky working signal.
2. If a turn finishes while the chat overlay or Chat tab is closed, nothing signals that a reply is waiting.
3. Agent faces in the picker and message bubbles are small (48 / 36) and easy to miss.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Approach | Surgical pass on existing chat UI (no chrome redesign) |
| Working state | Sticky assistant status bubble; rotating copy + soft pulse |
| Unread | Accent/red **dot** on section FABs + Chat nav (rail + mobile) |
| Unread when | Stream ends while chat is not open |
| Avatars | Picker **64** · bubble **52** |
| Out of scope | FAB emoji→face swap; numeric unread count; status bar above composer; server tool-continuation (already shipped) |

## Design

### 1. Sticky status bubble

- On send: create (or reuse) one assistant placeholder bubble with text **On it…**.
- On `search` stream events: update that bubble to **Looking that up…** (keep today’s search chip / “Searched the web” behavior).
- On other lasting client-visible tool activity (library search/save, multi-round tools) while still waiting for assistant text: update to **Researching…**.
- Soft opacity pulse on the status bubble; **no pulse** when `prefers-reduced-motion: reduce`.
- Clear the status bubble on first real text delta, proposal card, or error — never leave it after the turn.
- Does not change Netlify/Anthropic tool continuation (already fixed in Brisket/CN reliability).

### 2. Unread dot

- **Set** when the stream ends (`done`, proposal presented, or terminal error) **and** the chat panel is closed **and** the Chat section is not active.
- **Clear** when the chat overlay opens or the user navigates to the Chat section.
- Dot only (no count). High-contrast red/accent on FAB; small dot on Chat nav items.
- Surfaces: all section floating chat buttons + rail Chat + mobile Chat.
- Session-only — no `localStorage` / reload persistence.

### 3. Larger avatars

- Update CSS and `img` width/height: `.agent-picker__avatar` → **64px** (3rem→4rem as needed); `.chat-message__avatar` → **52px**.
- No new image assets; no change to FAB 💬 content in this slice.

## Edge cases

| Case | Behavior |
|------|----------|
| Chat already open | Never set unread |
| Reduced motion | Status text still updates; skip pulse |
| Error while closed | Clear status; show error path; still set unread |
| Overlapping send | Existing busy/disable; one status bubble per in-flight send |
| Mind opens agent | Same unread clear rules when chat becomes visible |

## Testing

- Unit: status copy transitions (`On it…` → search → Researching…) and clear on text / proposal / error.
- Unit: unread set when turn ends with chat closed; clear on open / Chat section.
- Unit or render helper: avatar dimensions 64 / 52.
- Full `npm test`; bump service-worker shell cache after client JS/CSS change.
- Manual: long Brisket research turn shows sticky Researching…; close panel before `done` → FAB/nav dot; open clears.

## Success criteria

- User always sees a live status bubble until a real reply or terminal outcome.
- Missed replies while away from chat are visible via FAB + Chat nav dots.
- Avatars read clearly at conversation distance without crowding mobile message text unduly.
