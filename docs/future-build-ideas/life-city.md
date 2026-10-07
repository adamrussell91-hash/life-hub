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


## 8. Open questions

- Fixed map or does it expand as districts are added? How is the map laid out on first load?
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
