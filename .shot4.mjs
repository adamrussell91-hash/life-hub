import { chromium } from 'playwright';
const out = process.argv[2];
const students = [
  { id: 'A0-before', studentYear: 10, subjects: ['Debating', 'Legal', 'Civics', 'History', 'English', 'Creative Writing'], branches: false },
  { id: 'A-justice-expression', studentYear: 10, subjects: ['Debating', 'Legal', 'Civics', 'History', 'English', 'Creative Writing'] },
  { id: 'B-innovation-justice-reasoning', studentYear: 9, subjects: ['Mathematics', 'Science', 'Coding', 'Debating', 'Philosophy'] },
  { id: 'C-justice-expression-reasoning', studentYear: 11, subjects: ['Legal', 'Public Speaking', 'Humanities', 'Essay Writing', 'Psychology'] }
];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 2100, height: 1200 }, deviceScaleFactor: 1.25, reducedMotion: 'reduce' });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:5181/#/line');
const box = p.locator('#sign-in-passphrase');
if (await box.isVisible({ timeout: 6000 }).catch(() => false)) { await box.fill('tasks-hub-local'); await p.keyboard.press('Enter'); }
for (const s of students) {
  await p.evaluate((st) => localStorage.setItem('tasks.personal-line.form', JSON.stringify(st)), s);
  await p.goto('http://localhost:5181/#/dashboard'); await p.waitForTimeout(300);
  await p.goto('http://localhost:5181/#/line');
  await p.waitForSelector('.pl-net', { timeout: 30000 });
  await p.waitForTimeout(1500);
  const r = await p.locator('.pl').first().boundingBox();
  const sc = await p.evaluate(() => ({ w: document.querySelector('.pl-line').scrollWidth, cw: document.querySelector('.pl-scroll').clientWidth }));
  await p.screenshot({ path: `${out}/branch-${s.id}.png`, fullPage: true, clip: { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 1900) } });
  console.log(s.id, 'line width', sc.w, 'visible', sc.cw);
  const info = await p.evaluate(() => [...document.querySelectorAll('.pl-flag title')].map((t) => t.textContent));
  console.log(s.id, JSON.stringify([...new Set(info)]));
}
console.log('errors', errs.join(' | '));
await b.close();
