import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderCareerView, selectCareerFutureInPlace } from '@/views/career';

const BARE = 'future_00000000-0000-4000-8000-0000000000a1';
const READY = 'future_00000000-0000-4000-8000-0000000000a2';
const PARKED = 'future_00000000-0000-4000-8000-0000000000a3';
const UNLINKED = 'future_00000000-0000-4000-8000-0000000000a4';
const CARD = 'achievement_00000000-0000-4000-8000-0000000000b1';
const OTHER_CARD = 'achievement_00000000-0000-4000-8000-0000000000b2';

const future = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  title,
  where: null,
  status: 'active',
  lane_order: 0,
  colour_slot: 1,
  criteria: [],
  target_date: null,
  aliases: [],
  created_at: '2026-01-01T00:00:00.000Z',
  ...extra
});

const overview = {
  achievements: [
    { id: CARD, title: 'Ran the gifted program', occurred_on: '2026-08-01', date_precision: 'day', lifecycle_status: 'active' },
    { id: OTHER_CARD, title: 'Led a reading audit', occurred_on: '2026-07-01', date_precision: 'day', lifecycle_status: 'active' }
  ],
  futures: [
    future(BARE, 'Director of Innovation'),
    future(READY, 'Head of Gifted', {
      lane_order: 1,
      colour_slot: 2,
      criteria: [{ id: 'fcrit_1', text: 'Whole-school policy', order: 0, source: 'ad' }]
    }),
    future(PARKED, 'EdTech Lead', { status: 'parked', lane_order: 2, colour_slot: 3 })
  ],
  stones: [],
  supports_future: [
    { source_id: CARD, target_id: READY, criterion_ids: ['fcrit_1'], strength: 'strong' }
  ],
  answers_criterion: [],
  stone_for: [],
  stone_actions: [],
  employment_items: [],
  scan: { pending_count: 0, last_run_at: null }
};

const originalFetch = globalThis.fetch;
let patches: Array<{ url: string; body: Record<string, unknown> }> = [];
let posts: Array<Record<string, unknown>> = [];
let drafts: Array<Record<string, unknown>> = [];
let draftFails = false;
let careerLoads = 0;

beforeEach(() => {
  patches = [];
  posts = [];
  drafts = [];
  draftFails = false;
  careerLoads = 0;
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === 'PATCH') {
      patches.push({ url, body: JSON.parse(String(init.body)) });
      return Response.json({ ok: true, data: { future: {} } });
    }
    if (url.includes('action=draft_start')) {
      drafts.push(JSON.parse(String(init?.body)));
      return Response.json({ ok: true, data: { job_id: 'job-1' } });
    }
    if (url.includes('action=job_clear')) return Response.json({ ok: true, data: { cleared: true } });
    if (url.includes('action=job_status')) {
      if (draftFails) return Response.json({ ok: true, data: { status: 'failed', message: 'Try again' } });
      return Response.json({
        ok: true,
        data: {
          status: 'done',
          result: { draft: { criteria: [{ text: 'Whole-school leadership', source: 'ad' }] } }
        }
      });
    }
    if (init?.method === 'POST' && String(url).includes('futures')) {
      posts.push(JSON.parse(String(init.body)));
      return Response.json({ ok: true, data: { future: { id: BARE } } });
    }
    if (url.includes('/api/career-scan')) {
      return Response.json({ ok: true, data: { proposals: [] } });
    }
    if (url.includes('/api/applications')) {
      return Response.json({ ok: true, data: { applications: [] } });
    }
    if (url.includes('/api/career')) {
      careerLoads += 1;
      return Response.json({ ok: true, data: overview });
    }
    return Response.json({ ok: true, data: {} });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  history.replaceState(null, '', '#');
  document.body.replaceChildren();
});

async function mountPage(hash = '#/career'): Promise<HTMLElement> {
  history.replaceState(null, '', hash);
  const canvas = document.createElement('div');
  document.body.append(canvas);
  await renderCareerView(canvas);
  return canvas;
}

