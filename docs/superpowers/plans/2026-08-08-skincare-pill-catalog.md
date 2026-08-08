# Skincare Pill Logging + Routine Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace skincare tick lists with multi-select product pills + Log, and persist append/retire catalog changes to `data/skincare/routine-catalog.json` via an authenticated Netlify function.

**Architecture:** Pure catalog helpers resolve active products (defaults ∪ overlay − retired), append, and retire. A Netlify `skincare-catalog` function GET/POSTs the GitHub blob. The client loads the catalog into the Skincare model, renders pills (exclusive choices unchanged), supports + Add with Keep-in-routine, and Retire via a visible ⋯ control. Logging still uses `/api/chat/confirm` with `overwrite: true`.

**Tech Stack:** Vanilla JS, Netlify Functions, GitHub Contents API, `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-08-skincare-pill-catalog-design.md`

**Deploy:** Local commits only until Adam asks to push.

---

## File map

| File | Responsibility |
|------|----------------|
| `js/app/skincare-catalog.js` | Pure catalog helpers: empty/seed shape, resolve active products, append, retire, parse/validate JSON |
| `netlify/functions/_shared/skincare-catalog.mjs` | Re-export or thin mirror of the same helpers for the function (prefer identical logic; copy with sync comment if ESM pathing from functions to `js/app` is awkward — Life Hub already imports `js/core` from functions, so **import from `../../../js/app/skincare-catalog.js`** if tests allow) |
| `netlify/functions/skincare-catalog.mjs` | Authenticated GET (read catalog) + POST `{ action: 'append'\|'retire', routine, name }` |
| `js/app/skincare-routines-data.js` | `buildProductList` accepts resolved product list / one-offs; keep defaults |
| `js/app/render-skincare.js` | Pills instead of checkboxes; Log label; Add UI; Retire ⋯ |
| `js/app/skincare-controller.js` | `onAddProduct`, `onRetireProduct`, catalog API calls + status |
| `js/app/skincare-api.js` (create) or extend `chat-api` | `fetchCatalog` / `mutateCatalog` HTTP helpers |
| `js/app/app-controller.js` | Load catalog when rendering Skincare; pass into model/render |
| `js/app/skincare-model.js` | Attach resolved `routines` products from catalog overlay |
| `css/app.css` | Product pill row; add form; retire button |
| `tests/unit/skincare-catalog.test.js` | Helper coverage |
| `tests/unit/skincare-routines.test.js` | buildProductList updates |
| `tests/unit/render-skincare.test.js` | Pills / Log / no checkboxes |
| `tests/unit/skincare-controller.test.js` | Add/retire/log wiring |
| `tests/integration/skincare-catalog-function.test.js` | GET/POST handler |
| `service-worker.js` | Bump shell cache |
| `netlify.toml` | Ensure function directory already covers new file (no change if `netlify/functions`) |

**Catalog path:** `data/skincare/routine-catalog.json`

**Canonical JSON shape:**
```json
{
  "schema_version": 1,
  "am": { "products": [], "retired": [], "extras": ["Sheet mask"] },
  "pm": { "products": [], "retired": [], "extras": ["Sheet mask"] }
}
```

**Retire affordance (locked):** visible **⋯** button on each catalog product pill (not long-press-only).

---

### Task 1: Pure catalog helpers + tests

**Files:**
- Create: `js/app/skincare-catalog.js`
- Create: `tests/unit/skincare-catalog.test.js`

- [ ] **Step 1: Write failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SKINCARE_CATALOG_PATH,
  emptyCatalog,
  parseCatalog,
  resolveActiveProducts,
  appendProduct,
  retireProduct
} from '../../js/app/skincare-catalog.js';
import { SKINCARE_ROUTINES } from '../../js/app/skincare-routines-data.js';

test('SKINCARE_CATALOG_PATH is the GitHub blob path', () => {
  assert.equal(SKINCARE_CATALOG_PATH, 'data/skincare/routine-catalog.json');
});

test('parseCatalog returns null for invalid input', () => {
  assert.equal(parseCatalog(null), null);
  assert.equal(parseCatalog('nope'), null);
  assert.equal(parseCatalog({}), null);
});

