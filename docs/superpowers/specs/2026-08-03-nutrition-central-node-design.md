# Nutrition and Central Node Tabs — Design

## Purpose

`Nutrition` and `Central Node` are currently placeholder nav buttons (`app-controller.js`) that show "This section arrives in a later Life Hub phase." This phase builds both out as full, read-only-plus-chat dashboards, following Home's existing pattern: render already-synced GitHub data, no direct editing UI — all writes still happen through Chat with an agent.

Both tabs also get an embedded chat panel scoped to that domain's agent, so Adam doesn't have to flick to the separate Chat tab mid-task. The two tabs are built together because they share almost all of their new infrastructure (embedded chat, per-agent colour theming, chart components); only their data source and card content differ.

## Shared conversation, not shared UI

Nutrition's embedded chat, Central Node's embedded chat, and the main Chat tab must all read and write **one transcript** — switching tabs should feel like continuing the same conversation, not starting three.

The existing `createChatController` (`js/app/chat-controller.js`) is a single instance bound to `document`, holding `transcript`/`lastAgentSlug` in closure and querying fixed DOM ids (`#chat-messages`, `#chat-form`, etc.). Rather than instantiating three controllers with separately-scoped ids (which would fragment history unless we also lifted state into a shared store), we keep the **single existing instance and its single DOM subtree**, and physically move that subtree into whichever container is active:

- The Chat tab keeps its current full-page `#chat-view` slot.
- Nutrition and Central Node each get a lightweight floating button (bottom-right) that, on click, moves the same `#chat-view` node into a slide-over panel positioned over that tab's content (Option B from mockups — not a persistent docked rail). Closing it returns the node to a hidden holding spot (or back to the Chat tab's slot).

Because it is the same DOM node and the same controller closure, transcript, scroll position, and in-flight streaming all carry over automatically — zero changes needed to `chat-controller.js`'s or `render-chat.js`'s internals for history sharing itself.

### Default agent per tab (sticky-hint fallback only)

Nutrition's panel should default to **Brisket**; Central Node's to **Hammond** — but only as a fallback, never overriding a real recent exchange. `chat-controller.js`'s `stickyAgentSlug()` already returns `undefined` when there's no agent reply within the last 20 minutes; we add an optional `getDefaultAgentSlug()` dependency that `stickyAgentSlug()` falls back to *only* when it would otherwise return `undefined`:

```js
function stickyAgentSlug() {
  if (lastAgentSlug && lastAgentSlug !== 'router' && now() - lastAgentAt <= HISTORY_WINDOW_MS) {
    return lastAgentSlug;
  }
  return getDefaultAgentSlug?.();
}
```

