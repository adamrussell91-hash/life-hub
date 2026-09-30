# Calendar: Day Sense

> Revised brief (29/09/26). It starts from ChatGPT Astra's "context-aware, ADHD-aware
> assistant" brief and keeps its honesty rules and its Friday acceptance test word for
> word in spirit. It changes three things: **you see the day before anyone asks you
> about it**, **questions are batched onto the train home**, and **dexamphetamine timing
> is a first-class input**. All of it is in scope; the order below is build order, not a
> wishlist.

## 1. The idea in one paragraph

Almanac works because it shows what is missing before you think to ask. Day Sense does
the same for today and this week. The Day dial and the Week show **the plan, what
actually happened, and what no longer fits**, all in shapes you read in a glance. When
the day changes, one tap ("Day changed") re-flows it as ghost blocks you accept once.
Questions that improve the model wait for the 10 minutes on the train home. Life Hub
never pretends to know what it cannot see.

## 2. Honesty rules (kept from Astra, non-negotiable)

- Missing data means unknown. No response means unknown, never a refusal.
- A block that ended is not work that happened. Never mark a task done because time passed.
- A free gap is not focus time. A social choice (lunch with a friend) is not a failure and is never "optimised" away.
- One correction is not a pattern. Illness lowers confidence in the plan; it never produces a diagnosis or medical advice.
- Every consequential inference shows its evidence and confidence.
- Restricted school systems (Outlook, reports system) stay outside the architecture.
- Ordinary calculations keep working when the AI provider is down.
- No recurring AI job. Deterministic rules run in the existing 05:30 sweep and on writes; AI only interprets occasional free text or composes a rescue.

## 3. What is new versus Astra's brief

### 3.1 The visual layer (the main addition)

Every feature below has a picture first and a prompt second. If the picture makes the
point, there is no prompt.

**Day dial**

| Shape | Shows | Replaces |
|---|---|---|
| **Plan vs actual.** Planned blocks as outlines; what actually happened fills in behind the now-hand (work sessions from Tasks, logs, accepted rescues). | Drift, at a glance, by 3 pm | "What happened?" prompts during the day |
| **Overflow spill.** Remaining plan laid end to end from *now*. What does not fit before lights-out spills past it in High Sea orange, labelled "doesn't fit: Marking, UNYouth". | "The plan has become implausible" | A notification |
| **Leave-by wedge.** A shaded slice from start-getting-ready → leave-by → departure, narrowing as it nears. "Need 10 minutes" redraws the wedge and the arrival time. | Transport thresholds | A countdown alert |
| **Medication curve.** A soft band inside the event ring: dex taken → effective → waning, from your logged time. Missing dose = no band plus a gap marker, not a guess. | Within-day capacity | A flat daily % |
| **Time textures.** Interruptible school time speckled; callback-wait dotted; travel striped; recovery plain wash. | Why 2 h is not 2 h of marking | A label on every block |
| **Rescue morph.** "Day changed" animates blocks from where they were to the proposed places (motion engine, reduced-motion = instant). One Accept. One receipt. | Several separate proposals | — |
| **Bookmark on the arc.** The last line of the bookmark sits on the task's arc/callout ("stopped at Q4 feedback"). | Reconstructing where you were | — |

**Week (Tideline)**

- **"What this day costs you"** under each day header: `63% forecast · 4½ h booked · move Marking to Fri (74%) keeps your evening`. The clause is a link that highlights the ghost that would do it.
- **Ghost time-blocks** for open tasks with estimates, placed into the best-capacity free slots before the due date (extends the 05:30 deadline-runway ghosts from 48 h to the whole runway). Max one or two a day. Never into Corey or walls. Never on days forecast under 40%.
- Same textures as the dial on the bands, so the week reads the same way.
- The Due row carries the bookmark's first words and the count progress ("16 of 28 reports").

**Term / Almanac**

- The Almanac capacity line gains the medication-adherence and binge-risk context (see 3.3) as an honest overlay: days after a missed dose are drawn with a lighter forecast band, not a lower number.