const chip = (canvas: HTMLElement, startsWith: string) =>
  [...canvas.querySelectorAll<HTMLButtonElement>('.career-river__chip')].find((b) =>
    b.textContent?.startsWith(startsWith)
  )!;

const button = (host: ParentNode, label: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent === label)!;

const paste = (box: HTMLTextAreaElement, text: string) => {
  box.value = text;
  box.dispatchEvent(new Event('input', { bubbles: true }));
};

it('an Add criteria chip opens the future with its paste box ready, no sheet', async () => {
  const canvas = await mountPage();
  const bare = chip(canvas, 'Director of Innovation');
  expect(bare.textContent).toContain('Add criteria');

  bare.click();
  await vi.waitFor(() => expect(location.hash).toBe(`#/career/future/${BARE}`));
  selectCareerFutureInPlace(canvas, BARE);

  expect(document.querySelector('.career-sheet')).toBeNull();
  const box = canvas.querySelector<HTMLTextAreaElement>('.career-criteria-box__input')!;
  expect(document.activeElement).toBe(box);
});

it('a pasted list saves as one criterion per line, in one go', async () => {
  const canvas = await mountPage(`#/career/future/${BARE}`);
  const slot = canvas.querySelector<HTMLElement>('.career-page__detail-slot')!;
  const box = slot.querySelector<HTMLTextAreaElement>('.career-criteria-box__input')!;

  paste(box, '- Leads digital strategy\n2. Runs staff training\n\n• Reports to the board');
  expect(slot.textContent).toContain('3 criteria');
  button(slot, 'Save criteria').click();

  await vi.waitFor(() => expect(patches).toHaveLength(1));
  expect(patches[0]!.url).toContain(encodeURIComponent(BARE));
  expect(patches[0]!.body).toEqual({
    criteria: [
      { text: 'Leads digital strategy', source: 'adam', order: 0 },
      { text: 'Runs staff training', source: 'adam', order: 1 },
      { text: 'Reports to the board', source: 'adam', order: 2 }
    ]
  });
  await vi.waitFor(() => expect(careerLoads).toBe(2)); // quiet refresh
});

it('Save future keeps the paste: this was the bug', async () => {
  const canvas = await mountPage();
  button(canvas, 'Add a future').click();
  const sheet = document.querySelector<HTMLElement>('[aria-label="Add a future"]')!;
  sheet.querySelector<HTMLInputElement>('input')!.value = 'Head of Learning';
  paste(sheet.querySelector<HTMLTextAreaElement>('textarea')!, 'Leads the program\nCoaches teachers');
  button(sheet, 'Save future').click();

  await vi.waitFor(() => expect(posts).toHaveLength(1));
  expect(posts[0]!.title).toBe('Head of Learning');
  expect(posts[0]!.criteria).toEqual([
    { text: 'Leads the program', source: 'adam', order: 0 },
    { text: 'Coaches teachers', source: 'adam', order: 1 }
  ]);
  await vi.waitFor(() => expect(document.querySelector('.career-sheet')).toBeNull());
});

it('a whole ad goes to Ann on save, and a failure leaves the paste in the box', async () => {
  const canvas = await mountPage(`#/career/future/${BARE}`);
  const slot = canvas.querySelector<HTMLElement>('.career-page__detail-slot')!;
  const box = slot.querySelector<HTMLTextAreaElement>('.career-criteria-box__input')!;
  const ad = 'We are seeking a leader for our school. '.repeat(15);
  paste(box, ad);
  expect(slot.textContent).toContain('Reads like a full ad');

  draftFails = true;
  button(slot, 'Save criteria').click();
  await vi.waitFor(() => expect(drafts).toHaveLength(1));
  await vi.waitFor(() => expect(button(slot, 'Save criteria').disabled).toBe(false));
  expect(box.value).toBe(ad);
  expect(patches).toHaveLength(0);

  draftFails = false;
  button(slot, 'Save criteria').click();
  await vi.waitFor(() => expect(patches).toHaveLength(1));
  expect(patches[0]!.body.criteria).toEqual([
    { text: 'Whole-school leadership', source: 'ad', order: 0 }
  ]);
});

