# Skincare library Notion backfill + rich product fields

**Date:** 2026-08-09  
**Status:** Approved for planning  
**Depends on:** `2026-08-09-skincare-product-library-design.md` (shelf + membership already shipped)  
**Source:** Notion Product Library export (`Private & Shared 11`)

## Problem

Hyaluronica’s product shelf is empty (or name-only). Adam already maintained a rich Notion Product Library (~49 products) with brand, category, status, purpose, actives, cost, dates, and notes. The Life Hub library only stores `id` / `name` / `notes`, so:

1. There is no backfill of that inventory.
2. The Skincare tab cannot group routine pills by category the way Adam expects.
3. Hyaluronica cannot steward status, category, or other shelf metadata.

## Goals

- Import all Notion products into `data/skincare/product-library.json` with the fields below.
- Seed AM/PM membership from Adam’s actively-used lists; archived / unlisted products stay library-only.
- Group AM/PM routine cards by Notion `category`.
- Expand Hyaluronica tools so she can search/update any shelf field and change membership; keep existing `web_search` and `log_entry`.

## Non-goals

- Importing Notion **Usage Log** (replaced by Life Hub skincare logs).
- Tracking **Rating** or **Days Lasted** (empty / unused in export).
- Custom routine section titles beyond Notion Category (e.g. “First cleanse” vs “Second cleanse” → both `Cleanser`).
- Hard-delete from the library in v1 (mark `finished` / `discontinued` + remove from membership instead).
- Live Notion sync.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Approach | Expand real shelf schema + backfill + category-grouped UI + full Hyaluronica field tools |
| Dropped Notion props | Usage Log, Rating, Days Lasted |
| Status vs rotation | `status` = inventory; AM/PM membership = on rotation |
| Category grouping | Notion Category as section headers (Makeup stays one bucket) |
| Toner/seal toggles | Remove exclusive choice UI; products are normal membership pills under category |
| Web research | Keep existing `web_search` |

## Data model

### `data/skincare/product-library.json`

Keep `schema_version: 1`. Extend `parseProductLibrary` to normalize the new fields (strict today only requires `id`/`name`; new fields get defaults when missing).

```json
{
  "schema_version": 1,
  "products": [
    {
      "id": "cicaplast-baume-b5-soothing-repairing-balm",
      "name": "Cicaplast Baume B5+ Soothing Repairing Balm",
      "brand": "La Roche Posay",
      "category": "Moisturiser",
      "status": "in_use",
      "purpose": "Barrier repair and soothing post actives.",
      "active_ingredients": ["Centella Asiatica"],
      "cost": "A$26.95",
      "purchase_date": "2026-02-01",
      "opened_date": null,
      "finished_date": null,
      "notes": "Key barrier protection step in PM after tretinoin.",
      "hint": ""
    }
  ]
}
```

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Stable slug from name |
| `name` | string | Display name |
| `brand` | string | |
| `category` | string | Cleanser, Toner, Serum, Treatment, Moisturiser, Sunscreen, Makeup, Mask, Mist, Hair, Body Care |
| `status` | enum | `in_use` \| `to_try` \| `finished` \| `discontinued` (map from Notion Title Case) |
| `purpose` | string | |
| `active_ingredients` | string[] | Split Notion comma lists; trim empties |
| `cost` | string \| null | Keep export text (`A$33.99`); null if empty |
| `purchase_date` | string \| null | ISO `YYYY-MM-DD` when parseable; else null |
| `opened_date` | string \| null | |
| `finished_date` | string \| null | |
| `notes` | string | |
| `hint` | string | Optional short UI caption (e.g. Mecca tinted SPF “Backup option only”) |

### `data/skincare/routine-membership.json`

Unchanged shape:

```json
{
  "schema_version": 1,
  "am": { "product_ids": ["..."] },
  "pm": { "product_ids": ["..."] }
}
```

Order within each list follows Adam’s provided list order. Display groups by category later; do not encode custom section titles in membership.

## Backfill mapping

### Shelf

- Import **all ~49** CSV rows from the Notion export.
- Match Adam’s preferred display names where they differ slightly from Notion titles (e.g. brand prefixes he used in lists).
- Products not named in AM/PM lists (hair colour, Oribe, Aveeno, Veet, Redken All Soft, etc.) → library only; preserve Notion status.
- Set `hint` at least for Mecca To Save Face SPF (“Backup option only”) when called out; other hints optional from notes.

### Membership — AM (actively used)

