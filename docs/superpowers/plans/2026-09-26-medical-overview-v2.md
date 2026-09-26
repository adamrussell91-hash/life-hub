# Medical Overview v2: Health Brief + Threads strip + Weighted River (build brief for Cursor)

**Why this exists.** Adam described the current Medical Overview as "ugly and not useful". It is a flat list where "sore throat" looks exactly like "gastro appointment". It never shows the future. Sara's updates vanish into old cards. Lab results show as the chip "38 in". This brief rebuilds the page and fixes Sara's writing so that **anything Adam tells Sara shows up correctly on the page**.

Branch: `medical/overview-v2` (from `main`). One draft PR for the whole build. Adam merges it himself.

**Visual reference:** `docs/mockups/medical-overview-redesign.html`. Open it in a browser **before writing any CSS** and keep it open. Concept A is the river, B is the strip and C is the brief. §2 below says how they combine. If this brief and the mockup disagree, this brief wins.

---

## 0. Rules of engagement

### 0.1 Scope is locked
- Build every item in §3 (MO-01 … MO-34). Don't defer, stub or "follow-up" anything. If an item is impossible as written, **stop and ask Adam**.
- New problems you discover go in the ledger's **Discovered** section. Fix them now if they block an item; otherwise ask. Never reveal one for the first time in the final summary.

### 0.2 Progress is visible
1. **First commit:** add `docs/superpowers/progress/medical-v2.md`. It lists every item unticked, grouped by milestone, with empty **Discovered** and **Deviations** sections, and the header `Progress: 0/34 (0%)`.
2. Open a draft PR straight away; its body is the checklist.
3. After each item: tick it, record the SHA, update the %, then commit. After each milestone: sync the PR body and post one line: `M<n> done — x/34 — next: …`.

### 0.3 Definition of Done (per item)
- A test that failed before the change and passes after it.
- Any UI change is checked in a real browser at **1440px and 390px**, in **Safari (WebKit)** as well as Chromium. Adam uses Safari on a Mac and an iPhone.
- Tokens only: no new hex in chrome. Domain colours for the thread lanes may be hex constants in one `MEDICAL_THREAD_COLOURS` map.
- Dates use `formatDisplayDate` (dd/mm/yy), or relative text ("in 26 days").
- For the whole build: `npm test` has 0 failures, and there are screenshots in the PR (§5).

---

## 1. Read before coding

| File | Why |
|------|-----|
| `apps/life/js/app/medical-model.js` | Builds the view model. `buildMedicalModel`, `pack()`, `withHeadings`, the existing `band` item for episodes (line ~223), future/past split around `today`. |
| `apps/life/js/app/render-medical.js` | Current renderer. Keep the `bindOnce` / `filterCache` patterns. Lines ~386–399 are the "38 in" chip code you will replace. |
| `apps/life/js/app/medical-normalize.js` | `resolveMedicalLogCandidate` is the **root cause of the vanishing notes** (§3 MO-05). |
| `apps/life/js/app/render-bloods.js` | `markerRow()` / `markerBlock()` render a proper lab row with a range bar. **Reuse them. Do not rebuild a lab row.** |
| `netlify/functions/_shared/chat-schema.mjs` (`medical:` ~l.225) | The `log_entry` schema Sara writes. `episode` already exists but is never used. |
| `config/sara-protocol.md` | Sara's rulebook. §3 M1 rewrites the medical-logging section. |
| `netlify/functions/_shared/capabilities/shortcuts.mjs` (`create_task` ~l.405) | Used to wire Next items into Tasks. |
| `docs/superpowers/progress/goals-v2.md` | **Read the "Reopened (live review)" lines.** They are the mistakes §4 exists to stop. |
| `docs/AGENT_BEHAVIOUR_ACCEPTANCE.md` | Format for Sara behaviour tests. |

---

## 2. Locked decisions (Adam approved these on 26/09/26)

### 2.1 Page layout, top to bottom (desktop ≥ 1024px)

