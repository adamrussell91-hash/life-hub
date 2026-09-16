# Cognitive Protocols conversation — immersive redesign

Date: 2026-09-16
Scope: `apps/knowledge/src/protocols/` (frontend only — vanilla TS + CSS, no framework)

## Problem

The protocol intake and session (conversation) views don't match the tone of the card-selection screen ("Choose a way to think"). Specifically:

- Each protocol has a bespoke painterly background image (`public/assets/cognitive-protocols/backgrounds/{id}-background.png`) but it's rendered at 30% opacity under a 74–97% opaque near-white gradient (`.protocol-intake::before/::after`, `.protocol-session::before/::after` in `protocols/style.css`). The art is effectively invisible.
- The transcript is a small, cramped scrolling list (`.protocol-transcript`) — doesn't feel like a conversation with a specific character.
- No visual distinction for "forks"/branching options a persona lays out in plain text (e.g. "Fork one: ... Fork two: ...").
- Headings, spacing and the reading column don't carry the same design weight as the card grid.

Out of scope (separate system, separate session): the actual protocol backend (`api.adam-russell.com`, not in this repo) — this owns conversational behavior (how many questions a persona asks, reply quality) and is also the source of a raw `{"text":"..."}` JSON string occasionally leaking into a turn's text. Neither is fixable from this repo.

## Visual direction

Let each protocol's own background art run at full strength, with only a bottom-anchored scrim (not a full wash) for text legibility. Each protocol keeps its own natural mood (Horizon's firelit Norse hall stays warm and dark; Fates' parchment stays light) rather than forcing one dark theme over all eight. Same treatment on the intake screen, so the mood is established the moment a protocol is chosen, not just once a session starts.

## Conversation layout

Replace the stacked transcript list with a single-turn "card carousel":

- One turn's card is shown at a time, centered/lower-third over the full-bleed background, with the speaking persona's portrait floating beside it (glow ring, matches the existing card-selection gold accent language).
- Card shows: speaker name + role (small caps, subtle), the turn's text (generous padding, `font-size` and line-height tuned for reading, card height grows with content rather than the text shrinking below a comfortable floor size).
- A dot-scrubber below the card: one dot per turn in `session.transcript`, colored by speaker, the currently-viewed turn enlarged/highlighted, unspoken/future turns dim. Prev/next arrows plus clicking a dot move a *local* "viewing index" independent of the live session state, so the user can browse history without losing their place.
- If a new turn arrives from the server while the user is viewing an older one, show a small non-intrusive "new reply ↓" affordance rather than jumping them forward automatically.
- Drop the always-visible row of dimmed "other voices" portraits (`.protocol-stage` in the current implementation) — the single floating portrait plus the colored dot-scrubber already communicate who's in the room and who is currently speaking.
- The user's own reply (the current `.protocol-reply` form) renders in the same card slot when it's their turn (checkpoint present), rather than as a separate section below the transcript — keeps a "one thing in front of you" feel. A simple "You" marker substitutes for a portrait.
- Turn-to-turn transitions crossfade (respects `prefers-reduced-motion`, consistent with the existing `protocol-deal` animation pattern already used for the card grid).

## Fork detection

When a turn's text matches a numbered "Fork one: ... Fork two: ..." (or equivalent numbered-list) pattern, render each fork as its own small card in a side-by-side row within that turn, instead of one flowing paragraph. Text that doesn't match the pattern always falls back to a normal paragraph — detection failure never hides or corrupts content.

## Lighting-as-progress

The room's lighting shifts across the conversation to visually mark progress, using real commissioned art (not a CSS color-grade) — Adam is having dawn/day/dusk/night variants painted per protocol.

- Four named stages, not an arbitrary sequential count: **dawn → day → dusk → night**. `{id}-background.png` (the existing file) *is* the "day" stage/default; `dawn`/`dusk`/`night` are new files named `{id}-background-{stage}.png` in `public/assets/cognitive-protocols/backgrounds/`. Naming by qualitative stage (rather than "stage-1.png", "stage-2.png"...) means a protocol only needs one image per mood regardless of how long any given session runs, and Adam can send however many candidate renders he likes per stage — only the one he saves with the matching filename gets used.
- Stage is derived from how far into the transcript the *currently viewed* turn is (not wall-clock time): the transcript-progress fraction (`viewingIndex / max(totalTurns - 1, 1)`) is bucketed into quarters — `[0, .25)` dawn, `[.25, .5)` day, `[.5, .75)` dusk, `[.75, 1]` night.
- Resolution is fully graceful: any protocol/stage without art yet falls back to `{id}-background.png`, so this ships today with zero visual regression and each protocol "lights up" independently as art lands for it. No hardcoded manifest of "which stages exist" — an `Image()` probe in JS confirms a staged file actually loads before swapping it in; a missing file silently keeps the default background.

## Data flow

No API contract changes. `Session` and `Definition` types are untouched. Lighting stage, fork detection, and the local "viewing index" are all pure presentation-layer derivations from data already returned by the existing `/protocols` endpoint.

## New pure helpers (`protocols/view.ts`)

- `lightingStage(viewingIndex: number, totalTurns: number): "dawn" | "day" | "dusk" | "night"` — quarter-bucket math, pure, easy to unit test.
- `backgroundAsset(id: string, stage?: "dawn" | "dusk" | "night"): string` — extends the existing function to build the staged filename when a stage is given (day/default omits the suffix, matching the existing file).
- `detectForks(text: string): { label: string; body: string }[] | null` — regex-based; returns `null` on no match so callers fall back to plain text.

## Testing

Extend `apps/knowledge/src/protocols/view.test.ts` (vitest, jsdom) with unit tests for the three helpers above (bucket boundaries, fork match/no-match/partial-match cases, staged filename construction) and an integration-style test that `applySession`/`sessionView` still render one card matching the current speaker and produce the right number of scrubber dots. Visual verification via local dev server + browser (same approach used for the earlier desktop-scroll fix), since this repo has no automated visual regression tooling.

## Follow-ups (not part of this change)

- Backend: reduce/eliminate the raw `{"text":"..."}` JSON leaking into turn text.
- Backend: prompt behavior so personas ask more clarifying questions before answering.
- Art: drop the chosen dawn/dusk/night renders into `public/assets/cognitive-protocols/backgrounds/` per protocol, named `{id}-background-dawn.png` / `-dusk.png` / `-night.png`. Nothing else changes — they pick up automatically once present.
