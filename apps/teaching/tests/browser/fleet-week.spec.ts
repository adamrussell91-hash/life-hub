import { existsSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
// @ts-expect-error: a plain .mjs helper (the real server modules), no types.
import { fleetServer, LESSON_ID, CLASS_ID, NAMES, ROSTER, KEY_PATTERN } from './helpers/fleet-server.mjs';

/**
 * Fleet week, spec §8 (docs/superpowers/specs/2026-11-19-fleet-week-design.md): one teacher
 * and four students play a whole lesson-mode game through the REAL server actions
 * (gameStudentAction, fleetTeacherAction) over one in-memory store in this process, on a
 * clock the test holds. Phones at 390 and 320, one with reduced motion. Paste is blocked in
 * the answer, damage-report and recall boxes. Everyone and everything here is invented.
 */

// Sandboxes without Playwright's own download carry a preinstalled Chromium here.
const LOCAL_CHROMIUM = '/opt/pw-browsers/chromium';
if (!process.env.CI && existsSync(LOCAL_CHROMIUM)) test.use({ launchOptions: { executablePath: LOCAL_CHROMIUM } });

type Server = Awaited<ReturnType<typeof fleetServer>>;
type Phone = { page: Page; ctx: BrowserContext; name: string; initials: string; width: number; calm: boolean };

const page$ = (view: 'control' | 'phone') => `/fleet-week.html?view=${view}&lesson=${LESSON_ID}&class=${CLASS_ID}&class_name=Year%208%20English`;
/** Where each ship goes, by size: both teams use the same layout, so we know where to fire. */
const SPOTS: Record<number, number[]> = { 3: [0], 1: [10], 2: [20, 23] };
const ONE_SHIP = 10;
/** Any form of a real name: first names catch the full name and the class list's "Pim A." alike. */
const FIRST = NAMES.map((n: string) => n.split(' ')[0]);
const nameIn = (text: string) => FIRST.find((f: string) => new RegExp(`\\b${f}\\b`).test(text));
/** The class list display form phones show at the reveal ("Pim A."). */
const shown = (n: string) => `${n.split(' ')[0]} ${n.split(' ')[1][0]}.`;

async function wire(ctx: BrowserContext, server: Server, leaks: string[], who: string, secret: () => string | null, revealed: () => boolean): Promise<void> {
  await ctx.route(`**/api/published/lessons/${LESSON_ID}`, (route) => route.fulfill({ json: { ok: true, data: server.published } }));
  await ctx.route(`**/api/published/game/${LESSON_ID}`, async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}');
    const res = await server.student(body);
    // Nothing a student is sent may hold a real name, a key, the match secret or the rival fleet before the reveal.
    if (!revealed()) {
      const text = JSON.stringify(res.body);
      const n = nameIn(text);
      if (n) leaks.push(`${who} ${body.action}: name ${n}`);
      if (KEY_PATTERN.test(text)) leaks.push(`${who} ${body.action}: key ${KEY_PATTERN.exec(text)?.[0]}`);
      const s = secret();
      if (s && text.includes(s)) leaks.push(`${who} ${body.action}: match secret`);
      const rival = res.body?.data?.rival;
      if (rival && ('fleet' in rival || 'ships' in rival)) leaks.push(`${who} ${body.action}: rival fleet`);
      if (res.body?.data?.reveal) leaks.push(`${who} ${body.action}: reveal before the reveal`);
    }
    await route.fulfill({ status: res.status, json: res.body });
  });
  await ctx.route(`**/api/lessons/${LESSON_ID}/game`, async (route) => {
    const res = await server.teacher(JSON.parse(route.request().postData() ?? '{}'));
    await route.fulfill({ status: res.status, json: res.body });
  });
}

/** Counts animation frames and remembers any steaming ship or smoke, from the first script on. */
const MOTION_PROBE = () => {
  const w = window as unknown as { __raf: number; __motion: string[] };
  w.__raf = 0;
  w.__motion = [];
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => {
    w.__raf += 1;
    return raf(cb);
  };
  new MutationObserver((list) => {
    for (const m of list) for (const n of m.addedNodes) {
      if (n instanceof HTMLElement && (n.matches('.fws-ship, .fws-smoke') || n.querySelector('.fws-ship, .fws-smoke'))) w.__motion.push(n.className);
    }
  }).observe(document, { childList: true, subtree: true });
};

