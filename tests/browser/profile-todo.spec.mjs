/** Student To do panel beside the unit map: real page, production profile handler, invented class (no live data). */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { createPublishedProfileHandler } from '../../netlify/functions/published-profile.mjs';
import { workOwner } from '../../netlify/functions/_shared/lesson-work.mjs';
import { loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';

const OUT = process.env.SHOTS_DIR || '/tmp';
const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const qset = (id, title, qs) => ({ id, type: 'block', block_type: 'question_set', visibility: 'student_teacher', content: { title, questions: qs.map((q) => ({ id: q, prompt: q })) } });
const column = { id: 'column001', kind: 'assessment', title: 'Close reading paragraph', date: day(-5), weight: 0, criteria: [{ id: 'crit0001', label: 'Analysis', max: 10, outcomes: ['out_a'], concepts: [] }], piece: { lesson_id: 'l2', block_id: 'q2' } };
const data = new Map([
  ['classes/class1', { id: 'class1', type: 'class', status: 'active', title: '9 English', current_unit_id: 'unit1', subject_id: 'subj1', students: [{ name: 'Zara Kent' }, { name: 'Tom Tills' }],
    homepage: { resources: [], custom: [], announcements: [
      { id: 'an1', type: 'block', block_type: 'rich_text', visibility: 'student_teacher', content: { html: '<p>Bring a printed copy of your draft on Thursday. We’ll swap and give feedback in pairs.</p>' }, created_at: new Date().toISOString() },
      { id: 'an2', type: 'block', block_type: 'rich_text', visibility: 'teacher_only', content: { html: '<p>Private reminder</p>' }, created_at: new Date().toISOString() }
    ] } }],
  ['subjects/subj1', { id: 'subj1', network_lines: [{ id: 'ln1', mode: 'train', name: 'Argument', short: 'ARG', colour: 'wave' }] }],
  ['units/unit1', { id: 'unit1', title: 'Poetry', lesson_ids: ['l1', 'l2', 'l3', 'l4', 'l5'] }],
  ['markbook/class1', { columns: [column], marks: {}, hidden_quizzes: [], focus: {}, took: {}, groups: [], history: [] }],
  ['feedback_codes/library', { codes: [] }],
  ['lessons/l1', { id: 'l1', title: 'Ghost poem', line_stops: [{ line_id: 'ln1', level: 'introduced' }] }],
  ['lessons/l2', { id: 'l2', title: 'Close reading', line_stops: [{ line_id: 'ln1' }] }],
  ['lessons/l3', { id: 'l3', title: 'Speaker and voice', line_stops: [{ line_id: 'ln1' }] }],
  ['lessons/l4', { id: 'l4', title: 'Sound and rhythm' }],
  ['lessons/l5', { id: 'l5', title: 'Poem task', pedagogical_mode: 'assessment' }],
  ['published/lessons/l1', { id: 'l1', blocks: [] }],
  ['published/lessons/l2', { id: 'l2', blocks: [qset('q2', 'Paragraph', ['a'])] }],
  ['published/lessons/l3', { id: 'l3', blocks: [qset('w1', 'Warm-up questions', ['a', 'b']), qset('w2', 'Who is speaking?', ['a', 'b', 'c']), qset('w3', 'Exit ticket', ['a'])] }],
  ['published/lessons/l4', { id: 'l4', blocks: [{ id: 'cd2', type: 'block', block_type: 'countdown', visibility: 'student_teacher', content: { title: 'Sprint step 2: first draft', due_date: day(3), due_time: '09:00', set_date: day(-2), note: '' } }] }],
  ['published/lessons/l5', { id: 'l5', blocks: [{ id: 'cd', type: 'block', block_type: 'countdown', visibility: 'student_teacher', content: { title: 'Poem task: your own ghost poem', due_date: day(12), due_time: '15:00', set_date: day(-14), note: '' } }] }]
]);
const store = {
  async get(key) { return structuredClone(data.get(key) ?? null); },
  async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: 'e' } : null; },
  async setJSON(key, value, options) { if (options?.onlyIfNew && data.has(key)) return { modified: false }; data.set(key, structuredClone(value)); return { modified: true }; },
  async delete(key) { data.delete(key); },
  async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
};
const roster = await loadRoster(store, 'class1');
const zara = roster.students[0];
data.set(`profile/class1/${zara.id}/done/l1`, { at: new Date().toISOString(), via: 'tick' });
data.set(`work/l3/${workOwner('class1', zara.id)}`, { blocks: { w1: { answers: { a: 'x', b: 'y' } } }, at: new Date().toISOString(), class_id: 'class1', student_id: zara.id });
data.set(`work_handins/l2/q2/${zara.id}`, { class_id: 'class1', student_id: zara.id, text: { answers: { a: 'My paragraph' } }, handed_in_at: new Date(Date.now() - 86_400_000).toISOString() });