test('resolveActiveProducts uses defaults when catalog missing', () => {
  assert.deepEqual(
    resolveActiveProducts('am', null, SKINCARE_ROUTINES),
    [...SKINCARE_ROUTINES.am.products]
  );
});

test('resolveActiveProducts prefers catalog products and drops retired', () => {
  const catalog = emptyCatalog(SKINCARE_ROUTINES);
  catalog.am.products = ['Cleanser A', 'Moisturizer B'];
  catalog.am.retired = ['Moisturizer B'];
  assert.deepEqual(resolveActiveProducts('am', catalog, SKINCARE_ROUTINES), ['Cleanser A']);
});

test('appendProduct appends without wiping and skips duplicates', () => {
  const catalog = emptyCatalog(SKINCARE_ROUTINES);
  const base = [...catalog.am.products];
  const next = appendProduct(catalog, 'am', 'New Cleanser');
  assert.deepEqual(next.am.products.slice(0, base.length), base);
  assert.ok(next.am.products.includes('New Cleanser'));
  const again = appendProduct(next, 'am', 'New Cleanser');
  assert.equal(again.am.products.filter(n => n === 'New Cleanser').length, 1);
});

test('appendProduct refuses blank names', () => {
  const catalog = emptyCatalog(SKINCARE_ROUTINES);
  assert.equal(appendProduct(catalog, 'am', '  '), null);
});

test('retireProduct moves from products to retired', () => {
  const catalog = emptyCatalog(SKINCARE_ROUTINES);
  const name = catalog.pm.products[0];
  const next = retireProduct(catalog, 'pm', name);
  assert.equal(next.pm.products.includes(name), false);
  assert.ok(next.pm.retired.includes(name));
});

