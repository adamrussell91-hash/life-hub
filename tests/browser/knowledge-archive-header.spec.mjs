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
<html lang="en-AU" data-hub="knowledge">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="/packages/design-kit/tokens.css">
  <link rel="stylesheet" href="/packages/design-kit/overlays.css">
  <link rel="stylesheet" href="/packages/design-kit/chrome.css">
  <link rel="stylesheet" href="/apps/knowledge/src/style.css">
</head>
<body style="margin:0">
  <div class="app-shell">
    <main class="canvas">
      <header class="topbar page-header">
        <div class="page-header__copy">
          <p class="eyebrow page-header__eyebrow">Private archive</p>
          <div class="page-header__title-row">
            <h1 class="page-header__title" id="archive-title">Archive</h1>
          </div>
        </div>
        <div class="page-header__actions">
          <div class="new-note">
            <button class="btn" type="button">New note</button>
          </div>
          <div class="viewbar">
            <button class="viewbar__btn is-active" type="button">List</button>
            <button class="viewbar__btn" type="button">Graph</button>
          </div>
          <div class="hub-utilities">
            <button class="hub-icon-btn" type="button" aria-label="Refresh"></button>
          </div>
        </div>
      </header>
    </main>
  </div>
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

test('Archive stays one line at 390 while New note / List / Graph sit under it', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await page.goto(baseUrl);
    const metrics = await page.evaluate(() => {
      const title = document.querySelector('#archive-title');
      const actions = document.querySelector('.page-header__actions');
      const titleBox = title.getBoundingClientRect();
      const actionsBox = actions.getBoundingClientRect();
      return {
        text: title.textContent,
        lines: title.getClientRects().length,
        titleRight: titleBox.right,
        titleBottom: titleBox.bottom,
        actionsTop: actionsBox.top,
        overflowWrap: getComputedStyle(title).overflowWrap,
        wordBreak: getComputedStyle(title).wordBreak
      };
    });
    assert.equal(metrics.text, 'Archive');
    assert.equal(metrics.lines, 1);
    assert.equal(metrics.overflowWrap, 'break-word');
    assert.equal(metrics.wordBreak, 'normal');
    assert.ok(
      metrics.actionsTop >= metrics.titleBottom - 1,
      `actions sat beside the title (titleBottom=${metrics.titleBottom}, actionsTop=${metrics.actionsTop})`
    );
  } finally {
    await context.close();
  }
});

test('Archive title and header actions share one row at 1280', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  try {
    await page.goto(baseUrl);
    const metrics = await page.evaluate(() => {
      const title = document.querySelector('#archive-title');
      const actions = document.querySelector('.page-header__actions');
      const titleBox = title.getBoundingClientRect();
      const actionsBox = actions.getBoundingClientRect();
      return {
        lines: title.getClientRects().length,
        titleRight: titleBox.right,
        actionsLeft: actionsBox.left
      };
    });
    assert.equal(metrics.lines, 1);
    assert.ok(
      metrics.actionsLeft >= metrics.titleRight - 1,
      `desktop actions overlapped the title (titleRight=${metrics.titleRight}, actionsLeft=${metrics.actionsLeft})`
    );
  } finally {
    await context.close();
  }
});