`main.js` passes a closure that reads "which tab's chat panel is currently open" and returns `'brisket'` / `'hammond'` / `undefined` accordingly. This preserves the existing 20-minute real-stickiness behaviour exactly; it only fills the gap when nothing more specific applies. An explicit name in the message still always wins (unchanged, in `agent-directory.mjs`'s `routeAgent`).

## Per-agent colour theming

`config/agents.yml` already has a confirmed `colour` per agent (`brisket: #F0B843`, `hammond: #142B51` marked `provisional_until_cover_migration`) and is already allowlisted for sync (`repo-policy.mjs`'s `CONFIG_PATHS`) — but nothing currently reads its *content* client-side; `load-live-events.js`'s `parseFiles` validates it as YAML and discards it. We extend `parseFiles`/`loadLiveEvents` to also return the parsed `agentsConfig`, and expose an `agentColour(slug)` lookup used to set a `--agent-accent` CSS custom property on the slide-over panel root when it opens for a given tab. This is the "Clinical Glass + accent" style validated in mockups: the app's existing white/glass shell everywhere, with the accent stripe, agent name, and sent-message bubble tinted per agent.

The panel's accent reflects the *tab it was opened from* (Brisket's amber on Nutrition, Hammond's graphite on Central Node) as a static theme for that panel session — it does not re-theme mid-conversation if a different agent happens to reply (e.g. naming Chadwick while the Nutrition panel is open). Re-theming per actual replying agent is explicitly out of scope; the tab context is what's being themed, not the live routing decision.

Hammond's colour is confirmed from his Notion page cover (dark charcoal/graphite with strategy iconography — compass, scales, trophy) as **`#3A3A42`**. The local fixture `config/agents.yml` (used by `mock-api.mjs` and `agents-config.test.js`) is updated to this value with `colour_source: confirmed`. The *production* value lives in the private data repo, outside this codebase — Adam updates it there himself; the mechanism picks it up automatically once he does. Until then, production will keep rendering Hammond's panel in the current provisional navy, which the code must not treat as an error — a `colour_source` field is descriptive metadata only, not validated.

## Central Node: getting the browser the data

`central-node.md` is fetched today only inside `chat.mjs` (server-side, for system-prompt context) and never reaches the browser. To render it as a tab:

- Add `'central-node.md'` to `repo-policy.mjs`'s `CONFIG_PATHS` (bypasses the `data/`-domain date-range filter the same way `config/agents.yml` already does).
- Extend `load-live-events.js`'s `createValidator` and `parseFiles` to recognise `central-node.md` as raw markdown (not YAML, not an event document) and return its content as a new `centralNodeMarkdown` field on the `loadLiveEvents` result.
- Add a `central-node.md` fixture to `scripts/mock-api.mjs`'s local source list and `tests/fixtures/valid/`.

This reuses Home's existing manifest+blob sync exactly as-is — same GitHub API calls already made every ~10 minutes while the app is open (or on manual refresh), same offline cache. It adds one more small file to an existing batch; it does not add a new function, a new sync cadence, a Netlify deploy, or any Anthropic API call. Sending the full document to the authenticated browser is not a new privacy boundary: comparably sensitive data (weight, body composition, diary mood) already flows through this identical sync+cache path for Home, and the *content* of central-node.md already reaches the browser indirectly today, quoted back through chat replies.

### Section extraction becomes shared, not server-only

`netlify/functions/_shared/constraints.mjs`'s `extractSection` and friends are pure string parsing with no server-only dependency. We relocate this file to `js/core/constraints.js` and update `chat.mjs`/`chat-confirm.mjs`'s imports accordingly — the browser and the server now share one implementation instead of duplicating parsing logic. We add two more extractors alongside the existing four: `extractThisWeek`, `extractThisMonth` (matching central-node.md's `## 📅 This Week` / `## 📊 This Month` headings).

## Nutrition tab

**Data** (`js/app/nutrition-model.js`, new): built from the same `events`/`targetsConfig` Home already loads (no new fetch) —

- Today's full macro set via `aggregateNutrition`: calories, protein, fat, **plus sodium, calcium, polyphenol score** (Home only surfaces the first three) and the per-meal breakdown (`meals.breakfast/lunch/dinner/snack`) `aggregateNutrition` already computes but Home doesn't render.
- Today's day type (`resolveDayType`) and the **full target profile** for it via `getDayTargets` (calorie/protein/fat-ceiling/sodium-ceiling/calcium-target/polyphenol-aim, plus per-meal protein minimums) — all already-existing logic, just not yet surfaced anywhere.
- A 7-day daily series (one point per day: totals + whether that day's own target was met) built with `enumerateDateKeys`/`addCalendarDays` over the trailing week.
- A month-length daily series (hit/miss density) the same way, for the heatmap.
- A week-over-week protein comparison badge using `js/core/trends.js`'s `comparePeriods` (this module already exists, fully implemented and tested, but currently unused anywhere in the app — this is its first real consumer).

**Charts** (new small SVG components, hand-rolled — no charting library, keeping the app's zero-runtime-dependency, offline-safe architecture intact):

- **7-day trend**: smooth gradient line + soft area fill, dashed target line, highlighted latest point (validated in mockups).
- **7-day hit/miss strip**: rounded bars, one per day, orange when that day's protein target was met.
- **Month overview**: calendar-heatmap grid, one tile per day, colour intensity by closeness to target.

**Layout**: metric cards reusing Home's existing `.metric-card` styling (energy/protein/fat/sodium/calcium/polyphenol), a meal-by-meal breakdown list, the three charts, and the floating Brisket-accented chat button.

## Central Node tab

**Data**: `centralNodeMarkdown` parsed via the shared `js/core/constraints.js` extractors into its sections, no emoji (per feedback — icons/emphasis via colour and typography instead, matching the rest of the app's style).

**Cards**, each reusing Home's card styling:

1. **Today's Status** — the extracted text, plus a **logging-completion ring** (already-computed `getLoggingCompleteness`, 3/5-style donut, no new logic).
2. **This Week** — extracted text, plus the **same 7-day protein sparkline component** built for Nutrition (shared, not duplicated).
3. **This Month** — extracted text, plus a **daily logging-density heatmap** (same heatmap component as Nutrition, different underlying series).
4. **Long-Term Trends** — replaces today's pure-prose duplication with two charts, since this is the specific "track it long-term in graph form" ask:
   - **Exercise consistency**: a month heatmap of completed-workout days, from the same `workout` records `calculateWorkoutStreak` already reads.
   - **Eating target consistency**: a month heatmap (or the rounded-bar strip) of days that hit the protein target / stayed under the fat ceiling, from the same nutrition aggregation Nutrition's tab uses.
   - A short caption under each (one line, not the current multi-paragraph prose) can still surface an agent-written qualitative note if present, but the chart carries the section now.
5. **Cross-Agent Coordination** — plain text list (inherently a log, not a metric — stays text, per feedback).
6. **Recent Agent Actions** — plain text list, 48-hour window (same reasoning).
7. **Constraints & Priorities** — collapsed `<details>` by default (Option A, confirmed) given how dense the medical/dietary detail is; everything else open. Rendered through the same safe inline-markdown renderer pattern `render-chat.js` already uses (`renderInlineMarkdown`) — never raw HTML injection, extended to also handle bullet-list lines since Constraints is heavily list-structured.

Floating chat button uses Hammond's accent (`#3A3A42`, provisional).

## App wiring

`app-controller.js` currently routes any `data-section` other than `home`/`chat` to a generic "coming later" toast (lines 57–64). `nutrition` and `central-node` are removed from that generic list and get their own `showSection` handling (toggle their dashboard sections, update `SECTION_TITLES`), each building its model from the already-loaded `events`/`targetsConfig`/`centralNodeMarkdown`/`agentsConfig` (no new fetch on tab switch — this data is already resident from Home's load).

`service-worker.js`'s `PRECACHE_URLS` and `CACHE_NAME` need the new modules added and bumped, exactly as Phase 4 did for the chat modules (documented failure mode in `IMPLEMENTATION_STATUS.md`: forgetting this breaks offline reload).

## Testing

- Unit: `nutrition-model.test.js`, `central-node-model.test.js` (or extend `home-model.test.js`'s siblings), chart-data-shape tests (no DOM), `constraints.test.js` updated for its new location + two new extractors, `repo-policy.test.js` + `load-live-events.test.js` extended for `central-node.md`, `chat-controller.test.js` extended for the default-agent-hint fallback (confirming real stickiness still wins over the hint, and the hint only applies when the window has lapsed or no agent has spoken yet).
- Integration: `chat.mjs`/`chat-confirm.mjs` tests updated for the relocated constraints import (behaviour unchanged).
- Browser (`tests/browser`): Nutrition and Central Node tabs render expected values from fixtures; embedded chat opens themed correctly per tab; offline reload still works after the precache bump.

## Out of scope (explicitly deferred)

- Editing Central Node or logging nutrition directly from these tabs (chat + confirm flow remains the only write path).
- Fitness/Body/Mind/Skincare tabs (same placeholder as today).
- Any change to Anthropic/chat cost profile — nothing here calls the model more often or differently.
