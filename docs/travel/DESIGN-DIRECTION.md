# Travel: design direction

27 September 2026. This replaces the direction in `docs/Life_Hub_Travel_Conversation_and_Design_Brief.md` (PR #527). That brief stays as the research record.

Mockup: `docs/mockups/travel/travel-planner.html`, built on the real Notion bookings.

## Adam's rules

1. **Maps feature a lot.** Every day has a map with numbered stops, the route between them and how long each hop takes. Adam will get lost, so every city has **Take me home**: the hotel address in the local language, a line to show a driver, and directions.
2. **Travel theming with whimsy.** When you're flying there's a plane flying. On a train, a train chugs along the line saying choo choo. Each city gets its own illustrated, animated scene and colour: KL's Petronas Towers and a Grab scooter, the Istanbul ferry and gulls, the Glenfinnan viaduct with a train and a Highland cow, a London bus, a Rome Vespa, Seoul snow.
3. **A real itinerary, not a paragraph of ideas.** Each day is timed stops you can follow: where, when, how to get to the next one, and what it costs.
4. **One currency.** Prices show in AUD. The local currency only appears in soft-landing money tips ("RM10 is about A$3.50").
5. **No separate trusted-contact view.** There is one public link. It shows the route, city, day plans and last check-in, and hides booking codes, costs, health details and the diary. It can be turned off.

Rejected in this round: the daylight strip ("am I a beaver?") and the "Bob's view" mode.

## Decisions (Adam, 27 Sep)

| Question | Decision |
|----------|----------|
| Place in Life Hub | Under **Future map** in the Life rail |
| Source of truth | Import the trip from Notion once, then finish and run it in Life Hub |
| Route | Sydney → KL → Istanbul → Scotland → London → **Rome** (Shanghai dropped) → Seoul |
| Edinburgh booking | Booked for 2 adults by mistake. Adam travels alone until Seoul |
| Corey | Meets Adam in Seoul |
| Bob | Follows along through the public link |
| Stelara | A dose is due on day 1 or 2 in Korea. It shows as a private stop on that day |
| Diary | Penelope asks one question at the end of each day and files the entry to that day |
| Soft landings | Every arrival covers phone and eSIM, how transport works, money, and what the weather feels like |

## Page structure

1. **Route map**: a world map with the whole route. A plane flies each flight leg and a train runs the rail legs. Booked legs are solid and unbooked legs are dotted. Tap a city to open it.
2. **City chips** and a **Still to book** list.
3. **City**:
   - an animated scene with a title (Kuala-ering, Not Constantinople, Choo choo Highlands, Mind the gap, When in Rome, Seoul mates)
   - live local time, weather and money facts
   - day tabs
4. **Day**: timed stops beside a map.
   - Each stop has its pin, a Directions link (Naver Map in Korea), and the price in A$.
   - Between stops is the hop: walk, train, tram, ferry or taxi, with minutes and cost.
   - Tickets appear inline with a moving plane or train.
   - The map has **Take me home** and a **Where am I?** preview.

## Production notes

- Maps: real vector tiles (MapLibre with OpenStreetMap data) with offline download per city. Shanghai is gone, but Korea still needs a Naver or Kakao hand-off for walking directions.
- Scenes: authored SVG per city, animation off for reduced motion.
- Exchange rates: live rate at booking time, stored with the booking.

## Build order

1. Before 1 Dec (aim for mid-November): Notion import, route map, city scenes, day maps with stops, soft landings, take-me-home, check-ins, Penelope prompts, offline phone view, and the public link.
2. After departure: the "Something broke" assistant, and the replay of the trip afterwards.

## Open

- Stelara: Corey brings it from Sydney in a cool bag (recommended), Adam carries it for 3 weeks, or Dr Keily moves the dose.
- Entry checks: UK ETA; EU EES and ETIAS for Rome; whether Korea's K-ETA still exempts Australians in Dec 2026.
- Rome dates are a guess (20–22 Dec, overnight to Seoul).
