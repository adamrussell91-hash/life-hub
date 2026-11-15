# Travel journal slice 4: the journal notices things

Date: 14/11/26. Follows `2026-11-14-travel-journal-redesign-design.md`, which outlined this slice. Adam chose to build it before slice 3 (map and Relive), because it only works during a trip.

What was already decided there, and still holds:

- It happens **during the trip**. The feeling is "I'd forgotten that". The model is a year-in-review, one thing per card.
- The journal **notices**; it does not write the journal.
- Sources: this trip, past trips, the photos themselves, and the rest of Life Hub. The bucket list and the dreams jar in Tasks are named sources.
- Wording is warm and plain. "You have wanted this since 2024", never "You asked for this".
- A noticing with nothing to show for it is not shown.
- Ticking something off in Tasks happens only when Adam taps to do it.

Adam confirmed two new choices on 14/11/26: the diary is a source, matched by exact words only and never sent to a model; and the wishes and photos requests both run automatically each evening of the trip. Books are matched by title only, the cautious default, which he has not been asked to change.

## What a noticing is

One short card that says one true thing about the trip, shows what it is based on, and names where it came from.

Every card has four parts:

| Part | Example |
| --- | --- |
| Source line | "From your past trips" · "From your bucket list" · "Seen in today's photos" |
| Headline | "A year ago today you were in Porto" |
| Evidence | Photos, a number, a date, or the line from Tasks. Always something that can be checked by looking |
| Basis | One small line: "Journals from 3 trips, 2024 to 2026" · "Added to your bucket list on 14 March 2024" |

Cards made with a model's help say so in the source line ("Claude noticed in today's photos"). Cards worked out by counting never mention a model, because none was used.

## The cards

### Worked out exactly, with no model

From this trip:

| Card | Rule | Evidence |
| --- | --- | --- |
| New country | The trip's current country appears in no earlier trip in Life Hub. The card says "new to your journal", never "your first time", because the journal only knows the trips recorded here | The count of countries journaled |
| Back again | The current city appears in an earlier trip | "Last here in March 2025", with a photo from then |
| Biggest day | Today has more photos than any other day of this trip (from day 3 on) | The count and three of the photos |
| Earliest start, latest finish | Today's first moment is the earliest of the trip, or its last is the latest | The time and that moment's photo |
| Furthest point | Today's moments reach further north or south than any journal before, with at least three located days to beat. East and west are left out: across the date line "furthest east" has no honest meaning | The place name and the earlier record it beats |
| Halfway | The middle day of the trip | Days, cities, photos and keepsakes so far |

From past trips:

| Card | Rule | Evidence |
| --- | --- | --- |
| On this day | The same calendar date in an earlier journal has photos | The city, the year and up to three photos from that day |
| Longest trip | Today the trip becomes longer than any before it | Both lengths in days |
| Most photographed city | This city passes the previous most photographed city | Both counts |

From the food journal:

| Card | Rule | Evidence |
| --- | --- | --- |
| Best thing so far | A dish rated higher than every other dish on this trip (needs three rated dishes) | The dish, the place, the rating |
| Order again | First day in a city where a dish was marked "order again" before the trip, at a place within 25 km of the city's centre (the food journal records no city, only a pin) | The dish, the place, the date |

From the diary. Confirmed 14/11/26: exact words only.

| Card | Rule | Evidence |
| --- | --- | --- |
| You wrote about this | Not built. Finding the first entry that names a city means opening every diary file on each request, hundreds of reads. It needs an index of the diary first, which is separate work | |
| A year ago in your diary | A diary entry on this date one to three years ago. The server opens only those files | The date, the mood word and one highlight line, exactly as written |

### Matched with a model's help

**Bucket list and dreams jar.** The heart of this slice.

- The server reads the open Someday items in Tasks whose kind is `bucket_list` or `dreams_jar`, with their titles and the date each was added.
- Once a day of the trip, it gives a model those titles beside today's itinerary items, moment places and moment words, and asks which wishes today fulfils.
- The model must point at the exact itinerary item or moment that fulfils each one. A match with no such pointer is thrown away by the server, not by the model.
- The card reads, for an invented wish: "Ride a night train. You have wanted this since 2024." Under it, the evidence: the itinerary item or moment it matched, in Adam's own words.
- The card offers **Tick it off in Tasks**. Tapping it marks that Someday item done, and the card stays in the story marked "Ticked off in Tasks". Nothing is written to Tasks before that tap. Tasks has no field for a link back to the moment, so none is written.
- A wish card is not used up by being looked at. It waits until it is ticked off or turned down.
- It also offers **Not this one**, which stops that pairing being offered again.

**Seen in the photos.**

- Once a day of the trip, when the day has at least six photos, the server sends small copies (320px) of that day's photos to a model and asks for at most two things a person would enjoy having pointed out: something repeated, a colour that runs through the day, the same thing photographed at different times.
- Each answer must list the photos it is about. The card shows those photos, so the claim can be checked at a glance.
- An answer about a person's looks, body, health or identity is dropped. The prompt forbids it and the server checks for it.

**Books.** Title matches only.

- Exact only: a book on the shelf whose title names this city or country. Rare, but never wrong.
- Not built: asking a model which books are "set in" a place. The shelf does not record settings, so the card would rest on the model's memory of the book and nothing Adam could check.

## Where the cards appear

