/** Native, local-only malformed wildlife fallback acceptance with synthetic history. */
import {chromium, webkit} from '../node_modules/playwright/index.mjs';
import {mkdir, writeFile} from 'node:fs/promises';

const base = process.env.GROVE_WORLD_URL || 'http://127.0.0.1:5187';
const out = process.env.GROVE_WORLD_REPORT_DIR || '/tmp/grove-phase5-malformed';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname)) throw Error('Local synthetic acceptance only');
await mkdir(out, {recursive: true});
const evidence = [];
const tasks = Array.from({length: 6}, (_, index) => ({
  id: 'malformed-catalogue-' + index,
  title: 'Finished task ' + (index + 1),
  domain: 'life', status: 'done', bucket: 'done',
  completed_at: '2026-10-10T01:0' + index + ':00Z',
  due_date: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-10-10T02:00:00Z'
}));

for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]].filter(([name]) => !process.env.GROVE_TEST_ENGINE || name === process.env.GROVE_TEST_ENGINE)) {
  const browser = await engine.launch({headless: true, ...(name === 'chromium' ? {channel: 'chrome', args: ['--use-angle=metal']} : {})});
  try {
    for (const width of (process.env.GROVE_TEST_WIDTH ? [Number(process.env.GROVE_TEST_WIDTH)] : [1440, 390])) {
      const page = await browser.newPage({viewport: {width, height: width === 390 ? 844 : 1000}, reducedMotion: 'no-preference'});
      const errors = [];
      let catalogueRequests = 0;
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        const Original = Date;
        globalThis.Date = class extends Original {
          constructor(...args) { super(...(args.length ? args : ['2026-10-10T09:00:00Z'])); }
          static now() { return new Original('2026-10-10T09:00:00Z').getTime(); }
        };
      });
      await page.route('**/api/tasks', route => {
        if (route.request().method() !== 'GET') throw Error('Unexpected task source write');
        return route.fulfill({json: {ok: true, data: {tasks}}});
      });
      await page.route('**/api/knowledge/shelf', route => {
        if (route.request().method() !== 'GET') throw Error('Unexpected bookshelf source write');
        return route.fulfill({json: {ok: true, data: {books: [], placements: []}}});
      });
      await page.route('**/assets/grove/animal-catalogue.json', route => {
        if (route.request().method() !== 'GET') throw Error('Unexpected catalogue write');
        catalogueRequests++;
        return route.fulfill({status: 200, json: {assets: [null]}});
      });

      await page.goto(base + '/#/grove');
      if (await page.locator('#sign-in-passphrase').isVisible()) {
        await page.locator('#sign-in-passphrase').fill('tasks-hub-local');
        await page.getByRole('button', {name: 'Sign in', exact: true}).click();
      }
      await page.waitForSelector('.grove-stage[data-state="ready"][data-animals-ready="true"] canvas', {timeout: 60000});
      const grove = await page.locator('.grove-stage').evaluate(stage => ({...stage.dataset, canvasCount: stage.querySelectorAll('canvas').length}));
      if (grove.canvasCount !== 1 || grove.wildlifeCount !== '0' || !grove.unavailableWildlife?.includes('hare: asset unavailable')) throw Error('Grove malformed catalogue fallback failed: ' + JSON.stringify(grove));
      if (await page.locator('.grove-caption').textContent() !== 'Today 10/10/26 · 6 trees') throw Error('Incorrect earned wildlife fixture');
      await page.waitForSelector('.grove-stage[data-motion="running"][data-motion-seconds]');
      await page.getByRole('button', {name: 'Pause motion', exact: true}).click();
      await page.waitForSelector('.grove-stage[data-motion="paused"]');
      const pausedSeconds = await page.locator('.grove-stage').getAttribute('data-motion-seconds');
      await page.waitForTimeout(200);
      if (await page.locator('.grove-stage').getAttribute('data-motion-seconds') !== pausedSeconds) throw Error('Motion continued while paused');
      await page.screenshot({path: out + '/phase5-' + name + '-' + width + '-grove-malformed.png'});
      await page.getByRole('button', {name: 'Resume motion', exact: true}).click();
      await page.waitForSelector('.grove-stage[data-motion="running"]');

      await page.goto(base + '/grove.html');
      await page.waitForSelector('#grove[data-state="ready"] .grove-embed__stage[data-state="ready"][data-animals-ready="true"] canvas', {timeout: 60000});
      const home = await page.locator('.grove-embed__stage').evaluate(stage => ({...stage.dataset, canvasCount: stage.querySelectorAll('canvas').length}));
      if (home.canvasCount !== 1 || home.wildlifeCount !== '0' || !home.unavailableWildlife?.includes('hare: asset unavailable')) throw Error('Home malformed catalogue fallback failed: ' + JSON.stringify(home));
      if (catalogueRequests < 2) throw Error('Both consumers must read the malformed successful catalogue');
      if (errors.length) throw Error(errors.join('\n'));
      await page.screenshot({path: out + '/phase5-' + name + '-' + width + '-home-malformed.png'});
      evidence.push({engine: name, width, syntheticHistory: true, catalogueStatus: 200, malformedCatalogue: {assets: [null]}, catalogueRequests, groveReady: true, homeReady: true, wildlifeCount: 0, unavailableWildlife: grove.unavailableWildlife, pauseResume: true, errors});
      await page.close();
      console.log('PASS malformed catalogue ' + name + ' ' + width);
    }
  } finally {
    await browser.close();
  }
}
await writeFile(out + '/phase5-malformed-catalogue-evidence.json', JSON.stringify(evidence, null, 2));
