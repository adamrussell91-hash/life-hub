# Skincare Product Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the skincare retire-list catalog with a shared product library + AM/PM membership, fix the ⋯/Add UX, and give Hyaluronica search/save/membership tools plus existing skincare logging.

**Architecture:** Pure helpers own `product-library.json` and `routine-membership.json` (seed/migrate from defaults or legacy `routine-catalog.json`). Two Netlify functions expose authenticated GET/POST for library and routines. The Skincare tab resolves pills from membership→library, opens a real ⋯ menu (remove from routine only), and uses a two-path Add flow with live search. Hyaluronica gets Chadwick-style tools (`search` / `save` / `set_membership`) that return `tool_result` and continue the turn; `log_entry` stays as today.

**Tech Stack:** Vanilla JS, Netlify Functions, GitHub Contents API, `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-09-skincare-product-library-design.md`

**Deploy:** Local commits only until Adam asks to push. Hammond CN tools are out of scope.

---

## File map

| File | Responsibility |
|------|----------------|
| `js/app/skincare-product-library.js` | Pure shelf helpers: paths, parse, slugify id, search, save/upsert, seed from defaults, migrate from legacy catalog |
| `js/app/skincare-routine-membership.js` | Pure membership helpers: path, parse, resolve active product objects, add/remove, seed/migrate |
| `js/app/skincare-catalog.js` | Keep temporarily for migrate input parsing (`parseCatalog`); stop using for live resolve/append/retire in app |
| `netlify/functions/skincare-library.mjs` | `GET/POST /api/skincare/library` |
| `netlify/functions/skincare-routines.mjs` | `GET/POST /api/skincare/routines` |
| `netlify/functions/skincare-catalog.mjs` | After cutover: GET may still migrate once or return 410; prefer leave function but stop client calls |
| `netlify/functions/_shared/skincare-library-tools.mjs` | Tool schemas + search/validate for chat (import pure helpers) |
| `netlify/functions/chat.mjs` | Gate Hyaluronica tools; load blobs; executeTools continue-turn |
| `netlify/functions/_shared/persona.mjs` | Optional shelf summary for Hyaluronica; drop “config edit later” reliance |
| `config/hyaluronica-protocol.md` | Lasting changes via tools |
| `js/app/skincare-api.js` | Client HTTP for library + routines |
| `js/app/skincare-model.js` | Resolve pills from library + membership |
| `js/app/skincare-controller.js` | Add-from-library, create product, one-off, remove-from-routine |
| `js/app/render-skincare.js` | ⋯ menu; Add chooser + typeahead |
| `js/app/app-controller.js` | Load library + membership; pass into model/render |
| `js/app/main.js` | Wire API + controller callbacks |
| `css/app.css` | Menu + add-sheet styles |
| `tests/unit/skincare-product-library.test.js` | Shelf helpers |
| `tests/unit/skincare-routine-membership.test.js` | Membership helpers |
| `tests/unit/skincare-api.test.js` | Client API (create if missing patterns exist) |
| `tests/unit/skincare-controller.test.js` | Update for new actions |
| `tests/unit/render-skincare.test.js` | Menu + Add flows |
| `tests/unit/skincare-routines.test.js` | Model resolve via membership |
| `tests/integration/skincare-library-function.test.js` | Library HTTP |
| `tests/integration/skincare-routines-function.test.js` | Routines HTTP |
| `tests/integration/chat-function.test.js` | Hyaluronica tool wiring |
| `tests/unit/skincare-library-tools.test.js` | Tool schemas / search formatting |
| `service-worker.js` | Bump shell cache when JS/CSS change |

**Canonical paths:**
- `data/skincare/product-library.json`
- `data/skincare/routine-membership.json`
- Legacy (read-only migrate): `data/skincare/routine-catalog.json`

**Library JSON:**
```json
{
  "schema_version": 1,
  "products": [
    { "id": "korres-greek-yoghurt-foaming-cream-cleanser", "name": "Korres Greek Yoghurt Foaming Cream Cleanser", "notes": "" }
  ]
}
```

**Membership JSON:**
```json
{
  "schema_version": 1,
  "am": { "product_ids": ["…"] },
  "pm": { "product_ids": ["…"] }
}
```

---

### Task 1: Product library pure helpers

**Files:**
- Create: `js/app/skincare-product-library.js`
- Create: `tests/unit/skincare-product-library.test.js`

