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
- **Renderer:** PixiJS (2D) first

### Who builds what

- **Cursor:** back end, data wiring, city events contract
- **ChatGPT / Codex:** renderer, animation, asset pipeline (Codex writes code; artwork comes from Kenney or an image model)
- Both build to the city events contract above so they cannot drift apart

## 6. Prototype

A rough chat prototype (code-drawn SVG, not Kenney art) proved the feel: an isometric grid with glass towers around a central interchange, a park and fountain, a harbour with bridge and ferry, and a bus, tram and car moving along roads. An earlier flat transit-map version showed a "drop a life wall" button rerouting a bus around a closure. Neither is production code.

## 7. Open questions

- Fixed map or does it expand as districts are added? How is the map laid out on first load?
- How many vehicles before it gets noisy on a phone at 390px?
- Is Life City a hub page of its own, or a mode of the Tasks Hub Lines view?
- Tap interactions: does tapping a bus open the project, a stop open the task?
- Which agents become which services, and do they get uniforms?
- How are archived or deleted items handled? (Repo rule: deleted means gone; archived could become landmarks)
- Sound? (Off by default, presumably)

## 8. Contributions log

- **2026-10-07, Claude:** Created this doc from the chat thought experiment with Adam.
