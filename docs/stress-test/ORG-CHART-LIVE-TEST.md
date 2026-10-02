# Org chart: live browser test (for Codex)

A scripted, clicking test of the Professional Hub organisation chart on production. It covers load timing, refresh behaviour, the **Edit chart** editor, containers (units/faculties), people, roles and lines.

The output is **one failure log**. This test does not fix anything.

Code under test (read only, so you know what each control is meant to do):

| File | What it is |
|------|------------|
| `apps/professional/src/views/organisation-page.ts` | Organisation page: header, "How X is run", Outline / Chart / People list, Ann's read, Opportunities |
| `apps/professional/src/components/org-chart-editor.ts` | Drag-and-connect **Edit chart** editor (boxes, lines, inspector) |
| `apps/professional/src/components/org-structure-editor.ts` | Older **Units & members…** sheet (units, head positions, member links, exception lines) |
| `apps/professional/src/components/org-chart-board.ts` | The one chart drawing, shared by Edit chart, the page's **Chart** view, Compare and Outline |
| `apps/professional/src/domain/org-chart-model.ts` | Boxes, lines, faculty containers, drop-into-a-faculty rules |
| `apps/professional/src/api/org-structure.ts` | Every write goes to `/api/org-structure?action=…` |

---

## Paste this into Codex

```text
You are running the Life Hub org chart live test.

Read and obey docs/stress-test/ORG-CHART-LIVE-TEST.md in the life-hub repo.
Target: https://life-hub.adam-russell.com (Professional Hub → Organisations).

Hard rules:
- Use a real browser (Playwright, headed or headless Chromium). Click the real controls.
  Do not call /api/* directly to "test" a step. The API is only for reading state as evidence.
- Do not edit application code. Do not commit, push or open PRs.
- Never print the session cookie or ask for the Life passphrase. If you are not signed in, write
  the log as BLOCKED and stop.
- Only write to the SANDBOX organisation "ZZ Org Chart Test" (created in step S1). Never edit
  St. Aloysius College or any real organisation. The one exception is R-1 to R-6, which are read-only.
- Prefix every name you type with "ZZT " so leftovers are easy to find.
- Run each test as written. Record PASS / FAIL / FLAKY / BLOCKED for every test ID, with timings.
- Write exactly one log: docs/stress-test/reports/org-chart-YYYY-MM-DD.md (append -2, -3 if it exists),
  using the template at the bottom of the file.
```

---

## 0. Harness setup (do this before any test)

### 0.1 Viewports

Run the whole suite at **1280×800**. Then run the sections marked **📱** again at **390×844** (phone). The page switches Chart → Outline under 720px, so the phone run checks different code.

### 0.2 Network + console recorder

Attach these in Playwright before you navigate, and keep them running for the whole session:

```js
const net = [];   // every /api/ call
const cons = [];  // console errors + page errors
page.on('request', r => { if (r.url().includes('/api/')) r._t0 = Date.now(); });
page.on('requestfinished', async r => {
  if (!r.url().includes('/api/')) return;
  const res = await r.response();
  net.push({ t: new Date().toISOString(), method: r.method(), url: r.url().replace(/^https?:\/\/[^/]+/, ''),
             status: res?.status(), ms: Date.now() - (r._t0 ?? Date.now()) });
});
page.on('requestfailed', r => { if (r.url().includes('/api/')) net.push({ method: r.method(), url: r.url(), status: 'FAILED', err: r.failure()?.errorText }); });
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') cons.push({ type: m.type(), text: m.text() }); });
page.on('pageerror', e => cons.push({ type: 'pageerror', text: String(e) }));
page.on('dialog', d => { cons.push({ type: 'dialog', text: d.message() }); /* each test says accept or dismiss */ });
```

For every test, attach the `net` and `cons` entries that happened **during that test** to its log row. Any `pageerror`, any 4xx/5xx, or any `/api/org-structure` call over **3000 ms** is a finding even if the test otherwise passes.

### 0.3 Timing helper

Measure "click → visible result" with `performance.now()` around a `waitFor`. Use these budgets:

| Kind | PASS | SLOW (still log it) | FAIL |
|------|------|------|------|
| Page section first paint | ≤ 1.5 s | 1.5–4 s | > 4 s or never |
| Editor write (click → status "Saved." and box/line visible) | ≤ 1.5 s | 1.5–3 s | > 3 s, or status never says Saved. |
| Person search results | ≤ 1 s after typing stops | 1–2.5 s | > 2.5 s |
| After **Done**, page chart reflects the change | ≤ 2 s | 2–5 s | > 5 s, or needs a manual refresh |

