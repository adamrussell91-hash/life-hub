# Skincare Library Notion Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the skincare product shelf with Notion-parity fields, backfill ~49 products + AM/PM membership from Adam’s lists, group routine pills by category, and let Hyaluronica search/update any field.

**Architecture:** Extend pure helpers in `skincare-product-library.js` (parse/save/search + category group helper). Commit `data/skincare/product-library.json` and `routine-membership.json` as the backfill. Update render to group by category and drop toner/seal exclusive toggles. Widen library API + Hyaluronica tool schemas; refresh protocol.

**Tech Stack:** Vanilla JS, Netlify Functions, `node:test`, JSON data files in repo.

**Spec:** `docs/superpowers/specs/2026-08-09-skincare-library-notion-backfill-design.md`

**Deploy:** Local commits only until Adam asks to push.

---

## File map

| File | Responsibility |
|------|----------------|
| `js/app/skincare-product-library.js` | Rich fields parse/save/search; `STATUS_*` constants; `groupProductsByCategory` |
| `js/app/skincare-routines-data.js` | Empty `choices: {}` on AM/PM (toner/seal removed) |
| `config/skincare-routines.yml` | Remove toner/seal choices; products list can stay as fallback seed only |
| `js/app/render-skincare.js` | Category section headers + hint captions; still support empty choices |
| `js/app/skincare-model.js` | Pass category/hint on productEntries |
| `js/app/skincare-api.js` | POST rich fields |
| `netlify/functions/skincare-library.mjs` | Accept/pass rich fields |
| `netlify/functions/_shared/skincare-library-tools.mjs` | Tool schemas + search haystack |
| `config/hyaluronica-protocol.md` | Rich fields + status vs membership |
| `data/skincare/product-library.json` | Full Notion backfill |
| `data/skincare/routine-membership.json` | AM/PM actively-used ids |
| `tests/unit/skincare-product-library.test.js` | Rich field + grouping tests |
| `tests/unit/skincare-library-tools.test.js` | Schema props |
| `tests/integration/skincare-library-function.test.js` | Rich POST |
| `tests/unit/render-skincare.test.js` | Category sections if covered |
| `css/app.css` | Section + hint styles |
| `service-worker.js` | Bump cache if shell assets change |

---

### Task 1: Rich product library helpers (TDD)

**Files:**
- Modify: `js/app/skincare-product-library.js`
- Modify: `tests/unit/skincare-product-library.test.js`

- [ ] **Step 1: Add failing tests for rich fields + grouping**

Append to `tests/unit/skincare-product-library.test.js`:

```js
import {
  // ...existing
  SKINCARE_STATUSES,
  SKINCARE_CATEGORY_ORDER,
  normalizeProductStatus,
  groupProductsByCategory
} from '../../js/app/skincare-product-library.js';

test('parseProductLibrary normalizes rich fields', () => {
  const lib = parseProductLibrary({
    schema_version: 1,
    products: [{
      id: 'ha',
      name: 'HA 2% + B5',
      brand: 'The Ordinary',
      category: 'Serum',
      status: 'In Use',
      purpose: 'Hydration',
      active_ingredients: ['Hyaluronic Acid'],
      cost: 'A$12',
      purchase_date: '2026-01-01',
      opened_date: null,
      finished_date: null,
      notes: 'AM/PM',
      hint: 'backup'
    }]
  });
  assert.equal(lib.products[0].status, 'in_use');
  assert.equal(lib.products[0].brand, 'The Ordinary');
  assert.deepEqual(lib.products[0].active_ingredients, ['Hyaluronic Acid']);
  assert.equal(lib.products[0].hint, 'backup');
});

test('saveProductLibraryEntry requires category on create', () => {
  assert.equal(saveProductLibraryEntry(emptyProductLibrary(), { name: 'X' }), null);
  const next = saveProductLibraryEntry(emptyProductLibrary(), {
    name: 'X',
    category: 'Serum',
    brand: 'Brand'
  });
  assert.equal(next.products[0].category, 'Serum');
  assert.equal(next.products[0].status, 'in_use');
});

test('saveProductLibraryEntry update preserves omitted fields', () => {
  let lib = saveProductLibraryEntry(emptyProductLibrary(), {
    name: 'X', category: 'Serum', brand: 'B', notes: 'n'
  });
  const id = lib.products[0].id;
  lib = saveProductLibraryEntry(lib, { id, name: 'X2', category: 'Serum' });
  assert.equal(lib.products[0].brand, 'B');
  assert.equal(lib.products[0].notes, 'n');
  assert.equal(lib.products[0].name, 'X2');
});

test('searchProductLibrary matches brand category status', () => {
  let lib = saveProductLibraryEntry(emptyProductLibrary(), {
    name: 'Cicaplast', category: 'Moisturiser', brand: 'La Roche Posay', status: 'in_use'
  });
  assert.equal(searchProductLibrary(lib, 'roche moisturiser').length, 1);
});

test('groupProductsByCategory orders and skips empty', () => {
  const groups = groupProductsByCategory([
    { id: '1', name: 'A', category: 'Serum' },
    { id: '2', name: 'B', category: 'Cleanser' },
    { id: '3', name: 'C', category: 'Serum' }
  ]);
  assert.deepEqual(groups.map(g => g.category), ['Cleanser', 'Serum']);
  assert.deepEqual(groups[1].products.map(p => p.name), ['A', 'C']);
});

test('normalizeProductStatus maps Notion labels', () => {
  assert.equal(normalizeProductStatus('In Use'), 'in_use');
  assert.equal(normalizeProductStatus('To Try'), 'to_try');
  assert.equal(normalizeProductStatus('bogus'), null);
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
node --test tests/unit/skincare-product-library.test.js
```

