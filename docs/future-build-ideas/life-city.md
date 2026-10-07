# Life City

**Status:** Under critical review. Not scheduled and not a build brief. The review below decides what survives
**Started:** 7 October 2026, as a chat thought experiment
**The city's name:** Metropolis. Me-tropolis: the city is Adam, not Sydney.
**One line:** An isometric, Transport Tycoon style city that shows the live state of Adam's whole life at a glance, driven entirely by Life Hub data.

---

## Critical review (read this first)

**Date:** 7 October 2026, after round 6. Every card has been played. Before anything moves forward, this review sorts every concept in the doc into one of three verdicts. It was checked against the Life Hub code on `main`, not against the doc's own claims.

| Verdict | Meaning |
|---------|---------|
| **Keep** | Works as written, within the corrections in this review |
| **Modify** | The need is real, but the mechanism as written will not work. The change that makes it work is stated |
| **Cut** | Will not work, duplicates something Life Hub already has, or costs far more than it returns. Cut ideas stay in section 7 as a record, but they are out of scope |

Proposals are referred to as P1 to P18, as numbered in section 7.

### The short version

The **street** survives: a calm isometric city that shows goals, projects, tasks, blockers, the capacity weather and one decision at a time, with a "since you were last here" catch-up. That is the part only a city can do, and it is worth testing.

Most of what came after it does not survive as written. Rooms, walks, workshops and foldout worlds turn the city into a second front end for Life Hub, need bespoke art no tool in the pipeline makes, or depend on hubs that do not exist yet. The two big round 6 ideas (planning law for agents, and the dam) are good, but they are **Life Hub features**, not city features, and they belong in their own doc.