Run every timing test **3 times** and log min / median / max. If one run in three fails, mark it **FLAKY**, not PASS.

### 0.4 Evidence

For each FAIL or FLAKY take a full-page screenshot to `docs/stress-test/reports/org-chart-shots/<TEST-ID>.png`. Only save screenshots for failures.

### 0.5 Read-back (truth check)

After a write, the chart is only right if the server has it. To check, read (GET only):

```js
await page.evaluate(id => fetch(`/api/org-structure?organisation_id=${id}`, { credentials: 'include' }).then(r => r.json()), ORG_ID)
```

Compare `units`, `positions`, `graph.edges`, `graph.members_by_unit` and `layout` against what is on screen. A screen that disagrees with the server is a FAIL, in either direction.

---

## S. Sandbox

| ID | Step | Expect |
|----|------|--------|
| S1 | Organisations → **Add organisation** → name `ZZ Org Chart Test`. Open it. Record the id from `#/organisations/<id>` as `ORG_ID`. | Org page opens. "How ZZ Org Chart Test is run" shows **Draw the chart** and the empty-state text. |
| S2 | You need at least 4 people who exist in Life Hub. In the editor's person search, type two letters of names you can see on St. Aloysius (e.g. "Ni", "Jo", "Da", "Ph") and note 4 people who come back. **Do not create people.** If search returns no one, mark the people tests BLOCKED. | 4 real people noted as P1–P4. |

---

## R. Read-only on a real, populated org (St. Aloysius College)

Open St. Aloysius College from Organisations. **Do not click Edit chart, Run now or Add opportunity here.**

| ID | Step | Expect / what to log |
|----|------|----------------------|
| R-1 **Cold load timing** 📱 | Hard reload (cache disabled) 3×. For each, time from navigation to: (a) `h1` stops saying "Loading…", (b) "How … is run" body is not empty, (c) the Chart view has at least one box, (d) Ann's read body is ready, (e) Opportunities body is ready, (f) "Your time with …" timeline drawn. | All within budget. **Look for:** the sections load **one after another**, not in parallel. The code awaits chart → Ann → Opportunities → timeline in sequence, so a slow `/api/org-structure` delays everything below it. Log the gaps between a/b/c/d/e/f and the `/api/` waterfall. |
| R-2 **Blank-while-loading** | During R-1, take a screenshot every 150 ms of the "How … is run" card until the chart appears. | A loading indicator is shown the whole time. **Look for:** the card going completely blank (the code sets the section to "ready" and empties it *before* fetching the structure). A blank card with no spinner is FAIL. |
| R-3 **Refresh stability** | Reload 5× in a row. On each load record: box count, line count, container count, and box positions (Chart view). | Same counts and same layout every time. Any box, line or container that appears on one load and not another is FAIL. Log which one. |
| R-4 **Chart quality** | At 1280, Chart view, click **Fit**. Inspect it. | No overlapping boxes. No line drawn through a box. Arrows point the right way (from report to manager). Text not clipped mid-word: the screenshot shows "Director - Professional L…", so log every truncated title and whether the full text shows on hover. Containers are fully visible. Nothing is drawn outside the card. |
| R-5 **View switch + controls** 📱 | Click Outline → People list → Chart → Outline. In Chart: −, +, Fit, each 3×. Click a **Vacant** box if one exists, and a held box. | Each view paints in ≤ 1 s with the right button highlighted. Zoom changes size; Fit fits the whole chart to the card. A held box opens that person's profile. A vacant box opens the editor; close it with **Done** without changing anything. Outline lists the same people in the same faculties as the Chart. |
| R-6 **Duplicate / dead controls** | Note every control on the page. | There are two **Edit chart** buttons (top right and in the card). Log it as a UX issue. Check both open the same editor and close with Done without changes. **Highlight → Your lines**: click it. Does it change anything? If Adam is not flagged as "self" on this org, it is a control that does nothing, so log FAIL with what the URL `?line=` became. Phone: Chart is replaced by Outline under 720 px. Check Outline is readable and the People list links work. |

---

## E. Editor on the sandbox org (ZZ Org Chart Test)

