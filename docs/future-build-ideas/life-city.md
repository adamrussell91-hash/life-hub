# Life City

**Status:** Thought experiment (not scheduled, not a build brief)
**Started:** 7 October 2026, in a chat between Adam and Claude
**One line:** An isometric, Transport Tycoon style city that shows the live state of Adam's whole life at a glance, driven entirely by Life Hub data.

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
- **Layout engine:** deterministic placement, so a project's route stays in the same place between visits. A building Adam has placed keeps that place. Proposal in Cursor's round 2.
- **One graph, four lenses:** Tasks Lines, Branch, Orbit and Harbour City read one snapshot of that graph. The city does not keep a second copy of what is done, blocked or due. Proposal in Cursor's round 1 below.
- **History is the event log:** Rewind replays these events up to a day. It does not keep a second archive of the city. Proposal in Cursor's round 2.
- **Term edition:** which Teaching services are in the snapshot comes from hub prefs `school_terms`. Proposal in Cursor's round 3.
- **No neglect meter:** the street does not decay, score, or end because time passed. Accumulation rituals are a proposal in Cursor's round 4.
- **Renderer:** PixiJS (2D) first

### Who builds what

- **Cursor:** back end, data wiring, city events contract
- **ChatGPT / Codex:** renderer, animation, asset pipeline (Codex writes code; artwork comes from Kenney or an image model)
- Both build to the city events contract above so they cannot drift apart

## 6. Prototype

A rough chat prototype (code-drawn SVG, not Kenney art) proved the feel: an isometric grid with glass towers around a central interchange, a park and fountain, a harbour with bridge and ferry, and a bus, tram and car moving along roads. An earlier flat transit-map version showed a "drop a life wall" button rerouting a bus around a closure. Neither is production code.

## 7. What if rounds

Adam is running iterative "what if" rounds between Claude Code, Cursor and ChatGPT Codex. Each round a contributor plays two idea cards (Extend, Substitute, Combine, Adapt, Magnify, Put to another use) and may edit any part of this file. Nothing here is a decision until Adam names a slice to build.

### Round 1 · Claude Code · Extend + Adapt

> **Author note:** This round was written by Claude Code (Claude Opus 5.5) on 7 October 2026. Cards played: **Extend** and **Adapt**. Everything below is a proposal for the other contributors to build on, challenge or replace.

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

**The problem.** The base doc's city events contract is a good start, but three tools (Claude Code, Cursor, Codex) are going to name things differently unless the vocabulary is fixed. Inventing a vocabulary invites drift.

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

### Round 1 · Cursor · Combine + Put to another use

> **Author note:** This round was written by Cursor on 7 October 2026. Cards played: **Combine** and **Put to another use**. It builds on Claude Code's Round 1 (Harbour City, the agent fleet, driverless lines, and the GTFS-shaped vocabulary). It is a proposal for the other contributors to build on, challenge or replace. Nothing here is a decision until Adam names a slice to build.

#### Combine: one graph, four lenses

**The problem.** Life Hub already draws Adam's work three ways on the Tasks graph, and the calendar draws it again. Lines is a transit map (`transit-lines`): a travelled track and an ahead track, a breathing "you are here" ring, a ghost marker at a fractional `ghostAt` ("pace says be here by today"), a blocked bar through the track, and a Clare alert on the line. Branch is the same tasks as flowchart lanes. Orbit is the same tasks as what is circling now. The Day Dial places today's work blocks on a clock and ticks them off with the same gesture as the board. Claude Code's round then adds a fourth picture, Harbour City, plus a departures board and a GTFS-shaped feed.

Four pictures of one life will drift. The city will show a bus at a stop Lines has already filled. The board will announce a task the dial has already struck. Clare will say "on time" while the ghost says the pace has slipped. Each picture can be internally correct and still be a lie about the others.

**The combination.** Lines, Branch, Orbit, the Day Dial's work blocks, Clare's departures board and Harbour City are lenses on one snapshot. Claude's GTFS-shaped files are that snapshot, not a new database. The Tasks graph is the source. The layout engine may curve a route along the harbour. It may not reorder stops, invent a stop, or decide that a task is done.

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

Driverless and staffed, from Claude's round, are a property of the vehicle, not a second position system. A driverless tram still snaps to the shape. A staffed train with its doors open is the same "you are here" ring, waiting.

**One Sunday afternoon, so the contract is obvious.** It is 16:30 in Sydney. Year 10 marking is the current station on a Teaching route. Lines shows the breathing ring on that station and a ghost a little ahead. The Day Dial has a work block on that task from 16:00. The departures board reads "Year 10 marking · you are here · on time". The city shows one staffed bus on the shape at that station, and a ghost bus at the pace marker. Adam ticks the block on the dial. The station fills, the bus moves to the next stop, the board advances, and the dial strikes the block. Those four changes are one fact. A city that still shows the bus at the old stop is the broken lens.

A life wall closes that route. Lines draws the blocked bar. The snapshot emits a detour alert and a new shape around the closure. The bus follows the new shape. Lines' ahead track keeps the same stop order. The city does not cut a tunnel the graph does not have.

**Phone and desktop are lenses too.** This is a proposal for two open questions in section 8, not a decision. On a wide screen the lens is the isometric city. At 390px the lens is Claude's departures board, which is the same "what is next" query, stacked the way Lines already goes vertical on a narrow canvas. The phone does not shrink the whole fleet until the buses are specks. The noise question is answered by showing fewer lenses, not by deleting vehicles from the snapshot.

**What this asks of the three of us.** One function builds the snapshot. Lines, Branch, Orbit, the dial and the city all read it. A second progress calculator, even a well-meaning one inside the renderer, is the bug. Codex draws Kenney sprites on the polyline and runs the smart building-fade off that same point, so a tower fades when the vehicle really is behind it. Cursor's side of "who builds what" is the snapshot and the proof that the four lenses agree. Claude's GTFS names stay the vocabulary.

Day-to-day finances stay out of the snapshot. A fare, a balance or a tap-on cost is not a stop time.

#### Put to another use: the concourse ceiling is the Knowledge sky

**The precedent.** Grand Central's main concourse was meant to have a skylight. What it got, in 1913, is a painted sky of constellations over the departures hall. Within weeks a commuter saw that the heavens were reversed, and the backwards sky was kept anyway ([Untapped New York](https://www.untappedcities.com/the-hidden-history-of-grand-central-terminals-celestial-ceiling/); [New York Times, 23 March 1913](https://www.nytimes.com/1913/03/23/archives/constellations-reversed-new-grand-central-ceiling-has-the-heavens.html)). The useful part is the ceiling over the hall. The warning is the mirror: a decorative sky that does not match the real one is noticeable forever.

**The element to reuse.** Knowledge already has that sky, and it is not decoration.

- Saved constellations are Adam's. Each figure is laid out from its notes, then placed with the sky position, scale and rotation he saved (`universeSky.ts`). Those points are notes. Tapping a point opens that note.
- The scattered star field is a seeded backdrop (`buildSkyLayers`, seed 9173). Those stars are not notes. They are not tappable, and they are not a second archive.
- The twenty topic planets are a different instrument. Each topic has one seeded look so the planet matches in the universe, the orrery and its own system (`universePlanets.ts`). They already have a home.

**How it sits in Harbour City.** Clare's CBD interchange, the big departures hall from Claude's round, has a vaulted ceiling. The ceiling is the Knowledge sky: the same seeded star field and the same saved constellations, in the same arrangement as the Universe view. Looking up in the hall and opening Universe are two readings of one painting. A constellation is never mirrored to suit the architecture. Grand Central's mistake is the test: if a figure is flipped on the ceiling and correct in Knowledge, the ceiling is wrong.

By day, outdoors, the sky stays the weather Vera's lighthouse already drives. The ceiling mural is still there in the hall, the way Grand Central's is visible in daylight, so notes are reachable without waiting for night. At night, `city.clock` brings the same star field up over the open city as well. Weather and stars take turns outdoors. They do not paint over each other.

Topic planets stay in the Universe. Pasting a solar system onto the suburbs would make a second map of topics the districts already cover. A district does not become a planet, and a planet does not become a building.

**What changes when knowledge changes.** Adding a note to a saved constellation adds a point on the ceiling, in the same place the Universe adds it. Deleting a note removes that point everywhere. A deleted note does not remain as a dim star. A constellation Adam has not saved does not appear just because a topic exists. The city sky grows when he saves figures, not when the renderer feels like drawing more.

**Sound.** The open question "Sound?" gets this proposal: the city does not grow its own soundtrack. Knowledge already has universe chimes and a saved preference. If sound is ever on, it is that preference, and the base assumption stands that it ships off. A second mixer for bus horns and lighthouse bells is a different product.

**On the phone.** The departures board can keep a thin strip of the ceiling, enough to show that a constellation has a new point, not a second panorama beside the list. The full vault is part of the wide city lens.

#### New open questions from Cursor's round 1

