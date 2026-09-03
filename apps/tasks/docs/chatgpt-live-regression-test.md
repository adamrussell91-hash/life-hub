# Tasks Hub — ChatGPT Live regression (pass 2)

**How to use:** copy everything below the line into ChatGPT Live. This is the **second** run. The first pass found dead Maps, hung Network/Corey, Clare `Failed to fetch`, silent excursion create, and a one-day date shift. Those should now be fixed and redeployed. Verify the old bugs are gone, then sweep the rest.

---

# Prompt — Tasks Hub regression after the 2026-08-21 fixes

You are a senior QA + frontend debugger. Run a **regression + full-site** pass on Tasks Hub after a code + Functions + Pages deploy.

Do not stop at the first bug. Finish the script. For every fail, capture URL+hash, console, Network (method, URL, status, request JSON, response JSON), and a selector.

## 1. Hosts and auth

Try **both** hosts. Start here:

1. `https://tasks-api.adam-russell.com` — must now be the **full SPA** (sign-in / Board), **not** the page that says “Functions only. Static app is on GitHub Pages.” If you still see that stub, **P1 fail**.
2. `https://tasks-hub.adam-russell.com` — GitHub Pages SPA. API calls go to `tasks-api`.

Passphrase: `tasks-hub-local` (not `teaching-hub-local`).

Sign in with **Enter**. Empty submit must say **Enter your passphrase.** (not Invalid passphrase). Wrong passphrase: Invalid passphrase.

Prefer the API host for the rest of the run so `/api/*` is same-origin. Repeat Clare + Maps + Corey on Pages if time.

DevTools Console + Network stay open.

## 2. Production leftovers (delete them)

The last tester left:

- `QA LIVE TEST — temporary` (or similar QA / LIVE TEST titles)
- A **Marking batch** created by template Use

On **Board**, each card now has **Delete**. Delete leftover QA / LIVE TEST / extra Marking batch tasks via the confirm card (Discard first once to prove it, then Confirm). Do **not** delete MindWorks work (lesson pack, publish, term brief).

If Delete is missing, fail P1.

## 3. Must-pass regressions (these failed last time)

Mark each PASS/FAIL with one line of evidence.

### R1 — Maps is a real page
Click rail **Maps**. URL `#/maps`. Header eyebrow **Pathways**, title **Maps**. Must **not** be Board columns. A transit SVG or an empty/new-map state is OK. `#/definitely-missing` must **not** look like Board — it should say page not found.

### R2 — Clare propose works
`#/clare` → task `[LIVE-TEST] regression clare`, Ask Clare. Must get a proposal (framework + minutes), not raw `Failed to fetch` and not a hang on “Clare is thinking…”. Propose write → Discard. Propose write → Confirm. Task exists on Board/Today. Network: `POST /api/clare` propose then accept, both `ok: true`.

### R3 — Network leaves loading
`#/stress` must leave “Scanning pressure patterns…”. Either flags + Hammond inbox, or an error + **Retry**. Never an infinite scan.

### R4 — Corey leaves loading
`#/corey` must leave “Loading capacity…”. Headlines + 14-day grid, or error + Retry. Copy link. Open `#/capacity/<token>` in a new tab — **no task titles**. Invalid `#/capacity/not-a-real-token` → unknown/rotated. **Do not rotate** unless you will record the new URL.

### R5 — Dates stay on the picked day
Excursions: set the date picker to a visible date (e.g. `2026-10-05`). Preview **event** text must use **that same date**, not the day before. Confirmation text must match. Week: a task whose chip/meta says `Due 2026-08-21` (or today) must sit in that weekday’s column, not the next day.

### R6 — Excursion create is not a silent no-op
Title `[LIVE-TEST] regression ethics`, Ethics Olympiad, group `Year 10 regression`. Review & create → confirm. **Cancel** first. Then create. Either a new excursion with admin tasks + drafts, or a visible error. Buttons must not just re-enable with no message.

### R7 — Template Use is a proposed write
Templates → Marking batch **Use** → confirm card. Discard: no new task. Confirm: task created, land on Today, you can see what was created. **Standard term project** has **Use** → confirm → Projects.

### R8 — Mutations look live
On Board: Start / Done / Reopen show **Saving…** and the card moves (or the board refreshes) without a later manual reload. Errors are visible.

### R9 — Week chips do something
Click a Week task. A preview (title, due, Done) must appear. Dead focus-only buttons are a fail.

### R10 — Stall actions exist
Projects: **Masters reading notes** (quiet since June) should be under stalled (or a warning that flags could not persist, with local stall actions). Empty reason is blocked. Frankenstein without a target is blocked. Type a reason, open confirm, **Discard**. Do not bury MindWorks.

### R11 — Sky name + filters
Rail **Sky** → heading **Sky**. Board scope reads as Scope + current value (not `ScopeAll tasks`). Graph Blockers/Workstreams look like hub pills, with pressed state.

### R12 — Unknown route + scroll
From a long page (Projects), jump to Orbit. The Orbit heading must be in view (scroll reset). `#/nope` is not-found, not Board.

## 4. Full rail sweep (fast)

Click every rail item. Each must paint (or show Retry), set `aria-current`, and match its header.

Board, Clare, Graph, Maps, Gantt, Orbit, Branch, Sky, Today, Week, Month, Backlog, Projects, Excursions, Network, Corey, Templates, Search.

Graph/Orbit/Branch/Gantt/Sky: a list or table of items exists under the picture (keyboard reachable). Labels must not be an unreadable pile.

Search: `Mind` finds MindWorks; `zzzznope` → No matches. Done and Delete on a **[LIVE-TEST]** result work through confirm/refresh.

## 5. Safety

Prefix new records `[LIVE-TEST]`. Discard destructive confirms on real projects. After the run, Delete the `[LIVE-TEST]` tasks you created.

## 6. Report template

```md
# Tasks Hub live test report — pass 2

- Date:
- Hosts: tasks-api SPA? (yes/no) · tasks-hub Pages? (yes/no)
- Browser / viewport:
- Functions suspicion (404 / CORS / Failed to fetch):

## Regression
| ID | Result | Evidence |
|----|--------|----------|
| R1 Maps | | |
| R2 Clare | | |
| R3 Network | | |
| R4 Corey | | |
| R5 Dates | | |
| R6 Excursion | | |
| R7 Templates | | |
| R8 Mutations | | |
| R9 Week chips | | |
| R10 Stall | | |
| R11 Sky/filters | | |
| R12 Unknown/scroll | | |

## New defects
### D1 — title
- Severity (S1–S4 / UX):
- Repro:
- Expected / actual:
- URL + hash:
- Console:
- Network:
- Fix hint:

## Leftovers deleted
- list of titles removed

## [LIVE-TEST] still on the board
- list or “none”
```

Return only the filled report.
