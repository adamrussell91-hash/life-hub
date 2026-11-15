/** Progress share: sign in, every section, the tour and its Help button, a locked lesson. Production handlers, invented class (no live data). */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { createPublishedProgressShareHandler } from '../../netlify/functions/published-progress-share.mjs';
import { claimInitials, loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';
import { profileAction } from '../../netlify/functions/_shared/profile.mjs';
import { teacherShareAction } from '../../netlify/functions/_shared/progress-share.mjs';
import { workOwner } from '../../netlify/functions/_shared/lesson-work.mjs';

const OUT = process.env.SHOTS_DIR || '/tmp';
// Days in Sydney time, as the page counts them.
const sydney = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' });
const day = (offset) => sydney.format(new Date(Date.now() + offset * 86_400_000));
const qset = (id, title, qs) => ({ id, type: 'block', block_type: 'question_set', visibility: 'student_teacher', content: { title, questions: qs.map((q) => ({ id: q, prompt: q })) } });
const rich = (id, html) => ({ id, type: 'block', block_type: 'rich_text', variant: 'medium', visibility: 'student_teacher', content: { html }, settings: {} });

const published = {
  l1: { lesson_id: 'l1', title: 'Ghost poem', unit_id: 'unit1', blocks: [rich('r1', '<p>Read the ghost poem twice.</p>')] },
  l2: { lesson_id: 'l2', title: 'Speaker and voice', unit_id: 'unit1', blocks: [rich('r2', '<p>Who is speaking in the poem?</p>'), qset('q2', 'Warm-up', ['Who is the speaker?'])] },
  l3: { lesson_id: 'l3', title: 'Sound and rhythm', unit_id: 'unit1', blocks: [rich('r3', '<p>Clap the rhythm.</p>')] },
  l4: { lesson_id: 'l4', title: 'Imagery', unit_id: 'unit1', blocks: [rich('r4', '<p>Find three images.</p>')] },
  l5: { lesson_id: 'l5', title: 'Poem task', unit_id: 'unit1', pedagogical_mode: 'assessment', blocks: [{ id: 'cd', type: 'block', block_type: 'countdown', visibility: 'student_teacher', content: { title: 'Poem task: your own ghost poem', due_date: day(6), due_time: '15:00', set_date: day(-14), note: '' } }] }
};
const data = new Map([
  ['classes/class1', { id: 'class1', type: 'class', status: 'active', title: '9 English', current_unit_id: 'unit1', students: [{ name: 'Ana Ames' }, { name: 'Ben Bolt' }] }],
  ['units/unit1', { id: 'unit1', title: 'Poetry', lesson_ids: ['l1', 'l2', 'l3', 'l4', 'l5'] }],
  ['markbook/class1', { columns: [], marks: {}, hidden_quizzes: [], focus: {}, took: {}, groups: [], history: [] }],
  ['scheduled_lessons/s1', { id: 's1', class_id: 'class1', lesson_id: 'l1', date: day(-10) }]
]);
for (const [id, lesson] of Object.entries(published)) {
  data.set(`lessons/${id}`, { id, title: lesson.title, ...(lesson.pedagogical_mode ? { pedagogical_mode: lesson.pedagogical_mode } : {}) });
  data.set(`published/lessons/${id}`, { id, title: lesson.title, blocks: lesson.blocks });
}
const store = {
  async get(key) { return structuredClone(data.get(key) ?? null); },
  async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: 'e' } : null; },
  async setJSON(key, value, options) { if (options?.onlyIfNew && data.has(key)) return { modified: false }; data.set(key, structuredClone(value)); return { modified: true }; },
  async delete(key) { data.delete(key); },
  async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
};

// Ana ticks three lessons within a minute (a burst), unticks and re-ticks one, and has practised on three days.
const roster = await loadRoster(store, 'class1');
const [ana] = roster.students;
const STUDENT_DEVICE = 'a'.repeat(48);
await claimInitials(store, roster, STUDENT_DEVICE, ana.initials);
for (const lessonId of ['l1', 'l3', 'l4']) await profileAction(store, 'class1', { action: 'done', lesson_id: lessonId, class_token: STUDENT_DEVICE });
await profileAction(store, 'class1', { action: 'undone', lesson_id: 'l1', class_token: STUDENT_DEVICE });
await profileAction(store, 'class1', { action: 'done', lesson_id: 'l1', class_token: STUDENT_DEVICE });
data.set(`organiser_practice/class1/${workOwner('class1', ana.id)}`, { boxes: { a: { box: 2, last: day(-1), h: [{ d: day(-1), ok: true }, { d: day(-2), ok: true }, { d: day(-4), ok: false }] } } });
const made = await teacherShareAction(store, 'class1', { action: 'add', student_id: ana.id, initials: 'PT' });
const { token, pin } = made.shares.find((s) => s.token === made.made);
const freshPin = async () => (await teacherShareAction(store, 'class1', { action: 'new_pin', token })).shares.find((s) => s.token === token).pin;

