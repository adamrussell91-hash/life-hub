import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMockApi } from '../../scripts/mock-api';
import { buildCareerModel } from '@/domain/career-model';
import { renderSkillsScanPanel } from '@/views/career-skills-scan';

const originalFetch = globalThis.fetch;

beforeEach(async () => {
  const api = createMockApi({ careerDemo: false });
  await api.handle('POST', '/api/auth', { passphrase: 'professional-hub-local' });
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'], shouldAdvanceTime: true });
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const reply = (await api.handle(init?.method ?? 'GET', `${url.pathname}${url.search}`, body)) as {
      status: number;
      body: unknown;
    };
    return Response.json(reply.body, { status: reply.status });
  }) as typeof fetch;
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = originalFetch;
  document.body.replaceChildren();
});

const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === label)!;

it('estimates first, then shows each batch by polling, and Stop ends it', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  renderSkillsScanPanel(host, buildCareerModel({}), { onChanged: vi.fn() });
  button('Count records').click();
  await vi.waitFor(() => expect(host.textContent).toContain('412 records in 11 batches, about 88c. Go?'));
  button('Go').click();
  await vi.waitFor(() => expect(host.textContent).toContain('Batch 1 of 11'));
  await vi.advanceTimersByTimeAsync(7000);
  await vi.waitFor(() => expect(host.textContent).toMatch(/Batch [3-4] of 11/));
  button('Stop').click();
  await vi.advanceTimersByTimeAsync(4000);
  await vi.waitFor(() => expect(host.textContent).toMatch(/Stopped after batch \d+ of 11/));
});
