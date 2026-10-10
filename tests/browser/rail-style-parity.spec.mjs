import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { hubSwitcherHtml } from '../../packages/hub-switcher.js';

const root = new URL('../../', import.meta.url);
const kit = name => `packages/design-kit/${name}.css`;
const read = path => readFile(new URL(path, root), 'utf8');

test('every hub keeps compact on-dark accordion rows when cards and forms load', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    // Serve the real stylesheets, including their imports, without starting any hub API.
    await page.route('http://rail.test/**', async route => {
      const path = new URL(route.request().url()).pathname.slice(1);
      try { await route.fulfill({ contentType: path.endsWith('.js') ? 'text/javascript' : 'text/css', body: await read(path) }); }
      catch { await route.fulfill({ status: 404, body: '' }); }
    });
    await page.goto('http://rail.test/blank');
    const styles = {
      life: [kit('rail'), 'apps/life/css/app.css'],
      teaching: ['apps/teaching/src/design/tokens.css', 'apps/teaching/src/styles/app.css'],
      knowledge: ['apps/knowledge/src/tokens.css', 'apps/knowledge/src/style.css'],
      tasks: [kit('chrome'), 'apps/tasks/src/styles/hub.css', 'apps/tasks/src/styles/cards.css'],
      professional: [kit('chrome'), kit('forms'), kit('cards'), 'apps/professional/src/styles/hub.css'],
      reversed: [kit('chrome'), kit('cards'), kit('forms'), kit('rail')]
    };
    let reference;
    let activeReference;
    for (const [hub, sheets] of Object.entries(styles)) {
      await page.setContent(`<html data-hub="${hub}"><head>${[kit('tokens'), kit('overlays'), ...sheets].map(path => `<link rel="stylesheet" href="http://rail.test/${path}">`).join('')}</head><body><aside class="hub-rail" style="width:240px">${hubSwitcherHtml('life')}</aside><main class="hub-canvas"><div class="hub-row">Canvas row</div><label class="hub-label">Form label</label></main></body></html>`);
      const paint = await page.locator('.hub-row[data-hub="teaching"]').evaluate(row => {
        const css = getComputedStyle(row), label = getComputedStyle(row.querySelector('.hub-label'));
        return { height: row.getBoundingClientRect().height, padding: css.padding, border: css.borderWidth, background: css.backgroundColor, radius: css.borderRadius, shadow: css.boxShadow, align: css.alignItems, label: label.color, labelPadding: label.padding, labelSize: label.fontSize };
      });
      assert.equal(paint.background, 'rgba(0, 0, 0, 0)', `${hub}: idle rows must be transparent`);
      assert.equal(paint.border, '0px', `${hub}: rail rows must not have card borders`);
      assert.equal(paint.padding, '0px', `${hub}: rail rows must not have card padding`);
      assert.equal(paint.height, 40, `${hub}: rail rows must remain compact`);
      reference ??= paint;
      assert.deepEqual(paint, reference, `${hub}: rail paint must match Life`);
      const active = await page.locator('.hub-row[data-hub="life"]').evaluate(row => {
        const css = getComputedStyle(row), label = getComputedStyle(row.querySelector('.hub-label'));
        return { height: row.getBoundingClientRect().height, background: css.backgroundColor, label: label.color, weight: label.fontWeight };
      });
      activeReference ??= active;
      assert.deepEqual(active, activeReference, `${hub}: active paint must match Life`);
      await page.locator('.hub-row[data-hub="teaching"]').hover();
      assert.equal(await page.locator('.hub-row[data-hub="teaching"]').evaluate(el => getComputedStyle(el).backgroundColor), active.background, `${hub}: hover uses the shared on-dark highlight`);
      if (hub === 'professional') {
        assert.notEqual(await page.locator('.hub-canvas .hub-row').evaluate(el => getComputedStyle(el).backgroundColor), paint.background, 'canvas cards retain their surface');
        assert.notEqual(await page.locator('.hub-canvas .hub-label').evaluate(el => getComputedStyle(el).color), paint.label, 'form labels retain their ink');
      }
      await page.mouse.move(1000, 800);
    }
    await page.evaluate(async () => {
      const { bindHubAccordion } = await import('http://rail.test/packages/hub-switcher.js');
      bindHubAccordion(document.querySelector('[data-hub-switcher]'));
    });
    await page.locator('[data-hub-toggle="teaching"]').click();
    assert.equal(await page.locator('[data-hub-toggle="teaching"]').getAttribute('aria-expanded'), 'true');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator('.hub-rail').isVisible(), false, 'phones keep the rail hidden');
    await page.close();
  } finally { await browser.close(); }
});