```
┌ page header (unchanged: eyebrow HISTORY, title, ← Body, date pill) ─────────────┐
├───────────────────────┬───────────────────────┬───────────────────────┤
│ 1. HEALTH BRIEF       │ 2. ACTIVE EPISODE     │ 3. NEXT               │  ← three equal cards,
│ Stelara cycle meter   │ 🤧 Head cold · day 4  │ Book MRCP   action    │    one row, equal height
│ Watch: GGT 233 ↑      │ latest note + date    │ Stelara     26 days   │
│ Sara's 1-line verdict │ mini day-dots         │ Bloods      early Dec │
├───────────────────────┴───────────────────────┴───────────────────────┤
│ 4. HEALTH THREADS strip  [▾ collapse]  [Weeks|Months|Years] [−][+]     │  ← full content width,
│ IBD ●──●──■──|──○──○──○──□   (calprotectin ribbon)                      │    horizontal, pinchable,
│ Liver ─────────|──□──○        (GGT ribbon vs normal band)               │    TODAY line visible
│ Mind  ●  ●  ●  |                                                        │
│ Acute ▬      ▬ |                                                        │
├───────────────────────────────────────────────────────────────────────┤
│ 5. toolbar: search · Type · Practitioner · Show minor ▾ · Add            │
│ 6. WEIGHTED RIVER (concept A): UPCOMING → TODAY line → past by month    │
└───────────────────────────────────────────────────────────────────────┘
```

- **The strip must get the page's full content width.** It is a sibling of the card row, not inside a column. Its SVG width comes from its container (ResizeObserver), with **no max-width** below the page's own.
- The strip is an accordion. On desktop it opens by default; on phone it starts collapsed and shows a one-line summary ("4 threads · 2 planned"). The open state persists per viewer (localStorage, wrapped in try/catch).
- The existing **Places** button and map stay available from the toolbar. The detail side sheet stays, but its body text uses the kit type scale (see §4.12).

### 2.2 Phone (< 720px)
Cards stack in the order Brief, Episode, Next. The strip becomes an accordion whose body scrolls horizontally **inside its own box** (`overflow-x:auto`), with the page never scrolling sideways, and it opens scrolled so TODAY sits at 70% of the width. The river keeps its rail; minor rows stay one line.

### 2.3 Weight (visual importance)
Every medical record has `weight: major | routine | minor`.

| weight | River rendering | Default when Sara omits it |
|--------|----------------|------------------------------|
| major | full card, left colour bar, detail pills, mini lab panel if bloods | Surgery/Hospital, Imaging, Referral, specialist Consultation, infusion/injection of a biologic, Lab Work with a joined bloods record |
| routine | compact card: one title line + meta | Appointment, Prescription, Vaccination, therapy lane |
| minor | **one text line, no card**, a small dot on the rail, hidden when "Show minor" is off *unless* it belongs to the active episode | `record_type: Symptom` |

### 2.4 New record type: `Symptom`
Add `Symptom` to `MEDICAL_RECORD_TYPES` and the schema enum, plus a `symptom` lane. "My throat is sore" is a Symptom. It is **not** an Appointment.

### 2.5 Episodes
`episode: { id, title, status: 'active' | 'resolved', started, resolved? }`. A Symptom logged while an episode with overlapping symptoms is active joins that episode. The river renders an episode as **one collapsible band** ("Head cold · 23 → 26 Sep · ongoing · 3 notes"). The Active Episode card shows the newest active episode. An episode auto-resolves after 7 days with no new entry (shown as "resolved?" until Sara or Adam confirms).

### 2.6 Planned items (the future)
- A record whose date is after today, or with `status: 'planned' | 'to_book'`, is a planned item.
- `date_precision: 'day' | 'month' | 'tbd'`. "Colonoscopy Feb 2027" is month precision. "MRCP ordered" is `tbd` + `to_book`: it appears in NEXT as an **action** and on the strip at the left edge of the future zone, labelled "to book".
- **Cadence:** a dose record may carry `cadence_days` (Stelara = 56). If no future record exists for that medication, the model derives a *virtual* planned dose at last dose + cadence. It shows dashed, and "~" appears before the date.

### 2.7 Sara writes it all, reliably
Adam says one thing in chat, and every place on the page it belongs to updates. Symptom logs and episode appends **save immediately** (no Confirm card), because they are low-risk and reversible from the sheet. New visits, planned procedures and tasks still use a Confirm card, and multiple planned items from one message arrive as **one batched card**.