it('Edit criteria shows every line in one box and keeps ids, so linked cards stay linked', async () => {
  const canvas = await mountPage(`#/career/future/${READY}`);
  const slot = canvas.querySelector<HTMLElement>('.career-page__detail-slot')!;
  button(slot, 'Edit criteria').click();
  const sheet = document.querySelector<HTMLElement>('[aria-label="Criteria for Head of Gifted"]')!;
  const box = sheet.querySelector<HTMLTextAreaElement>('textarea')!;
  expect(box.value).toBe('Whole-school policy');
  expect(document.activeElement).toBe(box);

  paste(box, 'Whole-school policy\nParent communication');
  button(sheet, 'Save').click();
  await vi.waitFor(() => expect(patches).toHaveLength(1));
  expect(patches[0]!.body.criteria).toEqual([
    { id: 'fcrit_1', text: 'Whole-school policy', source: 'ad', order: 0 },
    { text: 'Parent communication', source: 'adam', order: 1 }
  ]);
});

it('Escape and clicking outside will not throw away a paste', async () => {
  const canvas = await mountPage();
  button(canvas, 'Add a future').click();
  const sheet = document.querySelector<HTMLElement>('[aria-label="Add a future"]')!;
  paste(sheet.querySelector<HTMLTextAreaElement>('textarea')!, 'Leads the program');

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  sheet.click();
  expect(document.querySelector('.career-sheet')).not.toBeNull();
  expect(sheet.textContent).toContain('Press Cancel to discard');

  button(sheet, 'Cancel').click();
  expect(document.querySelector('.career-sheet')).toBeNull();
});

it('picking a future swaps the panel in place, without refetching the page', async () => {
  const canvas = await mountPage();
  const loadsBefore = careerLoads;
  const page = canvas.querySelector('.career-page');
  const slot = canvas.querySelector<HTMLElement>('.career-page__detail-slot')!;
  expect(slot.childElementCount).toBe(0);

  expect(selectCareerFutureInPlace(canvas, READY)).toBe(true);

  expect(canvas.querySelector('.career-page')).toBe(page);
  expect(careerLoads).toBe(loadsBefore);
  expect(slot.querySelector('h2')?.textContent).toBe('Head of Gifted');
  // The panel sits directly under the river, not below the fold.
  expect(slot.previousElementSibling?.classList.contains('career-page__river')).toBe(true);
  expect(chip(canvas, 'Head of Gifted').getAttribute('aria-pressed')).toBe('true');
  expect(canvas.querySelector(`[data-future-id="${READY}"]`)?.classList.contains('is-selected')).toBe(true);
  expect(slot.textContent).not.toContain('People who got there');
  await new Promise((r) => requestAnimationFrame(r));
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled();

  [...slot.querySelectorAll('button')].find((b) => b.textContent === 'Close')!.click();
  expect(location.hash).toBe('#/career');
  expect(selectCareerFutureInPlace(canvas, null)).toBe(true);
  expect(slot.childElementCount).toBe(0);
});

it('falls back to a full render when the page is not on screen', async () => {
  const canvas = await mountPage();
  expect(selectCareerFutureInPlace(document.createElement('div'), READY)).toBe(false);
  expect(selectCareerFutureInPlace(canvas, 'future_unknown')).toBe(false);
});

it('a future with no criteria shows the box and no empty score or stones', async () => {
  const canvas = await mountPage(`#/career/future/${BARE}`);
  const slot = canvas.querySelector<HTMLElement>('.career-page__detail-slot')!;
  expect(slot.querySelector('.career-criteria-box__input')).not.toBeNull();
  expect(slot.querySelector('.career-future__ring')).toBeNull();
  expect(slot.textContent).not.toContain('Stepping stones');
  expect(slot.textContent).not.toContain('Add criteria');
});

