/** Student progress map: real page and Done block, production handlers, isolated local storage (no live data). */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { createPublishedProfileHandler } from '../../netlify/functions/published-profile.mjs';

const data = new Map([
  ['classes/class1', { id: 'class1', type: 'class', status: 'active', title: '9 English', current_unit_id: 'unit1', students: [{ name: 'Bob Brown' }, { name: 'Tom Tills' }, { name: 'Cara Chen' }] }],
  ['units/unit1', { id: 'unit1', title: 'Poetry', lesson_ids: ['l1', 'l2', 'l3', 'l4'] }],
  ['lessons/l1', { id: 'l1', title: 'Ghost poem' }],
  ['lessons/l2', { id: 'l2', title: 'Tutorial', route_role: 'support' }],
  ['lessons/l3', { id: 'l3', title: 'Stretch task', route_role: 'extension' }],
  ['lessons/l4', { id: 'l4', title: 'Close reading' }]
]);
const store = {
  async get(key) { return structuredClone(data.get(key) ?? null); },
  async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: 'e' } : null; },
  async setJSON(key, value, options) { if (options?.onlyIfNew && data.has(key)) return { modified: false }; data.set(key, structuredClone(value)); return { modified: true }; },
  async delete(key) { data.delete(key); },
  async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
};
const origin = 'http://127.0.0.1:5189';
const handler = createPublishedProfileHandler({ getContentStore: async () => store, env: { SITE_ORIGIN: origin } });
const block = { id: 'done1', type: 'block', block_type: 'done', variant: 'small', visibility: 'student_teacher', content: { label: 'I’ve finished this' } };
const page = (body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/design-kit/tokens.css"><link rel="stylesheet" href="/design-kit/actions.css"><link rel="stylesheet" href="/src/styles/app.css"><style>body{font-family:var(--font-ui);color:var(--ink);background:var(--paper);margin:0}</style></head><body><main id="app" style="padding:16px"></main><script type="module">${body}</script></body></html>`;
const profileHtml = page(`import {mountStudentProfileView} from '/src/student/profile-view.ts';mountStudentProfileView({root:document.getElementById('app'),classId:'class1'});`);
const doneHtml = page(`import {renderDone} from '/src/blocks/done.ts';const lesson=new URLSearchParams(location.search).get('lesson');document.getElementById('app').append(renderDone(${JSON.stringify(block)},'student',{lessonId:lesson,classId:'class1'}));`);
const server = await createServer({
  configFile: false, root: path.resolve('apps/teaching'),
  resolve: { alias: { '@': path.resolve('apps/teaching/src') } }, optimizeDeps: { noDiscovery: true, include: [] },
  server: { port: 5189, host: '127.0.0.1', strictPort: true, fs: { allow: [process.cwd()] } },
  plugins: [{ name: 'profile-fixture', configureServer(s) {
    s.middlewares.use('/profile-check', (_req, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(profileHtml); });
    s.middlewares.use('/done-check', (_req, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(doneHtml); });
  } }]
});
await server.listen();
console.log('Browser fixture listening');

let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : { channel: 'chromium' }) });
  // Three separate devices: Bob on a phone, Tom on a laptop, Cara who types her initials in the Done block.
  const contexts = await Promise.all([{ width: 390, height: 844 }, { width: 1440, height: 900 }, { width: 390, height: 844 }].map((viewport) => browser.newContext({ viewport })));
  for (const context of contexts) await context.route(`${origin}/api/**`, async (route) => {
    const req = route.request();
    const response = await handler(new Request(req.url(), { method: req.method(), headers: { ...req.headers(), origin }, body: req.postData() }));
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  const [bob, tom, cara] = await Promise.all(contexts.map((c) => c.newPage()));
  for (const p of [bob, tom, cara]) { p.setDefaultTimeout(20000); p.on('pageerror', (e) => { throw e; }); }
  const shot = (p, name) => p.screenshot({ path: `/tmp/profile-${name}.png`, fullPage: true });
  const noSideScroll = async (p) => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no sideways scroll');
  const claim = async (p, initials) => {
    await p.getByLabel('Your initials').fill(initials);
    await p.getByRole('button', { name: 'Show my progress', exact: true }).click();
    await p.locator('.pm-map').waitFor();
  };

  // 1. Unclaimed device sees the initials step and nothing else.
  await bob.goto(`${origin}/profile-check`);
  await bob.getByText('Who are you?').waitFor();
  assert.equal(await bob.locator('.pm-map, .pm-bars').count(), 0, 'nothing loads before a claim');
  await bob.getByLabel('Your initials').fill('zz');
  await bob.getByRole('button', { name: 'Show my progress', exact: true }).click();
  await bob.getByRole('alert').filter({ hasText: 'isn’t in this class' }).waitFor();
  assert.ok(await bob.getByLabel('Your initials').evaluate((e) => parseFloat(getComputedStyle(e).fontSize) >= 16), 'no iOS zoom on focus');
  await claim(bob, 'bb');

  // 2. The map starts grey, with Next up and no numbers.
  assert.equal(await bob.locator('.pm-row.is-done').count(), 0, 'everything starts grey');
  assert.ok((await bob.locator('[data-lesson="l1"]').textContent()).includes('Next up'));
  assert.equal(await bob.locator('.pm-bar').count(), 4);
  const visible = await bob.locator('.pm-profile').innerText();
  assert.doesNotMatch(visible, /\d+\s*%|\d+ of \d+|\d+ lessons?|\bscore\b|\bred\b|\bamber\b/i, 'no counts, scores or percentages');
  assert.equal(await bob.locator('[data-lesson="l3"]').evaluate((e) => e.classList.contains('is-faded')), true, 'unassigned extension is faded');
  assert.ok((await bob.locator('[data-lesson="l3"] a').getAttribute('href')).endsWith('/s/classes/class1/lessons/l3'), 'faded lesson still opens');
  await shot(bob, 'phone-grey');
  await noSideScroll(bob);
  console.log('Claimed, map starts grey, faded lesson still a link');

  // 3. One tap in the Done block on a known device, then the map fills and Next up moves.
  await bob.goto(`${origin}/done-check?lesson=l1`);
  const done = bob.getByRole('button', { name: /Done as BB/ });
  await done.waitFor();
  assert.ok((await done.boundingBox()).height >= 44, 'tappable');
  await done.click();
  await bob.getByText('Marked done').waitFor();
  await bob.goto(`${origin}/profile-check`);
  await bob.locator('.pm-map').waitFor();
  assert.equal(await bob.locator('[data-lesson="l1"]').evaluate((e) => e.classList.contains('is-done')), true, 'the lesson filled');
  assert.equal(await bob.locator('[data-lesson="l4"]').evaluate((e) => e.classList.contains('is-next')), true, 'Next up moved on');
  await shot(bob, 'phone-done');
  await noSideScroll(bob);
  console.log('Done fills the map and moves Next up');

  // 4. Another student's device never sees Bob's progress.
  await tom.goto(`${origin}/profile-check`);
  await claim(tom, 'tt');
  assert.equal(await tom.locator('.pm-row.is-done').count(), 0, 'Tom sees none of Bob’s progress');
  await shot(tom, 'desktop-grey');

  // 5. A new device types its initials in the Done block on a lesson not assigned to her; it still fills.
  await cara.goto(`${origin}/done-check?lesson=l2`);
  await cara.getByLabel(/Type your initials/).fill('bb');
  await cara.getByRole('button', { name: 'Done', exact: true }).click();
  await cara.getByRole('alert').filter({ hasText: 'already taken' }).waitFor();
  await cara.getByLabel(/Type your initials/).fill('cc');
  await cara.getByRole('button', { name: 'Done', exact: true }).click();
  await cara.getByText('Marked done').waitFor();
  await cara.goto(`${origin}/profile-check`);
  await cara.locator('.pm-map').waitFor();
  const support = cara.locator('[data-lesson="l2"]');
  assert.equal(await support.evaluate((e) => e.classList.contains('is-done') && e.classList.contains('is-faded')), true, 'an unassigned lesson fills when done');
  await shot(cara, 'phone-typed');
  await noSideScroll(cara);
  console.log('PASS: unclaimed step, grey map, Done on a known device, typed initials, isolation between students, faded lessons, no numbers, 390px.');
} finally { await browser?.close(); await server.close(); }