const origin = 'http://127.0.0.1:5191';
const handler = createPublishedProgressShareHandler({ getContentStore: async () => store, env: { SITE_ORIGIN: origin } });
const page = (body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/design-kit/tokens.css"><link rel="stylesheet" href="/design-kit/actions.css"><link rel="stylesheet" href="/src/styles/app.css"><style>body{font-family:var(--font-ui);color:var(--ink);background:var(--paper);margin:0}</style></head><body><main id="app"></main><script type="module">${body}</script></body></html>`;
const shareHtml = page(`const q=new URLSearchParams(location.search);const lesson=q.get('lesson');const root=document.getElementById('app');if(lesson){const {mountShareLesson}=await import('/src/student/share-lesson.ts');mountShareLesson({root,token:${JSON.stringify(token)},lessonId:lesson});}else{const {mountShareView}=await import('/src/student/share-view.ts');mountShareView({root,token:${JSON.stringify(token)}});}`);
const server = await createServer({
  configFile: false, root: path.resolve('apps/teaching'),
  resolve: { alias: { '@': path.resolve('apps/teaching/src') } },
  // The lesson renderer pulls in CommonJS packages (Uppy's mime-match), so let Vite pre-bundle them.
  optimizeDeps: { entries: ['src/student/share-view.ts', 'src/student/share-lesson.ts'] },
  server: { port: 5191, host: '127.0.0.1', strictPort: true, fs: { allow: [process.cwd()] } },
  plugins: [{ name: 'share-fixture', configureServer(s) {
    s.middlewares.use('/share-check', (_req, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(shareHtml); });
  } }]
});
await server.listen();
console.log('Browser fixture listening');

let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : { channel: 'chromium' }) });
  const noSideScroll = async (p, where) => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `no sideways scroll: ${where}`);

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const phone = viewport.width < 600;
    const label = phone ? 'phone' : 'desktop';
    const context = await browser.newContext({ viewport });
    await context.route(`${origin}/api/**`, async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const lesson = url.pathname.match(/^\/api\/published\/lessons\/([^/]+)$/)?.[1];
      if (lesson) {
        const body = published[lesson] ? { ok: true, data: published[lesson] } : { ok: false, error: { code: 'not_found', message: 'Lesson not found.' } };
        return route.fulfill({ status: published[lesson] ? 200 : 404, contentType: 'application/json', body: JSON.stringify(body) });
      }
      if (url.pathname.startsWith('/api/published/share/')) {
        const response = await handler(new Request(req.url(), { method: req.method(), headers: { ...req.headers(), origin }, body: req.postData() }));
        return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
      }
      return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'not_found', message: 'Not found.' } }) });
    });
    const p = await context.newPage();
    p.setDefaultTimeout(20000);
    const errors = [];
    p.on('pageerror', (e) => errors.push(e));

    // 1. A new browser sees the sign-in form and nothing about the student.
    await p.goto(`${origin}/share-check`);
    await p.getByRole('heading', { name: 'Progress share' }).waitFor();
    assert.equal(await p.locator('.share-page').count(), 0, 'nothing shows before sign-in');
    assert.equal((await p.content()).includes('Ana'), false, 'no name before sign-in');
    await noSideScroll(p, `${label} sign-in`);

    // 2. A wrong PIN says so without saying which part was wrong.
    const usePin = phone ? await freshPin() : pin;
    await p.getByLabel('Your initials').fill('PT');
    await p.getByLabel('PIN').fill(usePin === '000000' ? '111111' : '000000');
    await p.getByRole('button', { name: 'Open' }).click();
    await p.getByRole('alert').filter({ hasText: 'Those initials and PIN don’t match' }).waitFor();

    // 3. The right PIN opens the page, and the tour starts.
    await p.getByLabel('PIN').fill(usePin);
    await p.getByRole('button', { name: 'Open' }).click();
    const card = p.locator('.tour-card');
    await card.filter({ hasText: 'Welcome' }).waitFor();
    const total = Number((await card.locator('.tour-card__dots').textContent()).match(/of (\d+)/)[1]);
    assert.ok(total >= 8, `tour has its steps (${total})`);
    await p.screenshot({ path: `${OUT}/progress-share-${label}-tour-1.png` });

    // 4. Next walks every step; each spotlight sits on its section, and on a phone the docked card sits below it.
    for (let i = 1; i < total; i += 1) {
      await p.getByRole('button', { name: 'Next' }).click();
      await card.locator('.tour-card__dots').filter({ hasText: `${i + 1} of ${total}` }).waitFor();
      await p.waitForTimeout(350);
      const title = (await card.locator('.tour-card__title').textContent()).trim();
      const spot = await p.locator('.tour-spot').boundingBox();
      assert.ok(spot && spot.width > 20, `spotlight on ${title}`);
      if (phone) {
        const box = await card.boundingBox();
        assert.ok(box.y >= spot.y + 20, `docked card below the spotlight on ${title}`);
        assert.ok(box.y + box.height <= viewport.height, `card on screen on ${title}`);
      }
      if (i === 4) await p.screenshot({ path: `${OUT}/progress-share-${label}-tour-ticks.png` });
    }
    await p.getByRole('button', { name: 'Done' }).click();
    // Mid-flight: the card's shape is travelling toward the Help button, smaller than the card was.
    await p.waitForTimeout(220);
    const ghost = await p.locator('.tour-ghost').boundingBox();
    assert.ok(ghost, 'the card shrinks into the Help button (ghost in flight)');
    await p.screenshot({ path: `${OUT}/progress-share-${label}-shrink.png` });
    await p.waitForTimeout(600);
    assert.equal(await card.count(), 0, 'tour ends');
    const help = p.locator('.tour-help');
    assert.ok(await help.isVisible(), 'Help button shows');
    const hb = await help.boundingBox();
    assert.ok(hb.x + hb.width >= viewport.width - 24 && hb.y <= 24 && hb.width <= 40, `Help sits small at top right (${JSON.stringify(hb)})`);
    assert.equal(await p.locator('.tour-layer').count(), 0, 'no tour layer left behind');

    // 5. Every section is there, with times, planned day, the tick record and the burst.
    const text = await p.locator('.share-page').textContent();
    for (const want of ['Ana’s English', '9 English', 'Up next', 'Speaker and voice', '3 of 5 core lessons', 'Coming up', 'Poem task: your own ghost poem', 'in 6 days', 'Ticked off', 'ticked within', 'planned', 'Ticked 2 times', 'Practice', 'Today’s organiser', 'Feedback to act on']) {
      assert.ok(text.includes(want), `page shows "${want}"`);
    }
    assert.equal(await p.locator('.share-grid__day').count(), 28);
    assert.ok((await p.locator('.share-grid__day.is-on').count()) >= 3, 'practice days filled');
    await noSideScroll(p, `${label} page`);
    await p.screenshot({ path: `${OUT}/progress-share-${label}.png`, fullPage: true });

    // 6. Escape skips a replay; reload doesn't show the tour again.
    await help.click();
    await card.filter({ hasText: 'Welcome' }).waitFor();
    await p.keyboard.press('Escape');
    await p.waitForTimeout(700);
    assert.equal(await card.count(), 0, 'Escape ends the replay');
    await p.reload();
    await p.locator('.share-page').waitFor();
    await p.waitForTimeout(300);
    assert.equal(await card.count(), 0, 'the tour shows once per browser');
    assert.ok(await help.isVisible(), 'Help is still there after reload');

    // 7. A lesson link leads to the locked lesson; typing changes nothing; Back to progress is there.
    const href = await p.getByRole('link', { name: 'Speaker and voice' }).first().getAttribute('href');
    assert.ok(href.endsWith(`/s/share/${token}/lessons/l2`), `lesson link (${href})`);
    await p.goto(`${origin}/share-check?lesson=l2`);
    await p.getByText('Viewing only. Nothing here can be changed.').waitFor();
    await p.getByText('Who is speaking in the poem?').waitFor();
    // A control inside the lesson can't be pressed or focused.
    const toggle = p.locator('.lesson-blocks .word-help-bar__btn').first();
    assert.equal(await toggle.count(), 1, 'the lesson has a control to try');
    await toggle.click({ force: true, timeout: 2000 }).catch(() => undefined);
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false', 'pressing a control in a locked lesson does nothing');
    await toggle.focus().catch(() => undefined);
    assert.equal(await toggle.evaluate((e) => document.activeElement === e), false, 'nothing in a locked lesson takes focus');
    assert.equal(await p.locator('.lesson-blocks').getAttribute('inert'), '', 'the lesson content is inert');
    assert.ok(await p.getByRole('link', { name: 'Back to progress' }).isVisible());
    await noSideScroll(p, `${label} lesson`);
    await p.screenshot({ path: `${OUT}/progress-share-${label}-lesson.png`, fullPage: true });

    // 8. A lesson outside the student's list is refused.
    await p.goto(`${origin}/share-check?lesson=nope`);
    await p.getByText('That lesson isn’t on this student’s list.').waitFor();

    assert.deepEqual(errors.map(String), [], 'no page errors');
    await context.close();
    console.log(`PASS ${label}: sign-in, tour and Help, every section, locked lesson`);
  }

  // 9. The used PIN no longer works in a new browser.
  const late = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await late.route(`${origin}/api/**`, async (route) => {
    const req = route.request();
    const response = await handler(new Request(req.url(), { method: req.method(), headers: { ...req.headers(), origin }, body: req.postData() }));
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  const lp = await late.newPage();
  await lp.goto(`${origin}/share-check`);
  await lp.getByLabel('Your initials').fill('PT');
  await lp.getByLabel('PIN').fill(pin);
  await lp.getByRole('button', { name: 'Open' }).click();
  await lp.getByRole('alert').filter({ hasText: 'That PIN has been used' }).waitFor();
  await late.close();
  console.log('PASS: a used PIN is refused in a new browser');
} finally {
  await browser?.close();
  await server.close();
}