it('criteria with no linked cards read as not checked, never as 0%', async () => {
  overview.futures.push(
    future(UNLINKED, 'Head of Programs', {
      lane_order: 3,
      criteria: [{ id: 'fcrit_2', text: 'Runs programs', order: 0, source: 'ad' }]
    })
  );
  try {
    const canvas = await mountPage(`#/career/future/${UNLINKED}`);
    const slot = canvas.querySelector<HTMLElement>('.career-page__detail-slot')!;
    expect(chip(canvas, 'Head of Programs').textContent).toContain('Not checked');
    expect(slot.querySelector('.career-future__ring')).toBeNull();
    expect(slot.textContent).toContain('Not checked yet');
    expect(slot.textContent).not.toContain('0%');
    expect(slot.querySelector('.career-future__dot--none')).not.toBeNull();
  } finally {
    overview.futures.pop();
  }
});

it('a linked card still gets a score and a ring', async () => {
  const canvas = await mountPage(`#/career/future/${READY}`);
  const slot = canvas.querySelector<HTMLElement>('.career-page__detail-slot')!;
  expect(slot.querySelector('.career-future__ring')?.textContent).toMatch(/\d+%/);
  expect(slot.textContent).not.toContain('Not checked yet');
});

it('a save that finishes after leaving the page does not draw Career over it', async () => {
  const canvas = await mountPage(`#/career/future/${BARE}`);
  const slot = canvas.querySelector<HTMLElement>('.career-page__detail-slot')!;
  paste(slot.querySelector<HTMLTextAreaElement>('.career-criteria-box__input')!, 'Runs programs');
  button(slot, 'Save criteria').click();
  const other = document.createElement('p');
  canvas.replaceChildren(other); // the router drew another page

  await vi.waitFor(() => expect(patches).toHaveLength(1));
  await new Promise((r) => setTimeout(r, 20));
  expect(canvas.firstElementChild).toBe(other);
  expect(careerLoads).toBe(1);
});

it('a parked chip restores its future', async () => {
  const canvas = await mountPage();
  const parked = chip(canvas, 'Parked: EdTech Lead');
  expect(parked.disabled).toBe(false);
  parked.click();
  await vi.waitFor(() => expect(patches).toHaveLength(1));
  expect(patches[0]!.url).toContain(encodeURIComponent(PARKED));
  expect(patches[0]!.body).toEqual({ status: 'active' });
  await vi.waitFor(() => expect(careerLoads).toBe(2));
});

it('ledger filters show only the cards that support a future', async () => {
  const canvas = await mountPage();
  const ledger = canvas.querySelector<HTMLElement>('.career-page__ledger')!;
  const rows = () =>
    [...ledger.querySelectorAll<HTMLElement>('.career-page__ledger-row')].filter((r) => !r.hidden);
  expect(rows()).toHaveLength(2);

  const filter = (label: string) =>
    [...ledger.querySelectorAll<HTMLButtonElement>('.career-page__ledger-filters button')].find(
      (b) => b.textContent === label
    )!;
  filter('Head of Gifted').click();
  expect(rows().map((r) => r.textContent)).toEqual([expect.stringContaining('Ran the gifted program')]);
  expect(filter('Head of Gifted').getAttribute('aria-pressed')).toBe('true');

  filter('Director of Innovation').click();
  expect(rows()).toHaveLength(0);
  expect(ledger.textContent).toContain('No cards support Director of Innovation yet');

  filter('All').click();
  expect(rows()).toHaveLength(2);
});

it('drops the What if panel, which had nothing behind it', async () => {
  const canvas = await mountPage();
  expect(canvas.textContent).not.toContain('What if');
});
