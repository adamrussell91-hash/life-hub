# Travel v1 progress

Progress: 48/59 (81%)

Branch: `cursor/travel-v1-2710` (cloud agent naming; brief asked for `travel/v1`)

## M0: Scaffold (TR-01 … TR-08)

- [x] TR-01 Create `apps/travel` from Professional skeleton — SHA on branch
- [x] TR-02 Register SPA in root build scripts
- [x] TR-03 Auth gate
- [x] TR-04 Hash router
- [x] TR-05 API client and config (W1)
- [x] TR-06 Travel chrome (rail + phone bar)
- [x] TR-07 Life rail, More sheet, Future map Trips card
- [x] TR-08 Invented fixture trip

## M1: Server (TR-10 … TR-19)

- [x] TR-10 travel-schema.mjs
- [x] TR-11 travel-repository.mjs
- [x] TR-12 travel-trips / travel-trip
- [x] TR-13 travel-items + money conversion
- [x] TR-14 travel-checkins
- [x] TR-15 travel-share / travel-public / travel-redact
- [x] TR-16 travel-places (Photon)
- [x] TR-17 travel-rates (Frankfurter)
- [x] TR-18 travel-parse (Anthropic)
- [x] TR-19 Rate limit places + parse

## M2: Adam's real trip (TR-20 … TR-22)

- [ ] TR-20 Schema test against LIFE_HUB_DATA_DIR — **blocked**: ScotRail train `itm_3egqugyjf7jp` has `number: ""`; schema requires ticket number. Asking Adam (do not loosen schema / do not edit private file).
- [x] TR-21 Import a trip on empty list
- [ ] TR-22 Deploy preview shows real trip (needs merge + deploy)

## M3: Trip page (TR-23 … TR-27)

- [x] TR-23 World route map
- [x] TR-24 World map zoom
- [x] TR-25 City chips + selected state
- [x] TR-26 Still to book
- [x] TR-27 Scene header + live clock

## M4: Day view (TR-28 … TR-29, TR-38 … TR-43)

- [x] TR-38 Day tabs + day list
- [x] TR-39 Tickets animation (CSS fly 4.5s / train 6s; reduced-motion stops)
- [x] TR-40 Arrival guide
- [x] TR-41 Check-in slots / dual clocks
- [x] TR-42 Day map MapLibre
- [x] TR-43 Full-screen + cooperative gestures
- [x] TR-28 Take me home
- [x] TR-29 Where am I?

## M5: Adding and editing (TR-30 … TR-37)

- [x] TR-30 Form open / edit / remove
- [x] TR-31 Type segment + field visibility
- [x] TR-32 Day picker
- [x] TR-33 Where search + pick on map — search live; pick-on-map still drops at city centre (Deviation)
- [x] TR-34 Hop section
- [x] TR-35 Cost and currency
- [x] TR-36 Status, booking ref, private, stay fields
- [x] TR-37 Paste confirmation email

## M6: On the road (TR-44 … TR-47)

- [x] TR-44 Today view
- [x] TR-45 I'm safe
- [x] TR-46 Tell Penelope — Travel writes `lifehub.travel.penelope`; Life Mind consumes + prefills Penelope (context in composer text)
- [ ] TR-47 Diary marker — not wired to Mind diary API yet

## M7: Public link (TR-50 … TR-53)

- [x] TR-50 Public path `/travel/t/<token>`
- [x] TR-51 Public link sheet
- [x] TR-52 no-store on `/api/travel-public`
- [x] TR-53 robots noindex meta on public path + `robots.txt` Disallow `/travel/t/`

## M8: Offline (TR-54 … TR-58)

- [x] TR-54 Service worker (basic)
- [x] TR-55 Offline banner + queued check-in message (no durable IndexedDB replay yet — Deviation)
- [ ] TR-56 Save city tiles
- [ ] TR-57 Offline badge + remove
- [ ] TR-58 Today offline (beyond shared banner)

## M9: Finish (TR-59 … TR-62)

- [x] TR-59 New trip + import; add-city form incomplete (generic scene + palette exist)
- [x] TR-60 Trips list
- [ ] TR-61 Accessibility audit incomplete
- [ ] TR-62 Acceptance run on live umbrella (post-deploy)

## Discovered

- Adam's private trip has ScotRail `number: ""` — TR-20 fails until Adam decides (fill a value in life-hub-data, or allow empty train numbers in schema).
- TypeScript 5.9 discriminated-union narrowing quirk documented earlier for `itemPlace`.

## Deviations

- Branch name `cursor/travel-v1-2710` vs brief `travel/v1`.
- TR-33 pick-on-map is a city-centre stub, not interactive map click.
- TR-46: context put in prefilled composer text (Mind path has no separate hidden-context hook).
- TR-55: offline check-in is a message fallback, not IndexedDB queue + replay.
- TR-56/57/58 city tile offline pack not built.
- TR-59 add-city UI incomplete.
- Diff vs mockup lines not filled per UI item (P1) — acceptance screenshots deferred to deploy.

## Diff vs mockup

- TR-06 / TR-23–27 / TR-38–43: functional Tideline port; pixel parity vs mockup not screenshot-verified in this pass (P1 / TR-62 deferred to live umbrella).
