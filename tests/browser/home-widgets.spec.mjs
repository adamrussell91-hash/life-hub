import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chromium } from 'playwright';
import '../../scripts/prepare-web.mjs';
import { createStaticServer } from '../../scripts/serve.mjs';

const LOCAL_PASSPHRASE = 'life-hub-local';

let browser;
let server;
let baseUrl;

before(async () => {
  server = createStaticServer({
    root: new URL('../../dist/', import.meta.url),
    apiRoot: new URL('../..', import.meta.url)
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  server?.close();
});

async function signIn(page) {
  await page.goto(baseUrl);
  await page.locator('#sign-in-view').waitFor();
  await page.locator('#sign-in-passphrase').fill(LOCAL_PASSPHRASE);
  await page.locator('#sign-in-button').click();
  await page.locator('#app[data-state="ready"]').waitFor();
}

test('Home shows the Now panel in place of the old hub cards', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page);
    assert.equal(await page.locator('#clare-dump-form').count(), 0);
    assert.equal(await page.locator('[data-hub-pulse]').count(), 0);
    assert.equal(await page.locator('#home-now [data-now-capture]').isVisible(), true);
    assert.equal(await page.locator('#home-now [data-now-track]').isVisible(), true);
    assert.equal(await page.locator('#home-now [data-now-task-list]').isVisible(), true);
    assert.equal(await page.locator('#home-now .now-jump').count(), 4);
  } finally {
    await context.close();
  }
});

test('the capture bar switches between Task, Note and Book, and only enables with something to save', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page);
    const input = page.locator('[data-now-input]');
    const submit = page.locator('[data-now-submit]');
    assert.equal(await submit.isDisabled(), true);
    await input.fill('Book physio');
    assert.equal(await submit.isDisabled(), false);
    await input.fill('');
    assert.equal(await submit.isDisabled(), true);

    await page.locator('[data-now-mode="note"]').click();
    assert.equal(await page.locator('[data-now-mode="note"]').getAttribute('aria-checked'), 'true');
    assert.equal(await input.getAttribute('placeholder'), "What's on your mind?");
    assert.equal(await submit.textContent(), 'Save');

    await page.locator('[data-now-mode="note"]').press('ArrowRight');
    assert.equal(await page.locator('[data-now-mode="book"]').getAttribute('aria-checked'), 'true');
    assert.equal(await submit.textContent(), 'Log');
  } finally {
    await context.close();
  }
});

test('pressing / on Home jumps to the capture bar', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page);
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('/');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'now-capture-input');
  } finally {
    await context.close();
  }
});

test('unbound stores degrade to honest copy, never a crash', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page);
    await page.waitForFunction(() => !/Checking/.test(document.querySelector('[data-now-task-list]')?.textContent ?? 'Checking'));
    const tasks = await page.locator('[data-now-task-list]').textContent();
    assert.match(tasks, /isn't connected yet|Couldn't load your tasks|Nothing open/);
    await page.locator('[data-now-mode="book"]').click();
    const options = await page.locator('[data-now-options]').textContent();
    assert.match(options, /Bookshelf|books|reading/);
    assert.doesNotMatch(await page.locator('[data-now-day-headline]').textContent(), /undefined|NaN/);
  } finally {
    await context.close();
  }
});