- [ ] **Step 1: Write failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SKINCARE_PRODUCT_LIBRARY_PATH,
  emptyProductLibrary,
  parseProductLibrary,
  slugifyProductId,
  searchProductLibrary,
  saveProductLibraryEntry,
  findProductByName,
  seedProductLibraryFromDefaults,
  migrateProductLibraryFromCatalog
} from '../../js/app/skincare-product-library.js';
import { SKINCARE_ROUTINES } from '../../js/app/skincare-routines-data.js';

test('path is data/skincare/product-library.json', () => {
  assert.equal(SKINCARE_PRODUCT_LIBRARY_PATH, 'data/skincare/product-library.json');
});

test('parseProductLibrary returns null for garbage', () => {
  assert.equal(parseProductLibrary(null), null);
  assert.equal(parseProductLibrary('{}'), null);
  assert.equal(parseProductLibrary({ schema_version: 1 }), null);
});

test('slugifyProductId lowercases and dashes', () => {
  assert.equal(slugifyProductId('CeraVe Foam!'), 'cerave-foam');
});

test('saveProductLibraryEntry creates with unique id', () => {
  const lib = emptyProductLibrary();
  const next = saveProductLibraryEntry(lib, { name: 'CeraVe Foam' });
  assert.equal(next.products.length, 1);
  assert.equal(next.products[0].name, 'CeraVe Foam');
  assert.equal(next.products[0].id, 'cerave-foam');
});

test('saveProductLibraryEntry rejects blank name', () => {
  assert.equal(saveProductLibraryEntry(emptyProductLibrary(), { name: '  ' }), null);
});

test('saveProductLibraryEntry updates existing by id', () => {
  let lib = saveProductLibraryEntry(emptyProductLibrary(), { name: 'CeraVe Foam' });
  const id = lib.products[0].id;
  lib = saveProductLibraryEntry(lib, { id, name: 'CeraVe Foaming Cleanser', notes: 'AM' });
  assert.equal(lib.products.length, 1);
  assert.equal(lib.products[0].name, 'CeraVe Foaming Cleanser');
  assert.equal(lib.products[0].notes, 'AM');
});

test('findProductByName is case-insensitive exact', () => {
  const lib = saveProductLibraryEntry(emptyProductLibrary(), { name: 'CeraVe Foam' });
  assert.equal(findProductByName(lib, 'cerave foam').id, 'cerave-foam');
});

test('searchProductLibrary matches tokens', () => {
  let lib = emptyProductLibrary();
  lib = saveProductLibraryEntry(lib, { name: 'CeraVe Foaming Cleanser' });
  lib = saveProductLibraryEntry(lib, { name: 'The Ordinary HA' });
  const hits = searchProductLibrary(lib, 'cerave clean');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].name, 'CeraVe Foaming Cleanser');
});

test('seedProductLibraryFromDefaults includes AM and PM unique names', () => {
  const lib = seedProductLibraryFromDefaults(SKINCARE_ROUTINES);
  const names = new Set(lib.products.map(p => p.name));
  for (const name of SKINCARE_ROUTINES.am.products) assert.ok(names.has(name));
  for (const name of SKINCARE_ROUTINES.pm.products) assert.ok(names.has(name));
});

