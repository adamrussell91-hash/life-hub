# Mind dashboard — design spec

Status: Approved. Implementation plan: `docs/superpowers/plans/2026-08-13-mind-dashboard.md`.

**Depends on:** `docs/superpowers/specs/2026-08-13-mind-session-memory-design.md`. That spec must ship first — this one assumes `mind_session` records, `Mind Insight` governance entries, Cross-Agent notes on diary/mind_session, diary `moods[]` / `energy` / `system_note`, and the Mind tab ambient line already exist. Until then, sections 8–10 below render their empty states.

## Goal

Rebuild the Mind tab from its current three-chart stub (mood score line, entries-by-mood, recurring themes) into a single-pane view of Adam's psychological state: mood and energy trends, Vera's session history, named Mind Insights, and the cross-agent signals already flowing through Central Node — surfaced with the same visual language as Body and Bloods, not a new design system.

## Scope

- Read-only. Extends the existing `#mind-dashboard` section (already has a nav entry — unlike Bloods, this isn't a hidden sub-page).
- Extends `js/app/mind-model.js` and `js/app/render-mind.js` in place; no rewrite.
- Wires extra inputs through `js/app/app-controller.js` (`latestResult` already has `governanceLogMarkdown` and `centralNodeMarkdown`).
- New hosts in `index.html`: `#mind-silence`, `#mind-energy-columns`, `#mind-sessions`, `#mind-insights`, `#mind-cross-agent`. New `.mind-session-card` in `css/app.css`. `CACHE_NAME` bump in `service-worker.js`.
- New data surfaced: `mind_session` records (theme, closing question, insight, mood at open/close, cross-agent note), Governance Log entries where `entryType === 'Mind Insight'`, Cross-Agent Coordination lines touching Vera/Penelope, and a silence chip when both diary and session gaps are >= 7 days.
- Consumes, does not re-specify: session-memory's `entriesByMood` `moods[]` counting, diary `energy` on `diaryEntries()`, and the ambient line near Vera (`model.ambient` → `[data-mind="ambient"]`).
- Out of scope: any write path. Logging stays conversation-first via Penelope/Vera, per the original Mind Tab decision (`2026-08-05-mind-tab-avatars-design.md`).

## Data model

No new record types. This dashboard only reads what the session-memory spec writes:

- `data/mind/<year>/<month>/<date>-<slug>.md` (`type: mind_session`) — `theme`, `closing_question`, `insight`, `mood_at_open`, `mood_at_close`, `cross_agent_note`.
- `data/diary/...` (`type: diary`) — `mood`, `moods[]`, `mood_score`, `energy`, `tags`, `system_note` (hidden — never shown on this dashboard), `cross_agent_note`.
- Full Governance Log markdown (not the 10-entry prompt tail), entries with `entryType === 'Mind Insight'`.
- Central Node Cross-Agent Coordination markdown via `extractCrossAgentCoordination` (`js/core/constraints.js`), lines matching `Vera→`, `Penelope→`, `→Vera`, `→Penelope`.

## App layer

### `mind-model.js` additions

- `sessionEntries(events)` — mirrors `diaryEntries()`: filters `record.type === 'mind_session'`, maps `{ date, theme, closingQuestion, insight, moodAtOpen, moodAtClose, crossAgentNote, path }`, sorted by date.
- `entriesByEnergy(entries, bounds)` — same shape as `entriesByMood`, keyed off diary `energy`. `ENERGY_ORDER = ['high', 'medium', 'low']` (matches `ENERGY_LEVELS` in `js/core/validate.js`).
- `daysSinceLastDiary(entries, date)` / `daysSinceLastMindSession(sessions, date)` — gap in calendar days via existing `daysBetween` (`js/core/time.js`). Measured against the full diary/session lists and `date` (today), **not** the range window — otherwise a Weekly view would hide an 8-day gap. Return `null` when there is no prior record (never logged). Names match the session-memory digest (`daysSinceLastEntry` / `daysSinceLastMindSession` on the server); do **not** reuse Chadwick's `daysSinceLastSession`.
- `silenceFlag(diaryGap, sessionGap)` — `true` only when **both** arguments are numbers and both are `>= 7`. `silenceFlag(null, null)`, `silenceFlag(12, null)`, and `silenceFlag(null, 9)` are all `false`. Same simultaneous-silence rule as the session-memory spec; no independent threshold.
- `mindInsights(governanceLogMarkdown, bounds)` — `parseGovernanceEntries` on the **full** log (do not call `recentGovernanceTail`; that cap is for Hammond's prompt, not this panel). Filter `entryType === 'Mind Insight'` and `dateKey` inside `bounds.from`/`bounds.to`. Same entry shape (`dateKey`, `title`, `body`, `status`).
- `mindCrossAgentLines(centralNodeMarkdown)` — `extractCrossAgentCoordination`, split into lines, keep lines containing any of `Vera→`, `Penelope→`, `→Vera`, `→Penelope`. **Not** range-filtered: those lines have no dates, and Central Node already keeps the section newest-first with a 12-line cap.
- Extend `buildMindModel({ events, date, range, governanceLogMarkdown, centralNodeMarkdown })` to return `{ ...existing, sessions, energyByLevel, insights, crossAgentLines, silence, daysSinceLastDiary, daysSinceLastMindSession }`. `sessions` and `insights` are already clipped to the range window; `crossAgentLines` is the current CN strip.

### `app-controller.js`

`renderMindSection` today passes `{ events, date, range }`. Pass `governanceLogMarkdown` and `centralNodeMarkdown` from `latestResult` as well.

### `render-mind.js` additions

Mirrors the existing `renderMoodChart` / `renderBarHost` pattern — new small render functions, not a rewrite:

- `renderEnergyChart` — same as `renderBarHost` for mood, host `#mind-energy-columns`. Column chart only; no energy line chart. Empty copy: `No energy entries in this range yet.`
- `renderSessionList` — host `#mind-sessions`, one `.mind-session-card` per Vera session in range, newest first.
- `renderInsightList` — host `#mind-insights`, one `.governance-entry`-styled block per Mind Insight, reusing the exact classes from `render-governance.js`.
- `renderCrossAgentStrip` — host `#mind-cross-agent`, short `<ul>` of one-liners, Vera/Penelope colour accents from `agent-avatars.js`.
- `renderSilenceBanner` — host `#mind-silence`. Renders **only** when `model.silence` is true. A `.bloods-flags`-style chip row, labelled plainly, e.g. "12 days since diary · 9 days since a Vera session." Hidden otherwise. Everyday gap copy stays on the session-memory ambient line near Vera; this banner is the dual-gap attention state only. Vera's tone: notice, don't alarm.

## Visual design

Same tokens as Body/Bloods — no new palette.

- Section chrome: `.dashboard`, `.section-heading`, `.section-kicker`, `#mind-heading` — unchanged (`Mood and themes`).
- Range control: existing `.body-range` Weekly/Monthly/6M toggle — unchanged. Governs charts, session cards, and insights. Does **not** govern the Cross-Agent strip or the silence chip (those are current-state, not windowed).
- Charts: `.metric-card.chart-card` wrapping `.line-chart.body-chart` (mood score only) and `.column-chart` (energy, mood, themes).
- Session cards: new `.mind-session-card`, a lighter `.metric-card` variant (`--glass` background, `--marine` heading, `--wave` date kicker). One card per session: date, theme as the title, closing question in a smaller/italic weight, insight (if present) picked out with `--high-sea` the way `.body-tape-chip[data-colour="red"]` uses accent colour for something worth noticing — not literally an alert colour. Vera accent `#263450` on the card edge.
- Mind Insights: the exact `.governance-entry` classes already defined for Central Node.
- Silence chip: `.bloods-flags` / `.bloods-flag` treatment, only when `silence` is true. Sparse-but-not-silent days stay on the ambient line (`metric-caption` near Vera).
- Agent colour: Vera `#263450`, Penelope `#8F373E` (from `agent-avatars.js`) — accent on session cards and cross-agent lines.
- `.mind-agents` button row stays at the bottom. Session-memory's `[data-mind="ambient"]` lives there; this spec does not move or replace it.

## Layout, top to bottom

1. **Header status line** — diary entry count only (existing `[data-mind="entry-count"]`). Not extended with silence copy.
2. **Range control** — Weekly / Monthly / 6M (existing).
3. **Silence chip** — new, only if both gaps `>= 7`; otherwise omitted.
4. **Mood score** — line chart (existing, unchanged).
5. **Energy** — new column chart, same visual grammar as mood distribution.
6. **Entries by mood** — column chart (existing; `moods[]` counting ships with session-memory).
7. **Recurring themes** — column chart (existing, unchanged).
8. **Vera sessions** — new: `.mind-session-card` list in range, newest first.
9. **Mind Insights** — new: `.governance-entry` feed, `Mind Insight` + in-range `dateKey`.
10. **Cross-Agent signals** — new: current Vera/Penelope one-liners, not range-clipped.
11. **Talk with Penelope / Talk with Vera** — existing button row, plus the session-memory ambient line.

## Error handling

- No `mind_session` files yet, or session-memory hasn't shipped: sections 8–10 render empty states rather than disappearing (`No sessions logged yet.` / `No governance entries yet.` — reuse `render-governance.js`'s exact empty-state copy and `.governance-empty` class / `No Vera or Penelope coordination lines yet.`).
- Never-logged (`null` gaps) is not silence. Empty states cover that; the chip does not.
- Same range window governs sessions and insights as the charts. No separate "all time" toggle in v1. Cross-Agent and silence are current-state.

## Testing

Follow existing conventions:

- `tests/unit/mind-model.test.js` — extend for `sessionEntries`, `entriesByEnergy`, `daysSinceLastDiary`, `daysSinceLastMindSession`, `silenceFlag` (both-null, one-null, one-below-7, both->=7), `mindInsights` (type filter + range; an 11th non-insight entry must not hide an in-range Mind Insight), `mindCrossAgentLines` (prefix keep/drop).
- `tests/unit/render-mind.test.js` — **create** (file does not exist today). Cover the five new render functions and their empty states; silence banner absent unless `silence` is true.
- Manual: range toggle still governs sessions/insights/charts and does not hide the Cross-Agent strip; silence chip appears/disappears at the 7-day boundary; Mind Insight feed uses the same `parseGovernanceEntries` shape Central Node's Governance Log uses (no second parser).

## Out of scope (future work)

- On-this-day excerpt — Penelope-only per the session-memory spec, belongs in chat, not the dashboard.
- Divergence detail (mood vs. session read) — stays a chat-only hypothesis per that spec, not dashboard UI.
- Replacing or duplicating the session-memory ambient line.
- Any write path / quick-log form — logging stays conversation-first.
- Quarterly two-voice retrospective output (5e/6b in the session-memory spec) — that's a chat artifact Hammond proposes, not a dashboard section.