- [ ] **Step 3: Implement helpers**

In `js/app/skincare-product-library.js`:

```js
export const SKINCARE_STATUSES = ['in_use', 'to_try', 'finished', 'discontinued'];

export const SKINCARE_CATEGORY_ORDER = [
  'Cleanser', 'Toner', 'Serum', 'Treatment', 'Moisturiser',
  'Sunscreen', 'Makeup', 'Mask', 'Mist', 'Hair', 'Body Care'
];

export function normalizeProductStatus(value) {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase().replace(/\s+/g, '_');
  const aliases = {
    in_use: 'in_use', 'in-use': 'in_use',
    to_try: 'to_try', 'to-try': 'to_try',
    finished: 'finished',
    discontinued: 'discontinued'
  };
  return aliases[key] ?? null;
}

function normalizeIngredients(value) {
  if (Array.isArray(value)) {
    return value.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim());
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function normalizeOptionalString(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t || null;
}

function normalizeProductFields(item, { requireCategory = false } = {}) {
  const name = typeof item.name === 'string' ? item.name.trim() : '';
  if (!name) return null;
  const category = typeof item.category === 'string' ? item.category.trim() : '';
  if (requireCategory && !category) return null;
  const status = normalizeProductStatus(item.status) ?? 'in_use';
  if (!SKINCARE_STATUSES.includes(status)) return null;
  return {
    name,
    brand: typeof item.brand === 'string' ? item.brand.trim() : '',
    category: category || '',
    status,
    purpose: typeof item.purpose === 'string' ? item.purpose : '',
    active_ingredients: normalizeIngredients(item.active_ingredients),
    cost: normalizeOptionalString(item.cost),
    purchase_date: normalizeOptionalString(item.purchase_date),
    opened_date: normalizeOptionalString(item.opened_date),
    finished_date: normalizeOptionalString(item.finished_date),
    notes: typeof item.notes === 'string' ? item.notes : '',
    hint: typeof item.hint === 'string' ? item.hint : ''
  };
}

// In parseProductLibrary loop:
const fields = normalizeProductFields(item);
if (!fields) return null;
products.push({ id: item.id.trim(), ...fields });

// In saveProductLibraryEntry:
// create path: normalizeProductFields(input, { requireCategory: true })
// update by id: merge prior + provided keys; if category explicitly '' reject

export function groupProductsByCategory(products) {
  const byCat = new Map();
  for (const p of products ?? []) {
    const cat = (p.category && String(p.category).trim()) || 'Other';
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(p);
  }
  const ordered = [];
  for (const cat of SKINCARE_CATEGORY_ORDER) {
    if (byCat.has(cat)) {
      ordered.push({ category: cat, products: byCat.get(cat) });
      byCat.delete(cat);
    }
  }
  for (const [cat, list] of byCat) {
    ordered.push({ category: cat, products: list });
  }
  return ordered;
}
```

Also extend `searchProductLibrary` haystack to include brand, category, status, purpose, ingredients, hint.

Update `seedProductLibraryFromDefaults` / migrate to pass `category: 'Treatment'` (or `'Other'`) only if required — prefer `category: 'Other'` for legacy seed names so create still works, OR relax requireCategory for seed helpers by calling internal push. Cleanest: seed uses `saveProductLibraryEntry(lib, { name, category: 'Other' })`.

- [ ] **Step 4: Run tests — expect PASS**

```bash
node --test tests/unit/skincare-product-library.test.js
```

- [ ] **Step 5: Commit**

```bash
git add js/app/skincare-product-library.js tests/unit/skincare-product-library.test.js
git commit -m "feat(skincare): rich product library fields and category grouping"
```

---

### Task 2: Library API + Hyaluronica tools

**Files:**
- Modify: `netlify/functions/skincare-library.mjs`
- Modify: `netlify/functions/_shared/skincare-library-tools.mjs`
- Modify: `js/app/skincare-api.js`
- Modify: `tests/unit/skincare-library-tools.test.js`
- Modify: `tests/integration/skincare-library-function.test.js`
- Modify: `config/hyaluronica-protocol.md`