test('migrateProductLibraryFromCatalog folds products and retired', () => {
  const catalog = {
    schema_version: 1,
    am: { products: ['A'], retired: ['B'], extras: [] },
    pm: { products: ['A', 'C'], retired: [], extras: [] }
  };
  const lib = migrateProductLibraryFromCatalog(catalog);
  const names = lib.products.map(p => p.name).sort();
  assert.deepEqual(names, ['A', 'B', 'C']);
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `node --test tests/unit/skincare-product-library.test.js`  
Expected: FAIL (module missing)

- [ ] **Step 3: Implement helpers**

Create `js/app/skincare-product-library.js`:

```js
export const SKINCARE_PRODUCT_LIBRARY_PATH = 'data/skincare/product-library.json';

export function emptyProductLibrary() {
  return { schema_version: 1, products: [] };
}

export function parseProductLibrary(value) {
  const raw = typeof value === 'string'
    ? (() => { try { return JSON.parse(value); } catch { return null; } })()
    : value;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.schema_version !== 1 || !Array.isArray(raw.products)) return null;
  const products = [];
  for (const item of raw.products) {
    if (!item || typeof item !== 'object') return null;
    if (typeof item.id !== 'string' || !item.id.trim()) return null;
    if (typeof item.name !== 'string' || !item.name.trim()) return null;
    const entry = { id: item.id.trim(), name: item.name.trim() };
    if (typeof item.notes === 'string') entry.notes = item.notes;
    else entry.notes = '';
    products.push(entry);
  }
  return { schema_version: 1, products };
}

export function slugifyProductId(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'product';
}

function allocateId(products, base) {
  const used = new Set(products.map(p => p.id));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export function findProductByName(library, name) {
  const key = String(name ?? '').trim().toLowerCase();
  if (!key) return null;
  return (library?.products ?? []).find(p => p.name.toLowerCase() === key) ?? null;
}

export function searchProductLibrary(library, query, { limit = 25 } = {}) {
  if (!library?.products || typeof query !== 'string' || !query.trim()) return [];
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const capped = Math.min(Math.max(Number(limit) || 25, 1), 50);
  return library.products
    .filter(p => {
      const hay = `${p.name} ${p.notes ?? ''}`.toLowerCase();
      return tokens.every(t => hay.includes(t));
    })
    .slice(0, capped);
}

export function saveProductLibraryEntry(library, input) {
  if (!library || typeof input !== 'object' || input == null) return null;
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) return null;
  const notes = typeof input.notes === 'string' ? input.notes : '';
  const products = [...(library.products ?? [])];

  if (typeof input.id === 'string' && input.id.trim()) {
    const id = input.id.trim();
    const idx = products.findIndex(p => p.id === id);
    if (idx === -1) return null;
    products[idx] = { ...products[idx], name, notes };
    return { schema_version: 1, products };
  }

  const existing = findProductByName({ products }, name);
  if (existing) {
    const idx = products.findIndex(p => p.id === existing.id);
    products[idx] = { ...products[idx], name, notes: notes || products[idx].notes || '' };
    return { schema_version: 1, products };
  }

  const id = allocateId(products, slugifyProductId(name));
  products.push({ id, name, notes });
  return { schema_version: 1, products };
}

export function seedProductLibraryFromDefaults(defaults) {
  let lib = emptyProductLibrary();
  const names = [
    ...(defaults?.am?.products ?? []),
    ...(defaults?.pm?.products ?? [])
  ];
  for (const name of names) {
    if (findProductByName(lib, name)) continue;
    lib = saveProductLibraryEntry(lib, { name }) ?? lib;
  }
  return lib;
}

export function migrateProductLibraryFromCatalog(catalog) {
  let lib = emptyProductLibrary();
  if (!catalog || typeof catalog !== 'object') return lib;
  const names = [];
  for (const key of ['am', 'pm']) {
    names.push(...(catalog[key]?.products ?? []), ...(catalog[key]?.retired ?? []));
  }
  for (const name of names) {
    if (typeof name !== 'string' || !name.trim()) continue;
    if (findProductByName(lib, name)) continue;
    lib = saveProductLibraryEntry(lib, { name: name.trim() }) ?? lib;
  }
  return lib;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `node --test tests/unit/skincare-product-library.test.js`

- [ ] **Step 5: Commit**

```bash
git add js/app/skincare-product-library.js tests/unit/skincare-product-library.test.js
git commit -m "$(cat <<'EOF'
feat: add skincare product library helpers

Shared shelf parse/search/save with seed and legacy catalog migrate.
EOF
)"
```

---

### Task 2: Routine membership pure helpers

**Files:**
- Create: `js/app/skincare-routine-membership.js`
- Create: `tests/unit/skincare-routine-membership.test.js`

- [ ] **Step 1: Write failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SKINCARE_ROUTINE_MEMBERSHIP_PATH,
  emptyMembership,
  parseMembership,
  resolveRoutineProducts,
  addToRoutine,
  removeFromRoutine,
  seedMembershipFromDefaults,
  migrateMembershipFromCatalog
} from '../../js/app/skincare-routine-membership.js';
import {
  emptyProductLibrary,
  saveProductLibraryEntry,
  seedProductLibraryFromDefaults,
  findProductByName
} from '../../js/app/skincare-product-library.js';
import { SKINCARE_ROUTINES } from '../../js/app/skincare-routines-data.js';

test('path is data/skincare/routine-membership.json', () => {
  assert.equal(SKINCARE_ROUTINE_MEMBERSHIP_PATH, 'data/skincare/routine-membership.json');
});

test('parseMembership rejects bad shapes', () => {
  assert.equal(parseMembership(null), null);
  assert.equal(parseMembership({ schema_version: 1 }), null);
});

test('resolveRoutineProducts maps ids through library in order', () => {
  let lib = emptyProductLibrary();
  lib = saveProductLibraryEntry(lib, { name: 'A' });
  lib = saveProductLibraryEntry(lib, { name: 'B' });
  const a = findProductByName(lib, 'A');
  const b = findProductByName(lib, 'B');
  const membership = {
    schema_version: 1,
    am: { product_ids: [b.id, a.id, 'missing'] },
    pm: { product_ids: [] }
  };
  assert.deepEqual(
    resolveRoutineProducts('am', membership, lib).map(p => p.name),
    ['B', 'A']
  );
});

test('addToRoutine appends id once', () => {
  const lib = saveProductLibraryEntry(emptyProductLibrary(), { name: 'A' });
  const id = lib.products[0].id;
  let m = emptyMembership();
  m = addToRoutine(m, 'am', id);
  m = addToRoutine(m, 'am', id);
  assert.deepEqual(m.am.product_ids, [id]);
});

test('removeFromRoutine drops id only from that routine', () => {
  const lib = saveProductLibraryEntry(emptyProductLibrary(), { name: 'A' });
  const id = lib.products[0].id;
  let m = emptyMembership();
  m = addToRoutine(m, 'am', id);
  m = addToRoutine(m, 'pm', id);
  m = removeFromRoutine(m, 'am', id);
  assert.deepEqual(m.am.product_ids, []);
  assert.deepEqual(m.pm.product_ids, [id]);
});

test('seedMembershipFromDefaults uses library ids for default names', () => {
  const lib = seedProductLibraryFromDefaults(SKINCARE_ROUTINES);
  const m = seedMembershipFromDefaults(SKINCARE_ROUTINES, lib);
  assert.equal(m.am.product_ids.length, SKINCARE_ROUTINES.am.products.length);
  assert.equal(m.pm.product_ids.length, SKINCARE_ROUTINES.pm.products.length);
});

test('migrateMembershipFromCatalog uses products not retired', () => {
  const catalog = {
    schema_version: 1,
    am: { products: ['Keep'], retired: ['Gone'], extras: [] },
    pm: { products: [], retired: [], extras: [] }
  };
  let lib = emptyProductLibrary();
  lib = saveProductLibraryEntry(lib, { name: 'Keep' });
  lib = saveProductLibraryEntry(lib, { name: 'Gone' });
  const m = migrateMembershipFromCatalog(catalog, lib);
  assert.deepEqual(
    m.am.product_ids,
    [findProductByName(lib, 'Keep').id]
  );
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test tests/unit/skincare-routine-membership.test.js`

- [ ] **Step 3: Implement**

Create `js/app/skincare-routine-membership.js`:

```js
import { findProductByName } from './skincare-product-library.js';

export const SKINCARE_ROUTINE_MEMBERSHIP_PATH = 'data/skincare/routine-membership.json';

export function emptyMembership() {
  return {
    schema_version: 1,
    am: { product_ids: [] },
    pm: { product_ids: [] }
  };
}

export function parseMembership(value) {
  const raw = typeof value === 'string'
    ? (() => { try { return JSON.parse(value); } catch { return null; } })()
    : value;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.schema_version !== 1) return null;
  const out = emptyMembership();
  for (const key of ['am', 'pm']) {
    const ids = raw[key]?.product_ids;
    if (!Array.isArray(ids)) return null;
    out[key] = {
      product_ids: ids.filter(id => typeof id === 'string' && id.trim()).map(id => id.trim())
    };
  }
  return out;
}

export function resolveRoutineProducts(routineKey, membership, library) {
  const ids = membership?.[routineKey]?.product_ids ?? [];
  const byId = new Map((library?.products ?? []).map(p => [p.id, p]));
  const out = [];
  for (const id of ids) {
    const product = byId.get(id);
    if (product) out.push(product);
  }
  return out;
}

export function addToRoutine(membership, routineKey, productId) {
  if (!membership || (routineKey !== 'am' && routineKey !== 'pm')) return null;
  if (typeof productId !== 'string' || !productId.trim()) return null;
  const id = productId.trim();
  const next = {
    schema_version: 1,
    am: { product_ids: [...membership.am.product_ids] },
    pm: { product_ids: [...membership.pm.product_ids] }
  };
  if (!next[routineKey].product_ids.includes(id)) {
    next[routineKey].product_ids.push(id);
  }
  return next;
}

export function removeFromRoutine(membership, routineKey, productId) {
  if (!membership || (routineKey !== 'am' && routineKey !== 'pm')) return null;
  if (typeof productId !== 'string' || !productId.trim()) return null;
  const id = productId.trim();
  return {
    schema_version: 1,
    am: {
      product_ids: routineKey === 'am'
        ? membership.am.product_ids.filter(x => x !== id)
        : [...membership.am.product_ids]
    },
    pm: {
      product_ids: routineKey === 'pm'
        ? membership.pm.product_ids.filter(x => x !== id)
        : [...membership.pm.product_ids]
    }
  };
}

export function seedMembershipFromDefaults(defaults, library) {
  const m = emptyMembership();
  for (const key of ['am', 'pm']) {
    for (const name of defaults?.[key]?.products ?? []) {
      const product = findProductByName(library, name);
      if (product) m[key].product_ids.push(product.id);
    }
  }
  return m;
}

export function migrateMembershipFromCatalog(catalog, library) {
  const m = emptyMembership();
  if (!catalog) return m;
  for (const key of ['am', 'pm']) {
    for (const name of catalog[key]?.products ?? []) {
      const product = findProductByName(library, name);
      if (product && !m[key].product_ids.includes(product.id)) {
        m[key].product_ids.push(product.id);
      }
    }
  }
  return m;
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `node --test tests/unit/skincare-routine-membership.test.js`

- [ ] **Step 5: Commit**

```bash
git add js/app/skincare-routine-membership.js tests/unit/skincare-routine-membership.test.js
git commit -m "$(cat <<'EOF'
feat: add skincare routine membership helpers

AM/PM product_id lists resolve through the shared shelf.
EOF
)"
```

---

### Task 3: Library + routines Netlify functions

**Files:**
- Create: `netlify/functions/skincare-library.mjs`
- Create: `netlify/functions/skincare-routines.mjs`
- Create: `tests/integration/skincare-library-function.test.js`
- Create: `tests/integration/skincare-routines-function.test.js`

Mirror auth/GitHub patterns from `netlify/functions/skincare-catalog.mjs` (`createSkincareCatalogHandler`, session cookie, `decodeBlob`, `writeFile`).

**Library behaviour:**
- `GET` → load `product-library.json`; if missing, try load legacy catalog → `migrateProductLibraryFromCatalog`, else `seedProductLibraryFromDefaults(SKINCARE_ROUTINES)`; optionally persist seed on first GET (prefer persist so ids stable) — **persist seed/migrate on first successful read when blob missing**.
- `POST { action: 'save', name, id?, notes? }` → save entry, write blob, return `{ ok, data: { library } }`.
- Duplicate exact name updates existing (helper behaviour).

**Routines behaviour:**
- `GET` → load membership; if missing, ensure library exists (same seed path), then `migrateMembershipFromCatalog` or `seedMembershipFromDefaults`; persist when created.
- `POST { action: 'add'|'remove', routine: 'am'|'pm', product_id }` → mutate membership; reject unknown `product_id` with `400 unknown_product`.

- [ ] **Step 1: Write integration tests** cloned from `tests/integration/skincare-catalog-function.test.js` stubs (`githubFetchStub` with multiple blob paths). Cover:
  - GET library seeds from defaults when no blobs
  - POST save adds product
  - GET routines seeds membership matching default names
  - POST add/remove membership
  - POST add unknown id → 400
  - unauthenticated → 401

- [ ] **Step 2: Run — expect FAIL** (handlers missing)

- [ ] **Step 3: Implement both handlers** with `export const config = { path: '...' }`.

Shared internal helper (inline in each file or tiny `_shared/skincare-store.mjs`): load/parse library + membership with migrate. Prefer a small shared module:

Create `netlify/functions/_shared/skincare-store.mjs` exporting:
- `async function loadOrSeedLibrary(github)`
- `async function loadOrSeedMembership(github, library)`
- `async function writeJson(github, path, value, message)`

Use `SKINCARE_CATALOG_PATH` + `parseCatalog` only inside migrate branch.

- [ ] **Step 4: Run — expect PASS**

```bash
node --test tests/integration/skincare-library-function.test.js tests/integration/skincare-routines-function.test.js
```

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/skincare-library.mjs netlify/functions/skincare-routines.mjs \
  netlify/functions/_shared/skincare-store.mjs \
  tests/integration/skincare-library-function.test.js \
  tests/integration/skincare-routines-function.test.js
git commit -m "$(cat <<'EOF'
feat: add skincare library and routines APIs

Authenticated GET/POST for the shared shelf and AM/PM membership.
EOF
)"
```

