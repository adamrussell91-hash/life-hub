# Bug Pack: Central Node, Refresh, Chat Feedback, Accents, Week Chart

**Date:** 2026-08-05  
**Status:** Approved  
**Deploy rule:** Local commits only until Adam asks to push. Data-repo seed is a separate commit in `life-hub-data`.  
**Next after this pack:** Editable Fitness session design, then Skincare.

## Problem

1. **Refresh** feels broken: “Last synced” only moves when new data arrives, not when a successful refresh finds no changes.
2. **Chat** can sit silent for a long Chadwick planning reply; only web search shows “Looking that up…”.
3. **Agent colours** from `config/agents.yml` theme the floating button / overlay border, but assistant bubbles hardcode `--wave`, so accents never show on bubbles.
4. **Central Node** shows live meal totals from events but “No agent notes yet” because `central-node.md` is missing from the private data repo; confirm’s CN sync silently no-ops when the blob is absent.
5. **This Week** on Central Node is an unlabeled, clipped protein line chart.

## Out of scope

- Editable Fitness session UI (separate design next)
- Skincare tab
- Richer Brisket narrative beyond Status / Recent Actions lines
- Netlify / origin push unless Adam asks

## Decisions

### 1. Central Node seed + confirm safety net

- Copy the app-repo `central-node.md` into `life-hub-data/central-node.md` and commit there (full writing rules, Constraints, section headings).
- In `chat-confirm`’s `syncCentralNodeAfterLog`: if the blob is missing, **create** the file using the checked-in app-repo `central-node.md` (read at function runtime via the same include/bundle path used for other config files), then apply the log mutation. Soft-fail remains only for genuine GitHub / conflict / transient errors after an attempted write — not for “file missing.”
- Meal confirm continues to upsert `**Nutrition:** …` under Today’s Status and append a Recent Actions line (existing `applyLogToCentralNode` behaviour).

### 2. Refresh feedback

- On every successful live refresh with `freshness === 'confirmed'`, call `recordSuccess()` / update `#last-synced` to now — even when `changed === false`.
- Keep skipping full dashboard re-render when unchanged.
- While a refresh is in flight, use the existing `refreshing` app state so the Refresh control is visibly busy / disabled.

### 3. Chat “working” placeholder

- When Send starts (before first stream event), append a short assistant placeholder: **“On it…”**.
- Remove/replace it when real assistant text, search wait, library notes, or a record proposal arrives.
- Keep existing “Looking that up…” for web search.
- Continue using `setChatBusy` for the input/send while the turn is in flight.

### 4. Agent bubble accent

- Change `.chat-message--assistant[data-agent]` border from `var(--wave)` to `var(--agent-accent, var(--wave))`.
- When the chat stream reports the agent slug, set `#chat-view`’s `--agent-accent` via `agentColour(agentsConfig, slug)` so handoffs update mid-conversation (panel open colour remains the tab default until then).

### 5. This Week chart

- Visible label: **Protein this week** (replace or subtitle the vague “This Week” chart heading).
- Fix clipping: increase bottom padding / viewBox height for day labels; avoid crushing labels (`preserveAspectRatio` not `none`, or equivalent).
- Series unchanged: last 7 days’ protein grams from meal events (`buildProteinLineChart`).

## Verification

- Unit: refresh last-synced on unchanged confirmed fetch; chat placeholder lifecycle if covered by tests; CSS/accent behaviour via existing chat/browser tests where present; CN sync creates missing file (function test).
- Manual: confirm a meal → Today’s Status + Recent Actions populate after refresh; Refresh updates time with no new data; Chadwick long reply shows “On it…” immediately; Brisket/Chadwick bubbles use gold/blue accents; week chart readable with protein label.

## Follow-ups (not this pack)

1. Editable planned workout on Fitness (confirm → editable fields → finish).
2. Skincare tab + Hyaluronica.
