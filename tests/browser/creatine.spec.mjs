import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chromium } from 'playwright';
if (!process.env.CREATINE_PREPARED_WEB) await import('../../scripts/prepare-web.mjs');
import { createStaticServer } from '../../scripts/serve.mjs';

let browser, server, baseUrl;
before(async () => {
  server = createStaticServer({ root: new URL('../../dist/', import.meta.url), apiRoot: new URL('../..', import.meta.url), extraFiles: [{
    path: 'data/nutrition/2026/07/2026-07-30-creatine-dose-1.md',
    content: '---\nschema_version: 1\nid: creatine-dose-1\ntype: creatine\ndate: 2026-07-30\ntime: "07:30"\ncreated_at: 2026-07-30T07:30:00+10:00\nupdated_at: 2026-07-30T07:30:00+10:00\nsource: test\ngrams: 10\ndose_key: dose-1\nproduct: Coles creatine\n---\n'
  }] });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = 'http://127.0.0.1:' + server.address().port;
  const options = { headless: true, args: ['--disk-cache-size=1048576', '--disable-gpu-shader-disk-cache'] };
  if (process.env.CREATINE_BROWSER_EXECUTABLE) options.executablePath = process.env.CREATINE_BROWSER_EXECUTABLE;
  browser = await chromium.launch(options);
});
after(async () => { await browser?.close(); server?.closeAllConnections(); server?.close(); });

for (const width of [1440, 800, 390, 320]) {
  test('Creatine Elastic stays below macros, single-line and in bounds at ' + width + 'px', async () => {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', hasTouch: width <= 390, isMobile: width === 390 });
    await context.route('https://fonts.googleapis.com/**', route => route.abort());
    await context.route('https://fonts.gstatic.com/**', route => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    try {
      await page.clock.setFixedTime(new Date('2026-07-30T08:00:00+10:00'));
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.locator('#sign-in-passphrase').fill('life-hub-local');
      await page.locator('#sign-in-button').click();
      await page.locator('#app[data-state="ready"]').waitFor();
      if (width > 720) await page.locator('.desktop-rail [data-section="nutrition"]').click();
      else {
        await page.evaluate(() => { location.hash = '#/nutrition'; });
      }
      const card = page.locator('#nutrition-creatine');
      await card.waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.querySelector('#nutrition-creatine').textContent.includes('Coles creatine'));
      await card.locator('.creatine-zone').waitFor({ state: 'attached' });
      await card.scrollIntoViewIfNeeded();
      const geometry = await card.evaluate(element => {
        const rect = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
        const heading = element.querySelector('.creatine-card__heading');
        const title = heading.querySelector('h3');
        const eta = heading.querySelector('.creatine-card__eta');
        const svg = element.querySelector('svg');
        const zone = svg.querySelector('.creatine-zone');
        const zoneLabel = svg.querySelector('.creatine-zone-label');
        return { card: rect(element), dashboard: rect(element.parentElement), macros: rect(element.previousElementSibling), title: rect(title), eta: rect(eta), svg: rect(svg), zone: rect(zone), zoneLabel: rect(zoneLabel), scrollWidth: element.scrollWidth, label: eta.getAttribute('aria-label') };
      });
      assert.ok(geometry.card.y >= geometry.macros.bottom);
      assert.ok(Math.abs(geometry.card.width - geometry.dashboard.width * (width > 720 ? 0.5 : 1)) <= 1);
      assert.ok(Math.abs(geometry.title.bottom - geometry.eta.bottom) < 5, 'title and ETA share one baseline');
      assert.ok(geometry.eta.x >= geometry.title.right, 'heading must not overlap');
      assert.ok(geometry.eta.right <= geometry.card.right, 'ETA must fit the card');
      assert.ok(geometry.scrollWidth <= geometry.card.width + 1, 'no horizontal card overflow');
      assert.ok(geometry.zoneLabel.bottom < geometry.zone.y, 'target label must sit above its band');
      assert.match(geometry.label, /days to target|In target zone/);
      assert.match(await card.textContent(), /10 g today.*Coles creatine/s);
      assert.equal(await card.locator('button').count(), 1);
      const info = card.locator('.hub-chart-info');
      await info.click();
      const note = page.locator('#hub-chart-info-creatine');
      await note.waitFor({ state: 'visible' });
      assert.match(await note.textContent(), /not measured muscle saturation/);
      const infoBox = await info.boundingBox();
      if (width <= 390) {
        const target = await info.evaluate(button => {
          const box = button.getBoundingClientRect(), style = getComputedStyle(button), hit = getComputedStyle(button, '::after');
          return { width: box.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth) - parseFloat(hit.left) - parseFloat(hit.right), height: box.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth) - parseFloat(hit.top) - parseFloat(hit.bottom) };
        });
        assert.ok(target.height >= 44 && target.width >= 44, 'shared info hit region must be at least 44px');
      }
      await page.keyboard.press('Escape');
      if (process.env.CREATINE_SCREENSHOT_DIR) await card.screenshot({ path: process.env.CREATINE_SCREENSHOT_DIR + '/creatine-' + width + '.png' });
    } catch (error) {
      console.error('Creatine browser failure at ' + width + ':', error);
      throw error;
    } finally { await context.close(); }
  });
}