---

### Task 4: Client API + model + controller

**Files:**
- Modify: `js/app/skincare-api.js`
- Modify: `js/app/skincare-model.js`
- Modify: `js/app/skincare-controller.js`
- Modify: `js/app/app-controller.js`
- Modify: `js/app/main.js`
- Modify: `tests/unit/skincare-controller.test.js`
- Modify: `tests/unit/skincare-routines.test.js` (model overlay)

- [ ] **Step 1: Update / add failing controller + model tests**

Controller expectations:
- `onRemoveFromRoutine({ routine, productId })` → `skincareApi.removeFromRoutine` → status `Removed from routine` → `onMembershipChanged`
- `onAddFromLibrary({ routine, productIds: [] })` → add each id → refresh
- `onCreateProduct({ routine, name, keep: true })` → `saveLibrary` then `addToRoutine`
- `onCreateProduct({ routine, name, keep: false })` → `{ oneOff: true, name }` (no API)
- Remove old `onRetireProduct` / `appendProduct` keep path

Model:
- `buildSkincareModel({ events, date, routines, nowHourKey, library, membership })` sets `am.products` / `pm.products` to **name strings** from `resolveRoutineProducts` (keep `buildProductList` string-based), and attach `am.productEntries` / `pm.productEntries` as `{ id, name }[]` for render ⋯.

