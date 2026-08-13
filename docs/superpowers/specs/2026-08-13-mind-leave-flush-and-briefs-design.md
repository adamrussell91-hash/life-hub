# Mind leave-flush and Hammond 5e/6b briefs

**Date:** 2026-08-13  
**Status:** Approved (build)  
**Deploy rule:** Local commits only until Adam asks to push.  
**Amends:** `2026-08-13-mind-session-memory-design.md` (does not rewrite it).  
**Reverses:** that spec’s non-goals “Leave-flush” and “5e/6b protocol-only (no extra Hammond diary-blob window).”

---

## Problem

Vera only writes `mind_session` when she proposes. New Chat, switching agent, or leaving Chat often happens before that, so the day’s compact note never lands.

Hammond’s monthly three-way brief (6b) and quarterly two-voice look-back (5e) are already in his protocol, but ordinary turns still only get path cadence, silence, and Mind Insights. Diary metadata + `system_note` never join the prompt on those brief turns. A second GitHub mind-blob window is unnecessary: Hammond already blob-reads 30 days of `data/mind/` for the Central Node snapshot.

## Goals

- Leaving a Vera thread (New Chat, switch agent, leave Chat tab/panel) runs one hidden close turn so she can auto-write if there is a session.
- Hammond 5e/6b turns inject `summarizeDiaryForPrompt` from the already-parsed CN event window. No extra `readBlob`.
- Ordinary Hammond turns stay unchanged (path dates + silence + insights). Thin data: refuse to fabricate.

## Non-goals

- Full transcripts or a session archive.
- Stub files (“session ended without close”).
- Guided multi-turn 5e/6b machines or auto-writing Long-Term Trends.
- Leave-flush for anyone except Vera.
- Two `mind_session` files per Sydney day.
- A second GitHub mind-digest fetch for Hammond.

---

## Decisions (locked)

| Topic | Choice |
|---|---|
| Flush shape | Hidden close **turn**, same `/api/chat` stream, same in-tab history. Not a stub write. |
| Flush user line | Fixed: `That's enough for today — record the session if there is one.` Not shown as a user bubble. |
| Flush UI | Short status (“Wrapping up…”), then usual `record_saved` “Session logged” — or **nothing extra if she declines** (her chat text, if any, may still appear). |
| Flush who | Vera only. |
| Skip flush | Not Vera; no Vera assistant reply in this thread; a `mind_session` already `record_saved` this thread. |
| Abort-in-flight | Abort first, then flush, then New Chat clears. |
| Leave Chat | Overlay panel `close()`, **or** navigating off the Chat section. Navigating *to* Chat while closing an overlay does **not** flush. |
| 5e/6b | One Hammond chat turn. Detect from `parsed.message`. Reuse `cnEvents`. Output remains `propose_central_node_patch` Confirm. |
| Diary inject | Metadata + `system_note` only (`summarizeDiaryForPrompt`). Never prose. |

---

## Architecture

```
Leave Vera thread
  → skip unless pinned/last agent is Vera, thread has an assistant reply, and no mind_session saved this thread
  → POST /api/chat with flush line + recentHistory (no user bubble)
  → Vera auto-write path unchanged
  → then New Chat reset / agent pin / panel already closing

Hammond message matches 5e/6b
  → summarizeDiaryForPrompt(cnEvents, today)  // already parsed, 30-day CN window
  → hammondDiaryDigest in Hammond prompt block
  → ordinary Hammond messages: empty string (no diary block)
```

---

## Detection (5e/6b)

`isHammondMindBriefTurn(message)` is true when the user message matches (case-insensitive):

- `retrospective`
- `look-back` / `lookback`
- `monthly brief`
- `three-way brief` / `three way brief`
- `pattern synthesis`
- `quarterly`
- `two-voice` / `two voice`
- `mind brief`

Do **not** treat `monthly audit` / Central Node audit as a brief turn.

---

## Client (leave-flush)

`js/app/chat-controller.js`:

- Track `savedMindSessionThisThread` on `record_saved` when `record.type === 'mind_session'`.
- `flushVeraSession()` public; `startNewChat()` and `selectAgent()` (leaving Vera) call it first.
- `send(message, { hiddenUser: true })` skips the user bubble, does not `remember` the flush line, uses a wrapping-up status, skips unread + audit triggers.
- Reset `savedMindSessionThisThread` only when the thread is actually cleared (after flush on New Chat).

`js/app/app-controller.js`:

- Optional `chatFlushVeraSession`.
- Call when overlay toggle **closes**, and when `showSection` leaves the chat surface (overlay open or `currentSection === 'chat'`) **and** the next section is not `chat`.

`js/app/main.js`: wire `chatFlushVeraSession: () => chatController?.flushVeraSession?.()`.

Bump `CACHE_NAME` `life-hub-shell-v71` → `v72`.

---

## Server (5e/6b)

- Export `isHammondMindBriefTurn` and `hammondDiaryDigestForTurn` from `mind-digest.mjs`.
- `chat.mjs`: after `parseHammondEventDocuments`, set `hammondDiaryDigest` (do not reuse Vera/Penelope `mindDiaryDigest`).
- `persona.mjs`: Hammond block interpolates `hammondDiaryDigest` when non-empty, labelled as diary metadata only.

Zero extra GitHub blob slots.

---

## Testing

- `isHammondMindBriefTurn` true/false cases; `hammondDiaryDigestForTurn` empty unless Hammond + match; summary still excludes diary body.
- Persona: Hammond includes digest when passed; ordinary/empty omits; Vera still uses `mindDiaryDigest`; Brisket never gets `hammondDiaryDigest`.
- Chat function: brief message includes diary metadata from a CN mind blob; ordinary Hammond message does not; blob fetch count unchanged vs ordinary Hammond (same CN window).
- Chat controller: Vera reply + New Chat sends flush line without a user bubble, then clears; skip if Penelope; skip if `record_saved` mind_session this thread; skip if no assistant reply; switch Vera → Penelope flushes then pins; abort-in-flight then flush.
- App controller: closing overlay flushes; nav away from Chat section flushes; nav overlay → Chat section does not.

---

## Follow-ups (still out)

- Full transcripts.
- Two sessions per day.
- Migrating old `mood` → `moods`.
- Auto-writing Long-Term Trends.
