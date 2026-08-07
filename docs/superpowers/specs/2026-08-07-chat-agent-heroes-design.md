# Chat Full-Body Agent Heroes

**Date:** 2026-08-07  
**Status:** Approved  
**Deploy rule:** Local commits only until Adam asks to push.

## Decision

Option **B**: keep small circular avatars in the picker and message bubbles. Show the full-body portrait as a **chat hero** when an agent is pinned / active in the chat panel.

## Behaviour

- Hero sits under the agent picker, above the message list.
- Updates when Adam picks an avatar or when the stream names an agent.
- Shows full-body image + agent name; uses agent accent colour on the frame.
- Empty / no agent: hide hero.
- Overlay chat panel (Nutrition FAB etc.): same hero, slightly shorter max-height.

## Assets

- Source: Adam’s full-profile PNGs.
- Ship: `assets/agents/full/<slug>.png` (optimized).
- Small avatars unchanged at `assets/agents/<slug>.jpg`.

## Non-goals

- Replacing bubble/picker crops with full-body
- Animated transitions beyond simple show/hide
