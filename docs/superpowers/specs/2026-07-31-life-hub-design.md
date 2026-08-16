# Life Hub Design

Date: 31 July 2026 (Charts section updated 16 August 2026)  
Status: Approved  
Source of truth: [Life Hub App](https://www.notion.so/3adf794f847680eda2bbf184ce894090)

## Product intent

Life Hub is a private, responsive personal dashboard and conversational logging app. It replaces the Notion Life Hub 2.0 for nutrition, fitness, body composition, body measurements, weight, sleep, heart, mood, diary, skincare, fragrance, the Central Node, and the seven launch personalities.

The product is designed for equal use on desktop and iPhone. The GitHub repository is the only durable application data store. Historical data will be added later as hand-written Markdown events, so records remain simple, discoverable, portable, and human-readable.

The first release excludes medical records, tasks, communications, teaching, detailed finance, nudges, notifications, scheduled jobs, goals, a Daily Score, an in-app editor for old logs, automated wearable ingestion, and an offline write queue.

## Delivery approach

The app will follow the Notion specification rather than reinterpret it. Development uses fixtures and mocked providers first. Production GitHub, Anthropic, Resend, Day One, and Netlify credentials are connected only after automated and browser acceptance tests pass.

Work is split into reviewable commits and feature branches. The repository maintains implementation status, independent review findings, and a credential-rotation runbook. Production promotion requires a clean test suite, no unresolved high-severity review findings, no exposed secrets, and successful mobile and desktop acceptance checks.

## System architecture

The browser contains a static Progressive Web App built with semantic HTML, CSS, vanilla JavaScript modules, a shared SVG `chart-kit`, and a YAML parser. It has no application framework, no Chart.js (or other chart runtime), and no compilation step. The browser is presentation-only: it renders sanitized repository content, calculates view models, maintains ephemeral chat state, and requests authenticated server operations.

Netlify hosts the static app and same-origin serverless functions:

- `auth` and `session` validate a passphrase and issue a short-lived, signed, Secure, HttpOnly, SameSite cookie.
- `repo` exposes authenticated, allowlisted, read-only repository discovery to the browser.
- `chat` routes the requested personality, assembles private context, streams Anthropic responses, validates model tool calls, and performs server-side file operations.
- `dayone` sends a completed diary entry through Resend after an authenticated Penelope action.
- `health` verifies GitHub access and reports impending token expiry or last-known provider authentication failures.

The private GitHub repository stores application code, configuration, agent instructions, the Central Node, derived agent outputs, and event files. No token, raw passphrase, prompt, provider error, or Day One address is exposed to browser code or logs.

## Repository boundaries

Event records use the canonical path:

`data/<domain>[/<subdomain>]/YYYY/MM/YYYY-MM-DD-<slug>[-HHMMSS].md`

Each new event contains YAML frontmatter followed by an optional Markdown body. Common metadata is `schema_version`, globally unique `id`, `type`, `date`, `time`, `created_at`, `updated_at`, and `source`. Timestamps always carry the actual `Australia/Sydney` offset. `created_at` never changes.

Source events are append-oriented. A deliberate correction updates only the matching event using its current GitHub SHA. Derived files such as `central-node.md`, Brisket's daily advice, and Chadwick's programming are mutable with optimistic concurrency.

Server file tools normalize paths, reject traversal and URLs, and permit writes only under `data/`, approved mutable agent-output paths, and `central-node.md`. Ordinary conversations cannot modify personality instruction files.

## Data flow

On authenticated load, the client requests only the date range and summaries required by the active view. The server discovers relevant files using a cached Git tree or equivalent manifest keyed by the branch commit SHA or ETag. Older periods load lazily.

The client parses validated event files into domain-neutral records and derives daily totals, target comparisons, streaks, trends, strength progression, calendar markers, completeness, period comparisons, and search data. Additive measures use zero for empty days. Observational measures use `null`; charts preserve gaps and never invent health values.

Every two minutes, and on manual refresh, the client first compares the branch SHA or ETag. It downloads only changed files. A successful chat write returns sanitized path, domain, type, and new commit metadata so the client can invalidate and refresh the affected domain immediately.

Multi-file chat actions are ordered: source event first, derived output second, Central Node directive last. If a later step fails, the source event remains valid and the UI reports partial success with an idempotent retry. Reusing an event ID never creates a duplicate.

## Targets and time rules

All date grouping, week boundaries, filenames, relative dates, and current-day decisions use the IANA time zone `Australia/Sydney`. Weeks begin Monday. Automated tests cover both daylight-saving transitions.

Targets live in effective-dated sets in `config/targets.yml`. For a Sydney date, calculations use the latest set whose `valid_from` is on or before that date. New targets are appended; old target sets are never edited or deleted. Initial values are:

- Calories: movement 1,660 kcal; 30-minute workout 1,900 kcal; 45–60-minute workout 2,200 kcal; next-day recovery bonus 200 kcal.
- Protein: 120 g daily or 140 g on a recovery day; meal planning targets of breakfast 30 g, lunch 30 g, dinner 40 g, snack 20 g, with 25 g minimum per meal.
- Fat: under 50 g daily.
- Sodium: under 2,000 mg daily.
- Calcium: 1,000 mg daily from non-dairy sources.
- Polyphenols: meal score 0–10 and daily sum target of at least 10.

The highest completed workout level determines a day's type. Only completed workout days contribute to a streak, and multiple completed sessions on one day count once. A recovery flag affects the next Sydney calendar day only.

## Personality system

Launch personalities are Brisket Lasso, Chadwick Flexington, Hyaluronica St. Claire, Penelope Rose Quillian, Dr Sara Tonin, Dr Vera Lenz, and General Hammond. Their migrated Notion instruction pages are the authoritative voice, routing, coordination, and file-closing rules.

Routing precedence is:

1. The first explicitly named personality responds; other explicitly named personalities become collaborators in context.
2. Otherwise, function triggers select the matching personality.
3. A tie or low-confidence match asks the user to choose rather than blending voices.

Each response loads the base prompt, routed instructions, Central Node, today's relevant logs, and a bounded recent-history digest. Brisket receives seven days of meals, Chadwick fourteen days of workouts, Penelope metadata for the latest three diary entries without diary prose, Sara the latest two body observations plus recent sleep and heart data, and Hyaluronica seven days of routines plus recent skin and fragrance context. Digests are server-generated, approximately 3,000 characters maximum, and oldest entries are dropped first.

Chat lives only in memory and session storage for the current browser session. Consequential outcomes are durable files. The UI states once per device that conversations are not saved while logs, advice, and session notes are.

## Interface design

The visual system follows the Clinical Glass guide: Warm White `#FAF8F2`, Depth `#0A1536`, Marine `#142B51`, Wave `#376FB7`, restrained High Sea `#F68620`, Inter typography, tabular numerals, translucent panels, fine borders, restrained blur, and soft cool shadows. Glass establishes hierarchy without reducing legibility.

Desktop uses a fixed Depth navigation rail with Home, Chat, Nutrition, Fitness, Body, Mind, Skincare, Calendar, and Central Node. iPhone uses a bottom bar for Home, Chat, Calendar, and More; More opens the remaining domains in a glass sheet. Touch targets are at least 44 px and the interface has no horizontal overflow at 390 px.

Home leads with calories, protein, fat, workout, and five-category logging completeness. Supporting views show meal calories, protein distribution, polyphenols, and a week strip. Domain cards link directly to focused detail.

Nutrition provides meal timelines, daily advice, weekly target comparisons, and monthly trends. Fitness provides session detail, coverage, streaks, active constraints, and all-time top-set strength progression. Body combines weight, composition, measurements, and a Labs / Bloods subpage (pathology trends). Mind combines mood, energy, diary entries, tag frequency, and Vera session records. Skincare combines AM/PM completion, product use, condition notes, and fragrance. Calendar combines week and month views, domain markers, local AND-term search, lazy history extension, and a complete day-detail sheet. Central Node is read-only with anchors, coordination lists, and a stale-status action. Chat is full-height, streaming, persona-labelled, colour-themed, and confirms writes with quiet system lines.

Body and Mind support Daily, Weekly, Monthly, 6M, and 1Y ranges. Nutrition supports Daily, Weekly, and Monthly. Fitness strength remains all-time. Periods longer than 90 days use weekly means of available observations, preserve empty-week gaps, and render no more than approximately 120 points per line.

## Charts (Clinical Glass)

Living overview of how every Life Hub chart should look. Product charts live in the hub (`js/app/chart-kit/` plus domain renderers). Chrome stays in the hub design kit. Use closed tokens only: `--wave`, `--marine`, `--success`, `--danger`, `--high-sea-ink`, `--pastel-sage`, `--shore`, `--muted`. No maroon Bloods palette. `prefers-reduced-motion: reduce` snaps to the final geometry.

**Motion:** fill-on-load or path reveal once (`cubic-bezier(.2,.8,.2,1)`). No looping “alive” animation. Replay on refresh or range change.

**Trend colour** always travels with an arrow and a text label (see Trends and feedback). Colour is never the only signal.

### Kit primitives

| Primitive | File | Look | Where |
|---|---|---|---|
| Ring target | `ring.js` / `apply-ring.js` | Rounded track + `--success` or domain accent fill; centre value | Home macros, Nutrition macros, Central Node completeness, Bloods in-range, Mind streak |
| Area line | `area-line.js` | Soft area + Wave stroke; optional sage reference **band**; optional **vertex dots** | Nutrition protein (no dots); Body scale/composition (small dots); Bloods series (dots + sage band) |
| Columns | `columns.js` | Bars grow from 0; dual-tone week compare | Nutrition, Fitness volume |
| Heatmap / hit strip | `heatmap.js` | Soft-medical tiles, not a new palette | Nutrition month, Fitness consistency, Skincare. **Not** Mind (cadence heatmap removed 16 Aug 2026) |
| Pie / donut | `pie.js` | Kit pastels; legend with counts | Mind mood mix |
| Masonry packer | `masonry.js` | Packing only, not a visual system | Mind board |
| Stream / Sankey / chord / bump / horizon / radial year | `stream.js`, `sankey-flow.js`, `chord-layout.js`, `bump.js`, `horizon.js`, `radial-year.js` + vendored d3 | Clinical Glass strokes and pastels; one-line legend on the tile | Mind v2 analysis tiles |

Vendored d3 is layout only (no CDN). Do not add another chart library.

### Vertex dots vs empty lines

| Surface | Dots on the line | Reference band |
|---|---|---|
| Nutrition 7-day protein | **None** (soft area only; no end-circle) | No lab band |
| Body weight / composition / tape charts | Small vertices (`r` 2.5) on each observation | No pathology band |
| Bloods series (≥3 numeric points) | **Dot on every vertex**; latest slightly larger; out-of-range latest uses `--danger` / `--high-sea-ink` | Sage `--pastel-sage` rectangle for current `ref_low`–`ref_high`; Wave stroke when in range |
| Bloods sparse (1–2 points) | Not a line. **Range track** (below) | Sage in-range segment on a `--shore` track |
| Bloods glucose / HbA1c | Line in **zoned** pastel bands (normal / at-risk / diabetic), not a single lab rectangle | Zone fills: sage / gold / peach |

Never draw a fat black bar, an empty 168 px hole, or a one-point “line” that looks like a slab.

### Bloods range track (sparse markers)

Used when `chartKind === 'range-bar'`.

- Full track: `--shore`, ~8 px, pill ends.
- In-range segment: `--pastel-sage` between labelled `ref_low` and `ref_high` (open high still labelled `In range <n`).
- **Latest:** solid dot — `--success` in range, `--danger` High, `--high-sea-ink` Low.
- **Previous:** ghost dot (marine ~20% opacity) on the same scale.
- **Arrow:** Wave, on the track, showing direction of travel. Omit ghost and arrow when there is only one point.
- Overflow High/Low sits on the shore **past** the sage segment so High cannot look in-range.
- Tile also shows a one-line “what this is”, status **In range** (never maroon “Normal”), previous value (`Was 242`), and date.

Copy never uses “stool” or “faecal”. Flag chips in the summary row are centred capsules (`align-items: center`), not Body tape chips.

Detail spec: `docs/superpowers/specs/2026-08-16-bloods-visual-restyle-design.md`.

### Mind tiles (summary)

Mind is a Clinical Glass masonry board. Conversation is **Chat only** — no Talk Vera/Penelope launchers on the tab. **No cadence heatmap.** Showing up is the 30-day streak ring. Every remaining tile has a question kicker, title, and either a real chart or an honest empty sentence (threshold + count). Session/insight cards are title + one line; full prose is the overlay sheet. Charts listed in `2026-08-15-mind-dashboard-v2-design.md` still exist as catalogue items; visual restyle: `2026-08-16-mind-visual-restyle-design.md`. Sparse data must not draw a fake filled shape.

### Fitness, Skincare, Home

Unchanged in spirit from the soft-medical pass: rings for targets, columns for volume/compare, heatmaps for consistency. Restyle with kit tokens if a stylesheet still hard-codes hex. Do not invent a per-tab palette.

## Trends and feedback

Trend meaning is metric-specific and configured. Weight, body fat, waist, fat, and sodium improve downward. Skeletal muscle, chest, shoulders, arms, protein progress, and streaks improve upward. Colour intensity communicates magnitude but always appears with an arrow and text label.

The first observation is neutral and labelled “First reading.” Trends compare with the previous observation, not the previous calendar day. When the previous observation is more than 60 days old, the label includes the comparison date. Weekly and monthly headline metrics compare with the immediately preceding complete period; missing prior periods receive a neutral “no prior data” label.

Failures use direct, recoverable language. Malformed files are skipped with a visible completeness warning. Offline mode displays cached data and disables mutation. GitHub, Claude, and Day One failures remain isolated so readable data stays available whenever possible. The Home status chip is hidden when systems are healthy and appears only for a provider failure or a GitHub token expiring within 14 days.

## Security and privacy

All server endpoints validate the signed session cookie. The raw passphrase is submitted only to authentication and is compared in constant time. The browser never stores it. Repository and model tool inputs are schema-validated. Unknown types, invalid dates, non-finite numbers, negative nutrition values, and malformed workout structures are rejected.

Markdown is untrusted input and is sanitized with an allowlist. Raw HTML, scripts, event handlers, and JavaScript URLs are prohibited. Browser responses contain only friendly error codes and sanitized metadata. Commit messages follow `lifehub(<domain>): <action> <event-id>` and contain no diary prose, health details, or secrets.

`DAYONE_EMAIL` is named symbolically in Penelope's instructions and resolved only from the Netlify environment. The actual address is never committed. `GITHUB_TOKEN_EXPIRES` is maintained with the GitHub token and checked at most hourly per device. Anthropic and Resend are not proactively pinged.

## PWA and offline behavior

The app ships a manifest, icons, and a service worker so it can be installed to an iPhone Home Screen and launch without Safari chrome. The service worker caches only the application shell and last successful read data. Offline state is visibly timestamped and read-only. There is no offline logging queue.

## Verification strategy

Unit tests cover frontmatter parsing, schema validation, Sydney dates and DST, effective-dated targets, step-function target lines, recovery days, empty additive values, null observations, streaks, trend semantics, polyphenol sums, strength top sets, routing precedence, digest caps, no-diary-prose behavior, repeat-event creation, search, lazy loading, downsampling, comparisons, ephemeral chat, and expiry warnings.

Integration tests cover authenticated reads, event creation, SHA-based correction, collision-safe paths, conflicts, partial failure and retry, mocked Day One dispatch, mocked Anthropic tool loops, malformed Markdown, XSS payloads, health state, and provider failure isolation.

End-to-end tests cover passphrase sign-in, desktop and 390 px navigation, all requested ranges, calendar markers and details, personality colour changes, immediate graph refresh after a meal write, strength progression, diary failure and resend, stale Central Node actions, search, and offline read-only state.

Tests use fixtures or a separate test repository. They never write production data, send real Day One email, or call paid AI services.

## Definition of done

The first release is complete when all specified domain views render correct fixture-derived values; missing and empty data follow their distinct rules; chat creates one valid, idempotent event and refreshes affected views; every supported trigger selects the correct voice and colour; ambiguous routing asks; all error states are recoverable; no secret appears in browser requests, source maps, bundles, repository files, or logs; accessibility checks have no critical findings; and the Netlify preview passes the complete automated and desktop/iPhone acceptance suite.

Production secrets are then supplied, the health and write pipelines are verified against the private repository, and the known-good preview is promoted. Rollback redeploys the prior app commit without rolling back data files.