const origin = 'http://127.0.0.1:5191';
const handler = createPublishedProfileHandler({ getContentStore: async () => store, env: { SITE_ORIGIN: origin } });
const page = (body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/design-kit/tokens.css"><link rel="stylesheet" href="/design-kit/actions.css"><link rel="stylesheet" href="/src/styles/app.css"><style>body{font-family:var(--font-ui);color:var(--ink);background:var(--paper);margin:0}</style></head><body><main id="app"></main><script type="module">${body}</script></body></html>`;
const html = page(`import {mountStudentProfileView} from '/src/student/profile-view.ts';mountStudentProfileView({root:document.getElementById('app'),classId:'class1'});`);
const server = await createServer({
  configFile: false, root: path.resolve('apps/teaching'),
  resolve: { alias: { '@': path.resolve('apps/teaching/src') } }, optimizeDeps: { noDiscovery: true, include: [] },
  server: { port: 5191, host: '127.0.0.1', strictPort: true, fs: { allow: [process.cwd()] } },
  plugins: [{ name: 'todo-fixture', configureServer(s) { s.middlewares.use('/todo-check', (_req, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(html); }); } }]
});
await server.listen();

let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  // One device: a claim belongs to one device, so the phone check resizes the same page.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route(`${origin}/api/**`, async (route) => {
      const req = route.request();
      // The organiser is its own endpoint; this class has no organiser.
      if (req.url().includes('/published/organiser/')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { need: null, sheets: [], practice: null } }) });
      const response = await handler(new Request(req.url(), { method: req.method(), headers: { ...req.headers(), origin }, body: req.postData() }));
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  const p = await context.newPage();
  p.setDefaultTimeout(20000);
  p.on('pageerror', (e) => { throw e; });
  await p.goto(`${origin}/todo-check`);
  await p.getByLabel('Your initials').fill('zk');
  await p.getByRole('button', { name: 'Show my progress', exact: true }).click();
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await p.setViewportSize(viewport);
    const panel = p.getByRole('complementary', { name: 'Your to do list' });
    await panel.waitFor();
    const text = await panel.textContent();
    for (const want of ['Assessment task', 'Poem task: your own ghost poem', 'From your teacher', 'Bring a printed copy', 'Sprint step 2: first draft', 'Due soon', 'Ghost poem', 'Done today', 'Close reading', 'With your teacher', 'Speaker and voice', '1 of 3 activities done', 'Who is speaking?', 'Sound and rhythm']) {
      assert.ok(text.includes(want), `panel shows "${want}"`);
    }
    assert.ok(!text.includes('Private reminder'), 'teacher-only announcements stay out');
    assert.ok(!text.includes('Practise your organiser'), 'no organiser, no Today row');
    // Two countdowns stack, soonest first: the sprint step, then the assessment.
    const timers = await panel.getByRole('timer').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    assert.equal(timers.length, 2);
    assert.match(timers[0], /^[23] days, /);
    assert.match(timers[1], /^1[12] days, /);
    assert.match(await panel.getByRole('link', { name: 'Carry on: Speaker and voice' }).getAttribute('href'), /\/s\/classes\/class1\/lessons\/l3$/);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no sideways scroll');

    const box = await panel.boundingBox();
    const map = await p.locator('.pm-unit .pm-map').boundingBox();
    if (viewport.width >= 960) assert.ok(box.x > map.x + map.width - 1 && Math.abs(box.y - map.y) < 4, 'beside the map on a wide screen');
    else assert.ok(box.y + box.height <= map.y + 1, 'above the map on a phone');
    await p.screenshot({ path: `${OUT}/todo-${viewport.width}.png`, fullPage: true });
  }
  await context.close();
  console.log('PASS: To do panel beside the map (desktop) and above it (390px), own records only, live countdown, links.');
} finally { await browser?.close(); await server.close(); }