### 2.8 Next ↔ Tasks
Any Next item with status `to_book` (or a planned item without a booked date) shows **Add to Tasks**. This calls the existing `create_task` with `domain: 'health'` and stores the returned task id on the medical record (`task_id`). Once linked, the button reads "In Tasks ✓". When Sara logs a planned `to_book` item, she also proposes the task on the same Confirm card.

---

## 3. Item list (the whole scope)

### M1: Data model and Sara (do this first; the UI depends on it)
- [ ] **MO-01** Schema: add `weight`, `record_type: Symptom`, lane `symptom`, `status`, `date_precision`, `cadence_days`, `task_id`, and `episode.status/started/resolved` to `chat-schema.mjs` and `normalizeMedicalFields`. Omitted fields stay omitted: no empty strings.
- [ ] **MO-02** `inferWeight(record)` in `medical-normalize.js`, following the table in §2.3. Unit tests cover each row.
- [ ] **MO-03** `inferRecordType` maps symptom language ("sore", "sniffles", "cough", "headache", "cramping", "nausea", "tired", "run down") to `Symptom` when there is no provider or visit words.
- [ ] **MO-04** Episode joining: a Symptom with no `episode` joins the newest active episode if its start is within 7 days. Otherwise it starts a new episode titled from the symptom (Sara may rename it later).
- [ ] **MO-05** **Fix the vanishing note.** In `resolveMedicalLogCandidate`, when the matched record is a Symptom or belongs to an episode **and** the incoming date differs from the matched date, create a **new dated record in the same episode**. Never merge it into the old date. Same-day appends still merge. Visit corrections that are "a day or two off" still merge, but only for non-Symptom, non-episode visits. Regression test: 24/09 "Sore throat, sniffles, poor sleep" + a 26/09 "still congested, throat better" gives **two records** with the same `episode.id`.
- [ ] **MO-06** Planned items: the model treats `status in (planned, to_book)`, or a date after today, as future. `date_precision` month or tbd sorts to the end of its month; tbd sorts first in Next as an action.
- [ ] **MO-07** Cadence-derived virtual dose in `buildMedicalModel`, which is never written to storage. Test: last Stelara 27/08 with cadence 56 gives a virtual ~22/10. A real record dated within ±7 days of that suppresses the virtual one.
- [ ] **MO-08** Rewrite the medical section of `config/sara-protocol.md` with the rules in §3.1 below, word for word, so Sara reliably turns each thing Adam says into the right record.
- [ ] **MO-09** Sara has `create_task` in her roster. Verify it in `hammond-tools.mjs` / the capability map; add it if missing, restricted to `domain: 'health'`.
- [ ] **MO-10** Behaviour acceptance fixtures (§3.2) in the `AGENT_BEHAVIOUR_ACCEPTANCE.md` format, plus a unit test per fixture on the payload → record pipeline.
- [ ] **MO-11** One-off backfill script `scripts/medical-v2-backfill.mjs`. It is dry-run by default and prints a diff; with `--write` it writes, and Adam runs it. It: assigns `weight` to all records; turns 23/09 "Feeling run down" and 24/09 "Sore throat…" into Symptom records in the episode "Head cold"; **splits the 26/09 text out of the 24/09 record's notes** into its own 26/09 record (dated paragraphs in the notes body; if none can be found, print it for Adam); creates planned records from the 24/09 gastro note (MRCP `to_book`, repeat bloods early Dec `month`, colonoscopy Feb 2027 `month`, gastro review Mar 2027 `month`); sets `cadence_days: 56` on Stelara doses; and merges the duplicate 24/09 gastro cards ("Gastroenterology follow-up — biologics & liver review" and "Gastroenterologist Follow-up (Dr Chris Keily)") after printing both for Adam.

