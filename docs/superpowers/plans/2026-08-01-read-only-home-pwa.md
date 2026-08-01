# Read-only Home PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a runnable, installable, fixture-backed Life Hub Home screen that derives the approved totals through the existing core modules and remains readable offline.

**Architecture:** Keep the application framework-free and static. Pure modules load and validate fixture documents, derive a Home presentation model, and render into semantic HTML; a small Node server supports local development, while a manifest and service worker provide installation and cached read-only behavior.

**Tech Stack:** Node.js 22, native ES modules, native `node:test`, js-yaml 4.3.0, semantic HTML, CSS, browser service workers, and browser automation for acceptance checks.

## Global Constraints

- Preserve the existing `js/core` interfaces and all 64 passing foundation tests.
- Use the approved Clinical Glass colors: Warm White `#FAF8F2`, Depth `#0A1536`, Marine `#142B51`, Wave `#376FB7`, and restrained High Sea `#F68620`.
- Serve js-yaml locally; the running application must not depend on a CDN or other third-party origin.
- Use fixture Markdown as the only event source; do not add authentication, GitHub API access, chat, writes, charts, domain pages, or production credentials.
- Treat Markdown and warnings as untrusted text; never render them with `innerHTML`.
- Use Australia/Sydney rules and select the greatest event date in the fixture corpus as the display date.
- Support desktop and a 390 px viewport without horizontal overflow; interactive targets are at least 44 px.
- Offline behavior is read-only and uses only previously cached shell and fixture responses.
- Follow red-green-refactor for every production function.

---

## File map

- `index.html`: semantic application shell and named rendering regions.
- `css/app.css`: Clinical Glass tokens, desktop rail, responsive cards, mobile bottom bar, focus, and reduced motion.
- `js/app/load-events.js`: manifest and Markdown retrieval with partial-failure warnings.
- `js/app/home-model.js`: pure composition of core aggregation and target helpers.
- `js/app/render-home.js`: DOM-only rendering using `textContent`, attributes, and classes.
- `js/app/main.js`: startup, retry, navigation notices, network status, and service-worker registration.
- `fixtures/manifest.json`: canonical fixture paths and their static URLs.
- `manifest.webmanifest`: install metadata.
- `service-worker.js`: shell precache, same-origin stale-while-revalidate data reads, and navigation fallback.
- `scripts/prepare-web.mjs`: copy the pinned browser YAML module into generated local assets.
- `scripts/serve.mjs`: path-safe static development server.
- `tests/unit/home-model.test.js`: exact Home presentation behavior.
- `tests/unit/load-events.test.js`: loader success and partial-failure behavior.
- `tests/unit/web-assets.test.js`: shell, manifest, service-worker inventory, and local dependency checks.
- `tests/integration/static-server.test.js`: local server routing, MIME types, and traversal rejection.
- `tests/browser/home.spec.mjs`: desktop, 390 px, navigation, safety, and offline acceptance.
- `README.md`: one-command local start and verification instructions.

---

### Task 1: Fixture loader and Home presentation model

**Files:**
- Create: `fixtures/manifest.json`
- Create: `js/app/load-events.js`
- Create: `js/app/home-model.js`
- Create: `tests/unit/load-events.test.js`
- Create: `tests/unit/home-model.test.js`

**Interfaces:**
- Produces: `loadEventManifest({ fetchImpl, manifestUrl, loadYaml }) -> Promise<{ events, warnings }>`
- Produces: `selectDisplayDate(events) -> YYYY-MM-DD | null`
- Produces: `buildHomeModel({ events, targetsConfig, date }) -> HomeModel`
- `HomeModel` fields: `date`, `nutrition`, `targets`, `dayType`, `recovery`, `workoutStreak`, `completeness`, and `progress`.

- [ ] **Step 1: Write the failing fixture-loader tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'js-yaml';
import { loadEventManifest } from '../../js/app/load-events.js';

const responses = new Map([
  ['/fixtures/manifest.json', { files: [
    { path: 'data/nutrition/2026/07/2026-07-30-breakfast.md', url: '/breakfast.md' },
    { path: 'data/nutrition/2026/07/2026-07-30-lunch.md', url: '/missing.md' }
  ] }],
  ['/breakfast.md', `---\nschema_version: 1\nid: meal-1\ntype: meal\ndate: '2026-07-30'\ntime: '07:45'\ncreated_at: '2026-07-30T07:45:00+10:00'\nupdated_at: '2026-07-30T07:45:00+10:00'\nsource: test_fixture\nmeal: breakfast\ncalories: 520\nprotein_g: 38\nfat_g: 12\n---\nBreakfast`]
]);

