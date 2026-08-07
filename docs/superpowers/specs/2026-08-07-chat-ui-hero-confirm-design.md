# Chat UI — Collapsible Hero + Confirm Feedback

**Date:** 2026-08-07  
**Status:** Approved  
**Deploy rule:** Local commits only until Adam asks to push.  
**Slice:** Chat UI (B) from the 2026-08-07 feedback dump.

## Problem

1. Full-body agent hero under the picker crowds the message list — especially in overlay chat — so replies look missing.
2. Confirm on proposal cards sets `disabled` but has no visible busy state (no “Saving…” / dimmed style).

## Decisions

### 1. Collapsible hero (Adam: B)

- On pin / first agent activation: show the full portrait (keep current sizing; overlay may stay slightly shorter).
- After the first user message **or** first assistant reply while that agent is active: auto-collapse to a compact strip (small image + name).
- Tap strip → expand; tap expanded hero (or a chevron control) → collapse.
- Same behaviour on main Chat and overlay.
- Small picker avatars and bubble avatars unchanged.
- Empty / no agent: hero stays hidden.

### 2. Confirm busy state (Adam: A)

- On Confirm click: `disabled = true`, label → **Saving…**, dimmed disabled CSS (parity with `.fitness-logger__finish:disabled` / sign-in).
- Success: card still replaced with “Saved.”
- Failure: re-enable, restore previous label (Confirm / overwrite wording), keep existing error banners.

## Out of scope

- Agent tool-loop reliability (shipped)
- Nutrition charts / advice slot / heatmap
- Sodium / food accuracy
- Notion import schema repair
- Removing the hero entirely

## Files (expected)

- `js/app/render-agent-picker.js` — collapse/expand UI + classes
- `js/app/chat-controller.js` — auto-collapse after first message/reply; wire tap
- `js/app/render-chat.js` — Confirm label swap helpers if needed
- `css/app.css` — compact strip + confirm:disabled
- `index.html` — chevron / structure if needed
- `tests/unit/agent-hero.test.js` (+ confirm busy tests)
- `service-worker.js` — bump cache

## Success criteria

- Overlay chat shows a usable message list after the first exchange (hero collapsed).
- Confirm visibly shows Saving… while the request is in flight.
- Unit tests cover collapse triggers and Confirm label/disabled behaviour.
