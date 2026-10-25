import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { appSrcAlias } from '../../scripts/lib/app-src-alias.mjs';

// Real coach component, shell and styles; synthetic turns contain no personal data.
const fixture = `<!doctype html><html data-hub="tasks"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><body><div id="app"></div><script type="module">
import '/design-kit/tokens.css';
import '/design-kit/overlays.css';
import '/design-kit/chrome.css';
import '/design-kit/hub-interactions.css';
import '/src/styles/hub.css';
import '/src/styles/views.css';
import '/src/views/problem-solver/problem-solver-view.css';
import { renderHubShell } from '/src/shell/shell.ts';
import { buildFloatingChatButton } from '/src/chat/build-chat-view.ts';
import { mountCoachPanel } from '/src/views/problem-solver/coach-panel.ts';
import { attachVisualViewportInset } from '/design-kit/js/visual-viewport.js';
const vv = Object.assign(new EventTarget(), { height: innerHeight, offsetTop: 0 });
Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
attachVisualViewportInset();
const root = document.querySelector('#app');
const shell = renderHubShell(root);
root.append(buildFloatingChatButton());
const nav = document.createElement('nav');
nav.className = 'hub-mobile-nav';
nav.innerHTML = '<a href="#/board">Dashboard</a><a href="#/clare">Chat</a><a href="#/day">Today</a><a href="#/more">More</a>';
root.append(nav);
shell.canvas.innerHTML = '<div class="ps-page ps-session ps-scope"><a class="ps-back">Decisions</a><h2 class="ps-session__title">Choose a next step</h2><div class="ps-session__board"><div class="ps-bench">Decision canvas</div><div class="ps-coach-host"></div></div></div>';
window.sent = [];
const coach = mountCoachPanel({ onSay: text => window.sent.push(text), onAction() {} });
shell.canvas.querySelector('.ps-coach-host').append(coach.el);
window.paint = count => coach.update({ kind: 'decision', status: 'active', phase: 'finished', model: null, steps: {}, frame: {}, turns: Array.from({length: count}, (_, i) => ({id: String(i), role: i % 2 ? 'user' : 'assistant', text: 'Example decision turn ' + i + '. '.repeat(20)})), runner: {status: 'idle'}, proposedTasks: [] });
window.paint(2);
window.ready = true;
</script></body></html>`;

let server, browser, baseUrl;
before(async () => {
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../../apps/tasks', import.meta.url)),
    optimizeDeps: { noDiscovery: true, entries: [] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] } },
    plugins: [appSrcAlias({ self: 'tasks', apps: {
      tasks: fileURLToPath(new URL('../../apps/tasks/src', import.meta.url)),
      teaching: fileURLToPath(new URL('../../apps/teaching/src', import.meta.url))
    } }), { name: 'coach-layout-fixture', configureServer(s) {
      s.middlewares.use('/__coach-layout', (_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end(fixture);
      });
    } }]
  });
  await server.listen();
  baseUrl = server.resolvedUrls.local[0];
  const executablePath = process.env.COACH_BROWSER_EXECUTABLE || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); await server?.close(); });

for (const count of [2, 30]) {
  test(`phone coach docks Send with ${count} turns, including a shortened keyboard viewport`, async () => {
    const context = await browser.newContext({ viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
    const page = await context.newPage();
    try {
      await page.goto(baseUrl + '__coach-layout');
      await page.waitForFunction(() => window.ready);
      await page.evaluate(n => { window.paint(n); window.scrollTo(0, document.documentElement.scrollHeight); }, count);
      assert.equal(await page.locator('.floating-chat-button').isVisible(), false);
      const resting = await page.locator('.ps-composer button').boundingBox();
      const nav = await page.locator('.hub-mobile-nav').boundingBox();
      assert.ok(resting.y + resting.height <= nav.y, 'Send clears navigation');
      assert.ok(nav.y - resting.y - resting.height < 40, 'no launcher-sized empty floor');
      if (process.env.COACH_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.COACH_SCREENSHOT_DIR}/coach-${count}-resting.png` });
      const input = page.locator('.ps-composer textarea');
      await input.fill('My next step');
      await page.evaluate(() => {
        visualViewport.height = 440;
        visualViewport.offsetTop = 24;
        visualViewport.dispatchEvent(new Event('resize'));
      });
      await page.waitForFunction(() => document.documentElement.classList.contains('vv-keyboard-open'));
      const geometry = await page.locator('.ps-composer button').evaluate(button => {
        const r = button.getBoundingClientRect();
        const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { top: r.top, bottom: r.bottom, height: r.height, tappable: at === button || button.contains(at), font: parseFloat(getComputedStyle(document.querySelector('.ps-composer textarea')).fontSize), width: document.documentElement.scrollWidth };
      });
      assert.ok(geometry.top >= 24 && geometry.bottom <= 464 - 8, JSON.stringify(geometry));
      assert.ok(geometry.height >= 44);
      assert.ok(geometry.font >= 16);
      assert.equal(geometry.width, 390);
      assert.equal(geometry.tappable, true);
      assert.equal(await page.locator('.hub-mobile-nav').isVisible(), false);
      if (process.env.COACH_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.COACH_SCREENSHOT_DIR}/coach-${count}-typing.png` });
      await page.locator('.ps-composer button').click();
      assert.deepEqual(await page.evaluate(() => window.sent), ['My next step']);
      await page.evaluate(() => {
        document.activeElement.blur();
        visualViewport.height = 844;
        visualViewport.offsetTop = 0;
        visualViewport.dispatchEvent(new Event('resize'));
      });
      await page.waitForFunction(() => !document.documentElement.classList.contains('vv-keyboard-open'));
      assert.equal(await input.inputValue(), 'My next step', 'keyboard transitions preserve unsaved text');
      assert.equal(await page.locator('.hub-mobile-nav').isVisible(), true);
      // Route removal restores the floating launcher automatically.
      await page.locator('.ps-page').evaluate(node => node.remove());
      assert.equal(await page.locator('.floating-chat-button').isVisible(), true);
    } finally { await context.close(); }
  });
}

test('desktop coach keeps its normal layout and launcher', async () => {
  const context = await browser.newContext({ viewport: {width: 1280, height: 900}, reducedMotion: 'reduce' });
  const page = await context.newPage();
  try {
    await page.goto(baseUrl + '__coach-layout');
    await page.waitForFunction(() => window.ready);
    assert.equal(await page.locator('.floating-chat-button').isVisible(), true);
    assert.equal(await page.locator('.ps-composer').evaluate(node => getComputedStyle(node).position), 'static');
    await page.locator('.ps-composer textarea').fill('Desktop answer');
    assert.equal(await page.locator('.ps-coach').evaluate(node => getComputedStyle(node).position), 'static');
    await page.locator('.ps-composer button').click();
    assert.deepEqual(await page.evaluate(() => window.sent), ['Desktop answer']);
  } finally { await context.close(); }
});