const fetchImpl = async url => {
  if (!responses.has(url)) return { ok: false, status: 404, text: async () => '' };
  const value = responses.get(url);
  return {
    ok: true,
    json: async () => value,
    text: async () => value
  };
};

test('loads valid events and reports unavailable files without discarding good data', async () => {
  const result = await loadEventManifest({ fetchImpl, manifestUrl: '/fixtures/manifest.json', loadYaml: load });
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].record.id, 'meal-1');
  assert.deepEqual(result.warnings, [{
    path: 'data/nutrition/2026/07/2026-07-30-lunch.md',
    code: 'unavailable'
  }]);
});

test('rejects a manifest that cannot be loaded', async () => {
  await assert.rejects(
    loadEventManifest({ fetchImpl, manifestUrl: '/absent.json', loadYaml: load }),
    /fixture manifest/i
  );
});
```

- [ ] **Step 2: Run the loader tests and verify RED**

Run: `npm test -- tests/unit/load-events.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `js/app/load-events.js`.

- [ ] **Step 3: Implement the minimal loader**

```js
import { parseEventDocument } from '../core/records.js';

export async function loadEventManifest({ fetchImpl = fetch, manifestUrl = '/fixtures/manifest.json', loadYaml }) {
  const manifestResponse = await fetchImpl(manifestUrl);
  if (!manifestResponse.ok) throw new Error('Fixture manifest is unavailable');
  const manifest = await manifestResponse.json();
  if (!Array.isArray(manifest.files)) throw new TypeError('Fixture manifest files must be an array');

  const events = [];
  const warnings = [];
  for (const file of manifest.files) {
    try {
      const response = await fetchImpl(file.url);
      if (!response.ok) throw new Error('unavailable');
      events.push(parseEventDocument(await response.text(), file.path, loadYaml));
    } catch (error) {
      warnings.push({
        path: typeof file?.path === 'string' ? file.path : 'unknown fixture',
        code: error?.message === 'unavailable' ? 'unavailable' : 'invalid'
      });
    }
  }
  return { events, warnings };
}
```

- [ ] **Step 4: Run the loader tests and verify GREEN**

Run: `npm test -- tests/unit/load-events.test.js`

Expected: 2 tests pass.

- [ ] **Step 5: Write the failing Home-model tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'js-yaml';
import { readFile } from 'node:fs/promises';
import { loadEventManifest } from '../../js/app/load-events.js';
import { buildHomeModel, selectDisplayDate } from '../../js/app/home-model.js';

const manifest = JSON.parse(await readFile(new URL('../../fixtures/manifest.json', import.meta.url)));
const targetsConfig = load(await readFile(new URL('../../config/targets.yml', import.meta.url), 'utf8'));
const fetchImpl = async url => {
  const entry = manifest.files.find(file => file.url === url);
  if (url === '/fixtures/manifest.json') return { ok: true, json: async () => manifest };
  if (!entry) return { ok: false, status: 404 };
  return { ok: true, text: async () => readFile(new URL(`../..${url}`, import.meta.url), 'utf8') };
};

test('selects the greatest fixture event date', async () => {
  const { events } = await loadEventManifest({ fetchImpl, loadYaml: load });
  assert.equal(selectDisplayDate(events), '2026-07-30');
  assert.equal(selectDisplayDate([]), null);
});

test('builds the approved Home fixture model through core modules', async () => {
  const { events } = await loadEventManifest({ fetchImpl, loadYaml: load });
  const model = buildHomeModel({ events, targetsConfig, date: selectDisplayDate(events) });
  assert.deepEqual(model.nutrition, {
    calories: 1130, protein_g: 80, fat_g: 27, sodium_mg: 1100,
    calcium_mg: 590, polyphenol_score: 9,
    meals: {
      breakfast: { protein_g: 38 }, lunch: { protein_g: 42 },
      dinner: { protein_g: 0 }, snack: { protein_g: 0 }
    }
  });
  assert.equal(model.targets.calories, 1900);
  assert.equal(model.dayType, 'workout_30');
  assert.equal(model.workoutStreak, 1);
  assert.deepEqual(model.progress, { calories: 59, protein: 67, fat: 54, logging: 60 });
});
```

- [ ] **Step 6: Run the Home-model tests and verify RED**

Run: `npm test -- tests/unit/home-model.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `js/app/home-model.js`.