async function closeToasts(page: Page): Promise<void> {
  for (const b of await page.locator('.fws-toast__close').all()) await b.click({ timeout: 2000 }).catch(() => undefined);
}

/** No real name, no key and no rival ship on a phone before the reveal. */
async function scan(p: Phone): Promise<void> {
  const text = await p.page.evaluate(() => document.body.innerText);
  expect(nameIn(text), `${p.initials} shows a real name`).toBeUndefined();
  expect(text, `${p.initials} shows an answer key`).not.toMatch(KEY_PATTERN);
  expect(await p.page.locator('.fw-chart[aria-label^="Their"] .fw-ship').count(), `${p.initials} shows a rival ship`).toBe(0);
}

/** R4 at phone widths: no sideways scroll, every visible button at least 44 px tall. */
async function fits(p: Phone, where: string): Promise<void> {
  const { scroll, inner, small } = await p.page.evaluate(() => {
    const scope = document.querySelector('.fw') ?? document.body;
    const buttons = [...scope.querySelectorAll('button'), ...document.querySelectorAll('.fws-toast button')] as HTMLElement[];
    const small = buttons
      .filter((b) => {
        const r = b.getBoundingClientRect();
        const cs = getComputedStyle(b);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !b.closest('[hidden], details:not([open]) > :not(summary)');
      })
      .filter((b) => b.getBoundingClientRect().height < 44 - 0.5)
      .map((b) => `${b.className || b.tagName} "${(b.textContent ?? '').trim().slice(0, 24)}" ${b.getBoundingClientRect().height.toFixed(1)}px`);
    return { scroll: document.documentElement.scrollWidth, inner: window.innerWidth, small };
  });
  expect(scroll, `${p.initials} at ${p.width} (${where}) scrolls sideways`).toBeLessThanOrEqual(inner);
  expect(small, `${p.initials} at ${p.width} (${where}) has small buttons`).toEqual([]);
}

/** Paste into a typed box: blocked, the value unchanged, the note shown. */
async function pasteBlocked(page: Page, box: string): Promise<void> {
  const area = page.locator(box);
  await area.click();
  await area.pressSequentially('ab');
  const result = await area.evaluate((node: HTMLTextAreaElement) => {
    const data = new DataTransfer();
    data.setData('text/plain', 'Mast A0 pasted from somewhere');
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
    const before = node.value;
    node.dispatchEvent(event);
    return { prevented: event.defaultPrevented, same: node.value === before };
  });
  expect(result).toEqual({ prevented: true, same: true });
  // A real paste from the clipboard does nothing either.
  await page.evaluate(() => navigator.clipboard.writeText('Mast B0 from the clipboard')).catch(() => undefined);
  await area.press('ControlOrMeta+V');
  await expect(area).toHaveValue('ab');
  const note = area.locator('xpath=following-sibling::p[contains(@class,"qz-writing-note")][1]');
  await expect(note).toHaveAttribute('data-state', 'blocked');
  await expect(note).toContainText('Pasting is off');
  await area.fill('');
}

