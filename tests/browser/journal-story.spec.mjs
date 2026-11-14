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
    preferences: {
      journal_souvenirs_v1: {
        sv_spec_ticket: {
          id: 'sv_spec_ticket', title: 'Funicular ticket', kind: 'ticket', source: 'photo', media_id: 'med_keep',
          leg_id: 'leg_a', local_date: '2026-05-02', local_time: '10:30', lifecycle: 'live', created_at: '2026-05-02T10:30:00.000Z'
        }
      }
    },
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
      photo('med_bridge', 'bridge', 1200, 800),
      photo('med_keep', 'keep', 760, 440)
    ],
    transitions: []
  };
}

/** A copy of a JPEG with a capture time written into it, as a camera would. */
function jpegTakenAt(file, wall) {
  const jpeg = fs.readFileSync(file);
  const tiff = Buffer.concat([
    Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]), // big-endian TIFF, first IFD at 8
    Buffer.from([0x00, 0x01, 0x87, 0x69, 0x00, 0x04, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x1a, 0x00, 0x00, 0x00, 0x00]), // IFD0: Exif IFD at 26
    Buffer.from([0x00, 0x01, 0x90, 0x03, 0x00, 0x02, 0x00, 0x00, 0x00, 0x14, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00]), // DateTimeOriginal at 44
    Buffer.from(`${wall}\0`, 'ascii')
  ]);
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]);
  const head = Buffer.alloc(4);
  head.writeUInt16BE(0xffe1, 0);
  head.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), head, body, jpeg.subarray(2)]);
}

const ok = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });

async function openStory(engine, viewport, contextOptions = {}, mutate, extras = {}) {
  const context = await engine.newContext({ viewport, ...contextOptions });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  let version = 'v1';
  let journal = storyJournal();
  mutate?.(journal);
  const puts = [];
  // Place names come from an invented street, never the network.
  await page.route('**/api/travel-places?*', (route) => route.fulfill(ok({ name: 'Rua do Teste' })));
  await page.route('**/api/travel-journal-media*', (route) => route.fulfill({ status: 503, body: '' }));
  await page.route('**/api/travel-journal?*', async (route) => {
    if (route.request().method() === 'PUT') {
      journal = route.request().postDataJSON().journal;
      puts.push(journal);
      version = `${version}x`;
      return route.fulfill(ok({ journal, version }));
    }
    return route.fulfill(ok({ journal, version }));
  });
  await page.route('**/api/travel-trip?*', (route) =>
    extras.trip
      ? route.fulfill(ok({ trip: extras.trip, version: 't1' }))
      : route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'not_found', message: 'none' } }) })
  );
  await page.route('**/api/travel-noticing?*', (route) =>
    route.fulfill(ok({ history: extras.history ?? { trips: [], days: [] } }))
  );
  await page.route('**/api/travel-journal-media?*', (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 503, body: '' });
    return route.fulfill({ status: 200, contentType: 'image/jpeg', body: fs.readFileSync(path.join(PHOTO_DIR, 'ribeira.jpg')) });
  });
  if (extras.now) await page.clock.setFixedTime(new Date(extras.now));
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
  return { context, page, errors, puts };
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
      '.story-cover button, .story-cover a, .story-ribbon button, .story-dock button, .story-moment__more, .story-keep__object'
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
        if (node.closest('.keepsake')) continue;
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