- [ ] **Step 7: Implement the pure Home model and real manifest**

```js
import {
  aggregateNutrition, calculateWorkoutStreak, getLoggingCompleteness,
  hasRecoveryBonus, resolveDayType
} from '../core/aggregate.js';
import { getDayTargets } from '../core/targets.js';

const percentage = (value, target) => target > 0 ? Math.round((value / target) * 100) : 0;

export function selectDisplayDate(events) {
  return events.map(event => event.record.date).sort().at(-1) ?? null;
}

export function buildHomeModel({ events, targetsConfig, date }) {
  if (!date) throw new RangeError('Home display date is unavailable');
  const nutrition = aggregateNutrition(events, date);
  const dayType = resolveDayType(events, date);
  const recovery = hasRecoveryBonus(events, date);
  const targets = getDayTargets(targetsConfig, date, dayType, recovery);
  const completeness = getLoggingCompleteness(events, date);
  return {
    date, nutrition, targets, dayType, recovery,
    workoutStreak: calculateWorkoutStreak(events, date),
    completeness,
    progress: {
      calories: percentage(nutrition.calories, targets.calories),
      protein: percentage(nutrition.protein_g, targets.protein_g),
      fat: percentage(nutrition.fat_g, targets.fat_ceiling_g),
      logging: percentage(completeness.complete, completeness.total)
    }
  };
}
```

Create `fixtures/manifest.json` with the four existing fixture paths and URLs rooted at `/tests/fixtures/valid/`.

- [ ] **Step 8: Run the focused and full suites**

Run: `npm test -- tests/unit/load-events.test.js tests/unit/home-model.test.js && npm test`

Expected: focused tests pass; all existing and new tests pass.

- [ ] **Step 9: Commit the loader and Home model**

```bash
git add fixtures/manifest.json js/app/load-events.js js/app/home-model.js tests/unit/load-events.test.js tests/unit/home-model.test.js
git commit -m "feat: derive Home model from fixture events"
```

---

### Task 2: Semantic Home shell and safe renderer

**Files:**
- Create: `index.html`
- Create: `css/app.css`
- Create: `js/app/render-home.js`
- Create: `js/app/main.js`
- Create: `tests/unit/web-assets.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `loadEventManifest`, `selectDisplayDate`, and `buildHomeModel` from Task 1.
- Produces: `renderHome(root, model)`, `renderWarnings(root, warnings)`, `renderUnavailable(root, message)`, and `startApp(dependencies)`.

- [ ] **Step 1: Write failing structural asset tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Home shell exposes landmarks and named rendering regions', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  for (const fragment of [
    '<header', '<nav', '<main', '<h1', 'id="home-dashboard"',
    'id="app-status"', 'aria-live="polite"', 'class="mobile-nav"'
  ]) assert.match(html, new RegExp(fragment));
  assert.doesNotMatch(html, /https?:\/\//);
});

test('renderer assigns untrusted values as text instead of HTML', async () => {
  const source = await readFile(new URL('../../js/app/render-home.js', import.meta.url), 'utf8');
  assert.match(source, /textContent/);
  assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|outerHTML/);
});

test('responsive stylesheet contains the approved palette and mobile breakpoint', async () => {
  const css = await readFile(new URL('../../css/app.css', import.meta.url), 'utf8');
  for (const color of ['#FAF8F2', '#0A1536', '#142B51', '#376FB7', '#F68620']) {
    assert.match(css, new RegExp(color, 'i'));
  }
  assert.match(css, /@media\s*\([^)]*max-width:\s*48rem/);
  assert.match(css, /min-height:\s*44px/);
}
```

- [ ] **Step 2: Run asset tests and verify RED**

Run: `npm test -- tests/unit/web-assets.test.js`

Expected: FAIL because `index.html` does not exist.

- [ ] **Step 3: Build the minimal semantic shell and renderer**

Create `index.html` with a skip link; branded desktop rail; Home, Chat, Nutrition, Fitness, Body, Mind, Skincare, Calendar, and Central Node buttons; a `main` region containing loading skeletons and named metric values; a polite live region; retry button; and Home, Chat, Calendar, More mobile controls.

Implement the renderer with a single safe setter:

