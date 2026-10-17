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
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/design-kit/tokens.css"><link rel="stylesheet" href="/design-kit/actions.css"><style>body{font-family:var(--font-ui);color:var(--ink);background:var(--paper);margin:24px 16px}main{max-width:900px;margin:auto}</style></head><body><main></main><script type="module">import {renderPeerFeedback} from '/src/blocks/peer-feedback.ts';const block=${JSON.stringify(block)};document.querySelector('main').append(renderPeerFeedback(block,location.search.includes('teacher')?'teacher':'student',{lessonId:'lesson1'}));</script></body></html>`;
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
async function expectDisabled(locator) {
  for (let i = 0; i < 40; i++) { if (await locator.isDisabled()) return; await new Promise(r => setTimeout(r, 250)); }
  throw new Error('expected the taken symbol to be disabled');
}
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : { channel: 'chromium' }) });
  const contexts = await Promise.all([{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 1440, height: 900 }].map(viewport => browser.newContext({ viewport })));
  for (const context of contexts) await context.route(`${origin}/api/**`, async route => {
    const req = route.request();
    const handler = req.url().includes('/api/lessons/') ? teacherHandler : studentHandler;
    const request = new Request(req.url(), { method: req.method(), headers: { ...req.headers(), origin, cookie: 'umbrella_session=ok' }, body: req.postData() });
    const response = await handler(request);
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  const [t, a, b] = await Promise.all(contexts.map(c => c.newPage()));
  for (const page of [t, a, b]) { page.setDefaultTimeout(20000); page.on('pageerror', e => { throw e; }); }
  const shot = (page, name) => page.screenshot({ path: `/tmp/peer-feedback-${name}.png`, fullPage: true });
  const noSideScroll = async page => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  await t.goto(`${origin}/peer-check?teacher`);
  await t.getByRole('button', { name: 'Start activity', exact: true }).click();
  const code = (await t.locator('.pf-code__value').textContent()).replace(/\D/g, '');
  assert.match(code, /^\d{6}$/);
  console.log('Teacher started activity');

  for (const [page, identity, text] of [[a, 'Blue star', 'First argument with evidence.'], [b, 'Green star', 'Second argument with reasoning.']]) {
    await page.goto(`${origin}/peer-check`);
    const codeBox = page.getByLabel('1. Type the code on the board');
    const join = page.getByRole('button', { name: 'Join', exact: true });
    if (page === b) await expectDisabled(page.getByRole('radio', { name: 'Blue star', exact: true }));
    await page.getByRole('radio', { name: identity, exact: true }).click();
    assert.equal(await join.isDisabled(), true, 'Join waits for a full code');
    if (page === a) {
      await codeBox.fill('000000');
      await join.click();
      await page.getByRole('alert').filter({ hasText: 'didn’t match' }).waitFor();
      await shot(page, 'phone-join');
      await noSideScroll(page);
    }
    await codeBox.fill(`${code.slice(0, 3)} ${code.slice(3)}`);
    await join.click();
    await page.getByText(`You’re ${identity}`).waitFor();
    const answer = page.getByLabel('Your answer', { exact: true });
    await answer.fill(text);
    await page.reload();
    assert.equal(await answer.inputValue(), text, 'draft survives reload');
    if (page === a) {
      assert.ok(await answer.evaluate(e => parseFloat(getComputedStyle(e).fontSize) >= 16), 'no iOS zoom on focus');
      await shot(page, 'phone-write');
      await page.route(`${origin}/api/published/peer-feedback/lesson1/peer1`, route => route.abort('failed'), { times: 1 });
      await page.getByRole('button', { name: 'Hand it in', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: /Couldn’t reach the server/ }).waitFor();
      assert.equal(await answer.inputValue(), text, 'draft survives a failed send');
    }
    await page.getByRole('button', { name: 'Hand it in', exact: true }).click();
    await page.getByText('Handed in.', { exact: true }).waitFor();
    console.log(`${identity} handed in`);
  }

  await t.getByText('2 of 2 handed in.').waitFor();
  await shot(t, 'teacher-write');
  await t.getByRole('button', { name: 'Start the swap', exact: true }).click();
  for (const page of [a, b]) {
    await page.getByText('Someone’s answer', { exact: true }).waitFor();
    const theirs = await page.locator('.pf-paper__text').textContent();
    assert.equal(theirs, page === a ? 'Second argument with reasoning.' : 'First argument with evidence.', 'never your own answer');
    await page.getByLabel('One thing that works well…').fill(page === a ? 'Clear argument' : 'Strong opening');
    await page.getByLabel('One suggestion or question…').fill(page === a ? 'Explain the evidence' : 'Add an example');
    if (page === a) { await shot(page, 'phone-review'); await noSideScroll(page); }
    if (page === b) await shot(page, 'desktop-review');
    await page.getByRole('button', { name: 'Send feedback', exact: true }).click();
    await page.getByText('Feedback sent.', { exact: true }).waitFor();
  }
  console.log('Both students sent feedback');

  await t.getByText('2 of 2 have sent feedback.').waitFor();
  await t.getByRole('button', { name: 'Hand feedback back', exact: true }).click();
  await a.getByText('Add an example', { exact: true }).waitFor();
  await b.getByText('Explain the evidence', { exact: true }).waitFor();
  await noSideScroll(a);
  await shot(a, 'phone-results');
  await shot(t, 'teacher-results');
  await t.setViewportSize({ width: 390, height: 844 });
  await noSideScroll(t);
  await shot(t, 'teacher-phone-results');
  console.log('PASS: teacher + two account-free students through the production handlers; wrong code, draft reload, failed send, swap, feedback returned, 390px.');
} finally { await browser?.close(); await server.close(); }
