import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chromium } from 'playwright';
import '../../scripts/prepare-web.mjs';
import { createStaticServer } from '../../scripts/serve.mjs';

const LOCAL_PASSPHRASE = 'life-hub-local';
const SECRET_RESPONSE_PATTERN = /life-hub-local|github_pat_|ghp_|gho_|Authorization:\s*Bearer|LIFE_HUB_PASSPHRASE_HASH|SESSION_SECRET|GITHUB_TOKEN/i;

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

async function monitorApiResponses(page, { expectResponse = true } = {}) {
  const responses = [];
  await page.exposeFunction('__recordLifeHubApiResponse', response => responses.push(response));
  await page.addInitScript(({ origin }) => {
    const nativeFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (...arguments_) => {
      const response = await nativeFetch(...arguments_);
      const url = new URL(response.url);
      if (url.origin === origin && url.pathname.startsWith('/api/')) {
        const body = response.status === 204 || response.status === 304
          ? ''
          : await response.clone().text();
        await globalThis.__recordLifeHubApiResponse({
          url: url.pathname,
          status: response.status,
          body
        });
      }
      return response;
    };
  }, { origin: baseUrl });

  return async () => {
    if (expectResponse) {
      assert.ok(responses.length > 0, 'expected at least one audited API response');
    }
    for (const response of responses) {
      assert.doesNotMatch(response.body, SECRET_RESPONSE_PATTERN, `${response.status} ${response.url}`);
    }
  };
}

async function signIn(page, { origin = baseUrl, fixedTime = true } = {}) {
  if (fixedTime) await page.clock.setFixedTime(new Date('2026-07-30T12:00:00+10:00'));
  await page.goto(origin);
  await page.locator('#sign-in-view').waitFor();
  await page.locator('#sign-in-passphrase').fill(LOCAL_PASSPHRASE);
  await page.locator('#sign-in-button').click();
  await page.locator('#app[data-state="ready"]').waitFor();
  assert.equal(await page.locator('#sign-in-passphrase').inputValue(), '');
}

async function startShortSessionServer(sessionMs) {
  const shortServer = createStaticServer({
    root: new URL('../../dist/', import.meta.url),
    apiRoot: new URL('../..', import.meta.url),
    sessionMs
  });
  shortServer.listen(0, '127.0.0.1');
  await once(shortServer, 'listening');
  return {
    origin: `http://127.0.0.1:${shortServer.address().port}`,
    close: () => shortServer.close()
  };
}

async function waitForServiceWorkerControl(page) {
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, {
    polling: 100,
    timeout: 10_000
  });
}

async function readHome(page) {
  return page.evaluate(() => ({
    calories: document.querySelector('[data-value="calories"]')?.textContent,
    protein: document.querySelector('[data-value="protein"]')?.textContent,
    fat: document.querySelector('[data-value="fat"]')?.textContent,
    streak: document.querySelector('[data-value="streak"]')?.textContent,
    logging: document.querySelector('[data-value="logging"]')?.textContent,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    railDisplay: getComputedStyle(document.querySelector('.desktop-rail')).display,
    mobileDisplay: getComputedStyle(document.querySelector('.mobile-nav')).display
  }));
}

test('browser-visible origin exposes the allowlisted publish artifact only', async () => {
  const response = await fetch(`${baseUrl}/vendor/js-yaml.mjs`);
  assert.equal(response.status, 200);

  for (const path of [
    '/central-node.md',
    '/config/targets.yml',
    '/tests/browser/home.spec.mjs',
    '/scripts/serve.mjs',
    '/netlify/functions/auth.mjs',
    '/.env.example'
  ]) {
    assert.equal((await fetch(`${baseUrl}${path}`)).status, 404, path);
  }
});

test('rejects the wrong passphrase and clears the password field', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const assertNoSecretResponses = await monitorApiResponses(page);
  await page.goto(baseUrl);
  await page.locator('#sign-in-view').waitFor();

  await page.locator('#sign-in-passphrase').fill('definitely-wrong');
  await page.locator('#sign-in-button').click();
  await page.locator('#sign-in-error').waitFor();

  assert.equal(await page.locator('#sign-in-error').textContent(), 'Invalid passphrase');
  assert.equal(await page.locator('#sign-in-passphrase').inputValue(), '');
  assert.equal(await page.locator('#sign-in-passphrase').evaluate(input => document.activeElement === input), true);
  assert.equal(await page.locator('#app-shell').isHidden(), true);
  await assertNoSecretResponses();
  await context.close();
});

