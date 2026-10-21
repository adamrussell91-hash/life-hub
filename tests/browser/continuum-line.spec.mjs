/** Real continuum line block UI and production API handlers on an in-memory store (no live data, no real AI). */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { createContinuumHandler } from '../../netlify/functions/continuum-line.mjs';
import { createPublishedContinuumHandler } from '../../netlify/functions/published-continuum-line.mjs';
import { continuumAction } from '../../netlify/functions/_shared/continuum-line.mjs';

const shotDir = process.env.SHOT_DIR || '/tmp';
const block = {
  id: 'cl1', type: 'block', block_type: 'continuum_line', variant: 'medium', visibility: 'student_teacher',
  content: {
    stimulus: { kind: 'text', text: 'Ben stood at the bus stop, sweating, checking his phone every few seconds.', url: '', alt_text: '' },
    scale: { left: 'Implied', right: 'Not implied', stops: [] },
    statements: [{ id: 's1', text: 'It was a hot day.', snap: false }, { id: 's2', text: 'Ben owns a phone.', snap: true }],
    pace: 'teacher', replace: true
  }
};
const data = new Map([['lessons/lesson1', { blocks: [block] }], ['published/lessons/lesson1', { blocks: [block] }]]);
const store = {
  async get(key) { return structuredClone(data.get(key) ?? null); },
  async setJSON(key, value, options) { if (options?.onlyIfNew && data.has(key)) return { modified: false }; data.set(key, structuredClone(value)); return { modified: true }; }
};
const origin = 'http://127.0.0.1:5191';
/** Stands in for Claude: two groups split by reason order. */
const fakeClaude = async (_url, init) => {
  const { reasons } = JSON.parse(JSON.parse(init.body).messages[0].content);
  const half = Math.ceil(reasons.length / 2);
  const groups = [{ name: 'Read it from the clue', ids: reasons.slice(0, half).map(r => r.id) }, { name: 'Found another reason to sweat', ids: reasons.slice(half).map(r => r.id) }];
  return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ groups }) }] }), { status: 200 });
};
const env = { SITE_ORIGIN: origin, SESSION_SECRET: 'x'.repeat(32), LIFE_HUB_PASSPHRASE_HASH: 'y', ANTHROPIC_API_KEY: 'test-key' };
const deps = { getContentStore: async () => store, verifySessionToken: () => ({ valid: true }), env, fetchImpl: fakeClaude };
const teacherHandler = createContinuumHandler(deps), studentHandler = createPublishedContinuumHandler(deps);
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/design-kit/tokens.css"><link rel="stylesheet" href="/design-kit/actions.css"><style>body{font-family:var(--font-ui);color:var(--ink);background:var(--paper);margin:24px 16px}main{max-width:1000px;margin:auto}</style></head><body><main></main><script type="module">import {renderContinuumLine} from '/src/blocks/continuum-line/index.ts';const block=${JSON.stringify(block)};document.querySelector('main').append(renderContinuumLine(block,location.search.includes('teacher')?'teacher':'student',{lessonId:'lesson1'}));</script></body></html>`;
const server = await createServer({
  configFile: false, root: path.resolve('apps/teaching'),
  resolve: { alias: { '@': path.resolve('apps/teaching/src') } }, optimizeDeps: { noDiscovery: true, include: [] },
  server: { port: 5191, host: '127.0.0.1', strictPort: true, fs: { allow: [process.cwd()] } },
  plugins: [{ name: 'continuum-fixture', configureServer(s) {
    s.middlewares.use('/continuum-check', (_req, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(html); });
  } }]
});
await server.listen();
console.log('Browser fixture listening');