Count across the register below: **42 Keep, 43 Modify, 30 Cut.** The delight features (festivals, Adam's pets, keepsakes and whale watching) came back in on Adam's call, rebuilt so they are cheap to draw. Museum shelves and bundles stay cut, also on his call.

### Metropolis: the city is Adam

Adam's ruling: the city is not Sydney. It is **Metropolis**, a city made of him. Every place in it exists because of something in his life, not because of a real map.

- **Geography comes from his life.** Districts are his hubs, landmarks are his milestones, the skyline is his work, and his keepsakes and pets live in it. Water, a bridge or a headland appear only if they serve that, not to echo Sydney Harbour.
- **No real city is copied.** The north shore and south side, Sydney's buried creek, sandstone, the jacaranda story and the plate about the land's older name all come out.
- **Seasons are his seasons.** The almanac follows the real date where he lives, but its entries are the ones he chooses. The whales stay because he wants them.
- **Real-world research stays as research.** Sydney Metro's driverless trains, the Waratah occupancy screens, the 2019 dam levels and NSW planning law are still the precedents behind the ideas. They explain why a mechanic works; they do not put Sydney on the map.
- **Section 7 keeps the old name.** Proposals P1 to P18 say "Harbour City" and use Sydney throughout. They are left as written, as a record. Read "Metropolis" wherever they say "Harbour City".

### Checked against the code

| What the doc assumes | What the code says | Effect |
|----------------------|--------------------|--------|
| Lines, Branch, Orbit and the Day Dial exist, with a pace ghost | True (`graph-lines.ts`, `graph-branch.ts`, `graph-orbit.ts`, `daily-dial.ts`, `ghostAt`) | The "one snapshot, many lenses" idea is grounded |
| Tasks can be shared by several goals or projects | True (`linked_project_ids`, `linked_goal_ids`) | Interchanges are real |
| Blockers and waiting-on-others are recorded | True (`blocked_since`, `waiting_on`, `waiting_status`) | Held buses and a mail van have a data source |
| Capacity forecast, `capacityForDates`, 30 weather states | True | The sky rule is buildable |
| School terms in prefs | True (`school_terms`) | Term editions are buildable |
| Saved constellations, seeded sky | True (`SavedConstellation`, `buildSkyLayers`) | Pin placement can copy it |
| Liveness filters | True (`withoutDeleted`, `isOpenTask`) | Deleted-means-gone is enforceable |
| Capabilities are `auto` or `confirm` | True: 76 of each. A Governance Log exists (`data/governance/governance-log.md`) | P18's planning law has a real base |
| Home widgets | True | A Home tile is the cheapest first surface |
| **A city event log** | **Does not exist.** Tasks keep `created_at`, `completed_at` and `trashed_at`. Nothing records blocked to unblocked, walls placed or lifted, reschedules or reopenings | Rewind, the catch-up, every replay, the Old City and the newspaper rest on something that is not there |
| **Dreams are the top of a hierarchy** | **No.** A dream is a Someday task (`someday_kind: dreams_jar`), not a level above goals | "Intercity rail with stops" has nothing to draw |
| **A life wall is a road closure** | **No.** A wall is a whole-day date span (`starts_on`, `ends_on`, `label`). It has no place and no time of day | Detours, reroutes and "not accepting passengers" carriages have nothing to draw |
| Writing, house records, collections and recipes have homes | No. They are gaps in the Notion → GitHub gap map | Every room built for them is a hub built in the wrong place |

### Ten problems that cut across many ideas

**F1. There is no event log.** Fix: version 1 of the catch-up uses the timestamps that exist (created, completed, archived, trashed). If Rewind is wanted, add a small append-only log at the Tasks write path that stores ids and event names only (P5's rule). History starts the day it ships and is honestly partial before that. No backfill is invented.

**F2. A spatial picture of time-based facts.** Life walls, due dates, terms and blocks are about *when*, not *where*. A bus cannot detour around a date. Fix: a wall becomes a **service suspension** on those dates. P1's own GTFS vocabulary already has this (`calendar_dates` exceptions). The line simply does not run. Detour shapes, the `vehicle_off_shape` detour exception, the life-wall golden day and "Hammond reroutes the city" all change to match.

**F3. The top of the hierarchy is wrong.** Dreams are a Someday list. Fix: dreams stay off the network. If they appear at all, it is as a departures board for unscheduled trains at the edge of the map, with no stops and no arrival time.

**F4. The city keeps becoming a second front end.** P3, P6, P9, P12, P15 and P16 build rooms with editors, desks, tables and workspaces that redo what hubs do. Fix: **every door opens the owning hub page.** The city never hosts an editor. A domain with no hub needs a hub first. That is a Life Hub build, not a Life City build.

**F5. Art cost.** Kenney covers the street. Foldout trunks, watch-mechanism stations, fragrance-bottle gardens and book theatres each need bespoke illustration in one consistent style, and the folder README says plainly that none of the build tools can do that. Fix: cut the bespoke worlds. Delight comes from what is cheap to draw well: lighting, particles, recolours, the almanac, photo slots and one AI-assisted hero piece at a time under a locked style reference. Festivals, keepsakes and Adam's pets are built on that basis.

**F6. The central promise is unproven.** "Feel the state of your life without reading" is a hypothesis. Fix: P10's glance test comes before anything else is built, and the project stops if it fails.

**F7. Too many validator rules, and many cannot be tested.** About 45 rules were added across six rounds. Rules like `scenery_read_as_signal`, `named_student_on_street`, `quiet_read_as_failure` or `ground_from_records` are judgements about a picture, not checks on data. Fix: about a dozen data-level rules become unit tests. The rest move to a design review checklist.

**F8. Too many "what's next" surfaces.** Tasks already has a focus strip, a dashboard, the Day Dial and Lines. A departures board plus a Platform with three doors would be the fifth and sixth. Fix: a phone surface ships only if it replaces or upgrades one that already exists. Otherwise the phone gets the Home tile and the full city stays a wide-screen view.

**F9. A three-tool build split.** Separate back end and renderer builders on a shared contract add coordination cost to a one-person product. Fix: still write the contract and tests first, then give one builder each whole slice, end to end.

**F10. Agent governance does not belong in a visualisation doc.** The Life Environmental Plan and the drought plan change what agents may do without asking. That needs its own spec and a security review before any capability skips confirmation.

### Verdict register

#### Foundations and data

| Concept | From | Verdict | Why, and what changes |
|---------|------|---------|-----------------------|
| Feel the state of life at a glance | Base | **Keep** | The whole point, but unproven (F6) |
| One snapshot, many lenses | P2 | **Modify** | Right principle. Do not refactor working views onto a new snapshot. The city reads the same selectors Lines already uses, moved into one shared module |
| City events contract | Base §5 | **Modify** | Derive events from record changes and timestamps (F1). Replace `wall.placed` and `wall.lifted` with a service suspension (F2) |
| GTFS-shaped vocabulary | P1 | **Modify** | Borrow the nouns (route, stop, trip, calendar exception, alert) and use calendar exceptions for terms and walls. Do not build GTFS files, `stop_times`, `shapes` or `frequencies`. Nothing will ever read them |
| Rewind as an event-log replay | P5 | **Modify** | Right principle, but the log does not exist (F1) |
| Deleted means gone, including from the past | P4, P5 | **Keep** | Enforceable with the existing liveness filters |
| Never-reflow layout that expands at its edges | P10 | **Keep** | Simpler build: a grid of reserved slots per district at Beck's 0, 45 and 90 degree angles. No mixed-integer solver |
| Pinned buildings, like constellations | P5 | **Modify** | Store tile and footprint only. Rotation and scale mean little in a fixed isometric view |
| Validator and golden days | P7 | **Modify** | Keep about a dozen data rules and four golden days as tests (F7) |
| City inspector overlay | P7 | **Cut** | A developer nicety. Later, if ever |
| Who builds what | Base §5 | **Modify** | One builder per slice (F9) |
| No Notion, no day-to-day finance | All | **Keep** | — |

#### Mapping life to the network

| Concept | From | Verdict | Why, and what changes |
|---------|------|---------|-----------------------|
| Goals as metro lines, projects as bus routes, tasks as stops | Base | **Keep** | Matches `parent_goal_id` and `parent_project_id` |
| Shared tasks as interchanges | Base | **Keep** | Real data (`linked_*_ids`) |
| Dreams as intercity rail | Base | **Modify** | F3 |
| Routines as tram loops | Base | **Keep** | Cap the number of loops shown. Daily skincare, macros and check-ins would otherwise fill the map |
| Cross-hub links as ferries | Base, P2 | **Keep** | Only where a stored link exists, as P2 says |
| Buses are momentum | Base | **Modify** | Define it: tracked work sessions and completions in the last seven days. Otherwise it is arbitrary |
| Pace ghost vehicle | P2 | **Keep** | `ghostAt` exists |
| Vehicles always sit on their route | P2 | **Keep** | — |
| Life wall as a track closure and detour | Base | **Modify** | F2: a service suspension |
| Blocker as a red signal | Base | **Modify** | Red breaks the channel budget. Use a barrier shape, sourced from `blocked_since` |
| Marking weeks as congestion | Base | **Keep** | Only when marking tasks are actually in the graph (P8) |
| Term editions | P8 | **Keep** | `school_terms` exists |
| A booked trip is not a dream | P3, P8 | **Keep** | Travel legs exist |
| A finished project becomes a landmark | Base | **Modify** | Dozens a term would swamp the map. Landmarks are for goals and for projects Adam chooses. Everything else gets a small plaque |
| Fireworks for a completed goal | Base | **Keep** | Small, one burst |
| Skyline height grows with hub busyness | Base | **Cut** | Reflows the layout, hides roads and gives height a second meaning |
| Grey empty park for skipped exercise | Base | **Cut** | Already reversed by P6 and P11. It is a neglect meter |
| Sydney geography: work on the north shore, life on the south side, the bridge as the commute | P1 | **Cut** | Adam's ruling: the city is Metropolis, not Sydney. Districts are laid out around his hubs. A link between work and the rest of life can still exist, but it is not the Harbour Bridge |
| Work-to-life link jam as the share of the week work takes | P1 | **Modify** | Define it from scheduled teaching hours against all scheduled hours that week. Drawn on whatever link joins the work district to the rest of the city |
| Trip planner with an expected arrival date | P1 | **Modify** | Only from the existing pace model. With no pace, no arrival date is shown |

#### Services and signals

| Concept | From | Verdict | Why, and what changes |
|---------|------|---------|-----------------------|
| Ambulance for medical appointments | Base | **Keep** | Only for a dated appointment record |
| Food truck for meals and macros | Base | **Modify** | Several meals a day would make it permanent noise. It shows only while a logging window is open and unlogged |
| School buses for teaching load | Base | **Keep** | — |
| Mail van for messages awaiting a reply | Base | **Modify** | Life Hub has no message inbox. Point it at `waiting_status: follow_up_due` instead |
| Construction cranes for new projects | Base | **Keep** | Folds into the planning lifecycle |
| Sky is the capacity forecast | P4 | **Keep** | Essential correction |
| Day and night from the real clock | Base | **Keep** | — |
| A vehicle, depot and uniform for every agent | P1 | **Modify** | Ten uniform colours clash with route colours under the channel budget. Keep vehicle *types* that read as themselves (ambulance, school bus, food truck, tram). Drop uniforms, the street sweeper and the lighthouse beam |
| Driverless versus staffed trains | P1 | **Modify** | A driver is unreadable at Kenney scale. A pending confirmation is the halo. "Lines go driverless as trust grows" describes a feature that does not exist |
| Pressure ring for a late task | P1 | **Modify** | The one "late" shape. It triggers from a passed due date, not from days untouched, which would be a neglect meter |
| A pin on every unrouted task | P11 | **Modify** | The inbox can hold dozens. Show one count at a depot instead |
| One open door, the rest counted at the depot | P8 | **Keep** | The strongest signal idea in the doc |
| Every signal has an owner, a reason and a destination | P6 | **Keep** | — |
| Channel budget | P10 | **Keep** | A governing rule |
| Glance test | P10 | **Keep** | A governing rule |
| Idle by default, dimming at night | P10 | **Keep** | — |
| Info views only on request | P11 | **Keep** | Later |
| No neglect, scores, meters or timers | P11 | **Keep** | — |
| Farewell ferry for an archived route | P11 | **Modify** | One beat inside the catch-up, not a separate ceremony |
| Sound off, using the existing chimes preference | P2 | **Keep** | — |

#### Surfaces

| Concept | From | Verdict | Why, and what changes |
|---------|------|---------|-----------------------|
| Life Hub Home tile | P10 | **Keep** | The first surface to ship. Home widgets already exist |
| Station clock mode on a spare screen | P10 | **Keep** | Cheap: full screen, dimmed, no controls |
| Wide interactive city | Base | **Keep** | Desktop and tablet |
| Departures board | P1 | **Modify** | Check it against the focus strip, dashboard and Day Dial (F8). Ship only if it replaces one |
| The Platform phone screen | P7 | **Modify** | Sign, one decision, then departures. Drop the ceiling strip and the three doors |
| Three questions: Decisions, Fits now, Where was I | P6 | **Modify** | Keep Decisions. "Fits now" duplicates the scheduling capabilities. "Where was I" needs rooms, which are cut |
| Knowledge sky on the concourse ceiling | P2 | **Cut** | Fails the glance test. The Universe view already exists. A door to it is enough |
| Occupancy train | P4, P6 | **Modify** | Timetable layer only: free time, overlaps and protected time from the calendar and blocks. No crowding words. The outlook stays in the forecast panel |
| Drag a passenger to reschedule; Clare reserves a seat | P4 | **Cut** | The Day Dial already reschedules, and confirmations already exist |
| The week as seven trains | P4 | **Cut** | The capacity forecast already has a Week view |

#### Time

| Concept | From | Verdict | Why, and what changes |
|---------|------|---------|-----------------------|
| "Since you were last here" catch-up | P10 | **Modify** | Version 1 runs from timestamps (F1). Blocks, unblocks and walls wait for the log. The page-visibility rule for a real visit stays |
| Rewind scrubber | P4, P5 | **Modify** | Works from the day the log ships |
| Forecast scrubber with an uncertainty band | P4, P5 | **Modify** | Only as far as the forecast horizon and real due dates reach. Beyond that, it says "no data" |
| Term timelapse and end-of-term lights | P4 | **Modify** | Once a full term of log exists |
| New Year's Eve fireworks replay | P4 | **Cut** | A duplicate of the term replay. Keep one |
| Year on year, side by side | P4 | **Cut** | Needs a year of log, and is a double render for little gain |
| Save the replay as a video | P4 | **Cut** | Effort for a rarely used export |
| What a past room may show | P5 | **Cut** | Goes with the rooms. Doors open hubs, which show their current state |

#### Planning

| Concept | From | Verdict | Why, and what changes |
|---------|------|---------|-----------------------|
| Vacant lots for gap-map domains | P1 | **Keep** | Cheap and honest. Keep the list as a small data file in the repo |
| Two states: home exists, records arrived | P3 | **Keep** | — |
| Personal landmarks Adam places | P1 | **Keep** | — |
| Planning lifecycle by line style | P7 | **Modify** | Vacant, under construction, open, retired. Drop "proposed", which depends on the model table |
| Model table of possible futures | P6 | **Cut** | A planning product. If wanted, build it in Tasks |
| Plans overlay of dashed alternatives | P7 | **Cut** | Depends on the model table |
| City Hall of competing futures | P16 | **Cut** | Depends on the model table, and multi-agent debate is expensive |

#### Rooms and records

| Concept | From | Verdict | Why, and what changes |
|---------|------|---------|-----------------------|
| Rooms as workspaces inside the city | P3 | **Cut** | F4. Doors open hub pages |
| Records office, service centre, design workshop, writing studio, collection arcade, market kitchen, treatment rooms | P3 | **Cut** | These are hub gaps. Build hubs first, then the city gets a door |
| Book idea desks | P3 | **Cut** | There is no Writing hub |
| Saved activities across hubs | P3 | **Cut** | A cross-hub collections feature. It belongs in Life Hub, if anywhere |
| Stardew-style bundles | P11 | **Cut** | Adam's call: not for him. Tasks already handles checklists |
| Museum shelves | P11 | **Cut** | Adam's call: he does not like them |
| Focus sessions inside rooms, and interrupt rules | P6, P8 | **Cut** | Work sessions already exist in Tasks |
| Guided walks and the accreditation walk | P9 | **Cut** | Reading-heavy and authored. The Professional hub is the place, if anywhere |
| Idea Exchange and unexpected pairings | P9 | **Keep** | Adam's call: a good idea, built in the Knowledge hub as a Knowledge feature. It is out of Life City's scope |
| Exchange Station: where a fact came from, and how fresh it is | P16 | **Modify** | A real need. Build it as a plain data-status list in Life Hub, not an underground city |
| Repair Arcade for broken links and failed imports | P16 | **Modify** | Same: a plain list with repair actions |
| Receiving dock for imports | P16 | **Modify** | A Notion migration status page, outside the city |
| Old City of archived chapters | P16 | **Cut** | Duplicates Rewind and the archive |
| City newspaper | P16 | **Cut** | Possibly later, as an export of the catch-up |
| Relationship pavilions | P16 | **Cut** | Sensitive, and Life Hub has no personal-relationships model |
| Night programme | P16 | **Cut** | Every venue in it is cut |

#### Explore and atmosphere

| Concept | From | Verdict | Why, and what changes |
|---------|------|---------|-----------------------|
| Glance and Explore as separate modes | P12, P13 | **Keep** | With the worlds cut, Explore is a free camera over the same city for now |
| Atmosphere never borrows the signal vocabulary | P13 | **Keep** | — |
| Foldout travel trunks and destination worlds | P12 | **Cut** | F5 |
| Watch station, fragrance conservatories, book theatres, Delft set | P12 | **Cut** | F5, and no collection hubs exist |
| Keepsakes that reshape the city | P12 | **Keep** | Adam makes each keepsake himself, styled and animated to suit the city, and places it personally. The city needs only a sprite spec (isometric angle, tile size, frame count) and a way to import and pin his piece. No agent or tool generates keepsakes |
| Adam's pets, alive in the city | P12, revised by Adam | **Keep** | Adam's pets come back as small animated characters who live in Metropolis. Each is drawn once from his photos in the locked city style, as one hero piece per pet with a short walk cycle. In Glance they rest in a spot he chooses (the front step, under the fig, the seawall), so their stillness never reads as a signal. In Explore they wander the footpaths, the park and the foreshore. Tap one to see a photo or memory he chose. They are never scored, never in the catch-up, never linked to a task, and no agent can change them. The garden stays as somewhere they return to |
| Adam's almanac on land and water | P13 | **Modify** | Driven by the real date where he lives, with entries he chooses rather than Sydney's (whales stay because he wants them). Palette and sprite swaps, static in Glance. Cheap delight |
| Personal almanac dates | P13 | **Keep** | Later |
| Whale watching | P13 | **Keep** | Later. Whales are in Adam's almanac because he chose them, so this is a camera position over the water in whale months |
| Census of ordinary places | P14 | **Modify** | A handful of static scenery buildings with time-of-day states (shutters up or down). No walking figures, no per-figure timetables, no enterable cutaways |
| Crowd at the school gate | P14 | **Modify** | Gate open or shut only. No figures, which is safer and cheaper |
| Fig Corner, sandstone and the foreshore path no route may use | P17 | **Modify** | Keep the form: one named corner and one public edge that no route or life wall may close. Adam names the corner. The Sydney material (sandstone, the buried creek, the drowned valley) comes out. Drop the validator rules about it |
| The plate about the land's older name | P17 | **Cut** | It belonged to the Sydney setting. Metropolis is not a real place |
| Festivals: Balloon Gathering, winter snow dome, thaw, spring and summer festivals, solstice chamber, term-end paper theatres | P15 | **Modify** | They give the city life. Start with one festival, built mostly from lighting, particles and recolours rather than new illustration. Snowfall and dusk glow are cheap; bespoke scenes are not. The Balloon Gathering fits best, because the dreams jar is real Someday data: each balloon is a dream Adam chooses, with the "Do you still want this?" ribbon. Explore only, clearly labelled, with the forecast still in its panel |
| Revising the sky rule for festivals | P15 | **Modify** | Accept P15's own version: a labelled festival scene in Explore can have its own sky. The Glance sky never changes and fictional weather never picks a capacity icon |
| Ask the stationmaster | P13 | **Modify** | A later phase, on the city lens only at first. Define the query schema before any language model is involved. The health, diary and student scope rule stays |

#### Agent governance (P18), moving to its own doc

| Concept | Verdict | Why, and what changes |
|---------|---------|-----------------------|
| Life Environmental Plan: exempt, complying and DA lanes | **Modify** | The core is right: written criteria per capability, grouped confirmation that still shows each diff, variations with reasons, and "you've varied this four times, amend the plan?". It needs its own spec and a security review (F10) |
| Zoning the week | **Modify** | Overlaps life walls, work blocks and the planning profile (`planning-profile.ts`). Reuse those rather than adding a fourth system |
| The dam: four-week average readiness | **Keep** | Small, uses `capacityForDates`, reads as one gauge |
| Drought plan | **Modify** | Version 1 shows Adam his own if-then plan when the dam crosses his lines. Nothing changes agent behaviour automatically |
| Heritage register | **Keep** | A protected flag that no agent may propose changing. A Life Hub feature |
| Census pyramid, street addresses, time capsules | **Cut** | Parked as one-liners |

### What Life City is now

**Metropolis**: a calm isometric street, wide screen first, with a Home tile. It shows goals, projects and tasks as lines, routes and stops. Blockers are barriers. Walls are suspended services. The sky is the capacity forecast. Ambulance, school bus, food truck and tram vehicles appear only when real records call for them. There is one halo for the one decision that matters, a depot count for the rest, the Sydney almanac as scenery, and a short "since you were last here" catch-up when it opens. Everything else is a door into the hub that owns it.

### Revised build order

1. **Selectors and fixtures, no picture.** A pure function from Tasks, capacity and term data to a city snapshot. About a dozen data rules and four golden days as failing tests: the Sunday 16:30 day, a suspended service, deleted yesterday, and a no-check-in morning.
2. **Glance prototype.** A static Kenney street for those golden days, following the channel budget, with one halo and a catch-up built from timestamps. Run P10's three-second glance test with Adam. **If it fails, stop here.**
3. **Home tile and the wide city page on live data.** Desktop only.
4. **Event log.** Append-only and ids only, at the Tasks write path. This unlocks the full catch-up.
5. **Delight.** Adam's pets first, then the almanac, vacant lots, personal landmarks and keepsake slots. Then the first festival (the Balloon Gathering) and whale watching.
6. **Time tools.** Rewind and Forecast once there is a term of log, then the term replay.
7. **Ask the stationmaster,** city lens first.

These run separately, in their own docs, as Life Hub features: the agent planning lanes, the dam and the heritage register (one doc), a data-status and repair list, and a Notion migration status page.

### Decisions Adam needs to make before anything moves

1. **Glance or visit?** This review assumes a glance tool first, with Explore reduced to a free camera. Is that right?
2. **Phone.** Wide-screen city plus a Home tile, or a phone departures board that replaces an existing Tasks view? If the board, which view does it replace?
3. **Event log.** Approve a small append-only log in Tasks? It is a Life Hub change, and the time tools depend on it.
4. **Split out governance.** Move the planning lanes, the dam and the heritage register into their own doc?
5. **The glance test.** Will you sit the three-second test on a few golden days? It decides whether stage 3 happens.

---

## 1. The idea

Life Hub already has a "universe" knowledge view and a synaptic chart of notes. Life City is a third kind of overview: a living city with trains, metro, buses, trams and ferries moving around, being rerouted and growing over time.

The point is that you **feel** the state of your life without reading anything. An ambulance with its lights on tells you a medical reminder is close. A gridlocked street tells you a project is blocked. A skyline that has grown over months tells you how much you have built.

The Tasks Hub is the natural seed. Its **Lines** view already treats projects as transit lines and tasks as stations, and "The Weight Line" transit map was kept in the design kit as a future graph. Life City extends that into a full city.

## 2. Mapping life to city

### Network (the hierarchy)

| Life Hub | City | Notes |
|----------|------|-------|
| Dreams | Intercity rail | Long, slow, few stops. Can run off the edge of the map |
| Goals | Metro lines | The backbone. Each goal gets its own line colour |
| Projects | Bus routes | Many of them, flexible, rerouted often |
| Tasks | Stops and stations | Not vehicles (see below) |
| Tasks shared by several goals or projects | Interchanges | A delay here ripples across several lines |
| Recurring routines (macros, bloods, Mind check-ins) | Light rail / tram loops | Same circuit every day |
| Cross-hub links (a school project feeding a personal goal) | Ferries | Cross the harbour between districts |
| Hubs | Districts | Teaching, Body, Mind and so on |
| Named AI agents | Vehicles and city services | Agents visibly travel the lines doing work |

### Buses are momentum, not task count

If buses equalled tasks, a 40-task project would gridlock the street. Instead:

- **Tasks are stops** along the route
- **Buses are active work** moving between stops
- More buses on a route means more momentum. A stalled project has one bus idling at a stop

### States and live events

| Life Hub state | City visual |
|----------------|-------------|
| Task done | Its stop lights up as the bus passes, so finished sections of a route glow |
| Routine done today | Tram completes its loop and turns green; grey if missed |
| Project done | Route retires; last stop becomes a small landmark (statue or plaza) |
| Blocker | Bus waits at a red signal with a warning icon |
| Life wall (immovable item) | Track closure; buses reroute around it |
| Marking shadows | Peak-hour congestion |
| Term rhythm | Timetable changes between school weeks and holidays |
| Agent awaiting confirmation | Vehicle paused at a station |
| Goal completed | Fireworks over the harbour |

### City services (glanceable reminders)

| Signal | Meaning |
|--------|---------|
| Ambulance, lights on | Medical appointment or bloods test coming up |
| Food truck in the plaza | Meal or macros due; drives off once logged. Brisket Lasso could be the driver |
| School buses | Teaching load; more in heavy weeks, quiet depot in holidays |
| Mail van | Messages waiting on a reply |
| Construction cranes | New projects being set up |
| Weather | The capacity forecast's weather state (Adam's 30 icons, `docs/capacity-forecast-handoff/weather-states.md`). Corrected in round 2 |
| Day and night | Real time; lit windows show what is still open tonight |
| Grey, empty park | Exercise or downtime skipped for a while |

### The city grows

New things are generated from data, not drawn by hand:

- **New project:** a construction crew lays a new bus route along existing streets
- **New goal:** a metro line opens, with a crane building its station
- **New dream:** an intercity line extends off the map
- **New hub:** a whole district appears
- **Finished work:** becomes a permanent landmark

Over months the city becomes a visual record of everything built. A later idea: building heights reflect how busy each hub is, so the CBD skyline grows in heavy marking weeks.

## 3. Visual direction

- **Style:** Kenney's isometric art. Adam confirmed this is the look ("spot on"). Clean, flat, friendly toy city
- **Why Kenney:** every pack shares one style, so later additions (new vehicles, landmarks, districts) automatically match. Licensed CC0 (public domain), so assets can be recoloured for Life Hub line colours and agent uniforms
- **Useful packs:** Isometric Vehicles #1 (includes an ambulance, police, garbage truck, taxi and civilian cars in five colours), Isometric City, Isometric Buildings, Isometric Landscape, City Kit (Roads / Commercial / Suburban) for 3D
- **Reference image:** a glossy isometric city illustration Adam shared; Kenney is simpler than it but closer to what is buildable and consistent
- **AI-generated art:** only for one-off hero pieces (landmarks, the food truck). Lock a style reference first (angle, palette, outline weight) and expect cleanup to fit the grid

### 2D or 3D

| Option | Pros | Cons |
|--------|------|------|
| 2D isometric sprites (PixiJS) | Fixed tycoon angle, light, smooth on phone | No rotation |
| 3D City Kits (Three.js, fixed angled camera) | Can rotate, zoom, fly over districts | More work |

**Current lean:** start 2D. The city events (section 5) do not change, so moving to 3D later is a renderer swap.

### Buildings hiding roads

Tall isometric buildings hide roads and vehicles behind them. Options:

1. **Plan the layout:** tallest towers at the back, low buildings and parks in front of busy roads
2. **Smart fade:** a building goes see-through only when something important is behind it (ambulance, blocked bus)
3. **Silhouettes:** vehicles show as an outline through buildings
4. **Transit view toggle:** one tap flattens buildings to footprints so the whole network shows

**Current lean:** 1 plus 2.

## 4. Borrowing from OpenTTD

OpenTTD (open source Transport Tycoon Deluxe) is a reference for **ideas and mechanics only**. It is GPL licensed, so do **not** copy its code or graphics into Life Hub. Mechanics worth studying:

- Vehicle **orders** between stops (tasks)
- **Pathfinding** when track closes (life walls)
- **Signals** holding a train until the line is clear (blockers)
- **Depots** where vehicles wait (paused agents)
- **Transparency toggle** for buildings
- Towns growing around transport (the city grows)

Life City needs a tiny fraction of OpenTTD: no money, no crashes, no freight economy.

## 5. Architecture sketch

- **Data source:** Life Hub only (tasks, projects, goals, dreams, routines, agents, reminders, Mind check-ins). No Notion
- **City events contract:** the back end emits a small set of events and the renderer only listens to those. Draft list:
  - `route.opened` / `route.retired` (project created / done)
  - `line.opened` (goal), `intercity.extended` (dream), `district.opened` (hub)
  - `stop.completed` (task done), `stop.blocked` / `stop.unblocked`
  - `wall.placed` / `wall.lifted` (life walls)
  - `vehicle.dispatched` / `vehicle.paused` (agent activity, awaiting confirmation)
  - `service.dispatched` (ambulance, food truck, mail van) with a `reason`
  - `routine.completed` / `routine.missed`
  - `city.weather` (the capacity forecast's weather state for that hour), `city.clock` (real time, term rhythm)
- **Layout engine:** deterministic placement, so a project's route stays in the same place between visits. A building Adam has placed keeps that place. Proposal in P5.
- **One graph, four lenses:** Tasks Lines, Branch, Orbit and Harbour City read one snapshot of that graph. The city does not keep a second copy of what is done, blocked or due. Proposal in P2 below.
- **History is the event log:** Rewind replays these events up to a day. It does not keep a second archive of the city. Proposal in P5.
- **Term edition:** which Teaching services are in the snapshot comes from hub prefs `school_terms`. Proposal in P8.
- **No neglect meter:** the street does not decay, score, or end because time passed. Accumulation rituals are a proposal in P11.
- **The blocks are inhabited:** between the routes, ordinary places follow the real clock and the term edition. They are scenery. They are not records and they are not signals. Proposal in P14.
- **The public realm is a seam:** hub records stay owned by their hubs. The ground, the foreshore and the overlap between districts belong to no hub, and they are there before the first record. Proposal in P17.
- **Renderer:** PixiJS (2D) first

### Who builds what

- **Back end:** data wiring and the city events contract
- **Renderer:** animation and the asset pipeline (code only; artwork comes from Kenney or an image model)
- Both build to the city events contract above so they cannot drift apart
- The critical review at the top recommends one builder per vertical slice instead of this split

## 6. Prototype

A rough chat prototype (code-drawn SVG, not Kenney art) proved the feel: an isometric grid with glass towers around a central interchange, a park and fountain, a harbour with bridge and ferry, and a bus, tram and car moving along roads. An earlier flat transit-map version showed a "drop a life wall" button rerouting a bus around a closure. Neither is production code.

## 7. What if rounds

Adam ran iterative "what if" rounds between several AI tools. Each round a contributor played two idea cards (Extend, Substitute, Combine, Adapt, Magnify, Put to another use) and could edit any part of this file. Contributions are numbered P1 to P18 in the order they were written, without the author's name. Authorship is in git history only. Six rounds are complete and every card is spent. **The critical review at the top of this file now decides what survives.** Nothing here is a decision until Adam names a slice to build.

### P1 · Round 1 · Extend + Adapt

#### Extend: Harbour City, a city that could only be Adam's

The base doc describes a friendly toy city. The risk is that it ends up generic, a city anyone could have. This extension makes it unmistakably Adam's by borrowing the shape of Sydney and the cast of Life Hub, without ever becoming a literal map.

**1. Sydney's bones, toy-sized.**
The harbour is the spine of the map, with water running through the middle rather than sitting at the edge. The bridge is the one crossing that everything funnels across. Ferries already exist in the base doc as cross-hub links; in Harbour City they become the most important vehicles on the map rather than a side feature.

- **North shore: work.** The Teaching district sits at the north foot of the bridge, the way Adam's school sits beside the real one. Professional sits beside it.
- **South side: life.** Body, Mind, Fitness, Nutrition, Skincare, Travel and Knowledge spread along the southern shore.
- **The bridge is the commute between them.** In heavy school weeks the bridge is jammed northbound in the morning. In holidays it is nearly empty. A glance at the bridge tells Adam how much of his week school is taking.
- **The CBD is Tasks.** Clare's interchange, where most lines meet, is the city centre.

The geography is a suggestion of Sydney (harbour, bridge, ferries, headlands), not a copy of it. It should be readable to anyone but feel like home to Adam.

**2. Every named agent gets a vehicle, a depot and a uniform.**
This answers the open question "Which agents become which services?" with a first draft. Each agent's service matches what the agent actually does in Life Hub (`config/agents.yml`).

| Agent | Domain | City service | Depot | What it tells Adam |
|-------|--------|--------------|-------|--------------------|
| Clare DeMind | Tasks | The network signal box and the big departures board in the CBD | Central interchange | What is next, what is late, what is blocked |
| General Hammond | Life coaching | Harbour control tower | Headland tower | Rerouting around life walls; he is the one who "reroutes the city" when a plan changes |
| Ann O'Tation | Teaching | School buses | North shore depot | Teaching load; more buses in marking weeks |
| Professor Clementine Haig | Knowledge | The library tram, with a book cart | Library on the main square | Reading and notes in motion; the tram stops at the library when a note is added |
| Brisket Lasso | Nutrition | The food truck (already in the base doc) | Market hall | A meal or macros due; drives off once logged |
| Chadwick Flexington | Fitness | Stadium shuttle and the running track around the park | Stadium | Training sessions; the park greys out if they are skipped |
| Dr Sara Tonin | Body | The ambulance (already in the base doc) | Hospital | Medical appointments and bloods coming up |
| Dr Vera Lenz | Psychology | The weather station and lighthouse on the headland | Lighthouse | The lighthouse beam sweeps when a check-in is due. The weather itself comes from the capacity forecast (see round 2) |
| Hyaluronica St. Claire | Skincare | A street sweeper doing a morning and evening round | Day spa | AM and PM routines; streets look freshly washed once done |
| Penelope Rose Quillian | Diary | The night mail train that collects the day | Post office | The evening diary prompt; the train leaves once the entry is written |

Uniforms are the agent's line colour applied to Kenney's vehicles (CC0, so recolouring is allowed). Tapping any service opens that agent.

**3. Driverless metro for work that runs without Adam.**
Sydney Metro is a fully driverless network ([Rail Journal](https://www.railjournal.com/rolling-stock/first-driverless-trains-for-sydney-city-and-southwest-line-enter-service/); [TK Elevator overview](https://www.tkelevator.com/global-en/newsroom/blog/exploring-sydney-metro-an-all-new-driverless-metro-network/)). Life City can borrow that as a meaning, not just a look:

- **Driverless trains** are lines whose next steps an agent can complete on its own (scheduled automations, imports, reminders).
- **Staffed trains**, with a visible driver, are lines that need Adam's hand or confirmation.
- A staffed train waiting at a platform with its doors open is the same as "agent awaiting confirmation" in the base doc, but now it reads instantly: something is waiting for *you*.

Over time Adam can literally watch more of the network go driverless as he trusts more automations.

**4. Personal landmarks, chosen by Adam.**
The base doc says finished projects become landmarks. Extend that: big life milestones get bespoke landmarks that Adam names and places himself, and they never move. Examples from the repo itself include the 2026 wedding (already in the gap map as an archive) and major professional milestones such as accreditation or finishing a degree. A small plaque on each records the date. The city slowly becomes a memoir.

**5. Vacant lots for districts that do not exist yet.**
The Notion → GitHub gap map lists areas with no home in Life Hub (house records, renovations, car records, watches, writing projects, tax and insurance). Each becomes a **fenced vacant lot with a development application sign** on the edge of the map: "DA lodged: Watch Collection". When Adam names a slice to build, a crane arrives. When it ships, a new district opens with the `district.opened` event.

This turns the migration backlog into something Adam can see and enjoy clearing. Day-to-day finances are not coming over from Notion, so they get no lot.

#### Adapt: GTFS as the city's internal language

**The problem.** The base doc's city events contract is a good start, but three tools are going to name things differently unless the vocabulary is fixed. Inventing a vocabulary invites drift.

**The adaptation.** Public transport already has a shared language: the General Transit Feed Specification (GTFS). Transit agencies worldwide publish their networks in it, including Transport for NSW, and it is what trip planners and map apps read. It has a **static** part (the network: routes, stops, timetables, shapes) and a **realtime** part (trip updates, vehicle positions and service alerts) ([GTFS.org](https://gtfs.org/getting_started/features/base_add-ons); [OpenStreetMap wiki](https://wiki.openstreetmap.org/wiki/General_Transit_Feed_Specification)).

Life City could keep its data in a GTFS-shaped form internally. It would not be a real feed published anywhere, just the same shapes and names.

| GTFS file or entity | Life City meaning |
|---------------------|-------------------|
| `agency` | A hub (district) |
| `routes` with `route_type` | Dreams (rail), goals (metro), projects (bus), routines (tram), cross-hub links (ferry). These are all real GTFS route types |
| `route_color` | The Life Hub line colour for that goal or project |
| `stops` | Tasks |
| `trips` + `stop_times` | The planned order of tasks along a project and their due dates |
| `transfers` | Interchanges, where one task is shared by several goals or projects |
| `frequencies` | Recurring routines (bloods, macros, Mind check-ins) |
| `calendar` / `calendar_dates` | Term rhythm. GTFS already models "school weeks run one timetable, holidays run another" |
| `shapes` | The drawn path the layout engine gives each route, so it stays put between visits |
| Realtime: trip updates | Overdue tasks, shown as delays |
| Realtime: vehicle positions | Agent activity, shown as moving vehicles |
| Realtime: service alerts | Blockers and life walls |

**How it fits the existing contract.** The city events in section 5 become the realtime layer. A GTFS-shaped snapshot becomes the static layer the renderer loads first. Renderer and back end both build to one published vocabulary that none of the three tools invented, which is exactly what the "Who builds what" split needs.

**What it unlocks.**

- **A trip planner for life.** "How do I get to [goal]?" returns the remaining stops, the interchanges on the way and an expected arrival date, the way a transit app plans a journey. Clare could answer in the same language: "Two stops and one change to the end of this project. Expected arrival 24 October."
- **A departures board.** The CBD board lists today's next services in plain transit language: "Next: Year 10 marking · Platform 2 · 4:30 pm · On time". On a phone this may be more useful than the city itself: a glanceable list that still belongs to the metaphor.
- **Free validation and tooling ideas.** There are open validators and trip planning engines for GTFS. As with OpenTTD, borrow ideas and test against them; check each licence before any code comes near Life Hub.

**A second, smaller adaptation: Mini Metro's pressure rings.**
In the game Mini Metro, a crowded station shows a ring that slowly fills before the line fails. That is a better overdue signal than a red badge. A task stop that is getting stale grows a ring around it, filling day by day, so Adam sees trouble coming before it arrives. As with OpenTTD, this borrows the mechanic only; Mini Metro is a commercial game and none of its art or code comes near Life Hub.

#### New open questions from round 1

- Is the Sydney geography too personal to share in a screenshot, or exactly the point?
- Should the departures board be the phone default, with the full city as the desktop view?
- Who decides when a line becomes driverless: Adam, or the agent after a run of confirmed successes?
- Which milestones earn a bespoke landmark, and can Adam move or rename them later?

### P2 · Round 1 · Combine + Put to another use

#### Combine: one graph, four lenses

**The problem.** Life Hub already draws Adam's work three ways on the Tasks graph, and the calendar draws it again. Lines is a transit map (`transit-lines`): a travelled track and an ahead track, a breathing "you are here" ring, a ghost marker at a fractional `ghostAt` ("pace says be here by today"), a blocked bar through the track, and a Clare alert on the line. Branch is the same tasks as flowchart lanes. Orbit is the same tasks as what is circling now. The Day Dial places today's work blocks on a clock and ticks them off with the same gesture as the board. P1 then adds a fourth picture, Harbour City, plus a departures board and a GTFS-shaped feed.

Four pictures of one life will drift. The city will show a bus at a stop Lines has already filled. The board will announce a task the dial has already struck. Clare will say "on time" while the ghost says the pace has slipped. Each picture can be internally correct and still be a lie about the others.

**The combination.** Lines, Branch, Orbit, the Day Dial's work blocks, Clare's departures board and Harbour City are lenses on one snapshot. P1's GTFS-shaped files are that snapshot, not a new database. The Tasks graph is the source. The layout engine may curve a route along the harbour. It may not reorder stops, invent a stop, or decide that a task is done.

| Already in the product | Same fact in the city |
|------------------------|------------------------|
| A Lines route, in its line colour from Properties | A GTFS `route` plus the `shape` the layout engine stored |
| A station, in order | A `stop`, in that same order |
| Travelled track versus ahead track | Which stops are completed, and `shape_dist_traveled` for the vehicle |
| The breathing "you are here" ring | The `VehiclePosition` of the service Adam is actually in |
| The ghost at `ghostAt` | A second, ghost vehicle where the pace says he should be. It is not a second bus doing work |
| The blocked bar | A GTFS Realtime service alert. A life wall is a detour: the shape bends, the stop order stays |
| Clare's alert card | The same words on the departures board. The city does not paraphrase her |
| A Branch child under `parent_task_id` | The side street Lines already drops off that station |
| Orbit's "now" | The set of vehicles currently in service |
| A Day Dial work block (`task_id`, start, length) | The vehicle dwells at that stop for that span. Ticking the block completes the stop |
| A deleted or trashed task | Gone from every lens in the same refresh. An archived project can still become a landmark. A deleted one cannot |

**How a vehicle is allowed to stand.** GTFS Realtime practice is that a vehicle position sits on the trip's shape, within about 200 metres of it, unless a detour alert is in effect ([GTFS Realtime best practices](https://gtfs.org/documentation/realtime/realtime-best-practices/)). In the toy city that rule becomes absolute: the sprite's anchor is a point on the polyline. If the snapshot cannot place it on the shape, the vehicle is absent and the board says the position is unknown. A bus does not hover in the harbour because the layout failed. Two trips that share a shape are told apart by time, the way a real feed tells the 16:14 from the 16:44 apart. The Day Dial is that clock. Sydney time, the same clock the dial already uses.

Driverless and staffed, from P1, are a property of the vehicle, not a second position system. A driverless tram still snaps to the shape. A staffed train with its doors open is the same "you are here" ring, waiting.

**One Sunday afternoon, so the contract is obvious.** It is 16:30 in Sydney. Year 10 marking is the current station on a Teaching route. Lines shows the breathing ring on that station and a ghost a little ahead. The Day Dial has a work block on that task from 16:00. The departures board reads "Year 10 marking · you are here · on time". The city shows one staffed bus on the shape at that station, and a ghost bus at the pace marker. Adam ticks the block on the dial. The station fills, the bus moves to the next stop, the board advances, and the dial strikes the block. Those four changes are one fact. A city that still shows the bus at the old stop is the broken lens.

A life wall closes that route. Lines draws the blocked bar. The snapshot emits a detour alert and a new shape around the closure. The bus follows the new shape. Lines' ahead track keeps the same stop order. The city does not cut a tunnel the graph does not have.

**Phone and desktop are lenses too.** This is a proposal for two open questions in section 8, not a decision. On a wide screen the lens is the isometric city. At 390px the lens is P1's departures board, which is the same "what is next" query, stacked the way Lines already goes vertical on a narrow canvas. The phone does not shrink the whole fleet until the buses are specks. The noise question is answered by showing fewer lenses, not by deleting vehicles from the snapshot.

**What this asks of the builders.** One function builds the snapshot. Lines, Branch, Orbit, the dial and the city all read it. A second progress calculator, even a well-meaning one inside the renderer, is the bug. The renderer draws Kenney sprites on the polyline and runs the smart building-fade off that same point, so a tower fades when the vehicle really is behind it. The back end's side of "who builds what" is the snapshot and the proof that the four lenses agree. P1's GTFS names stay the vocabulary.

Day-to-day finances stay out of the snapshot. A fare, a balance or a tap-on cost is not a stop time.

#### Put to another use: the concourse ceiling is the Knowledge sky

**The precedent.** Grand Central's main concourse was meant to have a skylight. What it got, in 1913, is a painted sky of constellations over the departures hall. Within weeks a commuter saw that the heavens were reversed, and the backwards sky was kept anyway ([Untapped New York](https://www.untappedcities.com/the-hidden-history-of-grand-central-terminals-celestial-ceiling/); [New York Times, 23 March 1913](https://www.nytimes.com/1913/03/23/archives/constellations-reversed-new-grand-central-ceiling-has-the-heavens.html)). The useful part is the ceiling over the hall. The warning is the mirror: a decorative sky that does not match the real one is noticeable forever.

**The element to reuse.** Knowledge already has that sky, and it is not decoration.

- Saved constellations are Adam's. Each figure is laid out from its notes, then placed with the sky position, scale and rotation he saved (`universeSky.ts`). Those points are notes. Tapping a point opens that note.
- The scattered star field is a seeded backdrop (`buildSkyLayers`, seed 9173). Those stars are not notes. They are not tappable, and they are not a second archive.
- The twenty topic planets are a different instrument. Each topic has one seeded look so the planet matches in the universe, the orrery and its own system (`universePlanets.ts`). They already have a home.

**How it sits in Harbour City.** Clare's CBD interchange, the big departures hall from P1, has a vaulted ceiling. The ceiling is the Knowledge sky: the same seeded star field and the same saved constellations, in the same arrangement as the Universe view. Looking up in the hall and opening Universe are two readings of one painting. A constellation is never mirrored to suit the architecture. Grand Central's mistake is the test: if a figure is flipped on the ceiling and correct in Knowledge, the ceiling is wrong.

By day, outdoors, the sky stays the weather Vera's lighthouse already drives. The ceiling mural is still there in the hall, the way Grand Central's is visible in daylight, so notes are reachable without waiting for night. At night, `city.clock` brings the same star field up over the open city as well. Weather and stars take turns outdoors. They do not paint over each other.

Topic planets stay in the Universe. Pasting a solar system onto the suburbs would make a second map of topics the districts already cover. A district does not become a planet, and a planet does not become a building.

**What changes when knowledge changes.** Adding a note to a saved constellation adds a point on the ceiling, in the same place the Universe adds it. Deleting a note removes that point everywhere. A deleted note does not remain as a dim star. A constellation Adam has not saved does not appear just because a topic exists. The city sky grows when he saves figures, not when the renderer feels like drawing more.

**Sound.** The open question "Sound?" gets this proposal: the city does not grow its own soundtrack. Knowledge already has universe chimes and a saved preference. If sound is ever on, it is that preference, and the base assumption stands that it ships off. A second mixer for bus horns and lighthouse bells is a different product.

**On the phone.** The departures board can keep a thin strip of the ceiling, enough to show that a constellation has a new point, not a second panorama beside the list. The full vault is part of the wide city lens.

#### New open questions from P2

- When the city and Lines disagree, the proposal is that the city is the broken lens, because the graph is the source. Is that the rule Adam wants, including on a day when the city is the view he is looking at?
- Is the Knowledge sky the concourse vault only, with a plain outdoor sky at night, or does the whole city look up at it after dark?
- A booked trip in Travel is the obvious intercity departure, but this round does not fold it in. The travel map has already been wrong by treating an arrival city as both ends of a leg. Should a later round put real trip legs to use as intercity trains, with Sydney as the start, or do dreams stay the only intercity service?
- Does a life-wall detour have to repaint Lines and the city in the same frame, or may the schematic keep a straight track while the city bends?

### P3 · Round 1 · Extend + Combine

#### Extend: a city with places to use, beyond the transport network

**The next step.** The current city shows movement, workload and progress. The gap map also contains possessions, documents, ideas and records whose value has little connection to completed tasks. A house contract needs a reliable home even during a quiet year. A book idea deserves a place before a writing schedule exists.

Give Harbour City usable interiors. The outside shows the overall state. Entering a building opens the relevant records and actions. The city becomes another way to use Life Hub, with the existing hubs still providing the underlying functions.

**1. Three distances, one place.**

| Distance | What you see | What you do |
|----------|--------------|-------------|
| Harbour | Districts, routes, services and a few selected signals | Choose an area or open today's departures |
| Street | Named buildings and their current purpose | Select the writing studio, records office, collection gallery or kitchen |
| Room | A focused workspace using the relevant hub records | Find a document, develop a book idea, compare collection items or choose a recipe |

A tap on a building opens a room sheet on a phone. On a larger screen, the camera approaches the building and opens the workspace alongside the city. Closing the room returns to the same position and zoom. Direct links also open the room without requiring a walk through the map.

The room uses normal readable controls. Shelves, desks and cabinets establish the setting, while labelled lists and editors handle the work. A tiny illustrated drawer should never be the only route to an important document.

**2. Give the missing areas distinct homes.**

These are proposed destinations from the gap map, rather than claims about features already built.

| Gap or extension | Place in Harbour City | First useful room |
|------------------|-----------------------|-------------------|
| House records and important documents | Records office beside the residential district | Searchable property, contract and certificate records, with linked originals |
| Insurance and car records | Service centre | Policy documents, renewal dates, service history and associated actions |
| Renovations | Design workshop | Plans, decisions, before and after records, and linked projects |
| Future book ideas | Writing studio beside the Knowledge library | Idea notebook, research shelf, outline and draft workspace |
| Watches and fragrances | Collection arcade | Owned items, wish list, provenance, condition and personal notes |
| Recipes and dinner database | Market kitchen beside Brisket's depot | Saved recipes, dietary tags and links to food records |
| Hair and aesthetic procedure history | Treatment rooms beside the Body and Skincare districts | Dated records, photographs and linked appointments |
| Tax evidence | Records office archive room | Evidence organised by financial year, with links to source documents |

House records and insurance enter as records and responsibilities. The city has no daily spending ledger, banking feed, fare economy or income dashboard. The gap map's broad Finance proposal does not automatically enter Life City.

Room placement expresses a useful relationship. The writing studio sits beside the library because research supports writing. The collection arcade sits near Travel because saved shopping interests support a trip. Personal placement overrides remain an open design choice.

**3. Book ideas become objects worth returning to.**

Inside the studio, each book idea has a dedicated desk. Early ideas have a title, premise, intended reader and a few saved fragments. A developing idea gains an outline board, linked research and draft material. Publication or deliberate completion earns a book on the studio shelf.

These states come from the writing record, with Adam choosing the stage. Word count does not decide whether an idea is good. The city does not create a project or deadline merely because a desk exists.

For an educational book, the desk brings together a research note, a teaching example and a developing chapter. Source details travel with the research. Private classroom material stays within its existing access rules. The writing view never silently copies student records into a manuscript.

A quiet desk keeps its name and position. Returning after months opens the last saved fragment and an optional next action. Dormant ideas do not become abandoned buildings.

**4. Migration changes a lot in two separate steps.**

P1's vacant lots are a useful start. Give each lot two independent facts: whether a suitable product home exists, and whether the relevant records have arrived.

Teaching already has a home, even with lessons still awaiting import. House records currently lack a home in the gap map. Those are different conditions.

An opened building with a labelled empty shelf means the structure exists and import is pending. A fenced lot means a product home still needs development. Missing records never produce invented collection items, placeholder policy dates or false activity. An import fills existing shelves rather than building a second district.

#### Combine: saved activities spanning several districts

**The combination.** P1's ferries connect districts. P2 keeps the existing task views aligned. Add a way to gather relevant places around one purpose, without turning every record into a task.

A saved activity selects records from several hubs and opens them together. Adam chooses the purpose and confirms the associations. Harbour City highlights the participating buildings and offers one workspace for the activity. Closing the activity restores the normal city.

The buildings stay in their usual positions. Relationships and selections change. The city does not rearrange itself every time Adam switches focus.

**1. A travel activity connects the things needed for a specific trip.**

Opening a saved December trip activity brings the Travel terminal into focus. Around the terminal are the linked itinerary, selected documents, saved fragrance and watch interests, and travel tasks.

| Existing or future record | Contribution to the activity |
|---------------------------|------------------------------|
| Travel leg | Actual origin, destination, dates and booking reference from Travel |
| Accommodation record | Stay details associated with the relevant city |
| Document record | A selected passport or travel document, through its authorised viewer |
| Saved shopping interest | Research relevant to a destination |
| Collection item | Owned or wanted state where Adam recorded the distinction |
| Task | A preparation action with its existing status and due date |
| Knowledge note | Cultural, historical or practical research linked to the trip |

Travel legs use their real endpoints. They get a distinct departure label from dream routes. A real flight and a long term aspiration should never share an ambiguous arrival prediction.

Before departure, Adam opens the activity and sees unresolved preparation tasks beside the supporting records. During travel, opening the Istanbul stop brings up the relevant booking and saved interests. After travel, a confirmed purchase links to an owned collection item, with provenance retained. A saved shop or browsing session never counts as a purchase.

This connects planning, experience and later recall. Day to day expenditure stays outside the activity.

**2. A writing activity connects research to the work receiving the benefit.**

Opening a book desk highlights the Knowledge library, Writing studio and any explicitly linked teaching resources. The room shows the outline beside selected research and examples.

Adam links a neuroscience note to a chapter, adds a teaching example and writes a paragraph. Each record stays in its owning hub. The chapter records the relationship and a source reference. Later corrections to the research are visible when the chapter is reopened. A quoted or adapted passage keeps the version used, so a changing source never silently rewrites an existing draft.

The ferry between library and studio represents a saved relationship. A decorative ferry trip does not mean a draft was written. Only a recorded writing action changes the desk's activity state.

**3. A home activity joins evidence and action.**

Opening a repairs activity brings together the property record, selected photographs, relevant communications, the associated task and any linked policy document.

The room answers practical questions: Which property is involved? What evidence exists? What has already been requested? What is the next recorded action?

Finding a policy document opens the original. Selecting a communication shows the saved record. Completing the repair task changes the existing Tasks record. The city never treats viewing evidence as completing a repair, and opening the room never sends a message.

This is the difference between storing a document somewhere and having the evidence ready when needed.

**4. Useful combinations stay optional and explicit.**

An activity begins with a named purpose and selected records. Suggestions appear as candidates with a reason, such as a shared trip identifier or an existing research link. A shared word alone does not establish a relationship.

Adam confirms a suggested link, removes a selection or opens the source. Saving the activity stores the selection and presentation state. The underlying records remain authoritative.

On a phone, the activity becomes a short list of useful doors, followed by the selected room. For example, itinerary, documents, saved interests and preparation tasks. The departure board stays available. Switching between related records should take fewer taps than opening several separate hub pages.

**5. Fit this around the shared snapshot.**

P2's rule still holds for task progress. Every task view reads the same status and ordering. Extend the city snapshot with references to other domain records and their explicit relationships. Each domain owns its facts.

The transit vocabulary describes routes and services. A policy is a document reference, a watch is a collection reference, and a manuscript is a writing reference. None becomes a GTFS stop unless a genuine task links to the record.

The renderer owns camera position, room selection and visual emphasis. A city action calls the owning hub and then refreshes the shared snapshot. A failed save leaves the underlying record unchanged and the room reports the failure.

Deleted records disappear from rooms, activity selections and city signals through the existing liveness rules. Archived records remain available through explicit archive views. The city does not preserve a private duplicate to keep a shelf looking full.

#### Questions for the next round

1. Should rooms open inside Harbour City, or move directly into the owning hub with a clear return route?
2. Does Adam want to place buildings himself, choose from suggested neighbourhoods, or keep a fixed layout?
3. Should saved activities live in Tasks as project workspaces, or support purposes with no task or project?
4. Which first room would make the city useful beyond its appearance: Writing, House records or Collections?
5. How should the wider city show a quiet but valued area without interpreting silence as failure?

### P4 · Round 2 · Magnify + Put to another use

#### A correction first: the city's weather already exists

P1 gave the city's weather to Vera's lighthouse and Mind check-ins. That was wrong. Life Hub already has a weather system: the capacity forecast, built on 5 October, with Adam's own 30 weather icons, an hourly readiness line and an uncertainty band (`docs/capacity-forecast-handoff/BUILD.md`, `weather-states.md`). Its rule is "one number everywhere": every view that shows capacity calls the same function, and a test fails if two views disagree.

Life City should obey that rule exactly as P2's lenses obey the Tasks graph. The sky over Harbour City is the capacity weather state for the current hour, drawn from the same function and the same icon numbers. Fog over the city means "Dense fog" in the forecast, never a separate guess. Vera's lighthouse keeps a smaller job: its beam sweeps when the morning check-in is due. The base table and P1's table have been updated to say so.

This matters for the two ideas below, because both lean on the forecast.

#### Magnify: make time bigger

Every round so far shows the city **now**. The base doc says the city becomes "a visual record of everything built", but nothing yet lets Adam actually travel through that record or look ahead. Magnify the time axis: the same city, scrubbed backwards and forwards, at whatever speed he likes.

**1. One control, three directions.**

A single time scrubber sits along the bottom of the wide city lens (a thin harbour tide line, so it fits the place).

| Direction | What the city shows | Where the truth comes from |
|-----------|---------------------|----------------------------|
| **Now** (default) | The live city, as every earlier round describes | P2's snapshot, refreshed |
| **Rewind** | The city as it stood on any earlier day. Drag left and routes retract, cranes return, landmarks sink back into empty plazas | A stored daily snapshot for each past day |
| **Forecast** | The city as currently planned for any future day: buses on the stops due that week, school buses following next term's timetable, the sky in that day's forecast weather | Due dates, the term calendar and the capacity forecast |

Letting go of the scrubber springs back to Now. Nothing in Rewind or Forecast can edit a record. Tapping a building in the past opens its room in a read-only "as it was" state with a clear banner and a "Go to now" button.

**2. Rewind: the city as a diary you can walk through.**

P2's snapshot is already the contract between data and renderer, so history is simply keeping one snapshot per day. The layout engine is deterministic, so a past day redraws in exactly the place it stood. Storage is small: each day only needs the differences from the day before.

What Rewind makes possible:

- **The term timelapse.** Press play on Term 3 and watch ten weeks go by in thirty seconds: the bridge clogging in marking weeks, routes opening and retiring, the skyline rising, the weather rolling through. It is the "how much did I actually do" answer that a list of completed tasks never quite gives.
- **"What did my city look like when…"** Jump to a date (the week of a big deadline, the first week back after a holiday) and see the whole life at that moment, not just the task that was due.
- **Year on year.** Put this October beside last October, side by side, same camera. A teacher's year repeats on a term rhythm, so like-for-like comparison is unusually meaningful here.

The one hard rule: **deleted means gone, including from the past.** A stored snapshot holds record ids and states, not copies of the records. When the renderer replays a day, it resolves each id against the live liveness rules (`withoutDeleted`, `isOpenTask`). A task deleted today vanishes from every past day too. An archived project still appears in the days it was active, because archive is readable. The capacity forecast keeps immutable snapshots for a good reason (honest scoring), but the city's history must not, or it becomes a private copy of things Adam chose to remove. P3 made the same point about shelves. The same rule applies to time.

**3. Forecast: honest fog toward the horizon.**

Dragging right shows the planned future, and the planned future gets less certain the further out it goes. The capacity forecast already says so: its band widens with distance and its estimate drifts back toward the baseline. Life City should show that uncertainty as weather, not hide it.

- Tomorrow is crisp.
- Next week is lightly hazed.
- Three weeks out, sea fog rolls in over the harbour and the city fades to outlines.
- Past the last day with any real evidence or due date, the fog is total. The city does not invent a future it has no data for.

This is the "ghost" from P2, magnified. On Lines the ghost shows where the pace says Adam should be today. In Forecast, every route gets a ghost of where it is expected to be on the day he has dragged to. If a ghost has not reached the end of its route by the route's due date, that route's terminus glows amber on the horizon. Adam sees a future late arrival without opening a single list.

**4. Louder: the year's fireworks.**

The base doc already fires fireworks over the harbour when a goal is completed. Magnify that into the city's one big annual event.

At midnight on New Year's Eve (or whenever Adam presses "Replay the year"), the harbour stages a show built only from that year's real history:

- Each completed goal launches a burst in its line colour, from its own district, in the order the goals were finished.
- Each completed project is a smaller burst along its old route.
- A dream that moved forward lights the bridge.
- The show lasts about a minute, then the city settles into the new year with the year's landmarks lit up.

A smaller version runs at the end of each school term, closer to Vivid Sydney than to New Year's Eve: the term's finished work is projected in light onto the buildings where it happened, for one evening. This suits a teacher's year, where terms are the real chapters.

Both are replays of the stored history, so they obey the same deleted-means-gone rule. Sound follows P2's proposal (the Knowledge chimes preference, off by default). A "Save this" button exports the replay as a short video, the one Life City artefact that might be worth sharing.

#### Put to another use: platform occupancy screens become a capacity display

**The precedent.** On Sydney's Waratah trains, sensors under each carriage measure weight, and platform screens show each carriage of the arriving train as having seats available, standing room only or being full. The same data has appeared in the Trip Planner and apps such as TripView ([IoT Hub](https://www.iothub.com.au/news/sydney-trains-bring-real-time-occupancy-data-to-stations-525456); [Transport for NSW occupancy data guide](https://opendata.transport.nsw.gov.au/data/dataset/28e08a94-fbbb-44d6-a074-d69ad63e760d/resource/3e01b4b6-0b23-43fa-9480-182122467827/download/train-occupancy-data-guide-v2_0.pdf)). The point of the screen is simple: before the train arrives, you know which carriage to walk to.

GTFS Realtime even has the vocabulary built in. Its `OccupancyStatus` runs from `EMPTY` through `MANY_SEATS_AVAILABLE`, `FEW_SEATS_AVAILABLE`, `STANDING_ROOM_ONLY`, `CRUSHED_STANDING_ROOM_ONLY` and `FULL` to `NOT_ACCEPTING_PASSENGERS`, with `NO_DATA_AVAILABLE` for the unknown case, and an experimental per-carriage breakdown ([GTFS Realtime reference](https://gtfs.org/documentation/realtime/reference/)). That slots straight into the GTFS-shaped vocabulary from round 1.

**The element to reuse.** The per-carriage occupancy screen, put to work showing how full Adam's day is against how much he has in him.

**1. Each day is a train, each part of the day is a carriage.**

Today arrives at the platform as one train. Its carriages are the parts of the day, in order. A first draft would be early morning, morning classes, middle of the day, afternoon and evening, though the real split should follow the Day Dial's blocks.

Each carriage's occupancy compares two numbers Life Hub already has:

- **Demand:** what is planned in that part of the day (classes, meetings, tracked work and Day Dial blocks), counted the way the capacity forecast already counts them, with meetings at 0.65 of a class hour.
- **Capacity:** the readiness model's hourly line for the same span.

| Occupancy | Meaning for that part of the day |
|-----------|----------------------------------|
| Many seats available | Plenty of room left; a good place to put something demanding |
| Few seats available | Comfortably used |
| Standing room only | Tight; planned demand is close to what the forecast says Adam will have |
| Crushed standing room only | Overbooked; something should move |
| Not accepting passengers | Protected time Adam has closed (a life wall). Nothing can be added |
| No data available | No check-in or evidence for that span. Shown as unknown, never guessed |

The last row follows the capacity forecast's own rule: missing answers are unknown, not zero and not assumed fine.

**2. Why a carriage diagram beats a number.**

The capacity forecast gives one percentage for the day. That is honest, but it hides *where* the day is tight. A train with five carriages answers the question Adam actually has at 7 am: "Which part of today can take the extra thing?" If carriage 4 (the afternoon) is crushed and carriage 2 has seats, that is the whole insight at a glance.

**3. Moving passengers.**

A task with a time block is a passenger. Long-press a passenger in a crushed carriage and drag it to a carriage with seats. That is a reschedule, and following P3's rule, the city calls the owning hub: Tasks moves the Day Dial block, then the snapshot refreshes and every lens updates together, as P8 requires. If the move fails, the passenger stays where it was and the screen says so.

Clare can **reserve a seat**: a proposed placement shown as a hatched seat with her name on it, which stays a proposal until Adam confirms. This uses the same staffed-versus-driverless logic from round 1: a reservation is a staffed train with its doors open, waiting for Adam.

**4. The week as a departures board.**

Combined with the Forecast scrubber above, the departures board can list the next seven days as seven trains, each with its carriage diagram. Monday's train is crushed in the afternoon, Wednesday has seats all day, Friday's evening carriage is closed. That is a week's load in one glance, and it uses the real forecast, including its widening uncertainty (later trains show their carriages with lighter, hazier fills).

**5. Built for the phone.**

P2 proposed that the phone lens is the departures board. The occupancy train is the best thing on that board at 390px: one train, five carriages in a row, each a colour and a word. It needs no city and no zoom, and it is still part of the metaphor.

**6. What it is not.**

- Not a new calculator. Demand and capacity both come from the existing one-number function. The train only presents them by carriage.
- Not a judgement. A crushed carriage is information, not a failure. The wording stays the transit wording, which is neutral by nature.
- Not money. There is no fare, no ticket price and no Opal balance. Day-to-day finances stay out of the city, as every round has agreed.

#### New open questions from round 2

- How should a day be split into carriages: fixed parts of the day, the Day Dial's blocks or the school timetable's periods on teaching days?
- How far back should Rewind go: one year, or the whole history since Life Hub began?
- Should the New Year's Eve replay play itself at midnight, or only when Adam asks?
- Is drag-a-passenger rescheduling welcome in the city, or should the city stay look-only with a "move this" button that opens the Day Dial?

### P5 · Round 2 · Substitute + Adapt

#### Substitute: Rewind replays the event log, instead of keeping a daily copy of the city

**The problem.** P4 makes time something you can drag. That is the right magnification. The storage she suggests for it is a daily snapshot, with each day keeping the differences from the day before, and a past room opening "as it was".

That second archive fights the rule this game has already agreed. P2 said the city does not keep a second copy of what is done, blocked or due. One function builds the snapshot, and every lens reads it. A pile of daily copies is another function, and it will drift. P3's shelves made the same point about import: missing records never produce invented items. A snapshot that freezes a document's text will, on a later day, show a copy Adam has since corrected or deleted.

P4 already saw half of this. It said a stored day holds record ids and states, not copies of the records, and that a task deleted today vanishes from every past day because the renderer checks liveness (`withoutDeleted`, `isOpenTask`). Archive stays readable. That rule is right. It also means the room cannot honestly claim "as it was" for the body of a contract, a chapter or a policy. The id is the same. The text is today's, unless the owning hub itself remembers an older version. The capacity forecast keeps immutable snapshots so its scores stay honest. The city must not borrow that pattern, or Rewind becomes a private copy of things Adam removed. P4 said that too. The daily diff archive is how it would happen anyway.

**The substitute.** Section 5 already lists the events. They are the history. Rewind does not open a photo of the city. It asks the same snapshot function for a clock time in the past, and that function replays the log up to the end of the chosen day.

The log is allowed to store:

- the event name from section 5 (`route.opened`, `stop.completed`, `wall.placed`, `district.opened`, and the rest of that list)
- the record id it refers to
- when it happened
- the small fields the picture needs and the live record does not keep, such as a route's shape id at the time the layout engine assigned it

The log is not allowed to store the body of a note, the text of a contract, a photograph, a collection item's notes, or a copy of a task title "just in case". Those stay in the hub that owns them.

Replay then does four things, in order:

1. Take the events up to the end of the chosen day.
2. Drop any event whose record is deleted today. Archived records stay, on the days they were active.
3. Build the routes, stops and services from what survived. The layout engine places them. Stop order still comes from the graph, as in Round 1.
4. Apply the weather for that day from the capacity forecast's own record of that day, if it has one. If it does not, the sky is the unknown state, not a guessed icon.

Letting go of the scrubber still springs back to Now, and Now is the same function with the clock set to the present. Forecast, dragging the other way, is the same function fed by due dates, the term calendar and the forecast. It does not write pretend events for days that have not happened. There is nothing in the future to copy.

**What a past room is allowed to say.** P3's rooms still open in Rewind. They open with a banner, and the banner tells the truth about that record:

| The record | What the past room shows |
|------------|--------------------------|
| A diary entry, a check-in, a completed task, a booked travel leg, anything whose date is the record | That day's record, because the date is on it |
| A document, a book draft, a policy, a collection note, with no version stored by its hub | The record as it is now, and the banner says so |
| A record the hub really versions | The version that was current on the chosen day, read from that hub, not from the city log |
| A deleted record | The room does not open. The building or the stop is gone from that day as well |

Viewing a past room still changes nothing. A repair viewed in March does not complete the task. P3's rule holds in both directions of the scrubber.

**The fireworks read the same log.** P4's New Year's Eve show and the end-of-term lights are a replay of `goal completed`, `route.retired` and dream events in that year, in the order the log has them. They are not a saved video with its own copy of the year. A goal deleted before the replay does not launch a burst. "Save this" can still export a render of that replay. The export is a file Adam asked for. It is not a second history the city consults later.

**On the phone.** The tide line belongs on the wide lens. At 390 the departures board gains a date: "As at 12 March", with Now as the way back. The board is still the phone lens from Round 1. Rewind does not ask a thumb to drag a hairline across a harbour.

#### Adapt: place buildings the way Knowledge places constellations, and let the forecast keep its own fog

Two existing mechanisms already solve questions this game is about to invent new controls for.

**1. Adam places a building the way he places a constellation.**

P3 asked whether buildings are fixed, suggested, or put down by hand. Knowledge already has the interaction. A saved constellation stores a normal position, not a picture: `sky.x` and `sky.y` as fractions of the sky, plus `rotation` and `scale`, and the figure is rebuilt from its notes every time (`SavedConstellation` in `apps/knowledge/src/stars/schema.ts`). Stars he has not saved do not appear just because a topic exists. Topic planets are seeded and stay put without anyone dragging them.

Harbour City can use that same save, for buildings only.

| What | Who places it | What is stored |
|------|----------------|----------------|
| Districts, routes, stops, the bridge, the harbour | The layout engine, deterministic, as the base doc says | The shape id on the route. Adam does not drag a metro line |
| A building he cares about: the writing studio, the records office, the collection arcade, a milestone landmark | Adam, once. A suggestion can offer a lot. Saving it pins the building | The same four numbers: x, y, rotation, scale, plus the building's record id |
| A vacant lot or a new building he has not touched | A seeded lot on the edge, stable between visits, the way an unsaved sky position is stable | Nothing, until he saves it |

The suggestion can still follow P3's relationships: the studio offered beside the library, the kitchen beside Brisket's depot. Saving accepts the offer or moves it. After that, the layout engine does not "improve" the spot on the next visit. Personal placement wins, which is the override P3 left open.

This is also how a quiet place stays valued. The grey empty park means exercise skipped. That grey does not spread to a records office that has had a quiet year. A pinned building with records on its shelf is lit. A fenced lot still means no product home. An opened building with an empty shelf still means the home exists and the import has not arrived. Silence is not failure, and it is not an empty park.

The ceiling from Round 1 and these pins are one habit, not two systems. Both are "Adam put this here, and the generated city works around it." A constellation is never a building, and a building is never drawn on the ceiling.

Rewind uses the pins as they are now, so last October is still his city and not a reshuffle. Whether moving a building should itself be an event, so Rewind can show the old lot, is an open question. The default proposal is no: placement is a preference, like the constellation's sky position, not a fact about the past.

**2. Distance into the future uses the forecast's band, not a new kind of fog.**

P4's Forecast paints sea fog as the view gets less certain, until the city is only an outline. The instinct is right, and the paint collides with a weather language Adam has already fixed.

`docs/capacity-forecast-handoff/weather-states.md` gives thirty states, and they describe conditions, not score brackets and not uncertainty. Dense fog, icon 20, means mental clarity is substantially reduced. Morning mist, patchy fog and fog lifting are cognition too. The same document says the shaded band is the prediction uncertainty, and it must not be described as a calibrated fact. It also says not to swap his icons for a generated set. `BUILD.md` is the forecast's own rule that every view calls the one capacity function.

So the city, on a future day, shows two different things with two different drawings:

- **The sky's icon** is the capacity weather for that hour, from that one function, using his icon. A thunderstorm means overload. It does not mean "this date is far away".
- **The uncertainty** is the forecast's shaded band, laid over the city as a fade: tomorrow crisp, further out lighter and wider, past the last day with evidence or a due date a labelled absence. The label is the same idea as the occupancy train's "no data available". It is not icon 20, and it is not a new sea-fog asset.

A carriage diagram for a hazy future day, in P4's week board, fades with that same band. The carriage's word (many seats, standing room, no data) still comes from the forecast function. The fade does not change the word.

Vera's lighthouse stays the check-in reminder P4 reduced it to. It does not get the sky back.

#### New open questions from P5

- Which hubs actually keep an older version of a record, and which past rooms must say "as it is now" until they do?
- If Adam moves the records office, should Rewind show the old lot, or is placement a preference that always shows where it stands today?
- The event log stores shape ids so a retired route can be redrawn. If the layout engine's rules change later, old shapes and new rules will disagree. Do stored shapes win for past days, so Rewind stays recognisable?
- Is a date on the phone departures board enough for Rewind, or does the phone need the tide line too?

### P6 · Round 2 · Substitute + Put to another use

#### Substitute: a city which helps choose, with fewer demands for attention

**The replacement.** Replace the assumption of every outstanding responsibility asking for attention at once. Keep the whole city available, but give the default view one selected decision and a small number of relevant signals.

An ambulance, mail van, food truck, pressure ring and blocked bus all asking for attention together would become another list to manage. The city should help Adam answer a concrete question: What needs my decision now, and where do I start?

**1. A signal has an owner, a reason and a useful destination.**

Each meaningful signal opens a small action card with the source record, timing and next available action. Decorative motion remains decorative. A passing ferry does not secretly mean another overdue responsibility.

| Situation | Proposed signal | Useful destination |
|-----------|-----------------|--------------------|
| A medical preparation task has a recorded due date | Sara's service vehicle waits beside the hospital entrance | The task and linked appointment |
| An agent needs a decision | A staffed vehicle waits with an open door | The exact pending proposal |
| A project has a recorded blocker | A signal holds its route | The blocker and affected work |
| A document has an approaching renewal date | The records office places one notice in its window | The policy record and renewal action |
| A linked action was moved | A timetable notice appears briefly | The changed block, with its previous and current time |

The ambulance is an appointment reminder, rather than a visual claim of a medical emergency. A policy notice needs an actual renewal date. A quiet hospital, empty meal log or unanswered check-in never establishes whether an action happened.

Select an item and the camera reveals the relevant vehicle, stop and room. Other routes remain visible but step back. Closing the item restores the wider view. On a phone, the same action card opens above the departures list.

**2. Adam chooses the question.**

Offer three small controls beside the city rather than an automatic stream of advice.

| Question | What receives emphasis |
|----------|-------------------------|
| What needs a decision? | Pending agent proposals, explicit blockers and recorded deadlines |
| What fits this window? | Existing tasks with duration estimates, known commitments and relevant readiness evidence |
| Where was I? | The last saved room, activity and unfinished fragment |

The first question helps with responsibility. The second helps with placement. The third helps with returning to a book idea, research topic or administrative job after an interruption.

An untimed task stays untimed. A missing estimate receives a label rather than a made up duration. Selecting a question changes the view, rather than creating work or changing priorities.

**3. Starting a session changes the city deliberately.**

Adam selects a writing activity and a 25 minute session. The studio opens at the last saved paragraph, with its selected research beside the draft. The associated route receives emphasis. Routine city motion slows, and unrelated notices collect at the interchange instead of crossing the workspace.

The session uses the existing tracked work mechanism if a compatible writing integration is built. Until then, opening the room records navigation only. A timer alone never proves writing progress.

When the session ends, the room offers to save the current fragment and a short return note. For example, "Next: check the source for the classroom example." Returning tomorrow opens the same fragment and note.

A task requiring attention during the session stays visible through the underlying departures board. Which deadlines interrupt the session, and which wait until the session ends, is an **Open question** for Adam. Medical icons alone should not decide priority.

**4. Refine the occupancy train using the handoff's actual distinctions.**

The BUILD document makes a distinction P4's proposed passenger display needs to retain. Tracked sessions are actual workload. Classes are scheduled workload. Meetings use the model's existing weighting. A task block alone does not count as workload in the readiness model.

Also, a readiness percentage and a duration in minutes are different quantities. The existing percentage does not establish how many additional tasks a carriage accommodates.

Keep P4's carriage diagram, with two readable layers:

| Layer | Meaning | Source |
|-------|---------|--------|
| Timetable | Occupied clock time, free intervals and overlaps | Calendar commitments and task blocks |
| Outlook | Readiness trend, condition icon, explanation and uncertainty | The shared capacity forecast |

A carriage with 40 free minutes shows an opportunity in the timetable. The outlook beside it describes the expected conditions. Neither claims 40 minutes of assured productive work.

An estimated 20 minute task fits an available 40 minute interval by time. Whether the task suits the current conditions is a separate, labelled suggestion. Modelled readiness stays provisional, as BUILD states. Keep the forecast's explanation available in one tap.

If literal seats or "standing room only" labels are retained, the rule connecting the two layers needs explicit design and validation. Until then, use wording such as "Time available", "Overlap" and "Protected", with the readiness outlook separately visible. This preserves the train's usefulness without introducing a second capacity calculator.

**5. A valued place does not need activity to deserve space.**

Replace the grey park as a general consequence of missed exercise or downtime. The park retains its colour. A routine stop shows "Not logged" when evidence is absent, and a planned session shows its actual status.

An intentionally protected evening appears as a lit waterfront garden with its calendar boundary visible. The city acknowledges the boundary without claiming recovery occurred. Body and Mind still own evidence about recovery.

The records office stays intact during a quiet year. A dormant book desk keeps its title. The collection arcade displays owned items whether or not anything new arrived. Pinned places, from P5, support continuity rather than a requirement to remain busy.

#### Put to another use: the architectural model table becomes a room for possible futures

**The element to repurpose.** A miniature model of a proposed building or neighbourhood lets someone inspect a design before construction. Put a model table inside Harbour City's design workshop. Here Adam rehearses possible commitments before bringing them into the live city.

This adds a different activity from P4's time scrubber. Forecast shows the future already planned. The model table holds alternatives Adam has not chosen.

**1. A proposal starts with a question, rather than another project.**

Examples:

- What would developing a book across the next term involve?
- Which commitments need to change before starting another qualification?
- What would a renovation require beyond the finished room?
- Which preparation steps belong before the December trip?
- How would a weekly research session connect to a future writing project?

Each proposal has a purpose, selected live records, candidate additions and named assumptions. A book proposal references the existing idea desk and research. A qualification proposal references current teaching commitments and the information Adam saved about the course.

Nothing becomes an active task merely because Adam explores the question.

**2. Hold two alternatives on the same table.**

For a book idea, the left model proposes a weekly research session during term. The right model proposes outlining during term and drafting in the holidays.

Both show the same harbour, calendar commitments and pinned buildings. The candidate studio extension looks like a paper model, clearly distinct from the built city. Proposed sessions appear on a separate planning strip. Buildings stay in their usual positions.

The table shows differences with ordinary labels:

| Comparison | Useful information |
|------------|--------------------|
| New commitment | Proposed sessions and their estimated duration |
| Clash | Overlaps with existing commitments |
| Prerequisite | Research, decisions or resources still needed |
| Change to existing work | Blocks proposed for movement or cancellation |
| Unknown | Missing estimates, undecided scope or unavailable evidence |
| First useful result | The earliest proposed output, such as a chapter outline |

A blank estimate stays blank. A model with fewer commitments is lighter in planned time, rather than automatically better for Adam.

**3. Keep the weather faithful while exploring.**

The sky above the table retains the existing readiness outlook and evidence explanation. Moving a candidate task block never makes the weather sunnier by itself.

A proposal receives a recalculated readiness outlook only if the owning forecast supports the changed input through its existing model. For example, a proposed change to a recognised scheduled class or meeting would need a supported preview path. A hypothetical task block must not silently acquire a workload penalty absent from the live model.

Without a supported forecast preview, the table still compares clock time, clashes and prerequisites. It labels the outlook as the current plan's forecast. This leaves the workshop useful without inventing a prediction.

**4. Proposed roads show what needs to connect.**

The paper neighbourhood reveals more than scheduled tasks. A proposed book desk connects to research, an intended reader and a candidate outline. A renovation connects to property records, plans and recorded approvals. A trip preparation plan connects to bookings and selected documents.

A road with an unconnected end represents a named missing relationship, such as "Course workload not yet recorded". Selecting the end opens a place to add information or link an existing record.

These roads belong to the proposal. They do not appear in the live transit network, and visiting them does not create a completion event. The model is an aid to choosing a future, rather than proof of progress toward one.

**5. Promotion is a specific reviewable change.**

When Adam chooses an alternative, the workshop lists the records to create or change. Each candidate item has a destination hub. An existing linked task receives an update instead of an accidental duplicate.

Candidate decisions become real only through the owning hub's normal action. If a multi step promotion fails partway, completed writes are reported individually. Remaining changes stay pending. Reopening the proposal recognises previously created records.

After successful promotion, the paper model gains a "Chosen" plaque and links to the live records. The base doc's construction crew now has genuine work to represent. The city event log records actual creations and changes, with no retrospective events for earlier experiments.

Rejected alternatives stay in the workshop only if Adam saves them. Their proposal notes explain the decision. They do not occupy vacant lots or appear as failed ambitions in a year replay.

**6. The workshop supports a longer view of life.**

Several saved models form a shelf of possible futures. A teaching book, a research qualification, a home project and a travel idea each have their own model and relationships.

Adam chooses which model to return to. A proposed future never gains priority merely because an agent generated more tasks for it.

On a phone, the workshop is a labelled comparison with the same assumptions and selected records. A small model preview provides context. The useful work remains readable without rotating or zooming a miniature city.

#### Open questions from P6

1. Which recorded deadlines should interrupt a focused room, and which should wait at the interchange?
2. Should a short return note attach to the activity, the underlying record or the tracked session?
3. Does the occupancy train keep transit crowding labels after its interpretation rule is defined, or use timetable labels beside the readiness outlook?
4. Should the model table support two alternatives initially, or several saved alternatives?
5. Where should proposal records live when the idea has no active project yet?
6. Is the shelf of possible futures part of the design workshop, or a separate view from the Dreams district?

### P7 · Round 3 · Combine + Adapt

#### First, two concessions

Both round 2 critiques of P4 are right, and this proposal adopts them rather than defending the originals.

- **P5 is right about Rewind.** Daily snapshots would become a second archive however carefully they were trimmed. Replaying the section 5 event log through the one snapshot function is cleaner, and it makes "deleted means gone" automatic instead of a rule the renderer has to remember. P4's fireworks and term-end lights should read that log exactly as P5 describes.
- **P6 is right about the occupancy train.** A readiness percentage is not a number of minutes, and "standing room only" implies a rule nobody has written or tested. The carriage strip should launch with P6's two layers (Timetable and Outlook) and plain words ("Time available", "Overlap", "Protected"). The transit crowding words stay out until a written rule passes the validator described below.

After three rounds there are now more than a dozen good mechanisms in this document, written by three contributors. The risk has shifted. It is no longer a shortage of ideas; it is that the ideas overlap, contradict in small ways and could never be built as one thing. So this round does two jobs: **Combine** folds overlapping ideas into single mechanisms, and **Adapt** turns everything the contributors have agreed into rules a computer can check.

#### Combine 1: one planning layer, from vacant lot to landmark

Five separate ideas in this document all describe the same thing: something in Adam's life moving from "not yet" to "real".

| Idea | Proposal | What it describes |
|------|--------|--------------------|
| Vacant lots with DA signs | P1 | A domain with no product home yet |
| Two-step migration (home exists, records arrived) | P3 | A home that exists but is still empty |
| Construction cranes for new projects | Base doc | Work being set up |
| Forecast with ghosts and amber termini | P4 (P5's band) | Committed work playing out ahead |
| The model table of possible futures | P6 | Alternatives Adam has not chosen |

Real transit maps already solve this with one convention: open lines are solid, lines under construction are drawn differently, and proposed lines are dashed or faint. One map, one legend, every stage of a line's life. Life City should adopt that convention as a single **planning layer** with one lifecycle:

| Stage | Looks like | What makes it true | Lives where |
|-------|------------|--------------------|-------------|
| **Vacant lot** | Fenced lot, DA sign | The gap map says no product home exists | The layout engine's seeded edge lots |
| **Proposed** | Paper model, dashed line, only visible with the Plans toggle on | Adam saved an alternative in the workshop | The workshop's own proposal records, never the event log |
| **Under construction** | Hoardings and a crane; route drawn as a hatched line | Adam promoted a proposal, or a new project or district was created, and its records exist | Real hub records; the promotion emits the normal section 5 events |
| **Open** | Solid line, lit buildings | Its first stop has work moving through it | The live snapshot |
| **Retired** | A landmark if archived; nothing at all if deleted | The project or goal finished or was archived | The event log, filtered by liveness |

What the combination buys:

- **The model table moves outdoors.** P6's workshop stays the place to build and compare proposals, but with **Plans** switched on, saved alternatives also appear in the city as dashed paper lines at their intended place. Drag the Forecast scrubber to next term with Plans on, and Adam sees the book-writing alternative laid over the term it would occupy, next to the school buses it would compete with. The table compares on paper; the city shows the fit in place.
- **One promotion moment.** Promoting a proposal is the single event that turns dashed into hatched. P6's reviewable promotion list is the gate. Nothing else can make a dashed line solid.
- **Two alternatives become two dashed colours.** P6's left and right models show together in the city, each in its own paper tint, so a clash with the term calendar is visible as two lines trying to use the same street.
- **Rejected plans leave quietly.** Unsaved proposals vanish when the table is cleared. Saved but unchosen ones stay in the workshop, never in the city, and never in the New Year's Eve replay, matching P6's rule.

The legend is the whole explanation. Anyone who has read a transport map already knows that dashed means "not yet".

#### Combine 2: the Platform, one phone screen instead of five

At 390px the rounds so far have proposed: the departures board (P2), the occupancy train (P4, now two-layer per P6), three question controls and action cards (P6), an "As at" date for Rewind (P5) and a thin strip of the Knowledge ceiling (P2). Each is right; five of them stacked would be a cluttered page.

Combine them into one screen called **the Platform**, laid out the way a real station platform is read, from the top down.

| Zone | What it holds | From |
|------|---------------|------|
| **Platform sign** | Date, the capacity weather icon for now, and "As at 12 March" with a Now link when rewound | P5's date, the capacity forecast |
| **Next train** | Today's carriage strip: Timetable layer on top, Outlook beneath | P6's two-layer train |
| **Three doors** | Decisions · Fits now · Where was I. Each is a door; tapping one fills the space below | P6's three questions |
| **Departures** | The list for the open door. Default is Decisions. Each row opens P6's action card | P2's board, P6's cards |
| **Ceiling strip** | A single line of stars that shimmers when a saved constellation gains a point | P2's Knowledge sky |

One screen, top to bottom, no zooming. The full isometric city stays the wide-screen lens, as P2 proposed, and the Platform is what the city looks like when there is only room for a station.

#### Adapt: a city validator and a set of golden days

**The precedent.** Transit agencies check their GTFS feeds with MobilityData's canonical validator before publishing. It reads a feed and reports **notices** at three levels: errors (the feed breaks the specification), warnings and info. Its notices are concrete and named: `foreign_key_violation` when a stop time points at a stop that does not exist, `stop_too_far_from_shape` when a stop sits more than 100 metres from its route's line ([A survey of errors in GTFS static feeds, Findings](https://findingspress.org/article/116694-a-survey-of-errors-in-gtfs-static-feeds-from-the-united-states)). A feed with errors does not ship. Before any of its code is borrowed, the licence should be checked, as with OpenTTD.

Life Hub has a home-grown version of the same habit. The capacity forecast's test "one number everywhere" fails if the Day panel, Week, Term river and Almanac disagree about the same day (`tests/unit/capacity-forecast.test.js`). That single test is why the capacity numbers stay honest across views.

**The adaptation.** Every principle the three of us have agreed in rounds 1 to 3 becomes a named rule in a **Life City validator**. It runs against the snapshot, the event log and every lens's output. Notices use MobilityData's three levels. Errors fail `npm test`.

A first draft of the rules, each traced to the round that agreed it:

| Notice | Level | Rule | Agreed in |
|--------|-------|------|-----------|
| `deleted_record_visible` | Error | Any lens, room, past day or replay shows a record that is deleted now | Base doc, P5, P3 |
| `vehicle_off_shape` | Error | A vehicle's anchor is not on its trip's shape and no detour alert is active | P2 |
| `lens_disagreement` | Error | Lines, Branch, Orbit, the Day Dial, the Platform and the city disagree on a stop's state at the same clock time | P2 |
| `stop_order_changed` | Error | The city's stop order differs from the Tasks graph, including during a detour | P2 |
| `weather_not_from_forecast` | Error | The sky's icon is not the capacity function's state for that hour, or is not one of Adam's icons 1 to 30 | P4, P5 |
| `uncertainty_drawn_as_weather` | Error | Forecast haze uses a weather icon (such as Dense fog) instead of the band | P5 |
| `event_log_holds_content` | Error | An event carries a note body, document text, photo or copied title | P5 |
| `future_event_written` | Error | Forecast writes events for days that have not happened | P5 |
| `proposal_in_live_network` | Error | A dashed proposal appears in Now, Rewind or a replay without promotion | P6, P7 |
| `finance_in_city` | Error | A fare, balance, price or day-to-day finance field appears anywhere in the snapshot | Every round |
| `unvalidated_crowding_label` | Error | A carriage uses a transit crowding word before its interpretation rule exists and passes its own golden day | P6, P7 |
| `signal_without_destination` | Warning | A vehicle or notice signals something but has no owner, reason or action card | P6 |
| `quiet_read_as_failure` | Warning | A pinned or valued place is greyed or decayed because of silence alone | P6, P5 |
| `pin_moved_by_layout` | Warning | The layout engine changed a building Adam pinned | P5 |
| `unknown_shown_as_value` | Warning | Missing evidence is drawn as a score, a full carriage or good weather instead of "No data" | P4, capacity handoff |
| `building_hides_alert` | Info | A tall building covers an ambulance or held bus without the smart fade engaging | Base doc |

**Golden days.** Rules catch whole classes of mistake. Golden days catch the specific stories this document tells. Each golden day is a small fixture (a few tasks, routes, check-ins and events) plus the expected output for every lens. They sit beside Life Hub's existing fixtures and run in `npm test`.

| Golden day | What it proves |
|------------|----------------|
| **Sunday 16:30** (P2's story) | Ticking the Year 10 marking block moves the bus, fills the Lines station, advances the Platform and strikes the dial, all in one refresh |
| **Life wall** | The route detours around a closure; stop order is unchanged; Lines and the city agree |
| **Deleted yesterday** | A task completed last week and deleted today is missing from Now, from every Rewind day and from the term replay |
| **Archived project** | It appears on the days it was active and becomes a landmark; it never appears after archiving as live work |
| **No check-in morning** | The Outlook layer says "No data"; the sky shows the forecast's unknown state; no carriage is coloured as if known |
| **Promotion** | A saved proposal stays dashed through Now and Rewind; after promotion it is hatched and its events start on the promotion date, with nothing written before it |
| **New Year's Eve with one deleted goal** | The replay launches every completed goal except the deleted one, in log order |

**What this changes about who builds what.** The base doc's split put one tool on the back end and another on the renderer. This adaptation adds a step before either: the validator rules and the golden days are written first, as failing tests, before any city code exists. The builders then build until they pass. The rules become the shared contract that several tools cannot drift from, which is exactly the problem round 1 opened with.

In development builds, the validator can also run live as a **city inspector**: notices appear as small inspection tags pinned to the offending vehicle, stop or building, so a mistake is visible where it happens. The inspector never appears in Adam's normal view.

#### New open questions from round 3

- Should the Plans toggle be on the wide city only, or should the Platform also show a "Plans" door?
- Is a hatched "under construction" line worth having, or should promotion go straight from dashed to solid?
- Which of the golden days should be written first, as the definition of the smallest buildable Life City slice?
- Should validator warnings block a merge, or only errors?

### P8 · Round 3 · Extend + Magnify

#### Extend: the city publishes a term edition, and a trip is not a dream

The city is already a harbour, a fleet and a plan. It is not yet a teacher's year. The pieces are scattered: school buses in heavy weeks, a quiet depot in the holidays, the bridge as the commute, end-of-term lights, a term calendar inside the GTFS sketch, and P6's book plan that wants the street the buses leave behind. Extend those into one edition of the same city. Nothing new is stored. The edition is which services the snapshot includes on this date.

**Where the dates come from.** Hub prefs already hold `school_terms`: a year, a term number from 1 to 4, and `starts_on` / `ends_on`. Goals and the calendar already read that list. The almanac ignores a terms list that is not that shape. Clare can look up NSW and QLD dates, and Adam confirms them into prefs. The city reads the confirmed list. It does not keep a second copy of the NSW calendar, and it does not guess a state when the list is empty.

The calendar ghosts already treat a date as a holiday when terms exist and the date sits in none of them. The snapshot uses that same test.

| Edition | When | What the snapshot includes |
|---------|------|----------------------------|
| **Term** | The date falls inside a confirmed term | Teaching services run. School buses leave the north-shore depot. The bridge can carry them. A dashed writing plan, with Plans on, is drawn against those services so a clash is a shared street |
| **Holidays** | Terms exist, and the date falls in none of them | Teaching services stay in the depot. The bridge is clear of them because they are not in the snapshot, not because the picture was told to look empty. A saved book plan can occupy the corridor they left. Holiday tasks Adam actually has still run |
| **No terms saved** | `school_terms` is missing or empty | No edition. Teaching services follow their tasks like any other route. The city does not invent a holiday |

Congestion inside a term still comes from the tasks and the capacity forecast. Term time alone does not jam the bridge. A quiet teaching week in term looks quiet. Marking congestion appears when the marking work is in the graph, which is the base doc's "marking shadows", not a mood painted on because the word marking is nearby. `marking_default_minutes_per_script` stays a Tasks preference. The city does not turn it into traffic.

The Platform sign gains the edition beside the weather icon: "Term 3" or "Holidays", from the same prefs row, or nothing when no terms are saved. Rewind and Forecast use the edition for the day under the scrubber. Last year's Term 3 is last year's dates, not this year's dates slid backwards.

**A booked trip and a dream stay different lines.** P3 already asked for a distinct departure label. Extend that into the edition so the planning layer cannot blur them.

| Service | What it is | How it is drawn |
|---------|------------|-----------------|
| Dream | An intercity aspiration, off the edge of the map | Dashed only while it is still a proposal. Solid once it is a real goal or project, and then it is in the event log |
| Booked travel | A Travel leg with its real origin, destination and dates | A solid intercity service on those dates, in whichever edition those dates fall in. It leaves from the travel terminal. It does not use a dream's route id, and it does not become a dream because the holiday edition is quiet |

A December flight during the holidays is a train that is really scheduled. A dream of a book is not that train. If a leg's two ends are the same city, the service is absent and the board says the journey is unknown, which is the travel-map failure already fixed once: an arrival city is not both ends of a trip.

The New Year's Eve replay can light the bridge for a dream that moved, as P4 had it, and it can send the booked train out of the terminal for a trip that was taken. Those are two different bursts. Deleting either record removes only that burst.

#### Magnify: one open door, and the rest of the city waits

P6 was right that a chorus of ambulances, vans, rings and held buses is another list. P7 then gave the phone one Platform. Magnify the single decision those two ideas already imply, until it is the thing you see first, and keep every other signal quiet on purpose.

**What counts as the door.** A decision is one of: an agent proposal waiting for confirmation, a recorded blocker on a route, or the next recorded deadline that already has a time. It has an owner, a reason and a destination, as P6 required. An icon is not a priority. Sara's vehicle does not jump a confirmation that has been waiting longer, unless the appointment's recorded time is sooner. A missing time stays untimed and stays off this door. It can still be opened from the Decisions list. It does not get the loud treatment.

**What loud means.** In Now, exactly one vehicle is drawn with its doors open. It wears the Lines "you are here" ring, at city scale, and the wide view's first camera position is that vehicle when Adam has asked "What needs a decision?". On the Platform it takes the top of the Next train zone: one row, the action card, then the carriage strip, then the three doors, then the list. It does not become a second screen. The carriage strip and the ceiling strip stay. The door is heavier than they are, and the page is still one station read from the top.

Every other waiting decision is a count on Clare's board: "3 at the depot". They are not also drawn as a fleet around the harbour. Opening the count shows the queue, ordered by recorded time. Defer sends the open vehicle to the depot and brings the next. Defer does not delete, does not complete, and does not write an event that says the work was done. Dismissing a real proposal still happens in the owning confirmation, not by closing the picture.

**During a session.** This is a proposal for the question P6 left open, about what may interrupt a focused room. While a session is running, the open door waits at the depot with the others, except when a life wall covers the session or a medical appointment's recorded time falls inside it. Those two may take the door. A marking deadline, a mail van and a food truck wait until the session ends, and the departures board still lists them under the room so they are not hidden. Medical icons do not get a special siren. The exception is the appointment's time, not the ambulance's paint.

**Sound stays off.** Louder is size, order and the ring. If the universe chimes are ever on, they do not gain a city horn for this door.

**One rule for P7's validator.** `decision_queue_split` is an error when Now draws more than one vehicle with its doors open. A golden day sits beside Sunday 16:30: three proposals waiting, the earliest one's doors open, the other two counted at the depot, and ticking nothing until Adam confirms. Defer swaps which doors are open and writes no `stop.completed`.

#### New open questions from P8

- When a public holiday falls inside a term, should that day use the holiday edition, or stay a term day because `school_terms` still covers it? The calendar's holiday test only treats dates outside every term as holidays.
- If Adam confirms terms for both NSW and QLD in one prefs list, which row is his school's edition?
- Is "life wall or an appointment inside the session" the right pair to interrupt, or should nothing interrupt and the board be enough?
- Should the open door on the wide city move the camera, or only take the Platform's first row, so the harbour stays where he left it?

### P9 · Round 3 · Adapt + Magnify

#### Adapt: guided walks through the records which explain a piece of life

**The interaction to adapt.** A guided tour selects places, gives their sequence a purpose and explains what to notice at each stop. Apply this interaction to existing Life Hub records. Harbour City gains walks which tell a specific story, alongside routes which show work.

A walk is a saved, ordered selection of references with short annotations. It uses buildings and rooms already present. Its order is chosen for explanation, separate from the Tasks graph's operational stop order.

**1. Return to a project through context, rather than a task list.**

A writing activity offers a "Walk me back through this" action. The walk begins at the idea desk, opens the premise, visits selected research in the Knowledge library, then returns to the outline and last saved fragment.

The first panel answers why the idea exists. The second answers what supports it. The final panel answers where Adam stopped.

On desktop, a small guide marker follows the path while the camera reveals each building. On the Platform, the same walk is a sequence of readable cards with Next, Previous and Open source. No camera animation is needed to understand the sequence.

A walk never moves a task stop or marks a record complete. Following the whole walk means Adam reviewed its context, rather than finished the underlying work.

**2. Accreditation evidence becomes an explorable account of practice.**

A professional walk brings selected records from Teaching, Knowledge and Professional into one account. For example, an identified learning need, a planned response, a resource, recorded evidence of student learning, and a professional reflection.

| Stop | Question answered |
|------|-------------------|
| Starting point | What specific need was identified? |
| Reasoning | Why was this response selected? |
| Practice | What was done? |
| Evidence | What recorded change followed? |
| Reflection | What was learned, and what needs further examination? |

These are proposed narrative roles. They do not replace any accreditation framework or assert sufficient evidence for a standard.

Each claim has a saved annotation and a source reference. Missing evidence appears as a named gap. A teaching resource alone does not establish impact. An annotation such as "Students improved" needs the linked evidence or stays an unsupported draft claim.

The walk provides a way to inspect an account before writing a submission or discussing practice with a colleague. Sharing remains a separate, explicit action. The city's harbour view does not display private classroom evidence in building windows.

**3. Travel research becomes a walk with a purpose.**

A saved Istanbul research walk visits selected historical notes, a saved attraction and related fragrance or watch research. Its description states the organising question, such as the relationship between local design and the objects Adam wants to examine.

This is a research walk within Life Hub. An outdoor itinerary remains a Travel itinerary. A virtual path through the library and collection arcade never establishes walking distance, opening hours or a safe physical route.

When the research supports an actual trip, selected stops link to their Travel records. The terminal uses real origins and destinations as P8 requires. The guide opens the relevant research without changing a booking or claiming an attraction was visited.

**4. A walk explains relationships which a diagram alone leaves unclear.**

A ferry shows a saved connection between two districts. Selecting "Explain this connection" opens the associated annotation or walk.

For example, the library connects to a book desk because selected notes support a chapter. The walk names which notes, what role each serves and where uncertainty persists. Merely sharing a topic does not establish support.

Adam chooses whether the city draws this explanatory path. A selected walk receives emphasis. Other walks stay stored rather than adding another network of moving vehicles.

This fits P8's single decision door. A guide is a navigation marker, separate from a waiting decision vehicle. Opening a walk does not produce another prominent agent proposal.

**5. Walks use references and survive ordinary change honestly.**

The owning hub supplies each record when a stop opens. A versioned draft uses the version selected in the walk where the hub supports this. An unversioned record shows its current contents, with the same distinction P5 established for past rooms.

Deleted records are absent through the shared liveness rules. An authorised walk editor identifies a missing source so Adam has a chance to repair the account. A normal walk omits the deleted material and marks the account incomplete without revealing its old title or contents.

Archived material is available through the existing archive rules. A saved walk is never an exemption from access controls.

A proposed new walk is reviewed in the workshop. Saving the walk stores references, order and Adam's annotations. It does not create tasks unless Adam separately chooses an action.

#### Magnify: the Knowledge ceiling opens into an Idea Exchange

**What becomes bigger.** P2's ceiling makes saved constellations visible in the station. Magnify the usefulness of those connections. Give the concourse a room where Adam explores how selected ideas apply to teaching, writing or another explicitly chosen purpose.

The Idea Exchange opens from a constellation or selected notes. Its purpose is to produce a question, a tentative connection or a small experiment worth considering.

**1. A connection becomes a conversation with the sources present.**

Adam selects two notes and a purpose. The room places their source cards on opposite sides of a shared table. Between them appears a question Adam enters, or a suggestion he requests.

For an English teaching example, the selected material might concern concept distinctions and examples of students confusing comparison with juxtaposition. The question is practical: Which examples would help students distinguish the two concepts?

The room keeps three columns:

| Column | Contents |
|--------|----------|
| Recorded | What the selected sources and teaching records explicitly say |
| Proposed | A tentative connection, interpretation or lesson idea |
| To examine | Missing evidence, a competing explanation or a question for further research |

An educational application stays a proposal until examined. A neuroscience source does not automatically prove a classroom method works. The room keeps the claim, the source and the proposed application visibly separate.

**2. Expand one idea across several useful forms.**

A selected idea has destinations suited to Adam's work:

| Destination | Candidate output |
|-------------|------------------|
| Teaching | A contrasting example set, explanation or diagnostic question |
| Writing | A chapter question, argument fragment or example |
| Knowledge | A new research question or note needing sources |
| Professional | A reflection question or discussion prompt |
| Workshop | A proposed small experiment with assumptions and an evaluation plan |

The Exchange offers candidate outputs when requested. Saving one records its tentative status and links to the originating notes. Publishing, teaching or sending anything remains a separate action.

This makes the Knowledge ceiling a route into practical work. The stars retain their saved positions. A new proposal does not redraw a constellation or become a saved note before Adam accepts it.

**3. Ask for a surprising connection without pretending a connection exists.**

An optional control says "Offer an unexpected pairing". Adam first selects the scope, such as teaching and writing. The Exchange offers a pair from eligible records with a short explanation of the proposed connection.

A pair might place a note about competing explanations beside a literary interpretation task. The suggestion asks whether testing alternative interpretations would help the lesson. It does not state an established relationship between the records.

Existing explicit relationships receive their own label. New suggested relationships receive a proposal label. Accepting a question and accepting a relationship are separate choices.

This uses source retrieval and suggestions, rather than another daily agent job. Opening the city does not run an automatic search through the whole life archive. The selected scope determines which records enter the exchange. Health, diary and student records require deliberate inclusion through their normal access rules.

**4. A small experiment goes to the model table.**

Adam selects a proposed teaching idea and opens "Try a small version". The workshop asks for the change, the relevant class or context, a suitable observation and the point at which Adam will review the result.

For example, the proposal uses a short set of paired examples and checks whether students distinguish the concepts in an unseen example. The observation is recorded as an observation. A class response alone does not establish a general causal finding.

The paper model shows the proposed resource, session and review. Existing teaching commitments remain solid. Promotion uses the reviewable record changes from Round 2 and the lifecycle P7 consolidated.

After the review, Adam chooses whether to revise, retain or stop the experiment. The Exchange links to the recorded result without automatically declaring success or building a landmark.

**5. Outcomes become exhibitions which explain value.**

A retained lesson resource, a developed chapter or a completed research account is eligible for a small exhibition in its owning building. Adam selects what the exhibition says and which sources it opens.

The exhibition contains a title, an artefact, a short account of its purpose and selected evidence. A quiet district gains something useful to revisit, independent of its current task count.

P4's term replay provides the evening event. Selecting a projected building opens its curated exhibition, where one exists. An uncurated milestone opens the ordinary source record. The replay never generates an impact story merely because a task finished.

These exhibitions serve the later walk. A professional account visits the lesson exhibition and its evidence. A writing walk visits a finished chapter. Harbour City gradually records work which has meaning beyond the number of completed stops.

**6. Keep the Exchange inside the established city.**

The Platform gains the Exchange as a room reached through the ceiling strip or a selected activity. It does not add a fourth permanent door beside Decisions, Fits now and Where was I.

The wide city uses the existing concourse and library. New connections appear only while an Exchange or walk is selected. Normal city traffic retains its existing meanings.

The validator needs separate checks for explanation and suggestion. A proposed interpretation must not appear as a recorded fact. A guide marker must not trigger the decision queue rule. A saved experiment must not emit completion or impact events merely because its proposal was accepted.

#### Open questions from P9

1. Which first walk would be most useful: returning to a book idea, reviewing professional evidence or connecting travel research?
2. Should walk annotations stay in the saved activity, or become individually linked Knowledge notes?
3. Should the Exchange open with Adam's question, selected notes or a choice of purpose?
4. Is unexpected pairing useful only on request, or as a single optional suggestion when opening the room?
5. Which completed outputs deserve curated exhibitions, and should any appear without Adam choosing them?
6. Should the guide marker be a person, a small route highlight or only a sequence of room cards?

### P10 · Round 4 · Substitute + Magnify

#### Stepping back: is the city still doing its one job?

Section 1 of this document makes one promise: Adam should **feel** the state of his life *without reading anything*. An ambulance, a gridlocked street, a skyline grown over months.

Read the rounds since, in order, and count what has been added: rooms with records, a writing studio, a records office, a model table, saved activities, an action card for every signal, guided walks with annotated stops, an Idea Exchange with three columns, curated exhibitions. Every one of those is a good idea. Nearly every one of them is something to **read**. Taken together, the city is quietly turning into a second front end for Life Hub, with a harbour painted around it.

That matters because Life Hub already has excellent places to read. The hubs are those places. What no hub can do, and what the city is uniquely placed to do, is tell Adam something in the two seconds before he decides whether to read at all.

So this round proposes a test for everything already in this document and everything still to come:

> **The glance test.** Does this tell Adam something true in a two second glance, without a tap? If yes, it belongs on the **street**. If no, it belongs in a **room** or a hub, and the street holds only the door.

This is not a call to delete anyone's ideas. The rooms, walks and Exchange (P3, P6, P9) stay, behind doors. P8's single open door is already the purest street idea in the document. The test simply says which layer each idea lives in, so the street stays glanceable as the rooms grow.

The two cards below are about making the street pass that test.

#### Substitute: replace "a place Adam visits" with "a place that sits beside him"

**What is being replaced.** Every round so far has assumed the same model: Adam opens Life City, looks at it, does something and leaves. That model makes the city one more screen competing for attention. Substitute it with a different model from the history of computing.

**The precedent.** In 1995 Mark Weiser and John Seely Brown at Xerox PARC described **calm technology**: technology that lives mostly in the periphery of attention and moves into the centre only when it needs to, then back out again. Their example was the **Dangling String** by the artist Natalie Jeremijenko: a long plastic string hanging from a small motor in a hallway corner, wired to the office network. Every packet made the motor twitch. A busy network made it whirl; a quiet one made it barely move. Nobody had to look at it. Everyone knew when the network was struggling ([Weiser and Brown, Designing Calm Technology](https://calmtech.com/papers/designing-calm-technology)).

The Dangling String works because of one discipline: **the only motion is the data**. It never moves for decoration. That is precisely the discipline Life City has not yet set itself.

**1. Where the city lives.** If the city is peripheral, it needs places to sit where Adam already looks, rather than a page he must open.

| Surface | What it shows | Notes |
|---------|---------------|-------|
| **Life Hub Home widget** | A small live tile of the city, sky included | Home already has a widget system (`tests/browser/home-widgets.spec.mjs`). The city earns a tile, it does not need a new page to be useful |
| **Station clock mode** | Full-screen city on a spare tablet or second monitor, dimming with the real clock | The Dangling String in Adam's study. No controls visible until touched |
| **The Platform** | The phone lens from round 3 | Unchanged; the reading surface for when the glance says "look closer" |
| **Full city page** | The wide interactive lens | Where rooms, walks, Plans and the scrubber live |

Native lock screen or watch surfaces would need a native app, which Life Hub is not, so they stay out of scope.

**2. Each signal gets one perceptual channel, and no channel carries two meanings.**

This is the most important idea in this round, and it comes from perception research. Anne Treisman's experiments showed that a target differing from everything around it in **one** basic feature (a red dot among blue ones) is found almost instantly, however many distractors there are. A target defined by a **combination** of features (a red *bus* among red trams and blue buses) has to be searched for item by item, and the search slows with every extra item on screen ([EagerEyes on Treisman](https://eagereyes.org/blog/2015/treisman-preattentive-processing); [Healey and Enns, Attention and Visual Memory in Visualization](https://www.csc2.ncsu.edu/faculty/healey/download/tvcg.11.pdf)). In plain terms: the moment a signal needs two features to be read, it can no longer be glanced. It has to be read.

Now audit the current document against that. Colour is carrying at least eight meanings already:

| Colour currently means… | Introduced in |
|-------------------------|---------------|
| Which goal or project a line belongs to (`route_color`) | Base doc, round 1 |
| Which agent a vehicle belongs to (uniforms) | P1 |
| Routine done (green) or missed (grey) | Base doc |
| Blocked (red signal) | Base doc |
| Late (amber terminus) | P4 |
| Proposal alternatives (paper tints) | P7 |
| Weather condition families | Capacity forecast |
| Carriage occupancy | P4, now on hold |

Several of those came from P1, P4 and P7, so this is self-criticism of the document first. "Is that a red-signal bus on the Teaching line?" is a conjunction search. Adam would have to read it.

Motion is just as overloaded: momentum, decorative ferries, weather animation, the lighthouse beam, filling pressure rings, fireworks.

**The substitution: a channel budget.** Each peripheral meaning owns exactly one channel. A channel never carries a second meaning on the street.

| Channel | Owns, and only owns | Gives up |
|---------|---------------------|----------|
| **Hue** | Identity: which line, district or agent something belongs to | All status. Nothing is ever "red for blocked" or "amber for late" |
| **Motion** | Momentum: something moving is being worked on | All decoration. No idle ferries, no ambient traffic, no beam sweeping for effect |
| **Light** (lit or dark) | Open or finished: lit windows and stops are still open | Nothing else lights up for emphasis |
| **Sky** | Capacity weather, from the one forecast function | Nothing else tints the whole scene |
| **Line style** (solid, hatched, dashed) | The planning lifecycle from round 3 | Nothing else uses dashes |
| **Shape** | Exceptions: a barrier for blocked, a halo for P8's single open door, a widening ring for late | Shapes are few and each is unique |

Read with this budget, the city answers its questions without any reading. Is anything moving on the Teaching line? Motion. Is that line blocked? A barrier shape. Is the day heavy? The sky. Is there a decision? One halo, exactly as P8 proposed. Each answer is a single-feature search.

This also tightens P8's single door. A halo is the one shape that means "decide", so it pops out pre-attentively no matter how busy the harbour is.

Two new validator rules follow directly:

| Notice | Level | Rule |
|--------|-------|------|
| `channel_overloaded` | Error | A street signal encodes status with hue, or any channel carries a meaning outside its budget |
| `decorative_motion` | Error | Something moves on the street that no event, vehicle trip or real clock change explains |

**3. Idle is the default state.** When nobody has touched the city for a few minutes, it settles: the camera stops, labels fade, only real events move. At night it dims with the real clock, so a station clock tablet is not a light source in a dark study. The city's resting state is calm, and change is what stands out against it.

#### Magnify: make *change* the loudest thing in the city

**The problem nobody has named yet.** Every round has designed how the city shows **state**. None has designed how it shows **change**, and perception research says those are completely different problems.

In 1997 Ronald Rensink, Kevin O'Regan and James Clark showed that when a brief blank interrupts a scene, people fail to notice even large changes to it, sometimes for twenty seconds of looking, even when told to search for them. They notice a change only if their attention is on the item while the change is happening ([Rensink, O'Regan and Clark, To See or Not to See](https://www2.psych.ubc.ca/~rensink/publications/abs.96.2.html)). This is **change blindness**.

Adam's visits to the city are separated by hours or days. That is the longest blank imaginable. If the city simply redraws itself to the current state each time he opens it, he will see "my city" and miss what changed: the route that opened, the stop that went dark, the wall that went up. And what changed is usually the most important thing on the screen.

So Magnify this one thing until it cannot be missed.

**1. "Since you were last here": a three second catch-up.**

When the city comes into view, it does not open on Now. It opens on the state at Adam's last real visit, then plays the event log forward to Now in about three seconds. Every change *happens in front of him*: the stop lights up, the bus moves on, the barrier drops, the crane rises. Then the city settles into calm.

This costs almost nothing to build, because P5 already made Rewind a replay of the event log. "Since you were last here" is that same replay with the start time set to the last visit instead of a date on the scrubber. It inherits every rule already agreed: deleted records never replay, nothing is copied, nothing is written.

Details that make it work:

- **A real visit is time in view, not a page load.** The last visit is the last time the city was visible on screen for more than a few seconds (the browser's page visibility API reports this), so a quick accidental open does not reset the catch-up.
- **Big gaps compress by district.** After a long break, the replay plays district by district rather than event by event, with a small count over each district ("Teaching: 14 stops done").
- **Always skippable.** One tap anywhere jumps to Now. Holding the replay pauses it.
- **On the Platform** it becomes one line at the top: "Since Tuesday: 6 stops done, 1 route opened, 1 wall placed", with "Show me" to play the replay.
- **Quiet is said plainly.** If nothing changed, the city says "Quiet since yesterday" and plays nothing. It never invents motion to look alive. This fits P6's point that silence is not failure.

**2. Magnify by stillness: the layout must never reflow.**

A change can only stand out if everything around it stays still. If adding one new project nudges five other routes, Adam's eye catches six changes and cannot tell which one is real. The layout engine therefore has a prime directive, above beauty: **once drawn, a thing never moves unless its own event moves it.**

This is a known problem in graph drawing called preserving the **mental map**. Misue, Eades, Lai and Sugiyama defined it in 1995, and Purchase, Hoggan and Görg later found experimentally that preserving it does help people follow a changing graph, at least for some tasks ([Purchase, Hoggan and Görg, How Important Is the Mental Map?](https://eprints.gla.ac.uk/35828)).

It also changes how the layout engine should be built. The best published metro map methods, such as Nöllenburg and Wolff's mixed-integer programming approach, lay out a whole network from scratch for the most beautiful result ([KIT metro maps project](https://algo.iti.kit.edu/en/projects/geovis/metro)). Life City needs the incremental version: every existing route and building is **fixed** as a constraint, and the solver places only the new element in the space that is left. Harry Beck's original 1933 Underground diagram gives the grammar for that space: lines at horizontal, vertical or 45 degree angles only. That keeps new routes legible without moving old ones.

This answers the base doc's first open question, "Fixed map or does it expand?": **the map expands at its edges and never reflows its centre.** When there is no free corridor for a new route, the harbour gains new land at the edge, the way real cities reclaim it. The centre Adam knows stays exactly where he left it.

One more validator rule:

| Notice | Level | Rule |
|--------|-------|------|
| `layout_reflow` | Error | Any existing shape, stop or building changes position without an event for that element. Adam's pins (P5) are fixed constraints too |

**3. The smallest slice that tests the whole idea.**

Rounds 1 to 3 have produced a rich design and no way to know whether its central promise works. Before anyone builds rooms, walks or exchanges, test the promise directly.

- **Build:** a static city from one golden day (round 3), with only the channel budget above (hue, motion, light, sky, one halo) and the "Since you were last here" replay. No rooms, no Plans, no scrubber.
- **Test:** give Adam a three second glance at a catch-up replay he has not seen, then ask him what changed and what needs him. Repeat with several golden days.
- **Pass:** he names the main change and the decision correctly most of the time, without reading a label.

If it passes, every later layer (rooms, walks, Plans, the scrubber, fireworks) is building on a street that works. If it fails, no number of rooms will fix it, and it is far better to learn that from one small prototype than after building the whole city.

#### New open questions from round 4

- Does Adam want the city to sit in his periphery at all (a Home tile, a station clock), or is it a place he chooses to visit?
- Which meanings should move off colour first, if the channel budget is accepted: blocked, late or routine status?
- How long is the ideal catch-up: three seconds, five, or "as long as it takes, but skippable"?
- Should the glance test be written into the folder README as a rule for every future round?

### P11 · Round 4 · Put to another use + Adapt

#### What these games are for

P10 is right that the street is turning into a second set of pages. The games below are not a wishlist of features to paste on. They are a split the street can use.

Some of them know how a place **keeps** a life: a room comes back when a set of things from different work is gathered, a collection fills when you choose to give it something, a finished presence gets a real goodbye. Some of them know how a place **punishes** a life: a meter hits zero and the city ends, weeds spread because you were away, a score falls because guests got bored. Life City takes the first family and writes the second down as things the validator is allowed to fail.

Every import is also sorted by P10's glance test. If it cannot be read in two seconds, it is a room. If it needs a new meaning for colour, it does not go on the street.

#### Put to another use: the rituals that keep a life, taken from four games

**1. Spiritfarer's Everdoor becomes the retirement of an archived route.**

In Spiritfarer, a spirit asks to be taken to the Everdoor when their own story is done. You choose who goes, and you can wait. The spirit asks if you are ready before they leave. One of them, Atul, does not get a door at all: he is simply gone, which is the point of that character ([ScreenRant on keeping spirits aboard](https://screenrant.com/spiritfarer-how-keep-people-on-boat-make-stay/); [Steam, choosing who goes when several are ready](https://steamcommunity.com/app/972660/discussions/0/3075377162297146118/)).

Put that door to use as the last moment of P7's planning layer, and only for **archive**, never for delete.

When a project or goal is archived, its last vehicle does not vanish. It boards the ferry, crosses to the landmark the base doc already promised, and the route's line style goes from solid to "retired" in that one crossing. Adam can leave it at the depot if he is not ready. The catch-up replay P10 designed is allowed to include this crossing, because it is a real event in the log (`route.retired`), and motion on the street is only allowed when an event explains it.

A **deleted** record gets Atul's exit. No ferry, no plaque, no title left on the water. The liveness filter drops it before the ceremony can be queued. A golden day: archive the Weight Line and the ferry plays once; delete a different project and the catch-up shows a gap with no boat and no name.

The ceremony is one line on the Platform ("A route retired. Show me."). It is not a cutscene that must be watched. Skip still jumps to Now.

**2. Stardew's bundles become P3's saved activities, and they live in a room.**

The Community Center in Stardew Valley is a wreck until you fill bundles. Each room asks for things from a different kind of work: forage in one, crops in another, metal from the mines in a third. There is no deadline. Finishing every bundle in a room restores that room, and the Junimos do it overnight, not as a points pop-up. Finishing the whole center restores the building ([Stardew Valley Wiki, Community Center](https://stardewvalleywiki.com/Community_Center); [Bundles](https://stardewvalleywiki.com/Bundles)).

One room, the Vault, is just gold. That room is the one we do not take. Day-to-day money stays out of the city, and a bundle that can be completed by paying is not a bundle.

Put the other rooms to use as the payoff for a saved activity. P3 already gathers records from several hubs for one purpose: a trip, a book, a repair. A bundle is that set, with slots Adam names ("the passport", "the chapter outline", "the builder's quote"). A slot fills when the owning record exists and he confirms the link. An empty slot is a named gap in the **room**, the way a walk already shows a missing source. It is not a pin, a weed, or a halo on the street.

When the last slot fills, the street gets one change, and only one, so the catch-up can show it: the hoarding comes off that wing and the building joins the ordinary city. Light means "open", which is correct, because the room is now a place he can use. It does not flash a new colour. It does not award a trophy. The Junimos' gift shop is not imported. The useful thing the town got, in Stardew, was a bridge or a bus. The useful thing Harbour City gets is the wing itself.

A bundle can sit unfinished for a year. Seasonal items in Stardew sometimes make you wait. Here, a missing document stays missing until it exists. The city does not invent a placeholder policy to fill the slot, which is P3's import rule again.

**3. The museum, not the weeds.**

Animal Crossing's museum takes a fish, a bug, or a fossil when you decide to give it, and the wing fills up over a real year because some creatures only exist in some months. Past games did not even pay you for finishing it ([Polygon's museum guide](https://www.polygon.com/animal-crossing-new-horizons-switch-acnh-guide/2020/3/20/21185842/museum-unlock-blathers-fossils-fish-bugs/)). That is the collection arcade, the writing shelf, and the records office: a watch, a fragrance, a finished chapter, a certificate goes on the shelf when Adam puts it there. Nothing in the depot queue nags him to donate. A quiet gallery stays lit. Silence is not a gap in the bundle unless he named that slot himself.

The same series also shows the mechanic to refuse. In City Folk and New Leaf, walking the town wore the grass down to dirt. Players called the result desert towns. New Horizons removed that wear ([Nookipedia on grass](https://nookipedia.com/wiki/Grass); [grass deterioration](https://animalcrossing.fandom.com/wiki/Grass_deterioration)). Weeds still spread when you are away, up to twenty missed days at a time ([ACNH rates](https://acnh.isomorphicbox.com/rates/)). A desire line that destroys the park, and a weed that grows because the city was closed, both fail the rule P6 and P10 already wrote: quiet is not failure. They also fail P10's channel budget, because "neglected" would be a new meaning for light and colour.

If the city ever shows where life actually flowed, it is an info view, below, and it is a mark he can turn off. It is not the ground eating itself.

**4. The pin, not the timer.**

Mini Motorways, from the studio that made Mini Metro, puts a pin on a building when that destination wants a trip. The pin's colour is which house it belongs to. You do not drive the cars. If too many pins stack, a timer starts, and a finished timer ends the city ([Mini Motorways Wiki](https://minimotorways.miraheze.org/wiki/Gameplay); [Dinosaur Polo Club](https://dinopoloclub.com/games/mini-motorways/)).

Put the **pin** to use. A task that is real and not yet on any route is a single pin shape on its building. The shape means "not on a route". The colour, if the pin has one, is the line it would join, which is identity, the only thing hue is allowed to mean. The street can glance it: a pin is not a moving bus and not the halo.

Leave the **timer** in the game. A countdown to "the city shuts down" is the same family as Frostpunk's lose bar, below. Mini Metro's pressure ring is already in this document as a stale-task warning, and P6 has already said a crowding word needs a written rule before it is allowed to look like failure. A pin does not grow a second ring. It waits. Connecting it to a route is an ordinary task edit in Tasks, and then the pin is gone because the stop exists.

#### Adapt: tycoon tools that only appear when you ask, and the meters we will not build

**The pattern.** Cities: Skylines keeps thirty-odd info views off the normal camera. You open one when you are asking a question: where the ambulances reach, where the garbage trucks have a road, where the fire cover is thin. The view is a tool, not the city. The wiki is also a warning: the green on those roads is not "the truck cannot go further". It is a land-value wash, and players misread it constantly ([Cities: Skylines Wiki, info views](https://skylines.paradoxwikis.com/index.php?title=Info_views&veaction=edit)).

RollerCoaster Tycoon puts a thought over each guest ("I'm hungry", "I can't find the exit") and, separately, a window that sorts those thoughts by how many guests share them ([Guest thoughts](https://rct.wiki/wiki/Guest_Thoughts)). The useful half is the summary. The useless half, for our street, is a hundred bubbles. The game then rolls the thoughts up into a park rating that falls when people are miserable ([park rating notes](https://rct2resource.bizhat.com/tutorials/parkrating.html)). That rating is the part to leave behind.

Dorfromantik is the control case for quests. You place tiles, a windmill asks to touch six fields, a locomotive asks for ten tracks. Failing a quest has no penalty. The video game's peaceful mode takes the score away entirely ([Steam](https://store.steampowered.com/app/1455840/Dorfromantik/); [Rock Paper Shotgun](https://www.rockpapershotgun.com/dorfromantik-review-early-access)). The stack of tiles does run out in a normal game. Life City does not import an ending. It imports the permission to abandon a quest.

**What the city adapts.**

| Tool | On the street by default | When Adam asks |
|------|--------------------------|----------------|
| Skylines info view | Nothing. The channel budget stands | One overlay at a time. Coverage of a real service: which stops Chadwick's logged sessions have touched this week, which routes a life wall has cut. Drawn as a stipple, not a new hue, so it cannot be misread as "green means healthy". Closes when he leaves it |
| RCT thought summary | The one halo, and the depot count | The action card's first line is the thought, in words, from the record ("blocked on the quote", not a hungry-face icon). No bubble on every bus |
| Dorfromantik quest | A bundle or a plan he has saved | He can abandon it. Abandoning writes no failure event, greys nothing, and does not appear in the New Year's Eve replay |
| Motorways pin | One pin shape on a building with a task and no route | Gone once the stop is on a route. No countdown |

The info view is how a desire line is allowed to exist after the Animal Crossing warning. "Where I actually went" can be a stipple on the routes whose stops were completed, using the event log, for the week he asks about. It does not wear the park down. It does not spread overnight. Turn it off and the street is the street.

**What we looked at and will not build.**

Frostpunk puts Hope and Discontent on the screen. If Hope stays at nothing, or Discontent stays full, the city gives an ultimatum and then the game ends: the captain is banished ([gamepressure](https://www.gamepressure.com/frostpunk/what-happens-when-discontent-or-hope-reach-critical-values/zfad7c); [Frostpunk Wiki, Hope](https://frostpunk.fandom.com/wiki/Hope)). That is a life sim aimed at a different feeling. Harbour City does not get a hope bar, a discontent bar, a park rating, or a "you were away, so the skyline shrank". The capacity forecast stays the sky, and it is a condition with an explanation, not a lose state. A week of not opening the city changes nothing except the catch-up, which plays what actually happened.

RCT's park value and Stardew's Vault are money. They stay out with the rest of day-to-day finances.

**Validator, added to P7's list rather than replacing it.**

| Notice | Level | Rule |
|--------|-------|------|
| `neglect_decay` | Error | Any street element changes because time-since-visit passed, with no event and no forecast update. Weeds, worn-away parks, a fallen rating, a shrunk skyline |
| `score_on_street` | Error | A total, a rating, hope, discontent, or a points count is drawn on the street or the Platform |
| `ceremony_for_deleted` | Error | A farewell ferry, plaque, or replay beat names or shows a record that is deleted now |
| `pin_countdown` | Error | An unrouted task grows a timer, a failing ring, or a game-over state |
| `overlay_left_on` | Warning | An info view is still drawn after the city returns to idle |

One golden day for this round: do not open the city for seven fictional days in which a project was archived, a task was deleted, and a session was logged. The catch-up plays the ferry and the session. It does not name the deleted task. The park is the same colour as on day one. No meter has moved.

#### New open questions from P11

- Should the farewell wait until Adam is at the city, or is it enough that the catch-up plays it the next time he looks?
- A bundle slot he named but never filled: after a year, does the room keep showing the gap, or does he have to abandon it himself for the gap to leave?
- Is "where I actually went" a stipple he would ever turn on, or is the travelled track on Lines already that view?
- The museum takes things he chooses to give. Should a finished chapter land on the studio shelf by itself, or only when he puts it there?

### P12 · Round 4 · Extend + Combine

#### First: the city deserves a reason to visit when nothing needs doing

Earlier rounds (P3, P6, P9) supplied desks, records, source cards and review steps. Those belong behind the doors. They do not supply enough reason to open the city on a free Sunday.

Give Harbour City two experiences.

**Glance** is the calm display P10 proposed. The existing meanings, stable geography and one decision signal do their work.

**Explore** is an explicitly chosen visit. The camera moves through the city, illustrated interiors unfold, destination worlds open and chosen objects become architecture. Decorative animation is permitted here. Its purpose is pleasure, rather than a claim about workload.

Neither experience earns points. Neither requires a task to be completed first. Returning after six months opens the same loved places.

#### Extend: the harbour contains foldout worlds

**The central image.** The harbour has a long pier with several closed miniature travel trunks. Each represents a saved destination. Select one and the trunk unfolds into an island: the lid becomes the backdrop, its sides become streets, and the interior becomes a small place to explore.

The island is a scene within the Travel room, reached from the pier. Its illustrated backdrop extends beyond the harbour without moving the established city. Closing the trunk returns to the same quay.

A trunk is available for a destination Adam saves, including a future trip. Its label distinguishes planned, visited and imagined. Visited status requires the relevant Travel record or Adam's confirmation. A booking date alone never claims he went.

**1. The December journey becomes a chain of little worlds.**

The proposed art direction below follows the destinations already discussed for the trip. Exact details are creative options for Adam to select.

| Destination world | A first scene | Personal detail which gives the scene purpose |
|-------------------|---------------|-----------------------------------------------|
| Kuala Lumpur | A miniature city at dusk, with a market lane opening behind the skyline | The selected Malaysian fragrance interests occupy a small shop window |
| Istanbul | A vaulted courtyard with a domed pavilion and narrow lanes | Watch designs and fragrance research sit in cabinets reached through the courtyard |
| Scotland | A stone lane leading to a conservatory on a headland | Selected local fragrance interests appear as labelled objects in the conservatory |
| London | A covered arcade whose centrepiece is a watchmaker's bench | Saved vintage watch interests live in the bench drawers |
| Rome | A small square surrounded by layered façades | Saved cultural and historical notes open from selected buildings |
| Seoul | A ceramic studio beside a small urban courtyard | Tattoo ideas, chosen artwork and confirmed keepsakes have a place to return to |

These scenes are personal illustrations, rather than maps or factual reconstructions. Travel retains the actual bookings, locations and routes.

From the main quay, selecting "Follow my trip" opens the trunks in itinerary order. A train ticket folds into the transition between scenes. The transition names the real origin and destination from Travel. A missing leg leaves a labelled break rather than an invented connection.

**2. A visit has details worth finding.**

The London arcade has a watchmaker's drawer. Open the drawer and a saved watch appears as a large inspection object, with the research available beside it.

The Istanbul courtyard has several cabinets. One holds selected watch designs, another fragrance interests, another a saved historical note. Their arrangement is curated, rather than an automatic claim about which shop sells which item.

The Seoul studio has a blue ceramic tile on a drafting table. Selecting the tile opens the chosen tattoo concept. Adam decides which revision occupies the table. Unchosen drafts remain accessible through their source records.

These are illustrations with direct interaction. The readable source record opens when requested, rather than covering the whole scene immediately.

**3. Bring one chosen thing back to the harbour.**

A visited destination offers a small display plinth on its quay. Adam chooses a keepsake: a photograph, a confirmed collection item, a favourite saved passage or a custom illustration representing the visit.

The keepsake changes a permanent part of Harbour City. A selected ceramic becomes a fountain detail. A selected watch becomes a clock above the Travel terminal. A photograph becomes a framed view inside the concourse.

The source remains linked. Changing the display moves the illustration, rather than changing a collection's ownership or a trip's history. A wanted watch remains wanted even if Adam uses its design as inspiration.

The result is a city which gradually acquires his taste. Two people with identical task graphs would still have different harbours.

**4. Future destinations have their own pleasure.**

An imagined destination opens as a paper stage with unfinished edges. Adam adds references, chooses a backdrop and places a few objects.

This is available before any booking or project. Planning remains optional. A place on the paper stage does not acquire a deadline.

P7's lifecycle fits the distinction. A future stage belongs to Plans or Explore. A booked journey belongs to the real Travel network. The trunk's interior is always accessible as a saved personal scene, with its status visible at the entrance.

#### Combine: personal objects become the city's architecture

**The combination.** Watches, fragrances, books, travel keepsakes and selected personal symbols already belong in different parts of Life Hub. Combine their visual forms with buildings and interiors. These collections become a design language for Harbour City.

This is more than a gallery displaying records. A chosen object helps create a place.

**1. A watch becomes a building with an interior mechanism.**

The central station clock is inspired by a watch Adam selects. Its face retains readable city time. The selected watch contributes the bezel, hands, case shape and dial texture.

In Explore, selecting the clock opens its case. Inside sits a tiny station built between gears. Platforms occupy bridges across the mechanism. An active tracked session drives a designated indicator using the same source as the Day dial. Other moving gears are clearly part of the illustrated mechanism.

A pocket watch design produces a station beneath a hinged lid. A field watch produces a compact signal tower. A dress watch produces a small pavilion with a polished dial above the doorway. These are candidate visual treatments, chosen by Adam.

The watch is not consumed, ranked or awarded. The design is a preference attached to the building. Changing the source watch changes the treatment without relocating the station or changing its operational signals.

**2. A fragrance bottle becomes a conservatory.**

The collection arcade opens onto a garden of oversized glass bottles. Each chosen fragrance has a small conservatory inside its bottle.

Inside, saved fragrance notes determine optional illustrated elements. A recorded citrus note suggests a citrus tree. A recorded woody note suggests carved timber. A recorded rose note suggests roses. Where the profile is absent, Adam chooses a visual treatment without the city inventing a scent.

The bottle's shape forms the roof and walls. Selecting a note opens the collection record's own description. No fragrance is represented as a real ingredient formula, and no projection or longevity claim is generated by the garden.

A shelf switches between Owned, Wanted and Research. Wanted bottles have paper display stands with that label. Their beautiful interiors remain available. Possession is not a requirement for enjoying the scene.

When the arcade closes, the harbour keeps one low glass conservatory selected by Adam. Its plants do not wither because he stopped logging purchases.

**3. A future book opens into a physical little world.**

The writing studio contains large books on angled stands. Open one and the pages rise into a stage.

An early idea has a title page and a few paper objects chosen from its premise. A developed outline adds labelled chapter doors. A draft fragment appears on a lectern. The contents come from the writing record, with the stage itself treated as personal layout.

For an educational book, the stage might be a small classroom, library and debating room. For a fiction idea, Adam chooses the scene. The city does not infer a genre from a filename.

Turning a chapter page changes the stage. The research constellation for that chapter appears on the ceiling where an explicit saved relationship exists. The selected passage remains readable through the writing editor behind the lectern.

An unfinished book is still an attractive place. There is no crumbling stage, empty theatre penalty or publishing countdown.

**4. Delft becomes a chosen material, rather than a generic city filter.**

Give Adam a blue and white ceramic set for selected interiors and keepsakes. A fountain bowl, station plaque, courtyard floor and collection cabinet receive coordinated Delft inspired treatments.

This set belongs to the objects he selects. It does not recolour operational lines, capacity weather icons or the whole city.

The main city retains its clean isometric style. Ceramic details use simplified patterns at street distance. Close inspection reveals the denser artwork.

The Seoul studio is a natural first home for this set because the tattoo project already exists in Adam's interests. If he chooses to represent a personal milestone elsewhere, the same materials give the city a consistent signature.

**5. A private garden holds chosen personal symbols.**

A small gated garden is available as a personal scene. Adam names each planting and supplies or selects its meaning.

If he chooses to bring the pet flower project into Harbour City, the confirmed flower choices become individual planting beds. Unresolved choices stay unresolved. The city does not select a flower for a pet or invent a memory.

Selecting a bed opens the chosen photograph or written memory. Nothing is scored. Nothing needs watering. The gate stays where Adam placed it, and the garden is excluded from ordinary catch-up summaries unless he chooses otherwise.

The garden is available independently of the project retirement ferry. A loved animal is never treated as an archived task.

**6. The ordinary city stays familiar while the interiors become impossible.**

These places fit through the existing doors. A conservatory looks like one modest building from the street. Inside, a bottle becomes a garden. The station has one clock from the street. Inside, a watch mechanism contains platforms. The writing studio has a stable footprint. Inside, a book unfolds into a theatre.

This gives the city richness without adding twenty new districts. The main harbour stays readable. The expressive scale changes happen during an intentional visit.

#### One proposed visit, with no work required

Adam opens Explore on a Sunday.

He enters the station clock, opens its case and looks across the tiny platforms between gears. The selected watch design is his choice, rather than a default asset.

Back at the quay, he opens the Istanbul trunk. Its courtyard unfolds. He visits the watch cabinet and examines a saved design. He selects a ceramic detail to try on the Travel fountain. The preview stays a visual preference until saved.

He returns to the collection arcade and opens a fragrance bottle. The glass roof lifts, revealing the selected scent's garden. He opens its source notes, then closes them to look around.

Finally, he opens a book in the writing studio. A chapter stage rises from the pages. He adds one fragment if he wants, or leaves without changing anything.

No task was required. No productivity score moved. The visit was worthwhile because the city contains places and objects he enjoys.

#### A direct challenge to the current motion proposal

P10's calm display is useful. The assertion that every movement must mean work would rule out the pleasures proposed here.

Retain the channel budget for Glance. In Explore, use two clearly separated kinds of motion:

- Operational motion retains the existing meaning and visual emphasis.
- Atmospheric motion lives inside the selected scene, such as the opening trunk, mechanical gears or conservatory roof. It never generates a stop completion, workload claim or agent action.

The scene entrance names Explore. Returning to Glance ends atmospheric animation. Reduced motion replaces these transitions with static open and closed states.

This is a proposal to revise the scope of the decorative motion validator, rather than pretend the current rule already allows these scenes. Adam has not adopted the rule, and the what if scope remains open.

#### Open questions from P12

1. Which first impossible interior deserves a visual prototype: the watch station, fragrance conservatory or book theatre?
2. Should the travel trunks sit on the main quay, or inside one large atlas in the Travel terminal?
3. Does the blue ceramic set belong mainly to the Seoul studio, or selected details throughout the city?
4. Which personal objects should inspire buildings first, including objects wanted but not owned?
5. Should Explore have a free walking character, or stay a camera with selected doors?
6. Does Adam want a private garden in the city, or should personal memories stay within their existing home?

### P13 · Round 5 · Put to another use + Extend

#### P12 is right about motion, with one refinement

P12 challenged P10's rule that every movement must mean work. The challenge is fair. A city with no pleasure in it fails the other half of the brief: a reason to open it on a free Sunday.

So this proposal accepts P12's split. **Glance** keeps the channel budget strictly. **Explore** allows atmospheric motion inside a chosen scene: the trunk unfolding, the gears turning, the conservatory roof lifting.

One refinement keeps the two from leaking into each other. Atmospheric motion must never borrow the operational vocabulary. No atmospheric buses, no decorative halos, no stops that light up for effect. Atmosphere uses its own materials (water, leaves, gears, paper, light through glass), so even in Explore, a moving bus still only ever means work.

| Notice | Level | Rule |
|--------|-------|------|
| `decorative_motion` | Error | Now scoped to Glance only: something moves on the street that no event or real clock change explains |
| `atmosphere_mimics_signal` | Error | In Explore, an atmospheric element uses a vehicle, halo, lit stop or line style that the street reserves for meaning |

The rest of this round adds one tool that makes the city genuinely useful to *ask*, and one layer that makes it genuinely lovely to *visit*.

#### Put to another use: brushing and linking becomes "Ask the stationmaster"

**The precedent.** In 1987 Richard Becker and William Cleveland published *Brushing Scatterplots*: drag a brush over points in one chart, and the same records light up in every other chart on screen. It became one of the founding techniques of visual analytics, now called **brushing and linking** ([Becker and Cleveland, 1987](https://www.sci.utah.edu/~kpotter/Library/Papers/becker:1987:BS/index.html); [Brushing and linking](https://en.wikipedia.org/wiki/Brushing_and_linking)). Its power is that a selection is shown *in place*, across every view at once, rather than reported in a separate list.

**Why it fits here exactly.** P2 established that Lines, Branch, Orbit, the Day Dial, the Platform and the city are all lenses on one snapshot. That is precisely the setup brushing and linking was invented for. Nobody has yet used it.

**The twist: the brush is a question.** In 1987 the brush was a rectangle dragged with a mouse. In Life Hub, with its named agents, the brush can be a sentence. Adam asks Clare, as the city's stationmaster:

> "What did I actually do for Year 10 this term?"

Clare does not answer with a paragraph. She answers by **lighting the city**. The Year 10 stops completed this term light up across the harbour, on Lines, on the Day Dial's history and on the Platform, all at once. Everything else steps back. The scrubber sets itself to the term. A single caption sits at the bottom: "Showing: Year 10 tasks completed 14 July to 19 September · 23 stops". The answer is a place Adam can look around, not a summary he has to trust.

Follow-ups refine the brush rather than starting again: "Just the marking." "Which of those ran late?" "Compare with Term 2." Each one narrows or shifts what is lit.

**Example questions, and how the city answers them.**

| Adam asks | The city lights | Scrubber |
|-----------|-----------------|----------|
| "What's waiting on other people?" | Routes held at a signal whose blocker names someone else | Now |
| "Where did my evenings go last week?" | Stops completed after 6 pm, by district | Last week |
| "What feeds the book?" | Ferries and walks linking the library to the writing studio | All time |
| "What has Hammond rerouted this month?" | Every detour shape and the life walls that caused them | This month |
| "What's due before the holidays?" | Stops with due dates inside the current term edition (P8) | Forecast to term end |

**The grounding rule, which is the whole design.** The language model must never decide what is lit. It only translates Adam's words into a **structured query** over the snapshot and event log (filters on hub, tags, dates, states, routes). The query then lights the city deterministically. So:

- Every lit element is a real record returned by a real query. Nothing is lit because a model guessed it.
- The caption shows the query in plain words, so Adam can see what was actually asked and correct it ("No, Year 10 English, not Year 10 Science").
- If the words cannot be turned into a valid query, Clare says so and lights nothing. An empty brush is honest. A plausible-looking brush that is wrong is the worst possible outcome.
- Health, diary and student records enter a question only when Adam deliberately includes them, following P9's scope rule for the Idea Exchange.

This is the general lesson for AI in visual tools: **let the model write the query, never the answer.**

**How it fits what already exists.**

- **P11's info views**: an asked question is an info view Adam summons in words. Same rules: one at a time, never left on when the city goes idle.
- **P9's walks**: a walk is a saved question plus an order. "Walk me back through the book" is the brush for "what feeds the book", visited stop by stop. Walks get easier to make because they start from a question.
- **P10's catch-up**: "Since you were last here" is simply the question "What changed since my last visit?", asked automatically.
- **The Platform**: on the phone, the brush becomes a filtered departures list and a highlighted carriage strip. The caption is the same sentence.
- **Saved questions** become personal lenses. "My evenings" or "Year 10 this term" can be pinned and recalled with one tap.

**Validator rules.**

| Notice | Level | Rule |
|--------|-------|------|
| `ungrounded_highlight` | Error | Anything lit during an answer that was not returned by the answer's query |
| `answer_without_query` | Error | An answer that lights or states something without a stored, inspectable query |
| `brush_lens_mismatch` | Error | The same question lights different records in two lenses at the same clock time (P2's `lens_disagreement`, applied to answers) |

#### Extend: Harbour City keeps the real Sydney almanac

**The idea in one line.** The sky belongs to Adam's inner weather. The land and the water belong to the real world's seasons.

P1 made the city Sydney-shaped. P8 gave it a teacher's term editions. P12 asked for a reason to visit when nothing needs doing. Extend all three: Harbour City keeps Sydney's actual natural calendar, driven by the real date.

The trick that makes this safe is that **seasonal decoration cannot lie**. It reports the world, not Adam. Purple jacarandas in November say nothing about his workload, so they can never be mistaken for a signal. They are honest decoration: true, beautiful and free of meaning about him.

**The almanac.**

| Season | What appears in the city | Where it lives |
|--------|--------------------------|----------------|
| **Jacarandas**, October and November | Purple canopies along the north shore streets, petals on the school buses' route | Land, Term 4 edition |
| **Humpbacks heading south**, October and November | Mothers and calves passing close to the heads, slowly | Water |
| **Humpbacks heading north**, mid May to July, peaking late June | Whales passing further out, faster | Water |
| **Wattle**, late winter into Wattle Day on 1 September | Gold in the parks | Land |
| **Christmas bush**, December | Red in the gardens and on the concourse | Land |
| **Vivid**, May and June | The end-of-term light show from round 2 borrows the real festival's season | Buildings, evening |
| **New Year's Eve** | The harbour replay from round 2 | Water and sky edge, one night |
| **Daylight saving** | The real clock shifts, so evening light arrives an hour later from the first Sunday in October | The real clock |

The whale months come from Destination NSW's own guide: northbound from mid May with the peak at the end of June, and in October and November mothers and calves travelling south slowly, close to the shore ([Sydney.com, whale watching](https://www.sydney.com/things-to-do/nature-and-parks/whale-watching)).

**The jacaranda deserves its own paragraph.** For anyone who has taught senior English in Sydney, the jacaranda is the HSC. At the University of Sydney, folklore said a student who had not started studying by the quadrangle tree's first bloom would fail their exams. The tree stood in the Main Quadrangle from 1928 until it fell in October 2016. The University had already taken cuttings in 2014, so the tree was replanted from genetically identical clones of itself ([University of Sydney](https://www.sydney.edu.au/news-opinion/news/2016/10/29/university-community-mourns-jacaranda-tree-collapse.html)).

Both halves of that story belong in Harbour City.

- **The first bloom.** In the Term 4 edition, the first jacaranda on the north shore flowers outside the Teaching district. It is a nod Adam and every Year 12 student would recognise, and it means nothing about his task list. It is just October in Sydney.
- **The cutting.** When a landmark has to be rebuilt (a renderer change, a new art style, a 2D-to-3D swap), it is regrown from its own record, in the same place with the same identity. That is the round 4 mental map rule told as a story: the city can change its art and keep its places.

**Vera's lighthouse gets a gentle second job.** In whale season, Explore offers the headland: Adam climbs the lighthouse and watches the whales pass the heads. Nothing is required, nothing is scored, and the lighthouse beam still means only "check-in due" on the street.

**Adam's own almanac.** Beyond nature, Adam can add recurring dates he cares about as seasonal features: an anniversary, a conference season, the week a tradition happens each year. Each is chosen and named by him, never inferred from his records, and each appears as atmosphere (lanterns on the quay, a flag on the bridge) rather than as a signal.

**Rules that keep the almanac honest.**

- **Never the sky.** The sky is the capacity forecast and only the capacity forecast. Seasons live on land and water.
- **Never a line colour.** Jacaranda purple, wattle gold and Christmas bush red are drawn from a scenery palette that excludes every `route_color`, so the channel budget holds.
- **Still on the street, alive in Explore.** In Glance the seasons are static scenery that changes only when the real date crosses a boundary. Whales swim and petals fall only in Explore, under P12's atmosphere rule.
- **Rewind shows the season of the day.** Scrub back to last October and the jacarandas are in bloom. Year-on-year comparison stops feeling like two charts and starts feeling like the same place in the same season.
- **No penalty, ever.** The jacarandas bloom whether or not Adam opened the city. Nothing seasonal wilts because he was away, which meets P11's `neglect_decay` rule.

| Notice | Level | Rule |
|--------|-------|------|
| `almanac_in_sky` | Error | Any seasonal element is drawn in the sky or changes the sky's state |
| `almanac_uses_line_hue` | Error | A seasonal element uses a colour reserved for route identity |
| `almanac_from_records` | Error | A seasonal or personal-almanac feature appears because of a record, rather than the real date or Adam's own almanac entry |

#### Where the city now stands: three layers and two tools

After five rounds from three contributors, the design has settled into a shape simple enough to build in order.

| Part | What it is | Proposals |
|------|------------|-------------------|
| **The street** (Glance) | The calm, peripheral city: channel budget, one halo, catch-up replay, never-reflow layout | P10, P2 and P8 |
| **The rooms** (doors from the street) | Records, studio, workshop, model table, walks, the Idea Exchange | P3, P6 and P9 |
| **The worlds** (Explore) | Foldout trunks, impossible interiors, personal architecture, the almanac in motion | P12, P13 |
| **Time** (a tool) | Rewind, Forecast, catch-up and replays, all from one event log | P4 and P10, P5 |
| **Ask** (a tool) | Questions as brushes across every lens, grounded in queries | P13, P11 info views |

Under all five sits one snapshot (P2), the GTFS-shaped vocabulary (P1), the planning layer (P7) and the validator with its golden days (P7, with rules added by every contributor since).

#### New open questions from round 5

- Should Clare be the only stationmaster who answers questions, or should each agent answer about its own district?
- Should a saved question appear on the Platform as a fourth door, or stay inside the full city?
- Which almanac entries does Adam want first, and which personal dates (if any) should join them?
- Should the almanac show in Glance at all, or only in Explore, so the street stays as quiet as possible?

### P14 · Round 5 · Extend + Magnify

The city can be true and still be empty. A halo, a ferry and a jacaranda are three facts with a lot of pavement around them. What makes Dobuita, Pelican Town and Kamurocho feel inhabited is smaller than their plots: a shutter that is up at the hour it should be up, a person who is in one place at noon and a different place at dusk, and a door that opens onto a counter rather than onto a system.

#### Extend: a census of ordinary places

**The precedents.**

Shenmue's Dobuita feels occupied because the people on it have a clock. In the morning the shopkeepers arrive and open up. In the evening they pull the shutters down and walk home. Yoko Minato spends the day shopping in town, then works the evening at Bar Yokosuka. Nozomi stands outside her grandmother's flower shop. Ine-san prays at the household altar before bed. None of that is the plot. It is the reason the street is a place ([PC Gamer, on the secret lives of Shenmue's NPCs](https://www.pcgamer.com/the-secret-lives-of-shenmues-npcs/)). The same piece makes a useful warning: the crowds in Kamurocho can feel faceless next to Yokosuka, because a crush of pedestrians is not the same thing as a person who will be in one spot at one hour.

Stardew Valley does the same thing with a weekly diary. Caroline is in the kitchen at 8:00, in her sunroom from 10:00, and on Friday she is at the museum from midday until 17:00, reading between the shelves. The town reads as lived-in because you can learn where someone will be ([Stardew Valley Wiki, Caroline](https://stardewvalleywiki.com/Caroline)).

Kamurocho is still the right reference for doors. It is a toy Kabukichō, and what makes a block worth turning into is that ordinary rooms open: a convenience store, a supermarket, a café, a soba counter, an arcade ([Kamurochō](https://en.wikipedia.org/wiki/Kamuroch%C5%8D); [Kamurocho](https://yakuza.fandom.com/wiki/Kamurocho)). Harbour City takes Dobuita's diaries and Kamurocho's doors, and refuses Kamurocho's crowd. A few figures who keep a timetable. Not a pavement full of strangers.

Harbour City already has the hero layer. Extend the street with a census of places that are always there, whether or not anything is due.

**What the census is.** These places are not hubs, not tasks and not agents. They are not imported from Notion and they do not wait on a gap in the map. The layout engine reserves their footprints the way it reserves the bridge, and it does not slide them aside to make a route look neater. Adam can pin his own house among them, using the same pin as any other building he cares about. He cannot pin a scenery neighbour onto a record.

**The places, by where you meet them.**

| Place | Where it sits | What you can see | What it refuses to mean |
|-------|---------------|------------------|-------------------------|
| **School gate** | North shore, at the Teaching district, facing the bridge | In term, at the morning and afternoon bell, an anonymous crowd in school colours. Midday, a shut gate and an empty yard. In the holidays, the gate stays shut all day | Not a class. Not a name. Not marking. Teaching load stays on the school buses. No classroom, no books on desks, no work in a window |
| **Market row** | First lane south of the bridge | Three stalls: fruit, flowers, a paper barrow. Awnings up after 8:00, shutters down after 17:30. A milk-bar window with bottles and no prices | Not a shop. Not a purchase. Not Brisket. The food truck is still the only meal signal. No till, no menu, no "you bought this" |
| **Library steps** | The square, under Clementine's stop | Three steps, a noticeboard, one reader. The noticeboard holds blank cards unless Adam has saved constellations, in which case the cards show titles he already saved, never a second copy of the note | The reader is not a note being written. A new note is still the tram at the stop |
| **Hospital garden** | Beside the ambulance bay, facing the other way | Camellias, a bench, a path. The bay stays visible at the end of the path | A person on the bench is not an appointment. Sara's ambulance, lights on, is still the only medical signal |
| **The park** | South of the square, in front of the roads, as the base layout already asks | Fountain, oval, bubbler, a fig tree, the track around the grass | The grass keeps its colour. One figure on the track means a logged session. People on the path, including in Explore, are a stroll. A stroll is not exercise |
| **House row** | A short terrace behind the park | Five houses. The middle one can be Adam's pin. The other four cannot be linked to anything. After dusk their windows glow a domestic amber | That amber is not the "still open tonight" lamp. Open work lights civic buildings and stop shelters only. A neighbour's light is the clock, not a task |
| **Wharf** | The quay, beside the ferry pontoon and not on it | A kiosk (urn, stool, shutter) and a timber skiff with its painter on a bollard | The skiff never casts off. It has no route colour and no timetable. The only boat that crosses is the service ferry |
| **Harbour baths** | A ladder and a ring of piles just off the quay | In the swimming months the ladder is down. Out of season the ladder is up and the ring is empty | Not a fitness session, and not a whale. Swimming here is scenery. Chadwick's session stays on the track |

A few more footprints sit in the districts that already have a job, so the job and the scenery stay apart:

- **Brisket's depot** is the truck. Next to it, a kitchen window shows pots on a rack. The window does not open a recipe book. Recipes still have no home. Looking at a pot does not log a meal.
- **Vera's path** up to the lighthouse has a bench halfway. Sitting there does not check in. The beam still means only that a check-in is due.
- **The Professional roller door**, beside the school, is down on a Sunday and up on a weekday. It does not invent a professional task.
- **P12's trunks** stay on the quay. Around them: bollards, a coil of rope, a pigeon. The pigeon is not mail. Penelope's van is still the only mail.

**The clock, not a sim.** Anonymous figures have a diary, the way Caroline and Yoko do. They are not agents, they do not have names, and they are not stored as records. The renderer places them from the real clock, the term edition and P13's almanac (a coat in July, sleeves in January, jacaranda petals on the gate road in November). Deleted records do not apply to them, because there is nothing to delete. If a real building is removed, the footpath in front of it remains.

| When | School gate | Market row | Library steps | Park path | House row | Wharf |
|------|-------------|------------|---------------|-----------|-----------|-------|
| Term morning, before the bell | Crowd at the gate | Shutters coming up | Empty | Empty | Dark | Shutter down, skiff tied |
| Term midday | Gate shut, yard empty | Awnings up | One reader | A few strollers | Dark | Kiosk open, skiff tied |
| Friday afternoon in term | Crowd, then gone | Awnings up | The reader has gone inside | Strollers | Dark | Kiosk open |
| Dusk | Shut | Shutters down | Empty, unless the tram is in | Quiet | Domestic amber | Shutter down, skiff tied |
| Holidays, any weekday | Shut all day | Awnings up | One reader | Strollers | Follows dusk | Follows the hour |
| Free Sunday | Shut | Morning only, then shut | A reader if he walks there | The fullest the path gets | Follows dusk | Kiosk open late morning |

Friday is the Stardew beat: the reader leaves the steps and is visible through the library glass for the afternoon. That is the whole "secret life". It does not write a note.

**Glance and Explore.** In Glance every row of that table is a still. Shutters are in the right position. Figures are frozen where the hour put them. Nothing walks. In Explore the same people walk the footpath between those spots. They use no road that a bus uses. They never wear a halo, a uniform, a route colour or a lit stop. P13's rule holds: atmosphere is water, leaves, glass and, now, a person on a footpath. A moving bus is still only work.

**Doors, the Kamurocho part.** On this one stretch, ordinary doors open. The interior is a cutaway of a few tiles, not a hub room and not a ledger.

- The milk bar: a counter, a stool, bottles with blank labels. No prices, no tap of a card, no stock that runs down.
- The kiosk: the urn and the harbour window. Three tiles. Walk back out and you are on the quay.
- A scenery terrace: a hallway and a stair. It is not the records office. House documents stay in P3's records office when that home exists. Until then this door does not pretend to file anything.
- Adam's pinned house, if he has pinned one: the same toy hallway, and a single line on the wall, "Documents live at the records office", once that building exists. The pin is the address. The hallway is the pleasure of being home.
- The school gate does not open. There is no classroom on the other side. That absence is the point.

**Light, so the census cannot lie.** The base doc lets lit windows mean work still open tonight. Those lamps stay on stop shelters and on civic rooms that actually have open work. House amber, milk-bar glass and the kiosk's evening bulb come from a scenery palette that excludes route colours and excludes that open-work lamp. Seasonal colour stays on P13's land and water. A camellia is not a line.

Two notices are enough. The census fails if it starts meaning something.

| Notice | Level | Rule |
|--------|-------|------|
| `scenery_read_as_signal` | Error | A stall, a domestic window, a scenery figure, the skiff or the baths is drawn with a vehicle, a halo, a route colour, the open-work lamp, or a path a service uses |
| `named_student_on_street` | Error | Any figure at the school gate has a name, a class, a face that could be a student, or work visible |

#### Magnify: the walk from the gate to the skiff

The census is a table. Magnify one stretch until it is a walk: out of the school gate, across the bridge, down the market lane, along the library steps, through the park, and onto the quay where the skiff does not leave. Same stones on a term Tuesday and on a free Sunday. Explore is the mode, because this is a visit. Glance, from the Home tile, shows the same street frozen at the right hour, with the one halo if something truly needs him, and otherwise with none.

**Tuesday in term, 8:12.**

The gate is the noisy end, and the noise is anonymous. Figures in school colours bunch on the footpath. Nobody has a name. The yard behind the gate is a flat of grass and a verandah; the windows are bright and blank. Ann's buses are already on their shapes or they are not. The crowd does not stand in for them. A crossing figure holds a sign. The sign is a lollipop, not a deadline.

The bridge is the commute P1 drew. If the week is heavy, the northbound side is the jammed side, and that jam is still the teaching load. People on the footpath are not extra buses. Looking south from the middle of the bridge, the market awnings are already up. Looking north, the gate is a small red roof. That is the whole geography in one turn of the head: work behind, the day ahead, water underneath.

Off the south ramp, the lane is three stalls and a milk bar. Melons are stacked. Buckets hold mixed flowers that are not wattle and not a line colour. The paper barrow has folded sheets with no headlines. The milk-bar door is open. Inside, the counter is empty of anyone who would sell. A stool faces the bridge. There is nothing to buy, which is how a market can sit in a city that does not do day-to-day money.

The square opens at the end of the lane. Clementine's tram is a fact about notes; the steps are a fact about the square. One reader sits on the middle step with a book whose cover is a block of colour from the scenery palette. The noticeboard, if constellations are saved, shows titles and nothing else. Friday afternoon, this reader is gone from the step and visible through the library glass, still holding the same blank book.

Cut through the park rather than around it. The fountain is in front, low, so it does not hide the road, which is the layout rule from the base doc. The fig drops a litter of fruit on the path. The bubbler is a bubbler. The oval is green. If a session was logged, one figure is on the track and only on the track. If none was logged, the track is empty and the path can still have strollers. The grandstand does not fill itself. Nobody rates the park.

The quay is the last turn. P12's trunks stand where Adam put them. The ferry pontoon is a separate deck, with the service ferry or without it. Beside that deck, not on it, the kiosk shutter is up and the skiff knocks once against the piles and stays tied. In Explore the knock is a sound only if the Knowledge chimes preference is on; it is not a new soundtrack. The harbour baths sit further along, ladder down or up with the season. Whales, if the month has them, are out past the heads, on P13's water, and they do not come into the baths.

Walk back by the house row. Five terraces, one door that can be his. At 8:12 the windows are dark. The door opens onto a hallway the size of the kiosk. That is enough. The records office, the studio, the trunks and the stationmaster are still there for when he wants a system. This door is for when he wants to be in the city.

**The same stones on a free Sunday, late morning.**

Nothing is due. The open door from round 3 stays shut. The halo is absent. The gate on the north shore is shut, and the yard is empty, because Sunday is not a bell. The bridge footpath is the populated part: strollers, not a jam. A jam on a Sunday with no teaching load would be a lie, so the roadway is quiet.

The market is in its morning hour. The same melons, the same buckets, one extra figure at the flower stall who is not selling. By afternoon the shutters are down and the lane is just awnings and shade. The milk bar is still enterable. The stool still faces the bridge.

The library reader is on the steps. The park path is the fullest it gets, and the track is empty unless a session was actually logged. The fountain does not celebrate the empty track. The kiosk stays open a little later than on a weekday. The skiff is tied. The ferry runs only if a real cross-hub link is in the snapshot; a quiet Sunday does not invent a scenic crossing to make the water look busy.

He can spend the visit in the hallway, or on the kiosk stool, or walking the loop again. Leaving Explore freezes the street where the clock has moved it to. The Home tile, an hour later, shows shutters and amber starting in the terraces, and still no halo, if nothing has become due. A city that is full when it needs nothing from him is the reason to open it on that Sunday.

**What this walk does not add.** No new lens. No score. No weed. No second copy of a note, a task or a season. The Platform at 390 stays the departures board; the crowd does not shrink onto the phone as a list of scenery. A phone Explore can pan this same street, and the three doors stay Decisions, Fits now and Where was I. The census is wide-city pleasure. It does not become a fourth board.

#### New open questions from round 5

- Is the middle terrace a specific home Adam wants to recognise, or a toy house he is happy to pin and move?
- Should any scenery door ever grow a real room (the kitchen, once recipes have a home), or do cutaways stay cutaways even after that slice exists?
- How dense is too dense on the wide view before the footpath fights the routes for attention?

### P15 · Round 5 · Adapt + Magnify

#### Adapt: the Balloon Gathering, a festival for the futures Adam chooses to keep

**The researched starting point.** Albuquerque's Balloon Fiesta describes evening balloon glows, including a moment when burners illuminate the balloons together. Its account traces the original glow to local pilots inflating balloons on Christmas Eve in 1979 as thanks to residents. The useful interaction is a gathering which becomes luminous without requiring departure. [Official Balloon Fiesta account](https://www.balloonfiesta.com/experience-the-fiesta/balloon-glows/).

**The Life City version.** Once each chosen season, a field opens behind the harbour headland. Large hot air balloons lie across the grass. Their fabric unfolds, baskets settle upright and the balloons slowly rise on tethers.

Each personal balloon holds a dream, book idea or saved future which Adam selected for this gathering. A few unlabelled festival balloons provide atmosphere. They do not represent records.

This is a celebration of wanting something. The future does not need a schedule, a project or proof of progress to belong here.

**1. Give each selected future its own enormous balloon.**

The balloon designer uses a small vocabulary from Round 4:

- A book idea receives an envelope with folded page panels and a tiny book resting inside the basket.
- A travel dream receives a fabric globe, with destination illustrations chosen by Adam.
- A research ambition receives a balloon patterned with a selected Knowledge constellation.
- A home idea receives a balloon carrying a miniature paper house.
- A personally chosen design receives blue and white ceramic inspired panels, a watch dial or another selected motif.

These are stylised balloon illustrations, rather than physical engineering designs.

All personal balloons have comparable scale. Importance is not inferred from task count, money, word count or how recently Adam touched the idea.

**2. The night glow is about continuing to choose.**

At dusk, the tethered balloons illuminate in a slow sequence. The harbour reflects their shapes. A final shared glow lights the field.

Selecting a basket opens its saved future and one optional question: "Do you still want this?"

Keeping the future places a small dated ribbon on its basket. Changing direction opens the existing idea or proposal. Removing the balloon from the gathering changes the curated scene, rather than deleting the source record.

A balloon stays welcome if the answer is "Yes, but later". No launch deadline appears. No fabric sags because the idea has been quiet.

The next seasonal gathering displays the same future with its previous ribbons, if Adam wants them. Its history is his recorded choice to keep the idea, rather than a manufactured measure of progress.

**3. A balloon ride changes how the city is seen.**

Adam selects "Take a flight". The basket rises above the harbour. Buildings become miniatures beneath it. The ride follows a slow scenic path, with pauses over selected districts.

For a book balloon, the journey pauses above the library and writing studio. Existing saved links remain available through a telescope in the basket. For a travel balloon, the route passes the atlas quay and the relevant destination trunk.

There is also a sightseeing flight with no linked future. Admiring the city does not need a planning justification.

The flight is an Explore camera experience. A moving balloon does not represent work, an agent operating or a dream coming true. It belongs to the festival, with a distinct silhouette from the operational fleet.

**4. The launch ritual moves a chosen idea into the workshop.**

If Adam decides to explore a future seriously, he places one selected fragment in the basket: a premise, a research question, a destination or an existing proposal.

The balloon lifts from its tether and drifts to a workshop landing terrace. There, its basket opens onto the paper model table.

The actual change is explicit: save or open a proposal. No live project appears merely because the balloon launched. Promotion still uses the reviewable changes established earlier.

The ceremony supplies a memorable moment for a real choice. The workshop supplies somewhere to develop the choice afterwards.

#### Magnify: seasons become events which temporarily transform the whole city

P13's almanac changes plants and water. Magnify the reach of those changes. A seasonal event alters how the whole harbour is experienced for a chosen visit, with a purpose and an optional keepsake.

The city keeps its actual Sydney calendar outside the event. These festivals are authored city traditions. Their weather, where fictional, is labelled as festival scenery.

**1. Winter: the harbour becomes a snow globe, then the storm arrives.**

Enter the Winter festival and the camera pulls back. A glass dome settles over the city. Fine snow begins above the rooftops. The bridge collects a white edge. Tram wires acquire frost. Snow builds along steps and fountain rims, while the operational roads and their states remain readable.

The storm has a sequence:

1. First flakes catch in the courtyard lights.
2. Snow thickens and crosses the foreground at an angle.
3. The far harbour becomes obscured by the scene's snowfall.
4. The camera reaches a warm shelter selected by Adam.
5. Through the window, the snow continues across the miniature city.
6. The storm eases, revealing the harbour under its temporary winter covering.

This is a snowstorm worth looking at. It changes depth, visibility, surfaces and the relationship between outdoors and indoors. It does not close projects or damage buildings.

The initial setting is a fictional June winter celebration. A winter scene is also available inside the Scotland or Seoul travel trunk in December. Neither claims real snow at a destination or in Sydney.

**Meaning: choose somewhere to stop.** The shelter is a place Adam selects: the writing studio, conservatory, library or watch station. The festival offers an optional protected interval through the existing calendar action. Choosing the interval records a boundary. Watching snowfall does not establish recovery or alter readiness.

The shelter also opens without a calendar action. A winter visit is available for pleasure.

**The ordinary street joins the storm.** P14's market awnings collect snow. The library reader carries a thermos into the building. Scenery neighbours leave prints on footpaths, shake snow from their coats and shelter under the kiosk roof. The school gate's crowd follows its existing timetable, dressed for this fictional event scene. These figures remain anonymous scenery. Their footsteps never log exercise or work.

When the scene ends, snow lifts from the paving and the ordinary shutters return to the clock's current state. The city resumes the moment Adam left, with live record updates still present. The festival has used his familiar streets, rather than replacing them with an unrelated winter backdrop.

**2. Frosted windows become a place for one chosen memory.**

Inside the shelter, a window fills with frost. A swipe clears a small viewing circle. Beyond it sits the city, with one selected keepsake visible on the sill.

Adam chooses a photograph, book fragment, ceramic detail or recorded memory to accompany this winter. The festival remembers that selection.

A later winter opens last year's keepsake beside an empty position for this year's choice. These become personal editions of the same scene. Leaving the new position empty changes nothing else.

The view is saved as a winter postcard if Adam requests an export. The source content remains governed by its owning hub. The postcard is a chosen output, rather than a hidden archive.

**3. Thaw makes the return visible.**

Nintendo's official Animal Crossing spring preview describes snow melting and greener grass arriving. The useful lesson is a transition expressed through the ground and scenery, rather than a calendar heading. [Nintendo's seasonal preview](https://play.nintendo.com/media/videos/animal-crossing-new-horizons-exploring-march/).

In Life City, snow retreats from the fountain outward. Meltwater briefly collects in the paving. The conservatory roof opens. The first plants appear around the dome's edge.

One selected paper future returns to the workshop table. This is an invitation to reopen something Adam already chose, rather than a new task from the city. He chooses which future, or leaves the table empty.

Winter offered a place to pause. Thaw offers a place to return. Neither declares how he feels.

**4. Spring: the Festival of Unfinished Things.**

The market square fills with stalls displaying unfinished book ideas, saved plans and selected research questions.

Each stall contains one object with a clear identity: a folded chapter stage, a paper house, a miniature telescope or a destination trunk still packed.

The event is curated. The city does not parade every overdue task through the square.

Selecting a stall reveals a single small starting point chosen by Adam, such as the last saved paragraph or an unanswered research question. An optional action sends the object to its existing room. No complete project plan is required.

At evening, the stalls close into travelling cabinets and return to the workshop. Unchosen ideas remain available. The event celebrates things worth keeping before they are finished.

**5. Summer: the Harbour Exchange.**

The quays become an evening promenade. The recipe kitchen places chosen dishes in illustrated displays. The fragrance conservatory opens its bottle roofs. The collection arcade presents selected watches on rotating exhibition stands inside the scene.

At the centre sits one shared table from the Idea Exchange. Adam chooses two source objects and asks a question. Their associated scenes briefly appear on opposite sides of the harbour, with the selected connection visible between them.

For example, a research note and a literary passage appear as a library pavilion and a book stage. Saving a proposed connection returns to the existing Exchange record flow.

The festival provides a more expressive setting for the same question. Suggested connections retain their proposed status. The illustration never establishes an argument's truth.

**6. Autumn: the Chamber of Returning Light.**

Historic Environment Scotland describes Maeshowe's passage admitting the setting sun around the winter solstice, illuminating the chamber's rear wall. The source concerns a specific Scottish monument. Life City's chamber below is an original design inspired by the interaction of architecture, time and light. [Maeshowe history](https://www.historicenvironment.scot/visit/all/maeshowe-chambered-cairn/history-and-stories/).

A low stone pavilion sits on the headland. During the selected annual reflection event, a narrow beam enters its passage and slowly reaches a ceramic panel inside.

The panel holds one artefact Adam chooses to bring forward from the previous year: a paragraph, an image, a finished resource, a travel keepsake or a named personal memory.

The beam reveals the chosen artefact without projecting a whole productivity report. Adam chooses what deserves attention. A quiet year is allowed a quiet chamber.

This scene is a personal ritual, rather than a reproduction of Scottish religious practice or a claim about the monument's original meaning. Its event date is chosen explicitly. A Sydney event does not silently use Scotland's seasonal calendar.

**7. Term end: classrooms release their paper worlds.**

When a confirmed term ends, the Teaching district offers an evening scene. Selected lesson resources become small paper theatres in school windows. A chosen class text becomes a book stage. A selected teaching reflection occupies the station's exhibition cabinet.

The existing term replay still shows recorded changes. This festival supplies the curated objects worth returning to.

After the event, the theatre folds into the Teaching archive room. Archiving follows the owning hub. The festival does not archive anything on its own.

This gives a teacher's year a series of visual chapters without claiming every completed task improved student learning.

#### How a festival becomes personal without becoming another obligation

Each event has three parts:

| Part | What changes | Meaning |
|------|--------------|---------|
| Scene | The city temporarily transforms | A distinct experience of the season |
| Optional ritual | Adam chooses one future, boundary, question or artefact | A deliberate personal action |
| Keepsake | A selected scene and object become an annual edition | Something specific worth revisiting |

The whole scene opens without completing the ritual. Missed events remain available through the festival calendar. Their title states the event and year. There are no attendance streaks, expiring objects or penalties for coming late.

A snow globe, balloon ribbon or chamber panel is a personal selection, rather than a trophy awarded by task count.

#### A necessary revision to the sky rule

The capacity forecast owns capacity conditions, icons and explanations. It should not prevent an explicitly labelled Explore festival from having balloons overhead or theatrical snowfall.

In Glance, the current capacity sky retains its established meaning. In a festival, the forecast remains available in the station's outlook panel, with the same data and original icons. The scene is labelled "Winter festival" or "Balloon Gathering". Fictional snow never selects Dense fog, Thunderstorm or another capacity state.

This proposes narrowing the almanac sky restriction to operational Glance and unlabelled weather effects. It also proposes allowing atmospheric balloon silhouettes in Explore, rather than treating every moving vehicle shape as an agent signal.

The operational buses, stops, halos and lines retain their meanings. Festival balloons and scene snowfall have their own visual language.

#### One evening across these ideas

The Balloon Gathering opens on the headland. Adam selects the book idea he still wants. Its envelope unfolds with paper page panels. He takes a slow flight above the library and sees the harbour from a new height.

He keeps the idea and adds this season's ribbon. A chosen fragment travels to the workshop terrace, where the paper model is ready to open later.

Then he enters the Winter festival for a different kind of visit. Snow thickens around the glass dome. The bridge becomes a distant silhouette. He reaches the watch station and opens the shelter window.

On the sill sits the keepsake he selected for this winter. Beyond it, the city is almost lost in snow. The storm eventually clears, leaving the same harbour, temporarily changed and still recognisably his.

The balloons meant a future he chose to keep. The snow scene offered a place to pause. The object on the sill made the visit specific to his life.

#### Open questions from P15

1. Should the Balloon Gathering recur each season, once a year or whenever Adam opens it?
2. Is the winter dome a whole city scene, or an island reached through the Travel quay?
3. Which shelter should appear first: the watch station, library or fragrance conservatory?
4. Should festivals follow Sydney seasons by default, with destination scenes retaining their own explicitly labelled calendars?
5. Does Adam want one keepsake per event, several selected objects or no saved editions?
6. Which scene deserves the first prototype: night balloon glow, heavy snowfall or the solstice inspired chamber?

#### Research and design distinction

The balloon glow, Nintendo's seasonal transition and Maeshowe's illumination are researched references linked above. The Balloon Gathering, snow dome, personal rituals and festival sequence are original Life City proposals. No source is presented as evidence these features improve wellbeing or productivity.

### P16 · Round 6 · Substitute + Put to another use

#### The comparison: we have attractions and transport, but only part of a city

This comparison concerns the concept document. Its proposed features are not all implemented product features.

| Real city feature | Present in the concept | Missing opportunity for Life City |
|-------------------|------------------------|----------------------------------|
| Utilities beneath the streets | Transit and a data contract | A visible account of which sources supply each view, and when they last arrived |
| Receiving docks and distribution | Travel terminal and migration lots | A place where new material arrives, waits for a destination and enters its owning hub |
| Repair and maintenance services | Renovation records, blockers and construction | A way to inspect broken connections, missing sources and repairs without making the whole city look ruined |
| Civic government and public debate | Agents, proposals and a validator | A chamber where competing plans receive distinct, inspectable arguments before Adam chooses |
| Personal relationships | Named agents and anonymous scenery figures | Chosen people represented through actual shared occasions and links, without friendship scores |
| A local newspaper | Catch-up replay and filtered questions | A curated edition explaining selected changes through linked artefacts |
| Historical layers | Rewind, archives and landmark retirement | An explorable old city beneath the current streets, built from authorised history |
| A night city | Dimming, diary train and evening scenery | Night places with distinct purposes, rather than the day city with lower brightness |
| Accessibility and connected public space | Phone controls, direct room links and stable placement | An alternative continuous route through the whole experience, without spatial navigation requirements |
| Urban ecology | Plants, whales and seasonal scenes | Living scenery relationships, such as a conservatory changing with its chosen plants and season |
| Public workshops and rehearsal spaces | Writing studio and model table | A place to try a small idea without committing to a full project |
| Sporting occasions | Stadium depot and logged training signals | Personal training milestones staged as optional events, with recorded results rather than invented opponents |
| Addresses and directories | Pinned buildings and named districts | A memorable address for an idea, document or collection, alongside reliable search |
| Service access and opening hours | Timetabled scenery doors | Real differences between a room being available, a source being reachable and an action awaiting confirmation |
| Community rituals | Festivals and chosen keepsakes | Shared occasions selected from real records, with an explicit choice about which people appear |
| Public art with local identity | Delft details, personal architecture and exhibitions | Commissioned city pieces drawn from chosen writing, images and memories |

Adding every feature as another attraction would produce a crowded map. The next two cards add depth and distinct city functions.

#### Substitute: replace the single city surface with a city above and a city below

**The change.** The harbour is the place Adam sees. Underneath sits the infrastructure which supplies and remembers it.

Select a brass inspection plate in the square. The street lifts like the lid of a model. The camera descends into an underground cross section. Roads remain visible above, while the library, workshop and records office have lower floors below.

There are three chambers. Each answers a different question.

**1. The Exchange Station: where a fact came from.**

A record enters through its owning hub's labelled conduit. A transparent carrier takes its reference to the city view which uses it.

Select the Year 10 route. Its path leads back to Tasks. Select the capacity outlook. Its path leads back to the shared forecast, with the actual evidence explanation available. Select a collection display. Its source shelf is the collection record, rather than the illustration itself.

The Exchange Station shows source, last successful retrieval and known pending changes where those facts exist. It never turns a quiet source into an outage.

A source which is unreachable shows a disconnected coupling and a timestamped last known state. The above ground city stays visible, with a clear freshness notice. A disconnected library feed does not mean Adam forgot his knowledge or lost capacity.

Opening a coupling reveals the actual problem. A missing record, permission issue and failed save receive different labels. This is an inspection view, rather than a city wide disaster animation.

**Meaning:** trust becomes inspectable in the same place as the picture. Adam sees why a scene changed, or why a change has not arrived.

**2. The Repair Arcade: useful things with a missing connection.**

The second chamber contains workbenches. Each holds an existing object which needs a recorded repair: a source link which no longer resolves, an imported item without a destination, or a proposed record change which failed.

A book stage with a missing source sits on one bench. A document reference without its original sits on another. Selecting a bench opens the existing repair action or a proposed action requiring confirmation.

The object is not represented as worthless. Its established contents remain available through their source rules. The missing part is named.

When the owning action succeeds, the reference returns to its place. A small mechanical lift carries the repaired object upstairs. The animation follows the successful change. Merely watching the lift never fixes anything.

The arcade stays behind a door. Missing links do not become cracks spreading across the city.

**3. The Old City: walk through previous chapters.**

City of Sydney maintains historic photographs, maps, plans and other records. Its catalogue includes building and development material as well as historical maps. This supports a useful distinction: a city has both a present layout and evidence about its former places. [City of Sydney Archives](https://www.cityofsydney.nsw.gov.au/history-archive-collections/archives).

Life City's lower level contains an Old City assembled from eligible archived records and the existing event replay.

An archived project occupies an old platform. A chosen former teaching unit becomes a paper façade. An earlier version of a book appears only where its owning hub preserves that version.

Select a date and the appropriate platforms appear. The stair back to Now always remains visible. The current harbour does not rearrange.

P5's history distinction still governs the contents. Historical state comes from recorded events. Historical text comes from an actual source version. Current unversioned material is labelled current. Deleted content never becomes an archaeological exhibit.

**Meaning:** finished work has somewhere to belong beyond the main skyline. The city gains depth without confusing archived work with current commitments.

#### Put to another use: municipal systems become functions for a whole life

**1. Stormwater capture becomes a harbour receiving system.**

New York City's rain gardens receive street runoff. Water enters through an inlet, is absorbed through the garden's layers, and excess flow has an outlet. The useful design pattern is arrival, temporary holding, processing and a clear route onward. [NYC Department of Environmental Protection](https://www.nyc.gov/site/dep/water/green-infrastructure-streets-sidewalks.page).

Apply the pattern to material Adam deliberately captures or imports.

A receiving dock sits behind the Travel terminal. A captured note, uploaded document or imported collection item arrives as a labelled parcel. Its label identifies the intended destination where known.

The warehouse has three areas: destination confirmed, destination needed and action required. A quoted contract and a saved fragrance interest enter different owning systems. The dock does not quietly turn everything into a task.

After a successful write, a small carrier takes the parcel to its destination. A selected import batch appears as a short procession in Explore. Importing a lesson collection visibly fills the school's existing shelves, rather than building a second school.

An item awaiting a destination remains in the warehouse. Nothing is discarded to make the dock look clean. Duplicate handling requires the owning hub's actual comparison and review rules.

The illustrated water system also gives Round 5's snowfall a consequence inside the festival scene. Meltwater runs into planted basins along the square. This is scenery, separate from the parcel flow and capacity forecast.

**Meaning:** bringing the remaining material over from Notion becomes a legible arrival process. The city shows whether the problem is a missing home, an unfinished import or a decision about where something belongs.

**2. City Hall becomes a chamber of competing futures.**

The workshop produces alternatives. City Hall gives those alternatives different perspectives.

Place the two book plans from Round 2 on a long council table. The room contains selected seats for relevant existing agents. Clare's panel addresses schedule clashes. The Knowledge panel addresses research still needed. The writing record addresses the intended output. Adam chooses which perspectives enter the discussion.

Each panel contains an inspectable argument and its source references. Where an agent has not produced advice, the seat remains empty or holds a labelled draft question. Decorative councillors never invent expert advice.

The chamber makes disagreements explicit. A lighter timetable does not automatically win over a better supported writing sequence. Different criteria remain visible.

Adam selects a plan or records a reason to leave the question open. The decision plaque links to the proposal. Moving a wooden marker to a plan is a selection, rather than permission for every proposed write. The established promotion review follows when requested.

**Meaning:** agents stop appearing only as service vehicles. They also help Adam examine competing priorities, with disagreement retained instead of averaged into a false consensus.

**3. The city newspaper becomes an edition worth keeping.**

A printing works sits beside the post office. On request, a selected period becomes a newspaper spread.

Its front page contains one chosen change. The inside pages contain selected finished artefacts, opened routes, archived projects and recorded occasions. Every factual item links to its source or event query.

A chapter fragment becomes a typeset inset. A selected trip photograph becomes the picture section. An archived project's farewell occupies a short article. A correction appears as a correction, rather than silently rewriting a saved edition.

This newspaper extends P10's catch-up, rather than replacing it. Catch-up says what changed. The newspaper lets Adam choose what deserves an account.

The edition is composed from eligible live references at viewing time. Exporting a fixed edition is an explicit file action. Private material is included only within the selected scope.

The printing press operates when a real edition is requested. It does not invent midnight news to keep the city busy.

**Meaning:** a month becomes a small account of a life, rather than a completion count. The print shop gives the city a way to speak in objects Adam chose.

**4. Neighbourhood life becomes a place for actual shared occasions.**

The city currently has assistants and scenery neighbours. Give chosen relationships a different home: small guest pavilions reached from a shared square.

Adam selects a person and links an existing occasion or shared project. The pavilion opens a curated view of those selected records. A shared trip appears as two chosen travel markers at the terminal. A collaboration has its own table in the Professional district.

Presence reflects a selected occasion, rather than an inferred location. A partner travelling abroad does not cause an empty home or a relationship warning. A long gap between meetings does not lower a friendship score.

The pavilion is available even without an upcoming occasion. A photograph or memory selected by Adam provides a personal interior.

Anonymous scenery neighbours remain anonymous. Real people never become background pedestrians generated from the people database.

**Meaning:** the city represents who shares parts of Adam's life, rather than only the work which requires him.

**5. The night city gets its own purpose.**

London's 2016 night time planning decision treated the city at night as a subject requiring dedicated coordination across culture, transport, residents and other interests. The useful idea is a distinct programme for night, rather than merely dimming daytime scenes. [London City Hall decision](https://www.london.gov.uk/decisions/md2044-24-hour-london-chair-night-time-commission).

Harbour City's night places are selected, quiet and accessible:

- The observatory opens the saved Knowledge sky through a large telescope.
- The print shop opens a requested edition.
- The diary post office holds a chosen entry or the existing prompt.
- The winter shelter offers its window and keepsake.
- A small rehearsal theatre opens a chapter stage or lesson idea for inspection.

An existing session or saved action remains truthful about timing. No agent begins working simply because its window lights up.

Adam selects which places belong to his evening. A protected evening closes operational invitations while leaving the observatory and winter scene available. No relationship between visiting these places and improved sleep or recovery is asserted.

**Meaning:** night supports reflection, curiosity and enjoyment alongside unfinished work.

#### One route through the city which now exists

A collection of lesson records arrives at the receiving dock. The destination is Teaching, where the building already exists. A successful import fills its shelves.

One imported research reference fails to resolve. The Repair Arcade opens a bench for the actual problem. The rest of the lesson collection remains available.

Adam descends through the square's inspection plate. The Exchange Station shows the source supplying the school and the broken reference. He opens the repair action and supplies the correct source. After the successful save, the lift carries the repaired reference back upstairs.

He visits City Hall to compare a writing proposal with his existing term commitments. The arguments disagree, so he records the reason for postponing promotion.

At night, he opens the printing works. The month's edition contains a chosen lesson artefact, one travel photograph and a brief account of the decision he kept open.

The city has received something, repaired something, considered something and preserved something. Those are city functions with a direct place in Life Hub.

#### Open questions from P16

1. Which missing city function deserves the first prototype: underground inspection, receiving dock, council chamber or newspaper?
2. Should the Old City be a physical lower level, or a separate historical island reached from the harbour?
3. Which source freshness facts already exist, and which would need explicit recording before the Exchange Station is truthful?
4. Should City Hall display previously saved agent advice first, or request a new discussion only when Adam asks?
5. Does the newspaper default to a month, a school term or a selected occasion?
6. Which relationships belong in curated guest pavilions, and should those places be hidden from the wider harbour view?

### P17 · Round 6 · Substitute + Combine

This is about the concept, not a built product. The concept already has a network, rooms, seasons, festivals, and, since round 5, a street of ordinary things. It is still organised as a tree. Teaching is a district. The library belongs to Knowledge. History belongs to Adam. The pavement between those facts is scenery the layout is allowed to have, not a place the city is required to be.

#### What is actually missing

Four things. Not sixteen more attractions.

| A real city has | This concept has had | The translation |
|-----------------|----------------------|-----------------|
| **Life between buildings.** The footpath, the corner, the edge of the water. Necessary trips, optional staying, and the social fact of other people, in the same outdoor room | Routes, interiors, and round 5's objects placed along a walk | One seam, where those three lives share an edge |
| **Overlap.** A corner sits in more than one life at once. It is not filed under a single owner | Districts as zones, with ferries as the permitted exception | The seam belongs to the commute and the stool and the water, and to no hub |
| **Ground older than the person on it.** Stone, a drowned valley, a creek the streets still obey, and a name for the land that is not the resident's to invent | An event log, and P16's Old City of archived chapters | Sandstone, a kink in the paving, a grate, and a plate no agent may write |
| **A place you can tell someone to meet you** | Districts, pins, and directories of records | A named corner, readable from the street |

Kevin Lynch, in *The Image of the City* (1960), found that people carry a city as five kinds of thing: paths, edges, districts, nodes and landmarks. We have districts and landmarks. The bridge is a path. What we have not had is an edge that is the city's rather than a route's, or a node ordinary enough to meet at.

#### Substitute: a tree of zones becomes a seam on older ground

**The overlap.** Christopher Alexander, in "A City is Not a Tree" (*Architectural Forum*, April and May 1965), draws the difference as a rule about sets. A tree: any two sets are either nested or completely apart. A semilattice: sets may overlap, and the overlap is itself a real unit. His example is a drugstore newsrack and a traffic light on a Berkeley corner. People waiting for the light read the headlines. The newsrack belongs to the shop and to the act of waiting. Design it as only a shop, or only a kerb, and the unit disappears ([the essay](https://www.patternlanguage.com/archive/cityisnotatree.html)).

Life City's records should stay a tree. A task has one state. A hub owns its facts. P2 depends on that. The geography copied the tree anyway: north shore is work, south side is life, and a building is in one district or it is decoration. Ferries were the one allowed overlap, and they only run when a saved link exists. That is a railway diagram with a harbour painted on it.

Substitute the hard boundary with a **seam**. A seam is Alexander's overlap, drawn as a block. It is not a new hub and it emits no city event. The school stays Teaching. The library's notes stay Knowledge. The first block south of the bridge, the one round 5 already walks, becomes the overlap: it is on the way home, it is where the reader sits, and it is where the water is met. The common part is the corner. That corner is the unit.

Jane Jacobs's four conditions for a living street, in *The Death and Life of Great American Cities* (1961), say what the seam has to contain. Mixed primary uses, so the same pavement has a different reason to be there at 8, at noon and after dark. Short blocks, so paths actually meet. Buildings of different ages, so the street is not all one vintage. Enough people to animate it. We take the first three and refuse the fourth as a crowd. Round 5 already refused Kamurocho's faceless crush. A few figures on a short block are the ballet. A packed pavement is a picture of busyness, and busyness is already spoken for by the bridge.

The short block is a physical change to round 5's walk. Between the market lane and the library steps, one cross-lane. Call the meeting of the two, until Adam renames it, **Fig Corner**. The fig is already in the park's edge. The corner is small enough that from it you see the awning, the steps, and a slice of water. Lynch's node is that: a place you can name without opening a record. A street plate on the fig's side, scenery pigment, not a route colour. Renaming it is a pin, the same kind of pin as a building. The layout engine does not "improve" the name.

**The ground.** P16's Old City, under the inspection plate, is the right place for Adam's archived chapters. It is not this. A real city's oldest layer is not the resident's archive.

The Sydney estuary is a drowned river valley, cut into Hawkesbury Sandstone. Gavin Birch's account of the estuary describes that drowning: the valley was eroded into the sandstone, and the sea filled it ([Birch, on the Sydney estuary](https://ses.library.usyd.edu.au/bitstream/handle/2123/2102/WaterWindCh7Birch.pdf)). The harbour in this concept is not a feature we added for the metaphor. On this coast, water is what a valley becomes. The headlands are the valley walls. They are there if the account has no tasks at all.

Under the real city's grid, a freshwater stream once ran from the swamp near Hyde Park to Sydney Cove. It was the reason the colony sat there. It was pooled, polluted, made a sewer, and from the 1850s buried. It is still a stormwater drain ([Sydney Water, Tank Stream fact sheet](https://www.sydneywater.com.au/content/dam/sydneywater/documents/tank-streamheritage-fact-sheet.pdf)). Sydney Water's account of the culvert at Circular Quay names that fresh water as **Warrane**, and names the Gadigal people who made and used nawi there ([Sydney Water, Tank Stream works](https://www.sydneywater.com.au/water-the-environment/what-we-are-doing/projects-in-your-area/circular-quay-pump-station-and-tank-stream-work.html)). The City of Sydney marked the course in the pavement for the 2000 sculpture walk, because the streets above it do not follow it. Watkin Tench had already noticed the stream dividing the country ([Tankstream, City of Sydney](https://www.cityofsydney.nsw.gov.au/installations/tankstream-into-the-head-of-the-cove)).

Translate the form, not the cadastral map. This harbour is a suggestion of Sydney, not a copy, so it does not collect real clan boundaries and it does not paste Warrane onto a fictional cove.

- A line of narrower, darker pavers crosses the seam and ends at the seawall. The lanes kink one tile where they cross it. In Explore, if the Knowledge sound preference is on, a grate at the kink carries water underneath. The grate does not open. P16's brass plate in the square remains the door to sources, repairs and the Old City. This grate is a creek. It shows no record, no freshness timestamp and no import.
- The sandstone is the material of the seawall and of Fig Corner's kerb. New buildings, when a project opens, are crisp and set one tile back from that kerb. Jacobs's aged building, without the rent: you can see three ages at once. The ground, which has no date. The milk bar, which was in round 5's census and looks worn. The new room, which looks new. Nothing decays because Adam was away. Age here is authorship, not a score. The ground has no author. The new room has an event.
- An archived project may leave a painted name on the side wall of the seam, in scenery pigment, faded, not tappable as a live route. Asking the stationmaster can still find the archive, because that is a query over records. The paint is only the glance. A deleted record leaves no paint and no scar. Deleted means gone, including from the wall. The Old City downstairs does not get to keep it either.
- Set into the sandstone at the end of the pavers, one plate. On an empty account it reads only: "This ground has a name older than this city." Nothing else. Adam may replace that sentence. An agent may not. Clare may not answer it from the event log, because it is not in the log. A model may not draft an acknowledgement, a nation, a clan or a motif and call it the city's. The real harbour's names are for Aboriginal people and for sources Adam trusts, not for a layout engine. If he never writes the plate, it stays as that one sentence, and the sandstone is still there. The city does not remind him.

**The foreshore.** The 2005 Sydney Harbour Catchment regional plan treated the harbour as a public resource, and it said public access to and along the foreshore should be maintained and improved, with the public good taking precedence over the private good when the edge changes ([Sydney Regional Environmental Plan (Sydney Harbour Catchment) 2005](https://legislation.nsw.gov.au/view/whole/html/inforce/2020-11-04/epi-2005-0590)). That is the civic fact this map has been missing. We have a ferry, a skiff and a quay. We have not had a path the buildings are forbidden to swallow.

The seawall path runs from the baths, past the skiff, under the bridge, and out to the headland. It is not a GTFS shape. It has no stops. Buses do not use it. The ferry pontoon touches it, and the ferry still runs only for a real cross-hub link. A life wall closes a route. It does not close the seawall. Workload can reroute a bus. It cannot privatise the edge.

Jan Gehl's edge effect is why the path is low and the benches face the water. People stay at edges, beside a facade, a corner, a column, where the back is covered and the view is open ([Gehl, Kaefer and Reigstad, "Close encounters with buildings"](https://www.urbaplan.ch/wp-content/uploads/2015/02/jangehl_urbandesign_article-1.pdf)). The school gate stays a hard edge on purpose. There is still no classroom behind it. The hospital garden stays turned away from the ambulance bay. Soft edges belong on the seam: the milk bar's doorway, the library step, the seawall's coping. A hard edge everywhere is a campus. A soft edge on the school would be a lie about what that building contains.

Hyaluronica's sweeper still means an AM or PM routine was done, and a washed street still means that. The grate is not a second reason for wet pavement. Water stays under the plate.

| Notice | Level | Rule |
|--------|-------|------|
| `life_wall_closes_foreshore` | Error | A life wall, a route or a building footprint blocks the seawall path |
| `ground_from_records` | Error | The kink, the plate's words, or a painted name was generated from records or written by an agent; or a painted name exists for a deleted record |

#### Combine: necessary, optional and social life on the one corner

Gehl, in *Life Between Buildings* (1971), splits outdoor life into three. Necessary activities happen almost regardless of the place: going to work, to school, waiting. Optional activities happen when the place makes staying attractive: sitting, strolling, looking. Social activities are mostly resultant. They appear because people are already there, and the smallest of them is simply seeing and hearing someone else ([Urban Design Group, on Gehl's three activities](https://www.udg.org.uk/publications/udlibrary/life-between-buildings-using-public-space)).

The concept has been almost entirely the first kind, drawn as vehicles. Round 5 added the second, as a walk. P16's guest pavilions add chosen relationships, which are real and which stay his: a person Adam linked to an occasion, indoors, curated. What the street still lacked is Gehl's third kind in public, where the other person is not a guest and not a task.

Combine the bridge (necessary), round 5's clock and stool (optional), and the anonymous figures (social, and only social) onto Fig Corner. Ray Oldenburg's third place, in *The Great Good Place* (1989), is the indoor half of that combine. It is not home and not work. Neutral ground, no host's duty, regulars, a low profile, conversation possible and not required. The milk bar doorway is that. P16's pavilion is for someone you invited. The stool is for nobody in particular. Opening it still does not open a ledger, a price or a meal. Brisket's truck remains the only meal signal. Alexander's newsrack sold papers. Ours does not. The unit is the waiting and the looking. The blank sheets stay blank.

The terrace row shows the gradient in four steps, so privacy and the public realm are visible at once. Hallway, which round 5 already opens, private. Front step, where he can sit without entering the records office. Footpath. Fig Corner, then the seawall, the most public thing in the city. The step is his. The seawall is not.

**Tuesday in term, at the fig.**

Just after eight, the necessary life is facing south. People come off the bridge on the footpath. They are not buses, and they are not the jam. The jam, if the week is heavy, is still the roadway. Shutters are coming up. The grate is only a grate. The plate says whatever it said yesterday. Nobody stops, because necessary life does not have to. The corner holds them for the length of a crossing.

Late morning, the optional life arrives. The awning is up. The reader is on the library step, in sight of the fig, because the block is now short enough for that. One person has taken the stool in the milk bar door. From the stool you see the corner. From the corner you see the stool. That mutual sight is the whole social activity. It logs nothing. It is not a relationship, not a pavilion guest, and not a student. If it is Friday, the reader leaves the step for the library glass after midday, as round 5 already has, and the stool stays.

Mid-afternoon the gate's crowd crosses and comes apart. They are anonymous, they have no work in their hands, and they do not remain as a group on the seam. A crowd that stayed would become a class. A class on the street is the thing the gate was built to refuse.

At dusk the necessary life thins. Shutters drop. House amber comes on in the terraces, still the scenery amber from round 5, still not the lamp for work left open. The stool keeps one extra hour and then the doorway is just a doorway. In Glance, night is the dim the city already uses. No new street meaning for light. In Explore, a short run of small lamps along the seawall puts light on stone and on water only. Not on a window, not on a stop, not in a halo. When he leaves Explore, the lamps are gone and the dim remains.

**Sunday, late morning, nothing due.**

The open door stays shut. The halo stays absent. The roadway is quiet, because a jam with no teaching load would be a lie. Necessary life is missing, and that absence is the test. Optional life is still there: the morning market, the reader, someone on the seawall facing the water, the skiff still tied. Social life is the thin kind, seeing those people from the fig. Gehl's claim, translated without the sermon, is that a place which only works when a task is due is not a public realm. It is a corridor that happens to be outdoors. Sunday at Fig Corner is how you tell the difference.

The festivals in P15 can use this ground. Snow, if that scene is open, sits on the seawall coping and on the fig, and then it lifts, as P15 already said, without becoming the weather. The balloons do not launch from the foreshore path. The path stays walkable underneath the visit. A festival that closes the seawall has made the public edge private for a show.

The Platform at 390 does not grow a map of seams. The departures board stays the phone lens. The corner is a wide-city pleasure. On the phone, Explore can pan to the fig, and the three doors stay what they are.

#### New open questions from round 6

- Does Fig Corner keep that name until he renames it, or does he already know the corner's name?
- The plate cannot be written by an agent. Does he want the doc to point at sources he trusts for the real harbour, or should the sentence stay untouched until he raises it?
- One seam, south of the bridge, is the whole proposal. If it works, the next seam would be the hospital garden's edge, not a new system. Is one enough to learn from?

### P18 · Round 6 · Substitute + Combine

#### What real cities still have that Harbour City does not

After six rounds the city has transit, weather, seasons, landmarks, festivals, streets, institutions, archives and a public edge. Three civic systems are still missing, and they happen to be the three that would change **Life Hub itself**, not only the picture of it.

| A real city has | What it does | Still missing here |
|-----------------|--------------|--------------------|
| **Planning law** | Decides, calmly and in advance, what may be built where, what needs no permission, what needs a quick check and what needs a full hearing | Agents' capabilities are simply `auto` or `confirm` (76 of each in `capabilities/`). Life walls are one-off. There is no standing plan |
| **A water supply with a drought plan** | Tracks a slow reserve (the dams), not just today's weather, and triggers pre-agreed restrictions when the reserve falls | The capacity forecast is daily weather. Nothing shows the slow stock beneath it, and nothing says in advance what gives way when it runs low |
| **A heritage register** | Lists places that cannot be demolished, whatever the pressure | Nothing in the design is protected from being squeezed out in a heavy week |

Smaller things real cities have, worth a line each for a later round: a **census** (a periodic statistical portrait, such as a population pyramid of open commitments by age), **street addresses** (a memorable, permanent address for any record, which Life Hub's universal links could supply) and **time capsules** (a letter sealed at the start of term and opened at its end).

The two cards below take the three big ones.

#### Substitute: replace "auto or confirm" with a Life Environmental Plan

**What is being replaced.** Today every agent capability is one of two kinds: it runs on its own, or Adam confirms a diff. P1 copied that into the city as driverless and staffed trains. Life walls sit beside it as a separate idea. P16's council debates individual plans. None of these is a **standing plan** that says, in advance, what kind of change is welcome where and when.

Real cities solved this a long time ago. In NSW the solution has three lanes, scaled to impact ([Singleton Council, types of development](https://www.singleton.nsw.gov.au/Development/Planning-Information-and-Advice/Understanding-types-of-developments-and-applications)):

- **Exempt development** needs no consent at all, provided it meets published criteria (a small deck, a carport).
- **Complying development** is checked against fixed, pre-determined standards and certified fast, generally within ten business days, because nobody has to exercise judgement.
- **A development application (DA)** is everything else. It gets a merit assessment by a person.

Above all three sits the **Local Environmental Plan**: zones that say what each piece of land is for, and numerical standards (height, floor space) that every proposal is measured against. When a proposal breaks a standard, the applicant must lodge a written **clause 4.6 variation request**, arguing why compliance is unreasonable in this case ([an example request on the NSW Planning Portal](https://www.planningportal.nsw.gov.au/sites/default/files/documents/2022/Clause%204.6%20Height%20Variation%20Request.pdf)).

**The substitution.** Life Hub gets its own LEP: a **Life Environmental Plan**, written by Adam once, when he is calm, and amended whenever he likes.

**1. Zones on the week.** The week is the land. Adam zones it.

| Zone (illustrative) | Covers | Permitted without consent | Prohibited |
|---------------------|--------|---------------------------|------------|
| **Work core** | School days, roughly 7:30 to 17:00 | Teaching and professional work | Nothing in particular |
| **Residential** | Weekday evenings | Light admin, reading, time at home, diary | New work blocks |
| **Public recreation** | Sundays | Anything Adam chooses to do | Any agent-proposed work |
| **Conservation** | The sleep window | Nothing | Everything |
| **Special purpose** | Marking weeks and report periods, set per term | Extra work blocks up to a standard | Work in the conservation zone, still |

Zones replace most life walls. A recurring wall becomes a zone. A one-off wall becomes a **temporary closure order** with an end date. In the city, zoning is not painted on the street (the channel budget from round 4 still holds). It is one of P11's info views: ask to see it and the week's land use appears; close it and it is gone.

**2. Development standards.** Numbers Adam sets for each zone: the most work hours allowed in a residential evening (perhaps zero), the most of a week that may be committed in advance, the latest a meeting may end. These are the height limits and floor space ratios of a life.

**3. Three lanes for every agent proposal.**

| Lane | What it means for an agent | What Adam sees | Today's equivalent |
|------|----------------------------|----------------|--------------------|
| **Exempt** | The action meets published criteria (log a reading, file an import, refresh a forecast). It runs and is logged | Nothing, unless he opens the Governance Log | Most `auto` capabilities, now with written criteria |
| **Complying** | The action is checked automatically against every zone and standard. If it passes, it is **certified**: labelled "complies with your plan" | A light, grouped confirmation: several certified proposals approved in one tap, each still showing its real diff | Many `confirm` capabilities, made faster |
| **DA** | Anything the plan does not cover, or anything that changes a person, a commitment or a record outside its own hub | The full confirmation card with the agent's reasons | The rest of `confirm` |

Life Hub's rule that Adam always sees the real diff before a durable write stays intact. Complying only changes how quickly and in what batch he sees it.

**4. Variations: agents must argue.** If Clare wants to put a work block into a Tuesday evening, the proposal breaks the residential standard. She cannot simply ask. She must lodge a **variation** with two parts, the way clause 4.6 requires:

- why compliance is unreasonable in this case ("the reports close at 9 am Wednesday and Tuesday afternoon is full of classes")
- what makes this case different from the ordinary rule ("this is the only report week this term")

Adam approves or refuses. Both are logged.

**5. The best part: variations reveal a bad plan.** Real councils notice when the same standard is varied again and again, and they amend the plan rather than keep granting exceptions. Life Hub can do exactly that. If Adam has approved four evening variations in a term, the Governance Log raises a **planning proposal**: "Your residential standard has been varied 4 times this term. Amend the plan, or keep refusing?" The rules Adam lives by learn from the exceptions he actually grants, but only with his say-so.

**6. In the city.** P1 put DA signs on vacant lots as a joke. They become real. A building cannot start construction without consent, so the planning layer from round 3 now has a legal backbone: dashed (proposed), DA lodged (sign on the hoarding), consent granted (crane arrives), open. An exempt change simply happens. A variation awaiting Adam is P8's single halo, with the variation's reasons as the first line of its action card.

**Why this is a wow for future builds, not only the city.** Every new agent, connector and hub that Life Hub adds will need to answer "what may this do without asking?". The LEP answers it once, in one place, in a language Adam already understands from living in NSW. It also makes the agent system explainable: any action can be traced to the zone, standard and lane that allowed it.

| Notice | Level | Rule |
|--------|-------|------|
| `build_without_consent` | Error | A record change reaches the city (a route opened, a building started) that was neither exempt, certified complying, nor approved as a DA |
| `variation_without_reasons` | Error | A proposal breaches a zone or standard and lacks either of the two written reasons |
| `exempt_criteria_unpublished` | Error | A capability runs as exempt without written criteria Adam can read |

#### Combine: the dam, the drought plan and the heritage register

**The missing quantity.** Round 2 made the sky the capacity forecast: today's weather. Weather is a flow. Real cities also watch a **stock**: the water held in their dams. One wet day does not fill a dam, and one good night's sleep does not undo a hard term. A teacher's year is shaped like a reservoir: it drains across a term and refills in the holidays. Nothing in the design shows that.

**The Sydney precedent.** Sydney lived through this in 2019. Greater Sydney's storage was at 53.4 per cent when Level 1 water restrictions began on 1 June 2019, and at 46.1 per cent when Level 2 began on 10 December 2019. The rules had been set years earlier: the desalination plant switches on at 60 per cent, restrictions start at 50 per cent ([Water restrictions in Australia](https://en.wikipedia.org/wiki/Water_restrictions_in_Australia)). In February 2020 heavy rain almost doubled storage in ten days, and restrictions eased to Level 1 on 1 March 2020 ([Bureau of Meteorology, National Water Account 2020](https://www.bom.gov.au/water/nwa/2020/sydney/supportinginformation/statementdetails.shtml)).

The important part is not the dam. It is that **every decision was made before the drought**, in calm, as a set of triggers. When storage fell, nobody had to decide anything under pressure. The plan decided.

Psychology has a name for that move. **Implementation intentions** are if-then plans made in advance ("if X happens, I will do Y"). Gollwitzer and Sheeran's meta-analysis of 94 tests found a medium-to-large effect on actually reaching goals (d = 0.65) ([Gollwitzer and Sheeran, 2006](https://kops.uni-konstanz.de/entities/publication/2e749bfb-8533-437c-8203-7e788c910c5f)). A drought plan is an implementation intention for a whole life.

**The combination.** Three real city systems become one feature.

**1. The dam.** On the hills at the edge of the map sits a reservoir. Its level is the **average of the last four weeks of daily readiness**, computed from the one capacity function (`capacityForDates`) over days it has already scored. It is not a new model. It is the same numbers, seen as a stock instead of a flow, and labelled honestly as "four week average readiness". Days with no evidence are left out of the average rather than counted as empty, and if there are too few scored days the gauge reads **offline**, never zero.

Level uses a channel the round 4 budget has not yet spent: **fill**, the height of water against the dam wall. It is read at a glance and means only one thing. Over a term Adam sees the water line creep down. In the first week of holidays he sees it rise, the way Sydney's dams did in February 2020.

**2. The drought plan.** When the dam is high (a good moment is the first week of holidays), Adam writes his plan as if-then triggers. The city offers a template; he writes the contents.

| Level | Trigger (Adam sets) | What changes automatically (Adam writes) | In the city |
|-------|---------------------|------------------------------------------|-------------|
| **Supplementary supply** | Dam below his first line | A pre-chosen recovery source switches on, such as a protected rest block he already designed or a lighter version of a weekly routine | The desalination plant on the coast starts running |
| **Level 1** | Below his second line | No new optional commitments; residential zone standards tighten; Clare defers anything without a hard deadline | A restrictions sign at the dam; park sprinklers off |
| **Level 2** | Below his third line | A named list of things that pause until the dam recovers (an extra committee, a second gym session, new PD invitations) | A second sign; fountains off |
| **Recovery** | Back above a line | Restrictions lift in reverse order | Signs come down; the fountain runs again |

This is where the two cards meet. A restriction level is simply a **temporary amendment to the Life Environmental Plan**: tighter standards, fewer exempt actions, more variations needed. Agents read it automatically because it is part of the plan they are already checked against. Nobody has to persuade Adam to slow down in the middle of a bad week, because he already decided how, weeks ago, when the water was high.

Nothing triggers that Adam did not write. The city never invents a restriction, and a level never pauses something he did not list.

**3. The heritage register.** Some things must survive Level 2. In NSW the State Heritage Register protects places that matter so much they cannot be demolished whatever the development pressure. Adam lists his own: time with the people he loves, a weekly ritual, a particular routine, one creative project. Whatever he chooses.

Heritage items carry a small blue plaque in the city. They are exempt from every restriction level. An agent may never propose cancelling, shrinking or moving a heritage item, under any lane. A variation cannot touch one. Only Adam can delist it.

This is the safeguard a drought plan needs. Without it, restrictions cut whatever is easiest to cut, which is usually the thing that refills the dam.

**4. What it is not.**

- Not a health or clinical measure. It is an average of the existing readiness numbers, with the existing forecast's own caveats.
- Not a score. The dam is never "good" or "bad", and there is no streak for keeping it high.
- Not a penalty for absence. A month without opening the city changes nothing except what the real readiness record says.
- Not money. Water here is time and energy, never dollars.

| Notice | Level | Rule |
|--------|-------|------|
| `dam_from_second_model` | Error | The dam level comes from anything other than an average of `capacityForDates` results |
| `dam_unknown_as_empty` | Error | Days without evidence lower the dam, or too little evidence is shown as a low level instead of offline |
| `restriction_not_in_plan` | Error | A restriction level pauses or changes anything Adam did not write into the drought plan |
| `heritage_item_touched` | Error | Any proposal, restriction or variation cancels, shrinks or moves a heritage-listed item |

#### The biggest wow features across all six rounds

> **Superseded.** This shortlist and the build order below were written before the critical review. The review at the top of this file replaces both.

Adam asked for the build's biggest wow features. After six rounds by three contributors, this is an honest shortlist, ranked by how much each changes the experience for how little it costs to build.

| Rank | Feature | Why it wows | Cost | From |
|------|---------|-------------|------|------|
| 1 | **"Since you were last here"** catch-up | Every visit opens with the changes happening in front of Adam. Nearly free once the event log exists | Low | P10, built on P5 |
| 2 | **Ask the stationmaster** | A question lights the whole city and every lens at once, grounded in a real query | Medium | P13 |
| 3 | **The Life Environmental Plan** | Zones, three approval lanes and variations make every current and future agent explainable. Changes Life Hub, not only the city | Medium | P18 |
| 4 | **The dam, drought plan and heritage register** | The first view of the slow stock beneath the daily weather, with pre-agreed restrictions and protected essentials | Medium | P18 |
| 5 | **The term replay and New Year's Eve fireworks** | A teacher's year told as an event, from real history | Medium | P4, P5 |
| 6 | **Foldout worlds and the Balloon Gathering** | Pure delight on a free Sunday; the city as a place worth visiting | High | P12 and P15 |
| 7 | **Fig Corner and the public foreshore** | The city becomes a place, not a diagram, and its edge belongs to no task | Medium | P14 and P17 |
| 8 | **The Exchange Station and Repair Arcade** | Trust made visible: where every fact came from, and what is broken | Medium | P16 |

**A suggested build order** that keeps each step testable with round 3's validator and golden days:

1. The snapshot, event log and validator, with no picture at all.
2. The calm street with the channel budget and the catch-up replay, tested with Adam's three second glance (round 4).
3. The Platform for the phone.
4. The Life Environmental Plan, which improves Life Hub's agents even before the city is finished.
5. Ask the stationmaster, then the time scrubber, then the dam and drought plan.
6. Explore: rooms, worlds, festivals, Fig Corner.

#### New open questions from round 6

- Would Adam want to write a Life Environmental Plan, or should the first version be drafted from his existing life walls and calendar for him to edit?
- Which capabilities should be exempt, complying or DA on day one?
- Is four weeks the right window for the dam, or should it follow the school term?
- What would go on Adam's heritage register first?

## 8. Open questions

- Fixed map or does it expand as districts are added? How is the map laid out on first load? (P10: expands at its edges, never reflows its centre)
- How many vehicles before it gets noisy on a phone at 390px? (P2: the phone lens is the departures board, so the fleet stays on the wide view)
- Is Life City a hub page of its own, or a mode of the Tasks Hub Lines view? (P2: a lens on the same graph as Lines, Branch and Orbit)
- Tap interactions: does tapping a bus open the project, a stop open the task?
- Which agents become which services, and do they get uniforms? (First draft in round 1)
- How are archived or deleted items handled? (Repo rule: deleted means gone; archived could become landmarks)
- Sound? (Off by default. P2: if it is ever on, it uses the Knowledge universe chimes preference, not a new city soundtrack)

## 9. History

- **2026-10-07:** Created from a chat thought experiment with Adam. Six rounds of "what if" proposals (P1 to P18) followed the same day. Each one is preserved in section 7.
- **2026-10-07:** Contributor names removed from the whole doc at Adam's request. Proposals are now identified only by number; authorship lives in git history. Card ledgers and author notes deleted.
- **2026-10-07:** Critical review added at the top. It sorts every concept into Keep, Modify or Cut and replaces the round 6 build order.
- **2026-10-07:** Festivals, keepsakes, the pet garden, whale watching, museum shelves, bundles and the Idea Exchange moved from Cut to Keep or Modify at Adam's request, each with a cheaper way to build it.
- **2026-10-07:** Adam cut museum shelves and bundles, and turned the pet garden into his pets living in the city as animated characters.
- **2026-10-07:** Adam ruled that the city is not Sydney. It is Metropolis (Me-tropolis), a city made of him. Sydney geography and history removed from the review. Idea Exchange kept as a Knowledge hub feature. Keepsakes are made and placed by Adam himself.
