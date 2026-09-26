# Cursor UI failure register

**What this is.** A running list of every UI/UX mistake Cursor has shipped in this repo more than once, or shipped while claiming it was done. Each entry has the rule that prevents it and a **check** that proves it's fixed. Nothing counts as fixed on "looks right to me".

**Who uses it**
- **Cursor:** `.cursor/rules/ui-failure-register.mdc` makes you read this before any UI work. Before you tick any UI item, run the check for every entry that applies to your change.
- **Claude, when writing a build brief:** copy the IDs relevant to the feature into the brief's "failure modes" section (e.g. `L1 L2 S1 V1 D2 P1`), with a feature-specific check for each.
- **Claude, when reviewing Cursor's work:** every new failure gets an entry here in the same PR as the review. A repeat failure gets its **Seen** line extended; repeats are the point of the list.

**Entry format:** `ID · name`: **Seen:** where it happened. **Rule:** what to do. **Check:** how to prove it.

---

## L: Layout and width

**L1 · Column doesn't fill the page.** **Seen:** Goals cards #495; Goals v2 #488; Medical river v2 (~410px column with 60% of the page empty). **Rule:** Grid tracks are `minmax(0, Nfr)`, never bare `1fr`. Text-holding flex/grid children get `min-width: 0`. Don't put a fixed `width`/`max-width` on a main column unless the brief asks for one; to cap the reading width, cap the text inside the card, not the column. **Check:** in DevTools at 1440, sibling blocks on the page (card row, strip, list) share the same right edge ±1px.

**L2 · Cards with dead space.** **Seen:** Medical v2 planned cards (~110px for one line), past cards with empty bottoms. **Rule:** Cards size to their content. No `min-height` or fixed `height` on content cards; equal-height rows come from `align-items: stretch` on the row. Put metadata such as a countdown on the title row, not on its own line. **Check:** state a max px height per card type in the brief and measure it.

**L3 · Sticky side panels that fight the layout.** **Seen:** Goals Hammond panel #495. **Rule:** No `position: sticky` side columns unless the brief specifies one. **Check:** scroll the full page at 1440 and 390; nothing overlaps or detaches.

**L4 · Rail or background stops partway down the page.** **Seen:** Medical v2 full-page capture (rail ends at ~690px). **Rule:** The rail is fixed/sticky with `height: 100dvh`; the page background sits on `body`. **Check:** full-page screenshot, then scroll to the bottom.

**L5 · Toolbar wraps into a pile on phone.** **Seen:** Medical v2 at 390 (4 rows of controls). **Rule:** At < 720px a toolbar is search + one **Filters** button (a sheet) + an icon primary action. **Check:** the toolbar is ≤ 2 rows at 390.

## S: Surfaces and CSS scope

**S1 · Styles scoped to another page's container.** **Seen:** Medical v2 mini lab panel. The bloods meter CSS was scoped to `#body-bloods-dashboard`, so the reused `markerRow()` rendered as floating black dots. **Rule:** When you reuse a component somewhere new, grep its CSS for ID/parent-scoped selectors and rescope them to the component class. **Check:** screenshot the reused component in its new home next to its original home; they match.

**S2 · Utility class that doesn't exist in this hub.** **Seen:** Tasks `glass-tile` no-op #476. **Rule:** Give each card an explicit surface: `background: var(--glass)` or `var(--paper)`, `border: 1px solid var(--line)`, `border-radius`, `box-shadow: var(--elev-1)`. **Check:** the computed `background-color` isn't `transparent`.

**S3 · See-through sheets and dialogs.** **Seen:** Tasks Programs sheet #472. **Rule:** Sheets and popovers use `background: var(--paper)`, `backdrop-filter: none`. **Check:** no underlying text is visible through an open sheet.

**S4 · SVG falling back to default black fill.** **Seen:** Medical v2 meter dots. **Rule:** Every SVG shape gets an explicit `fill`/`stroke` via class or attribute. **Check:** no pure `#000` in the computed fills of the new SVG.

## V: Visibility and state

**V1 · `[hidden]` doesn't hide.** **Seen:** Goals Direction editor (G-18). **Rule:** Any element toggled with `hidden` that has a `display:` rule also gets `.x[hidden]{display:none}`. **Check:** after hiding, `offsetHeight === 0`.

**V2 · Controls disagree with the view.** **Seen:** Goals Term/Year pills (G-17). **Rule:** One state object drives both the view and the control's active class, recomputed on every render. **Check:** change the view by a *different* input (pinch, keyboard, URL) and the pill follows.

**V3 · Duplicate controls for the same concept.** **Seen:** Medical v2, two Weeks/Months/Years pill sets on screen. **Rule:** Each view has one zoom/density control. Controls for a collapsed region hide with it. **Check:** list every control on the screen; no two share labels.

**V4 · Different parts of the page disagree.** **Seen:** Medical v2: the episode card said "day 4", the band said "2 notes", and a loose minor line showed the third note; the strip said "2 planned" while Next showed 3. **Rule:** Derive summary counts and cards from **one** model function, never recompute them in the renderer. **Check:** a test builds the page model once and asserts every summary figure against the same source.

## R: Responsive

**R1 · Phone DOM at desktop, or desktop DOM at phone.** **Seen:** Goals runway (G-43). **Rule:** When JS renders different DOM per breakpoint, re-render via a `matchMedia` listener; CSS alone isn't enough. **Check:** resize 390 → 1440 → 390 without reloading.

**R2 · Horizontal page scroll on phone.** **Rule:** Wide content (charts, strips) scrolls inside its own `overflow-x:auto` box. **Check:** `document.documentElement.scrollWidth === innerWidth` at 390.