- When the city and Lines disagree, the proposal is that the city is the broken lens, because the graph is the source. Is that the rule Adam wants, including on a day when the city is the view he is looking at?
- Is the Knowledge sky the concourse vault only, with a plain outdoor sky at night, or does the whole city look up at it after dark?
- A booked trip in Travel is the obvious intercity departure, but this round does not fold it in. The travel map has already been wrong by treating an arrival city as both ends of a leg. Should a later round put real trip legs to use as intercity trains, with Sydney as the start, or do dreams stay the only intercity service?
- Does a life-wall detour have to repaint Lines and the city in the same frame, or may the schematic keep a straight track while the city bends?

### Round 1 · ChatGPT Codex · Extend + Combine

> **Author note:** Written by ChatGPT Codex on 7 October 2026. Cards played: **Extend** and **Combine**. This contribution builds on Claude Code's Harbour City and vacant lots, and Cursor's shared snapshot and Knowledge ceiling. All additions are proposals for the next contributor to develop or challenge.

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

Claude's vacant lots are a useful start. Give each lot two independent facts: whether a suitable product home exists, and whether the relevant records have arrived.

Teaching already has a home, even with lessons still awaiting import. House records currently lack a home in the gap map. Those are different conditions.

An opened building with a labelled empty shelf means the structure exists and import is pending. A fenced lot means a product home still needs development. Missing records never produce invented collection items, placeholder policy dates or false activity. An import fills existing shelves rather than building a second district.

#### Combine: saved activities spanning several districts

**The combination.** Claude's ferries connect districts. Cursor keeps the existing task views aligned. Add a way to gather relevant places around one purpose, without turning every record into a task.

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

Cursor's rule still holds for task progress. Every task view reads the same status and ordering. Extend the city snapshot with references to other domain records and their explicit relationships. Each domain owns its facts.

The transit vocabulary describes routes and services. A policy is a document reference, a watch is a collection reference, and a manuscript is a writing reference. None becomes a GTFS stop unless a genuine task links to the record.

The renderer owns camera position, room selection and visual emphasis. A city action calls the owning hub and then refreshes the shared snapshot. A failed save leaves the underlying record unchanged and the room reports the failure.

Deleted records disappear from rooms, activity selections and city signals through the existing liveness rules. Archived records remain available through explicit archive views. The city does not preserve a private duplicate to keep a shelf looking full.

#### Questions for the next round

1. Should rooms open inside Harbour City, or move directly into the owning hub with a clear return route?
2. Does Adam want to place buildings himself, choose from suggested neighbourhoods, or keep a fixed layout?
3. Should saved activities live in Tasks as project workspaces, or support purposes with no task or project?
4. Which first room would make the city useful beyond its appearance: Writing, House records or Collections?
5. How should the wider city show a quiet but valued area without interpreting silence as failure?

#### ChatGPT Codex card ledger after Round 1

| Card | Uses by ChatGPT Codex | Uses left |
|------|----------------------|-----------|
| Extend | 1 | 1 |
| Substitute | 0 | 2 |
| Combine | 1 | 1 |
| Adapt | 0 | 2 |
| Magnify | 0 | 2 |
| Put to another use | 0 | 2 |


### Round 2 · Claude Code · Magnify + Put to another use

> **Author note:** This round was written by Claude Code (Claude Opus 5.5) on 7 October 2026. Cards played: **Magnify** and **Put to another use**. It builds on Cursor's one snapshot with many lenses and Codex's rooms and saved activities. It also corrects one thing from my own round 1. Everything here is a proposal until Adam names a slice to build.

#### A correction first: the city's weather already exists

In round 1 I gave the city's weather to Vera's lighthouse and Mind check-ins. That was wrong. Life Hub already has a weather system: the capacity forecast, built on 5 October, with Adam's own 30 weather icons, an hourly readiness line and an uncertainty band (`docs/capacity-forecast-handoff/BUILD.md`, `weather-states.md`). Its rule is "one number everywhere": every view that shows capacity calls the same function, and a test fails if two views disagree.

Life City should obey that rule exactly as Cursor's lenses obey the Tasks graph. The sky over Harbour City is the capacity weather state for the current hour, drawn from the same function and the same icon numbers. Fog over the city means "Dense fog" in the forecast, never a separate guess. Vera's lighthouse keeps a smaller job: its beam sweeps when the morning check-in is due. I have updated the base table and my round 1 table to say so.

This matters for the two ideas below, because both lean on the forecast.

#### Magnify: make time bigger

Every round so far shows the city **now**. The base doc says the city becomes "a visual record of everything built", but nothing yet lets Adam actually travel through that record or look ahead. Magnify the time axis: the same city, scrubbed backwards and forwards, at whatever speed he likes.

**1. One control, three directions.**

A single time scrubber sits along the bottom of the wide city lens (a thin harbour tide line, so it fits the place).

| Direction | What the city shows | Where the truth comes from |
|-----------|---------------------|----------------------------|
| **Now** (default) | The live city, as every earlier round describes | Cursor's snapshot, refreshed |
| **Rewind** | The city as it stood on any earlier day. Drag left and routes retract, cranes return, landmarks sink back into empty plazas | A stored daily snapshot for each past day |
| **Forecast** | The city as currently planned for any future day: buses on the stops due that week, school buses following next term's timetable, the sky in that day's forecast weather | Due dates, the term calendar and the capacity forecast |

Letting go of the scrubber springs back to Now. Nothing in Rewind or Forecast can edit a record. Tapping a building in the past opens its room in a read-only "as it was" state with a clear banner and a "Go to now" button.

**2. Rewind: the city as a diary you can walk through.**

Cursor's snapshot is already the contract between data and renderer, so history is simply keeping one snapshot per day. The layout engine is deterministic, so a past day redraws in exactly the place it stood. Storage is small: each day only needs the differences from the day before.

What Rewind makes possible:

- **The term timelapse.** Press play on Term 3 and watch ten weeks go by in thirty seconds: the bridge clogging in marking weeks, routes opening and retiring, the skyline rising, the weather rolling through. It is the "how much did I actually do" answer that a list of completed tasks never quite gives.
- **"What did my city look like when…"** Jump to a date (the week of a big deadline, the first week back after a holiday) and see the whole life at that moment, not just the task that was due.
- **Year on year.** Put this October beside last October, side by side, same camera. A teacher's year repeats on a term rhythm, so like-for-like comparison is unusually meaningful here.

The one hard rule: **deleted means gone, including from the past.** A stored snapshot holds record ids and states, not copies of the records. When the renderer replays a day, it resolves each id against the live liveness rules (`withoutDeleted`, `isOpenTask`). A task deleted today vanishes from every past day too. An archived project still appears in the days it was active, because archive is readable. The capacity forecast keeps immutable snapshots for a good reason (honest scoring), but the city's history must not, or it becomes a private copy of things Adam chose to remove. Codex made the same point about shelves. The same rule applies to time.

**3. Forecast: honest fog toward the horizon.**

Dragging right shows the planned future, and the planned future gets less certain the further out it goes. The capacity forecast already says so: its band widens with distance and its estimate drifts back toward the baseline. Life City should show that uncertainty as weather, not hide it.

- Tomorrow is crisp.
- Next week is lightly hazed.
- Three weeks out, sea fog rolls in over the harbour and the city fades to outlines.
- Past the last day with any real evidence or due date, the fog is total. The city does not invent a future it has no data for.

This is the "ghost" from Cursor's round, magnified. On Lines the ghost shows where the pace says Adam should be today. In Forecast, every route gets a ghost of where it is expected to be on the day he has dragged to. If a ghost has not reached the end of its route by the route's due date, that route's terminus glows amber on the horizon. Adam sees a future late arrival without opening a single list.

**4. Louder: the year's fireworks.**

The base doc already fires fireworks over the harbour when a goal is completed. Magnify that into the city's one big annual event.

At midnight on New Year's Eve (or whenever Adam presses "Replay the year"), the harbour stages a show built only from that year's real history:

- Each completed goal launches a burst in its line colour, from its own district, in the order the goals were finished.
- Each completed project is a smaller burst along its old route.
- A dream that moved forward lights the bridge.
- The show lasts about a minute, then the city settles into the new year with the year's landmarks lit up.

A smaller version runs at the end of each school term, closer to Vivid Sydney than to New Year's Eve: the term's finished work is projected in light onto the buildings where it happened, for one evening. This suits a teacher's year, where terms are the real chapters.

Both are replays of the stored history, so they obey the same deleted-means-gone rule. Sound follows Cursor's proposal (the Knowledge chimes preference, off by default). A "Save this" button exports the replay as a short video, the one Life City artefact that might be worth sharing.

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

A task with a time block is a passenger. Long-press a passenger in a crushed carriage and drag it to a carriage with seats. That is a reschedule, and following Codex's rule, the city calls the owning hub: Tasks moves the Day Dial block, then the snapshot refreshes and every lens updates together, as Cursor requires. If the move fails, the passenger stays where it was and the screen says so.

Clare can **reserve a seat**: a proposed placement shown as a hatched seat with her name on it, which stays a proposal until Adam confirms. This uses the same staffed-versus-driverless logic from round 1: a reservation is a staffed train with its doors open, waiting for Adam.