```js
const setText = (root, selector, value) => {
  const element = root.querySelector(selector);
  if (element) element.textContent = String(value);
};

export function renderHome(root, model) {
  root.dataset.state = 'ready';
  setText(root, '[data-value="calories"]', model.nutrition.calories.toLocaleString('en-AU'));
  setText(root, '[data-target="calories"]', `of ${model.targets.calories.toLocaleString('en-AU')} kcal`);
  setText(root, '[data-value="protein"]', `${model.nutrition.protein_g} g`);
  setText(root, '[data-value="fat"]', `${model.nutrition.fat_g} g`);
  setText(root, '[data-value="streak"]', String(model.workoutStreak));
  setText(root, '[data-value="logging"]', `${model.completeness.complete} of ${model.completeness.total}`);
  for (const [name, value] of Object.entries(model.progress)) {
    root.querySelector(`[data-progress="${name}"]`)?.style.setProperty('--progress', `${Math.min(value, 100)}%`);
  }
}
```

`renderWarnings` creates list items with `document.createElement` and assigns `textContent`. `renderUnavailable` switches the root state, sets friendly copy, and reveals retry.

- [ ] **Step 4: Add Clinical Glass responsive styling**

Define color, spacing, radius, shadow, and typography tokens. Use a fixed 15rem desktop rail, a fluid metric grid, a restrained glass effect with an opaque fallback, tabular numeric values, high-contrast focus rings, `prefers-reduced-motion`, and a `48rem` breakpoint that hides the rail and fixes the mobile navigation above the safe-area inset.

- [ ] **Step 5: Wire startup, retry, navigation notices, and network state**

```js
import { load } from '/vendor/js-yaml.mjs';
import { loadEventManifest } from './load-events.js';
import { buildHomeModel, selectDisplayDate } from './home-model.js';
import { renderHome, renderUnavailable, renderWarnings } from './render-home.js';

export async function startApp({ root = document, fetchImpl = fetch } = {}) {
  root.querySelector('#app')?.setAttribute('data-state', 'loading');
  try {
    const [source, targetsResponse] = await Promise.all([
      loadEventManifest({ fetchImpl, loadYaml: load }),
      fetchImpl('/config/targets.yml')
    ]);
    if (!targetsResponse.ok) throw new Error('Targets are unavailable');
    const date = selectDisplayDate(source.events);
    const model = buildHomeModel({ events: source.events, targetsConfig: load(await targetsResponse.text()), date });
    renderHome(root, model);
    renderWarnings(root, source.warnings);
  } catch {
    renderUnavailable(root, 'Life Hub could not load its saved data. Check your connection and try again.');
  }
}
```

Unavailable navigation buttons announce “This section arrives in a later Life Hub phase.” Retry calls `startApp` again. `online` and `offline` listeners update a visible status chip and last-success timestamp. Service-worker registration is attempted only when supported and never blocks rendering.

- [ ] **Step 6: Run tests and verify GREEN**

Run: `npm test -- tests/unit/web-assets.test.js && npm test`

Expected: all tests pass without warnings.

- [ ] **Step 7: Commit the shell and renderer**

```bash
git add index.html css/app.css js/app/render-home.js js/app/main.js tests/unit/web-assets.test.js package.json
git commit -m "feat: render responsive Life Hub Home shell"
```

---

### Task 3: Reproducible local runtime

**Files:**
- Create: `scripts/prepare-web.mjs`
- Create: `scripts/serve.mjs`
- Create: `tests/integration/static-server.test.js`
- Modify: `.gitignore`
- Modify: `package.json`

**Interfaces:**
- Produces: `prepare:web` copies `node_modules/js-yaml/dist/js-yaml.mjs` to `vendor/js-yaml.mjs`.
- Produces: `dev` prepares browser assets and serves the repository on `127.0.0.1`, default port `4173`.
- Produces: exported `createStaticServer({ root })` for integration tests.

- [ ] **Step 1: Write failing server integration tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createStaticServer } from '../../scripts/serve.mjs';

test('serves the Home shell with the correct content type', async t => {
  const server = createStaticServer({ root: new URL('../..', import.meta.url) });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/html/);
  assert.match(await response.text(), /Life Hub/);
});

