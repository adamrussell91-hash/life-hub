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

test('Dump for Clare is gone; the three hub cards each carry their own quick tool', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page);
    assert.equal(await page.locator('#clare-dump-form').count(), 0);
    assert.equal(await page.locator('[data-hub-pulse="teaching"]').isVisible(), true);
    assert.equal(await page.locator('[data-hub-pulse="knowledge"]').isVisible(), true);
    assert.equal(await page.locator('[data-hub-pulse="tasks"]').isVisible(), true);
  } finally {
    await context.close();
  }
});

test('each hub card expands and collapses independently', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page);
    const teachingToggle = page.locator('[data-hub-pulse="teaching"] [data-hub-pulse-toggle]');
    const teachingBody = page.locator('#hub-pulse-body-teaching');
    const tasksToggle = page.locator('[data-hub-pulse="tasks"] [data-hub-pulse-toggle]');
    const tasksBody = page.locator('#hub-pulse-body-tasks');

    assert.equal(await teachingBody.isVisible(), false);
    await teachingToggle.click();
    assert.equal(await teachingBody.isVisible(), true);
    assert.equal(await teachingToggle.getAttribute('aria-expanded'), 'true');

    // Expanding Tasks does not collapse the already-open Teaching card.
    await tasksToggle.click();
    assert.equal(await tasksBody.isVisible(), true);
    assert.equal(await teachingBody.isVisible(), true);

    await teachingToggle.click();
    assert.equal(await teachingBody.isVisible(), false);
    assert.equal(await teachingToggle.getAttribute('aria-expanded'), 'false');
  } finally {
    await context.close();
  }
});

test('the Knowledge quick-note Save button only enables once there is text', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page);
    const text = page.locator('[data-knowledge-quick-text]');
    const save = page.locator('[data-knowledge-quick-save]');
    assert.equal(await save.isDisabled(), true);
    await text.fill('Belonging notes for 10 English');
    assert.equal(await save.isDisabled(), false);
    await text.fill('');
    assert.equal(await save.isDisabled(), true);
  } finally {
    await context.close();
  }
});

test('Teaching and Tasks cards degrade to an honest empty/unbound state, never a crash, when their store is unbound', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page);
    await page.locator('[data-hub-pulse="teaching"] [data-hub-pulse-toggle]').click();
    await page.locator('[data-hub-pulse="tasks"] [data-hub-pulse-toggle]').click();
    await page.waitForFunction(() => document.querySelector('[data-hub-pulse="teaching"]')?.dataset.hubState !== 'loading');
    assert.equal(await page.locator('[data-hub-pulse="teaching"] .hub-agenda__empty').isVisible(), true);
    assert.equal(await page.locator('[data-hub-pulse="tasks"] .hub-checklist__empty').isVisible(), true);
    assert.equal(await page.locator('[data-hub-pulse="teaching"] [data-hub-status]').isVisible(), true);
  } finally {
    await context.close();
  }
});
