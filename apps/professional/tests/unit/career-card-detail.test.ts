import { afterEach, expect, it, vi } from 'vitest';
import { renderCareerView } from '@/views/career';
const id = 'achievement_00000000-0000-4000-8000-000000000001';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; location.hash = ''; document.body.replaceChildren(); });
it('opens a card route, edits evidence, then confirms deletion', async () => {
  let card = { id, title: 'Curriculum design', occurred_on: '2026-10-02', date_precision: 'day',
    skills: ['Leadership'], star: { situation: 'New subject', task: null, action: 'Built programs', result: null },
    lifecycle_status: 'active' };
  globalThis.fetch = vi.fn(async (input, init) => {
    if (String(input).includes('/api/career-achievements')) {
      if (init?.method === 'PATCH') card = { ...card, ...JSON.parse(String(init.body)) };
      return Response.json({ ok: true, data: { achievement: card } });
    }
    return Response.json({ ok: true, data: { achievements: [card], futures: [], stones: [], applications: [] } });
  });
  location.hash = '#/career/card/' + id;
  const canvas = document.createElement('div'); document.body.append(canvas);
  await renderCareerView(canvas);
  expect(canvas.textContent).toContain('Built programs');
  const button = (text: string) => [...document.querySelectorAll('button')].find(b => b.textContent === text)!;
  button('Edit card').click();
  const form = document.querySelector<HTMLFormElement>('[aria-label="Edit skill card"] form')!;
  expect(form.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe('Curriculum design');
  form.querySelector<HTMLInputElement>('[name="title"]')!.value = 'Updated curriculum';
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(canvas.textContent).toContain('Updated curriculum'));
  button('Delete card').click();
  expect(card.lifecycle_status).toBe('active');
  button('Keep card').click();
  expect(card.lifecycle_status).toBe('active');
  button('Delete card').click();
  button('Confirm delete').click();
  await vi.waitFor(() => expect(location.hash).toBe('#/career'));
  expect(card.lifecycle_status).toBe('deleted');
});
