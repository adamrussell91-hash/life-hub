/**
 * Travel SPA smoke (TR-03 / TR-07 / W2). Requires `npm run build:travel`
 * (and preferably full `npm run build`) so dist/travel exists.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const TRAVEL_DIST = path.join(REPO, 'dist', 'travel', 'index.html');

const hasTravelBuild = fs.existsSync(TRAVEL_DIST);

let browser;
let server;
let appUrl;

before(async () => {
  if (!hasTravelBuild) return;
  browser = await chromium.launch({ headless: true });
  await import(pathToFileURL(path.join(REPO, 'scripts/prepare-web.mjs')).href);
  const { createStaticServer } = await import(pathToFileURL(path.join(REPO, 'scripts/serve.mjs')).href);
  const { once } = await import('node:events');
  server = createStaticServer({
    root: pathToFileURL(path.join(REPO, 'dist/')),
    apiRoot: pathToFileURL(REPO + '/')
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  appUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await browser?.close();
  server?.close();
});

test('travel: sign-in gate then trip list / trip page', { skip: !hasTravelBuild }, async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto(`${appUrl}/travel/`);
    await page.locator('#sign-in-passphrase').waitFor({ timeout: 15000 });
    await page.locator('#sign-in-passphrase').fill('life-hub-local');
    await page.locator('button[type="submit"]').click();
    // After auth, either trips list or redirect into the single fixture trip.
    await page.waitForFunction(
      () => location.hash.includes('/trip/') || document.body.innerText.includes('Trips') || document.body.innerText.includes('Lisbon'),
      { timeout: 20000 }
    );
    assert.ok(true);
  } finally {
    await context.close();
  }
});

test('life rail Travel link is present', { skip: !hasTravelBuild }, async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto(appUrl);
    await page.locator('#sign-in-passphrase').fill('life-hub-local');
    await page.locator('#sign-in-button, button[type="submit"]').first().click();
    await page.locator('#app[data-state="ready"], .hub-layout').first().waitFor({ timeout: 20000 });
    const travel = page.locator('a.hub-nav-item[href="/travel/"]');
    assert.ok(await travel.count() >= 1, 'expected Travel rail link');
  } finally {
    await context.close();
  }
});

// ---- Meal moments (edit-moment sheet) -------------------------------------

const TRIP = 'trp_meal_spec';
const MOMENT_PLAIN = 'mom_plain';
const MOMENT_COREY = 'mom_corey';
const MOMENT_MEAL = 'mom_linked';

function mealJournal() {
  const base = { leg_id: 'leg_a', local_date: '2026-05-02', media_ids: [], lifecycle: 'live' };
  return {
    id: 'jrn_mealspec',
    schema_version: 1,
    trip_id: TRIP,
    title: 'Meal spec trip',
    revision: 1,
    lifecycle: 'live',
    leg_ids: ['leg_a'],
    preferences: {},
    operations: [],
    legs: [
      {
        id: 'leg_a', trip_id: TRIP, pattern_id: 'kul', destination: 'Lisbon', timezone: 'Europe/Lisbon',
        start_date: '2026-05-02', end_date: '2026-05-02', order: 0, lifecycle: 'live'
      }
    ],
    days: [{ id: 'day_a', leg_id: 'leg_a', local_date: '2026-05-02', lifecycle: 'live' }],
    moments: [
      { ...base, id: MOMENT_PLAIN, display_order: 1, local_time: '12:30', text: 'Plain lunch note',
        place: { name: 'Casa Exemplo' } },
      { ...base, id: MOMENT_COREY, display_order: 2, local_time: '15:00', text: 'Corey sees a quiet square',
        author: 'corey' },
      { ...base, id: MOMENT_MEAL, display_order: 3, local_time: '19:00', text: 'Dinner already logged',
        place: { name: 'Taberna Ficticia' }, meal: { food_visit_id: 'fv_linked', mood: 'calm' } }
    ],
    media: [],
    transitions: []
  };
}

const ok = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });

const linkedVisit = {
  id: 'fv_linked',
  title: 'Taberna Ficticia',
  venue: { name: 'Taberna Ficticia' },
  dishes: [{ id: 'dsh_1', title: 'Arroz de pato', meal_type: 'Dinner', rating: 4 }]
};

/**
 * Opens the journal with the travel APIs mocked. `meal.get` and `meal.put`
 * are functions returning a Playwright fulfill object.
 */
async function openMealJournal(browser, appUrl, viewport, meal) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const calls = { mealPuts: [], mealGets: 0 };
  let version = 'v1';
  await page.route('**/api/travel-journal?*', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      version = `${version}x`;
      return route.fulfill(ok({ journal: body.journal, version }));
    }
    return route.fulfill(ok({ journal: mealJournal(), version }));
  });
  await page.route('**/api/travel-trip?*', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'not_found', message: 'none' } }) })
  );
  await page.route('**/api/travel-meal?*', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      calls.mealGets += 1;
      return route.fulfill(meal.get());
    }
    if (req.method() === 'PUT') {
      calls.mealPuts.push(req.postDataJSON());
      return route.fulfill(meal.put());
    }
    return route.fulfill({ status: 405, body: '' });
  });
  await page.goto(`${appUrl}/travel/`);
  await page.locator('#sign-in-passphrase').fill('life-hub-local');
  await page.locator('button[type="submit"]').click();
  await page.locator('#app[data-state="ready"], .hub-layout').first().waitFor({ timeout: 20000 });
  await page.evaluate((hash) => { location.hash = hash; }, `#/trip/${TRIP}/journal`);
  return { context, page, calls };
}

