import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const root = new URL('../../', import.meta.url);
const kit = name => `packages/design-kit/${name}.css`;
const read = path => readFile(new URL(path, root), 'utf8');
const shot = process.env.RAIL_COLLAPSE_SHOTS;

// Each hub's real sheets and shell markup: the rail and the canvas it gives way to.
const hubs = {
  life: {
    sheets: [kit('rail'), 'apps/life/css/app.css'],
    body: '<div class="app-shell"><aside class="desktop-rail hub-rail"><div class="hub-rail__brand-block"><a class="hub-rail__brand" href="#">Life Hub</a></div><nav class="hub-rail__nav"><a class="hub-rail__link" href="#">Home</a></nav></aside><main class="page-frame" data-canvas><header class="page-header"><h1>Home</h1></header></main></div>'
  },
  teaching: {
    sheets: ['apps/teaching/src/design/tokens.css', 'apps/teaching/src/styles/app.css'],
    body: '<div class="teacher-layout"><nav class="teacher-layout__rail hub-rail"><div class="teacher-layout__rail-brand-row"><a class="hub-rail__brand" href="#">Teaching Hub</a></div><div class="teacher-layout__rail-nav"><a class="hub-rail__link" href="#">Dashboard</a></div></nav><div class="teacher-layout__main" data-canvas><h1>Dashboard</h1></div></div>'
  },
  knowledge: {
    sheets: ['apps/knowledge/src/tokens.css', 'apps/knowledge/src/style.css'],
    body: '<div class="app-shell"><aside class="rail hub-rail"><div class="hub-rail__brand-block"><a class="hub-rail__brand" href="#">Knowledge Hub</a></div><nav class="rail__nav hub-rail__nav"><button class="hub-rail__link">Archive</button></nav></aside><main class="canvas" data-canvas><h1>Archive</h1></main></div>'
  },
  tasks: {
    sheets: [kit('chrome'), 'apps/tasks/src/styles/hub.css'],
    body: '<div class="hub-layout"><aside class="hub-rail"><div class="hub-rail__brand-block"><a class="hub-rail__brand" href="#">Tasks Hub</a></div><nav class="hub-rail__nav"><a class="hub-rail__link" href="#">Board</a></nav></aside><main class="hub-canvas" data-canvas><h1>Board</h1></main></div>'
  },
  professional: {
    sheets: [kit('chrome'), 'apps/professional/src/styles/hub.css'],
    body: '<div class="hub-layout"><aside class="hub-rail"><div class="hub-rail__brand-block"><a class="hub-rail__brand" href="#">Professional Hub</a></div><nav class="hub-rail__nav"><a class="hub-rail__link" href="#">Home</a></nav></aside><main class="hub-canvas" data-canvas><h1>Home</h1></main></div>'
  },
  travel: {
    sheets: [kit('chrome'), 'apps/travel/src/styles/travel.css'],
    body: '<div class="hub-layout"><aside class="hub-rail"><div class="hub-rail__brand-block"><a class="hub-rail__brand" href="#">Travel Hub</a></div><nav class="hub-rail__nav"><a class="hub-rail__link" href="#">Trips</a></nav></aside><main class="hub-canvas" data-canvas><h1>Trips</h1></main></div>'
  }
};

const geometry = page => page.evaluate(() => {
  const rail = document.querySelector('.hub-rail').getBoundingClientRect();
  const tab = document.querySelector('#hub-rail-collapse');
  return {
    canvasLeft: Math.round(document.querySelector('[data-canvas]').getBoundingClientRect().left),
    railRight: Math.round(rail.right),
    railWidth: Math.round(rail.width),
    railVisible: getComputedStyle(document.querySelector('.hub-rail')).visibility === 'visible',
    tabLeft: tab ? Math.round(tab.getBoundingClientRect().left) : null,
    tabShown: tab ? getComputedStyle(tab).display !== 'none' : false,
    expanded: tab?.getAttribute('aria-expanded')
  };
});

test('every hub rail slides away and back, and the canvas takes the room', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [hub, { sheets, body }] of Object.entries(hubs)) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.route('http://rail.test/**', async route => {
        const path = new URL(route.request().url()).pathname.slice(1);
        try { await route.fulfill({ contentType: path.endsWith('.js') ? 'text/javascript' : 'text/css', body: await read(path) }); }
        catch { await route.fulfill({ status: 404, body: '' }); }
      });
      await page.goto('http://rail.test/blank');
      await page.evaluate(() => localStorage.clear());
      await page.setContent(`<html data-hub="${hub}"><head>${[kit('tokens'), kit('overlays'), ...sheets].map(path => `<link rel="stylesheet" href="http://rail.test/${path}">`).join('')}</head><body>${body}</body></html>`);
      await page.evaluate(async () => {
        const { mountRailCollapse } = await import('http://rail.test/packages/design-kit/js/hub-rail-collapse.js');
        mountRailCollapse();
        mountRailCollapse(); // shells call it on every render
      });
      assert.equal(await page.locator('#hub-rail-collapse').count(), 1, `${hub}: one tab`);

      const open = await geometry(page);
      assert.equal(open.railWidth, 240, `${hub}: rail keeps 15rem`);
      assert.equal(open.canvasLeft, 240, `${hub}: canvas starts after the rail`);
      assert.equal(open.tabLeft, 240, `${hub}: tab sits on the rail edge`);
      assert.equal(open.expanded, 'true');
      if (shot) await page.screenshot({ path: `${shot}/${hub}-open.png` });

      await page.locator('#hub-rail-collapse').click();
      await page.waitForTimeout(450);
      const shut = await geometry(page);
      assert.equal(shut.canvasLeft, 20, `${hub}: canvas takes the rail's room, less the tab's gutter`);
      assert.ok(shut.railRight <= 0, `${hub}: rail slides fully off screen`);
      assert.equal(shut.railVisible, false, `${hub}: hidden rail is out of the tab order`);
      assert.equal(shut.tabLeft, 0, `${hub}: tab waits at the left edge`);
      assert.equal(shut.expanded, 'false');
      assert.equal(await page.evaluate(() => localStorage.getItem('hub-rail-collapsed')), '1', `${hub}: choice remembered`);
      if (shot) await page.screenshot({ path: `${shot}/${hub}-shut.png` });

      await page.keyboard.press('Control+Backslash');
      await page.waitForTimeout(450);
      const back = await geometry(page);
      assert.equal(back.canvasLeft, 240, `${hub}: Ctrl+\\ brings the rail back`);
      assert.equal(back.railVisible, true);

      await page.setViewportSize({ width: 390, height: 844 });
      const phone = await geometry(page);
      assert.equal(phone.tabShown, false, `${hub}: phones get no tab (no rail)`);
      await page.close();
    }
  } finally { await browser.close(); }
});
