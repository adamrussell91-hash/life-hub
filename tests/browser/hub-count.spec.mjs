import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../..', import.meta.url));
const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8'
};

const pageHtml = `<!doctype html>
<html lang="en-AU" data-hub="life">
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="/packages/design-kit/tokens.css">
  <link rel="stylesheet" href="/packages/design-kit/overlays.css">
  <link rel="stylesheet" href="/packages/design-kit/motion.css">
  <link rel="stylesheet" href="/apps/life/css/app.css">
</head>
<body style="margin:0;padding:2rem;background:#dce6f2">
  <article class="metric-card logging-card" style="max-width:28rem">
    <div class="metric-heading">
      <div>
        <p class="metric-label" id="logging-label">Logging</p>
        <p class="metric-context">Daily completeness</p>
      </div>
      <span class="logging-total" data-value="logging">— of 5</span>
    </div>
    <div class="logging-list" aria-label="Logging categories">
      <span data-complete="nutrition"><i></i>Nutrition</span>
      <span data-complete="fitness" data-checked="true"><i></i>Fitness</span>
      <span data-complete="diary"><i></i>Diary</span>
      <span data-complete="body"><i></i>Body</span>
      <span data-complete="skincare"><i></i>Skincare</span>
    </div>
    <div class="progress-track progress-track--logging" style="--progress:20%"><span></span></div>
  </article>
  <script type="module">
    import { startHubMotion } from '/packages/design-kit/js/hub-motion.js';
    startHubMotion();
    document.querySelector('[data-value="logging"]').textContent = '1 of 5';
  </script>
</body>
</html>`;

let browser;
let server;
let baseUrl;

before(async () => {
  server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://127.0.0.1').pathname;
    if (path === '/' || path === '/index.html') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(pageHtml);
      return;
    }
    const filePath = join(root, path.replace(/^\/+/, ''));
    try {
      const body = await readFile(filePath);
      response.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end('not found');
    }
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

test('logging completeness shows one count after the tick, not a ghosted overlay', async () => {
  const context = await browser.newContext({ viewport: { width: 720, height: 480 } });
  const page = await context.newPage();
  await page.goto(baseUrl);
  await page.waitForFunction(() => {
    const total = document.querySelector('[data-value="logging"]');
    if (total?.textContent !== '1 of 5') return false;
    const wrap = total.closest('.hub-count');
    return wrap && !wrap.classList.contains('is-ticking');
  });

  const overlay = await page.evaluate(() => {
    const total = document.querySelector('[data-value="logging"]');
    const wrap = total.closest('.hub-count');
    const fx = wrap.querySelector('.hub-count__fx');
    return {
      text: total.textContent,
      ticking: wrap.classList.contains('is-ticking'),
      fxDisplay: fx ? getComputedStyle(fx).display : 'none',
      fxText: fx?.textContent ?? ''
    };
  });

  assert.equal(overlay.text, '1 of 5');
  assert.equal(overlay.ticking, false);
  assert.equal(overlay.fxDisplay, 'none');

  await context.close();
});