Open the sandbox org and click **Draw the chart**. In every test below, after the step, also check the editor's status line (bottom of the canvas, `role=status`). It should say "Adding…", "Connecting…" and so on, then **"Saved."**. Log the exact status text on every failure.

### E1. Opening, closing, empty state

| ID | Step | Expect |
|----|------|--------|
| E1-1 | Open the editor (timed). | Editor dialog shows in ≤ 500 ms. Empty board says "No one on the chart yet." The inspector shows "Add someone". |
| E1-2 | Press **Escape** with focus in the "Search people…" box. | **Look for:** Escape closes the whole editor even while you are typing (the key handler is on `document`). Losing your place mid-typing is a FAIL. Log what happens. |
| E1-3 | Reopen. Click **Done** with no changes. | Closes. The page does not re-fetch or flash, so check `net` for a needless `/api/org-structure` GET. |

### E2. Add a person to the chart 📱

| ID | Step | Expect |
|----|------|--------|
| E2-1 | Click **+ Person**. Type 1 letter of P1. Then type a 2nd letter. | 1 letter: no search. 2 letters: results in ≤ 1 s (200 ms debounce plus network). Time it. |
| E2-2 | Type fast, then delete back to 1 letter before results return. | No stale results remain. The list clears. |
| E2-3 | Search a name that does not exist (`ZZT nobody`). | "No one found. Add them on the People page first." |
| E2-4 | Pick P1. Leave **Role** empty. Click **Add to chart** (timed). | A box appears for P1 titled "Member", selected, status "Saved.". Read-back: 1 position plus a `holds_position` link. **Look for:** does it end up titled "Member"? Is that what you would want? Log it as a UX note. |
| E2-5 | Pick P2, Role `ZZT Head of Faculty`, **Add to chart**. Then **immediately** double-click **Add to chart** again. | Exactly one new box. Read-back confirms only one position (the editor ignores clicks while busy, so check it doesn't silently drop or duplicate). |
| E2-6 | Add P3 with role `ZZT Teacher A` and P4 with `ZZT Teacher B`. | 4 boxes, none overlapping (`nextFreeSpot`). |
| E2-7 | **+ Empty role**. Click **Add role** with no name. Then name it `ZZT Business Manager` and add. | No name: status "Give the role a name first." Named: a box shows "Vacant · ZZT Business Manager". |
| E2-8 | "At ZZ Org Chart Test, not on the chart": does this list appear? | Only for people whose profile workplace is this org. It is probably absent on a new sandbox, so log present/absent. |

### E3. Edit a box

| ID | Step | Expect |
|----|------|--------|
| E3-1 | Click P3's box → Role → rename to `ZZT Teacher A (renamed)` → **Rename** (timed). | Box title updates. Read-back position title updated. The note says renaming updates P3's profile job title too, so open P3's profile in a new tab and check. Log if it did not change, or if it changed P3's job title at their *real* workplace. |
| E3-2 | Rename to the same title, then to empty. | Nothing happens, silently. Log it as a UX note: there's no feedback. |
| E3-3 | Select the vacant Business Manager box → "Who holds this role?" → pick P1. | **Look for:** P1 now holds two boxes, or their first box disappears. Log exactly what happens and what read-back says. |
| E3-4 | On a held box, **Remove from role**. | Box becomes "Vacant" and keeps its title. |
| E3-5 | **Delete this box** → **dismiss** the confirm. Then again → **accept**. | Dismiss: nothing changes. Accept: the box and all its lines are gone, and read-back shows the position archived. |

### E4. Lines (relationships)

| ID | Step | Expect |
|----|------|--------|
| E4-1 | Drag from P3's **●** handle onto P2's box. | "How are they connected?" with 4 choices. Pick "P3 reports to P2" (timed). A line appears with the arrow at the correct end. Read-back: `reports_to` with source P3 and target P2. |
| E4-2 | Drag from a handle and drop on empty canvas. | Status "Drop the line onto another box to connect them." No line. |
| E4-3 | Drag from a handle onto the **same** box. | No line, no crash. |
| E4-4 | Without dragging: select P4 → Connect → "manages" → P3 → **Add line**. | Read-back: `reports_to` with source P3 and target P4 (manages is stored reversed). Check the inspector wording is the right way round. |
| E4-5 | Create the **same** P3 → P2 reports-to line again. | No duplicate line (server returns `created:false`). Log if it duplicates or errors. |
| E4-6 | Create a cycle: P2 reports to P3 while P3 reports to P2. | Allowed or refused, but the editor and the Chart view must not hang or crash. Log behaviour and any `cycles` in read-back. |
| E4-7 | Click a line (thin target). | Line inspector opens. If clicking the line is hard (missed 2+ of 5 attempts), log FAIL with the zoom level. Then **Flip direction**, then "Change to works with", then **Remove line**, timing each. The arrow flips, the style changes, and the line is gone. |
| E4-8 | Select a box → in its "Lines" list click **Remove** on one line. | That line is removed and the others are untouched. |
| E4-9 | Keyboard: Tab to a line and press Enter. Tab to a box and press Enter. | The inspector opens for each. Focus is visible. |

### E5. Drag, layout, zoom 📱

| ID | Step | Expect |
|----|------|--------|
| E5-1 | Drag P2's box ~200 px right. Wait 1 s. | Box snaps to grid. One `PATCH …kind=layout` fires about 500 ms after release (check `net`). |
| E5-2 | Drag a box, then click **Done** within 200 ms. | Layout still saved (close flushes). Reopen the editor: the box is where you left it. |
| E5-3 | Drag a box off the top-left (negative x/y) and far bottom-right. | Board grows. Box never becomes unreachable. Log where it ends up. |
| E5-4 | **Tidy up**. | Boxes re-arranged by reporting. Status "Tidied.". Reopen: tidy layout kept. |
| E5-5 | Zoom + ×5, − ×5, Fit. Then drag a box at 0.4× and 1.8×. | The box follows the pointer exactly at every zoom. Log the offset if it drifts. |
| E5-6 | **Editor vs page**: arrange boxes by hand, Done, compare the page's Chart view. | The page shows exactly what you arranged: same positions, same faculty containers, same line styles. Any difference is FAIL. Log screenshots of both. |
| E5-7 📱 | 390 px: is the editor usable? Is the inspector reachable? Can you add a person and a line without dragging? | All writes possible. Log every control that is off-screen or under 44 px. |

### E6. Containers (units / faculties)

Faculties are added in Edit chart (**+ Faculty / team**) and drawn as containers in the editor and on the page alike. **Units & members…** opens the older sheet; test both routes.

| ID | Step | Expect / what to log |
|----|------|----------------------|
| E6-1 | In the editor click **Units & members…**. Take a screenshot at 0 ms, 100 ms, 500 ms, 1 s. | The Edit structure sheet opens and **stays open**. **Suspected bug:** the sheet opens and then disappears straight away. The code closes the chart editor *asynchronously* after already opening the new sheet, and the close callback removes whatever sheet is current, which is the new one. Log whether the sheet survives, how long it stays visible, and what is on screen after 1 s. |
| E6-2 | If the sheet survived: Add unit `ZZT Science Faculty`, kind Faculty (timed). | Status "Unit added.". **Look for:** the sheet closes itself after one save (`onSaved` removes it), so a second unit means reopening it. Log it. Read-back: one unit. |
| E6-3 | Add unit with an **empty** name. | Validation message, no unit created. Read-back confirms. |
| E6-4 | Add a 2nd unit `ZZT Humanities Faculty`. Reopen the sheet. | Both units in the "Unit" dropdowns. **Look for** stale dropdowns that list only the first unit. |
| E6-5 | Back in Edit chart, select P2's box. Does a **Unit / team** dropdown now appear? Pick `ZZT Science Faculty`. | The dropdown only shows once a unit exists. After picking: the box shows the unit name and read-back shows `position.unit_ref`. Close with Done. On the page Chart, P2 is drawn **inside** the Science Faculty container, the same as in the editor. |
| E6-6 | Make P2 head of Science. In the old sheet, Add position `ZZT Head of Science`, unit Science, ✓ Head of unit. | The container shows a head position. Log how the head appears on the page Chart vs the editor (the editor has no "is head" control at all). |
| E6-7 **Add a person to a container (two routes)** | Route A: editor → select P3's box → Unit = Science. Route B: old sheet → Add member → person P4, unit Science, role `ZZT Member`. | Both people appear inside the container on the Chart and in Outline. **Look for:** Route B's person list only has people already linked to the org (the directory), not all of Life Hub, so P4 may not be in it. Route B makes a `member_of_unit` link, not a box, so P4 shows as an "Also:" name in the container rather than a box. Log where each person shows in Editor / Chart / Outline / People list. |
| E6-8 | Move P3 from Science to Humanities, then to "No unit". | The container membership updates each time. The empty container still renders, labelled. |
| E6-9 | In the editor: drag a box into Science, then out again; drag Science by its name; click its name, rename it, then remove it. | The target container highlights while dragging. In: the box joins (status says so). A small nudge inside does not take them out. Out past the outline: they leave. Dragging the name moves every box in it. Rename shows on the page; Remove keeps the boxes on the chart, outside any group. |
| E6-10 | Click a faculty's name in Edit chart: rename it, change its kind, take one box out, add another, then **Remove** it (dismiss the confirm once, then accept). | Each change shows on the page Chart after Done. Remove archives the faculty; its boxes stay on the chart outside any group. Use this to clean up every `ZZT` faculty. |

### E7. Done → page refresh consistency 📱

| ID | Step | Expect |
|----|------|--------|
| E7-1 | Make one change (add a line), click **Done** (timed until the page Chart shows the line). | Within budget. **Look for:** the "How … is run" card going blank, and the view resetting to Chart (if you were on Outline). Log each. |
| E7-2 | Hard reload. | Everything from E2–E6 is still there, matching read-back. |
| E7-3 | Open the same sandbox org in a **second tab**. Add a box in tab A. In tab B, open the editor (no reload) and drag a box. | **Look for:** tab B overwriting tab A's work or showing stale data. Log it. |
| E7-4 | Throttle network to "Slow 3G" in DevTools/CDP. Add a person, add a line, rename. | A busy state is visible the whole time (`is-busy`, status text). Clicks during busy don't duplicate. Nothing is lost. Log the time each took. |
| E7-5 | Go offline (CDP `Network.emulateNetworkConditions offline`). Try a write. | A clear error in the status line, not "Saved.", not a silent nothing. Back online: the next write works. |

### E8. Cleanup

| ID | Step |
|----|------|
| C-1 | In the sandbox editor delete every `ZZT` box. Remove the old-sheet memberships if possible. |
| C-2 | Read-back and list what is left (units can't be deleted). Leave the sandbox org in place and name it in the log so Adam can archive it. |
| C-3 | Confirm St. Aloysius College is unchanged: compare counts with R-3. |

---

## Log template (write exactly this file)

`docs/stress-test/reports/org-chart-YYYY-MM-DD.md`

```markdown
# Org chart live test — YYYY-MM-DD

Run by: Codex · Browser: Chromium <version> · Viewports: 1280×800, 390×844
Sandbox org: ZZ Org Chart Test (<ORG_ID>) · Signed in: yes/no

## Summary
PASS n · FAIL n · FLAKY n · BLOCKED n · SLOW n
Top 5 problems (one line each, worst first):
1.
2.

## Failures and issues (one block per finding, worst first)

### F-01 <short title>  — <TEST-ID> — Severity: Blocker | Major | Minor | Cosmetic
- Viewport:
- Steps (exact clicks):
- Expected:
- Actual:
- Timing: click→result ms (min/median/max of 3)
- Network: <method url status ms> (only the relevant calls)
- Console: <errors>
- Read-back says: <what the server stored, if it differs from the screen>
- Screenshot: org-chart-shots/<TEST-ID>.png
- Repro rate: 3/3 | 2/3 | 1/3

## Timing table
| Test | Measure | min | median | max | Budget | Result |
|------|---------|-----|--------|-----|--------|--------|

## Every test
| ID | Viewport | Result | Note |
|----|----------|--------|------|
| R-1 | 1280 | | |
| … | | | |

## Suspected-bug checks (confirm or reject each)
| Hypothesis | Confirmed? | Evidence |
|------------|-----------|----------|
| E6-1 Units & members sheet vanishes on open | | |
| R-2 How card blank (no spinner) while loading | | |
| R-1 Sections load one after another | | |
| E1-2 Escape in search closes whole editor | | |
| E5-6 Page Chart differs from the editor | | |
| E6-7 Old-sheet member ≠ editor box (two models for "in a container") | | |
| R-6 "Your lines" highlight does nothing | | |
| E7-1 View/zoom resets after Done | | |

## Leftovers for Adam to clean up
- 
```

Severity guide: **Blocker** means you cannot do the task at all (e.g. can't add a container). **Major** means the task works but the result is wrong, lost, or needs a refresh. **Minor** means it is slow, confusing, or needs a workaround. **Cosmetic** means a visual problem only.
