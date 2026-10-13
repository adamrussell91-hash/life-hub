// Grove Year look prototype: one screenshot set per round.
// Run the Tasks dev server first (cd apps/tasks && npx vite), then:
//   node tools/grove-previews/lookdev-shots.mjs /tmp/grove-look
// Optional: GROVE_ONLY=<shot name> takes one shot, GROVE_BASE_URL (default http://127.0.0.1:5175), CHROME_PATH for a custom browser.
import { chromium } from '../../node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || '/tmp/grove-look';
const base = process.env.GROVE_BASE_URL || 'http://127.0.0.1:5175';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined, args: ['--ignore-gpu-blocklist'] });

async function shot(name, width, height, week) {
  if (process.env.GROVE_ONLY && process.env.GROVE_ONLY !== name) return;
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', (e) => console.log(name, 'error', e.message));
  await page.goto(`${base}/grove-lookdev.html`);
  await page.waitForFunction(() => document.body.dataset.models === 'true', null, { timeout: 300000 });
  if (week) {
    await page.evaluate((w) => window.groveExpand(w), week);
    // Headless Chromium only runs frames when asked: drive the ease and the LOD swap that follows it.
    for (let i = 0; i < 6; i += 1) { await page.screenshot({ path: `${out}/${name}.png` }); await page.waitForTimeout(300); }
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${name}.png`, timeout: 300000 });
  const stats = await page.evaluate(() => `${document.body.dataset.triangles} triangles, ${document.body.dataset.calls} draw calls, ${document.body.dataset.detailed} at full detail`);
  console.log(name, stats);
  await page.close();
}

await shot('year-1440', 1440, 900);
await shot('week23-1440', 1440, 900, 23);
await shot('year-390', 390, 844);
await shot('week23-390', 390, 844, 23);
await browser.close();