- [ ] **Step 2: Run targeted tests — expect FAIL**

- [ ] **Step 3: Implement API**

```js
// js/app/skincare-api.js — replace catalog methods
export function createSkincareApi(fetchImpl = fetch) {
  async function request(path, options) { /* same error mapping as today */ }
  return {
    getLibrary() { return request('/api/skincare/library'); }, // → data.library
    saveLibraryEntry({ name, id, notes }) {
      return request('/api/skincare/library', {
        method: 'POST',
        body: JSON.stringify({ action: 'save', name, id, notes })
      });
    },
    getRoutines() { return request('/api/skincare/routines'); }, // → data.membership
    addToRoutine({ routine, productId }) {
      return request('/api/skincare/routines', {
        method: 'POST',
        body: JSON.stringify({ action: 'add', routine, product_id: productId })
      });
    },
    removeFromRoutine({ routine, productId }) {
      return request('/api/skincare/routines', {
        method: 'POST',
        body: JSON.stringify({ action: 'remove', routine, product_id: productId })
      });
    }
  };
}
```

Wire `app-controller.js`:
- Replace `latestCatalog` with `latestLibrary` + `latestMembership`
- `refreshSkincareShelf()` loads both in parallel
- `applySkincareShelf({ library, membership })`
- `onCatalogChanged` → rename callbacks to `onShelfChanged`

