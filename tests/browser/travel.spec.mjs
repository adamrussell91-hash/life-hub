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