test('journal keepsakes (390px): kept in the story, on the board, and added from the phone', { skip: !hasTravelBuild }, async () => {
  const { context, page, puts } = await openStory(browser, { width: 390, height: 844 });
  try {
    // In the story: after the 9:40 moment and before the 11:15 one, with its name in real text.
    const order = await page.evaluate(() =>
      [...document.querySelectorAll('[data-journal-moment], .story-keep')].map((node) => node.id));
    assert.deepEqual(order.slice(0, 3), ['mom_arch', 'keep_sv_spec_ticket', 'mom_two']);
    assert.match(await page.locator('#keep_sv_spec_ticket .story-keep__text').innerText(), /Kept: Funicular ticket/);
    assert.match(await page.locator('.story-cover__stats').innerText(), /1 keepsake/);
    assert.equal(await overflowX(page), 0);

    // Its sheet: flush to the bottom, over the tab bar, with Go to that day.
    await page.locator('#keep_sv_spec_ticket .story-keep__object').click();
    const sheet = page.locator('.story-sheet');
    await sheet.waitFor();
    await page.waitForTimeout(450);
    const gap = await page.evaluate(() => window.innerHeight - document.querySelector('.story-sheet').getBoundingClientRect().bottom);
    assert.ok(Math.abs(gap) <= 1, 'keepsake sheet sits flush with the bottom');
    assert.match(await sheet.innerText(), /Go to that day/);
    assert.equal(await overflowX(page), 0, 'the large keepsake does not widen the page');
    await page.goBack();
    await sheet.waitFor({ state: 'detached', timeout: 5000 });

    // The board.
    await page.locator('[data-story-view="keepsakes"]').click();
    await page.locator('[data-keepsake-board]').waitFor();
    assert.match(await page.locator('.keep-board__count').innerText(), /^1 kept$/);
    assert.equal(await page.locator('.keep-board__stamp .keepsake--stamp').count(), 2, 'one arrival stamp per city');
    assert.equal(await overflowX(page), 0);
    const smallItems = await page.evaluate(() => [...document.querySelectorAll('.keep-board__item, .keep-board__add')]
      .filter((node) => node.getBoundingClientRect().width < 43.5 || node.getBoundingClientRect().height < 43.5).length);
    assert.equal(smallItems, 0, 'board items are at least 44px');

    // Keep something: choose a kind, choose a photo, keep it.
    await page.locator('.keep-board__add').click();
    await sheet.waitFor();
    const chooser = page.waitForEvent('filechooser');
    await sheet.getByRole('button', { name: /Poster or flyer/ }).click();
    const photos = fs.readdirSync(PHOTO_DIR).filter((name) => name.endsWith('.jpg')).sort();
    await (await chooser).setFiles(path.join(PHOTO_DIR, photos[0]));
    await sheet.locator('.keep-form .keepsake.is-poster img').waitFor();
    await sheet.getByLabel('Name (optional)').fill('Gig flyer');
    assert.equal(await overflowX(page), 0);
    await sheet.getByRole('button', { name: 'Keep it' }).click();
    await sheet.waitFor({ state: 'detached', timeout: 10000 });

    // Saved with its kind and a new photo, and the view is still Keepsakes (V7).
    assert.equal(puts.length, 1);
    const saved = Object.values(puts[0].preferences.journal_souvenirs_v1).find((row) => row.title === 'Gig flyer');
    assert.equal(saved.kind, 'poster');
    assert.equal(saved.source, 'photo');
    assert.ok(puts[0].media.some((m) => m.id === saved.media_id), 'the photo is a media row of the journal');
    assert.ok(!puts[0].moments.some((m) => m.media_ids.includes(saved.media_id)), 'and belongs to no moment');
    await page.locator('[data-keepsake-board]').waitFor();
    assert.match(await page.locator('.keep-board__count').innerText(), /^2 kept$/);
    assert.equal(await page.locator('.keep-board__item').count(), 2);

    // Remove it, then bring it back from Trash.
    await page.locator('.keep-board__item', { has: page.locator('.is-poster') }).click();
    await sheet.waitFor();
    await sheet.getByRole('button', { name: /^Remove/ }).click();
    await page.waitForFunction(() => document.querySelector('.keep-board__count')?.textContent === '1 kept');
    await page.evaluate(() => window.scrollTo(0, document.querySelector('.story-ribbon').getBoundingClientRect().top + window.scrollY));
    await page.locator('.story-ribbon__more').click();
    await sheet.getByRole('button', { name: /Trash/ }).click();
    const card = page.locator('.journal-trash__card', { hasText: 'Gig flyer' });
    await card.getByRole('button', { name: 'Restore' }).click();
    await page.waitForFunction(() => document.querySelector('.keep-board__count')?.textContent === '2 kept');
  } finally {
    await context.close();
  }
});