- [ ] **Step 4: Run unit tests — expect PASS**

```bash
node --test tests/unit/skincare-controller.test.js tests/unit/skincare-routines.test.js
```

- [ ] **Step 5: Commit**

```bash
git add js/app/skincare-api.js js/app/skincare-model.js js/app/skincare-controller.js \
  js/app/app-controller.js js/app/main.js \
  tests/unit/skincare-controller.test.js tests/unit/skincare-routines.test.js
git commit -m "$(cat <<'EOF'
feat: wire skincare client to library and membership APIs

Model resolves routine pills from the shared shelf.
EOF
)"
```

---

### Task 5: Render ⋯ menu + Add two-path UI

**Files:**
- Modify: `js/app/render-skincare.js`
- Modify: `css/app.css`
- Modify: `tests/unit/render-skincare.test.js`

- [ ] **Step 1: Write failing render tests**

```js
test('⋯ opens menu with Remove from routine and does not call remove until chosen', () => {
  const calls = [];
  // render with productEntries
  // click ⋯ → menu visible, calls still []
  // click Remove from routine → calls push { routine, productId }
});

test('+ Add shows From library and New / one-off chooser', () => {
  // click + Add → both path buttons present
});

test('From library lists shelf products not on routine and adds selected', () => {
  // library has A,B; routine has A → only B listed
});

test('New / one-off typeahead surfaces library matches', () => {
  // type "cera" → match button; choosing match calls onAddFromLibrary
});

test('Just this time creates one-off without library callback', () => {
  // type unique name → Just this time → oneOff draft pill, no onCreateProduct keep
});
```

