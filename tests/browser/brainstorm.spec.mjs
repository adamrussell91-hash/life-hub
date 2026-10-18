/** Real brainstorm block UI and production API handlers on an in-memory store (no live data, no real AI). */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { createBrainstormHandler } from '../../netlify/functions/brainstorm.mjs';
import { createPublishedBrainstormHandler } from '../../netlify/functions/published-brainstorm.mjs';
import { brainstormAction } from '../../netlify/functions/_shared/brainstorm.mjs';

const block = { id: 'bs1', block_type: 'brainstorm', visibility: 'student_teacher', content: { question: 'What does the storm in Act 3 tell us about Lear?', safety: 'instant', per_student: 3, max_length: 140, layout: 'grid' } };
const data = new Map([['lessons/lesson1', { blocks: [block] }], ['published/lessons/lesson1', { blocks: [block] }]]);
const store = {
  async get(key) { return structuredClone(data.get(key) ?? null); },
  async setJSON(key, value, options) { if (options?.onlyIfNew && data.has(key)) return { modified: false }; data.set(key, structuredClone(value)); return { modified: true }; }
};
const origin = 'http://127.0.0.1:5189';
/** Stands in for Claude: two themes split by answer order. */
const fakeClaude = async (_url, init) => {
  const { answers } = JSON.parse(JSON.parse(init.body).messages[0].content);
  const half = Math.ceil(answers.length / 2);
  const groups = [{ name: 'Inner turmoil', ids: answers.slice(0, half).map(a => a.id) }, { name: 'The world breaking', ids: answers.slice(half).map(a => a.id) }];
  return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ groups }) }] }), { status: 200 });
};
const env = { SITE_ORIGIN: origin, SESSION_SECRET: 'x'.repeat(32), LIFE_HUB_PASSPHRASE_HASH: 'y', ANTHROPIC_API_KEY: 'test-key' };
const deps = { getContentStore: async () => store, verifySessionToken: () => ({ valid: true }), env, fetchImpl: fakeClaude };
const teacherHandler = createBrainstormHandler(deps), studentHandler = createPublishedBrainstormHandler(deps);
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/design-kit/tokens.css"><link rel="stylesheet" href="/design-kit/actions.css"><style>body{font-family:var(--font-ui);color:var(--ink);background:var(--paper);margin:24px 16px}main{max-width:900px;margin:auto}</style></head><body><main></main><script type="module">import {renderBrainstorm} from '/src/blocks/brainstorm/index.ts';const block=${JSON.stringify(block)};document.querySelector('main').append(renderBrainstorm(block,location.search.includes('teacher')?'teacher':'student',{lessonId:'lesson1'}));</script></body></html>`;
const server = await createServer({
  configFile: false, root: path.resolve('apps/teaching'),
  resolve: { alias: { '@': path.resolve('apps/teaching/src') } }, optimizeDeps: { noDiscovery: true, include: [] },
  server: { port: 5189, host: '127.0.0.1', strictPort: true, fs: { allow: [process.cwd()] } },
  plugins: [{ name: 'brainstorm-fixture', configureServer(s) {
    s.middlewares.use('/brainstorm-check', (_req, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(html); });
  } }]
});
await server.listen();
console.log('Browser fixture listening');