- **A pill on the story.** When there are cards Adam has not seen, a pill sits under the cover: "3 things noticed today". With none, there is no pill and no empty state (register P4).
- **The cards.** Tapping the pill opens the cards full screen, one at a time. Tap or swipe to move on. A row of marks at the top shows how many there are. Back, Escape and a close button all leave.
- **At most five a day**, best first. A card is never shown twice.
- **Each card has two actions.**
  - **Keep in the story** pins it beside the moment or day it is about, as a small band: the headline, the source line and its evidence. It can be removed there.
  - **Not right** removes it and stops that noticing being made again.
- **After the trip**, kept cards stay in the story. Nothing new is made.

## How it is worked out

- **Counting cards** are computed on the phone, by plain functions, from the journal in hand plus a compact history the server returns: for each earlier trip, its dates, cities and countries, and for each day its photo count, first and last moment times, extreme coordinates and up to three photo ids.
- **Model cards** are made on the server, once per trip day, the first time the journal is opened after 5 pm local time in the trip's current city (or the next morning). The server stores nothing and changes nothing: it returns the cards, and the phone keeps them in the journal with the days already asked about, so opening the journal again costs nothing.
- **Stored in the journal** under `preferences.journal_noticing_v1`: the cards made so far, which were seen, kept or marked not right, and the days already checked. Preferences never leave in a shared journal. Export keeps them, as it keeps keepsakes.
- **The model** is the small, fast one the food journal already uses for menus. Each day's request is a few dozen short lines of text, or a few dozen 320px images.
- **Limits.** One wishes request and one photos request per trip day. A day's request that fails is tried once more on the next open, then left. A failed request shows no error: a missing noticing is not the reader's problem.

## What is sent where

Stated plainly, because some of this is private.

| Data | Leaves the phone? | Goes to a model? |
| --- | --- | --- |
| Journal, past journals, food journal | Already on Life Hub's server | No |
| Bucket list and dreams jar titles, with today's itinerary titles, place names and moment words | Already on the server | Yes, once a day of the trip |
| Today's photos, as 320px copies | Already on the server | Yes, once a day with six or more photos |
| Diary highlights | Already on the server | **No.** Matched by exact words only |
| Bookshelf titles | Already on the server | No |

## New server pieces

| File | Job |
| --- | --- |
| `netlify/functions/travel-noticing.mjs` | `GET`: the compact history, food facts, and (if confirmed) diary and shelf matches for one trip. `POST`: run today's wishes and photos requests, store and return the cards |
| `_shared/travel-noticing-history.mjs` | Builds the compact history from every journal and trip |
| `_shared/travel-noticing-wishes.mjs` | Reads Someday items from the Tasks store, builds the request, checks every match points at a real item or moment |
| `_shared/travel-noticing-photos.mjs` | Loads the day's 320px copies, builds the request, checks every answer lists real photos |

Tasks keeps its data in a different store from Travel. A Travel function reading it is new, though another function outside Tasks already opens that store. Ticking an item off uses the Tasks API as the Tasks hub does.

## New client pieces

| File | Job |
| --- | --- |
| `journal/noticing/rules.ts` | One pure function per counting card |
| `journal/noticing/model.ts` | Card shape, ranking, the five-a-day cap, seen, kept and not-right state |
| `journal/noticing/cards.ts` | The full-screen cards, through the journal's overlay host |
| `journal/noticing/pill.ts`, `kept-band.ts` | The pill under the cover and the band in the story |

## When it goes wrong

- **The server cannot be reached.** Counting cards from this trip still work. Cards needing history or a model wait. No error is shown for a missing noticing.
- **The model returns nonsense.** Anything that does not point at a real item, moment or photo is dropped on the server.
- **A wrong match.** "Not this one" or "Not right" removes it for good. Nothing was written anywhere, so nothing needs undoing.
- **Ticking off fails.** The card stays, says why, and offers to try again (register V5).
- **Partner's lines** are never used as evidence and never sent to a model.

## Checks before it ships

| Entry | Check for this build |
| --- | --- |
| D1 | Every card type has a test where its rule is one short of true, and no card is made. Every card carries a basis line and evidence |
| P4 | With no cards, the pill and every other trace of the feature are absent |
| R2, R4, R6 | At 390: no sideways scroll on any card, the card's actions clear the home indicator and are at least 44px |
| R7 | Back closes the cards and leaves the hash unchanged |
| V5 | A failed tick-off names its reason on the card |
| V7 | Keeping a card and closing returns to the same place in the story, with the band in place |
| Privacy | A shared journal built from one with kept cards contains none of them. A test sends a journal with Partner's lines and asserts none reach the model request |
| Wording | A test fails on "you asked", "you said you wanted", "finally" and "at last" in any card text |

## Order of work

1. The cards, the pill, keeping and "Not right", and the counting cards from this trip and past trips.
2. Bucket list and dreams jar, with Tick it off in Tasks.
3. Seen in the photos.
4. Food journal cards, then the diary and books.

Each step ships by itself and is useful without the next.

## Out of scope

Notifications, a card for every day after the trip ends, noticing from messages or email, and any model reading the diary.

## To check on Adam's iPhone

1. The pill, the cards and both actions on the real trip.
2. A bucket list item that the trip should match: that it is offered on the right day, and that ticking it off shows as done in Tasks.
