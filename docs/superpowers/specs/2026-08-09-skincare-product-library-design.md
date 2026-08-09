# Skincare product library + routine membership

**Date:** 2026-08-09  
**Status:** Approved for planning  
**Scope:** Skincare tab usability + Hyaluronica library/routine stewardship  
**Deferred:** Hammond Central Node edit/delete/condense and cross-agent instruction posting (separate design)

## Problem

The skincare tracker is awkward in three ways:

1. The `⋯` control on a product pill immediately retires the product — it is not a menu, and there is no confirm or choice.
2. `+ Add` is free-text only. There is no way to pick an existing product from a shelf, so duplicates and re-typing are easy.
3. Hyaluronica can propose skincare `log_entry` and search the web, but cannot add products to a library or change AM/PM rotation. Her protocol still says lasting list changes “need a config edit later,” which is stale relative to the catalog UI.

The current `data/skincare/routine-catalog.json` overlay (products + retired) is not a Food-style library. This design replaces that model.

## Goals

- `⋯` opens a menu whose only action is **Remove from routine** (product stays on the shared shelf).
- `+ Add` offers **From library** and **New / one-off…**, with live library search while typing to prevent duplicate shelf entries.
- One shared product shelf; AM and PM hold membership (who is on rotation).
- One-off products remain possible for “just this log.”
- Hyaluronica can search/save the library, set routine membership, and continue to log completed routines via `log_entry`.

## Non-goals (this design)

- Hard-delete from the product library in the tab UI (v1).
- Reorder UI polish beyond what membership order already implies.
- Toner/seal choice lists moving into the library (remain as today unless already catalog-driven).
- Hammond Central Node mutation tools.
- Agent-to-agent messaging infrastructure beyond existing Cross-Agent CN lines from confirmed logs.

## Approach

**Food-style product library + thin routine membership overlays** (not extending the retire-list catalog).

Mirror Brisket/Chadwick library patterns for persistence and chat tools so Hyaluronica gets real stewardship without bolting onto `retired[]`.

## Data model

### `data/skincare/product-library.json`

```json
{
  "schema_version": 1,
  "products": [
    { "id": "cerave-foam", "name": "CeraVe Foaming Cleanser", "notes": "" }
  ]
}
```

- Shared shelf of known products.
- `id` is stable (slug derived from name on create; uniqueness enforced).
- `name` is display text; duplicate names rejected or resolved via search-before-save.
- `notes` optional free text for Hyaluronica/Adam annotations.

### `data/skincare/routine-membership.json`

```json
{
  "schema_version": 1,
  "am": { "product_ids": ["cerave-foam", "ha-serum"] },
  "pm": { "product_ids": ["cerave-foam"] }
}
```

- Ordered lists of library `id`s on each routine.
- Remove from routine = drop id from that list only.
- Same product may appear on both AM and PM.

### One-offs

- Session/draft names on the Log card only.
- Not written to `product-library.json`.
- Not written to membership.
- Included in that day’s logged product list when selected and Log is confirmed.

### Resolution for the tab

Active pills for a routine = membership ids resolved through the library (missing ids skipped or surfaced as a soft warning). Plus any current one-off drafts for that card.

## Migration

1. If `data/skincare/routine-catalog.json` exists:
   - Collect unique names from `am.products`, `pm.products`, and `retired` into the library (stable ids from names).
   - Set membership `product_ids` from each routine’s `products` (not from `retired`).
   - Retired names remain on the shelf but off rotation.
2. Else seed library + membership from current hardcoded defaults (`skincare-routines` / `config/skincare-routines.yml`).
3. After cutover, stop writing the old catalog shape. Tab and APIs read the new files only.
4. Optional: leave the old catalog file in place unread, or delete on successful migrate — prefer leave-unread once to avoid accidental data loss; document in plan.

## Skincare tab UI

### Product pills

- Catalog/library-backed pills keep `⋯`.
- One-offs do not get `⋯` (they are not on the shelf/routine; dismiss by deselecting or clearing the draft).