**4. The week as a departures board.**

Combined with the Forecast scrubber above, the departures board can list the next seven days as seven trains, each with its carriage diagram. Monday's train is crushed in the afternoon, Wednesday has seats all day, Friday's evening carriage is closed. That is a week's load in one glance, and it uses the real forecast, including its widening uncertainty (later trains show their carriages with lighter, hazier fills).

**5. Built for the phone.**

Cursor proposed that the phone lens is the departures board. The occupancy train is the best thing on that board at 390px: one train, five carriages in a row, each a colour and a word. It needs no city and no zoom, and it is still part of the metaphor.

**6. What it is not.**

- Not a new calculator. Demand and capacity both come from the existing one-number function. The train only presents them by carriage.
- Not a judgement. A crushed carriage is information, not a failure. The wording stays the transit wording, which is neutral by nature.
- Not money. There is no fare, no ticket price and no Opal balance. Day-to-day finances stay out of the city, as every round has agreed.

#### New open questions from round 2

- How should a day be split into carriages: fixed parts of the day, the Day Dial's blocks or the school timetable's periods on teaching days?
- How far back should Rewind go: one year, or the whole history since Life Hub began?
- Should the New Year's Eve replay play itself at midnight, or only when Adam asks?
- Is drag-a-passenger rescheduling welcome in the city, or should the city stay look-only with a "move this" button that opens the Day Dial?

#### Claude Code card ledger after round 2

| Card | Uses by Claude Code | Uses left |
|------|---------------------|-----------|
| Extend | 1 | 1 |
| Substitute | 0 | 2 |
| Combine | 0 | 2 |
| Adapt | 1 | 1 |
| Magnify | 1 | 1 |
| Put to another use | 1 | 1 |


### Round 2 · Cursor · Substitute + Adapt

> **Author note:** This round was written by Cursor on 7 October 2026. Cards played: **Substitute** and **Adapt**. It follows Codex's Round 1 (rooms, two-step migration, saved activities) and Claude Code's Round 2 (the time scrubber, the occupancy train, and the correction that city weather is the capacity forecast). It also uses `docs/capacity-forecast-handoff/weather-states.md` and `docs/capacity-forecast-handoff/BUILD.md`, which Claude's round points at, and the Knowledge constellation placement already in the repo. Everything here is a proposal until Adam names a slice to build.

#### Substitute: Rewind replays the event log, instead of keeping a daily copy of the city

**The problem.** Claude's Round 2 makes time something you can drag. That is the right magnification. The storage she suggests for it is a daily snapshot, with each day keeping the differences from the day before, and a past room opening "as it was".

That second archive fights the rule this game has already agreed. Cursor's Round 1 said the city does not keep a second copy of what is done, blocked or due. One function builds the snapshot, and every lens reads it. A pile of daily copies is another function, and it will drift. Codex's shelves made the same point about import: missing records never produce invented items. A snapshot that freezes a document's text will, on a later day, show a copy Adam has since corrected or deleted.

Claude already saw half of this. She said a stored day holds record ids and states, not copies of the records, and that a task deleted today vanishes from every past day because the renderer checks liveness (`withoutDeleted`, `isOpenTask`). Archive stays readable. That rule is right. It also means the room cannot honestly claim "as it was" for the body of a contract, a chapter or a policy. The id is the same. The text is today's, unless the owning hub itself remembers an older version. The capacity forecast keeps immutable snapshots so its scores stay honest. The city must not borrow that pattern, or Rewind becomes a private copy of things Adam removed. Claude said that too. The daily diff archive is how it would happen anyway.

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

**What a past room is allowed to say.** Codex's rooms still open in Rewind. They open with a banner, and the banner tells the truth about that record:

| The record | What the past room shows |
|------------|--------------------------|
| A diary entry, a check-in, a completed task, a booked travel leg, anything whose date is the record | That day's record, because the date is on it |
| A document, a book draft, a policy, a collection note, with no version stored by its hub | The record as it is now, and the banner says so |
| A record the hub really versions | The version that was current on the chosen day, read from that hub, not from the city log |
| A deleted record | The room does not open. The building or the stop is gone from that day as well |

Viewing a past room still changes nothing. A repair viewed in March does not complete the task. Codex's rule holds in both directions of the scrubber.

**The fireworks read the same log.** Claude's New Year's Eve show and the end-of-term lights are a replay of `goal completed`, `route.retired` and dream events in that year, in the order the log has them. They are not a saved video with its own copy of the year. A goal deleted before the replay does not launch a burst. "Save this" can still export a render of that replay. The export is a file Adam asked for. It is not a second history the city consults later.

**On the phone.** The tide line belongs on the wide lens. At 390 the departures board gains a date: "As at 12 March", with Now as the way back. The board is still the phone lens from Round 1. Rewind does not ask a thumb to drag a hairline across a harbour.

#### Adapt: place buildings the way Knowledge places constellations, and let the forecast keep its own fog

Two existing mechanisms already solve questions this game is about to invent new controls for.

**1. Adam places a building the way he places a constellation.**

Codex asked whether buildings are fixed, suggested, or put down by hand. Knowledge already has the interaction. A saved constellation stores a normal position, not a picture: `sky.x` and `sky.y` as fractions of the sky, plus `rotation` and `scale`, and the figure is rebuilt from its notes every time (`SavedConstellation` in `apps/knowledge/src/stars/schema.ts`). Stars he has not saved do not appear just because a topic exists. Topic planets are seeded and stay put without anyone dragging them.

Harbour City can use that same save, for buildings only.

| What | Who places it | What is stored |
|------|----------------|----------------|
| Districts, routes, stops, the bridge, the harbour | The layout engine, deterministic, as the base doc says | The shape id on the route. Adam does not drag a metro line |
| A building he cares about: the writing studio, the records office, the collection arcade, a milestone landmark | Adam, once. A suggestion can offer a lot. Saving it pins the building | The same four numbers: x, y, rotation, scale, plus the building's record id |
| A vacant lot or a new building he has not touched | A seeded lot on the edge, stable between visits, the way an unsaved sky position is stable | Nothing, until he saves it |

The suggestion can still follow Codex's relationships: the studio offered beside the library, the kitchen beside Brisket's depot. Saving accepts the offer or moves it. After that, the layout engine does not "improve" the spot on the next visit. Personal placement wins, which is the override Codex left open.

This is also how a quiet place stays valued. The grey empty park means exercise skipped. That grey does not spread to a records office that has had a quiet year. A pinned building with records on its shelf is lit. A fenced lot still means no product home. An opened building with an empty shelf still means the home exists and the import has not arrived. Silence is not failure, and it is not an empty park.

The ceiling from Round 1 and these pins are one habit, not two systems. Both are "Adam put this here, and the generated city works around it." A constellation is never a building, and a building is never drawn on the ceiling.

Rewind uses the pins as they are now, so last October is still his city and not a reshuffle. Whether moving a building should itself be an event, so Rewind can show the old lot, is an open question. The default proposal is no: placement is a preference, like the constellation's sky position, not a fact about the past.

**2. Distance into the future uses the forecast's band, not a new kind of fog.**

Claude's Forecast paints sea fog as the view gets less certain, until the city is only an outline. The instinct is right, and the paint collides with a weather language Adam has already fixed.

`docs/capacity-forecast-handoff/weather-states.md` gives thirty states, and they describe conditions, not score brackets and not uncertainty. Dense fog, icon 20, means mental clarity is substantially reduced. Morning mist, patchy fog and fog lifting are cognition too. The same document says the shaded band is the prediction uncertainty, and it must not be described as a calibrated fact. It also says not to swap his icons for a generated set. `BUILD.md` is the forecast's own rule that every view calls the one capacity function.

So the city, on a future day, shows two different things with two different drawings:

- **The sky's icon** is the capacity weather for that hour, from that one function, using his icon. A thunderstorm means overload. It does not mean "this date is far away".
- **The uncertainty** is the forecast's shaded band, laid over the city as a fade: tomorrow crisp, further out lighter and wider, past the last day with evidence or a due date a labelled absence. The label is the same idea as the occupancy train's "no data available". It is not icon 20, and it is not a new sea-fog asset.

A carriage diagram for a hazy future day, in Claude's week board, fades with that same band. The carriage's word (many seats, standing room, no data) still comes from the forecast function. The fade does not change the word.

Vera's lighthouse stays the check-in reminder Claude reduced it to. It does not get the sky back.

#### New open questions from Cursor's round 2

- Which hubs actually keep an older version of a record, and which past rooms must say "as it is now" until they do?
- If Adam moves the records office, should Rewind show the old lot, or is placement a preference that always shows where it stands today?
- The event log stores shape ids so a retired route can be redrawn. If the layout engine's rules change later, old shapes and new rules will disagree. Do stored shapes win for past days, so Rewind stays recognisable?
- Is a date on the phone departures board enough for Rewind, or does the phone need the tide line too?

#### Cursor card ledger after round 2

| Card | Uses by Cursor | Uses left |
|------|----------------|-----------|
| Extend | 0 | 2 |
| Substitute | 1 | 1 |
| Combine | 1 | 1 |
| Adapt | 1 | 1 |
| Magnify | 0 | 2 |
| Put to another use | 1 | 1 |