Update existing tests that assumed immediate retire / Keep toggle.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement UI**

Callbacks on `renderSkincare`:
```js
{
  onLogRoutine,
  onLogProcedure,
  onRemoveFromRoutine,   // { routine, productId }
  onAddFromLibrary,      // { routine, productIds }
  onCreateProduct        // { routine, name, keep: boolean }
}
```

Pills: for each `productEntry` render name + ⋯; one-offs remain name-only strings without ⋯.

⋯ behaviour:
- Toggle a small menu anchored to the pill (`skincare-product-pill__menu-panel`)
- Single button “Remove from routine”
- Click outside / Escape closes menu (minimal: close on next pill click)

+ Add:
1. Chooser panel with **From library** | **New / one-off…**
2. From library: checkboxes for `library.products` whose id ∉ routine membership; Confirm adds
3. New / one-off: input; on input filter `searchProductLibrary`; show matches; actions **Add to library + routine** (default) and **Just this time**

Pass `library` into render (full shelf) alongside model routines.

- [ ] **Step 4: CSS** — panel, chooser, typeahead list; match existing soft-medical skincare styles (no new card chrome beyond interaction containers).

- [ ] **Step 5: Run render tests — PASS**

- [ ] **Step 6: Commit**

```bash
git add js/app/render-skincare.js css/app.css tests/unit/render-skincare.test.js
git commit -m "$(cat <<'EOF'
feat: skincare ⋯ menu and library-aware add flow

Stop instant retire; support from-library and search-as-you-type add.
EOF
)"
```

---

### Task 6: Hyaluronica chat tools

**Files:**
- Create: `netlify/functions/_shared/skincare-library-tools.mjs`
- Create: `tests/unit/skincare-library-tools.test.js`
- Modify: `netlify/functions/chat.mjs`
- Modify: `netlify/functions/_shared/persona.mjs` (optional short shelf list)
- Modify: `config/hyaluronica-protocol.md`
- Modify: `tests/integration/chat-function.test.js`
- Modify: `netlify.toml` `included_files` if new shared module needs listing (usually auto via directory)

- [ ] **Step 1: Tool schema unit tests**

```js
import {
  searchSkincareLibrarySchema,
  saveSkincareLibraryEntrySchema,
  setSkincareRoutineMembershipSchema,
  formatSkincareLibraryForPrompt
} from '../../netlify/functions/_shared/skincare-library-tools.mjs';

test('schemas expose expected tool names', () => {
  assert.equal(searchSkincareLibrarySchema().name, 'search_skincare_library');
  assert.equal(saveSkincareLibraryEntrySchema().name, 'save_skincare_library_entry');
  assert.equal(setSkincareRoutineMembershipSchema().name, 'set_skincare_routine_membership');
});
```

Tool inputs:
- `search_skincare_library`: `{ query: string, limit?: number }` → JSON string of matches `{ id, name, notes }[]`
- `save_skincare_library_entry`: `{ name, notes?, id? }` → write library blob; return `{ ok, id, name }`
- `set_skincare_routine_membership`: `{ routine: 'am'|'pm', product_id, op: 'add'|'remove' }` → write membership; return `{ ok, routine, product_ids }`

- [ ] **Step 2: Implement `_shared/skincare-library-tools.mjs`** wrapping pure helpers + prompt formatter (cap ~40 products).

- [ ] **Step 3: Wire `chat.mjs`**

```js
const needsSkincareLibrary = slug === 'hyaluronica';
// load product library + membership blobs when needsSkincareLibrary
const tools = [
  web_search,
  ...(allowedTypes ? [logEntryToolSchema(allowedTypes)] : []),
  ...(needsFoodLibrary ? [foodLibraryEntrySchema()] : []),
  ...(needsExerciseLibrary ? [searchExerciseLibrarySchema(), saveExerciseLibraryEntrySchema()] : []),
  ...(needsSkincareLibrary
    ? [
        searchSkincareLibrarySchema(),
        saveSkincareLibraryEntrySchema(),
        setSkincareRoutineMembershipSchema()
      ]
    : [])
];
```

