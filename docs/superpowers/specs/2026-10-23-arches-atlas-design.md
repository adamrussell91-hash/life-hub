# Arches Atlas: design

Date: 23 October 2026
Status: approved 23 October 2026; built on this branch

## What it is

A campy, 90s-style extra in the Travel journal for logging McDonald's items eaten around the world. It collects local exclusives, compares classics against home, fills a sticker sheet of countries, and keeps a personal Big Mac index in Australian dollars.

Maccas never appears in the Food journal's normal pages. The Food journal only has a hidden door into the Atlas.

Concept canvas (private): https://claude.ai/artifact/VNo343obfcLueH3hT6WNxD. The chosen look is artboard **D2 · Clamshell + 1999 poster**.

## Scope

In:

1. An Atlas page in the Travel app, in three tabs: Menu, Stickers, Index.
2. A "Maccas run" switch on the Travel moment meal sheet.
3. Stickers worked out from logged countries.
4. A Big Mac index in AUD, using the existing `/api/travel-rates`.
5. Logo and artwork assets read from the private data repository.
6. A hidden door from the Food journal to the Atlas.
7. A badge on each trip page counting that trip's Maccas items.

Out: a before-you-go wishlist, scraping menus from the web, menu-board photo reading, animation.

## Look (from D2)

- Ground: warm orange-to-yellow, with red Happy Meal-box shapes behind the content.
- Headline: bubbly blue lettering with a white outline and a navy drop shadow (Chewy). A tilted blue-and-yellow "NEW!" badge. Condensed white outlined lettering for subtitles (Anton).
- Item tiles: foam clamshell lids in mustard yellow, with a moulded inner rim. The item name is in heavy red slab-serif capitals (Alfa Slab One), with small red detail lines for contents, place and date.
- Exclusives carry an "ONLY HERE!" badge. Classics carry a pill: "▲ BETTER THAN HOME", "= SAME AS HOME" or "▼ WORSE THAN HOME".
- Stickers: glossy round stickers on a red card, with dashed "?" spaces still to fill.
- Mascot: an original passport character on wheels with a speech bubble.
- Real logos come only from the private assets (below). The page must render well with the logo slots empty.
- Mobile first (390px), and it must also work on desktop. Touch targets are at least 44px. Text contrast is at least 4.5:1, so red text sits on mustard only at the large sizes, and small detail lines use the darker red `#A3141A`.

## Logging

On the Travel moment meal sheet (`apps/travel/src/journal/meal-section.ts`), there is a new **Maccas run** switch next to the meal switch. Only one of the two can be on.

With Maccas run on, the sheet shows one row per item:

| Field | Notes |
|---|---|
| Name | required, e.g. "Ebi Filet-O" |
| Kind | `exclusive` or `classic` |
| Price | a number plus a currency. The currency defaults to the trip's currency for the moment's country |
| Rating | 1–5 in halves, optional |
| Vs home | classics only: `better`, `same` or `worse`, optional |
| Big Mac | a tick: "this is my Big Mac for the index". It defaults to on when the name is "Big Mac" |
| Note | optional, short |

The country, city, place, date and photos come from the moment. Nothing is written to the Food journal. If a moment was a Food journal meal and is switched to Maccas run, the sheet asks before removing the linked Food visit. The existing delete path keeps that recoverable.

## Data

Atlas items are stored alongside the Travel journal data, not the Food journal data. Each record is:

```json
{
  "id": "maccas_…",
  "trip_id": "…",
  "moment_id": "…",
  "country": "JP",
  "city": "Osaka",
  "date": "2026-11-18",
  "name": "Teriyaki McBurger",
  "kind": "exclusive",
  "price": { "amount": 400, "currency": "JPY" },
  "aud": { "amount": 4.12, "rate": 0.0103, "as_of": "2026-11-18" },
  "big_mac": false,
  "rating": 4,
  "vs_home": null,
  "note": "",
  "photo_ids": ["…"]
}
```

- `aud` is filled at save time from `/api/travel-rates` and never recalculated, so old entries don't drift. If the rate fetch fails, the item still saves with `aud: null`, and the next save of that moment tries again.
- Records use the same soft-delete liveness as the rest of the Travel journal (`record-liveness`).
- Home baseline: one setting, `home_big_mac_aud`, edited from the Index tab.
- Stickers are not stored. A country has a sticker once it has at least one live item. The sticker date is the earliest item date in that country.

## Private assets

Logos and artwork live in private `adamrussell91-hash/life-hub-data` on `main`, under `assets/arches-atlas/`, with a `manifest.json` that maps slot names (`badge`, `header`, `sticker-frame`, …) to files.

- A new Travel operator function, `/api/travel-atlas-asset?slot=…`, reads the manifest and file with the same token and repository settings as `_shared/private-data-file.mjs`. It returns the image bytes with `PRIVATE_CACHE` headers and only accepts slot names listed in the manifest.
- The function only answers signed-in operator requests, like the other Travel functions.
- No logo or third-party artwork is ever committed to `life-hub`, used in tests, screenshots or fixtures, or bundled into public build assets. Tests use plain placeholder images.

## Entry points

- **Travel:** a route for the Atlas page. Each trip page shows a small badge ("3 Maccas this trip") when that trip has items, linking to the Atlas filtered to that trip.
- **Food journal hidden door:** typing "maccas" into Food journal search, or long-pressing the journal's masthead, opens the Atlas. Nothing else in the Food journal mentions it.

## Atlas page

- **Menu tab:** country chips (most recent first), then the clamshell tiles for that country: exclusives first, then classics. Each country has a Big Mac strip ("A$4.90 here · A$3.10 cheaper than home").
- **Stickers tab:** the full sticker sheet. Home (AU) is always shown. Each earned country is a glossy sticker with its month and year.
- **Index tab:** one bar per country with a Big Mac price in AUD, plus a dashed line for home. A country with no Big Mac but a ticked stand-in (e.g. the Maharaja Mac) shows that item's name under its bar.
- **Empty state:** the mascot says "Your first Maccas run goes here!"

## Errors

- Asset function down or a slot missing: the logo slot falls back to the drawn mascot and badge with no broken image.
- Offline: Maccas items queue through the existing journal offline outbox like other moment edits.
- Rate unavailable: covered under Data.

## Testing

- Unit: record validation (schema), the AUD conversion snapshot at save, sticker derivation, Big Mac index ordering and stand-ins, the asset function's slot allowlist and auth refusal, and the rule that a Maccas run never writes to the Food journal.
- Browser: log an item from a moment, see it on the Menu tab, see the sticker appear, and check the Index bar, at 390px and desktop. Also open the Atlas from Food journal search.
- `npm run pre-pr-check` passes before the PR.

## Open choices (defaults picked; change them if wrong)

- The hidden door supports both search and long-press.
- The Atlas filtered to a trip uses the same page, not a separate view.
- The trip badge is shown only when the trip has at least one item.
