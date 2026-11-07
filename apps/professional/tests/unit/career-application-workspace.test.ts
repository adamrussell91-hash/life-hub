import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMockApi } from '../../scripts/mock-api';
import { buildCareerModel } from '@/domain/career-model';
import type { ApplicationRecord } from '@/domain/types';
import { closeCriteriaMirror, renderCareerApplications } from '@/views/career-criteria-mirror';
import { resetApplicationWorkspace } from '@/views/career-application-workspace';

const SCHEMA_KEYS = new Set([
  'id',
  'criterion',
  'response',
  'order',
  'completed',
  'word_limit',
  'check',
  'response_source',
  'response_drafted_at',
  'response_pending'
]);

const originalFetch = globalThis.fetch;
let api: ReturnType<typeof createMockApi>;
let patches: Array<Record<string, unknown>>;
let host: HTMLElement;

async function data<T>(method: string, path: string, body?: unknown): Promise<T> {
  const reply = (await api.handle(method, path, body)) as { body: { data: T } };
  return reply.body.data;
}

/** The Career page's own wiring: one model from the overview and the application list. */
async function mountPage(): Promise<void> {
  const overview = await data<Record<string, unknown>>('GET', '/api/career');
  const { applications } = await data<{ applications: ApplicationRecord[] }>('GET', '/api/applications');
  const model = buildCareerModel({
    achievements: overview.achievements as never,
    answers_criterion: overview.answers_criterion as never,
    applications: applications.map((a) => ({
      id: a.id,
      position_title: a.position_title,
      pipeline_status: a.pipeline_status,
      selection_criteria: a.selection_criteria.map((c) => ({
        id: c.id,
        check_status: c.check?.status ?? null,
        evidence: c.check?.evidence ?? null
      }))
    }))
  });
  const next = document.createElement('div');
  await renderCareerApplications(next, model, { onChanged: () => void mountPage() });
  host.replaceChildren(next);
}

const buttons = (root: ParentNode, label: string) =>
  [...root.querySelectorAll('button')].filter((b) => b.textContent === label);
const row = (n: number) => document.querySelectorAll<HTMLElement>('.career-mirror__row')[n - 1]!;

beforeEach(async () => {
  resetApplicationWorkspace();
  closeCriteriaMirror();
  sessionStorage.clear();
  patches = [];
  api = createMockApi();
  await api.handle('POST', '/api/auth', { passphrase: 'professional-hub-local' });
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'], shouldAdvanceTime: true });
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (method === 'PATCH' && url.pathname === '/api/applications') patches.push(body);
    const reply = (await api.handle(method, `${url.pathname}${url.search}`, body)) as { status: number; body: unknown };
    return Response.json(reply.body, { status: reply.status });
  }) as typeof fetch;
  host = document.createElement('div');
  document.body.append(host);
  await mountPage();
  buttons(host, 'Open Criteria Mirror')[0]!.click();
  await vi.waitFor(() => expect(document.querySelectorAll('.career-mirror__row')).toHaveLength(4));
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = originalFetch;
  document.body.replaceChildren();
});

it('every criterion reads Not checked before Ann or Adam has looked', () => {
  const labels = [...document.querySelectorAll('.career-mirror__pct')].map((n) => n.textContent);
  expect(labels).toEqual(['Not checked', 'Not checked', 'Not checked', 'Not checked']);
  expect(document.body.textContent).not.toContain('0%');
  expect(host.querySelector('.career-page__app-row')!.textContent).toContain('not checked');
  expect(row(1).textContent).toContain('Check this one first');
});

it('Split adds new lines with their limits and sends only schema keys', async () => {
  const ad = document.querySelector<HTMLTextAreaElement>('.career-mirror__ad-text')!;
  ad.value = `${ad.value}\n5. Strong communication with families (200 words)`;
  ad.dispatchEvent(new Event('input'));
  buttons(document, 'Split into criteria')[0]!.click();
  await vi.waitFor(() => expect(buttons(document, 'Add it')).toHaveLength(1));
  expect(document.querySelector('.career-mirror__confirm')!.textContent).toContain('1 with a word limit');
  buttons(document, 'Add it')[0]!.click();
  await vi.waitFor(() => expect(patches.length).toBeGreaterThan(0));
  const saved = patches[0]!.selection_criteria as Array<Record<string, unknown>>;
  expect(saved).toHaveLength(5);
  for (const criterion of saved) {
    for (const key of Object.keys(criterion)) expect(SCHEMA_KEYS.has(key)).toBe(true);
  }
  expect(saved.slice(0, 4).every((c) => typeof c.id === 'string')).toBe(true);
  expect(saved[4]).toMatchObject({ criterion: 'Strong communication with families (200 words)', word_limit: 200, order: 5 });
  await vi.waitFor(() => expect(document.querySelectorAll('.career-mirror__row')).toHaveLength(5));
});

