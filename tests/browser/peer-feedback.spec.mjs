/** Real block UI and production API handlers, isolated local storage (no live data). */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { createPeerFeedbackHandler } from '../../netlify/functions/peer-feedback.mjs';
import { createPublishedPeerFeedbackHandler } from '../../netlify/functions/published-peer-feedback.mjs';
const block = { id: 'peer1', block_type: 'peer_feedback', visibility: 'student_teacher', content: { prompt: 'Explain your reasoning.', strength_prompt: 'One thing that works well…', suggestion_prompt: 'One suggestion or question…' } };
const data = new Map([['lessons/lesson1', { blocks: [block] }], ['published/lessons/lesson1', { blocks: [block] }]]);
const store = {
  async get(key) { return structuredClone(data.get(key) ?? null); },
  async setJSON(key, value, options) { if (options?.onlyIfNew && data.has(key)) return { modified: false }; data.set(key, structuredClone(value)); return { modified: true }; }
};
const origin = 'http://127.0.0.1:5188';
const deps = { getContentStore: async () => store, verifySessionToken: () => ({ valid: true }), env: { SITE_ORIGIN: origin, SESSION_SECRET: 'x'.repeat(32), LIFE_HUB_PASSPHRASE_HASH: 'y' } };
const teacherHandler = createPeerFeedbackHandler(deps), studentHandler = createPublishedPeerFeedbackHandler(deps);
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/design-kit/tokens.css"><link rel="stylesheet" href="/design-kit/actions.css"><style>body{font-family:var(--font-ui);color:var(--ink);background:var(--paper);margin:24px}main{max-width:760px;margin:auto}</style></head><body><main></main><script type="module">import {renderPeerFeedback,createPeerFeedbackEditor} from '/src/blocks/peer-feedback.ts';const block=${JSON.stringify(block)};document.querySelector('main').append(location.search.includes('teacher')?createPeerFeedbackEditor(block,()=>{},'lesson1'):renderPeerFeedback(block,'student',{lessonId:'lesson1'}));</script></body></html>`;
const server = await createServer({
  configFile: false, root: path.resolve('apps/teaching'),
  resolve: { alias: { '@': path.resolve('apps/teaching/src') } }, optimizeDeps: { noDiscovery: true, include: [] },
  server: { port: 5188, host: '127.0.0.1', strictPort: true, fs: { allow: [process.cwd()] } },
  plugins: [{ name: 'peer-feedback-fixture', configureServer(s) {
    s.middlewares.use('/peer-check', (_req, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(html); });
  } }]
});
await server.listen();
console.log('Browser fixture listening');
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--no-sandbox'] });
  const contexts = await Promise.all([{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 1440, height: 900 }].map(viewport => browser.newContext({ viewport })));
  for (const context of contexts) await context.route(`${origin}/api/**`, async route => {
    const req = route.request();
    const handler = req.url().includes('/api/lessons/') ? teacherHandler : studentHandler;
    const request = new Request(req.url(), { method: req.method(), headers: { ...req.headers(), origin, cookie: 'umbrella_session=ok' }, body: req.postData() });
    const response = await handler(request);
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  const [t, a, b] = await Promise.all(contexts.map(c => c.newPage()));
  for (const page of [t, a, b]) { page.setDefaultTimeout(15000); page.on('pageerror', e => console.error('pageerror', e.message)); }
  await t.goto(`${origin}/peer-check?teacher`);
  await t.locator('.peer-feedback').waitFor();
  await t.getByRole('button', { name: 'Start new activity', exact: true }).click();
  await t.getByText(/Activity code:/).waitFor();
  const code = (await t.getByText(/Activity code:/).textContent()).match(/\d{6}/)[0];
  console.log('Teacher started activity');
  for (const [page, identity, text] of [[a, 'Blue Star', 'First argument with evidence.'], [b, 'Green Star', 'Second argument with reasoning.']]) {
    await page.goto(`${origin}/peer-check`);
    await page.getByLabel('Activity code').fill(code);
    await page.getByRole('button', { name: `★ ${identity}`, exact: true }).click();
    await page.getByLabel('Your writing', { exact: true }).fill(text);
    await page.reload();
    assert.equal(await page.getByLabel('Your writing', { exact: true }).inputValue(), text);
    await page.getByRole('button', { name: 'Submit writing', exact: true }).click();
    await page.getByText('Writing submitted.', { exact: false }).waitFor();
    console.log(`${identity} submitted`);
  }
  await t.getByRole('button', { name: 'Refresh activity', exact: true }).click();
  await t.getByText(/2 joined · 2 submitted/).waitFor();
  await t.getByRole('button', { name: 'Start feedback round', exact: true }).click();
  for (const page of [a, b]) {
    await page.getByRole('button', { name: 'Refresh activity', exact: true }).click();
    await page.getByRole('heading', { name: 'Writing to review', exact: true }).waitFor();
    await page.getByLabel('One thing that works well…').fill('Clear argument');
    await page.getByLabel('One suggestion or question…').fill('Explain the evidence');
    const send = page.getByRole('button', { name: 'Send feedback', exact: true });
    await send.scrollIntoViewIfNeeded();
    const rect = await send.boundingBox(); assert.ok(rect.height >= 44); assert.ok(rect.y + rect.height <= page.viewportSize().height);
    if (page === a) {
      assert.ok(await page.getByLabel('One suggestion or question…').evaluate(e => parseFloat(getComputedStyle(e).fontSize) >= 16));
      await page.screenshot({ path: '/tmp/peer-feedback-phone-review.png', fullPage: true });
    }
    await send.click(); await page.getByText('Feedback sent.', { exact: false }).waitFor();
  }
  console.log('Both students sent feedback');
  await t.getByRole('button', { name: 'Return feedback to writers', exact: true }).click();
  for (const page of [a, b]) {
    await page.getByRole('button', { name: 'Refresh activity', exact: true }).click();
    await page.getByText('Explain the evidence', { exact: true }).waitFor();
  }
  assert.equal(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await a.screenshot({ path: '/tmp/peer-feedback-phone-results.png', fullPage: true });
  await t.screenshot({ path: '/tmp/peer-feedback-teacher.png', fullPage: true });
  console.log('PASS: real production entry points + teacher + two account-free students; draft recovery, exchanged writing, returned feedback, 390px controls/overflow.');
} finally { await browser?.close(); await server.close(); }
