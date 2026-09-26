# Organisations redesign: decisions

Direction: `mockups/01–03` (v2, flowchart). Recorded 26/09/26.

## The idea
You face a person, but you stand inside an organisation. The Organisations page
keeps the People frame (crests, one model per page, live patching, Clare and Ann)
but asks different questions: what the organisation is to you, how it is run, who
you know in it, what it could offer you next, and how you got here.

## Layout
- `#/organisations` is a **crest wall** (list at 390). Potential opportunities run across the top.
- `#/organisations/<id>` is one organisation, with sections in this order:
  1. Header: crest, name, relationship chips
  2. **How it is run** (flowchart)
  3. **Ann's read**
  4. **Potential opportunities**
  5. **Your time with …** (arc)
- **Compare** puts two or three organisations side by side, as flowcharts joined by ghost lines.
- One heading per page. No Message button (as in People).

## What an organisation is to you: relationship chips
- One chip per relationship, with years or a count.
  - **Workplace** (current/former), **Studied**, **Placement**, **Member**,
    **Accreditation**, **Event venue**, **PD/event provider**, **You presented**,
    **Applied**, **Prospect**.
- An organisation carries as many chips as it has relationships. St. Aloysius is
  both Workplace and Event venue, and Trinity is both a former Workplace and a Placement.

## How it is run: containers, not 80 lines
- **Containers carry the structure.** Adam draws units (e.g. English faculty,
  Learning Enrichment, Accreditation mentors) and names each unit's head.
  Everyone in a unit reports to its head by default. Each head reports to the head
  of the unit above. Adam enters an arrow by hand only for an exception.
- **A person can sit in several containers.** Adam is an English teacher (English
  faculty), a gifted education teacher (Learning Enrichment), and an accreditation
  mentor who reports to the Director of Professional Learning. That's three
  memberships, so three reporting lines. He appears in each container, the
  appearances are linked, and every count de-duplicates him.
- **Arrows:**
  - A role or unit can report to more than one other (matrix).
  - **Shared authority** is a two-way arrow (e.g. Rector ⇄ Principal).
  - **Works with** is a dotted line with no arrowhead.
  - **Answers to an outside body** is a dashed arrow (e.g. to Jesuit Education Australia or a diocese).
- **Roles you haven't met** are dashed boxes. A role outlasts whoever holds it,
  so a role with no known holder still appears.
- **Your lines are in bold**, and there's one per membership. The Highlight control picks which.
- Every organisation draws its own layers. Nothing assumes a school shape.

## Features and who builds them

| Feature | Built by | Notes |
|---|---|---|
| Crest wall, chips, arc | Product | Reuses People Phase 1 crests (`logo_key`) and arc |
| Structure (units, roles, arrows) | Adam, in an edit mode on the page | Containers first, so the minimum is a few units and heads |
| Structure proposals | Ann, later | Proposes units, roles and arrows from documents in Knowledge (staff handbook, org charts). Adam confirms each one through the People link-proposal store |
| Flowchart layout | Product | Layered layout (`elkjs`, loaded only on this page). The unit order Adam sets is the order across each layer |
| Warmth dots and spreads | Product | Same `warmthFor(person)` as People Phase 3. No second number |
| Ann's read | Ann, daily | Looks at the organisation as a whole: where the real power sits, Adam's lines, gaps, culture, drift. Each thread shows its source. Adam can correct a thread, and his correction wins |
| Potential opportunities | Adam (manual add) now; **internet sweep: to be built** | Scholarships, PD, programs, roles, calls for presenters, grants. Institution-sized, never small tasks. The sweep is a separate later spec that writes into the same store |
| Bridges in Compare | Product rules | A link shows only if it gets Adam somewhere. Each one has a numbered, rule-written reason |

## Agent split
- **Ann O'Tation**: Ann's read, and structure proposals from Knowledge documents.
  This continues her widened professional remit from the People redesign.
- **Clare DeMind**: proposes organisation links from Tasks and Events (venue,
  provider, `studied_at`, `placement_at`). Uses the People link-proposal store.
- **Hammond**: flags an opportunity closing within 7 days when it matches an active goal.

## Delivery
- **One PR for the whole build**, not one per phase. Every PR costs real money.
  Phases are commits on one branch, with one progress ledger, and review happens once.
- Phases 6 and 8 need People Phase 2 and the sweeps. They go into those People
  PRs rather than a new Organisations PR.

## Not in scope
- Other staff's timetables, or any view of other people's availability.
- Sending anything. Opportunities link out, and Adam acts on them himself.
- The internet sweep itself (to be built, separate spec).