const REASONS = ['Sweating is what you do when it is hot.', 'He is outside waiting, so heat fits.', 'He could have run for the bus.', 'Nervous sweating is a thing.', 'Nothing in the text is about the weather.', 'He could be sick.', 'The phone checking points to nerves.', 'It is the first thing most readers think.'];
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : { channel: 'chromium' }) });
  const contexts = await Promise.all([{ width: 1280, height: 900 }, { width: 390, height: 844 }].map(viewport => browser.newContext({ viewport })));
  for (const context of contexts) await context.route(`${origin}/api/**`, async route => {
    const req = route.request();
    const handler = req.url().includes('/api/lessons/') ? teacherHandler : studentHandler;
    const request = new Request(req.url(), { method: req.method(), headers: { ...req.headers(), origin, cookie: 'umbrella_session=ok' }, body: req.postData() });
    const response = await handler(request);
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  const [t, a] = await Promise.all(contexts.map(c => c.newPage()));
  for (const page of [t, a]) { page.setDefaultTimeout(20000); page.on('pageerror', e => { throw e; }); }
  const shot = (page, name) => page.screenshot({ path: `${shotDir}/continuum-${name}.png`, fullPage: true });
  const noSideScroll = async page => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const waitFor = async (fn, what) => { for (let i = 0; i < 60; i++) { if (await fn()) return; await new Promise(r => setTimeout(r, 250)); } throw new Error(`timed out: ${what}`); };

  await t.goto(`${origin}/continuum-check?teacher`);
  await t.getByRole('button', { name: 'Start the line', exact: true }).click();
  await t.locator('.pf-code__value').waitFor();
  const code = (await t.locator('.pf-code__value').textContent()).replace(/\D/g, '');

  // A phone student joins and places with a reason.
  await a.goto(`${origin}/continuum-check`);
  await a.getByLabel('Type the code on the board').fill(code);
  await a.getByRole('button', { name: 'Join', exact: true }).click();
  await a.locator('.cl-line--live').waitFor();
  const place = a.getByRole('button', { name: 'Place it' });
  assert.equal(await place.isDisabled(), true, 'cannot place before choosing a spot and a reason');
  const lineBox = await a.locator('.cl-line--live').boundingBox();
  await a.mouse.click(lineBox.x + lineBox.width * 0.25, lineBox.y + 50);
  assert.equal(await place.isDisabled(), true, 'still needs a reason');
  await a.getByRole('textbox', { name: 'Why there?' }).fill('The sweat points to heat first.');
  await noSideScroll(a);
  await shot(a, 'student-placing');
  await place.click();
  await a.getByText('Only you can see where you put it.').waitFor();
  console.log('Phone student placed with a reason');

  // Fill the room.
  const round = await continuumAction(store, 'lesson1', 'cl1', {}, { teacher: true });
  const students = [];
  for (let i = 0; i < 20; i++) {
    const s = { token: (i + 100).toString(16).padStart(4, '0').repeat(12), session: round.session };
    await continuumAction(store, 'lesson1', 'cl1', { ...s, action: 'join', code });
    await continuumAction(store, 'lesson1', 'cl1', { ...s, action: 'place', statement: 's1', pos: (i * 37 % 100) / 100, reason: REASONS[i % REASONS.length] });
    students.push(s);
  }
  await waitFor(async () => (await t.locator('.cl-sym').count()) === 21, 'symbols on the stage');
  assert.match(await t.locator('.cl-counter').textContent(), /21 of 21 placed/);
  assert.equal(await t.locator('.cl-reason').count(), 0, 'no reasons before reveal');
  await t.waitForTimeout(1500);
  const before = await t.locator('.cl-sym').first().boundingBox();
  await t.waitForTimeout(700);
  const after = await t.locator('.cl-sym').first().boundingBox();
  assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > 4, 'symbols roam visibly before the reveal');
  await shot(t, 'teacher-roaming');
  console.log('Symbols roaming, counter right');

  await t.getByRole('button', { name: 'Reveal', exact: true }).click();
  await t.getByRole('button', { name: 'Show all reasons' }).waitFor();
  await t.waitForTimeout(2200);
  const stage = await t.locator('.cl-stage').boundingBox();
  const ys = await t.locator('.cl-sym').evaluateAll(n => n.map(x => x.getBoundingClientRect().bottom));
  assert.ok(ys.every(y => y < stage.y + stage.height - 40), 'every symbol sits above the line');
  await t.locator('.cl-sym').nth(3).click();
  await t.locator('.cl-card:not([hidden])').waitFor();
  await shot(t, 'teacher-revealed');
  await t.getByRole('button', { name: 'Show all reasons' }).click();
  await waitFor(async () => (await t.locator('.cl-reason').count()) === 21, 'all reasons');
  await t.getByRole('button', { name: 'Sort reasons' }).click();
  await t.locator('.cl-group__title', { hasText: 'Read it from the clue' }).waitFor();
  await shot(t, 'teacher-sorted');
  console.log('Revealed, card, all reasons, sorted');

  // Student sees the class line after the reveal.
  await waitFor(async () => (await a.locator('.cl-line__dot').count()) === 21, 'class dots on the phone');

  await t.getByRole('button', { name: 'Let them re-place' }).click();
  await a.getByRole('button', { name: 'Keep it here' }).waitFor();
  const box2 = await a.locator('.cl-line--live').boundingBox();
  await a.mouse.click(box2.x + box2.width * 0.7, box2.y + 50);
  await a.getByRole('textbox', { name: 'Why did you move?' }).fill('Someone said he might have run.');
  await shot(a, 'student-replacing');
  await a.getByRole('button', { name: 'Move it' }).click();
  await a.getByText('Your teacher will show the moves.').waitFor();
  for (const s of students.slice(0, 5)) await continuumAction(store, 'lesson1', 'cl1', { ...s, action: 'move', statement: 's1', pos: 0.9, why: 'Too many other reasons to sweat.' });
  await waitFor(async () => /6 moved/.test(await t.locator('.cl-counter').textContent()), 'moved count');
  assert.equal(await t.locator('.cl-ghost').count(), 0, 'moves hidden until shown');
  await t.getByRole('button', { name: 'Show moves' }).click();
  await waitFor(async () => (await t.locator('.cl-ghost').count()) === 6, 'ghosts');
  await t.waitForTimeout(2000);
  await t.getByRole('button', { name: 'Who moved and why' }).click();
  await t.locator('.cl-reason', { hasText: 'Someone said he might have run.' }).waitFor();
  await shot(t, 'teacher-moves');
  console.log('Re-place: hidden, then shown with ghosts and reasons');

  await t.getByRole('button', { name: 'Next statement', exact: true }).and(t.locator('.btn')).click();
  await t.locator('.cl-statement', { hasText: 'Ben owns a phone.' }).waitFor();
  await a.locator('.cl-statement', { hasText: 'Ben owns a phone.' }).waitFor();
  const box3 = await a.locator('.cl-line--live').boundingBox();
  await a.mouse.click(box3.x + box3.width * 0.4, box3.y + 50);
  const left = await a.locator('.cl-line__sym').evaluate(n => n.style.left);
  assert.equal(left, '0%', 'snapped statement lands on the nearest end');
  await a.getByRole('textbox', { name: 'Why there?' }).fill('It says his phone.');
  await a.getByRole('button', { name: 'Place it' }).click();
  await a.getByText('Only you can see where you put it.').waitFor();
  await t.setViewportSize({ width: 390, height: 844 });
  await t.waitForTimeout(1200);
  await noSideScroll(t);
  await shot(t, 'teacher-390');
  console.log('Snapped statement; 390px has no side scroll');
} finally {
  await browser?.close();
  await server.close();
}
