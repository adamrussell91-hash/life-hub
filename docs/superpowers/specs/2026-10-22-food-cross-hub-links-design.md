# Food cross-hub links: Travel → Food Journal → Brisket

Date: 22 October 2026
Status: design agreed with Adam, spec awaiting review

## Goal

Log a meal once. A meal logged while travelling lands in the Food Journal as a normal entry. A Food Journal dish can be sent to Brisket to count towards nutrition, with a quick portion step. No double entry anywhere.

## What exists today

| Hub | Store | Shape |
|-----|-------|-------|
| Food Journal | `data/food-journal/journal.json` in the private data repo | `visits[]` → `dishes[]` (title, cuisine, meal_type, rating, tags, notes, photos). Photos in R2 under `food/photos/<id>.jpg`. Day One import links with `source_id: "dayone:…"` and tombstones. |
| Travel Journal | `data/travel/journals/<trip>.json` in the private data repo | `moments[]` (leg_id, local_date, local_time, text, place, coordinates, media_ids, author). Media in R2 under `travel/journal/<trip>/…`. `author` is Adam or Corey (the Travel agent's perspective lane, never authoritative). |
| Brisket (Life hub) | `data/nutrition/YYYY/MM/<date>-<slug>.md` | Frontmatter meal record: `meal`, `calories`, `protein_g`, `fat_g` required, other macros optional. Written through the `log_entry` Confirm card. |

The data-repo client has `commitFiles`, which writes several files in one commit. The Food Journal photo read (`_shared/food-journal-process.mjs`) already sends dish and menu photos to Claude Sonnet 5.

## Decisions

1. Food Journal owns the meal. The Travel moment holds a link and travel-only extras.
2. Only moments Adam writes can be meals. Corey's lines never flow across.
3. A moment becomes a meal with a Meal switch on the moment.
4. Deleting the moment, or switching Meal off, moves the linked visit to Food Journal trash. Deleting the visit in Food Journal clears the Meal flag and keeps the moment.
5. Non-English text is translated automatically, keeping the original beside the English.
6. Brisket works out the numbers through its normal chat path.
7. The portion step uses chips, a pieces count and an optional note.
8. A sent dish re-estimates when a nutrition-relevant field changes, through a Confirm card.

## Part A: Travel → Food Journal

### Data

A moment gains an optional `meal` block:

```json
"meal": {
  "food_visit_id": "fv_…",
  "mood": "buzzing",
  "vibe": "loud, tiny bar, standing room",
  "with": "string"
}
```

- `food_visit_id` is required while the block exists. `mood`, `vibe` and `with` are optional travel-only extras, free-text strings (`mood` up to 40 chars, `vibe` up to 600, `with` up to 200).
- Food fields (dish titles, meal type, rating, venue, ingredients) are not stored on the moment. They live only in the visit.
- The linked visit carries `source_id: "travel:<trip id>:<moment id>"`, so the Food Journal can find the trip file. The schema already accepts `source_id`.

### Flow

1. On a moment Adam wrote, the edit sheet shows a Meal switch. It is hidden on Corey's moments.
2. Switching it on shows the Food Journal fields inline: dishes (title, meal type, rating), venue prefilled from the moment's place. The travel extras sit above.
3. Saving saves the moment as usual, then sends the food fields to a new `/api/travel-meal` endpoint. Ordinary `/api/travel-journal` saves keep `meal` blocks exactly as the server has them, so only this endpoint can set or clear one. The endpoint:
   - validates both documents,
   - builds or updates the visit (date from `local_date`, venue lat/lon from the moment's coordinates),
   - copies each moment photo's display derivative into `food/photos/<new id>.jpg` (same R2 bucket) if not already copied,
   - writes the trip journal and `journal.json` in one `commitFiles` commit, using both files' current shas; a mismatch on either returns 409 and nothing is written.
4. Opening the meal moment later reads the food fields from the Food Journal by `food_visit_id`. Edits from either hub change the one visit.

### Delete and unlink

- Moment deleted, or Meal switched off: the visit is deleted in the same commit. The Food Journal has no trash, so this is a permanent tombstone. Its `source_id` is reserved so a re-link cannot resurrect it; switching Meal on again makes a new visit.
- Visit deleted in Food Journal: the Food Journal save also clears `meal` on the moment, in one commit. The moment stays.

### Translation

- The photo-read prompt gains: when menu or dish text is not in English, return English beside the original. New optional fields: dish `title_en`, menu item `name_en` and `description_en`, visit `menu_text_en`. English text returns nothing extra.
- Typed notes in another language: a single Claude Haiku 5.5 call on save adds `notes_en`. Skipped when the note is already English (cheap local check first: ASCII-only text skips the call).
- The UI shows the English first with the original in smaller text beneath, and the original stays searchable.
- Cost: about A$0.03 extra per foreign menu photo on Sonnet 5 ($2 in / $10 out per million tokens). Notes about A$0.001 each.

## Part B: ingredients on every dish

- New optional dish field `ingredients` (string, up to 2000 chars), separate from `notes`.
- It is filled from the matched menu item's printed description, plus one line per chosen extra, whenever a dish matches a menu item. That covers a ticked menu item, a dish from the photo read with the same name as a menu item, and a dish that already has notes.
- When the menu was translated, `ingredients` holds the English, with the original kept in `ingredients_original`.
- `notes` stays Adam's own words. Existing dishes are left as they are; no migration.

## Part C: Food Journal → Brisket

### Portion sheet

"Send to Brisket" on a dish opens a small sheet:

- chips: All · ¾ · ½ · ⅓ · ¼ (All is selected by default)
- "Pieces": `__ of __` (e.g. 2 of 8 slices), which replaces the chip
- optional note ("skipped the chips")
- Send

Stored portion: a label (`"½"` or `"2 of 8"`) and a fraction from 0 to 1 (`0.5`, `0.25`). The note goes into the hand-off message only.

### Hand-off

- Send opens Brisket's chat with a structured hand-off: dish title, ingredients, extras, venue, date, meal type, photo, portion.
- Brisket follows its normal order: Food Library, then search (a chain venue's published nutrition), then an estimate from the ingredients and photo. It scales by the portion and proposes `log_entry`.
- On Confirm the meal record gets three new optional fields: `food_dish_id`, `portion` and `portion_fraction`. `food_dish_id` is the marker that the meal came from the Food Journal.
- Right after the meal is saved, a second write marks the dish counted. It records `brisket: { meal_path, portion, portion_fraction, counted_at, needs_recount, calories, protein_g, fat_g }` on the dish, in the same best-effort way the Central Node sync works. If that write fails, the meal stays saved and the chat says the badge didn't save.
- The dish shows a badge: "Counted in Brisket · ½". A dish with a live linked meal cannot be sent again; the button becomes "Change portion".

### Re-estimate on edit

- Nutrition-relevant edits are title, ingredients, portion and photos. Rating, tags, notes and cuisine never trigger it.
- After such an edit to a counted dish, the badge reads "Counted in Brisket · needs a re-count" and a Re-count button hands the dish to Brisket again with the previous numbers attached.
- Brisket's reply shows old → new before its Confirm card, and the card shows the new numbers. Confirm replaces the dish's existing meal file, never adds a second one. Dismiss keeps the old numbers and clears the flag.
- No silent change to a confirmed number.
- Deleting a counted dish asks "Also remove it from your nutrition log?" On yes, the Food Journal save removes that dish's meal file. Only meal files linked to dishes that are now gone can be removed.

### Cost

About the same as a Brisket meal log today, roughly A$0.05–0.20 per send or re-count. Measure one real run before building and report the figure.

## Errors

- 409 on the two-file commit: "Your journal changed on another device. Reload before saving." Nothing is written.
- Photo copy fails: the moment and visit still save. The visit is saved without the photo and offers "Retry photo".
- Translation fails or times out: the save goes ahead untranslated.
- Brisket hand-off fails: the dish stays unsent and the portion choice is kept for retry.

## Testing

- Schema tests: the moment `meal` block, dish `ingredients` and `*_en` fields, and the meal record's `food_dish_id` and `portion`.
- Server tests for the two-file commit: create, update, unlink, delete each side, 409 on either sha, Corey's moment refused, tombstone stops resurrection.
- Capture tests: ingredients filled for ticked items, name-matched photo dishes and dishes that already have notes; extras appended.
- Prompt fixture for translation (a non-English menu returns `*_en`; an English menu returns none).
- Portion maths: fractions and pieces.
- A live run on the umbrella at desktop and 390px: log a travel meal, see it in the Food Journal, send half to Brisket, edit the title, re-count, delete.

## Out of scope

- Sending to Brisket straight from the Travel moment. It goes through the Food Journal dish.
- Auto-detecting food in travel photos.
- Back-filling ingredients on existing dishes.

## Build shape

One PR, built in the order B (ingredients and English), A (Travel → Food), C (Food → Brisket). Each task commits. The plan is `docs/superpowers/plans/2026-10-22-food-cross-hub-links.md`.
