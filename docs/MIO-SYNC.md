# Mio sync (on request)

Life Hub offers saved Mio places on journeys Adam is already making (Day dial → **On the way**).
Mio's connector belongs to Claude, not to the Life Hub server, so the cache is refreshed **only when
Adam asks** ("sync Mio") in a Claude session that has both the Mio connector and push access to
`adamrussell91-hash/life-hub-data`. There is no scheduled AI job.

Mio stays the source of truth. The cache holds only the Sydney candidates the calendar can use,
never the whole library.

## Files (repo root of `life-hub-data`)

| File | Written by | Holds |
|------|-----------|-------|
| `mio-wanted.json` | The 05:30 sweep (deterministic, no AI), only when it changes | `{ generated_at, from, to, areas: [{ area, dates }] }`: suburbs of the next two weeks' located commitments |
| `mio-candidates.json` | The Claude sync below | `{ synced_at, source: "mio", places: [...] }` |

Each place:

```json
{
  "id": "<Mio save id>",
  "name": "Cow & The Moon",
  "category": "cafe",
  "area": "enmore",
  "address": "181 Enmore Rd, Enmore NSW 2042",
  "rating": 4.6,
  "creator": "@fullfill23",
  "why": "one short line from Why go / Must try",
  "hours": { "0": [[8.5, 22]], "1": [[8.5, 22]] }
}
```

`area` is the suburb, lowercased. `hours` is keyed by weekday (Sunday = 0) as `[open, close]` in
hours; a close after midnight goes past 24. Leave `hours` out when it is unknown. The dial then says
"hours not checked yet" and never assumes the place is open. Everything else is optional, and only
these fields survive `parseCandidates` (`packages/design-kit/js/calendar/mio-model.js`).

## Steps for the Claude session

1. Read `mio-wanted.json` from `life-hub-data` (if it is missing, skip the hours step).
2. `find_places` with `source: "my_saves"`, `city: "Sydney"`, `escalate: false`, split by
   `category` (restaurant, cafe, bar, shop, attraction) so each call stays under 100 results.
   Skip `accommodation` and `other`. Mio returns at most 100 per call: restaurants (124 at the first
   sync) need a second pass by `city` (for example Parramatta, Newtown, Marrickville), merged by save id.
   Saves with no suburb (street only, such as "334 Parramatta Rd") are dropped unless the detail call
   gives one.
3. For every save whose suburb is in `mio-wanted.json` `areas`, call `find_places` with
   `source: "detail"` and copy the address, the opening hours (convert with `parseHours` in
   `mio-model.js`, or by hand), and one short "why" line. Cap: 40 detail calls per sync.
4. Write `mio-candidates.json` (previous hours for places not refreshed may be kept), and commit it
   to `life-hub-data` `main` with `chore(mio): sync N places (M with hours)`.
5. Life Hub picks it up within 30 minutes (server cache), with no deploy.

Do not add saves, change collections or plan trips in Mio during a sync. It only reads.