### `⋯` menu

- Opens a small menu (not an immediate mutation).
- Single action: **Remove from routine**.
- No confirm required for remove-from-routine.
- No “Delete from library” in v1.

### `+ Add` chooser

Two paths:

1. **From library** — list shelf products not already on this routine; multi-select; add selected ids to membership; re-render pills (selected for this Log).
2. **New / one-off…** — text field with live search against the library:
   - Matching results: choosing one behaves like From library (add membership, no duplicate shelf row).
   - No satisfactory match: two actions —
     - **Add to library + routine** (default) — create shelf entry, add to membership, select pill.
     - **Just this time** — one-off draft for this Log only.

### Logging

- Unchanged pattern: multi-select active pills, Log → `/api/chat/confirm` skincare payload with product name list.
- Deselected = not used today.
- Membership/library edits do not rewrite historical logs or chart series.

## API

Replace the catalog endpoint as the source of truth with:

| Endpoint | Role |
|----------|------|
| `GET/POST /api/skincare/library` | List / create-or-update library entries |
| `GET/POST /api/skincare/routines` | Read membership; add/remove product on `am` \| `pm` |

`POST` bodies should be explicit actions (e.g. `save` / `search` for library; `add` / `remove` for routines) consistent with existing Life Hub function style.

Deprecate or thin-wrap `/api/skincare/catalog` so nothing in the app depends on the old shape after cutover.

Client modules: extend/replace `skincare-api.js`, `skincare-catalog.js` → library + membership helpers; update `skincare-model.js`, `render-skincare.js`, `skincare-controller.js`.

## Hyaluronica

### Tools

| Tool | Purpose |
|------|---------|
| `search_skincare_library` | Query shelf by name |
| `save_skincare_library_entry` | Create/update shelf product |
| `set_skincare_routine_membership` | Add or remove a product on `am` \| `pm` |
| `log_entry` (existing, skincare) | Propose completed routine logs |
| `web_search` (existing) | Research |

Tool execution must return `tool_result` and continue the model turn (same pattern as Brisket food library continuity).

### Protocol

Update `config/hyaluronica-protocol.md`:

- Prefer Skincare tab for one-tap daily logs.
- Chat may `log_entry` when Adam describes a completed routine here.
- Lasting shelf/routine changes go through library/membership tools — not “config edit later.”
- Search before save to avoid duplicate products.
- Never invent a completed routine Adam did not describe.
- Remove-from-routine ≠ delete-from-library; v1 has no hard-delete tool requirement.

### Agent directory / wiring

Grant Hyaluronica the new tools in `agent-directory` / chat tool assembly the same way Brisket gets food library tools and Chadwick gets exercise library tools.

## Error handling

- Duplicate library name on save → reject with clear error; UI/agent should search and reuse.
- Add membership for unknown id → reject.
- Remove membership for id not on routine → no-op success or clear “already off” message.
- Missing library file / membership file → seed path, not blank crash.
- Chat tool failure → surface in tool_result; do not pretend the shelf changed.

## Testing

- **Unit:** library save/search; membership add/remove; resolve active pills; duplicate-name guard; seed + migrate from catalog defaults/fixture.
- **Integration:** library + routines Netlify functions; Hyaluronica tool registration and execution in chat.
- **Browser/UI:** `⋯` opens menu and removes from routine only; Add two-path + typeahead match; one-off Log without library write; library+routine path persists across reload.

## Success criteria

- Tapping `⋯` never immediately removes a product; only **Remove from routine** does, and the product remains findable in From library.
- Adam can add an existing shelf product to AM/PM without retyping a new name.
- Typing a near-duplicate surfaces the existing shelf entry.
- Hyaluronica can, in one chat thread, add a product to the shelf, put it on PM, and (when Adam says he finished) propose a skincare log.
- Old retire-list catalog is no longer the live source of truth.

## Follow-up

Separate brainstorm/design for Hammond: programmatic Central Node edit/delete/condense/summarise and posting overarching instructions to other personalities.
