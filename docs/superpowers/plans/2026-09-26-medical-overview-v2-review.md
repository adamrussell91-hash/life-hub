# Medical Overview v2: review of Cursor's screenshots (fix brief)

Branch under review: `cursor/medical-overview-v2-c420`. The ledger says 34/34, but the screenshots don't support that. **Un-tick the items below** in `docs/superpowers/progress/medical-v2.md`, fix them, and re-screenshot at 1440 and 390 in Safari against **the real data on life-hub**, not a demo fixture. The demo rail only shows Home/Chat/Calendar/Life/Body, and the river ends at Aug 2026.

## P0: broken

1. **Mini lab panel meters are unstyled (MO-27).** Root cause: every meter rule in `apps/life/css/app.css` (~l.3846–3866) is scoped to `#body-bloods-dashboard .bloods-meter …`. Inside the medical card, the track and band are invisible and the dot falls back to a black SVG fill, floating on its own line. Fix: rescope those rules to `.bloods-meter` (or add `.medical-card__labs .bloods-meter` equivalents) **and** add the `.bloods-row` grid layout for the compact variant, so that label | value | meter | status sit on **one row** at 1440. *Check:* each lab row ≤ 44px tall at 1440, the red dot sits on a visible track, and the green normal band is visible.
2. **The 26/09 cold note is still not in the episode (MO-04/05).** The river shows "26/09/26 Still congested, throat better" as a loose minor line, while the band says "23/09 → 24/09 · 2 notes". The Active Episode card says "day 4". Three components disagree. The 26/09 record must carry the same `episode.id`, and the band must read "23/09 → 26/09 · ongoing · 3 notes". Add a model test that builds the page from these three records and asserts one band with 3 entries and no loose minor line.
3. **The episode band sits at the wrong date.** It's rendered between 24/09 Gastro and 17/09 Bloods, i.e. at its *first* entry. An active episode sorts by its **latest** entry, so it sits directly under TODAY.
4. **Fake dates on planned items (MO-06).** The MRCP (`tbd`, `to_book`) shows as "26/09/26 · Imaging" under "SEPTEMBER 2026". Colonoscopy (`month`) shows "01/02/27". Never print a day for month or tbd precision: show "Feb 2027" / "To book". A tbd item goes in its own "TO BOOK" group at the top of UPCOMING, not under a month heading. The virtual Stelara dose must show "~22/10/26", with its own dashed style and the label "Dose", not "Prescription".
5. **The Mind lane is missing from the strip (MO-17).** Therapy (Kate Semple 04/09, 08/07) and Dr Hook (06/08) exist, so the thread mapping isn't matching the therapy lane or the provider keywords. Add a test per lane with the real titles.

## P1: layout doesn't match the brief

6. **The river doesn't fill the width (§4 rule 1, the #495 bug again).** On desktop the river column is ~410px wide and the right ~60% of the page is empty. The rail and cards should span the content width like the strip above it (the cards can cap their text measure at ~760px, but the column itself is full width). *Check:* the river's right edge = the strip's right edge ±1px.
7. **Cards have dead space.** The planned cards are ~110px tall for one line of information (the countdown sits on its own line, and there's big padding). The past Gastro and Stelara SC cards have empty bottoms, so there's a hidden `min-height` or fixed height somewhere; remove it. Fix per §2.3: **routine and planned = compact** (title + meta on 2 lines, with the countdown right-aligned on the title row). Major cards size to their content. *Check:* a planned card is ≤ 64px at 1440.
8. **The major Gastro card has no content (MO-24).** The mockup's detail pills are missing (Calprotectin 15 ↓ / GGT concern / MRCP ordered). Major cards must show up to 3 pills built from flagged markers and planned items linked to that visit.
9. **Strip labels collide (MO-21 not done).**
   - The TODAY line cuts through "Feeling ru|n do".
   - "Sore throat, s" is truncated.
   - "MRCP" overlaps its marker.
   - "233 ↑" and "68 ↑" stack on top of the TODAY line.
   - The "TODAY" axis label replaces "OCT".

   Run the collision pass for real (write the `getBBox` test from §4 rule 13), and keep the TODAY label on its own row above the month ticks.
10. **No biomarker ribbons (MO-19).** Only flat green normal bands are drawn across the full width. They read as progress bars, and there's no calprotectin 244 → 15 line and no GGT line. Draw the polyline through the actual marker values, and limit the band height to the lane.
11. **The strip's vertical rhythm is loose.** The lanes are ~70px apart with empty space below Acute. Use 44–52px per lane, and set the strip height from the lane count.
12. **Two identical Weeks/Months/Years pill sets are on screen** (strip + river toolbar). Remove density from the river toolbar, or rename it clearly; one zoom control per view. In the strip header, hide the zoom controls while the strip is collapsed (on phone they currently show under a collapsed header).
13. **The Next card is incomplete.** It shows only 3 items. Repeat bloods (early Dec) and gastro review (Mar 2027) are missing, so either the backfill didn't create them or Next is capped wrongly. The MRCP row wraps badly: "action" and "Add to Tasks" squeeze the title onto 2 lines. Put the Add to Tasks button on its own line under the title, or make it an icon button.
14. **The Health Brief is missing pieces (MO-13).** There's no Sara verdict line and no reference range on the Watch items ("GGT 233 ↑ · ref <60"). "Ordered 24 Sep" is an orphan line with no subject, and it isn't in dd/mm/yy format.
15. **The summary counts disagree.** The strip summary says "2 planned", while Next shows 3 upcoming items (and there should be 5).

## P2: phone (390)

16. **The toolbar wraps into 4 rows:** search, type, practitioner, pills, Hide minor, Places, Add. At < 720, show the search box plus one **Filters** button (a sheet with type, practitioner and show-minor), with Add as an icon button.
17. **The phone bloods rows are worse than desktop:** the dot, value and status each sit on separate lines. After P0-1, check them at 390 as a 2-row layout: label + value on row 1, then the meter bar + status on row 2.
18. **The desktop rail ends at ~690px** in the full-page capture, so check that the rail is `position: sticky/fixed; height: 100dvh` and not a fixed-height block.

## Definition of Done for this round

Before re-ticking, put each screenshot next to the matching mockup section in `docs/mockups/medical-overview-redesign.html` and list what's still different. Re-screenshot on real data (after `node scripts/medical-v2-backfill.mjs` dry-run → Adam runs `--write`).