const IDEAS = ['His mind is breaking apart', 'Nature mirrors his chaos', 'He has lost all his power', 'Guilt', 'The kingdom is falling apart too', 'Madness', 'He finally feels what the poor feel', 'Chaos', 'Guilt'];
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : { channel: 'chromium' }) });
  const contexts = await Promise.all([{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 1280, height: 900 }].map(viewport => browser.newContext({ viewport })));
  for (const context of contexts) await context.route(`${origin}/api/**`, async route => {
    const req = route.request();
    const handler = req.url().includes('/api/lessons/') ? teacherHandler : studentHandler;
    const request = new Request(req.url(), { method: req.method(), headers: { ...req.headers(), origin, cookie: 'umbrella_session=ok' }, body: req.postData() });
    const response = await handler(request);
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  const [t, a, b] = await Promise.all(contexts.map(c => c.newPage()));
  for (const page of [t, a, b]) { page.setDefaultTimeout(20000); page.on('pageerror', e => { throw e; }); }
  const shot = (page, name) => page.screenshot({ path: `/tmp/brainstorm-${name}.png`, fullPage: true });
  const noSideScroll = async page => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const waitFor = async (fn, what) => { for (let i = 0; i < 60; i++) { if (await fn()) return; await new Promise(r => setTimeout(r, 250)); } throw new Error(`timed out: ${what}`); };

  await t.goto(`${origin}/brainstorm-check?teacher`);
  await t.getByRole('button', { name: 'Start brainstorm', exact: true }).click();
  await t.locator('.pf-code__value').waitFor();
  assert.equal(await t.getByRole('button', { name: 'Start brainstorm' }).isVisible(), false, 'start panel hides once the round is live');
  const code = (await t.locator('.pf-code__value').textContent()).replace(/\D/g, '');
  assert.match(code, /^\d{6}$/);

  for (const [page, ideas] of [[a, IDEAS.slice(0, 3)], [b, ['Chaos', 'what a load of sh1t']]]) {
    await page.goto(`${origin}/brainstorm-check`);
    await page.getByLabel('Type the code on the board').fill(code);
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    for (const idea of ideas) {
      await page.getByRole('textbox', { name: 'Your answer' }).fill(idea);
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await page.locator('.bs-mine__text', { hasText: idea }).waitFor();
    }
  }
  assert.equal(await a.getByRole('textbox', { name: 'Your answer' }).count(), 0, 'three answers uses the limit');
  assert.match(await a.locator('.bs-answer').textContent(), /sent all 3/);
  assert.match(await b.locator('.bs-mine__item--pending').textContent(), /Waiting for your teacher/);
  console.log('Students joined and answered; flagged answer held');

  // Fill the room: 30 more students with two answers each, so the orbit gets dense.
  const round = await brainstormAction(store, 'lesson1', 'bs1', {}, { teacher: true });
  for (let i = 0; i < 30; i++) {
    const s = { token: (i + 100).toString(16).padStart(4, '0').repeat(12), session: round.session };
    await brainstormAction(store, 'lesson1', 'bs1', { ...s, action: 'join', code });
    for (const n of [0, 1]) await brainstormAction(store, 'lesson1', 'bs1', { ...s, action: 'submit', text: IDEAS[(i + n * 4) % IDEAS.length] });
  }
  await waitFor(async () => (await t.locator('.bs-orbit__item').count()) === 64, 'dense orbit');
  assert.equal(await t.locator('.bs-card').count(), 0, 'no text before reveal');
  const queue = t.locator('.bs-queue');
  assert.equal(await queue.evaluate(d => d.open), false, 'held text stays collapsed on the projected board');
  await t.waitForTimeout(1500);
  const before = await t.locator('.bs-orbit__item').first().boundingBox();
  await t.waitForTimeout(800);
  const after = await t.locator('.bs-orbit__item').first().boundingBox();
  assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > 0.5, 'shapes keep moving in orbit');
  await shot(t, 'teacher-orbit');
  console.log('Orbit moving with 64 shapes');
  // Students see the same orbit on their own screen, before anyone shares the board.
  await waitFor(async () => (await a.locator('.bs-board .bs-orbit__item.pf-token').count()) === 64, 'student orbit');
  assert.equal(await a.locator('.bs-board .bs-card').count(), 0, 'student orbit has no text');
  await shot(a, 'student-orbit');

  await t.getByRole('button', { name: 'Reveal answers' }).click();
  await t.locator('.bs-card').first().waitFor();
  await t.waitForTimeout(900);
  assert.equal(await t.locator('.bs-card').count(), 64);
  await shot(t, 'teacher-grid');
  await t.getByRole('button', { name: 'Word cloud' }).click();
  await t.locator('.bs-cloud__word').first().waitFor();
  await t.waitForTimeout(900);
  await shot(t, 'teacher-cloud');
  await t.getByRole('button', { name: 'Groups', exact: true }).click();
  await t.getByRole('button', { name: 'Group answers' }).click();
  await t.locator('.bs-group__name').first().waitFor();
  assert.deepEqual(await t.locator('.bs-group__name').evaluateAll(n => n.map(x => x.value)), ['Inner turmoil', 'The world breaking']);
  await t.waitForTimeout(700);
  await shot(t, 'teacher-groups');
  console.log('Revealed as grid, cloud and groups');

  await t.getByText('Students see all answers').click();
  await waitFor(async () => (await a.locator('.bs-board .bs-card').count()) === 64, 'student board');
  assert.equal(await a.locator('.bs-board .pf-token').count(), 0, 'students never see symbols on the board');
  assert.equal(await a.locator('.bs-card__remove').count(), 0);
  await a.waitForTimeout(900);
  await noSideScroll(a);
  await shot(a, 'student-390-board');

  const guiltCards = t.locator('.bs-card', { hasText: 'His mind is breaking apart' });
  const startCount = await guiltCards.count();
  await guiltCards.first().locator('.bs-card__remove').click();
  await waitFor(async () => (await t.locator('.bs-card', { hasText: 'His mind is breaking apart' }).count()) === startCount - 1, 'card removed');
  await queue.locator('summary').click();
  assert.match(await queue.textContent(), /sh1t/);
  assert.match(await queue.textContent(), /1 removed/);
  console.log('Removed a card; queue shows held and removed');

  await t.getByRole('button', { name: 'Back to shapes' }).click();
  await waitFor(async () => (await t.locator('.bs-orbit__item').count()) === 63, 'back to orbit');
  assert.equal(await t.locator('.bs-card').count(), 0);
  await t.setViewportSize({ width: 390, height: 844 });
  await t.waitForTimeout(1200);
  await noSideScroll(t);
  await shot(t, 'teacher-390-orbit');
  console.log('Back to orbit; 390px has no side scroll');
} finally {
  await browser?.close();
  await server.close();
}
