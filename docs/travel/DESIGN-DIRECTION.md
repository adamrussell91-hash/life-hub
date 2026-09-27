# Travel: design direction

27 September 2026. This replaces the direction in `docs/Life_Hub_Travel_Conversation_and_Design_Brief.md` (PR #527). That brief stays as the research record.

Mockup: `docs/mockups/travel/travel-daylight.html`, built on the real Notion bookings.

## What the ChatGPT brief missed

1. It designed only the booked first four days. Most of the 41-day trip (1 Dec 2026 to 10 Jan 2027) is still unbooked, so planning is the main job until December.
2. On 23 December the trip changes from solo to a honeymoon with Corey, and the brief never accounted for that.
3. Its skyline artwork was generic. Adam called every version bland.
4. It trusted the Notion overview, which has drifted from the bookings. Bookings are the truth, and the planner shows where plans disagree with them.

## Decisions (Adam, 27 Sep)

| Question | Decision |
|----------|----------|
| Place in Life Hub | Under **Future map** in the Life rail |
| Source of truth | Import the trip from Notion once, then finish and run it in Life Hub |
| Route change | Shanghai is dropped. **Rome** replaces it (London → Rome → Seoul, land by 23 Dec) |
| Edinburgh booking | Booked for 2 adults by mistake. Adam travels alone until Seoul |
| Corey | Watches the trip until 23 Dec, then travels with Adam in Seoul |
| Bob | Watches the whole trip, including Korea. Check-ins never switch off |
| Stelara | A dose is due on day 1 or 2 in Korea. This is an open problem the planner tracks |
| Diary | Penelope is built into each day, so the trip gets documented into the diary as it happens |
| Soft landings | Must cover getting the phone connected, how public transport works, and money |

## The organising idea: the trip as daylight

The trip is one strip of days. Each day's column is lit from local sunrise to sunset, midnight to midnight. Booked days are solid and unbooked days are hatched. The strip moves from 12 hours of light in KL to 7 hours in Fort William, and 21 Dec (the solstice) falls in Rome. Under the strip, one line shows who is watching: Bob for the whole trip, and Corey as a watcher and then as a companion.

Tapping a day jumps to that day in the itinerary below.

## Parts of the page

- **Still open**: the unbooked stretches, deadlines, entry paperwork and health items, ordered by what goes wrong first.
- **Day flow**: tickets, stays, ideas, costs and documents sit inside each day. There are no separate Budget or Documents tabs.
- **Soft landing**: every arrival shows phone, getting in, money, where to wait if the room isn't ready, and what the weather will feel like.
- **Two-clock check-ins**: each check-in shows local time and Sydney time, and only falls where both are awake (Istanbul at breakfast, London at 21:00).
- **Penelope each night**: one question about the day, following `config/penelope-protocol.md` (no rating scales). She drafts the entry in Adam's voice, he confirms, and it files to the diary and pins to the day.
- **On the day**: a "now" card with the next steps, an "I'm safe" check-in, and "Something broke".
- **Bob's view**: a revocable link that needs no login. All times are in Bob's time. It shows the last confirmed check-in, where Adam should be, the next check-in, and what to do if one is missed. It never shows booking codes, costs, health details or the diary.

## Build order

1. Before 1 Dec (aim for mid-November): Notion import, the strip, Still open, day flow, soft landings, two-clock check-ins, Penelope prompts, the offline phone view, and Bob's view.
2. After departure: the "Something broke" assistant, and the replay of the trip afterwards.

## Open

- Stelara: Corey brings it from Sydney in a cool bag (recommended), Adam carries it for 3 weeks, or Dr Keily moves the dose.
- Entry checks: UK ETA; EU EES and ETIAS for Rome; whether Korea's K-ETA still exempts Australians in Dec 2026.
- Where Bob's view is hosted: token link on the umbrella, following the pattern of the public student URLs.