test('retireProduct is a no-op for unknown names', () => {
  const catalog = emptyCatalog(SKINCARE_ROUTINES);
  const next = retireProduct(catalog, 'am', 'Not A Real Product');
  assert.deepEqual(next, catalog);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test tests/unit/skincare-catalog.test.js`  
Expected: FAIL module not found

- [ ] **Step 3: Implement `js/app/skincare-catalog.js`**

```js
export const SKINCARE_CATALOG_PATH = 'data/skincare/routine-catalog.json';

export function emptyCatalog(defaults) {
  return {
    schema_version: 1,
    am: {
      products: [...(defaults?.am?.products ?? [])],
      retired: [],
      extras: [...(defaults?.extras ?? [])]
    },
    pm: {
      products: [...(defaults?.pm?.products ?? [])],
      retired: [],
      extras: [...(defaults?.extras ?? [])]
    }
  };
}

export function parseCatalog(value) {
  const raw = typeof value === 'string'
    ? (() => { try { return JSON.parse(value); } catch { return null; } })()
    : value;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.schema_version !== 1) return null;
  for (const key of ['am', 'pm']) {
    const block = raw[key];
    if (!block || typeof block !== 'object' || Array.isArray(block)) return null;
    if (!Array.isArray(block.products) || !Array.isArray(block.retired)) return null;
    if (block.extras != null && !Array.isArray(block.extras)) return null;
    if (![...block.products, ...block.retired, ...(block.extras ?? [])].every(n => typeof n === 'string')) {
      return null;
    }
  }
  return {
    schema_version: 1,
    am: {
      products: [...raw.am.products],
      retired: [...raw.am.retired],
      extras: [...(raw.am.extras ?? [])]
    },
    pm: {
      products: [...raw.pm.products],
      retired: [...raw.pm.retired],
      extras: [...(raw.pm.extras ?? [])]
    }
  };
}

export function resolveActiveProducts(routineKey, catalog, defaults) {
  const retired = new Set(catalog?.[routineKey]?.retired ?? []);
  const list = catalog?.[routineKey]?.products ?? defaults?.[routineKey]?.products ?? [];
  return list.filter(name => typeof name === 'string' && name && !retired.has(name));
}

export function appendProduct(catalog, routineKey, name) {
  const parsed = parseCatalog(catalog);
  if (!parsed || (routineKey !== 'am' && routineKey !== 'pm')) return null;
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return null;
  if (parsed[routineKey].products.includes(trimmed)) return parsed;
  return {
    ...parsed,
    [routineKey]: {
      ...parsed[routineKey],
      products: [...parsed[routineKey].products, trimmed]
    }
  };
}

export function retireProduct(catalog, routineKey, name) {
  const parsed = parseCatalog(catalog);
  if (!parsed || (routineKey !== 'am' && routineKey !== 'pm')) return null;
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return null;
  if (!parsed[routineKey].products.includes(trimmed)) return parsed;
  return {
    ...parsed,
    [routineKey]: {
      ...parsed[routineKey],
      products: parsed[routineKey].products.filter(n => n !== trimmed),
      retired: parsed[routineKey].retired.includes(trimmed)
        ? parsed[routineKey].retired
        : [...parsed[routineKey].retired, trimmed]
    }
  };
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `node --test tests/unit/skincare-catalog.test.js`

- [ ] **Step 5: Commit**

```bash
git add js/app/skincare-catalog.js tests/unit/skincare-catalog.test.js
git commit -m "feat: add skincare routine catalog helpers"
```

---

### Task 2: Netlify skincare-catalog function

**Files:**
- Create: `netlify/functions/skincare-catalog.mjs`
- Create: `tests/integration/skincare-catalog-function.test.js`

Follow patterns from `chat-confirm.mjs` / `fitness-templates.mjs`: session cookie, CORS, GitHub client, `writeFile`.

- [ ] **Step 1: Failing integration tests**

Cover:
1. GET returns `{ ok: true, data: { catalog } }` — missing blob → `catalog: null` (client uses defaults).  
2. POST `append` with valid session writes JSON and returns updated catalog.  
3. POST `retire` moves product.  
4. Unauthenticated → 401.  
5. Invalid body → 400.

Use `createSessionToken` + GitHub fetch stub like other integration tests.

- [ ] **Step 2: Implement handler**

```js
export const config = { path: '/api/skincare/catalog' };

export function createSkincareCatalogHandler({ env, fetchImpl, verifySessionToken, createGitHubClient, now } = {}) {
  // GET: resolveTree → find SKINCARE_CATALOG_PATH → readBlob → parseCatalog → json
  // POST body: { action: 'append'|'retire', routine: 'am'|'pm', name: string }
  //   load catalog or emptyCatalog(SKINCARE_ROUTINES)
  //   apply appendProduct / retireProduct
  //   writeFile path, JSON.stringify(catalog, null, 2), sha if exists
  //   return { ok: true, data: { catalog, sha } }
}
export default createSkincareCatalogHandler();
```

Import `SKINCARE_ROUTINES` from `../../js/app/skincare-routines-data.js` and catalog helpers from `../../js/app/skincare-catalog.js` (functions already import `js/core`).

Commit messages:
- append: `chore(skincare): append ${routine} product`
- retire: `chore(skincare): retire ${routine} product`

- [ ] **Step 3: Run integration tests — PASS**

- [ ] **Step 4: Commit**

```bash
git add netlify/functions/skincare-catalog.mjs tests/integration/skincare-catalog-function.test.js
git commit -m "feat: add skincare catalog Netlify read/write API"
```

---

### Task 3: buildProductList + model resolve overlay

**Files:**
- Modify: `js/app/skincare-routines-data.js`
- Modify: `js/app/skincare-model.js`
- Modify: `tests/unit/skincare-routines.test.js`

- [ ] **Step 1: Extend `buildProductList`**

Accept optional `activeProducts` (resolved list) and `oneOffs`:

```js
export function buildProductList(routineKey, {
  choiceSelections = {},
  enabledProducts = null,
  extras = [],
  activeProducts = null,
  oneOffs = []
} = {}) {
  const routine = SKINCARE_ROUTINES[routineKey];
  if (!routine) return [];
  const selected = [];
  for (const choice of Object.values(routine.choices ?? {})) {
    const value = choiceSelections[choice.id] ?? choice.default;
    if (value) selected.push(value);
  }
  const fixed = activeProducts ?? routine.products ?? [];
  const enabled = enabledProducts == null
    ? fixed
    : fixed.filter(name => enabledProducts.includes(name));
  const extrasAndOneOffs = [
    ...extras.filter(Boolean),
    ...oneOffs.filter(name => typeof name === 'string' && name.trim() && enabledProducts?.includes(name))
  ];
  // Simpler approach locked for implementer:
  // enabledProducts lists every selected multi-select name (catalog + one-offs).
  // fixed = activeProducts ?? defaults; oneOffs that are selected are included via:
  const selectedFixed = enabledProducts == null
    ? [...fixed, ...oneOffs]
    : [...fixed, ...oneOffs].filter(name => enabledProducts.includes(name));
  return [...selected, ...selectedFixed, ...extras.filter(Boolean)];
}
```

**Clarify (use this exact behaviour):**

```js
const pool = [...(activeProducts ?? routine.products ?? []), ...(oneOffs ?? [])];
const uniquePool = [...new Set(pool)];
const enabled = enabledProducts == null
  ? uniquePool
  : uniquePool.filter(name => enabledProducts.includes(name));
return [...selected, ...enabled, ...extras.filter(Boolean)];
```

Update unit tests for one-offs + activeProducts overlay.

- [ ] **Step 2: `buildSkincareModel` accepts `catalog`**

When building `routines.am.products` / `pm.products`, set to `resolveActiveProducts(key, catalog, skincareRoutines)`. Extras: `catalog?.am?.extras ?? catalog?.pm?.extras ?? routines.extras` (prefer union or keep global `SKINCARE_ROUTINES.extras` for v1 — **lock: keep `SKINCARE_ROUTINES.extras` for display; catalog extras reserved for later**).

- [ ] **Step 3: Tests PASS + commit**

```bash
git add js/app/skincare-routines-data.js js/app/skincare-model.js tests/unit/skincare-routines.test.js
git commit -m "feat: resolve skincare products from catalog overlay"
```

---

### Task 4: Render product pills + Log + Add + Retire UI

**Files:**
- Modify: `js/app/render-skincare.js`
- Modify: `css/app.css`
- Modify: `tests/unit/render-skincare.test.js`

- [ ] **Step 1: Failing render tests**

Assert:
- No `input[type=checkbox]` inside routine cards  
- Product controls are `button.skincare-chip`  
- Primary button text is `Log` or `Log again`  
- Add control exists (`+ Add` or similar)  
- Catalog product chips include a retire control with `aria-label` containing `Remove from rotation` or `⋯`

- [ ] **Step 2: Rewrite product section in `renderRoutineCard`**

Replace checkbox list with:

```js
const state = {
  choices: {},
  enabled: new Set(routine.products), // all active selected by default
  oneOffs: [],
  extras: new Set(),
  notes: ''
};

// products host
const list = root.createElement('div');
list.className = 'skincare-products skincare-products--pills';

function renderProductChips() {
  list.replaceChildren();
  const names = [...routine.products, ...state.oneOffs];
  for (const product of names) {
    const wrap = root.createElement('div');
    wrap.className = 'skincare-product-pill';
    const button = root.createElement('button');
    button.type = 'button';
    button.className = 'skincare-chip';
    if (state.enabled.has(product)) button.dataset.active = 'true';
    button.textContent = product;
    button.addEventListener('click', () => {
      if (state.enabled.has(product)) {
        state.enabled.delete(product);
        delete button.dataset.active;
      } else {
        state.enabled.add(product);
        button.dataset.active = 'true';
      }
    });
    wrap.append(button);
    const isOneOff = state.oneOffs.includes(product);
    if (!isOneOff) {
      const menu = root.createElement('button');
      menu.type = 'button';
      menu.className = 'skincare-product-pill__menu';
      menu.setAttribute('aria-label', `Remove ${product} from rotation`);
      menu.textContent = '⋯';
      menu.addEventListener('click', event => {
        event.stopPropagation();
        onRetireProduct?.({ routine: key, name: product });
      });
      wrap.append(menu);
    }
    list.append(wrap);
  }
}
renderProductChips();
```

Add form below pills:

```js
// + Add → shows input + Keep in routine checkbox (default checked) + confirm
// on confirm: if keep → onAddProduct({ routine, name, keep: true })
//             else → state.oneOffs.push(name); state.enabled.add(name); renderProductChips()
```

Done button → **Log** / **Log again**; `buildProductList(key, { choiceSelections: state.choices, enabledProducts: [...state.enabled], extras: [...state.extras], activeProducts: routine.products, oneOffs: state.oneOffs })`.

Pass `onAddProduct`, `onRetireProduct` through `renderSkincare` → cards.

- [ ] **Step 3: CSS**

```css
.skincare-products--pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}
.skincare-product-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
}
.skincare-product-pill__menu {
  /* small quiet button matching chip height */
}
.skincare-add { /* inline add row */ }
```

Remove reliance on `.skincare-product` checkbox layout for the main list (can leave old CSS unused).

- [ ] **Step 4: Tests PASS + commit**

```bash
git add js/app/render-skincare.js css/app.css tests/unit/render-skincare.test.js
git commit -m "feat: render skincare products as selectable pills"
```

---

### Task 5: Client API + controller + app wiring

**Files:**
- Create: `js/app/skincare-api.js`
- Modify: `js/app/skincare-controller.js`
- Modify: `js/app/app-controller.js`
- Modify: `js/app/main.js` (wire api if needed)
- Modify: `tests/unit/skincare-controller.test.js`
- Modify: `service-worker.js` (bump `life-hub-shell-vN` by 1; ensure new JS files are in `SHELL_FILES` if listed)

- [ ] **Step 1: `createSkincareApi(fetchImpl)`**

```js
export function createSkincareApi(fetchImpl = fetch) {
  return {
    async getCatalog() {
      const response = await fetchImpl('/api/skincare/catalog', { method: 'GET', credentials: 'include' });
      // parse { ok, data: { catalog } }
    },
    async appendProduct({ routine, name }) {
      const response = await fetchImpl('/api/skincare/catalog', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'append', routine, name })
      });
      // return catalog
    },
    async retireProduct({ routine, name }) {
      // action: 'retire'
    }
  };
}
```

(Match how other APIs send cookies — if site uses same-origin `fetch` without credentials, follow existing `chat-api` pattern exactly.)

- [ ] **Step 2: Controller**

```js
export function createSkincareController({ root, chatApi, skincareApi, onRecordWritten, onCatalogChanged, isOnline }) {
  // existing save/log
  async function addProduct({ routine, name, keep }) {
    if (!keep) return { oneOff: true, name };
    // call skincareApi.appendProduct; setStatus; onCatalogChanged(catalog)
  }
  async function retireProduct({ routine, name }) {
    // skincareApi.retireProduct; onCatalogChanged
  }
  return { ..., onAddProduct: ..., onRetireProduct: ... };
}
```

- [ ] **Step 3: `renderSkincareSection`**

- Keep `latestCatalog` in app-controller closure (null initially).  
- On show skincare: `skincareApi.getCatalog()` → store → rebuild model with catalog → render with add/retire handlers that refresh catalog + re-render.  
- `onLogRoutine` unchanged.

- [ ] **Step 4: Unit tests for controller add/retire status + API calls**

- [ ] **Step 5: Commit**

```bash
git add js/app/skincare-api.js js/app/skincare-controller.js js/app/app-controller.js js/app/main.js \
  tests/unit/skincare-controller.test.js service-worker.js
git commit -m "feat: wire skincare catalog load, append, and retire"
```

---

### Task 6: Verification

- [ ] **Step 1:** `npm test` — all green  
- [ ] **Step 2:** Manual checklist (local/dev):  
  - AM/PM show pills, no ticks  
  - Deselect a product, Log → confirm payload omits it  
  - Add + Keep → product remains after refresh (needs GitHub env)  
  - Add without Keep → selected for log only  
  - ⋯ Remove from rotation → pill gone; others remain  
- [ ] **Step 3:** No commit unless fixing bugs found

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Multi-select product pills | 4 |
| Exclusive toner/seal unchanged | 4 |
| Log button | 4 |
| Add + Keep on/off | 4–5 |
| Append without wipe | 1, 2, 5 |
| Retire to retired[] | 1, 2, 4, 5 |
| GitHub catalog path/shape | 1–2 |
| Lazy create on first mutation | 2 |
| Confirm log path unchanged | 5 |
| No restore v1 | omitted |
| Choice lists not editable | omitted |

## Placeholder scan

Retire control locked to **⋯**. Catalog extras display locked to code defaults for v1.