- [ ] **Step 1: Expand tool schema properties** to include brand, category, status, purpose, active_ingredients, cost, dates, hint (category required on create via save helper).

- [ ] **Step 2: Expand `parseRequest` / `saveLibrary`** in `skincare-library.mjs` to forward all rich fields to `saveProductLibraryEntry`.

- [ ] **Step 3: Client `saveSkincareLibraryEntry`** in `skincare-api.js` posts the same fields.

- [ ] **Step 4: Protocol** — note rich fields; status ≠ membership; search before save; web_search remains.

- [ ] **Step 5: Update unit/integration tests; run them; commit**

```bash
node --test tests/unit/skincare-library-tools.test.js tests/integration/skincare-library-function.test.js
git add -u && git commit -m "feat(skincare): expose rich library fields to API and Hyaluronica"
```

---

### Task 3: Category-grouped routine UI + drop toner/seal toggles

**Files:**
- Modify: `js/app/render-skincare.js`
- Modify: `js/app/skincare-model.js` (ensure productEntries include category, hint)
- Modify: `js/app/skincare-routines-data.js` — `choices: {}` for am/pm
- Modify: `config/skincare-routines.yml` — remove choices blocks
- Modify: `css/app.css`
- Modify: `tests/unit/render-skincare.test.js` / `skincare-routines.test.js` as needed
- Modify: `service-worker.js` cache bump

- [ ] **Step 1: Model** — when building `productEntries` from `resolveRoutineProducts`, keep full product objects (`id`, `name`, `category`, `hint`).

- [ ] **Step 2: Render** — import `groupProductsByCategory`; in `renderProductChips`, group entries; for each group render a caption (`skincare-product-group__label`) then pills; under pill name, if `hint` show `skincare-product-pill__hint`.

- [ ] **Step 3: Remove toner/seal** from YAML + `SKINCARE_ROUTINES.choices` (empty objects). Update any tests that assert toner/seal choice UI.

- [ ] **Step 4: CSS**

```css
.skincare-product-group { margin-top: 0.75rem; }
.skincare-product-group__label { /* metric-caption style */ }
.skincare-product-pill__hint { display: block; font-size: 0.75rem; opacity: 0.75; }
```

- [ ] **Step 5: Run unit tests; commit**

```bash
node --test tests/unit/render-skincare.test.js tests/unit/skincare-routines.test.js tests/unit/skincare-controller.test.js
git commit -m "feat(skincare): group routine pills by category; remove toner/seal toggles"
```

---

### Task 4: Notion backfill data files

**Files:**
- Create: `data/skincare/product-library.json`
- Create: `data/skincare/routine-membership.json`
- Optional script: `scripts/skincare-notion-backfill.mjs` (one-shot; can delete after or keep)

- [ ] **Step 1: Generate library JSON** from  
  `/Users/adamrussell/Downloads/Private & Shared 11/Product Library 7132d30c53d141449d6deb3efd9b51e4_all.csv`  
  Map Notion columns → rich fields; drop Usage Log / Rating / Days Lasted. Prefer Adam’s display names where listed. Set Mecca hint to `Backup option only`.

- [ ] **Step 2: Build membership** using product ids from Step 1 matching Adam’s actively-used AM/PM lists (fuzzy name match). Archived items stay off membership.

- [ ] **Step 3: Sanity check**

```bash
node -e "const L=require('./data/skincare/product-library.json'); const M=require('./data/skincare/routine-membership.json'); console.log(L.products.length, M.am.product_ids.length, M.pm.product_ids.length)"
```

Expect: ~49 products; AM ~18; PM ~15 (exact counts from lists).

- [ ] **Step 4: Commit data**

```bash
git add data/skincare/product-library.json data/skincare/routine-membership.json
git commit -m "data(skincare): backfill Notion product library and AM/PM membership"
```

---

### Task 5: Verification

- [ ] **Step 1: Run full relevant suite**

```bash
node --test tests/unit/skincare-*.test.js tests/unit/render-skincare.test.js tests/integration/skincare-*.test.js
```

- [ ] **Step 2: Manual checklist** — Skincare tab AM/PM category sections; From library finds archived; Hyaluronica tools still registered (integration chat test if present).

- [ ] **Step 3: Final commit** only if leftover fixes.

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Rich fields | 1 |
| Drop Usage Log / Rating / Days Lasted | 4 |
| Status vs membership | 4 |
| Category grouping UI | 3 |
| Remove toner/seal | 3 |
| Backfill 49 + AM/PM lists | 4 |
| API + Hyaluronica rich save/search | 2 |
| web_search unchanged | 2 (protocol note only) |
| Hints | 3 + 4 |

## Execution note

Adam approved plan→build in one go. Prefer inline execution in this session unless subagents are dispatched per task.
