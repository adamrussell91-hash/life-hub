/** Annotate mode: real block UI and production API handlers, isolated local storage (no live data). */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { createPeerFeedbackHandler } from '../../netlify/functions/peer-feedback.mjs';
import { createPublishedPeerFeedbackHandler } from '../../netlify/functions/published-peer-feedback.mjs';
import { createPeerFeedbackBankHandler } from '../../netlify/functions/peer-feedback-bank.mjs';
const block = { id: 'peer1', block_type: 'peer_feedback', visibility: 'student_teacher', content: { prompt: 'How does the poet present the sea?', mode: 'annotate', strength_prompt: 'One thing that works well…', suggestion_prompt: 'One suggestion or question…' } };
const data = new Map([['lessons/lesson1', { blocks: [block] }], ['published/lessons/lesson1', { blocks: [block] }]]);
const store = {
  async get(key) { return structuredClone(data.get(key) ?? null); },
  async setJSON(key, value, options) { if (options?.onlyIfNew && data.has(key)) return { modified: false }; data.set(key, structuredClone(value)); return { modified: true }; }
};
const origin = 'http://127.0.0.1:5189';
const deps = { getContentStore: async () => store, verifySessionToken: () => ({ valid: true }), env: { SITE_ORIGIN: origin, SESSION_SECRET: 'x'.repeat(32), LIFE_HUB_PASSPHRASE_HASH: 'y' } };
const teacherHandler = createPeerFeedbackHandler(deps), studentHandler = createPublishedPeerFeedbackHandler(deps), bankHandler = createPeerFeedbackBankHandler(deps);
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/design-kit/tokens.css"><link rel="stylesheet" href="/design-kit/actions.css"><link rel="stylesheet" href="/src/styles/app.css"><style>body{font-family:var(--font-ui);color:var(--ink);background:var(--paper);margin:24px 16px}main{max-width:900px;margin:auto}</style></head><body><main></main><script type="module">import {renderPeerFeedback, createPeerFeedbackEditor} from '/src/blocks/peer-feedback.ts';const block=${JSON.stringify(block)};const q=location.search;document.querySelector('main').append(q.includes('editor')?createPeerFeedbackEditor(block,()=>{}):renderPeerFeedback(block,q.includes('teacher')?'teacher':'student',{lessonId:'lesson1'}));</script></body></html>`;
const server = await createServer({
  configFile: false, root: path.resolve('apps/teaching'),
  resolve: { alias: { '@': path.resolve('apps/teaching/src') } }, optimizeDeps: { noDiscovery: true, include: [] },
  server: { port: 5189, host: '127.0.0.1', strictPort: true, fs: { allow: [process.cwd()] } },
  plugins: [{ name: 'peer-annotate-fixture', configureServer(s) {
    s.middlewares.use('/peer-check', (_req, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(html); });
  } }]
});
await server.listen();
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : { channel: 'chromium' }) });
  const viewports = [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 1440, height: 900 }, { width: 1280, height: 900 }];
  const contexts = await Promise.all(viewports.map(viewport => browser.newContext({ viewport })));
  for (const context of contexts) await context.route(`${origin}/api/**`, async route => {
    const req = route.request();
    const handler = req.url().includes('/api/peer-feedback/bank') ? bankHandler : req.url().includes('/api/lessons/') ? teacherHandler : studentHandler;
    const request = new Request(req.url(), { method: req.method(), headers: { ...req.headers(), origin, cookie: 'umbrella_session=ok' }, body: req.postData() });
    const response = await handler(request);
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  const [t, a, b, c] = await Promise.all(contexts.map(ctx => ctx.newPage()));
  for (const page of [t, a, b, c]) { page.setDefaultTimeout(20000); page.on('pageerror', e => { throw e; }); }
  const shot = (page, name) => page.screenshot({ path: `/tmp/peer-annotate-${name}.png`, fullPage: true });
  const noSideScroll = async page => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no sideways scroll');

  // The editor: the shared button bank, saved through the real handler.
  await t.goto(`${origin}/peer-check?editor`);
  await t.locator('.pa-bank__row').first().waitFor();
  await t.locator('.pa-bank__row').nth(1).getByRole('button', { name: 'Video', exact: true }).click();
  await t.locator('.pa-bank__row').nth(1).getByLabel('Web address').fill('https://www.youtube.com/watch?v=abc');
  await t.locator('.pa-bank__row').nth(1).getByLabel('Title (optional)').fill('Embedding a quote in 60 seconds');
  await t.locator('.pa-bank__row').nth(1).getByLabel('Start at (optional)').fill('1:02');
  await t.getByRole('button', { name: 'Save buttons', exact: true }).click();
  await t.getByText(/^Saved\./).waitFor();
  await shot(t, 'editor-bank');
  await t.setViewportSize({ width: 390, height: 844 });
  await noSideScroll(t);
  await shot(t, 'editor-bank-phone');
  await t.setViewportSize({ width: 1440, height: 900 });

  await t.goto(`${origin}/peer-check?teacher`);
  await t.getByRole('button', { name: 'Start activity', exact: true }).click();
  const code = (await t.locator('.pf-code__value').textContent()).replace(/\D/g, '');

  const writing = {
    a: 'The poet uses a simile when she says the sea is a hungry dog. This shows the sea is dangerous.\nAt the end the speaker feels calm.',
    b: 'The sea is described as a monster. Its waves are like teeth. This makes the reader afraid.',
    c: 'The storm is loud and angry. The poet personifies the wind. Finally the sea is still.'
  };
  for (const [page, key] of [[a, 'a'], [b, 'b'], [c, 'c']]) {
    await page.goto(`${origin}/peer-check`);
    await page.getByLabel('Type the code on the board').fill(code);
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await page.getByLabel('Your answer', { exact: true }).fill(writing[key]);
    await page.getByRole('button', { name: 'Hand it in', exact: true }).click();
    await page.getByText('Handed in.', { exact: true }).waitFor();
  }
  await t.getByText('3 of 3 handed in.').waitFor();
  await t.getByRole('button', { name: 'Start the swap', exact: true }).click();
  console.log('Three students handed in; swap started');

  async function annotatePiece(page, { sentence = 0, extend = false, button, ask, comment, phoneShot }) {
    await page.locator('.pa-sentence').nth(sentence).click();
    if (extend) await page.locator('.pa-sentence').nth(sentence + 1).click();
    if (button) await page.locator('.pa-code', { hasText: button }).click();
    if (ask) await page.locator('.pa-ask').fill(ask);
    if (comment) await page.locator('.pa-comment').fill(comment);
    if (phoneShot) { await shot(page, phoneShot); await noSideScroll(page); }
    await page.getByRole('button', { name: 'Add note', exact: true }).click();
  }

  for (const page of [a, b, c]) {
    await page.getByText('Piece 1 of 2', { exact: true }).waitFor();
    const theirs = await page.locator('.pa-paper').first().textContent();
    const own = writing[page === a ? 'a' : page === b ? 'b' : 'c'];
    assert.notEqual(theirs.replace(/\s+/g, ' ').trim(), own.replace(/\s+/g, ' ').trim(), 'never your own piece');
    if (page === a) {
      assert.ok(await page.locator('.pa-sentence').first().evaluate(e => getComputedStyle(e).cursor === 'pointer'));
    }
    await annotatePiece(page, { sentence: 0, extend: true, button: 'Wrong technique', ask: 'metaphor', comment: 'No “like”, so it’s a metaphor.', phoneShot: page === a ? 'phone-give' : null });
    await annotatePiece(page, { sentence: 1, button: page === c ? null : 'Great quote', comment: page === c ? 'you idiot' : undefined });
    if (page === a) {
      await shot(page, 'phone-give-notes');
      await noSideScroll(page);
    }
    await page.getByRole('button', { name: 'Send, then piece 2', exact: true }).click();
    await page.getByText('Piece 2 of 2', { exact: true }).waitFor();
    await annotatePiece(page, { sentence: 0, button: 'Needs evidence' });
    await page.getByRole('button', { name: 'Send feedback', exact: true }).click();
    await page.getByText('Feedback sent.', { exact: true }).waitFor();
  }
  console.log('Each student annotated two pieces');

  await t.getByText(/6 of 6 pieces annotated\. 1 held for you to check\./).waitFor();
  await shot(t, 'teacher-review');
  await noSideScroll(t);
  // The teacher removes one ordinary note by hand before handing back.
  const firstGreat = t.locator('.pa-note', { hasText: 'Great quote' }).first();
  const removedQuote = await firstGreat.locator('.pa-note__quote').textContent();
  await firstGreat.getByRole('button', { name: 'Remove', exact: true }).click();
  await t.locator('.pa-note[data-status="removed"]').first().waitFor();
  // Focus on one student.
  await t.locator('.pa-focus__chip').nth(1).click();
  assert.ok(await t.locator('.pf-row').count() <= 3);
  await shot(t, 'teacher-focus');
  await t.locator('.pa-focus__chip').first().click();
  await t.getByRole('button', { name: 'Hand feedback back', exact: true }).click();
  console.log('Teacher removed a note and handed back');

  for (const page of [a, b, c]) {
    await page.getByText('Feedback on your answer', { exact: true }).waitFor();
    const layers = await page.locator('.pa-layer').allTextContents();
    assert.deepEqual(layers, ['Reviewer 1', 'Reviewer 2']);
    assert.equal(await page.getByText(/you idiot/).count(), 0, 'held notes never reach the writer');
    assert.equal(await page.getByText(/Blue|Green|Orange|Gold|Purple|Red/).count(), 0, 'no symbols or colour names for students');
  }
  const summaryA = await a.locator('.pa-summary').textContent();
  assert.match(summaryA, /Wrong technique/);
  await a.locator('.pa-run--mark').first().click();
  await a.locator('.pa-card').first().waitFor();
  await a.locator('.pa-card__title', { hasText: 'Wrong technique: metaphor' }).first().waitFor();
  await a.locator('.pa-technique .block-annotation__element').first().waitFor();
  await shot(a, 'phone-results');
  // The first sentence also has a Needs evidence note, which carries the teacher's video at 1:02.
  const video = a.locator('.pa-res').first();
  await video.waitFor();
  assert.equal(await video.getAttribute('href'), 'https://www.youtube.com/watch?v=abc&t=62');
  await noSideScroll(a);
  await a.locator('.pa-layer').first().click();
  assert.equal(await a.locator('.pa-layer').first().getAttribute('aria-pressed'), 'false');
  await shot(b, 'desktop-results');
  await shot(t, 'teacher-results');
  await t.setViewportSize({ width: 390, height: 844 });
  await noSideScroll(t);
  await shot(t, 'teacher-phone-results');
  assert.ok(removedQuote);
  console.log('PASS: annotate mode end to end: two readers each, notes with buttons and asks, held and removed notes, two layers back, technique card, 390px.');
} finally { await browser?.close(); await server.close(); }
