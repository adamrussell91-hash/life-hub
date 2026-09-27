/**
 * Live app screenshots for Fix 01 Part A (Vite + real-data fixture).
 */
import { mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.PRO_BASE || 'http://127.0.0.1:5173';
const OUT = '/agent/repos/life-hub/docs/professional-hub/organisations-redesign/screens/fix-01';
const ARTIFACTS = '/opt/cursor/artifacts/organisations-fix-01';
const STORE = '/cursor/stores/bc-edd8c221-029a-4512-8521-dde3d995d77e/media/organisations-fix-01';
const PASS = 'professional-hub-local';

mkdirSync(OUT, { recursive: true });
mkdirSync(ARTIFACTS, { recursive: true });
mkdirSync(STORE, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

async function login() {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  // Passphrase gate
  const input = page.locator('input[type="password"], input[name="passphrase"], input[type="text"]').first();
  if (await input.count()) {
    await input.fill(PASS);
    const btn = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Continue")').first();
    if (await btn.count()) await btn.click();
    else await input.press('Enter');
    await page.waitForTimeout(800);
  }
}

async function shot(name, width, height, hash) {
  await page.setViewportSize({ width, height });
  await page.goto(`${BASE}/${hash}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const path = join(OUT, name);
  await page.screenshot({ path, fullPage: true });
  copyFileSync(path, join(ARTIFACTS, name));
  copyFileSync(path, join(STORE, name));
  console.log('wrote', name, 'url', page.url());
}

await login();

// Discover Aloysius id from directory API
await page.goto(`${BASE}/#/organisations`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
const dir = await page.evaluate(async () => {
  const r = await fetch('/api/organisations/directory');
  return r.json();
});
const alo = dir?.data?.organisations?.find((o) => /aloysius/i.test(o.display_name));
const tri = dir?.data?.organisations?.find((o) => /trinity/i.test(o.display_name));
console.log('dir counts', dir?.data?.counts, 'alo', alo?.id, 'chips', alo?.chips, 'meta', alo?.first_touch_kind);

await shot('live-wall-1440.png', 1440, 900, '#/organisations');
await shot('live-wall-390.png', 390, 844, '#/organisations');

if (alo?.id) {
  await shot('live-aloysius-1440.png', 1440, 900, `#/organisations/${alo.id}`);
  await shot('live-aloysius-390.png', 390, 844, `#/organisations/${alo.id}`);
}
if (tri?.id) {
  await shot('live-trinity-1440.png', 1440, 900, `#/organisations/${tri.id}`);
}

// L6 chip rects at 390 and 1440
for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${BASE}/#/organisations`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const chipCheck = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('.orgs-rchip')];
    return chips.map((c) => ({
      text: c.textContent,
      rects: c.getClientRects().length,
      height: c.getBoundingClientRect().height
    }));
  });
  console.log('chipCheck', width, chipCheck);
}

await browser.close();