async function openEdit(page, text) {
  const article = page.locator('article', { hasText: text }).first();
  await article.waitFor({ timeout: 15000 });
  await article.locator('button[aria-label="Moment actions"]').click();
  await page.getByRole('menuitem', { name: 'Edit moment' }).click();
  await page.locator('.journal-edit-moment-sheet').waitFor();
  await page.waitForTimeout(600);
}

const noMeal = { get: () => ok({ visit: null, food_version: null, travel_version: 'v1' }) };

for (const [label, viewport] of [
  ['desktop', { width: 1280, height: 900 }],
  ['390px', { width: 390, height: 844 }]
]) {
  test(`travel meal (${label}): a new meal saves its dish, rating and mood`, { skip: !hasTravelBuild }, async () => {
    const { context, page, calls } = await openMealJournal(browser, appUrl, viewport, {
      ...noMeal,
      put: () => ok({
        visit: { id: 'fv_new', title: 'Casa Exemplo', dishes: [] },
        travel: mealJournal(), travel_version: 'v3', food_version: 'f1'
      })
    });
    try {
      await openEdit(page, 'Plain lunch note');
      const sheet = page.locator('.journal-edit-moment-sheet');
      await sheet.getByRole('switch', { name: 'This was a meal' }).check();
      await sheet.getByLabel('Dish', { exact: true }).fill('Tortilla');
      await sheet.getByLabel('Rating').selectOption('4');
      await sheet.getByLabel('Mood').fill('buzzing');
      if (viewport.width < 600) {
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        );
        assert.ok(overflow, 'no horizontal page scroll while the meal section is open');
      }
      await sheet.getByRole('button', { name: 'Save' }).click();
      await sheet.waitFor({ state: 'detached', timeout: 10000 });
      assert.equal(calls.mealPuts.length, 1);
      const body = calls.mealPuts[0];
      assert.equal(body.food.dishes[0].title, 'Tortilla');
      assert.equal(body.food.dishes[0].rating, 4);
      assert.equal(body.extras.mood, 'buzzing');
    } finally {
      await context.close();
    }
  });

  test(`travel meal (${label}): Corey's moment has no Meal switch`, { skip: !hasTravelBuild }, async () => {
    const { context, page, calls } = await openMealJournal(browser, appUrl, viewport, {
      ...noMeal,
      put: () => ok({})
    });
    try {
      await openEdit(page, 'Corey sees a quiet square');
      const sheet = page.locator('.journal-edit-moment-sheet');
      assert.equal(await sheet.getByRole('switch', { name: 'This was a meal' }).count(), 0);
      assert.equal(calls.mealGets, 0);
    } finally {
      await context.close();
    }
  });

  test(`travel meal (${label}): a linked meal shows its dish and an unchanged Save sends no meal PUT`, { skip: !hasTravelBuild }, async () => {
    const { context, page, calls } = await openMealJournal(browser, appUrl, viewport, {
      get: () => ok({ visit: linkedVisit, food_version: 'f1', travel_version: 'v1' }),
      put: () => ok({})
    });
    try {
      await openEdit(page, 'Dinner already logged');
      const sheet = page.locator('.journal-edit-moment-sheet');
      const toggle = sheet.getByRole('switch', { name: 'This was a meal' });
      await toggle.waitFor();
      assert.equal(await toggle.isChecked(), true);
      assert.equal(await sheet.getByLabel('Dish', { exact: true }).inputValue(), 'Arroz de pato');
      // Focusing a field resizes the sheet (the keyboard-open layout); settle that
      // first so the Save press is not lost to a moving button.
      await sheet.getByLabel('Dish', { exact: true }).focus();
      await sheet.getByRole('button', { name: 'Save' }).click();
      await sheet.waitFor({ state: 'detached', timeout: 10000 });
      assert.equal(calls.mealPuts.length, 0);
    } finally {
      await context.close();
    }
  });

  test(`travel meal (${label}): a photo that did not copy is reported in a toast`, { skip: !hasTravelBuild }, async () => {
    const { context, page } = await openMealJournal(browser, appUrl, viewport, {
      ...noMeal,
      put: () => ok({
        visit: { id: 'fv_new', title: 'Casa Exemplo', dishes: [] },
        travel: mealJournal(), travel_version: 'v3', food_version: 'f1', photo_failed: true
      })
    });
    try {
      await openEdit(page, 'Plain lunch note');
      const sheet = page.locator('.journal-edit-moment-sheet');
      await sheet.getByRole('switch', { name: 'This was a meal' }).check();
      await sheet.getByLabel('Dish', { exact: true }).fill('Tortilla');
      await sheet.getByRole('button', { name: 'Save' }).click();
      await sheet.waitFor({ state: 'detached', timeout: 10000 });
      await page.getByText("Saved. The photo didn't copy; open again to retry.").waitFor({ state: 'visible', timeout: 5000 });
    } finally {
      await context.close();
    }
  });

  test(`travel meal (${label}): a failed meal load disables the switch`, { skip: !hasTravelBuild }, async () => {
    const { context, page } = await openMealJournal(browser, appUrl, viewport, {
      get: () => ({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) }),
      put: () => ok({})
    });
    try {
      await openEdit(page, 'Plain lunch note');
      const sheet = page.locator('.journal-edit-moment-sheet');
      await sheet.getByText("Couldn't load the meal").waitFor({ timeout: 10000 });
      assert.equal(await sheet.getByRole('switch', { name: 'This was a meal' }).isDisabled(), true);
    } finally {
      await context.close();
    }
  });
}