it('check, confirm, then the bars come from the model and drafts never overwrite Adam', async () => {
  buttons(document, 'Check against my record')[0]!.click();
  await vi.advanceTimersByTimeAsync(8000);
  await vi.waitFor(() => expect(document.querySelectorAll('.career-mirror__suggest')).toHaveLength(4));
  expect(document.querySelector('.career-mirror__suggest .career-mirror__chip')!.getAttribute('href')).toContain(
    'achievement_demo_reading'
  );
  expect(patches).toHaveLength(0);

  buttons(document, 'Confirm all')[0]!.click();
  await vi.waitFor(() => expect(document.querySelectorAll('.career-mirror__suggest')).toHaveLength(0));
  await vi.waitFor(() =>
    expect([...document.querySelectorAll('.career-mirror__pct')].map((n) => n.textContent)).toEqual([
      '100%',
      'Partly · One skill card touches on syllabus work; nothing yet on Stage 6.',
      'Not yet',
      'Nothing in your record yet'
    ])
  );
  expect(buttons(document, 'Make it a stepping stone')).toHaveLength(1);
  expect(row(3).textContent).toContain('Make it a stepping stone');
  expect(row(4).textContent).toContain('Nothing in your record yet');
  expect(host.querySelector('.career-page__app-row')!.textContent).toContain('match 38%');

  // Adam wrote row 1 himself, so Ann's redraft waits beside it.
  buttons(row(1), 'Redraft')[0]!.click();
  await vi.advanceTimersByTimeAsync(8000);
  await vi.waitFor(() => expect(row(1).querySelector('.career-mirror__pending')).not.toBeNull());
  expect(row(1).querySelector<HTMLTextAreaElement>('.career-mirror__response')!.value).toBe(
    'I led a team of six through a new Stage 5 program.'
  );
  buttons(row(1), 'Use this')[0]!.click();
  await vi.waitFor(() => expect(row(1).querySelector('.career-mirror__pending')).toBeNull());
  expect(row(1).querySelector<HTMLTextAreaElement>('.career-mirror__response')!.value).toContain('Bellbird Creek');
});

it('the word count turns amber over the limit, and saving his own text marks it his', async () => {
  const area = row(2).querySelector<HTMLTextAreaElement>('.career-mirror__response')!;
  area.value = 'word '.repeat(301);
  area.dispatchEvent(new Event('input'));
  const count = row(2).querySelector('.career-mirror__count')!;
  expect(count.textContent).toBe('301 / 300 words');
  expect(count.classList.contains('career-mirror__count--over')).toBe(true);
  area.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(patches).toHaveLength(1));
  const saved = (patches[0]!.selection_criteria as Array<Record<string, unknown>>)[1]!;
  expect(saved.response_source).toBe('adam');
});

it('the CV box counts what Ann left to add', async () => {
  const cv = document.querySelector<HTMLElement>('[data-doc="cv"]')!;
  buttons(cv, 'Draft')[0]!.click();
  await vi.advanceTimersByTimeAsync(8000);
  await vi.waitFor(() =>
    expect(document.querySelector('[data-doc="cv"] .career-mirror__count')!.textContent).toContain('2 things to add')
  );
});

it('Draft everything states the cost, then runs responses, letter and CV in order', async () => {
  buttons(document, 'Check against my record')[0]!.click();
  await vi.advanceTimersByTimeAsync(8000);
  await vi.waitFor(() => expect(buttons(document, 'Confirm all')).toHaveLength(1));
  buttons(document, 'Confirm all')[0]!.click();
  await vi.waitFor(() => expect(buttons(document, 'Draft everything')[0]!.disabled).toBe(false));
  expect(document.querySelector('.career-mirror__everything')!.textContent).toContain('About 35c');
  buttons(document, 'Draft everything')[0]!.click();
  await vi.waitFor(() => expect(buttons(document, 'Go')).toHaveLength(1));
  buttons(document, 'Go')[0]!.click();
  for (let i = 0; i < 4; i += 1) await vi.advanceTimersByTimeAsync(8000);
  await vi.waitFor(() =>
    expect(document.querySelector('.career-mirror__everything')!.textContent).toContain('Responses, cover letter and CV drafted')
  );
  const letter = document.querySelector<HTMLTextAreaElement>('[data-doc="cover_letter"] textarea')!;
  expect(letter.value).toContain('Dear Principal');
  expect(document.querySelector('[data-doc="cover_letter"] .career-mirror__count')!.textContent).toContain('1 thing to add');
});
