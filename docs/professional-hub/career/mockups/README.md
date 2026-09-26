# Career page — first mockup

Applications and Career merge into one **Career** page. The page is built
around evidence (which accrues every week) rather than applications (a few a year).

All names, schools, dates and percentages are placeholder data.

| File | Screen |
|---|---|
| `career-river.html` | One interactive page. Open it in a browser; it is not a static render |

## What is on the page

- **Career river.** Your past as one trunk (roles, evidence dots, past applications
  as arcs showing the outcome). At Now it forks into one branch per future role. Branch thickness =
  readiness %, branch length = estimated arrival (by school term). Diamonds are
  stepping stones. Numbered circles are shared steps that help several futures;
  branches stay bundled until their last shared step, so the **last fork** moves.
- **Hover a future, the past lights up.** Evidence dots that support the branch take its colour.
- **Neglected futures fade.** No new evidence for six months: "Still want it? Keep / Park".
- **Ghost paths (people who got there).** People in your Network who hold the role, drawn from
  where you are now, with their route and years. "Draft a coffee note".
- **A future Ann spotted.** Harvest notices a cluster of evidence pointing at a
  role you never added (dotted branch). Add it or dismiss it.
- **What if.** Drag a move onto the river (or tap it). Readiness, arrival and the
  fork point re-animate. The working-party move shows the fork sliding a year.
- **This week's harvest.** Ann's weekly scan of the hubs proposes evidence cards
  with source, APST tags, a drafted STAR answer, witnesses and branch fit.
  Keep puts a dot on the trunk; Edit and Bin work.
- **Applications + Criteria Mirror.** Paste criteria, see coverage per criterion
  with best evidence. Keeping harvest cards raises criteria 3 and 5 live. A red
  gap becomes a stepping stone on the branch and a task. Referees are ranked by how many of
  your cards they witnessed, with a drafted briefing each. Past applications
  keep panel feedback and the stepping stone it became.
- **Evidence ledger.** Filter by future.

## What the mockup assumes the data can do

- An `evidence` record: title, date, source refs (meeting, task, event, doc),
  framework tags, STAR text, witness person refs, branch relevance.
- A `future` (target role) record with criteria, stepping stones, parked state.
  Criteria come from a pasted ad or are drafted by Ann from a description.
- A weekly harvest job that reads Teaching, Tasks, Meetings, Events and Knowledge
  and writes *proposed* evidence only; nothing is stored without Keep.
- Ghost paths need role history on imported people profiles.
- Readiness = criteria coverage from evidence; arrival = remaining stepping stones.
