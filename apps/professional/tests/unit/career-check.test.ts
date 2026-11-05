import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildCareerModel } from '@/domain/career-model';
import { renderFutureDetail } from '@/views/career-future-panel';

const A = 'fcrit_00000000-0000-4000-8000-00000000000a';
const B = 'fcrit_00000000-0000-4000-8000-00000000000b';
const C = 'fcrit_00000000-0000-4000-8000-00000000000c';
const ID = 'future_00000000-0000-4000-8000-0000000000a1';

const baseFuture = (criteria: unknown[]) => ({
  id: ID,
  title: 'Head of Programs',
  where: null,
  status: 'active',
  lane_order: 0,
  colour_slot: 1,
  criteria,
  target_date: null,
  aliases: [],
  created_at: '2026-01-01T00:00:00.000Z'
});

const lines = (met: Array<Record<string, unknown> | undefined>) =>
  [A, B, C].map((id, order) => ({ id, text: `Line ${order + 1}`, order, source: 'ad', ...(met[order] ? { met: met[order] } : {}) }));

const modelFor = (met: Array<Record<string, unknown> | undefined>) =>
  buildCareerModel({ achievements: [], futures: [baseFuture(lines(met))], stones: [], applications: [] } as never).futures[0]!;

let patches: Array<Record<string, unknown>> = [];
let checks = 0;
let asks = 0;
let cleared = 0;
let readingAsks = 0;
let jobFailure = '';
const JOB = '00000000-0000-4000-8000-0000000000f1';
const originalFetch = globalThis.fetch;

beforeEach(() => {
  patches = [];
  checks = 0;
  asks = 0;
  cleared = 0;
  readingAsks = 0;
  jobFailure = '';
  sessionStorage.clear();
  vi.useFakeTimers({ toFake: ['setTimeout'], shouldAdvanceTime: true, advanceTimeDelta: 500 });
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('action=check_start')) {
      checks += 1;
      return Response.json({ ok: true, data: { job_id: JOB } });
    }
    if (url.includes('action=job_clear')) {
      cleared += 1;
      return Response.json({ ok: true, data: { cleared: true } });
    }
    if (url.includes('action=job_status')) {
      asks += 1;
      if (asks <= readingAsks) return Response.json({ ok: true, data: { status: 'reading' } });
      if (jobFailure) return Response.json({ ok: true, data: { status: 'failed', message: jobFailure } });
      return Response.json({
        ok: true,
        data: {
          status: 'done',
          result: {
            read_central_node: true,
            suggestions: [
              { criterion_id: A, status: 'have', evidence: 'Six years in the role.' },
              { criterion_id: B, status: 'unknown', evidence: '' }
            ]
          }
        }
      });
    }
    patches.push(JSON.parse(String(init?.body)));
    return Response.json({ ok: true, data: { future: {} } });
  }) as typeof fetch;
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = originalFetch;
  document.body.replaceChildren();
});

const button = (host: ParentNode, label: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent === label)!;

it('answers score the future, and nothing answered reads Not checked', () => {
  expect(modelFor([]).readiness_label).toBe('Not checked');
  const future = modelFor([{ status: 'have' }, { status: 'partly' }, { status: 'not_yet' }]);
  expect(future.readiness).toBe(50);
  expect(future.checked).toBe(true);
  expect(future.criteria.map((c) => c.coverage)).toEqual([1, 0.5, 0]);
});

it('Not yet alone is a real answer, so 0% can show', () => {
  const future = modelFor([{ status: 'not_yet' }]);
  expect(future.checked).toBe(true);
  expect(future.readiness_label).toBe('0%');
});

