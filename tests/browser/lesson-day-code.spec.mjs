/**
 * One code a day: a lesson with two continuum lines and a brainstorm. The
 * student types the code once and every other activity joins on its own. The
 * teacher's view shows the student's class initials; the Display view never
 * does. Real block UI and production handlers on an in-memory store.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { createContinuumHandler } from '../../netlify/functions/continuum-line.mjs';
import { createPublishedContinuumHandler } from '../../netlify/functions/published-continuum-line.mjs';
import { createBrainstormHandler } from '../../netlify/functions/brainstorm.mjs';
import { createPublishedBrainstormHandler } from '../../netlify/functions/published-brainstorm.mjs';
import { claimInitials, loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';

const shotDir = process.env.SHOT_DIR || '/tmp';
const line = (id, text) => ({
  id, type: 'block', block_type: 'continuum_line', variant: 'medium', visibility: 'student_teacher',
  content: { stimulus: { kind: 'text', text: 'The road ran on past the last fence.', url: '', alt_text: '' }, scale: { left: 'Agree', right: 'Disagree', stops: [] }, statements: [{ id: 's1', text, snap: false }], pace: 'teacher', replace: true }
});
const blocks = [
  line('cl1', 'The road stands for hope.'),
  line('cl2', 'The fence is a turning point.'),
  { id: 'bs1', type: 'block', block_type: 'brainstorm', variant: 'medium', visibility: 'student_teacher', content: { question: 'What could the road stand for?', safety: 'instant', per_student: 3, max_length: 120 } }
];
const data = new Map([
  ['lessons/lesson1', { blocks }],
  ['published/lessons/lesson1', { blocks }],
  ['classes/class1', { id: 'class1', type: 'class', title: 'Year 9', status: 'active', students: [{ name: 'Ava Brook' }, { name: 'Cal Dunn' }] }]
]);
const store = {
  async get(key) { return structuredClone(data.get(key) ?? null); },
  async setJSON(key, value, options) { if (options?.onlyIfNew && data.has(key)) return { modified: false }; data.set(key, structuredClone(value)); return { modified: true }; },
  async delete(key) { data.delete(key); },
  async list({ prefix }) { return { blobs: [...data.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; }
};
const origin = 'http://127.0.0.1:5193';
const env = { SITE_ORIGIN: origin, SESSION_SECRET: 'x'.repeat(32), LIFE_HUB_PASSPHRASE_HASH: 'y' };
const deps = { getContentStore: async () => store, verifySessionToken: () => ({ valid: true }), env };
const handlers = { teacherCl: createContinuumHandler(deps), studentCl: createPublishedContinuumHandler(deps), teacherBs: createBrainstormHandler(deps), studentBs: createPublishedBrainstormHandler(deps) };

// The student's device already claimed initials AB in the class (as the quiz does).
const classToken = 'ab'.repeat(24);
await claimInitials(store, await loadRoster(store, 'class1'), classToken, 'AB');

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/design-kit/tokens.css"><link rel="stylesheet" href="/design-kit/actions.css"><style>body{font-family:var(--font-ui);color:var(--ink);background:var(--paper);margin:24px 16px}main{max-width:1000px;margin:auto;display:grid;gap:32px}</style></head><body><main></main><script type="module">
import { renderContinuumLine } from '/src/blocks/continuum-line/index.ts';
import { renderBrainstorm } from '/src/blocks/brainstorm/index.ts';
import { setLessonClass } from '/src/blocks/lesson-pass.ts';
const q = new URLSearchParams(location.search);
const mode = q.has('teacher') || q.has('display') ? 'teacher' : 'student';
const ctx = { lessonId: 'lesson1', display: q.has('display') };
if (mode === 'student') setLessonClass('class1');
const blocks = ${JSON.stringify(blocks)};
for (const b of blocks) document.querySelector('main').append(b.block_type === 'brainstorm' ? renderBrainstorm(b, mode, ctx) : renderContinuumLine(b, mode, ctx));
</script></body></html>`;
const server = await createServer({
  configFile: false, root: path.resolve('apps/teaching'),
  resolve: { alias: { '@': path.resolve('apps/teaching/src') } }, optimizeDeps: { noDiscovery: true, include: [] },
  server: { port: 5193, host: '127.0.0.1', strictPort: true, fs: { allow: [process.cwd()] } },
  plugins: [{ name: 'day-code-fixture', configureServer(s) {
    s.middlewares.use('/day-code-check', (_req, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(html); });
  } }]
});
await server.listen();

let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : { channel: 'chromium' }) });
  const contexts = await Promise.all([{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 1280, height: 900 }].map(viewport => browser.newContext({ viewport })));
  for (const context of contexts) await context.route(`${origin}/api/**`, async route => {
    const req = route.request();
    const url = req.url();
    const teacher = url.includes('/api/lessons/');
    const handler = url.includes('/brainstorm/') ? (teacher ? handlers.teacherBs : handlers.studentBs) : (teacher ? handlers.teacherCl : handlers.studentCl);
    const request = new Request(url, { method: req.method(), headers: { ...req.headers(), origin, cookie: 'umbrella_session=ok' }, body: req.postData() });
    const response = await handler(request);
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  // The student's browser holds its class token, as it would after claiming initials on the class page.
  await contexts[1].addInitScript((token) => localStorage.setItem('quiz-device:class:class1', JSON.stringify(token)), classToken);
  const [t, s, d] = await Promise.all(contexts.map(c => c.newPage()));
  for (const page of [t, s, d]) { page.setDefaultTimeout(20000); page.on('pageerror', e => { throw e; }); }
  const shot = (page, name) => page.screenshot({ path: `${shotDir}/day-code-${name}.png`, fullPage: true });
  const waitFor = async (fn, what) => { for (let i = 0; i < 80; i++) { if (await fn()) return; await new Promise(r => setTimeout(r, 250)); } throw new Error(`timed out: ${what}`); };

  // Teacher starts all three. One code for the lesson.
  await t.goto(`${origin}/day-code-check?teacher`);
  for (const name of ['Start the line', 'Start the line', 'Start brainstorm']) {
    await t.getByRole('button', { name, exact: true }).first().click();
    await new Promise(r => setTimeout(r, 300));
  }
  await waitFor(async () => (await t.locator('.pf-code__value').count()) === 3, 'three codes');
  const codes = (await t.locator('.pf-code__value').allTextContents()).map(c => c.replace(/\D/g, ''));
  assert.equal(new Set(codes).size, 1, `one code for the lesson: ${codes}`);
  console.log('One code across three activities');

  // The student types it once, in the first line.
  await s.goto(`${origin}/day-code-check`);
  await waitFor(async () => (await s.getByLabel('Type the code on the board').count()) === 3, 'three join boxes');
  await s.getByLabel('Type the code on the board').first().fill(codes[0]);
  await s.getByRole('button', { name: 'Join', exact: true }).first().click();
  await waitFor(async () => (await s.locator('.cl-line--live').count()) === 2, 'second line joined on its own');
  await s.getByRole('textbox', { name: 'Your answer' }).waitFor();
  assert.equal(await s.getByLabel('Type the code on the board').count(), 0, 'no second code anywhere');
  console.log('Code typed once; the other line and the brainstorm joined on their own');

  // Place on the first line, send a brainstorm idea.
  const firstLine = s.locator('.cl-line--live').first();
  const box = await firstLine.boundingBox();
  await s.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2);
  await s.getByRole('textbox', { name: 'Why there?' }).first().fill('The road keeps going, so there is a way out.');
  await s.getByRole('button', { name: 'Place it' }).first().click();
  await s.getByRole('textbox', { name: 'Your answer' }).fill('Escape from the town');
  await s.getByRole('button', { name: 'Send', exact: true }).click();
  await s.locator('.bs-mine__text', { hasText: 'Escape' }).waitFor();
  await shot(s, 'student-390');
  assert.equal(await s.locator('.cl-who, .bs-who').count(), 0, 'students never see initials');
  assert.equal(await s.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no side scroll at 390px');

  // Teacher sees AB on the line and in the brainstorm orbit.
  await waitFor(async () => (await t.locator('.cl-sym .cl-who', { hasText: 'AB' }).count()) === 1, 'initials on the line');
  await waitFor(async () => (await t.locator('.bs-orbit__item .bs-who', { hasText: 'AB' }).count()) === 1, 'initials in the orbit');
  await t.getByRole('button', { name: 'Reveal', exact: true }).first().click();
  await t.locator('.cl-sym').first().click();
  await t.locator('.cl-card__head', { hasText: 'AB' }).waitFor();
  await t.getByRole('button', { name: 'Reveal answers' }).click();
  await t.locator('.bs-card .bs-who', { hasText: 'AB' }).waitFor();
  await shot(t, 'teacher');
  console.log('Teacher view shows AB on the line, the reason card, the orbit and the card');

  // Display view: no initials, no switch.
  await d.goto(`${origin}/day-code-check?display`);
  await d.locator('.cl-sym').first().waitFor();
  await d.locator('.bs-card').first().waitFor();
  await new Promise(r => setTimeout(r, 1500));
  assert.equal(await d.locator('.cl-who, .bs-who').count(), 0, 'Display view shows no initials');
  assert.equal(await d.getByText('Initials', { exact: true }).count(), 0, 'Display view has no Initials switch');
  await shot(d, 'display');
  console.log('Display view: symbols only');

  // The teacher can switch initials off for their own screen.
  await t.getByText('Initials', { exact: true }).first().click();
  await waitFor(async () => (await t.locator('.cl-who, .bs-who').count()) === 0, 'initials off');
  await t.getByText('Initials', { exact: true }).first().click();
  await waitFor(async () => (await t.locator('.cl-sym .cl-who').count()) === 1, 'initials back on');
  console.log('Initials switch works');
  console.log('PASS lesson day code');
} finally {
  await browser?.close();
  await server.close();
}