/** Fire one shell: square, then Sure or Unsure, and only then the question. Returns the prompt and what was typed. */
async function fire(p: Phone, square: number, sure: boolean, right: boolean, opts: { paste?: boolean } = {}): Promise<{ prompt: string; typed: string }> {
  const page = p.page;
  await closeToasts(page);
  const theirs = page.locator('.fw-chart[aria-label^="Their chart"]');
  await expect(theirs).toBeVisible({ timeout: 20_000 });
  await theirs.locator(`[data-square="${square}"]`).click();
  await expect(page.locator('.fw-fire')).toBeVisible();
  // Committed? Not yet: no question on screen.
  await expect(page.locator('.fw-question')).toHaveCount(0);
  await scan(p);
  if (p.width <= 390) await fits(p, 'fire');
  await page.locator(sure ? '.fw-fire .fw-sure' : '.fw-fire .fw-unsure').click();
  const prompt = (await page.locator('.fw-question__prompt').textContent({ timeout: 10_000 }))?.trim() ?? '';
  const m = /^Question (\d+) ([AB])\?$/.exec(prompt);
  expect(m, `prompt "${prompt}"`).not.toBeNull();
  expect(Number(m![1])).toBe(square);
  await scan(p);
  await fits(p, 'question');
  if (opts.paste) await pasteBlocked(page, '.fw-question ~ form .fw-textarea, .fw-answer .fw-textarea');
  const typed = right ? `mast ${m![2].toLowerCase()}${m![1]}` : 'no idea';
  await page.locator('.fw-answer .fw-textarea').pressSequentially(typed);
  await closeToasts(page);
  await page.locator('.fw-answer button[type="submit"]').click();
  await expect(page.locator('.fw-sent')).toContainText('Answer sent');
  await page.locator('.fw-stage button', { hasText: /Back to the chart|See the chart/ }).click();
  return { prompt, typed };
}

async function nextRound(control: Page, round: number): Promise<void> {
  const next = control.locator('.fc-actions button', { hasText: 'Next round' });
  await expect(next).toBeEnabled({ timeout: 20_000 });
  await next.click();
  await expect(control.locator('.fc-status')).toContainText('Round closed', { timeout: 20_000 });
  await expect(control.locator('.fc-card h3', { hasText: `Round ${round} results` })).toBeVisible({ timeout: 20_000 });
}

