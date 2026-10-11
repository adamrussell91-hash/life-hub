import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { createStaticServer } from '../../scripts/serve.mjs';

// Run against a prepared preview; never race the build/other browser tests.
let browser, server, baseUrl;
before(async () => {
  server = createStaticServer({ root: new URL('../../dist/', import.meta.url), apiRoot: new URL('../..', import.meta.url) });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = 'http://127.0.0.1:' + server.address().port;
  const options = { headless: true, args: ['--disk-cache-size=1048576', '--disable-gpu-shader-disk-cache'] };
  if (process.env.CREATINE_BROWSER_EXECUTABLE) options.executablePath = process.env.CREATINE_BROWSER_EXECUTABLE;
  browser = await chromium.launch(options);
});
after(async () => { await browser?.close(); server?.closeAllConnections(); server?.close(); });

for (const type of ['creatine', 'creatine_plan', 'meal']) {
  test(type + ' Confirm card keeps edited phone actions visible and hides internal identity', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
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
      await page.evaluate(() => { location.hash = '#/chat'; });
      await page.locator('#chat-view').waitFor({ state: 'visible' });
      await page.evaluate(async recordType => {
        const { appendRecordProposal } = await import('/js/app/render-chat.js');
        const record = recordType === 'meal'
          ? {type:'meal',date:'2026-07-30',time:'08:00',meal:'breakfast',calories:358,protein_g:42.2,fat_g:11.5,carbs_g:17.45,sodium_mg:209,calcium_mg:350,creatine_g:10}
          : recordType === 'creatine'
          ? { type: recordType, date: '2026-07-30', time: '08:00', grams: 7, dose_key: 'dose-1', product: 'Coles creatine' }
          : { type: recordType, date: '2026-07-30', time: '08:00', daily_g: 5, maintenance_g: 5, mode: 'loading' };
        const proposal = appendRecordProposal(document, { path: 'data/nutrition/2026/07/2026-07-30-' + recordType + '.md', record, notes: 'Recorded routine details. '.repeat(40) });
        window.creatineConfirmClicks = { confirm: 0, discard: 0 };
        proposal.confirm.addEventListener('click', () => { window.creatineConfirmClicks.confirm++; });
        proposal.discard.addEventListener('click', () => { window.creatineConfirmClicks.discard++; });
      }, type);
      const card = page.locator('#chat-pending-confirms .record-proposal');
      await card.waitFor({ state: 'visible' });
      assert.equal(await card.locator('.confirm-card__title').textContent(), type === 'meal' ? 'Meal' : type === 'creatine' ? 'Creatine' : 'Creatine routine');
      assert.equal(await card.locator('[data-field="dose_key"]').count(), 0);
      assert.doesNotMatch(await card.textContent(), /dose_key|dose-1|creatine_plan/);
      if(type==='meal') assert.match(await card.locator('.confirm-card__pills').textContent(), /Creatine.*10 g/s);
      if (process.env.CREATINE_SCREENSHOT_DIR) await card.screenshot({ path: process.env.CREATINE_SCREENSHOT_DIR + '/creatine-confirm-' + type + '-collapsed-390.png' });
      await card.getByRole('button', { name: 'Show all & edit' }).click();
      await card.locator('textarea[data-field="notes"]').fill('Updated notes after checking the routine. '.repeat(50));
      await card.locator('[data-field="' + (type === 'meal' ? 'creatine_g' : type === 'creatine' ? 'grams' : 'daily_g') + '"]').fill(type === 'creatine' ? '8' : '5');
      // A shorter visual viewport exercises the action dock after long entry.
      await page.setViewportSize({ width: 390, height: 600 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const actions = card.locator('.confirm-card__actions');
      const rects = await actions.locator('button').evaluateAll(buttons => buttons.map(button => {
        const r = button.getBoundingClientRect();
        const center = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { text: button.textContent, height: r.height, width: r.width, y: r.y, bottom: r.bottom, tappable: center === button || button.contains(center), viewport: visualViewport.height };
      }));
      console.log(type + ' phone action geometry:', JSON.stringify(rects));
      if (process.env.CREATINE_SCREENSHOT_DIR) await page.screenshot({ path: process.env.CREATINE_SCREENSHOT_DIR + '/creatine-confirm-' + type + '-390.png' });
      for (const action of rects) {
        assert.ok(action.height >= 44, action.text + ' must be at least 44px tall');
        assert.ok(action.y >= 0 && action.bottom <= action.viewport - 8, action.text + ' must clear the phone bottom');
        assert.equal(action.tappable, true, action.text + ' must be reachable after data entry');
      }
      await card.getByRole('button', { name: 'Confirm', exact: true }).click();
      await card.getByRole('button', { name: 'Discard', exact: true }).click();
      assert.deepEqual(await page.evaluate(() => window.creatineConfirmClicks), { confirm: 1, discard: 1 });
    } finally { await context.close(); }
  });
}