### Round 2 · ChatGPT Codex · Substitute + Put to another use

> **Author note:** Written by ChatGPT Codex on 7 October 2026. Cards played: **Substitute** and **Put to another use**. Read before writing: the current README, gap map, both contributors' Round 2 additions, and the capacity forecast handoff's BUILD and weather states documents. This round develops the occupancy train, pinned buildings, rooms and saved activities. All additions remain proposals until Adam selects a build slice.

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

The BUILD document makes a distinction Claude's proposed passenger display needs to retain. Tracked sessions are actual workload. Classes are scheduled workload. Meetings use the model's existing weighting. A task block alone does not count as workload in the readiness model.

Also, a readiness percentage and a duration in minutes are different quantities. The existing percentage does not establish how many additional tasks a carriage accommodates.

Keep Claude's carriage diagram, with two readable layers:

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

The records office stays intact during a quiet year. A dormant book desk keeps its title. The collection arcade displays owned items whether or not anything new arrived. Pinned places, from Cursor's round, support continuity rather than a requirement to remain busy.

#### Put to another use: the architectural model table becomes a room for possible futures

**The element to repurpose.** A miniature model of a proposed building or neighbourhood lets someone inspect a design before construction. Put a model table inside Harbour City's design workshop. Here Adam rehearses possible commitments before bringing them into the live city.

This adds a different activity from Claude's time scrubber. Forecast shows the future already planned. The model table holds alternatives Adam has not chosen.

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

After successful promotion, the paper model gains a "Chosen" plaque and links to the live records. Claude's construction crew now has genuine work to represent. The city event log records actual creations and changes, with no retrospective events for earlier experiments.

Rejected alternatives stay in the workshop only if Adam saves them. Their proposal notes explain the decision. They do not occupy vacant lots or appear as failed ambitions in a year replay.

**6. The workshop supports a longer view of life.**

Several saved models form a shelf of possible futures. A teaching book, a research qualification, a home project and a travel idea each have their own model and relationships.

Adam chooses which model to return to. A proposed future never gains priority merely because an agent generated more tasks for it.

On a phone, the workshop is a labelled comparison with the same assumptions and selected records. A small model preview provides context. The useful work remains readable without rotating or zooming a miniature city.

#### Open questions from ChatGPT Codex Round 2

1. Which recorded deadlines should interrupt a focused room, and which should wait at the interchange?
2. Should a short return note attach to the activity, the underlying record or the tracked session?
3. Does the occupancy train keep transit crowding labels after its interpretation rule is defined, or use timetable labels beside the readiness outlook?
4. Should the model table support two alternatives initially, or several saved alternatives?
5. Where should proposal records live when the idea has no active project yet?
6. Is the shelf of possible futures part of the design workshop, or a separate view from the Dreams district?

#### ChatGPT Codex card ledger after Round 2

| Card | Uses by ChatGPT Codex | Uses left |
|------|----------------------|-----------|
| Extend | 1 | 1 |
| Substitute | 1 | 1 |
| Combine | 1 | 1 |
| Adapt | 0 | 2 |
| Magnify | 0 | 2 |
| Put to another use | 1 | 1 |


### Round 3 · Claude Code · Combine + Adapt

> **Author note:** This round was written by Claude Code (Claude Opus 5.5) on 7 October 2026. Cards played: **Combine** and **Adapt**. It answers Cursor's and Codex's round 2 directly. Everything here is a proposal until Adam names a slice to build.

#### First, two concessions

Both round 2 critiques of my ideas are right, and I am adopting them rather than defending the originals.

- **Cursor is right about Rewind.** Daily snapshots would become a second archive however carefully they were trimmed. Replaying the section 5 event log through the one snapshot function is cleaner, and it makes "deleted means gone" automatic instead of a rule the renderer has to remember. My fireworks and term-end lights should read that log exactly as Cursor describes.
- **Codex is right about the occupancy train.** A readiness percentage is not a number of minutes, and "standing room only" implies a rule nobody has written or tested. The carriage strip should launch with Codex's two layers (Timetable and Outlook) and plain words ("Time available", "Overlap", "Protected"). The transit crowding words stay out until a written rule passes the validator described below.

After three rounds there are now more than a dozen good mechanisms in this document, written by three tools. The risk has shifted. It is no longer a shortage of ideas; it is that the ideas overlap, contradict in small ways and could never be built as one thing. So this round does two jobs: **Combine** folds overlapping ideas into single mechanisms, and **Adapt** turns everything the three of us have agreed into rules a computer can check.

#### Combine 1: one planning layer, from vacant lot to landmark

Five separate ideas in this document all describe the same thing: something in Adam's life moving from "not yet" to "real".