test('journal photos (390px): the round button files photos with no sheet', { skip: !hasTravelBuild }, async () => {
  const { context, page, puts, errors } = await openStory(browser, { width: 390, height: 844 });
  try {
    const names = fs.readdirSync(PHOTO_DIR).filter((name) => name.endsWith('.jpg') && !name.startsWith('keep-')).sort();
    const taken = (index, wall) => ({
      name: `IMG_${index}.jpg`,
      mimeType: 'image/jpeg',
      buffer: jpegTakenAt(path.join(PHOTO_DIR, names[index]), wall)
    });

    // One tap opens the picker. No sheet appears before or after.
    await page.locator('[data-story-view="photos"]').click();
    const chooser = page.waitForEvent('filechooser');
    await page.locator('.story-dock__main').click();
    const picker = await chooser;
    assert.equal(picker.isMultiple(), true);
    assert.equal(await page.locator('.sheet-back').count(), 0, 'no sheet before the picker');
    await picker.setFiles([
      taken(0, '2026:05:03 14:05:00'),
      taken(1, '2026:05:03 14:20:00'),
      taken(2, '2026:05:04 09:00:00'),
      { name: 'screenshot.jpg', mimeType: 'image/jpeg', buffer: fs.readFileSync(path.join(PHOTO_DIR, names[3])) }
    ]);

    const strip = page.locator('[data-import-strip]');
    await page.waitForFunction(() => /^Filed 3 photos into 2 moments/.test(document.querySelector('.story-strip__headline')?.textContent ?? ''), null, { timeout: 15000 });
    assert.equal(await page.locator('.sheet-back').count(), 0, 'no review sheet');
    assert.match(await strip.locator('.story-strip__notes').innerText(), /1 photo has no date/);

    // Filed by the time inside each photo: two together on 3 May, one on 4 May.
    assert.equal(puts.length, 1);
    const added = puts[0].moments.filter((m) => !['mom_arch', 'mom_two', 'mom_words', 'mom_partner', 'mom_bridge'].includes(m.id));
    assert.deepEqual(
      added.map((m) => [m.leg_id, m.local_date, m.local_time, m.media_ids.length]).sort(),
      [['leg_a', '2026-05-03', '14:05', 2], ['leg_b', '2026-05-04', '09:00', 1]]
    );
    // The story is showing, whichever view the button was pressed from (V7).
    assert.equal(await page.locator('[data-story-showing]').first().getAttribute('data-story-showing'), 'story');
    assert.equal(await page.locator('#' + added[0].id).count(), 1);

    // The strip sits above the dock and the tab bar, covers neither, and fits the phone.
    await page.evaluate(() => window.scrollBy(0, -40));
    await page.waitForTimeout(900);
    const boxes = await page.evaluate(() => {
      const r = (sel) => document.querySelector(sel).getBoundingClientRect();
      const small = [...document.querySelectorAll('.story-strip button')].filter((b) => !b.hidden && (b.getBoundingClientRect().height < 43.5 || b.getBoundingClientRect().width < 43.5)).length;
      return { strip: r('.story-strip'), dock: r('.story-dock'), bar: r('.hub-mobile-nav'), small };
    });
    assert.ok(boxes.strip.bottom <= boxes.dock.top + 1, `strip (${boxes.strip.bottom}) clears the dock (${boxes.dock.top})`);
    assert.ok(boxes.strip.bottom <= boxes.bar.top, 'strip clears the tab bar');
    assert.ok(boxes.strip.left >= 0 && boxes.strip.right <= 390, 'strip fits the phone');
    assert.equal(boxes.small, 0, 'strip buttons are at least 44px');
    assert.equal(await overflowX(page), 0);

    // The undated one: choose a day, and it is filed there.
    await strip.getByRole('button', { name: 'Choose a day' }).click();
    const sheet = page.locator('.story-sheet');
    await sheet.waitFor();
    assert.match(await sheet.innerText(), /1 photo has no date/);
    await page.goBack();
    await sheet.waitFor({ state: 'detached', timeout: 5000 });
    await strip.getByRole('button', { name: 'Choose a day' }).click();
    await sheet.getByRole('button', { name: /Day 2/ }).click();
    await page.waitForFunction(() => /^Filed 1 photo into 1 moment/.test(document.querySelector('.story-strip__headline')?.textContent ?? ''), null, { timeout: 15000 });
    assert.equal(puts.length, 2);

    // Undo takes back exactly that one.
    const before = puts[1].moments.filter((m) => m.lifecycle === 'live').length;
    await strip.getByRole('button', { name: 'Undo' }).click();
    await page.waitForFunction(() => /^Taken back/.test(document.querySelector('.story-strip__headline')?.textContent ?? ''), null, { timeout: 15000 });
    assert.equal(puts[2].moments.filter((m) => m.lifecycle === 'live').length, before - 1);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('journal places (390px): a located moment with no name is given its street', { skip: !hasTravelBuild }, async () => {
  const { context, page, puts } = await openStory(browser, { width: 390, height: 844 }, {}, (journal) => {
    const bridge = journal.moments.find((m) => m.id === 'mom_bridge');
    bridge.coordinates = { lat: 41.14, lon: -8.6094 };
    delete bridge.place;
  });
  try {
    await page.waitForFunction(() => document.querySelector('#mom_bridge .story-moment__place')?.textContent?.includes('Rua do Teste'), null, { timeout: 15000 });
    assert.equal(puts.length, 1);
    assert.deepEqual(puts[0].moments.find((m) => m.id === 'mom_bridge').place, { name: 'Rua do Teste', source: 'lookup' });
    // A name that was typed is left alone.
    assert.equal(puts[0].moments.find((m) => m.id === 'mom_arch').place.name, 'Praça do Exemplo');
  } finally {
    await context.close();
  }
});

test('journal words (390px): tap the words to edit them in place', { skip: !hasTravelBuild }, async () => {
  const { context, page, puts } = await openStory(browser, { width: 390, height: 844 }, { hasTouch: true });
  try {
    await page.locator('#mom_arch .story-moment__words p').tap();
    const field = page.locator('.story-words-edit__field');
    await field.waitFor();
    assert.equal(await field.evaluate((node) => node === document.activeElement), true, 'the field has the keyboard');
    assert.equal(await field.inputValue(), 'Into the light off the airport metro.');
    assert.equal(await page.locator('.sheet-back').count(), 0, 'no sheet');
    const look = await page.evaluate(() => {
      const done = document.querySelector('.story-words-edit__done').getBoundingClientRect();
      const fieldBox = document.querySelector('.story-words-edit__field').getBoundingClientRect();
      const dock = getComputedStyle(document.querySelector('.story-dock'));
      return {
        doneH: done.height, doneAbove: done.bottom <= fieldBox.top + 1,
        fontPx: parseFloat(getComputedStyle(document.querySelector('.story-words-edit__field')).fontSize),
        dockAway: dock.pointerEvents === 'none',
      };
    });
    assert.ok(look.doneH >= 44, 'Done is at least 44px');
    assert.ok(look.doneAbove, 'Done sits above the field, clear of the keyboard');
    assert.ok(look.fontPx >= 16, 'no zoom on focus: the field is 16px or more');
    assert.ok(look.dockAway, 'the dock is out of the way while typing');
    assert.equal(await overflowX(page), 0);

    await field.fill('Into the light, bags still on our backs.');
    await page.locator('.story-words-edit__done').tap();
    await page.waitForFunction(() => document.querySelector('#mom_arch .story-moment__words p')?.textContent === 'Into the light, bags still on our backs.');
    assert.equal(puts.length, 1);
    assert.equal(puts[0].moments.find((m) => m.id === 'mom_arch').text, 'Into the light, bags still on our backs.');
    assert.equal(await page.locator('.story-words-edit').count(), 0);

    // Escape puts the old words back and saves nothing.
    await page.locator('#mom_arch .story-moment__words p').tap();
    await field.fill('Never mind.');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.story-words-edit').count(), 0);
    assert.equal(await page.locator('#mom_arch .story-moment__words p').innerText(), 'Into the light, bags still on our backs.');
    assert.equal(puts.length, 1);
  } finally {
    await context.close();
  }
});

test('journal moment (390px): closing the sheet keeps the note', { skip: !hasTravelBuild }, async () => {
  const { context, page, puts } = await openStory(browser, { width: 390, height: 844 });
  try {
    await page.locator('.story-dock button', { hasText: 'Moment' }).click();
    const sheet = page.locator('.journal-capture-sheet');
    await sheet.waitFor();
    assert.deepEqual(await sheet.locator('.addform__actions button').allInnerTexts(), ['Discard', 'Done']);
    await sheet.locator('textarea').fill('Nobody on the pavement even looks up.');
    // Back is how a phone closes a sheet.
    await page.locator('h1').first().evaluate(() => document.activeElement?.blur());
    await page.goBack();
    await sheet.waitFor({ state: 'detached', timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('.story-strip__headline')?.textContent === 'Moment added', null, { timeout: 10000 });
    assert.equal(puts.length, 1);
    assert.ok(puts[0].moments.some((m) => m.text === 'Nobody on the pavement even looks up.' && m.lifecycle === 'live'));
    assert.match(await page.evaluate(() => location.hash), /\/journal/);

    await page.locator('.story-strip__action', { hasText: 'Undo' }).click();
    await page.waitForFunction(() => /^Taken back/.test(document.querySelector('.story-strip__headline')?.textContent ?? ''));
    assert.ok(!puts[1].moments.some((m) => m.text === 'Nobody on the pavement even looks up.' && m.lifecycle === 'live'));
  } finally {
    await context.close();
  }
});

/** An invented trip around the story journal: 2 to 5 May 2026, four days, so day 2 is halfway. */
function storyTrip() {
  const city = (id, name, start, end) => ({
    id, name, country: 'Portugal', tz: 'Europe/Lisbon', start_date: start, end_date: end, title: name, scene: 'generic',
    accent: { color: '#2f62a8', soft: '#d9e6f5', ink: '#17375e' }, facts: [], center: { lat: 38.72, lon: -9.14 },
    local_currency: 'EUR', directions_app: 'google'
  });
  return {
    id: TRIP, schema_version: 1, title: 'Story spec trip', start_date: '2026-05-02', end_date: '2026-05-05', home_tz: 'Europe/Lisbon',
    followers_label: '', cities: [city('lis', 'Lisbon', '2026-05-02', '2026-05-03'), city('opo', 'Porto', '2026-05-04', '2026-05-05')],
    items: [], days: [], checkins: [], share: { enabled: false, created_at: null },
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z'
  };
}

test('journal noticing (390px): the pill, the cards, keeping one, and nothing when there is nothing', { skip: !hasTravelBuild }, async () => {
  const history = {
    trips: [{ id: 'trp_story_past', title: 'Invented north', start_date: '2025-05-01', end_date: '2025-05-05', days: 5,
      cities: [{ name: 'Bergen', country: 'Norway', start_date: '2025-05-01', end_date: '2025-05-05' }] }],
    days: [{ trip_id: 'trp_story_past', date: '2025-05-03', city: 'Bergen', country: 'Norway', photos: 7, first_time: '09:00',
      last_time: '20:00', north: null, south: null, photo_ids: ['med_past_a', 'med_past_b', 'med_past_c'] }]
  };
  const { context, page, puts, errors } = await openStory(browser, { width: 390, height: 844 }, {}, undefined,
    { trip: storyTrip(), history, now: '2026-05-03T17:00:00Z' });
  try {
    // Day 2 of 4: "a year ago today" from the past trip, and "halfway" from this one.
    const pill = page.locator('[data-notice-pill]');
    await pill.waitFor({ timeout: 15000 });
    await page.waitForFunction(() => document.querySelector('[data-notice-pill]')?.textContent === '2 things noticed today');
    assert.ok((await box(page, '[data-notice-pill]')).height >= 44);
    const hashBefore = await page.evaluate(() => location.hash);
    await pill.click();
    const cards = page.locator('.notice');
    await cards.waitFor();
    await page.waitForTimeout(400);
    assert.equal(await cards.locator('.notice-face__headline').innerText(), 'A year ago today you were in Bergen');
    assert.match(await cards.locator('.notice-face__source').innerText(), /from your past trips/i);
    assert.match(await cards.locator('.notice-face__basis').innerText(), /7 photos from 3 May 2025, in your journal of Invented north/);
    assert.equal(await cards.locator('.notice-face__photo img').count(), 3);
    const look = await page.evaluate(() => {
      const card = document.querySelector('.notice').getBoundingClientRect();
      const actions = [...document.querySelectorAll('.notice__action, .notice__close')].map((b) => b.getBoundingClientRect());
      const bar = document.querySelector('.hub-mobile-nav').getBoundingClientRect();
      const top = document.elementFromPoint(bar.left + bar.width / 2, bar.top + bar.height / 2);
      return {
        fills: Math.abs(card.height - window.innerHeight) <= 1 && Math.abs(card.width - window.innerWidth) <= 1,
        minTarget: Math.min(...actions.map((r) => Math.min(r.width, r.height))),
        lowest: Math.max(...actions.map((r) => r.bottom)),
        barCovered: !document.querySelector('.hub-mobile-nav').contains(top),
      };
    });
    assert.ok(look.fills, 'the card fills the phone');
    assert.ok(look.minTarget >= 44, `card controls are at least 44px (got ${look.minTarget})`);
    assert.ok(look.lowest <= 844, 'the actions are on screen');
    assert.ok(look.barCovered, 'the tab bar is under the cards');
    assert.equal(await overflowX(page), 0);

    // Keep the first, move on by tapping the right side, then Back closes without leaving the journal.
    await cards.getByRole('button', { name: 'Keep in the story' }).click();
    await page.mouse.click(330, 400);
    assert.equal(await cards.locator('.notice-face__headline').innerText(), 'Halfway');
    assert.equal(await overflowX(page), 0);
    await page.goBack();
    await cards.waitFor({ state: 'detached', timeout: 5000 });
    assert.equal(await page.evaluate(() => location.hash), hashBefore);

    // One save: the kept card whole, both marked seen. The band is in that day of the story.
    await page.locator('[data-noticed]').waitFor({ timeout: 10000 });
    assert.equal(puts.length, 1);
    const state = puts[0].preferences.journal_noticing_v1;
    assert.deepEqual(Object.values(state.kept).map((c) => c.headline), ['A year ago today you were in Bergen']);
    assert.equal(state.seen.length, 2);
    assert.equal(await page.locator('#day_a2 [data-noticed] h3').innerText(), 'A year ago today you were in Bergen');
    assert.equal(await page.locator('h1').count(), 1);
    assert.equal(await page.locator('[data-notice-pill]').count(), 0, 'nothing left to notice: no pill');
    assert.equal(await overflowX(page), 0);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }

  // Before the trip there is no pill, no empty state, no trace (P4).
  const quiet = await openStory(browser, { width: 390, height: 844 }, {}, undefined, { trip: storyTrip(), history, now: '2026-04-20T10:00:00Z' });
  try {
    await quiet.page.waitForTimeout(800);
    assert.equal(await quiet.page.locator('[data-notice-pill]').count(), 0);
    assert.doesNotMatch(await quiet.page.locator('#app').innerText(), /noticed/i);
  } finally {
    await quiet.context.close();
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