test('Fleet week: one teacher and four students play a lesson-mode game', async ({ browser }) => {
  test.setTimeout(240_000);
  const server: Server = await fleetServer();
  // The clock the server reads: held still, one millisecond on per request.
  let t = Date.parse('2026-11-19T10:00:00.000Z');
  server.clock.frozen = t;
  const tickOn = () => (server.clock.frozen = ++t);
  const leaks: string[] = [];
  let revealed = false;
  const secret = (): string | null => {
    for (const [k, v] of server.store.data) if (k.includes('/campaigns/') && v && typeof (v as { secret?: unknown }).secret === 'string') return (v as { secret: string }).secret;
    return null;
  };
  const studentTick = server.student;
  server.student = (body: unknown) => (tickOn(), studentTick(body));
  const teacherTick = server.teacher;
  server.teacher = (body: unknown) => (tickOn(), teacherTick(body));

  // ── Teacher: the control room at desktop.
  const tctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await wire(tctx, server, leaks, 'teacher', secret, () => revealed);
  const control = await tctx.newPage();
  await control.goto(page$('control'));
  await expect(control.locator('.fc-open')).toBeEnabled({ timeout: 30_000 });
  await expect(control.locator('select[name="rounds"]')).toHaveValue('2');
  await control.locator('.fc-open').click();
  await expect(control.locator('.fc-match')).toHaveCount(1, { timeout: 20_000 });
  await expect(control.locator('.fc-board')).toHaveCount(0);

  const state = await server.teacher({ action: 'campaign_state', game_id: 'fw', class_id: CLASS_ID });
  const teams = (state.body.data.teams as Array<{ members: Array<{ name: string }> }>).filter((tm) => tm.members.length);
  expect(teams.map((tm) => tm.members.length)).toEqual([2, 2]);
  const [[a1, a2], [b1, b2]] = teams.map((tm) => tm.members.map((m) => m.name));

  // ── Four phones: 390, 320, 320, and 390 with reduced motion.
  const sizes: Record<string, { width: number; calm: boolean }> = {
    [a1]: { width: 390, calm: false },
    [a2]: { width: 320, calm: false },
    [b1]: { width: 320, calm: false },
    [b2]: { width: 390, calm: true }
  };
  const phones: Phone[] = [];
  for (const name of [a1, a2, b1, b2]) {
    const { width, calm } = sizes[name];
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: calm ? 'reduce' : 'no-preference', hasTouch: true });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
    await ctx.addInitScript(MOTION_PROBE);
    await wire(ctx, server, leaks, name, secret, () => revealed);
    const page = await ctx.newPage();
    const initials = ROSTER.find((r: { name: string }) => r.name === name)!.initials as string;
    phones.push({ page, ctx, name, initials, width, calm });
  }
  const phone = (name: string) => phones.find((p) => p.name === name)!;

  for (const p of phones) {
    await p.page.goto(page$('phone'));
    await p.page.locator('.gm-gate input').fill(p.initials, { timeout: 30_000 });
    await p.page.locator('.gm-gate button').click();
    await expect(p.page.locator('.gm-gate')).toHaveCount(0);
    await p.page.locator('.gm-card__play', { hasText: 'Open Fleet week' }).click();
    await expect(p.page.locator('.fw')).toBeVisible();
    await expect(p.page.locator('.gm-solo__status')).toContainText('Placement', { timeout: 20_000 });
    await scan(p);
  }

  // ── Placement: each player hides their own two ships.
  for (const p of phones) {
    const page = p.page;
    await expect(page.locator('.fw-ship-pick')).toHaveCount(2, { timeout: 20_000 });
    await fits(p, 'placement');
    const sizesMine = (await page.locator('.fw-ship-pick').allTextContents()).map((s) => Number(/(\d) square/.exec(s)![1]));
    const used: Record<number, number> = {};
    for (let i = 0; i < sizesMine.length; i++) {
      const size = sizesMine[i];
      const at = SPOTS[size][(used[size] = (used[size] ?? -1) + 1)];
      await page.locator('.fw-ship-pick').nth(i).click();
      await page.locator(`.fw-chart [data-square="${at}"]`).click();
      await expect(page.locator('.fw-ship-pick').nth(i)).toContainText('placed');
    }
    await closeToasts(page);
    await page.locator('button', { hasText: 'Confirm placement' }).click();
    await expect(page.locator('.fw-h', { hasText: 'Your ships are at sea' })).toBeVisible({ timeout: 20_000 });
    await scan(p);
  }

  // Everyone placed: lesson mode opens round 1 on its own.
  for (const p of phones) await expect(p.page.locator('.gm-solo__status')).toContainText('Round 1 of 2', { timeout: 20_000 });
  for (const p of phones) await fits(p, 'round 1');

  // ── Round 1. A1 sinks the one-square ship (sure); A2 hits the three; B1 hits our three; B2 is sure and wrong.
  const r1a1 = await fire(phone(a1), ONE_SHIP, true, true, { paste: true });
  const r1a2 = await fire(phone(a2), 0, false, true);
  const r1b1 = await fire(phone(b1), 0, false, true);
  await fire(phone(b2), 3, true, false);
  await fire(phone(b2), 12, false, true);
  for (const p of phones) await scan(p);
  await nextRound(control, 1);

  // A1 landed the last hit on a ship: the recall line first, then the damage report for A2's hit.
  const pa1 = phone(a1);
  await expect(pa1.page.locator('.fw-h', { hasText: 'Sink it' })).toBeVisible({ timeout: 20_000 });
  await scan(pa1);
  await fits(pa1, 'recall');
  await pasteBlocked(pa1.page, '.fw-answer .fw-textarea');
  const recallPrompt = (await pa1.page.locator('.fw-question__prompt').textContent())?.trim() ?? '';
  const rm = /^Recall line (\d)\?$/.exec(recallPrompt);
  expect(rm, `recall prompt "${recallPrompt}"`).not.toBeNull();
  await pa1.page.locator('.fw-answer .fw-textarea').pressSequentially(`line ${rm![1]}`);
  await closeToasts(pa1.page);
  await pa1.page.locator('.fw-answer button[type="submit"]').click();

  // Damage reports: the partner sees the exact question and what their partner typed.
  const file = async (p: Phone, shot: { prompt: string; typed: string }, paste = false) => {
    const page = p.page;
    await expect(page.locator('.fw-h', { hasText: 'Damage report' })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.fw-question__prompt')).toHaveText(shot.prompt);
    await expect(page.locator('.fw-partner-answer')).toHaveText(shot.typed);
    await scan(p);
    await fits(p, 'damage report');
    if (paste) await pasteBlocked(page, '.fw-answer .fw-textarea');
    await page.locator('.fw-answer .fw-textarea').pressSequentially('it names the right part of the text');
    await closeToasts(page);
    await page.locator('.fw-answer button[type="submit"]').click();
  };
  await file(phone(a2), r1a1, true);
  await file(pa1, r1a2);
  await file(phone(b2), r1b1);

  for (const p of phones) await expect(p.page.locator('.gm-solo__status')).toContainText('Round 2 of 2', { timeout: 20_000 });
  // The dawn report shows what landed, in call signs.
  const report = phone(a2).page.locator('.fw-report');
  await expect(report).toBeVisible({ timeout: 20_000 });
  await expect(report).toContainText('hit');
  // B2 was sure and wrong: our side hears a sonar ping.
  await expect(phone(a2).page.locator('.fw-ping').first()).toBeVisible({ timeout: 20_000 });
  for (const p of phones) {
    await scan(p);
    await fits(p, 'round 2');
  }

  // ── Round 2: A2 is sure and right on the three; B2 misses.
  await fire(phone(a2), 1, true, true);
  await fire(phone(b2), 22, false, true);
  await nextRound(control, 2);
  for (const p of phones) await expect(p.page.locator('.gm-solo__status')).toContainText('All rounds fired', { timeout: 20_000 });
  for (const p of phones) await scan(p);
  // The one-square ship went down with its recall line; both teams landed hits.
  const after = (await server.teacher({ action: 'campaign_state', game_id: 'fw', class_id: CLASS_ID })).body.data;
  const rows = after.standings[0].teams as Array<{ team: string; damage: number; sunk: number }>;
  const teamA = after.teams.find((tm: { members: Array<{ name: string }> }) => tm.members.some((m) => m.name === a1)).id;
  expect(rows.find((r) => r.team === teamA)?.sunk).toBe(1);
  expect(rows.every((r) => r.damage > 0)).toBe(true);
  expect(after.written.filter((w: { kind: string }) => w.kind === 'report')).toHaveLength(3);

  // ── The reveal: no board and no names before it; names on the board and phones after.
  await expect(control.locator('.fc-board')).toHaveCount(0);
  await control.locator('.fc-reveal').click();
  await control.locator('.fc-confirm__yes').click();
  revealed = true;
  const board = control.locator('.fc-board');
  await expect(board).toBeVisible({ timeout: 20_000 });
  for (const n of NAMES) await expect(board).toContainText(n);
  for (const p of phones) {
    await expect(p.page.locator('.fw-reveal__title')).toBeVisible({ timeout: 20_000 });
    const names = p.page.locator('.fw-names');
    for (const n of NAMES) await expect(names).toContainText(shown(n));
    await expect(p.page.locator('.fw-chart[aria-label="Their fleet"] .fw-ship')).not.toHaveCount(0);
    await fits(p, 'reveal');
  }

  expect(leaks).toEqual([]);

  // ── Reduced motion: no steaming ship or smoke, ever, and the sea draws still frames.
  const still = phone(b2);
  const lively = phone(a1);
  const frames = async (p: Phone) => {
    const before = await p.page.evaluate(() => (window as unknown as { __raf: number }).__raf);
    await p.page.waitForTimeout(1500);
    return (await p.page.evaluate(() => (window as unknown as { __raf: number }).__raf)) - before;
  };
  expect(await frames(lively), 'the sea animates without reduced motion').toBeGreaterThan(10);
  expect(await frames(still), 'reduced motion: no animation frames').toBeLessThanOrEqual(2);
  expect(await still.page.evaluate(() => (window as unknown as { __motion: string[] }).__motion)).toEqual([]);
  const running = await still.page.evaluate(() =>
    document.getAnimations().filter((a) => a.playState === 'running').map((a) => (a as CSSAnimation).animationName ?? 'script')
  );
  expect(running.filter((n) => n !== 'fws-fade')).toEqual([]);

  for (const p of phones) await p.ctx.close();
  await tctx.close();
});
