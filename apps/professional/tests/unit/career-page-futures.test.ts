import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderCareerView, selectCareerFutureInPlace } from '@/views/career';

const BARE = 'future_00000000-0000-4000-8000-0000000000a1';
const READY = 'future_00000000-0000-4000-8000-0000000000a2';
const PARKED = 'future_00000000-0000-4000-8000-0000000000a3';
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
let careerLoads = 0;

beforeEach(() => {
  patches = [];
  careerLoads = 0;
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === 'PATCH') {
      patches.push({ url, body: JSON.parse(String(init.body)) });
      return Response.json({ ok: true, data: { future: {} } });
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

it('an Add criteria chip selects the future and opens criteria editing', async () => {
  const canvas = await mountPage();
  const bare = chip(canvas, 'Director of Innovation');
  expect(bare.textContent).toContain('Add criteria');

  bare.click();

  expect(location.hash).toBe(`#/career/future/${BARE}`);
  const sheet = document.querySelector<HTMLElement>('[aria-label="Criteria for Director of Innovation"]');
  expect(sheet).not.toBeNull();
  const input = sheet!.querySelector<HTMLInputElement>('.career-sheet__criterion input')!;
  expect(document.activeElement).toBe(input);

  input.value = 'Leads digital strategy across the school';
  [...sheet!.querySelectorAll('button')].find((b) => b.textContent === 'Save')!.click();
  await vi.waitFor(() => expect(patches).toHaveLength(1));
  expect(patches[0]!.url).toContain(encodeURIComponent(BARE));
  expect(patches[0]!.body.criteria).toEqual([
    { text: 'Leads digital strategy across the school', source: 'adam', order: 0 }
  ]);
  await vi.waitFor(() => expect(document.querySelector('.career-sheet')).toBeNull());
  await vi.waitFor(() => expect(careerLoads).toBe(2)); // quiet refresh
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

it('the panel offers Add criteria when a future has none', async () => {
  const canvas = await mountPage(`#/career/future/${BARE}`);
  const slot = canvas.querySelector<HTMLElement>('.career-page__detail-slot')!;
  const buttons = [...slot.querySelectorAll('button')].filter((b) => b.textContent === 'Add criteria');
  expect(buttons).toHaveLength(2); // ring + empty list
  buttons[1]!.click();
  expect(document.querySelector('[aria-label="Criteria for Director of Innovation"]')).not.toBeNull();
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
