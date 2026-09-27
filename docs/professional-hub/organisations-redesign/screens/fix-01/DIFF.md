# Fix 01 Part A — screenshot diffs vs mockups

Screenshots from real `life-hub-data` assembly (27/09/26), not the Vite mock seed.

## `wall-aloysius-trinity-1440.png` / `390.png` vs `mockups/01-crest-wall.png`

| | Mockup | Live (real data) |
|---|---|---|
| St. Aloysius people | 82 | **56** (directory count) |
| Spark | Multi-step people line + event dots | **One dated person** (Adam `2025-01-22`); 55 undated omitted; aria states undated count |
| Warmth bar | Orange + blue segments | **All cold** (0 / 0 / 56) — ledgered, not restyled (A2) |
| Trinity spark | Different shape from Aloysius | **Empty spark** (0 dated people) — different from Aloysius (A1) |
| Event venue chip | Present on Aloysius | **Absent** — zero venue links in store (A7) |
| Surfaces | Cream mock | Kit `--paper` / `--line` (known kit deviation) |

## `aloysius-timeline-1440.png` / `390.png` vs `mockups/02-organisation.png`

| | Mockup | Live |
|---|---|---|
| Role mark | Bar "HSIE teacher · since Term 1 2025" to now | Bar **"Gifted Education Teacher"** to now (A3) |
| People line | Stepped area to 82 | Stepped area to **1** dated person; label "1 person" |
| Events / roles lanes | Several marks | Empty (no venue/event/role links beyond the one employment) |
| Header | "first contact Jun 2023" | **"you started Jan 2025"** (A8) |

## `halt-chip-1440.png` / `390.png` (A6)

Long Member detail truncates with ellipsis on one line; full text in `title`.

## Checked failure-register IDs

`L1 L6 S2 S4 V4 C1 C2 C3 C5 C6 D1 D3 D4 D5 D6 I3 W2 P1 P3 P4`
