/**
 * Travel journal story view at phone and desktop widths. The travel APIs are
 * mocked in the page, so the journal is an invented one. Requires
 * `npm run build:travel` so dist/travel exists.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, webkit } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const TRAVEL_DIST = path.join(REPO, 'dist', 'travel', 'index.html');
const PHOTO_DIR = path.join(REPO, 'apps', 'travel', 'fixtures', 'journal-photos');

const hasTravelBuild = fs.existsSync(TRAVEL_DIST);

const TRIP = 'trp_story_spec';
const KIT_TYPE_SIZES = new Set(['11px', '12px', '13px', '15px', '17px', '21px', '32px', '42px']);

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

function storyJournal() {
  const moment = (id, leg, date, order, time, text, extra = {}) => ({
    id, leg_id: leg, local_date: date, display_order: order, local_time: time, text,
    media_ids: [], lifecycle: 'live', ...extra
  });
  const photo = (id, name, width, height) => ({
    id, url: `/spec-photo/${name}.jpg`, width, height, lifecycle: 'live',
    content_type: 'image/jpeg', upload_state: 'backed_up'
  });
  return {
    id: 'jrn_storyspec',
    schema_version: 1,
    trip_id: TRIP,
    title: 'Story spec trip',
    revision: 1,
    lifecycle: 'live',
    leg_ids: ['leg_a', 'leg_b'],
    preferences: {},
    operations: [],
    legs: [
      { id: 'leg_a', trip_id: TRIP, pattern_id: 'kul', destination: 'Lisbon', timezone: 'Europe/Lisbon',
        start_date: '2026-05-02', end_date: '2026-05-03', order: 0, lifecycle: 'live' },
      { id: 'leg_b', trip_id: TRIP, pattern_id: 'ist', destination: 'Porto', timezone: 'Europe/Lisbon',
        start_date: '2026-05-04', end_date: '2026-05-04', order: 1, lifecycle: 'live' }
    ],
    days: [
      { id: 'day_a1', leg_id: 'leg_a', local_date: '2026-05-02', lifecycle: 'live' },
      { id: 'day_a2', leg_id: 'leg_a', local_date: '2026-05-03', lifecycle: 'live' },
      { id: 'day_b1', leg_id: 'leg_b', local_date: '2026-05-04', lifecycle: 'live' }
    ],
    moments: [
      moment('mom_arch', 'leg_a', '2026-05-02', 1, '09:40', 'Into the light off the airport metro.',
        { media_ids: ['med_arch'], place: { name: 'Praça do Exemplo', lat: 38.7075, lon: -9.1364 } }),
      moment('mom_two', 'leg_a', '2026-05-02', 2, '11:15', 'Two frames of the same tram.',
        { media_ids: ['med_tram', 'med_cafe'], place: { name: 'Rua Inventada', lat: 38.7139, lon: -9.1334 } }),
      moment('mom_words', 'leg_a', '2026-05-03', 1, '21:30', 'Nobody spoke for an hour. Words only, no photo.'),
      moment('mom_partner', 'leg_a', '2026-05-03', 2, '22:10', 'Partner writes one line.', { author: 'partner' }),
      moment('mom_bridge', 'leg_b', '2026-05-04', 1, '17:20', 'Across the top deck at dusk.',
        { media_ids: ['med_bridge'], place: { name: 'Ponte de Exemplo', lat: 41.1400, lon: -8.6094 } })
    ],
    media: [
      photo('med_arch', 'arch', 1200, 800),
      photo('med_tram', 'tram', 1200, 800),
      photo('med_cafe', 'cafe', 800, 1200),
      photo('med_bridge', 'bridge', 1200, 800)
    ],
    transitions: []
  };
}

const ok = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });

async function openStory(engine, viewport, contextOptions = {}) {
  const context = await engine.newContext({ viewport, ...contextOptions });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  let version = 'v1';
  let journal = storyJournal();
  await page.route('**/api/travel-journal?*', async (route) => {
    if (route.request().method() === 'PUT') {
      journal = route.request().postDataJSON().journal;
      version = `${version}x`;
      return route.fulfill(ok({ journal, version }));
    }
    return route.fulfill(ok({ journal, version }));
  });
  await page.route('**/api/travel-trip?*', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'not_found', message: 'none' } }) })
  );
  const photos = fs.readdirSync(PHOTO_DIR).filter((name) => name.endsWith('.jpg')).sort();
  await page.route('**/spec-photo/*', (route) => {
    const index = Math.abs([...route.request().url()].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)) % photos.length;
    return route.fulfill({ status: 200, contentType: 'image/jpeg', body: fs.readFileSync(path.join(PHOTO_DIR, photos[index])) });
  });
  await page.goto(`${appUrl}/travel/`);
  await page.locator('#sign-in-passphrase').fill('life-hub-local');
  await page.locator('button[type="submit"]').click();
  await page.locator('#app[data-state="ready"], .hub-layout').first().waitFor({ timeout: 20000 });
  await page.evaluate((hash) => { location.hash = hash; }, `#/trip/${TRIP}/journal`);
  await page.locator('.story-cover').waitFor({ timeout: 15000 });
  await page.locator('#mom_arch').waitFor({ timeout: 15000 });
  return { context, page, errors };
}

