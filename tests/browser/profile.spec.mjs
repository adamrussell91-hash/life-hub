/** Student progress map: real page and Done block, production handlers, isolated local storage (no live data). */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { createPublishedProfileHandler } from '../../netlify/functions/published-profile.mjs';

const data = new Map([
  ['classes/class1', { id: 'class1', type: 'class', status: 'active', title: '9 English', current_unit_id: 'unit1', subject_id: 'subj1', students: [{ name: 'Bob Brown' }, { name: 'Tom Tills' }, { name: 'Cara Chen' }] }],
  ['subjects/subj1', { id: 'subj1', network_lines: [{ id: 'ln1', mode: 'train', name: 'Argument', short: 'ARG', colour: 'wave' }, { id: 'ln2', mode: 'metro', name: 'Voice', short: 'VOI', colour: 'green' }] }],
  ['units/unit1', { id: 'unit1', title: 'Poetry', lesson_ids: ['l1', 'l2', 'l3', 'l4', 'l5'] }],
  ['lessons/l1', { id: 'l1', title: 'Ghost poem', line_stops: [{ line_id: 'ln1', level: 'introduced' }, { line_id: 'ln2', level: 'introduced' }] }],
  ['lessons/l2', { id: 'l2', title: 'Tutorial', route_role: 'support', line_stops: [{ line_id: 'ln1' }] }],
  ['lessons/l3', { id: 'l3', title: 'Stretch task', route_role: 'extension', line_stops: [{ line_id: 'ln2' }] }],
  ['lessons/l4', { id: 'l4', title: 'Close reading', line_stops: [{ line_id: 'ln1', level: 'reinforced' }] }],
  ['lessons/l5', { id: 'l5', title: 'Poem task', pedagogical_mode: 'assessment' }],
  ['scheduled_lessons/s1', { id: 's1', class_id: 'class1', lesson_id: 'l1', date: '2026-10-05' }],
  ['scheduled_lessons/s4', { id: 's4', class_id: 'class1', lesson_id: 'l4', date: '2026-10-12' }]
]);
for (const id of ['l1', 'l2', 'l3', 'l4', 'l5']) data.set(`published/lessons/${id}`, { id });
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
  const doneStations = (p) => p.locator('.cm-station.cm-p-done');
  assert.equal(await doneStations(bob).count(), 0, 'everything starts grey');
  assert.ok((await bob.locator('.cm-row[data-row="l1"]').textContent()).includes('Next up'));
  assert.equal(await bob.locator('.pm-bar').count(), 4);
  const visible = await bob.locator('.pm-profile').innerText();
  assert.doesNotMatch(visible, /\d+\s*%|\d+ of \d+|\d+ lessons?|\bscore\b|\bred\b|\bamber\b/i, 'no counts, scores or percentages');
  assert.equal(await bob.locator('.cm-row[data-row="l3"]').evaluate((e) => e.classList.contains('cm-faded')), true, 'unassigned extension is faded');
  assert.equal(await bob.locator('.cm-row[data-row="l5"] rect[rx="2"]').count(), 1, 'the assessment is the square');
  // A faded lesson still opens.
  await bob.route('**/s/classes/class1/lessons/l3', (route) => route.fulfill({ contentType: 'text/html', body: '<p>opened</p>' }));
  await bob.locator('.cm-row[data-row="l3"]').click();
  await bob.waitForURL('**/s/classes/class1/lessons/l3');
  await bob.goBack();
  await bob.locator('.pm-map').waitFor();
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
  assert.equal(await bob.locator('.cm-row[data-row="l1"] .cm-station').evaluate((e) => e.classList.contains('cm-p-done')), true, 'the lesson filled');
  assert.ok((await bob.locator('.cm-row[data-row="l4"]').textContent()).includes('Next up'), 'Next up moved on');
  await shot(bob, 'phone-done');
  await noSideScroll(bob);
  console.log('Done fills the map and moves Next up');

  // 4. Another student's device never sees Bob's progress.
  await tom.goto(`${origin}/profile-check`);
  await claim(tom, 'tt');
  assert.equal(await doneStations(tom).count(), 0, 'Tom sees none of Bob’s progress');
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
  const support = cara.locator('.cm-row[data-row="l2"]');
  assert.equal(await support.evaluate((e) => e.classList.contains('cm-faded') && e.querySelector('.cm-station').classList.contains('cm-p-done')), true, 'an unassigned lesson fills when done');
  await shot(cara, 'phone-typed');
  await noSideScroll(cara);
  console.log('PASS: unclaimed step, grey map, Done on a known device, typed initials, isolation between students, faded lessons, no numbers, 390px.');
} finally { await browser?.close(); await server.close(); }