#### 3.1 Sara protocol text (put this in `sara-protocol.md`, replacing the medical-visit paragraphs)
> **Every health statement lands somewhere.** When Adam mentions how he feels, a symptom, a visit, a result, a plan, or a medication, call `log_entry` type `medical` in the same turn. Classify it first:
> - **Symptom or feeling** ("throat's sore", "still congested", "cramping this morning") → `record_type: Symptom`, `weight: minor`, date = the day he means (today by default), `title` = 2–5 plain words, `notes` = his words condensed + your one-line verdict. If a head cold / flare / episode is active, put it in that `episode` (reuse its `id`). This saves immediately — tell him "added to your head-cold episode" once it's `written`.
> - **Visit happened** → a new visit with `weight` (major for specialists, procedures, biologics, imaging; routine for GP/therapy/scripts).
> - **Anything planned or ordered** inside what he says ("MRCP ordered", "colonoscopy Feb", "see him again in March", "repeat bloods before December") → **one planned record each**, with `status` (`to_book` if he hasn't booked it) and `date_precision`. Never leave a future event only as prose inside another note. Propose `create_task` (domain health) for each `to_book` item on the same Confirm card.
> - **Results** → `bloods` record as below, plus the visit.
> - **"It's gone / I'm better"** → set the active episode `status: resolved` with today as `resolved`.
> Never append a new day's symptom update to an older record; a new day is a new dated entry in the episode.

#### 3.2 Behaviour fixtures (all must pass)
| Adam says (today 26/09) | Expected records |
|---|---|
| "my throat is sore" (no episode active) | 1 Symptom, minor, 26/09, new episode active |
| "still congested, throat better" (episode "Head cold" active, last entry 24/09) | 1 new Symptom 26/09 in the same episode; the 24/09 record is unchanged |
| "saw Dr Keily, calpro 15, MRCP ordered, colonoscopy Feb, back in March" | 1 major visit 24/09 + MRCP `to_book`/tbd + colonoscopy 2027-02 month + gastro review 2027-03 month + 1 task proposal (MRCP) on one Confirm card |
| "had my Stelara today" | 1 major dose record with `cadence_days: 56`; the model shows a virtual next dose |
| "cold's gone" | active episode → resolved |

### M2: Top row (three cards)
- [ ] **MO-12** Card row container: a grid with `repeat(3, minmax(0, 1fr))`, `align-items: stretch`, and cards that are `height: 100%` with an explicit kit surface (see §4.2). ≤ 1023px: 2 + 1; < 720px: stacked.
- [ ] **MO-13** **Health Brief** card: the Stelara cycle meter (week n of 8, segmented), up to 2 **Watch** items (the latest flagged bloods markers still out of range, each with value, arrow and reference), and Sara's latest compact verdict line (from the Central Node Health status, or the latest `notes` verdict). When there's no data, show an empty state with one sentence and nothing else.
- [ ] **MO-14** **Active Episode** card: title with emoji by lane, "day n", the latest entry text and date, and a dot row with one dot per day since the start (filled on days with an entry). With no active episode it reads "No active episode · last: Head cold, resolved 30/09". Clicking it scrolls to and expands the band in the river.
- [ ] **MO-15** **Next** card: up to 5 items sorted as actions (`to_book`) first, then by date. Each row: icon, title, and relative time ("in 26 days", "early Dec", "Feb 2027", or "action" in `--danger` tone). "+n more" jumps to UPCOMING in the river.
- [ ] **MO-16** Add to Tasks on eligible Next rows (§2.8), through `tasksApi` / `apiPost` (**no relative fetch**, see §4.7). Test: `task_id` is stored and the label flips.

### M3: Health Threads strip
- [ ] **MO-17** A thread model, `buildThreadModel(visits, bloods, today)`, with the lanes **IBD, Liver, Mind, Acute**. Mapping lives in one table: lane/provider/keywords → thread (therapy and ADHD → Mind; Symptom → Acute; gastro, Stelara and calprotectin → IBD; GGT/ALT and MRCP → Liver). A lane with no events in the visible window is hidden.
- [ ] **MO-18** Strip renderer: one inline SVG sized from the container via ResizeObserver. It has a left gutter of 140px for lane labels, a right pad of 24px, and a top axis of month ticks. The TODAY line is a 2px `--accent` line with a label. The future zone has a hatched background. Markers: solid circle = happened, hollow = planned, square = specialist visit, dashed hollow = virtual cadence dose, thin rounded bar = episode span.
- [ ] **MO-19** Biomarker ribbons inside their lane: calprotectin (IBD) and GGT + ALT (Liver) drawn from `bloods` records with a shaded normal band from `ref_low`/`ref_high`. The last point is labelled with value + ✓ / ↑.
- [ ] **MO-20** Zoom: Weeks / Months / Years buttons **and** − / + buttons **and** pinch. Pinch must work in **Safari macOS** (`gesturestart` / `gesturechange`, where `e.scale` is the factor; Safari does NOT send ctrl+wheel), **Chrome/Firefox** (a `wheel` event with `ctrlKey`, `preventDefault` with `{passive:false}`), and **iOS/touch** (two pointers via Pointer Events, with `touch-action: pan-y` on the strip). Drag pans horizontally. **One state object** `{ spanDays, centerDate }` drives the SVG *and* the active zoom pill (§4.5).
- [ ] **MO-21** Label collision: marker labels never overlap each other or the gutter. Sort by x, and if a label's box intersects the previous one in the same lane, flip it above/below; if it still collides, hide it and show it on hover/focus instead. Labels near the right edge anchor `end`.
- [ ] **MO-22** Interaction: every marker is focusable (`tabindex=0`, `role=button`, `aria-label` "Colonoscopy, planned, Feb 2027"). Enter or click opens the same detail sheet as the river. Hover shows a tooltip positioned inside the strip bounds.
- [ ] **MO-23** Accordion: a header button with `aria-expanded` and a collapsed one-line summary. The state persists (try/catch localStorage). The body uses the `[hidden]` attribute **plus** a CSS rule `.medical-strip__body[hidden]{display:none}` (§4.4).

### M4: Weighted River
- [ ] **MO-24** Render by `weight` (§2.3). Major = card (current `medical-card` restyled per the mockup's concept A), routine = compact card, minor = one line of text on the rail. Measurable check: at 1440px a minor row is ≤ 28px tall, and a major card with labs is ≥ 140px.
- [ ] **MO-25** UPCOMING section above the TODAY line, soonest nearest to TODAY (i.e. rendered in *descending* date order down to Today). Items are dashed with a countdown on the right; virtual doses show "~".
- [ ] **MO-26** Episode band: `<details>` with a summary line (emoji, title, date span, status pill, count), the entries as a dated list inside, open by default when active and closed when resolved. Replace the existing `kind: 'band'` rendering.
- [ ] **MO-27** **Mini lab panel.** On a major card with a joined bloods record, show the flagged markers (max 4, flagged first, then key markers) using **`markerRow()` from `render-bloods.js`** (export it; add a `compact` option that hides the explainer button and chart). Show "+34 in range" as a text link to Body › Bloods, anchored to `#bloods-marker-<key>`. **Delete the `"${inRange} in"` chip code.**
- [ ] **MO-28** Show-minor toggle in the toolbar, persisted. It is off by default, but minors in the active episode always show.
- [ ] **MO-29** Detail sheet: add episode context ("part of Head cold, entry 3 of 3"), planned status controls (Mark booked → pick a date; Mark done), and weight override (major/routine/minor). The sheet body text uses `--text-md`, not inherited `font-size` (see screenshot 3: the notes paragraph renders at ~22px).

### M5: Wiring, polish, ship
- [ ] **MO-30** Everything above is wired in `app-controller.js` / `medical-controller.js` with **production loaders** (bloods events and today). A test builds the page through the production entry point, not just the model with hand-made fixtures (§4.8).
- [ ] **MO-31** Motion: cards and the river use the existing `startHubMotion` entry. **No kinetic text on anything clickable or editable** (§4.6). The strip zoom animates `spanDays` over 180ms and `prefers-reduced-motion` turns it off.
- [ ] **MO-32** Empty states for every block (no episodes, nothing planned, no bloods, no records). No dead buttons.
- [ ] **MO-33** Update `docs/superpowers/specs/2026-08-20-medical-overview-design.md` with a "v2" section, and note the Symptom/episode/planned rules in `apps/life` docs, if a medical doc exists.
- [ ] **MO-34** Screenshots + live check (§5). Run the backfill in dry-run and paste the diff into the PR for Adam.

---

## 4. Known Cursor failure modes: pre-empt every one

These come from this repo's own history (the Goals v2 live review in `docs/superpowers/progress/goals-v2.md`, #472, #476, #488, #495). Each rule has a check. **Run the check before ticking the item.**

1. **Grids that don't fill or that overflow (#495, #488).** Every grid track is `minmax(0, …fr)`, never bare `1fr`. Every flex/grid child that holds text has `min-width: 0`. *Check:* at 1440 the three cards' right edge = the strip's right edge = the river toolbar's right edge (±1px) in DevTools.
2. **Surfaces that silently don't apply (#476: "glass-tile is a no-op in Tasks").** Don't rely on a utility class existing in this hub. Give each card an explicit surface: `background: var(--glass)` (or `--paper`), `border: 1px solid var(--line)`, `border-radius: var(--radius-md)`, `box-shadow: var(--elev-1)`. *Check:* the computed `background-color` isn't transparent.
3. **See-through sheets (#472).** The detail sheet and any popover use `background: var(--paper)`, `backdrop-filter: none`. *Check:* the river text doesn't show through the sheet.
4. **`[hidden]` not hiding (G-18).** Any element you toggle with `hidden` that also has a `display:` rule gets an explicit `[hidden]{display:none}` rule. *Check:* collapse the strip; its body has `offsetHeight === 0`.
5. **Pills that disagree with the view (G-17).** One state source for zoom. The pill `is-active` class is computed from that state on every render, never toggled on click separately. *Check:* pinch into week range → the "Weeks" pill is active.
6. **Phone DOM showing on desktop, or vice versa (G-43).** When JS renders different DOM per breakpoint, use a `matchMedia('(max-width: 719px)')` listener that re-renders, and don't just rely on CSS. *Check:* resize 390 → 1440 without reloading; no phone-only elements remain.
7. **Relative fetches that 404 on life-hub (G-36/37).** All API calls go through `apiGet`/`apiPost` + `getApiBaseUrl()`. `grep -n "fetch('/" apps/life/js/app/*medical*` must return nothing.
8. **Production wiring missing (G-30).** A feature isn't done because the model test passes. MO-30's integration test must go through the real controller.
9. **Kinetic text corrupting interactive text (G-06, G-22).** No `hub-kinetic` on card titles, marker labels, or anything clickable or editable.
10. **Fake links (G-22).** Clickable rows are `<a href>` or `<button>`, keyboard-reachable, and Enter works.
11. **Dead buttons and silent empty states (G-16).** Every button does something visible in every data state.
12. **Uncontrolled type sizes (screenshot 3).** No text inherits browser defaults. Every text node in the new UI uses a kit size token. *Check:* no computed `font-size` above 18px except the page `h1`, card values (22px) and river major titles (18px).
13. **SVG labels clipping or overlapping (Goals runway: PAD_R / "Move clipped").** Reserve a gutter and right pad in the SVG maths, and use MO-21's collision pass. *Check:* at 390 and 1440, no label's bbox crosses the SVG edge or another label (write a tiny DOM test using `getBBox`).
14. **Safari-only breakage.** Adam uses Safari. Test pinch, `<details>` marker styling (`summary::-webkit-details-marker{display:none}`), `position: sticky` and `gap` in WebKit specifically.
15. **"Looks done" ≠ matches the mockup.** Before ticking any M2–M4 item, place your screenshot next to the matching mockup section and list the differences in the ledger. Fix them, or record them as a Deviation with a reason.

---

## 5. Verification and final summary

**Screenshots in the PR**, at 1440 and 390, Safari:
1. Top row + strip open + river (with the Head cold episode active, after the backfill dry-run data is loaded locally)
2. Strip zoomed to Weeks and to Years
3. Major bloods card with the mini lab panel
4. Detail sheet open on a planned item
5. Phone: strip collapsed and expanded (horizontal scroll inside the box, page not scrolling sideways)

**Live check** on `life-hub.adam-russell.com` after Adam merges: tell Sara "my throat is still a bit sore" → within one reply, the Active Episode card updates, a minor line appears under TODAY in the river, and the Acute lane bar extends to today. Put that result in the ledger.

**Final chat summary format:** progress `34/34`, a table of any Deviations with reasons, the Discovered items and how each was resolved, the PR link, and the exact backfill command Adam must run (`node scripts/medical-v2-backfill.mjs --write`).