Visual rules: kit tokens only, both themes, 390 px checked, no motion without
reduced-motion parity, every shape has an aria-label and a keyboard route.

### 3.2 The train-home pass (replaces per-session prompts)

- **When:** when the homebound service from school departs (from the transport provider), or the leave-school time from the day profile if no journey is known. At most once a day. Never on weekends unless a work block ran.
- **What:** one screen, about 60 seconds, big targets, thumb-reachable:
  1. The dial with plan-vs-actual already drawn. "Anything wrong?" Drag a block, or tap to fix.
  2. For each block that mattered (a count-progress task, or one whose estimate is on a deadline's critical path): **Mostly worked · Mixed/interrupted · Blocked · Didn't start**. Nothing else is asked.
  3. Any open task without a bookmark: one line, typed or dictated. Skippable.
  4. Tomorrow's first block and leave-by, shown, not asked.
- Ignored = unknown. The pass is still there on the next open, then expires at midnight. It never nags twice.

During the day, prompts are limited to: a fixed event about to interrupt a bookmarked
block (one tap: "Add bookmark"), a leave-by threshold, and anything you started yourself.

### 3.3 Dexamphetamine as a first-class input

You have said the timing may be shared with all agents and that a missed dose drives
night-time binge eating. So:

- **Log it in one tap** from the Day dial (and the phone sheet): *Taken now · Taken at… · Skipped today*. The usual time comes from your pattern, not a setting you maintain.
- **Pre-emptive, not after the fact.** If no dose is logged 30 minutes after your usual time, one prompt: *Take it now · Already taken · Skipping today*. It is the only medication prompt, and it follows the notification cap (a user mute beats it).
- **What it changes:**
  - The dial's medication curve and the within-day capacity. Heavy, repetitive work (marking) is not proposed into the waning or missed window.
  - **Evening plan (Sara + Nutrition):** on a missed or late day, a planned dinner time and a planned evening snack are added to the dial as protected blocks, before the danger window, with no judgement in the copy ("Dinner at 6:15 tonight, planned"). This is support, not tracking: nothing is scored.
  - Capacity and the Almanac forecast treat a missed dose as lower confidence, not a lower number, until there is enough history to say otherwise.
- **Honesty:** missing log = unknown, never "skipped". No medical advice, no dose suggestions.

### 3.4 Data you have now given access to

- **iCloud calendars (4):** work, social, family, health appointments. They are
  published webcal feeds: the URL is the password. They are stored only as server
  secrets (`ICAL_FEED_WORK`, `ICAL_FEED_SOCIAL`, `ICAL_FEED_FAMILY`, `ICAL_FEED_HEALTH`),
  never in the repo, the client or logs. The server fetches them on demand when a signed-in
  calendar opens (at most every 15 minutes; Blob cache). The 05:30 sweep reads that cache
  only — it does not hit iCloud. Expands repeats, converts to Sydney time, and
  feeds them to every hub calendar as a read-only source with its own filter chip. Health
  appointments map to the Health lane; social and family become fixed commitments for
  Rescue and the leave-by planner. (Read-only: Life Hub never writes back to iCloud.)
- **Mio:** you have an MCP connection. That lets Claude reach Mio in a chat; the Life
  Hub server needs its own credential to read it. First step: list the real Mio tools and
  whether a server token is available. If not, opportunity matching runs when you ask
  Claude, not in the background. Mio stays the source of truth; Life Hub caches
  candidates, never copies the saved-places database.
- **Transport:** Transport for NSW Open Data (Trip Planner, realtime) with a free API
  key. If realtime is unavailable, a labelled timetable estimate. No scraping.
- **Push:** Life Hub is on your Home Screen, so iOS web push works. iOS web notifications
  do not show custom action buttons, so every notification opens a full-screen action
  sheet with 2–4 large buttons and a "Tell me" (type or dictate) field. Verify on your
  phone in the first slice.

### 3.5 Kept from Astra (compressed)

- **Rescue the changed day:** Running late · Got derailed · Feeling worse · Plans changed · Tell me. Hammond coordinates; one proposal set; one receipt. Fixed commitments never move; protected time moves only if you say so; unfinished work stays unfinished.
- **Availability types:** fixed, protected, focus, interruptible, callback_wait, transition, travel, recovery, as properties of time spans (and task resumability: can stop quickly / needs a run-up / unknown). Shown as textures (3.1), explained in the card when they affect a suggestion.
- **Ready-to-resume bookmarks** on tasks and work sessions (use the real Tasks schema: `work_session`, task `page_blocks`), latest bookmark shown wherever the task appears.
- **Duration as ranges** from count progress, separating elapsed / productive / blocked / interrupted time. A reporting-system failure is a blocker, never "reports take longer". Task-specific maximum continuous block (marking caps at a length you set).
- **Fragility check** before a new commitment: "fits only at your fastest pace; at your usual pace it takes Thursday evening."
- **Dependencies:** explicit blockers affect scheduling; inferred ones are proposed for confirmation first; ranked by what they unlock.
- **Regained time:** when you drop a recurring commitment, the freed span remembers why; a new commitment in it shows the term-level cost. Advisory only.
- **Mio opportunities** on journeys you are already making, with a real gap and opening hours, no guilt if declined.
- **Notification policy:** scarce, per-category cooldowns, daily cap, mute always wins.

## 4. Build order

Each slice ships on its own and makes the Friday scenario measurably better.

1. **Almanac saved copy + Not going / Not doing / Move** (this PR). Fast open; you can drop UNSW.
2. **iCal feeds** as a read-only hub source (server secrets, cache, filter chips, all views).
3. **Dex log + medication curve + evening plan** (dial, capacity, Sara/Nutrition).
4. **Plan vs actual + overflow spill** on the dial; **"costs you" line** on the Week.
5. **Rescue** ("Day changed") with the morph, Hammond coordination, one receipt.
6. **Train-home pass** + **push** (Home Screen web app, action sheet, cap and cooldowns).
7. **Bookmarks** (prompted at interruptions, shown on arcs and Due rows).
8. **Ghost time-blocking** across the runway + availability textures + resumability.
9. **Transport leave-by** (TfNSW provider, wedge, "Need 10 minutes").
10. **Duration ranges + fragility check**, **dependencies**, **regained time**.
11. **Mio opportunities** (after the tool check in 3.4).

## 5. Acceptance: Friday

Keep Astra's Friday scenario as the central fixture (`tests/fixtures/day-sense/friday/`)
and add three checks:

- The dial at 1 pm shows plan vs actual and the overflow spill without any prompt having fired.
- The missed 4 pm dose shows as a gap on the medication band; dinner and an evening snack appear as planned blocks; nothing says "you forgot".
- The train-home pass asks at most four questions, and ignoring it leaves every estimate unchanged.

## 6. Failure modes to check (CURSOR-UI-FAILURES)

- **C1** (labels collide): the overflow label, leave-by wedge label and callouts share the dial's callout layout; no overlaps at 620 and 860 px.
- **C2** (decorative band standing in for data): the medication band is drawn only from a logged dose; no log, no band.
- **D1** (made-up precision): durations are ranges until clean observations exist; the receipt says "about".
- **D6** (metric from partial input): capacity with a missing dose log reads "unknown", not a number.
- **I3** (dead controls): every shape on the dial opens something or says why not.
- **R3 / R4** (390 px, iPhone form zoom): the action sheet and train-home pass are phone-first; inputs 16 px.
- **V5** (save failure hides the reason): every rescue/accept failure shows the server's reason and leaves the plan as it was.
- **W2** (works in tests, not wired): the Friday fixture runs through the real `mountHubCalendar` and the real ghost confirmation endpoint.
- **P3** (silent half-fix): each slice is checked against the Friday scenario, live, not only by unit tests.