In `executeTools`:
- search → return `JSON.stringify(searchProductLibrary(...))` (non-null → continue turn)
- save → validate, upsert, `github.writeFile(SKINCARE_PRODUCT_LIBRARY_PATH, ...)`, return JSON ok
- set membership → validate product exists, add/remove, write membership path, return JSON ok

Emit SSE events optional: `skincare_library_saved` / `skincare_routine_updated` (only if chat-controller already has a pattern; otherwise skip client toast — YAGNI).

- [ ] **Step 4: Update protocol**

Replace Routines section in `config/hyaluronica-protocol.md`:

```md
## Routines and library

Adam's product shelf and AM/PM rotation live in Life Hub (`product-library` + routine membership). Prefer the Skincare tab for one-tap logs.

When he asks to add, rename, note, or rotate products:
1. `search_skincare_library` before creating duplicates
2. `save_skincare_library_entry` to create/update shelf rows
3. `set_skincare_routine_membership` to add/remove on am|pm

Do not tell him lasting list changes need a config edit. Removing from a routine does not delete the shelf entry.
```

- [ ] **Step 5: Integration tests in `chat-function.test.js`**

- Hyaluronica message registers three skincare tools
- Non-hyaluronica does not
- `search_skincare_library` returns matches and continues
- `save_skincare_library_entry` writes `data/skincare/product-library.json`
- `set_skincare_routine_membership` writes membership

- [ ] **Step 6: Run**

```bash
node --test tests/unit/skincare-library-tools.test.js tests/integration/chat-function.test.js
```

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/_shared/skincare-library-tools.mjs \
  netlify/functions/chat.mjs \
  netlify/functions/_shared/persona.mjs \
  config/hyaluronica-protocol.md \
  tests/unit/skincare-library-tools.test.js \
  tests/integration/chat-function.test.js
git commit -m "$(cat <<'EOF'
feat: give Hyaluronica skincare library and routine tools

Search/save shelf and set AM/PM membership with continue-turn results.
EOF
)"
```

---

### Task 7: Cut over old catalog + cache bump + full verify

**Files:**
- Modify: any remaining imports of live catalog resolve/append/retire in app
- Optionally modify: `netlify/functions/skincare-catalog.mjs` to document deprecated (leave in place unread by client)
- Modify: `service-worker.js` cache version
- Update: `tests/unit/skincare-catalog.test.js` — keep for migrate parse helpers still used, or trim dead append/retire tests if functions remain only for migrate

- [ ] **Step 1: Grep for stale usage**

```bash
rg -n "retireProduct|appendProduct|getCatalog|/api/skincare/catalog|onRetireProduct|latestCatalog|onCatalogChanged" js netlify tests
```

Fix any remaining client/call sites.

- [ ] **Step 2: Bump service worker shell cache** string (same pattern as prior skincare PRs).

- [ ] **Step 3: Full test run**

```bash
npm test
```

Expected: all unit + integration pass.

- [ ] **Step 4: Manual smoke (local mock if available)**

- Open Skincare → ⋯ → Remove from routine → product gone from row, still in From library
- + Add → From library → add back
- + Add → New → type partial match → select existing
- + Add → unique → Just this time → Log includes it; reload → not on shelf
- Chat Hyaluronica: “add X to my library and put it on PM” → tools fire; tab refresh shows it

- [ ] **Step 5: Commit**

```bash
git add -u service-worker.js js netlify tests
git commit -m "$(cat <<'EOF'
chore: cut over skincare tab off legacy catalog endpoint

Bump SW cache after library membership UX lands.
EOF
)"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Shared `product-library.json` | Task 1 |
| `routine-membership.json` | Task 2 |
| Migrate catalog / seed defaults | Tasks 1–3 |
| ⋯ menu remove-from-routine only | Task 5 |
| + Add From library \| New/one-off + typeahead | Task 5 |
| One-off just this time | Tasks 4–5 |
| HTTP library + routines APIs | Task 3 |
| Hyaluronica search/save/membership + log_entry | Task 6 |
| Protocol update | Task 6 |
| No hard-delete v1 | All tasks omit delete |
| Hammond deferred | Explicitly out of scope |
| Tests unit/integration/UI | Tasks 1–7 |

No TBD placeholders. Naming consistent: `product_id` on wire, `productId` in JS callbacks, paths as above.
