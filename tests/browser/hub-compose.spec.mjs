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
  await page.clock.setFixedTime(new Date('2026-07-30T12:00:00+10:00'));
  await page.goto(baseUrl);
  await page.locator('#sign-in-view').waitFor();
  await page.locator('#sign-in-passphrase').fill(LOCAL_PASSPHRASE);
  await page.locator('#sign-in-button').click();
  await page.locator('#app[data-state="ready"]').waitFor();
}

test('Dump for Clare is an always-open compose card, not a Write a dump popover', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page);
    const form = page.locator('#clare-dump-form');
    await form.waitFor();
    assert.equal(await page.locator('#clare-dump-text').isVisible(), true);
    assert.equal(await page.locator('.hub-pulse-clare [data-morphing-trigger]').count(), 0);
    assert.equal(await page.getByText('Write a dump').count(), 0);
    assert.equal(await page.getByText('Will be posted').count(), 0);
    await expectVisibleDumpChrome(page);
  } finally {
    await context.close();
  }
});

test('calendar expands date and time, then Schedule; close collapses', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page);
    const form = page.locator('#clare-dump-form');
    await form.waitFor();
    await page.locator('#clare-dump-text').fill('Book the florist');
    await page.locator('[data-hub-compose-cal]').click();
    await page.waitForFunction(() => document.querySelector('#clare-dump-form')?.classList.contains('is-scheduling'));

    const dateLabel = (await page.locator('[data-hub-compose-date-label]').textContent())?.trim();
    const timeLabel = (await page.locator('[data-hub-compose-time-label]').textContent())?.trim();
    assert.equal(dateLabel, '30/07/26');
    assert.equal(timeLabel, '12:00');
    assert.doesNotMatch(dateLabel, /Jul|July|Dec/i);
    assert.equal(await page.locator('[data-hub-compose-schedule]').isVisible(), true);
    assert.equal(await page.getByText('Will be posted').count(), 0);

    await page.locator('[data-hub-compose-close]').click();
    await page.waitForFunction(() => !document.querySelector('#clare-dump-form')?.classList.contains('is-scheduling'));
    assert.equal(await page.locator('[data-hub-compose-cal]').isVisible(), true);
  } finally {
    await context.close();
  }
});

async function expectVisibleDumpChrome(page) {
  assert.equal(await page.locator('#clare-dump-protocol').isVisible(), true);
  assert.equal(await page.locator('#clare-brief-button').isVisible(), true);
  assert.equal(await page.locator('[data-hub-compose-dump]').isVisible(), true);
  assert.equal(await page.locator('[data-hub-compose-cal]').isVisible(), true);
}