const overflowX = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

const box = (page, selector) => page.evaluate((sel) => {
  const node = document.querySelector(sel);
  if (!node) return null;
  const r = node.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
}, selector);

test('journal story (390px): cover, ribbon, dock and tab bar fit the phone', { skip: !hasTravelBuild }, async () => {
  const { context, page, errors } = await openStory(browser, { width: 390, height: 844 });
  try {
    assert.equal(await overflowX(page), 0, 'no sideways page scroll (R2)');
    assert.equal(await page.locator('h1').count(), 1, 'the cover title is the only h1');

    // The kit page header is not drawn on the phone: the cover is the header.
    const header = await page.evaluate(() => {
      const node = document.querySelector('.page-header--journal');
      return node ? getComputedStyle(node).display : 'missing';
    });
    assert.equal(header, 'none', 'page header hidden on the phone journal');
    const cover = await box(page, '.story-cover');
    assert.ok(cover.top <= 1, `cover starts at the top of the screen (got ${cover.top})`);
    assert.ok(Math.abs(cover.width - 390) <= 1, 'cover is edge to edge');

    // Journal is a primary tab and is the current one.
    const current = await page.locator('.hub-mobile-nav [aria-current="page"]').innerText();
    assert.match(current, /Journal/);
    const tabs = await page.locator('.hub-mobile-nav').innerText();
    assert.doesNotMatch(tabs, /Trips/, 'Trips moved into More');

    // Every control on the cover and ribbon is a 44px target (R6).
    const small = await page.evaluate(() => [...document.querySelectorAll(
      '.story-cover button, .story-cover a, .story-ribbon button, .story-dock button, .story-moment__more'
    )].filter((node) => {
      const r = node.getBoundingClientRect();
      return r.width > 0 && (r.width < 43.5 || r.height < 43.5);
    }).map((node) => `${node.className} ${Math.round(node.getBoundingClientRect().width)}x${Math.round(node.getBoundingClientRect().height)}`));
    assert.deepEqual(small, [], 'no control under 44px');

    // The dock floats above the tab bar, not over it (R4).
    const dock = await box(page, '.story-dock');
    const bar = await box(page, '.hub-mobile-nav');
    assert.ok(dock.bottom <= bar.top, `dock (${dock.bottom}) clears the tab bar (${bar.top})`);

    // Only the kit's type sizes are used (T1).
    const sizes = await page.evaluate(() => {
      const found = new Set();
      for (const node of document.querySelectorAll('.journal.story *, .story-dock *')) {
        if (node.childNodes.length && [...node.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) {
          found.add(getComputedStyle(node).fontSize);
        }
      }
      return [...found];
    });
    const offScale = sizes.filter((size) => !KIT_TYPE_SIZES.has(size));
    assert.deepEqual(offScale, [], `type sizes off the kit scale: ${offScale.join(', ')}`);

    // The app never claims a walk it cannot know about (D1).
    const stitches = await page.locator('.story-stitch').allInnerTexts();
    assert.ok(stitches.length >= 1, 'a stitch joins the two located moments');
    for (const text of stitches) assert.doesNotMatch(text, /walk/i);

    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('journal story (390px): sheets cover the tab bar and Back closes them', { skip: !hasTravelBuild }, async () => {
  const { context, page } = await openStory(browser, { width: 390, height: 844 });
  try {
    const hashBefore = await page.evaluate(() => location.hash);
    await page.locator('.story-ribbon__more').click();
    const sheet = page.locator('.story-sheet');
    await sheet.waitFor();
    await page.waitForTimeout(450);
    const metrics = await page.evaluate(() => {
      const panel = document.querySelector('.story-sheet');
      const r = panel.getBoundingClientRect();
      const rows = [...panel.querySelectorAll('button')].map((b) => b.getBoundingClientRect().height);
      const bar = document.querySelector('.hub-mobile-nav').getBoundingClientRect();
      const top = document.elementFromPoint(bar.left + bar.width / 2, bar.top + bar.height / 2);
      const dock = document.querySelector('.story-dock');
      return {
        gapBelow: window.innerHeight - r.bottom,
        minRow: Math.min(...rows),
        barCovered: !document.querySelector('.hub-mobile-nav').contains(top),
        dockHidden: getComputedStyle(dock).pointerEvents === 'none',
        scrollLocked: getComputedStyle(document.documentElement).overflow === 'hidden' || getComputedStyle(document.body).overflow === 'hidden',
      };
    });
    assert.ok(Math.abs(metrics.gapBelow) <= 1, 'sheet sits flush with the bottom of the screen');
    assert.ok(metrics.minRow >= 44, `sheet rows are at least 44px (got ${metrics.minRow})`);
    assert.ok(metrics.barCovered, 'the tab bar is under the sheet, not over it');
    assert.ok(metrics.dockHidden, 'the dock is away while a sheet is open');
    const labels = await sheet.innerText();
    for (const label of ['Search journal', 'Print', 'Export', 'Share', 'Trash', 'Refresh']) {
      assert.match(labels, new RegExp(label), `options sheet offers ${label}`);
    }
    assert.match(labels, /Partner/, 'Partner lines toggle is offered when the journal has them');

    await page.goBack();
    await sheet.waitFor({ state: 'detached', timeout: 5000 });
    assert.equal(await page.evaluate(() => location.hash), hashBefore, 'Back closes the sheet and stays on the journal');

    // Moment actions: every old menu action is still reachable.
    await page.locator('#mom_arch .story-moment__more').click();
    await sheet.waitFor();
    const actions = await sheet.innerText();
    for (const label of ['Edit moment', 'Delete']) assert.match(actions, new RegExp(label));
    await page.keyboard.press('Escape');
    await sheet.waitFor({ state: 'detached', timeout: 5000 });
    assert.equal(await overflowX(page), 0);
  } finally {
    await context.close();
  }
});

test('journal story (390px): photo row, viewer and Photos view', { skip: !hasTravelBuild }, async () => {
  const { context, page } = await openStory(browser, { width: 390, height: 844 });
  try {
    // A two-photo moment scrolls sideways inside itself, never the page.
    await page.evaluate(() => document.querySelector('#mom_two').scrollIntoView({ block: 'center' }));
    const row = page.locator('#mom_two .story-photos__track');
    await row.evaluate((node) => node.scrollTo({ left: node.scrollWidth, behavior: 'instant' }));
    await page.waitForTimeout(400);
    assert.match(await page.locator('#mom_two .story-photos__count').innerText(), /2\s*\/\s*2/);
    assert.equal(await overflowX(page), 0);

    // Viewer: opens on the tapped photo, steps through the whole trip, Escape closes.
    await page.locator('#mom_arch .story-photo').first().click();
    const viewer = page.locator('.story-viewer');
    await viewer.waitFor();
    assert.match(await page.locator('.story-viewer__count').innerText(), /1\D+4/);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);
    assert.match(await page.locator('.story-viewer__count').innerText(), /2\D+4/);
    assert.equal(await overflowX(page), 0, 'the viewer does not widen the page');
    await page.keyboard.press('Escape');
    await viewer.waitFor({ state: 'detached', timeout: 5000 });

    // Photos view: one button per photo, in a three-column grid.
    await page.locator('[data-story-view="photos"]').click();
    const tiles = page.locator('.story-grid__cell');
    await tiles.first().waitFor();
    assert.equal(await tiles.count(), 4);
    // The first photo of a day is the large one; the rest are a third of the width.
    const tile = await box(page, '.story-grid__cell:not(:first-child)');
    assert.ok(tile.width > 110 && tile.width < 135, `three tiles across a phone (tile is ${tile.width}px)`);
    assert.equal(await overflowX(page), 0);
    await page.locator('[data-story-view="story"]').click();
    await page.locator('#mom_arch').waitFor();
  } finally {
    await context.close();
  }
});

test('journal story (390px): a ribbon day jumps to that day', { skip: !hasTravelBuild }, async () => {
  const { context, page } = await openStory(browser, { width: 390, height: 844 });
  try {
    await page.locator('.story-ribbon__day', { hasText: '3' }).click();
    await page.waitForFunction(() => {
      const day = document.querySelector('#day_b1');
      if (!day) return false;
      const top = day.getBoundingClientRect().top;
      return top > 0 && top < window.innerHeight * 0.6;
    }, null, { timeout: 5000 });
    const ribbon = await box(page, '.story-ribbon');
    const day = await box(page, '#day_b1');
    assert.ok(day.top >= ribbon.bottom - 1, 'the day header lands below the pinned ribbon, not under it');
  } finally {
    await context.close();
  }
});

test('journal story (1280px): the story sits in a reading column', { skip: !hasTravelBuild }, async () => {
  const { context, page, errors } = await openStory(browser, { width: 1280, height: 900 });
  try {
    assert.equal(await overflowX(page), 0);
    assert.equal(await page.locator('h1').count(), 1);
    const cover = await box(page, '.story-cover');
    assert.ok(cover.width <= 48 * 16 + 1, `cover stays inside the 48rem column (got ${cover.width})`);
    const rail = await page.locator('.hub-rail__nav').innerText();
    assert.match(rail, /Journal/);
    const current = await page.locator('.hub-rail__nav [aria-current="page"]').innerText();
    assert.match(current, /Journal/);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

// Safari is where pinch and scroll-snap go wrong first (C4). Skipped when WebKit is not installed.
test('journal story (WebKit phone): viewer opens, steps and closes', { skip: !hasTravelBuild }, async (t) => {
  let engine;
  try {
    engine = await webkit.launch({ headless: true });
  } catch {
    t.skip('WebKit is not installed here');
    return;
  }
  try {
    const { context, page, errors } = await openStory(engine, { width: 390, height: 844 }, { hasTouch: true, isMobile: true });
    try {
      assert.equal(await overflowX(page), 0);
      await page.locator('#mom_arch .story-photo').first().tap();
      const viewer = page.locator('.story-viewer');
      await viewer.waitFor();
      await page.locator('.story-viewer__track').evaluate((node) => node.scrollTo({ left: node.clientWidth, behavior: 'instant' }));
      await page.waitForTimeout(500);
      assert.match(await page.locator('.story-viewer__count').innerText(), /2\D+4/);
      await page.getByRole('button', { name: 'Close photo' }).tap();
      await viewer.waitFor({ state: 'detached', timeout: 5000 });
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  } finally {
    await engine.close();
  }
});
