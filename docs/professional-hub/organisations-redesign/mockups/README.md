# Organisations page redesign — first mockups

The People redesign's sibling. Same frame (crests, one model, live patching,
Clare and Ann), but an organisation is something you stand inside, not someone
you face, so each section asks a different question.

All names, roles and dates are placeholder data. Crests are shield monograms
until Adam supplies real logos.

| File | Screen |
|---|---|
| `01-crest-wall` | Directory. Potential opportunities across every organisation (scholarships, programs, roles, calls for presenters), filter by relationship (work, study and placement, events and PD, professional bodies, prospects), then crest tiles. Each tile has relationship chips with years, the warmth spread of everyone you know there, and a small arc |
| `02-organisation` | One organisation. Relationship chips, **How it is run**: a flowchart with the organisation's own layers. Arrows point to who each role reports to, dashed arrows to outside bodies (owner, employer), and dotted lines mean "works with". Your reporting line is in bold, dashed nodes are roles you haven't met, and teams show as clusters of warmth dots. **Ann's read** (the organisation as a whole: where the real power sits, your line, gaps, culture), **Potential opportunities** at institution scale (positions, programs, study funding), and **Your time with…** (lanes for work, events and roles over a people-count line) |
| `03-compare` | Two flowcharts side by side, each keeping its own shape (a Jesuit school with seven layers, a diocesan school with five). Ghost lines join people who connect them (moved between them, know each other, met at an event). A line only shows when it gets you somewhere, and its number matches a reason in **What these links give you** |

## What the mockups assume the data can do

- **Positions and reporting lines.** The flowchart is built from positions (roles that
  outlast the people in them) joined by `reports_to`, plus outside bodies with
  `governed_by` / `employed_by`. People hold positions through `employee_at`.
  None of this is in the registry today.
- **More relationship kinds to organisations.** `studied_at`, `placement_at`,
  "you presented at", and "accreditation mentor" as a role. Today there's
  `employee_at`, `member_of`, `venue`, `provider` and `applies_to`.
- **Ann's facts store** takes a `subject_ref` that can be a person or an organisation.
- **The "useful link" rule** (03) needs warmth (People Phase 3) and opportunities.
- **Opportunities** need Ann to read organisations' newsletters, sites and bulletins, and to
  store each find with its source and closing date.

Render: `./generate-fonts.sh && ./render.sh` (Playwright's headless Chromium shell, 1680 wide).

## Buildability (checked against `main`, 26/09/26)

| Need | Status |
|---|---|
| Several managers per role, several reports per manager | Supported. Every registry relationship is `many_to_many` |
| Reporting lines that change over time (restructures) | Supported. `temporalMode: 'period'` gives `valid_from` / `valid_to` |
| The same person reporting differently in two organisations | Supported. Links carry `context_ref`, so scope each `reports_to` to its organisation |
| Two-way arrows (shared authority, co-leaders) | New: a symmetric relationship type (`shares_authority_with`), hashed with its two ends in a fixed order so A⇄B and B⇄A are one link. Drawn with arrowheads at both ends |
| Dotted "works with" | New: a symmetric type, like `professional_relationship` today |
| Roles you haven't met, teams | New entity kinds: `shared:position` (a role that outlasts its holder) and `shared:unit` (a faculty or team). People fill positions through `employee_at` |
| Outside bodies above the organisation | New: `governed_by` / `employed_by`, organisation → organisation |
| Layout | The mockup places nodes by hand. The real page needs a layered graph layout that handles several parents, cycles, two-way edges and teams nested in faculties. `elkjs` (layered, orthogonal routing, compound nodes) loaded only on this page, with the positions you drag saved per organisation. The existing `d3-force` is for Network Ecology's web, not hierarchies |