test('signs in and renders the approved Home values at desktop width', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const assertNoSecretResponses = await monitorApiResponses(page);
  await signIn(page);
  const home = await readHome(page);

  assert.deepEqual(home, {
    calories: '1,130',
    protein: '80 g',
    fat: '27 g',
    streak: '1',
    logging: '3 of 5',
    overflow: false,
    railDisplay: 'flex',
    mobileDisplay: 'none'
  });
  assert.equal(await page.locator('[data-ring="protein"]').count(), 1);
  assert.equal(await page.locator('[data-progress="protein"]').count(), 0);
  assert.match(await page.evaluate(() => sessionStorage.getItem('life-hub:session-expiry')), /^2026-/);
  assert.equal(await page.locator('#sign-in-view').isHidden(), true);
  await assertNoSecretResponses();
  await context.close();
});

test('the Life Hub tile appears on sign-in and every signed-in page', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    await page.goto(baseUrl);
    await page.locator('#sign-in-view').waitFor();
    assert.equal(await page.locator('#sign-in-view .sign-in__mark').count(), 1);
    assert.equal(await page.locator('link[rel="icon"][href*="life-hub"]').count(), 1);

    await signIn(page);

    const sections = [
      ['home', 'Home'],
      ['chat', 'Chat'],
      ['nutrition', 'Nutrition'],
      ['fitness', 'Fitness'],
      ['body', 'Body'],
      ['mind', 'Mind'],
      ['skincare', 'Skincare'],
      ['calendar', 'Calendar'],
      ['central-node', 'Central Node']
    ];
    for (const [section, title] of sections) {
      await page.locator(`.desktop-rail .nav-item[data-section="${section}"]`).click();
      await page.locator('#page-title', { hasText: title }).waitFor();
      assert.equal(await page.locator('.page-header__title-row .hub-mark').count(), 1, section);
    }
  } finally {
    await context.close();
  }
});

test('uses mobile navigation without overflow at 390 px after sign-in', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const assertNoSecretResponses = await monitorApiResponses(page);
  await signIn(page);
  const home = await readHome(page);

  assert.equal(home.overflow, false);
  assert.equal(home.railDisplay, 'none');
  assert.equal(home.mobileDisplay, 'grid');

  const targetHeights = await page.locator('.mobile-nav button').evaluateAll(
    buttons => buttons.map(button => button.getBoundingClientRect().height)
  );
  assert.ok(targetHeights.every(height => height >= 44));

  await page.locator('.mobile-nav [data-section="calendar"]').click();
  await page.locator('#calendar-dashboard:not([hidden])').waitFor();
  assert.equal(await page.locator('.hub-calendar__timegrid').count(), 1);
  assert.ok((await page.locator('[data-calendar="compose-title"]').count()) >= 1);
  await assertNoSecretResponses();
  await context.close();
});

test('manual refresh uses the unchanged manifest without downloading files again', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const assertNoSecretResponses = await monitorApiResponses(page);
  let fileRequests = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/repo/files') fileRequests += 1;
  });
  await signIn(page);
  assert.equal(fileRequests, 1);

  const unchanged = page.waitForResponse(response => (
    new URL(response.url()).pathname === '/api/repo/manifest' && response.status() === 304
  ));
  await page.locator('#refresh-button').click();
  await unchanged;
  await page.locator('#app[data-state="ready"]').waitFor();

  assert.equal(fileRequests, 1);
  assert.equal(await page.locator('[data-value="calories"]').textContent(), '1,130');
  await assertNoSecretResponses();
  await context.close();
});

test('sign-out clears the session marker, cookie, and private repository cache', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const assertNoSecretResponses = await monitorApiResponses(page);
  await signIn(page);
  assert.equal(await page.evaluate(() => caches.has('life-hub-private-v2')), true);

  const logout = page.waitForResponse(response => new URL(response.url()).pathname === '/api/logout');
  await page.locator('#sign-out-button').click();
  await logout;
  await page.locator('#sign-in-view').waitFor();

  assert.equal(await page.locator('#sign-in-view').isVisible(), true);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('life-hub:session-expiry')), null);
  assert.equal(await page.evaluate(() => caches.has('life-hub-private-v2')), false);
  assert.equal((await context.cookies()).some(cookie => cookie.name === 'life_hub_mock'), false);
  await assertNoSecretResponses();
  await context.close();
});