Toner: Anua Rice 70+, Dr Ceuracle Kombucha Essence, Beauty of Joseon Green Plum  
Serum: Multi-Peptide + HA, Niacinamide 10% + Zinc 1%, HA 2% + B5, HA 2% + B5 with Ceramides  
Treatment: Azclear 20%  
Moisturiser: Korres Greek Yoghurt Gel Cream  
Sunscreen: Anthelios Invisible Fluid SPF 50+, Mecca To Save Face SPF 50 (hint: backup), Dr Jart+ Cicapair Colour Correcting SPF 15  
Makeup: Maybelline Green, Maybelline Peach, Tower 28 Serum Concealer, bareMinerals BAREPRO powder foundation  
Mist: Bioderma Sensibio AR+ SOS Spray  
Set: Kosas Cloud Set powder  

### Membership — PM (actively used)

Cleanser: Dr.G Green Deep Pore Cleansing Balm, Korres Foaming Cream Cleanser  
Toner: same three as AM  
Serum: HA 2% + B5, HA 2% + B5 with Ceramides  
Treatment: Retrieve Tretinoin 0.05%  
Moisturiser: Cicaplast B5+, Avene Cicalfate+, CeraVe Facial Moisturising Lotion PM  
Mask: Dr Jart+ Dermask Brightening, JMsolution Propolis Mask Black, JMsolution Propolis Mask Second Pack  
Hair: Nizoral 2% Anti Dandruff Treatment Shampoo  

### Library only (explicitly archived or not on rotation)

- Ilumaé The Quartet Multi-Peptide Ceramide Crème  
- BareMinerals Original Liquid Mineral Concealer  
- Urban Decay All Nighter Setting Spray  
- Dr Jart+ Cicapair Intensive Soothing Repair Serum Mask  
- Plus all Notion rows Adam did not place on AM/PM  

## Skincare tab UI

1. Resolve membership → library products for AM and PM.
2. Group pills by `category` using fixed display order; skip empty groups:

   `Cleanser → Toner → Serum → Treatment → Moisturiser → Sunscreen → Makeup → Mask → Mist → Hair → Body Care`

3. Within a group: multi-select pills (all selected by default for that log), same `⋯` remove-from-routine behaviour.
4. Show `hint` as a subtle caption under the pill when non-empty.
5. Remove hardcoded toner/seal exclusive choice toggles from routine config/UI once those products live on membership under Toner / Moisturiser.
6. Tab “new product” path should set at least `name`, `category`, `status` (default `in_use`); richer fields may remain agent-primary if the form stays light.

## API + parse/save

- Extend `parseProductLibrary` / `saveProductLibraryEntry` to read/write the new fields with safe defaults (`''`, `[]`, `null`, `status: 'in_use'`).
- `searchProductLibrary` should match tokens against name, brand, category, status, purpose, notes, ingredients, hint.
- Library POST body / tool input accepts the expanded fields.
- Membership endpoints unchanged.

## Hyaluronica

| Tool | Role |
|------|------|
| `search_skincare_library` | Query shelf by any searchable field |
| `save_skincare_library_entry` | Create/update **any** product field |
| `set_skincare_routine_membership` | Add/remove on `am` \| `pm` |
| `log_entry` | Existing completed-routine proposals |
| `web_search` | Existing research (unchanged) |

Protocol (`config/hyaluronica-protocol.md`): document rich fields + status vs membership; search before save; prefer tab for daily logs; lasting shelf/routine edits via tools; no “config edit later”; no invented completed routines; no hard-delete requirement in v1.

## Error handling

- Duplicate name on create → reject / update-by-name as today.
- Invalid `status` → reject. On **create**, `category` is required (non-empty). On **update**, omitted fields keep prior values; explicitly clearing `category` to empty rejects.
- Unknown membership product id → reject.
- Corrupt library file → existing corrupt path.
- Unparseable Notion dates → null, do not fail the whole import.

## Testing

- **Unit:** parse/save rich fields; search across brand/category/status; category grouping helper; membership seed from fixture matching Adam’s lists.
- **Integration:** library function accepts rich POST; Hyaluronica tool schemas include new properties; chat tool execution updates fields.
- **Manual / browser:** AM/PM cards show category sections; archived products absent from cards but findable in From library; hints visible where set.

## Success criteria

- Opening Skincare shows non-empty AM/PM cards grouped by category with Adam’s active products.
- Full Notion shelf (minus dropped props) is searchable by Hyaluronica.
- Adam can ask Hyaluronica to change status, category, notes, or AM/PM rotation and it persists.
- Toner/seal exclusive toggles are gone; those products behave like other pills.
- No Usage Log / Rating / Days Lasted fields in the model.

## Follow-up (out of scope)

- Hard-delete / archive UI on the tab.
- Finer-than-category routine section labels if Adam wants them later.
- Cost as numeric currency type.
