# Catalogue restyle mockups (16 Oct 2026)

Three directions for the Programs catalogue, built from the real catalogue. Format, setting and entry
values are a keyword guess until Cursor's recatalogue lands.

1. [`1-departure-card.png`](1-departure-card.png): departure-board card, the same card in the
   catalogue, the personal line and the public page. Strand header, years as carriages, fare, tags, this
   year strip, next on your line. Phone bottom sheet on the right.
2. [`2-platforms.png`](2-platforms.png): catalogue grouped into platforms by line, with a format mix bar
   per line. Cards carry strand stripes, a format icon, mini carriages, setting icons and an entry mark
   (solid ring Individual, dashed ring Team).
3. [`3-timetable.png`](3-timetable.png): the catalogue as a year. One line and year level, rows grouped
   by format, term bands, today line. Solid pill confirmed dates, striped pill month only, diamond due date.

## Decision (Adam, 16 Oct 2026)

- 2 for the catalogue overview, with a rolling "next service" board per platform.
- 1 for the individual card, everywhere.
- 3 as the year overview.
- Year level and subject filters on 2 and 3.

Built in #873 with the personal line's own card, tokens and roundels. The next-service board rolls in
once when the page paints and steps on with **Later**; it doesn't loop on its own (UI failure register
M1: motion answers an action, then settles).