test('session expiry is not masked by the public service-worker cache', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const assertNoSecretResponses = await monitorApiResponses(page);
  await signIn(page);
  await waitForServiceWorkerControl(page);

  assert.equal(await page.evaluate(async () => (await fetch('/api/session')).status), 200);
  await page.waitForTimeout(50);
  await context.clearCookies();
  assert.equal(await page.evaluate(async () => (await fetch('/api/session')).status), 401);

  await page.locator('#refresh-button').click();
  await page.locator('#sign-in-view').waitFor();
  assert.equal(await page.locator('#sign-in-error').textContent(), 'Your session expired. Please sign in again.');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('life-hub:session-expiry')), null);
  assert.equal(await page.evaluate(() => caches.has('life-hub-private-v2')), true);

  const publicCacheUrls = await page.evaluate(async () => {
    const names = (await caches.keys()).filter(name => name.startsWith('life-hub-shell-'));
    const requests = await Promise.all(names.map(async name => (await caches.open(name)).keys()));
    return requests.flat().map(request => new URL(request.url).pathname);
  });
  assert.equal(publicCacheUrls.some(path => path.startsWith('/api/')), false);
  await assertNoSecretResponses();
  await context.close();
});

test('offline reload is limited to the authenticated tab before expiry', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const assertNoSecretResponses = await monitorApiResponses(page);
  await signIn(page);
  await waitForServiceWorkerControl(page);

  const publicCacheUrls = await page.evaluate(async () => {
    const names = (await caches.keys()).filter(name => name.startsWith('life-hub-shell-'));
    const requests = await Promise.all(names.map(async name => (await caches.open(name)).keys()));
    return requests.flat().map(request => new URL(request.url).pathname);
  });
  assert.equal(publicCacheUrls.some(path => (
    path.startsWith('/tests/fixtures/') || path.startsWith('/fixtures/') ||
    path === '/config/targets.yml' || path === '/config/agents.yml'
  )), false);

  await context.setOffline(true);
  await page.reload();
  await page.locator('#app[data-state="offline"]').waitFor();
  assert.equal(await page.locator('[data-value="calories"]').textContent(), '1,130');
  assert.equal(await page.locator('#network-status').isVisible(), true);

  const freshPage = await context.newPage();
  const assertFreshNoSecretResponses = await monitorApiResponses(freshPage, { expectResponse: false });
  await freshPage.goto(baseUrl);
  await freshPage.locator('#sign-in-view').waitFor();
  assert.equal(await freshPage.locator('#sign-in-view').isVisible(), true);
  assert.equal(await freshPage.locator('#app-shell').isHidden(), true);

  await assertFreshNoSecretResponses();
  await assertNoSecretResponses();
  await context.close();
});

test('known server deadline hides private data when crossed online or offline', async t => {
  const short = await startShortSessionServer(1_500);
  t.after(short.close);

  for (const offline of [false, true]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, { origin: short.origin, fixedTime: false });
    assert.equal(await page.locator('#app-shell').isVisible(), true);
    if (offline) await context.setOffline(true);

    await page.locator('#sign-in-view').waitFor({ state: 'visible', timeout: 5_000 });
    assert.equal(await page.locator('#app-shell').isHidden(), true);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('life-hub:session-expiry')), null);
    assert.match(await page.locator('#sign-in-error').textContent(), /session expired/i);
    await context.close();
  }
});

test('offline logout survives reload and clears the server cookie on reconnect', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page);
  await waitForServiceWorkerControl(page);

  await context.setOffline(true);
  await page.locator('#sign-out-button').click();
  await page.locator('#sign-in-view').waitFor();
  await page.waitForFunction(() => localStorage.getItem('life-hub:logout-pending') === '1');
  await page.reload();
  await page.locator('#sign-in-view').waitFor();
  assert.equal(await page.locator('#app-shell').isHidden(), true);

  const completedLogout = page.waitForResponse(response => (
    new URL(response.url()).pathname === '/api/logout' && response.status() === 204
  ));
  await context.setOffline(false);
  await completedLogout;
  await page.waitForFunction(() => localStorage.getItem('life-hub:logout-pending') === null);

  assert.equal((await context.cookies()).some(cookie => cookie.name === 'life_hub_mock'), false);
  assert.equal(await page.evaluate(() => caches.has('life-hub-private-v2')), false);
  await context.close();
});

test('rapid sign-in waits behind a delayed logout request', async () => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  let authRequests = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/auth') authRequests += 1;
  });
  await signIn(page);

  let releaseLogout;
  const logoutGate = new Promise(resolve => { releaseLogout = resolve; });
  await page.route('**/api/logout', async route => {
    await logoutGate;
    await route.continue();
  });
  await page.locator('#sign-out-button').click();
  await page.locator('#sign-in-view').waitFor();
  await page.locator('#sign-in-passphrase').fill(LOCAL_PASSPHRASE);
  await page.locator('#sign-in-button').click();
  await page.waitForTimeout(100);
  assert.equal(authRequests, 1);

  releaseLogout();
  await page.locator('#app[data-state="ready"]').waitFor();
  assert.equal(authRequests, 2);
  assert.equal(await page.evaluate(() => localStorage.getItem('life-hub:logout-pending')), null);
  await context.close();
});
