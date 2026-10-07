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
| Weather | Mind check-ins, sunny to overcast |
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
  - `city.weather` (Mind), `city.clock` (real time, term rhythm)
- **Layout engine:** deterministic placement, so a project's route stays in the same place between visits
- **One graph, four lenses:** Tasks Lines, Branch, Orbit and Harbour City read one snapshot of that graph. The city does not keep a second copy of what is done, blocked or due. Proposal in Cursor's round 1 below.
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
| Dr Vera Lenz | Psychology | The weather station and lighthouse on the headland | Lighthouse | Mind check-ins drive the city's weather; the lighthouse beam sweeps when a check-in is due |
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
