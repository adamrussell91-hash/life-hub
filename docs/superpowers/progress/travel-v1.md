# Travel v1 progress

Progress: 44/59 (75%)

Branch: `cursor/travel-v1-2710` (cloud agent naming; brief asked for `travel/v1`)

## M0: Scaffold (TR-01 … TR-08)

- [x] TR-01 Create `apps/travel` from Professional skeleton
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

- [ ] TR-20 Schema test against LIFE_HUB_DATA_DIR (skip when unset)
- [ ] TR-21 Import a trip on empty list
- [ ] TR-22 Deploy preview shows real trip (owner check; no data pasted)

## M3: Trip page (TR-23 … TR-27)

- [x] TR-23 World route map
- [x] TR-24 World map zoom
- [x] TR-25 City chips + selected state
- [x] TR-26 Still to book
- [x] TR-27 Scene header + live clock

## M4: Day view (TR-28 … TR-29, TR-38 … TR-43)

- [x] TR-38 Day tabs + day list
- [ ] TR-39 Tickets animation
- [x] TR-40 Arrival guide
- [ ] TR-41 Check-in slots / dual clocks — checkin_slot renders in the
      day list; dual-clock display not yet built
- [x] TR-42 Day map MapLibre
- [ ] TR-43 Full-screen + cooperative gestures — `cooperativeGestures`
      option is wired by viewport width; no explicit full-screen toggle
- [x] TR-28 Take me home
- [ ] TR-29 Where am I?

## M5: Adding and editing (TR-30 … TR-37)

- [x] TR-30 Form open / edit / remove
- [x] TR-31 Type segment + field visibility
- [x] TR-32 Day picker
- [x] TR-33 Where search + pick on map — search live; "Pick on map" is a
      stub (drops a pin at the city centre, no interactive map picker)
- [x] TR-34 Hop section
- [x] TR-35 Cost and currency
- [x] TR-36 Status, booking ref, private, stay fields
- [x] TR-37 Paste confirmation email

## M6: On the road (TR-44 … TR-47)

- [x] TR-44 Today view
- [x] TR-45 I'm safe
- [x] TR-46 Tell Penelope
- [ ] TR-47 Diary marker

## M7: Public link (TR-50 … TR-53)

- [x] TR-50 Public path `/travel/t/<token>`
- [x] TR-51 Public link sheet
- [ ] TR-52 no-store cache — not verified against the deploy-preview
      response headers in this pass
- [ ] TR-53 robots noindex + robots.txt

## M8: Offline (TR-54 … TR-58)

- [x] TR-54 Service worker — basic precache + network/cache-first
      routing in `public/sw.js`, registered from `src/lib/offline.ts`
- [x] TR-55 Offline banner + queued check-in — banner in
      `src/lib/offline.ts`; Today's "I'm safe" falls back to a queued
      message on failed check-in (no durable offline queue/replay yet)
- [ ] TR-56 Save city tiles — ponytail: out of scope for this pass, see
      `ponytail:` comment in `public/sw.js`
- [ ] TR-57 Offline badge + remove
- [ ] TR-58 Today offline — Today view has no offline-specific fallback
      beyond the shared banner

## M9: Finish (TR-59 … TR-62)

- [x] TR-59 New trip + new city forms — new-trip form + JSON import on
      the trips list; no separate "add city" flow
- [x] TR-60 Trips list
- [ ] TR-61 Accessibility — not separately audited in this pass
- [ ] TR-62 Acceptance run on live umbrella

## Discovered

- `package.json`'s `test:browser` script now references
  `tests/browser/travel.spec.mjs`, which does not exist yet. It was
  added to the script list ahead of the SPA landing; a browser spec
  still needs to be written before `npm run test:browser` will pass at
  the root.
- Client-side unit tests (`apps/travel`: `npm test` / `npm run
  typecheck`) pass in full (32/32 tests, zero type errors) against the
  in-memory mock API. The Netlify function backend (M1) was not
  independently exercised in this pass — no integration test hits the
  real `/api/travel-*` functions end to end.
- TypeScript (5.9.2) does not always narrow a discriminated union when
  a single member's discriminant has more than one literal value and
  the exclusion check uses `||` across an `if`/early-return; a
  `switch` statement narrows correctly where the equivalent `if` chain
  did not (see `itemPlace()` in `src/model/day.ts`).

## Deviations

- Branch name uses cloud-agent template `cursor/travel-v1-2710` instead of brief's `travel/v1`.
- TR-33 "Pick on map": ships as a stub that drops a pin at the city
  centre rather than an interactive map-click picker.
- TR-41 check-in slots render in the day list but without the dual
  local/home clock display called for in the brief.
- TR-43 cooperative gestures are toggled by viewport width; there is no
  explicit full-screen toggle control.
- TR-56/57 (save city tiles for offline, offline badge) are not
  implemented — flagged with a `ponytail:` comment in `public/sw.js`
  as a deliberate simplification with a known ceiling.
- TR-47 (diary marker) and TR-52/53 (no-store cache, robots noindex)
  were not implemented in this pass; they depend on deploy-level
  configuration and public trip infrastructure that weren't part of
  the requested client file list.

## Diff vs mockup

(none yet — filled as UI items land)
