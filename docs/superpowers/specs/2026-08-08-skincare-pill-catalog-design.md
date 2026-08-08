# Skincare pill logging + routine catalog

**Date:** 2026-08-08  
**Status:** Approved for planning (pending Adam review of this file)  
**Goal:** Log AM/PM with multi-select product pills (not tick lists), add products for this log and/or keep them in the routine without wiping existing products, and retire products from rotation. Catalog customizations persist in GitHub like the food library.

**Prior art:** `docs/superpowers/specs/2026-08-05-skincare-tab-design.md` (tick lists + choice chips). This slice replaces the tick-list UX and adds a durable catalog overlay.

**Deploy:** Local commits only until Adam asks to push.

## Problem

1. Adding a product to the routine today means editing config by hand; there is no in-app append, so “change cleanser” feels like replacing the whole list.  
2. Skipping a product means unticking a checkbox list that looks and behaves differently from toner/seal pills.  
3. There is no way to mark something as no longer in rotation without deleting history or editing code.

## Decisions

| Topic | Choice |
|-------|--------|
| Product UI | All products are multi-select pills (same chip language as toner/seal) |
| Exclusive groups | Toner (AM) and Seal (PM) stay exclusive one-of-many choice pills |
| Primary action | **Log** (replaces Done) |
| Add product | **+ Add** → name + **Keep in routine** (default on) |
| Keep off | Selected for this log only; not written to catalog |
| Keep on | Append to that routine’s active `products` in GitHub catalog (never replace-all) |
| Retire | Per-pill control → **Remove from rotation** → move to `retired[]`, hide from card |
| Restore retired | **Out of scope v1** (retire-only; can add “Show retired” later) |
| Persistence | `data/skincare/routine-catalog.json` overlay on top of code defaults |
| Choice option lists | Stay in code defaults for v1 (toner/seal options not editable in UI) |
| Log write | Existing `/api/chat/confirm` + `overwrite: true` for today’s `am`/`pm` |
| Catalog write | Dedicated authenticated Netlify function (or shared write helper) similar to food-library upsert |

## Logging UI

### Card contents (AM / PM)

1. Exclusive choice group(s) from defaults (`toner` / `seal`) — unchanged behaviour, pill styling.  
2. **Active product pills** — one pill per name in the resolved active product list (defaults ∪ catalog products − retired). Multi-select; `data-active` toggles. Default for the current (“Now”) card: all active products selected.  
3. **Extras** — remain multi-select pills (`Sheet mask`, etc.).  
4. Note chips + notes textarea — unchanged.  
5. **Log** button — builds `products` from selected choices + selected product pills + active extras → confirm payload (same schema as today).

### Product list for a log

Order when logging (preserve existing intent):

1. Selected exclusive choice value(s)  
2. Selected multi-select product pills (active catalog products that are on)  
3. Selected extras  

One-off adds (Keep off) appear only in step 2 for that log if selected, and are not appended to the catalog.

### Add product

1. Tap **+ Add** on the routine card.  
2. Inline field: product name (required, trimmed, non-empty).  
3. Toggle: **Keep in routine** (default **on**).  
4. Confirm add:  
   - Always creates a selected pill for this session/log draft.  
   - If Keep on: append name to `catalog[am|pm].products` if not already present (case-sensitive match as stored; do not duplicate). Write catalog to GitHub.  
   - If Keep off: pill exists only in card draft state until Log (or card re-render clears one-offs unless still selected — one-offs live in card session state only).

Duplicate names: if the name already exists in active products, do not duplicate; select the existing pill instead. If it exists only in `retired[]`, v1: show a short status “That product was retired — restore not available yet” and do not auto-unretire.

### Remove from rotation

1. On a **catalog** product pill (not a one-off, not an exclusive choice option, not an extra), affordance: long-press **or** small ⋯ / overflow on the pill (pick one interaction in implementation; prefer a visible ⋯ on desktop + long-press on mobile if both are cheap).  
2. Action: **Remove from rotation**.  
3. Effect: remove from `products`, add to `retired` if not already there; write catalog; remove pill from the card.  
4. Past logs unchanged.  
5. One-off pills: dismiss/remove from draft only (no catalog write).

## Catalog persistence

### Path

`data/skincare/routine-catalog.json`

### Shape

```json
{
  "schema_version": 1,
  "am": {
    "products": ["Azclear Azelaic Acid 20%", "…"],
    "retired": [],
    "extras": ["Sheet mask"]
  },
  "pm": {
    "products": ["Dr.G Green Deep Pore Cleansing Balm", "…"],
    "retired": [],
    "extras": ["Sheet mask"]
  }
}
```

### Resolve active products

```
defaults = SKINCARE_ROUTINES[am|pm].products
catalogProducts = catalog?.[am|pm]?.products ?? defaults
retired = new Set(catalog?.[am|pm]?.retired ?? [])
active = catalogProducts.filter(name => !retired.has(name))
```

On first load, if the blob is missing: treat as “no overlay” and use code defaults for display; **do not** force-write a seed file until the user Keeps or Retires something (lazy create). Alternatively seed on first Skincare open — prefer **lazy create on first mutation** to avoid noisy empty commits.

### Read / write

- **Read:** authenticated repo fetch (same pattern as food library / other data files) when opening Skincare or refreshing live data. Merge into client model for render.  
- **Write Keep / Retire:** authenticated Netlify function that validates session, reads current blob (or starts from defaults), applies append/retire, writes via GitHub `writeFile` with commit message like `chore(skincare): append AM product` / `chore(skincare): retire PM product`.  
- Failures: show status on the card (“Couldn’t save routine — try again”); do not clear the draft pill on Keep failure if the user can retry.

Exact endpoint name is an implementation detail (`/api/skincare-catalog` or similar). Must reuse existing auth, CORS, and GitHub client helpers.

## Controller / model changes (conceptual)

- `buildProductList` / card state: operate on **resolved active products**, not only `SKINCARE_ROUTINES.*.products`.  
- Card draft state: `selectedProducts: Set|array`, `oneOffs: string[]`, choice selections, extras, notes.  
- `onLogRoutine`: unchanged confirm path; product array from draft.  
- New: `onAddProduct`, `onRetireProduct` → catalog API → refresh catalog → re-render pills.  
- Button label **Log** (and “Log again” when already logged today).

## Out of scope (v1)

- Restoring retired products in UI  
- Editing toner/seal option lists in UI  
- Drag-and-drop reorder  
- Hyaluronica auto-editing the catalog  
- Migrating historical log product strings  
- Replacing tick UI only without catalog persistence  

## Testing

- Unit: resolve active products (defaults, overlay, retired); append without wipe; retire moves to `retired`; duplicate Keep selects existing; `buildProductList` with pill selections + one-offs + choices + extras.  
- Unit/render: routine card renders product pills (not checkboxes); Log button; Add + Keep affordances.  
- Integration: catalog write path validates session; append/retire payloads; missing blob creates file on first write.  
- Browser (optional): AM card pills toggle; Log still confirms.

## Success criteria

1. Logging uses only pill selection + Log — no tick list.  
2. Adding a product with Keep on appends to the routine and leaves existing products intact.  
3. Adding with Keep off appears on this log only.  
4. Retire hides a product from the card without deleting past logs or wiping the rest of the list.  
5. Catalog survives refresh / another device via GitHub.