it('Ann suggests, nothing saves until confirmed, and an unknown line stays open', async () => {
  const onChanged = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  renderFutureDetail(host, modelFor([]) as never, { onChanged });

  button(host, 'Ask Ann to check').click();
  await vi.waitFor(() => expect(document.querySelector('.career-check')).not.toBeNull(), { timeout: 3000 });
  expect(checks).toBe(1);
  expect(patches).toHaveLength(0);

  const rows = [...document.querySelectorAll<HTMLElement>('.career-check__row')];
  const pressed = (row: HTMLElement) =>
    [...row.querySelectorAll('button[aria-pressed="true"]')].map((b) => b.textContent);
  expect(pressed(rows[0]!)).toEqual(['Have it']);
  expect(rows[0]!.textContent).toContain('Six years in the role.');
  expect(pressed(rows[1]!)).toEqual([]);
  expect(rows[1]!.textContent).toContain('Ann found nothing on this');

  button(rows[1]!, 'Not yet').click();
  button(document.querySelector('.career-check')!, 'Save answers').click();
  await vi.waitFor(() => expect(patches).toHaveLength(1));
  const saved = patches[0]!.criteria as Array<Record<string, unknown>>;
  expect(saved[0]!.met).toEqual({ status: 'have', evidence: 'Six years in the role.' });
  expect(saved[1]!.met).toEqual({ status: 'not_yet', evidence: '' });
  expect(saved[2]!.met).toBeNull();
  await vi.waitFor(() => expect(onChanged).toHaveBeenCalled());
  expect(cleared).toBe(1);
  expect(sessionStorage.length).toBe(0);
});

it('waits as long as Ann takes, far past the 20 seconds a request may wait', async () => {
  readingAsks = 40; // two minutes of asking at one ask every three seconds
  const host = document.createElement('div');
  document.body.append(host);
  renderFutureDetail(host, modelFor([]) as never, { onChanged: vi.fn() });
  button(host, 'Ask Ann to check').click();
  await vi.waitFor(() => expect(asks).toBeGreaterThan(0));
  await vi.advanceTimersByTimeAsync(130_000);
  await vi.waitFor(() => expect(document.querySelector('.career-check')).not.toBeNull());
  expect(asks).toBeGreaterThan(40);
  expect(host.textContent).not.toContain('too long');
});

it('leaving and coming back picks the same job up, with no second charge', async () => {
  readingAsks = 2;
  const first = document.createElement('div');
  document.body.append(first);
  renderFutureDetail(first, modelFor([]) as never, { onChanged: vi.fn() });
  button(first, 'Ask Ann to check').click();
  await vi.waitFor(() => expect(sessionStorage.length).toBe(1));
  expect(first.textContent).toContain('You can leave this page');
  first.remove(); // left the page

  const back = document.createElement('div');
  document.body.append(back);
  renderFutureDetail(back, modelFor([]) as never, { onChanged: vi.fn() });
  expect(button(back, 'Ask Ann to check').disabled).toBe(true);
  await vi.advanceTimersByTimeAsync(12_000);
  await vi.waitFor(() => expect(document.querySelectorAll('.career-check')).toHaveLength(1));
  expect(checks).toBe(1);
});

it('a real failure says so and frees the button', async () => {
  jobFailure = 'Ann couldn’t be reached after three tries.';
  const host = document.createElement('div');
  document.body.append(host);
  renderFutureDetail(host, modelFor([]) as never, { onChanged: vi.fn() });
  button(host, 'Ask Ann to check').click();
  await vi.waitFor(() => expect(host.textContent).toContain('after three tries'));
  expect(button(host, 'Ask Ann to check').disabled).toBe(false);
  expect(sessionStorage.length).toBe(0);
});

it('changing Ann’s answer drops her reason, and marking yourself costs no call', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  renderFutureDetail(host, modelFor([{ status: 'have', evidence: 'Old reason.' }]) as never, { onChanged: vi.fn() });

  button(host, 'Change answers').click();
  expect(checks).toBe(0);
  const row = document.querySelector<HTMLElement>('.career-check__row')!;
  button(row, 'Partly').click();
  expect(row.textContent).not.toContain('Old reason.');
  button(document.querySelector('.career-check')!, 'Save answers').click();
  await vi.waitFor(() => expect(patches).toHaveLength(1));
  expect((patches[0]!.criteria as Array<Record<string, unknown>>)[0]!.met).toEqual({ status: 'partly', evidence: '' });
});

it('only answered gaps offer a stepping stone', () => {
  const host = document.createElement('div');
  renderFutureDetail(host, modelFor([{ status: 'have' }, { status: 'not_yet' }]) as never, { onChanged: vi.fn() });
  expect(host.querySelectorAll('.career-future__gap-btn')).toHaveLength(1);
  expect(host.querySelector('.career-future__dot--gap')).not.toBeNull();
  expect(host.querySelector('.career-future__dot--none')).not.toBeNull();
});