test('does not serve paths outside the repository root', async t => {
  const server = createStaticServer({ root: new URL('../..', import.meta.url) });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/..%2Fpackage.json`);
  assert.equal(response.status, 400);
});
```

- [ ] **Step 2: Run server tests and verify RED**

Run: `npm test -- tests/integration/static-server.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/serve.mjs`.

- [ ] **Step 3: Implement vendor preparation and path-safe server**

`prepare-web.mjs` uses `mkdir` and `copyFile` from `node:fs/promises` and fails directly if the pinned package is absent.

`serve.mjs` decodes the request path, rejects NUL bytes and any decoded `..` segment, resolves `/` to `index.html`, returns accurate MIME types for HTML, CSS, JavaScript, JSON, YAML, Markdown, PNG, and web manifests, and exports `createStaticServer`. When invoked directly it listens on `process.env.PORT ?? 4173` and logs the exact local URL.

- [ ] **Step 4: Add scripts and ignore generated vendor output**

```json
{
  "scripts": {
    "prepare:web": "node scripts/prepare-web.mjs",
    "dev": "npm run prepare:web && node scripts/serve.mjs",
    "test": "node --test",
    "test:unit": "node --test tests/unit",
    "test:integration": "node --test tests/integration",
    "validate:fixtures": "node scripts/validate-fixtures.mjs"
  }
}
```

Add `/vendor/` to `.gitignore`.

- [ ] **Step 5: Run integration and full suites**

Run: `npm run prepare:web && npm test -- tests/integration/static-server.test.js && npm test`

Expected: generated `vendor/js-yaml.mjs` exists; all tests pass; `git status` does not list `vendor/`.

- [ ] **Step 6: Commit the local runtime**

```bash
git add scripts/prepare-web.mjs scripts/serve.mjs tests/integration/static-server.test.js package.json .gitignore
git commit -m "feat: add reproducible Life Hub local runtime"
```

---

### Task 4: Installable and offline read-only behavior

**Files:**
- Create: `manifest.webmanifest`
- Create: `service-worker.js`
- Create: `assets/icons/life-hub-192.png`
- Create: `assets/icons/life-hub-512.png`
- Modify: `index.html`
- Modify: `tests/unit/web-assets.test.js`

**Interfaces:**
- Produces: web app manifest with standalone display and local 192 px and 512 px icons.
- Produces: service worker cache `life-hub-shell-v1` and offline navigation fallback to `/index.html`.

- [ ] **Step 1: Add failing PWA inventory tests**

```js
test('web app manifest is installable and uses only local icons', async () => {
  const manifest = JSON.parse(await readFile(new URL('../../manifest.webmanifest', import.meta.url)));
  assert.equal(manifest.name, 'Life Hub');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.deepEqual(manifest.icons.map(icon => icon.sizes), ['192x192', '512x512']);
  assert.ok(manifest.icons.every(icon => icon.src.startsWith('/assets/icons/')));
});

test('service worker precaches the full read-only fixture slice', async () => {
  const worker = await readFile(new URL('../../service-worker.js', import.meta.url), 'utf8');
  for (const path of [
    '/index.html', '/css/app.css', '/js/app/main.js', '/vendor/js-yaml.mjs',
    '/config/targets.yml', '/fixtures/manifest.json'
  ]) assert.match(worker, new RegExp(path.replaceAll('/', '\\/')));
  assert.match(worker, /caches\.match/);
  assert.doesNotMatch(worker, /POST|PUT|PATCH|DELETE/);
});
```

- [ ] **Step 2: Run PWA tests and verify RED**

Run: `npm test -- tests/unit/web-assets.test.js`

Expected: FAIL because `manifest.webmanifest` is absent.

- [ ] **Step 3: Generate one source icon and exact install sizes**

Use the image-generation skill once with this prompt:

```text
Create a square app icon for a private personal dashboard named Life Hub. Deep navy field (#0A1536), a restrained warm-orange central pulse (#F68620), and two clean marine-blue concentric arcs (#376FB7) suggesting coordinated life domains. Minimal, clinical, calm, premium, no text, no letters, no gradients that reduce small-size clarity, centered with generous safe area, suitable for iOS Home Screen.
```

Inspect the result, save the approved source temporarily, then create exact assets:

```bash
sips -z 192 192 source-icon.png --out assets/icons/life-hub-192.png
sips -z 512 512 source-icon.png --out assets/icons/life-hub-512.png
```

- [ ] **Step 4: Implement the manifest and service worker**

The manifest uses `name: "Life Hub"`, `short_name: "Life Hub"`, `start_url: "/"`, `scope: "/"`, `display: "standalone"`, `background_color: "#FAF8F2"`, and `theme_color: "#0A1536"`.

The worker precaches the shell, local YAML module, configuration, manifest, both icons, the fixture manifest, and every fixture URL. It uses cache-first for shell requests, stale-while-revalidate for same-origin `GET` data requests, and returns cached `/index.html` for failed navigations. Failed background updates leave prior cached responses intact.

- [ ] **Step 5: Link install metadata from the shell**

Add the local web manifest, theme color, and Apple touch icon to `index.html`. Keep every URL same-origin.

- [ ] **Step 6: Run PWA and full tests**

Run: `npm test -- tests/unit/web-assets.test.js && npm test`

Expected: all tests pass and install assets have exact dimensions.

- [ ] **Step 7: Commit install and offline support**

```bash
git add manifest.webmanifest service-worker.js assets/icons index.html tests/unit/web-assets.test.js
git commit -m "feat: add installable offline Home experience"
```

---

### Task 5: Browser acceptance and usage documentation

**Files:**
- Create: `tests/browser/home.spec.mjs`
- Create: `README.md`
- Modify: `package.json`
- Modify: `docs/IMPLEMENTATION_STATUS.md`

**Interfaces:**
- Produces: `test:browser` script that runs the approved desktop and 390 px acceptance flow.
- Produces: one-command local usage through `npm run dev`.

- [ ] **Step 1: Write the browser acceptance script**

Using the bundled browser automation runtime, cover these assertions in `tests/browser/home.spec.mjs`:

```js
await page.goto(baseUrl);
await expect(page.getByRole('heading', { name: /home/i })).toBeVisible();
await expect(page.locator('[data-value="calories"]')).toHaveText('1,130');
await expect(page.locator('[data-value="protein"]')).toHaveText('80 g');
await expect(page.locator('[data-value="fat"]')).toHaveText('27 g');
await expect(page.locator('[data-value="streak"]')).toHaveText('1');
await expect(page.locator('[data-value="logging"]')).toHaveText('3 of 5');
await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
```

Run the flow once at the default desktop viewport and once at `{ width: 390, height: 844 }`. At 390 px assert the desktop rail is hidden, the mobile bar is visible, each control is at least 44 px high, and activating Chat produces the unavailable-section announcement without navigating away.

After a successful load, create an offline browser context, reload, and assert the same totals plus the offline status. A fresh offline context must show the recovery message rather than metrics.

- [ ] **Step 2: Run browser acceptance and verify RED**

Run: `npm run dev` in a retained session, then `npm run test:browser`.

Expected: FAIL because the `test:browser` script and browser harness are not yet wired.

- [ ] **Step 3: Wire the browser harness and fix only acceptance failures**

Add the smallest required local browser dependency or use the bundled Playwright package path. Add:

```json
{
  "scripts": {
    "test:browser": "node tests/browser/home.spec.mjs"
  }
}
```

If an acceptance assertion exposes a product defect, first add or refine the narrowest automated regression, watch it fail, then change production code and rerun the focused test.

- [ ] **Step 4: Document one-command use and current boundary**

`README.md` must contain:

```markdown
# Life Hub

Private personal dashboard and conversational logging application.

## Run the read-only Home slice

Requires Node.js 22 or later.

```bash
npm ci
npm run dev
```

Open the printed local URL. The current slice uses checked-in fixture data and is read-only; GitHub sync, authentication, chat, and writes arrive in later phases.

## Verify

```bash
npm test
npm run validate:fixtures
npm run test:browser
```
```

Update `docs/IMPLEMENTATION_STATUS.md` with the exact final automated counts, browser viewport results, offline result, and the next phase boundary: authenticated GitHub sync.

- [ ] **Step 5: Run the complete verification gate**

Run:

```bash
npm ci
npm run prepare:web
npm test
npm run validate:fixtures
npm run test:browser
npm audit
git diff --check main...HEAD
git status --short
```

Expected: all tests and browser checks pass; fixture validation reports four valid files and the approved Home totals; audit reports zero vulnerabilities; diff check is clean; only intentional files are tracked.

- [ ] **Step 6: Commit documentation and acceptance coverage**

```bash
git add tests/browser/home.spec.mjs README.md package.json package-lock.json docs/IMPLEMENTATION_STATUS.md
git commit -m "test: verify read-only Home vertical slice"
```

- [ ] **Step 7: Review the complete branch**

Inspect `git diff --stat main...HEAD`, `git diff --check main...HEAD`, the full commit list, and the rendered page. Confirm no secrets, remote URLs, provider calls, unsupported navigation, or untracked generated assets remain.