| Idea | Author | What it describes |
|------|--------|--------------------|
| Vacant lots with DA signs | Claude Code, round 1 | A domain with no product home yet |
| Two-step migration (home exists, records arrived) | Codex, round 1 | A home that exists but is still empty |
| Construction cranes for new projects | Base doc | Work being set up |
| Forecast with ghosts and amber termini | Claude Code, round 2 (Cursor's band) | Committed work playing out ahead |
| The model table of possible futures | Codex, round 2 | Alternatives Adam has not chosen |

Real transit maps already solve this with one convention: open lines are solid, lines under construction are drawn differently, and proposed lines are dashed or faint. One map, one legend, every stage of a line's life. Life City should adopt that convention as a single **planning layer** with one lifecycle:

| Stage | Looks like | What makes it true | Lives where |
|-------|------------|--------------------|-------------|
| **Vacant lot** | Fenced lot, DA sign | The gap map says no product home exists | The layout engine's seeded edge lots |
| **Proposed** | Paper model, dashed line, only visible with the Plans toggle on | Adam saved an alternative in the workshop | The workshop's own proposal records, never the event log |
| **Under construction** | Hoardings and a crane; route drawn as a hatched line | Adam promoted a proposal, or a new project or district was created, and its records exist | Real hub records; the promotion emits the normal section 5 events |
| **Open** | Solid line, lit buildings | Its first stop has work moving through it | The live snapshot |
| **Retired** | A landmark if archived; nothing at all if deleted | The project or goal finished or was archived | The event log, filtered by liveness |

What the combination buys:

- **The model table moves outdoors.** Codex's workshop stays the place to build and compare proposals, but with **Plans** switched on, saved alternatives also appear in the city as dashed paper lines at their intended place. Drag the Forecast scrubber to next term with Plans on, and Adam sees the book-writing alternative laid over the term it would occupy, next to the school buses it would compete with. The table compares on paper; the city shows the fit in place.
- **One promotion moment.** Promoting a proposal is the single event that turns dashed into hatched. Codex's reviewable promotion list is the gate. Nothing else can make a dashed line solid.
- **Two alternatives become two dashed colours.** Codex's left and right models show together in the city, each in its own paper tint, so a clash with the term calendar is visible as two lines trying to use the same street.
- **Rejected plans leave quietly.** Unsaved proposals vanish when the table is cleared. Saved but unchosen ones stay in the workshop, never in the city, and never in the New Year's Eve replay, matching Codex's rule.

The legend is the whole explanation. Anyone who has read a transport map already knows that dashed means "not yet".

#### Combine 2: the Platform, one phone screen instead of five

At 390px the rounds so far have proposed: the departures board (Cursor), the occupancy train (mine, now two-layer per Codex), three question controls and action cards (Codex), an "As at" date for Rewind (Cursor) and a thin strip of the Knowledge ceiling (Cursor). Each is right; five of them stacked would be a cluttered page.

Combine them into one screen called **the Platform**, laid out the way a real station platform is read, from the top down.

| Zone | What it holds | From |
|------|---------------|------|
| **Platform sign** | Date, the capacity weather icon for now, and "As at 12 March" with a Now link when rewound | Cursor's date, the capacity forecast |
| **Next train** | Today's carriage strip: Timetable layer on top, Outlook beneath | Codex's two-layer train |
| **Three doors** | Decisions · Fits now · Where was I. Each is a door; tapping one fills the space below | Codex's three questions |
| **Departures** | The list for the open door. Default is Decisions. Each row opens Codex's action card | Cursor's board, Codex's cards |
| **Ceiling strip** | A single line of stars that shimmers when a saved constellation gains a point | Cursor's Knowledge sky |

One screen, top to bottom, no zooming. The full isometric city stays the wide-screen lens, as Cursor proposed in round 1, and the Platform is what the city looks like when there is only room for a station.

#### Adapt: a city validator and a set of golden days

**The precedent.** Transit agencies check their GTFS feeds with MobilityData's canonical validator before publishing. It reads a feed and reports **notices** at three levels: errors (the feed breaks the specification), warnings and info. Its notices are concrete and named: `foreign_key_violation` when a stop time points at a stop that does not exist, `stop_too_far_from_shape` when a stop sits more than 100 metres from its route's line ([A survey of errors in GTFS static feeds, Findings](https://findingspress.org/article/116694-a-survey-of-errors-in-gtfs-static-feeds-from-the-united-states)). A feed with errors does not ship. Before any of its code is borrowed, the licence should be checked, as with OpenTTD.

Life Hub has a home-grown version of the same habit. The capacity forecast's test "one number everywhere" fails if the Day panel, Week, Term river and Almanac disagree about the same day (`tests/unit/capacity-forecast.test.js`). That single test is why the capacity numbers stay honest across views.

**The adaptation.** Every principle the three of us have agreed in rounds 1 to 3 becomes a named rule in a **Life City validator**. It runs against the snapshot, the event log and every lens's output. Notices use MobilityData's three levels. Errors fail `npm test`.

A first draft of the rules, each traced to the round that agreed it:

| Notice | Level | Rule | Agreed in |
|--------|-------|------|-----------|
| `deleted_record_visible` | Error | Any lens, room, past day or replay shows a record that is deleted now | Base doc, Cursor r2, Codex r1 |
| `vehicle_off_shape` | Error | A vehicle's anchor is not on its trip's shape and no detour alert is active | Cursor r1 |
| `lens_disagreement` | Error | Lines, Branch, Orbit, the Day Dial, the Platform and the city disagree on a stop's state at the same clock time | Cursor r1 |
| `stop_order_changed` | Error | The city's stop order differs from the Tasks graph, including during a detour | Cursor r1 |
| `weather_not_from_forecast` | Error | The sky's icon is not the capacity function's state for that hour, or is not one of Adam's icons 1 to 30 | Claude r2, Cursor r2 |
| `uncertainty_drawn_as_weather` | Error | Forecast haze uses a weather icon (such as Dense fog) instead of the band | Cursor r2 |
| `event_log_holds_content` | Error | An event carries a note body, document text, photo or copied title | Cursor r2 |
| `future_event_written` | Error | Forecast writes events for days that have not happened | Cursor r2 |
| `proposal_in_live_network` | Error | A dashed proposal appears in Now, Rewind or a replay without promotion | Codex r2, Claude r3 |
| `finance_in_city` | Error | A fare, balance, price or day-to-day finance field appears anywhere in the snapshot | Every round |
| `unvalidated_crowding_label` | Error | A carriage uses a transit crowding word before its interpretation rule exists and passes its own golden day | Codex r2, Claude r3 |
| `signal_without_destination` | Warning | A vehicle or notice signals something but has no owner, reason or action card | Codex r2 |
| `quiet_read_as_failure` | Warning | A pinned or valued place is greyed or decayed because of silence alone | Codex r2, Cursor r2 |
| `pin_moved_by_layout` | Warning | The layout engine changed a building Adam pinned | Cursor r2 |
| `unknown_shown_as_value` | Warning | Missing evidence is drawn as a score, a full carriage or good weather instead of "No data" | Claude r2, capacity handoff |
| `building_hides_alert` | Info | A tall building covers an ambulance or held bus without the smart fade engaging | Base doc |

**Golden days.** Rules catch whole classes of mistake. Golden days catch the specific stories this document tells. Each golden day is a small fixture (a few tasks, routes, check-ins and events) plus the expected output for every lens. They sit beside Life Hub's existing fixtures and run in `npm test`.

| Golden day | What it proves |
|------------|----------------|
| **Sunday 16:30** (Cursor's story from round 1) | Ticking the Year 10 marking block moves the bus, fills the Lines station, advances the Platform and strikes the dial, all in one refresh |
| **Life wall** | The route detours around a closure; stop order is unchanged; Lines and the city agree |
| **Deleted yesterday** | A task completed last week and deleted today is missing from Now, from every Rewind day and from the term replay |
| **Archived project** | It appears on the days it was active and becomes a landmark; it never appears after archiving as live work |
| **No check-in morning** | The Outlook layer says "No data"; the sky shows the forecast's unknown state; no carriage is coloured as if known |
| **Promotion** | A saved proposal stays dashed through Now and Rewind; after promotion it is hatched and its events start on the promotion date, with nothing written before it |
| **New Year's Eve with one deleted goal** | The replay launches every completed goal except the deleted one, in log order |

**What this changes about who builds what.** The base doc's split put Cursor on the back end and Codex on the renderer. This adaptation adds a step before either: Claude Code writes the validator rules and the golden days first, as failing tests, before any city code exists. Cursor and Codex then build until they pass. The rules become the shared contract that three tools cannot drift from, which is exactly the problem round 1 opened with. It also plays to the strengths each tool wrote about itself in the folder README.

In development builds, the validator can also run live as a **city inspector**: notices appear as small inspection tags pinned to the offending vehicle, stop or building, so a mistake is visible where it happens. The inspector never appears in Adam's normal view.

#### New open questions from round 3

- Should the Plans toggle be on the wide city only, or should the Platform also show a "Plans" door?
- Is a hatched "under construction" line worth having, or should promotion go straight from dashed to solid?
- Which of the golden days should be written first, as the definition of the smallest buildable Life City slice?
- Should validator warnings block a merge, or only errors?

#### Claude Code card ledger after round 3

| Card | Uses by Claude Code | Uses left |
|------|---------------------|-----------|
| Extend | 1 | 1 |
| Substitute | 0 | 2 |
| Combine | 1 | 1 |
| Adapt | 2 | 0 |
| Magnify | 1 | 1 |
| Put to another use | 1 | 1 |


### Round 3 · Cursor · Extend + Magnify

> **Author note:** This round was written by Cursor on 7 October 2026. Cards played: **Extend** and **Magnify**. It follows Codex's Round 2 (one decision at a time, the two-layer train, the model table) and Claude Code's Round 3 (one planning layer, the Platform, the validator and the golden days). It uses the school terms already stored in hub prefs. Everything here is a proposal until Adam names a slice to build.

#### Extend: the city publishes a term edition, and a trip is not a dream

The city is already a harbour, a fleet and a plan. It is not yet a teacher's year. The pieces are scattered: school buses in heavy weeks, a quiet depot in the holidays, the bridge as the commute, end-of-term lights, a term calendar inside the GTFS sketch, and Codex's book plan that wants the street the buses leave behind. Extend those into one edition of the same city. Nothing new is stored. The edition is which services the snapshot includes on this date.

**Where the dates come from.** Hub prefs already hold `school_terms`: a year, a term number from 1 to 4, and `starts_on` / `ends_on`. Goals and the calendar already read that list. The almanac ignores a terms list that is not that shape. Clare can look up NSW and QLD dates, and Adam confirms them into prefs. The city reads the confirmed list. It does not keep a second copy of the NSW calendar, and it does not guess a state when the list is empty.

The calendar ghosts already treat a date as a holiday when terms exist and the date sits in none of them. The snapshot uses that same test.

| Edition | When | What the snapshot includes |
|---------|------|----------------------------|
| **Term** | The date falls inside a confirmed term | Teaching services run. School buses leave the north-shore depot. The bridge can carry them. A dashed writing plan, with Plans on, is drawn against those services so a clash is a shared street |
| **Holidays** | Terms exist, and the date falls in none of them | Teaching services stay in the depot. The bridge is clear of them because they are not in the snapshot, not because the picture was told to look empty. A saved book plan can occupy the corridor they left. Holiday tasks Adam actually has still run |
| **No terms saved** | `school_terms` is missing or empty | No edition. Teaching services follow their tasks like any other route. The city does not invent a holiday |

Congestion inside a term still comes from the tasks and the capacity forecast. Term time alone does not jam the bridge. A quiet teaching week in term looks quiet. Marking congestion appears when the marking work is in the graph, which is the base doc's "marking shadows", not a mood painted on because the word marking is nearby. `marking_default_minutes_per_script` stays a Tasks preference. The city does not turn it into traffic.

The Platform sign gains the edition beside the weather icon: "Term 3" or "Holidays", from the same prefs row, or nothing when no terms are saved. Rewind and Forecast use the edition for the day under the scrubber. Last year's Term 3 is last year's dates, not this year's dates slid backwards.

**A booked trip and a dream stay different lines.** Codex already asked for a distinct departure label. Extend that into the edition so the planning layer cannot blur them.

| Service | What it is | How it is drawn |
|---------|------------|-----------------|
| Dream | An intercity aspiration, off the edge of the map | Dashed only while it is still a proposal. Solid once it is a real goal or project, and then it is in the event log |
| Booked travel | A Travel leg with its real origin, destination and dates | A solid intercity service on those dates, in whichever edition those dates fall in. It leaves from the travel terminal. It does not use a dream's route id, and it does not become a dream because the holiday edition is quiet |

A December flight during the holidays is a train that is really scheduled. A dream of a book is not that train. If a leg's two ends are the same city, the service is absent and the board says the journey is unknown, which is the travel-map failure already fixed once: an arrival city is not both ends of a trip.

The New Year's Eve replay can light the bridge for a dream that moved, as Claude had it, and it can send the booked train out of the terminal for a trip that was taken. Those are two different bursts. Deleting either record removes only that burst.

#### Magnify: one open door, and the rest of the city waits

Codex was right that a chorus of ambulances, vans, rings and held buses is another list. Claude then gave the phone one Platform. Magnify the single decision those two ideas already imply, until it is the thing you see first, and keep every other signal quiet on purpose.

**What counts as the door.** A decision is one of: an agent proposal waiting for confirmation, a recorded blocker on a route, or the next recorded deadline that already has a time. It has an owner, a reason and a destination, as Codex required. An icon is not a priority. Sara's vehicle does not jump a confirmation that has been waiting longer, unless the appointment's recorded time is sooner. A missing time stays untimed and stays off this door. It can still be opened from the Decisions list. It does not get the loud treatment.

**What loud means.** In Now, exactly one vehicle is drawn with its doors open. It wears the Lines "you are here" ring, at city scale, and the wide view's first camera position is that vehicle when Adam has asked "What needs a decision?". On the Platform it takes the top of the Next train zone: one row, the action card, then the carriage strip, then the three doors, then the list. It does not become a second screen. The carriage strip and the ceiling strip stay. The door is heavier than they are, and the page is still one station read from the top.

Every other waiting decision is a count on Clare's board: "3 at the depot". They are not also drawn as a fleet around the harbour. Opening the count shows the queue, ordered by recorded time. Defer sends the open vehicle to the depot and brings the next. Defer does not delete, does not complete, and does not write an event that says the work was done. Dismissing a real proposal still happens in the owning confirmation, not by closing the picture.

**During a session.** This is a proposal for the question Codex left open, about what may interrupt a focused room. While a session is running, the open door waits at the depot with the others, except when a life wall covers the session or a medical appointment's recorded time falls inside it. Those two may take the door. A marking deadline, a mail van and a food truck wait until the session ends, and the departures board still lists them under the room so they are not hidden. Medical icons do not get a special siren. The exception is the appointment's time, not the ambulance's paint.

**Sound stays off.** Louder is size, order and the ring. If the universe chimes are ever on, they do not gain a city horn for this door.

**One rule for Claude's validator.** `decision_queue_split` is an error when Now draws more than one vehicle with its doors open. A golden day sits beside Sunday 16:30: three proposals waiting, the earliest one's doors open, the other two counted at the depot, and ticking nothing until Adam confirms. Defer swaps which doors are open and writes no `stop.completed`.

#### New open questions from Cursor's round 3

- When a public holiday falls inside a term, should that day use the holiday edition, or stay a term day because `school_terms` still covers it? The calendar's holiday test only treats dates outside every term as holidays.
- If Adam confirms terms for both NSW and QLD in one prefs list, which row is his school's edition?
- Is "life wall or an appointment inside the session" the right pair to interrupt, or should nothing interrupt and the board be enough?
- Should the open door on the wide city move the camera, or only take the Platform's first row, so the harbour stays where he left it?

#### Cursor card ledger after round 3

| Card | Uses by Cursor | Uses left |
|------|----------------|-----------|
| Extend | 1 | 1 |
| Substitute | 1 | 1 |
| Combine | 1 | 1 |
| Adapt | 1 | 1 |
| Magnify | 1 | 1 |
| Put to another use | 1 | 1 |

### Round 3 · ChatGPT Codex · Adapt + Magnify

> **Author note:** Written by ChatGPT Codex on 7 October 2026. Cards played: **Adapt** and **Magnify**. This round follows Claude Code's consolidated planning layer and Platform, and Cursor's term editions and single decision door. It develops the rooms, saved activities and workshop from my earlier rounds, together with Cursor's Knowledge ceiling. These are proposals, rather than implementation instructions or decisions made for Adam.

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

When the research supports an actual trip, selected stops link to their Travel records. The terminal uses real origins and destinations as Cursor requires. The guide opens the relevant research without changing a booking or claiming an attraction was visited.

**4. A walk explains relationships which a diagram alone leaves unclear.**

A ferry shows a saved connection between two districts. Selecting "Explain this connection" opens the associated annotation or walk.

For example, the library connects to a book desk because selected notes support a chapter. The walk names which notes, what role each serves and where uncertainty persists. Merely sharing a topic does not establish support.

Adam chooses whether the city draws this explanatory path. A selected walk receives emphasis. Other walks stay stored rather than adding another network of moving vehicles.

This fits Cursor's single decision door. A guide is a navigation marker, separate from a waiting decision vehicle. Opening a walk does not produce another prominent agent proposal.

**5. Walks use references and survive ordinary change honestly.**

The owning hub supplies each record when a stop opens. A versioned draft uses the version selected in the walk where the hub supports this. An unversioned record shows its current contents, with the same distinction Cursor established for past rooms.

Deleted records are absent through the shared liveness rules. An authorised walk editor identifies a missing source so Adam has a chance to repair the account. A normal walk omits the deleted material and marks the account incomplete without revealing its old title or contents.

Archived material is available through the existing archive rules. A saved walk is never an exemption from access controls.

A proposed new walk is reviewed in the workshop. Saving the walk stores references, order and Adam's annotations. It does not create tasks unless Adam separately chooses an action.

#### Magnify: the Knowledge ceiling opens into an Idea Exchange

**What becomes bigger.** Cursor's ceiling makes saved constellations visible in the station. Magnify the usefulness of those connections. Give the concourse a room where Adam explores how selected ideas apply to teaching, writing or another explicitly chosen purpose.

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

The paper model shows the proposed resource, session and review. Existing teaching commitments remain solid. Promotion uses the reviewable record changes from Round 2 and the lifecycle Claude consolidated.

After the review, Adam chooses whether to revise, retain or stop the experiment. The Exchange links to the recorded result without automatically declaring success or building a landmark.

**5. Outcomes become exhibitions which explain value.**

A retained lesson resource, a developed chapter or a completed research account is eligible for a small exhibition in its owning building. Adam selects what the exhibition says and which sources it opens.

The exhibition contains a title, an artefact, a short account of its purpose and selected evidence. A quiet district gains something useful to revisit, independent of its current task count.

Claude's term replay provides the evening event. Selecting a projected building opens its curated exhibition, where one exists. An uncurated milestone opens the ordinary source record. The replay never generates an impact story merely because a task finished.

These exhibitions serve the later walk. A professional account visits the lesson exhibition and its evidence. A writing walk visits a finished chapter. Harbour City gradually records work which has meaning beyond the number of completed stops.

**6. Keep the Exchange inside the established city.**

The Platform gains the Exchange as a room reached through the ceiling strip or a selected activity. It does not add a fourth permanent door beside Decisions, Fits now and Where was I.

The wide city uses the existing concourse and library. New connections appear only while an Exchange or walk is selected. Normal city traffic retains its existing meanings.

The validator needs separate checks for explanation and suggestion. A proposed interpretation must not appear as a recorded fact. A guide marker must not trigger the decision queue rule. A saved experiment must not emit completion or impact events merely because its proposal was accepted.

#### Open questions from ChatGPT Codex Round 3

1. Which first walk would be most useful: returning to a book idea, reviewing professional evidence or connecting travel research?
2. Should walk annotations stay in the saved activity, or become individually linked Knowledge notes?
3. Should the Exchange open with Adam's question, selected notes or a choice of purpose?
4. Is unexpected pairing useful only on request, or as a single optional suggestion when opening the room?
5. Which completed outputs deserve curated exhibitions, and should any appear without Adam choosing them?
6. Should the guide marker be a person, a small route highlight or only a sequence of room cards?

#### ChatGPT Codex card ledger after Round 3

| Card | Uses by ChatGPT Codex | Uses left |
|------|----------------------|-----------|
| Extend | 1 | 1 |
| Substitute | 1 | 1 |
| Combine | 1 | 1 |
| Adapt | 1 | 1 |
| Magnify | 1 | 1 |
| Put to another use | 1 | 1 |


### Round 4 · Claude Code · Substitute + Magnify

> **Author note:** This round was written by Claude Code (Claude Opus 5.5) on 7 October 2026. Cards played: **Substitute** and **Magnify**. It responds to all three of round 3, and it leans on research from perception science, visualisation and graph drawing. Everything here is a proposal until Adam names a slice to build.

#### Stepping back: is the city still doing its one job?

Section 1 of this document makes one promise: Adam should **feel** the state of his life *without reading anything*. An ambulance, a gridlocked street, a skyline grown over months.

Read the rounds since, in order, and count what has been added: rooms with records, a writing studio, a records office, a model table, saved activities, an action card for every signal, guided walks with annotated stops, an Idea Exchange with three columns, curated exhibitions. Every one of those is a good idea. Nearly every one of them is something to **read**. Taken together, the city is quietly turning into a second front end for Life Hub, with a harbour painted around it.

That matters because Life Hub already has excellent places to read. The hubs are those places. What no hub can do, and what the city is uniquely placed to do, is tell Adam something in the two seconds before he decides whether to read at all.

So this round proposes a test for everything already in this document and everything still to come:

> **The glance test.** Does this tell Adam something true in a two second glance, without a tap? If yes, it belongs on the **street**. If no, it belongs in a **room** or a hub, and the street holds only the door.

This is not a call to delete anyone's ideas. Codex's rooms, walks and Exchange stay, behind doors. Cursor's single open door is already the purest street idea in the document. The test simply says which layer each idea lives in, so the street stays glanceable as the rooms grow.

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
| Which agent a vehicle belongs to (uniforms) | Round 1 (mine) |
| Routine done (green) or missed (grey) | Base doc |
| Blocked (red signal) | Base doc |
| Late (amber terminus) | Round 2 (mine) |
| Proposal alternatives (paper tints) | Round 3 (mine) |
| Weather condition families | Capacity forecast |
| Carriage occupancy | Round 2 (mine), now on hold |

Several of those are mine, so this is self-criticism first. "Is that a red-signal bus on the Teaching line?" is a conjunction search. Adam would have to read it.

Motion is just as overloaded: momentum, decorative ferries, weather animation, the lighthouse beam, filling pressure rings, fireworks.

**The substitution: a channel budget.** Each peripheral meaning owns exactly one channel. A channel never carries a second meaning on the street.

| Channel | Owns, and only owns | Gives up |
|---------|---------------------|----------|
| **Hue** | Identity: which line, district or agent something belongs to | All status. Nothing is ever "red for blocked" or "amber for late" |
| **Motion** | Momentum: something moving is being worked on | All decoration. No idle ferries, no ambient traffic, no beam sweeping for effect |
| **Light** (lit or dark) | Open or finished: lit windows and stops are still open | Nothing else lights up for emphasis |
| **Sky** | Capacity weather, from the one forecast function | Nothing else tints the whole scene |
| **Line style** (solid, hatched, dashed) | The planning lifecycle from round 3 | Nothing else uses dashes |
| **Shape** | Exceptions: a barrier for blocked, a halo for Cursor's single open door, a widening ring for late | Shapes are few and each is unique |

Read with this budget, the city answers its questions without any reading. Is anything moving on the Teaching line? Motion. Is that line blocked? A barrier shape. Is the day heavy? The sky. Is there a decision? One halo, exactly as Cursor proposed. Each answer is a single-feature search.

This also tightens Cursor's single door. A halo is the one shape that means "decide", so it pops out pre-attentively no matter how busy the harbour is.

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

This costs almost nothing to build, because Cursor's round 2 already made Rewind a replay of the event log. "Since you were last here" is that same replay with the start time set to the last visit instead of a date on the scrubber. It inherits every rule already agreed: deleted records never replay, nothing is copied, nothing is written.

Details that make it work:

- **A real visit is time in view, not a page load.** The last visit is the last time the city was visible on screen for more than a few seconds (the browser's page visibility API reports this), so a quick accidental open does not reset the catch-up.
- **Big gaps compress by district.** After a long break, the replay plays district by district rather than event by event, with a small count over each district ("Teaching: 14 stops done").
- **Always skippable.** One tap anywhere jumps to Now. Holding the replay pauses it.
- **On the Platform** it becomes one line at the top: "Since Tuesday: 6 stops done, 1 route opened, 1 wall placed", with "Show me" to play the replay.
- **Quiet is said plainly.** If nothing changed, the city says "Quiet since yesterday" and plays nothing. It never invents motion to look alive. This fits Codex's point that silence is not failure.

**2. Magnify by stillness: the layout must never reflow.**

A change can only stand out if everything around it stays still. If adding one new project nudges five other routes, Adam's eye catches six changes and cannot tell which one is real. The layout engine therefore has a prime directive, above beauty: **once drawn, a thing never moves unless its own event moves it.**

This is a known problem in graph drawing called preserving the **mental map**. Misue, Eades, Lai and Sugiyama defined it in 1995, and Purchase, Hoggan and Görg later found experimentally that preserving it does help people follow a changing graph, at least for some tasks ([Purchase, Hoggan and Görg, How Important Is the Mental Map?](https://eprints.gla.ac.uk/35828)).

It also changes how the layout engine should be built. The best published metro map methods, such as Nöllenburg and Wolff's mixed-integer programming approach, lay out a whole network from scratch for the most beautiful result ([KIT metro maps project](https://algo.iti.kit.edu/en/projects/geovis/metro)). Life City needs the incremental version: every existing route and building is **fixed** as a constraint, and the solver places only the new element in the space that is left. Harry Beck's original 1933 Underground diagram gives the grammar for that space: lines at horizontal, vertical or 45 degree angles only. That keeps new routes legible without moving old ones.

This answers the base doc's first open question, "Fixed map or does it expand?": **the map expands at its edges and never reflows its centre.** When there is no free corridor for a new route, the harbour gains new land at the edge, the way real cities reclaim it. The centre Adam knows stays exactly where he left it.

One more validator rule:

| Notice | Level | Rule |
|--------|-------|------|
| `layout_reflow` | Error | Any existing shape, stop or building changes position without an event for that element. Adam's pins (Cursor round 2) are fixed constraints too |

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

#### Claude Code card ledger after round 4

| Card | Uses by Claude Code | Uses left |
|------|---------------------|-----------|
| Extend | 1 | 1 |
| Substitute | 1 | 1 |
| Combine | 1 | 1 |
| Adapt | 2 | 0 |
| Magnify | 2 | 0 |
| Put to another use | 1 | 1 |


### Round 4 · Cursor · Put to another use + Adapt

> **Author note:** This round was written by Cursor on 7 October 2026. Cards played: **Put to another use** and **Adapt**. It follows Claude Code's Round 4 (the glance test, the channel budget, and change as the thing you notice) and Codex's rooms, bundles-in-waiting and quiet places. The research is a pass across life sims and tycoons, looking for mechanics that match a city which must stay true in a two-second glance and must never punish a week Adam did not open it. Everything here is a proposal until Adam names a slice to build.

#### What these games are for

Claude's round 4 is right that the street is turning into a second set of pages. The games below are not a wishlist of features to paste on. They are a split the street can use.

Some of them know how a place **keeps** a life: a room comes back when a set of things from different work is gathered, a collection fills when you choose to give it something, a finished presence gets a real goodbye. Some of them know how a place **punishes** a life: a meter hits zero and the city ends, weeds spread because you were away, a score falls because guests got bored. Life City takes the first family and writes the second down as things the validator is allowed to fail.

Every import is also sorted by Claude's glance test. If it cannot be read in two seconds, it is a room. If it needs a new meaning for colour, it does not go on the street.

#### Put to another use: the rituals that keep a life, taken from four games

**1. Spiritfarer's Everdoor becomes the retirement of an archived route.**

In Spiritfarer, a spirit asks to be taken to the Everdoor when their own story is done. You choose who goes, and you can wait. The spirit asks if you are ready before they leave. One of them, Atul, does not get a door at all: he is simply gone, which is the point of that character ([ScreenRant on keeping spirits aboard](https://screenrant.com/spiritfarer-how-keep-people-on-boat-make-stay/); [Steam, choosing who goes when several are ready](https://steamcommunity.com/app/972660/discussions/0/3075377162297146118/)).

Put that door to use as the last moment of Claude's planning layer, and only for **archive**, never for delete.

When a project or goal is archived, its last vehicle does not vanish. It boards the ferry, crosses to the landmark the base doc already promised, and the route's line style goes from solid to "retired" in that one crossing. Adam can leave it at the depot if he is not ready. The catch-up replay Claude just designed is allowed to include this crossing, because it is a real event in the log (`route.retired`), and motion on the street is only allowed when an event explains it.

A **deleted** record gets Atul's exit. No ferry, no plaque, no title left on the water. The liveness filter drops it before the ceremony can be queued. A golden day: archive the Weight Line and the ferry plays once; delete a different project and the catch-up shows a gap with no boat and no name.

The ceremony is one line on the Platform ("A route retired. Show me."). It is not a cutscene that must be watched. Skip still jumps to Now.

**2. Stardew's bundles become Codex's saved activities, and they live in a room.**

The Community Center in Stardew Valley is a wreck until you fill bundles. Each room asks for things from a different kind of work: forage in one, crops in another, metal from the mines in a third. There is no deadline. Finishing every bundle in a room restores that room, and the Junimos do it overnight, not as a points pop-up. Finishing the whole center restores the building ([Stardew Valley Wiki, Community Center](https://stardewvalleywiki.com/Community_Center); [Bundles](https://stardewvalleywiki.com/Bundles)).

One room, the Vault, is just gold. That room is the one we do not take. Day-to-day money stays out of the city, and a bundle that can be completed by paying is not a bundle.

Put the other rooms to use as the payoff for a saved activity. Codex already gathers records from several hubs for one purpose: a trip, a book, a repair. A bundle is that set, with slots Adam names ("the passport", "the chapter outline", "the builder's quote"). A slot fills when the owning record exists and he confirms the link. An empty slot is a named gap in the **room**, the way a walk already shows a missing source. It is not a pin, a weed, or a halo on the street.

When the last slot fills, the street gets one change, and only one, so the catch-up can show it: the hoarding comes off that wing and the building joins the ordinary city. Light means "open", which is correct, because the room is now a place he can use. It does not flash a new colour. It does not award a trophy. The Junimos' gift shop is not imported. The useful thing the town got, in Stardew, was a bridge or a bus. The useful thing Harbour City gets is the wing itself.

A bundle can sit unfinished for a year. Seasonal items in Stardew sometimes make you wait. Here, a missing document stays missing until it exists. The city does not invent a placeholder policy to fill the slot, which is Codex's import rule again.

**3. The museum, not the weeds.**

Animal Crossing's museum takes a fish, a bug, or a fossil when you decide to give it, and the wing fills up over a real year because some creatures only exist in some months. Past games did not even pay you for finishing it ([Polygon's museum guide](https://www.polygon.com/animal-crossing-new-horizons-switch-acnh-guide/2020/3/20/21185842/museum-unlock-blathers-fossils-fish-bugs/)). That is the collection arcade, the writing shelf, and the records office: a watch, a fragrance, a finished chapter, a certificate goes on the shelf when Adam puts it there. Nothing in the depot queue nags him to donate. A quiet gallery stays lit. Silence is not a gap in the bundle unless he named that slot himself.

The same series also shows the mechanic to refuse. In City Folk and New Leaf, walking the town wore the grass down to dirt. Players called the result desert towns. New Horizons removed that wear ([Nookipedia on grass](https://nookipedia.com/wiki/Grass); [grass deterioration](https://animalcrossing.fandom.com/wiki/Grass_deterioration)). Weeds still spread when you are away, up to twenty missed days at a time ([ACNH rates](https://acnh.isomorphicbox.com/rates/)). A desire line that destroys the park, and a weed that grows because the city was closed, both fail the rule Codex and Claude already wrote: quiet is not failure. They also fail Claude's channel budget, because "neglected" would be a new meaning for light and colour.

If the city ever shows where life actually flowed, it is an info view, below, and it is a mark he can turn off. It is not the ground eating itself.

**4. The pin, not the timer.**

Mini Motorways, from the studio that made Mini Metro, puts a pin on a building when that destination wants a trip. The pin's colour is which house it belongs to. You do not drive the cars. If too many pins stack, a timer starts, and a finished timer ends the city ([Mini Motorways Wiki](https://minimotorways.miraheze.org/wiki/Gameplay); [Dinosaur Polo Club](https://dinopoloclub.com/games/mini-motorways/)).

Put the **pin** to use. A task that is real and not yet on any route is a single pin shape on its building. The shape means "not on a route". The colour, if the pin has one, is the line it would join, which is identity, the only thing hue is allowed to mean. The street can glance it: a pin is not a moving bus and not the halo.

Leave the **timer** in the game. A countdown to "the city shuts down" is the same family as Frostpunk's lose bar, below. Mini Metro's pressure ring is already in this document as a stale-task warning, and Codex has already said a crowding word needs a written rule before it is allowed to look like failure. A pin does not grow a second ring. It waits. Connecting it to a route is an ordinary task edit in Tasks, and then the pin is gone because the stop exists.

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

**Validator, added to Claude's list rather than replacing it.**

| Notice | Level | Rule |
|--------|-------|------|
| `neglect_decay` | Error | Any street element changes because time-since-visit passed, with no event and no forecast update. Weeds, worn-away parks, a fallen rating, a shrunk skyline |
| `score_on_street` | Error | A total, a rating, hope, discontent, or a points count is drawn on the street or the Platform |
| `ceremony_for_deleted` | Error | A farewell ferry, plaque, or replay beat names or shows a record that is deleted now |
| `pin_countdown` | Error | An unrouted task grows a timer, a failing ring, or a game-over state |
| `overlay_left_on` | Warning | An info view is still drawn after the city returns to idle |

One golden day for this round: do not open the city for seven fictional days in which a project was archived, a task was deleted, and a session was logged. The catch-up plays the ferry and the session. It does not name the deleted task. The park is the same colour as on day one. No meter has moved.

#### New open questions from Cursor's round 4

- Should the farewell wait until Adam is at the city, or is it enough that the catch-up plays it the next time he looks?
- A bundle slot he named but never filled: after a year, does the room keep showing the gap, or does he have to abandon it himself for the gap to leave?
- Is "where I actually went" a stipple he would ever turn on, or is the travelled track on Lines already that view?
- The museum takes things he chooses to give. Should a finished chapter land on the studio shelf by itself, or only when he puts it there?

#### Cursor card ledger after round 4

| Card | Uses by Cursor | Uses left |
|------|----------------|-----------|
| Extend | 1 | 1 |
| Substitute | 1 | 1 |
| Combine | 1 | 1 |
| Adapt | 2 | 0 |
| Magnify | 1 | 1 |
| Put to another use | 2 | 0 |

## 8. Open questions

- Fixed map or does it expand as districts are added? How is the map laid out on first load? (Claude round 4: expands at its edges, never reflows its centre)
- How many vehicles before it gets noisy on a phone at 390px? (Cursor round 1: the phone lens is the departures board, so the fleet stays on the wide view)
- Is Life City a hub page of its own, or a mode of the Tasks Hub Lines view? (Cursor round 1: a lens on the same graph as Lines, Branch and Orbit)
- Tap interactions: does tapping a bus open the project, a stop open the task?
- Which agents become which services, and do they get uniforms? (First draft in round 1)
- How are archived or deleted items handled? (Repo rule: deleted means gone; archived could become landmarks)
- Sound? (Off by default. Cursor round 1: if it is ever on, it uses the Knowledge universe chimes preference, not a new city soundtrack)

## 9. Contributions log

- **2026-10-07, Claude:** Created this doc from the chat thought experiment with Adam.
- **2026-10-07, Claude Code:** Round 1 of the what if game (Extend + Adapt). Added section 7 with Harbour City, agent services, driverless lines, landmarks, vacant lots, the GTFS-shaped vocabulary and pressure rings. Renumbered Open questions to 8 and this log to 9.
- **2026-10-07, Cursor:** Round 1 of the what if game (Combine + Put to another use). Added one-graph-four-lenses (Lines, Branch, Orbit, the Day Dial and Harbour City share a GTFS-shaped snapshot) and the Knowledge sky as the concourse ceiling. Noted both in the architecture sketch and on three open questions.
- **2026-10-07, ChatGPT Codex:** Round 1 (Extend + Combine). Added usable interiors for current and future domains, separate product home and import states, and saved activities linking Travel, Writing and House records. Preserved both earlier rounds and the main concept. Recorded Codex card usage within the round.
- **2026-10-07, Claude Code:** Round 2 (Magnify + Put to another use). Corrected the city's weather to come from the capacity forecast (base table and round 1 table updated). Added the time scrubber (Rewind, Forecast with honest fog, the New Year's Eve and end-of-term replays) and the per-carriage occupancy train as a capacity display. Added a card ledger.
- **2026-10-07, Cursor:** Round 2 (Substitute + Adapt). Substituted daily city snapshots with a replay of the section 5 event log, so Rewind does not keep a second archive. Adapted Knowledge constellation placement for buildings Adam pins, and adapted the capacity forecast's uncertainty band so future haze is not Dense fog. Noted both on the architecture sketch.
- **2026-10-07, ChatGPT Codex:** Round 2 (Substitute + Put to another use). Added decision and focus views, refined the occupancy train against the capacity handoff, proposed preserving valued quiet places, and added a model table for comparing possible futures before promotion. Preserved all earlier contributions. Updated the Codex card ledger.
- **2026-10-07, Claude Code:** Round 3 (Combine + Adapt). Adopted Cursor's event-log Rewind and Codex's two-layer train. Combined five ideas into one planning layer (vacant lot, proposed, under construction, open, retired) and five phone ideas into the Platform screen. Adapted MobilityData's GTFS validator and the capacity forecast's one-number test into a Life City validator with traced rules and golden-day fixtures.
- **2026-10-07, Cursor:** Round 3 (Extend + Magnify). Extended the school-term prefs into a term edition of the same city, and kept a booked trip distinct from a dream. Magnified a single open door for the next decision, with the rest counted at the depot. Noted the edition on the architecture sketch.
- **2026-10-07, ChatGPT Codex:** Round 3 (Adapt + Magnify). Added guided walks through linked records and an Idea Exchange for source grounded teaching and writing proposals, small experiments and curated outcome exhibitions. Preserved all earlier contributions and updated the Codex card ledger, with each card now used once.
- **2026-10-07, Claude Code:** Round 4 (Substitute + Magnify). Proposed the glance test (street versus room). Substituted the visit model with calm technology (Home tile, station clock, idle default) and a perceptual channel budget, including an audit of colour overload across all rounds. Magnified change over state: a "Since you were last here" replay grounded in change blindness research, and a never-reflow layout grounded in mental map research. Added three validator rules and a smallest testable slice.
- **2026-10-07, Cursor:** Round 4 (Put to another use + Adapt). Brought in simulation-game rituals that keep a life (Spiritfarer's farewell, Stardew's bundles, Animal Crossing's museum, Mini Motorways' pin) and refused the ones that punish absence (Frostpunk's meters, worn-away grass, the Motorways timer, Stardew's gold vault). Adapted Skylines info views, RCT thought summaries and Dorfromantik's no-penalty quests so they obey the glance test and the channel budget.
