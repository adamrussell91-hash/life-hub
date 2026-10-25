import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

// Use the shipped stylesheet: DOM-only tests cannot detect pointer interception.
const css = readFileSync(new URL('../../apps/teaching/src/styles/app.css', import.meta.url), 'utf8');

test('HTML app previews accept slider pointer and keyboard input in unselected lesson rows', async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox'],
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {})
  });
  try {
    for (const width of [1440, 390]) {
      for (const nested of [false, true]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        try {
          const app = '<iframe class="block-html-app__frame" sandbox="allow-scripts allow-forms" style="height:120px"></iframe>';
          await page.setContent(`<style>${css}</style>
            <div class="lesson-page__block">${nested ? `<section><div>${app}</div></section>` : app}</div>
            <div class="lesson-page__block"><iframe id="generic"></iframe></div>`);
          await page.evaluate(() => {
            window.latestSliderValue = null;
            window.onmessage = (event) => { window.latestSliderValue = event.data; };
            document.querySelector('.block-html-app__frame').srcdoc =
              '<input aria-label="Example slider" type="range" min="0" max="100" value="10" style="width:250px" oninput="parent.postMessage(this.value, &quot;*&quot;)">';
          });
          const slider = page.frameLocator('.block-html-app__frame').getByRole('slider');
          await slider.waitFor();
          const box = await slider.boundingBox();
          assert.ok(box);
          await page.mouse.move(box.x + 30, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + 200, box.y + box.height / 2, { steps: 5 });
          await page.mouse.up();
          await page.waitForFunction(() => Number(window.latestSliderValue) > 50);
          await slider.press('Home');
          await page.waitForFunction(() => window.latestSliderValue === '0');
          assert.equal(await page.locator('#generic').evaluate((el) => getComputedStyle(el).pointerEvents), 'none');
          assert.equal(await page.locator('.block-html-app__frame').getAttribute('sandbox'), 'allow-scripts allow-forms');
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
});