**R3 · A component that works on desktop but breaks at 390.** **Seen:** Medical v2 bloods rows (dot, value and status each on separate lines). **Rule:** The brief gives the phone layout explicitly (e.g. "2 rows: label+value / bar+status"). **Check:** a 390 screenshot of every new component, not just the page top.

## D: Data shown truthfully

**D1 · Made-up precision.** **Seen:** Medical v2 "to book" MRCP shown as 26/09/26 and month-precision colonoscopy as 01/02/27. **Rule:** Render what the data knows: a day, a month ("Feb 2027"), "To book", or "~22/10/26" for an estimate. Never substitute today or the 1st of the month. **Check:** a fixture per precision level asserts the rendered label.

**D2 · Item placed by the wrong date.** **Seen:** Medical v2 active episode positioned at its first entry, not its latest. **Rule:** The brief states the sort key of every grouped item. **Check:** a model test asserts the order.

**D3 · Screenshots taken on demo data.** **Seen:** Medical v2 (demo rail, river ending at Aug 2026, missing records). **Rule:** Acceptance screenshots use real data on the live umbrella or a production-data copy. **Check:** the screenshots contain named real records the brief lists.

**D4 · Mapping tables that miss real values.** **Seen:** Medical v2 Mind lane missing although therapy and ADHD visits exist. **Rule:** Test a keyword/lane map against real titles and providers from the store, not invented ones. **Check:** one test per lane using real record titles.

**D5 · Ugly or ambiguous derived text.** **Seen:** "38 in" chip; "Ordered 24 Sep" with no subject; dates not in dd/mm/yy. **Rule:** Every generated label reads as a phrase a person would write; dates use `formatDisplayDate` or relative text. **Check:** read every string in the screenshot aloud.

## C: Charts and SVG

**C1 · Labels collide or clip.** **Seen:** Goals runway "Move clipped" (PAD_R); Medical strip labels cut by the TODAY line or truncated, and overlapping value labels. **Rule:** Reserve gutters in the maths; run a collision pass (flip, then hide-to-tooltip); anchor `end` near the right edge; axis labels get their own row. **Check:** a DOM test using `getBBox` shows no label box intersecting another or crossing the SVG edge, at 390 and 1440.

**C2 · A decorative band standing in for data.** **Seen:** Medical strip: the normal-range band was drawn full width, but the value line was never drawn. **Rule:** A chart item is done when the **data mark** renders from real values; the reference band is secondary. **Check:** the screenshot shows the line passing through the actual numbers.

**C3 · Loose vertical rhythm.** **Seen:** Medical strip lanes about 70px apart with empty space at the bottom. **Rule:** Chart height comes from `rows × rowHeight` as given in the brief. **Check:** measure it.

**C4 · Pinch/gesture only tested in Chrome.** **Rule:** Safari macOS uses `gesturestart`/`gesturechange`; Chrome/Firefox use `wheel` + `ctrlKey` (non-passive); touch uses Pointer Events. Always provide buttons as well. **Check:** test in Safari.

## T: Typography

**T1 · Uncontrolled font sizes.** **Seen:** Medical detail sheet notes at about 22px. **Rule:** Every text node uses a kit size token. **Check:** no computed `font-size` above the brief's stated maximums.

## I: Interaction

**I1 · Kinetic/motion text on interactive or editable text.** **Seen:** Goals title (G-06) and runway (G-22). **Rule:** No `hub-kinetic` on anything clickable or editable. **Check:** select, copy and edit the text.

**I2 · Fake links.** **Seen:** G-22. **Rule:** Clickable things are `<a href>` or `<button>` and work with the keyboard. **Check:** Tab + Enter.

**I3 · Dead buttons and silent empty states.** **Seen:** G-16. **Rule:** Every control does something visible in every data state, including empty. **Check:** run with an empty store.

**I4 · Cramped action rows.** **Seen:** Medical Next "MRCP… action [Add to Tasks]" squeezing the title onto 2 lines. **Rule:** A secondary action goes on its own line or becomes an icon button. **Check:** titles don't wrap because of controls.

## W: Wiring

**W1 · Relative fetch 404s on the umbrella.** **Seen:** G-36/37. **Rule:** Use `apiGet`/`apiPost` + `getApiBaseUrl()`. **Check:** `grep -n "fetch('/"` in the changed files returns nothing.

**W2 · Works in tests, not wired in production.** **Seen:** G-30 (a loader never passed in prod); Medical v2 episode join (tests pass, page shows a loose note). **Rule:** At least one test goes through the real controller/entry point. **Check:** name that test in the ledger.

## P: Process and honesty

**P1 · Ticking 100% without comparing to the mockup.** **Seen:** Goals v2 (13 items reopened); Medical v2 (34/34 claimed, 18 defects). **Rule:** Before ticking any UI item, put your screenshot next to the mockup/brief section and write the differences into the ledger. **Check:** each ticked UI item has a "diff vs mockup: none" or listed-deviation line.

**P2 · Branch built on a messy or stale base.** **Seen:** Medical v2 branch showing 310 files changed vs `main`. **Rule:** Branch from fresh `main`. The PR's file count should match the scope. **Check:** `git diff --stat origin/main...HEAD` touches only files the brief names, plus tests and docs.

**P3 · Silent half-fixes.** **Seen:** Medical v2 MO-05 (the vanishing note is still split from its episode). **Rule:** A fix item's check is the **user's original complaint reproduced and gone**, not an adjacent unit test. **Check:** the brief's "Adam says X → sees Y" scenario, run live.
