import { afterEach, describe, expect, it, vi } from 'vitest';
import { openAddSkillSheet } from '@/views/career-skill-form';

const originalFetch = globalThis.fetch;
afterEach(() => {
  document.body.replaceChildren();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});
function openForm() {
  openAddSkillSheet(document.body, vi.fn());
  return document.querySelector<HTMLFormElement>('form')!;
}
function submit(form: HTMLFormElement) {
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}
describe('manual skill card', () => {
  it('rejects whitespace titles without saving', () => {
    const fetch = vi.fn();
    globalThis.fetch = fetch;
    const form = openForm();
    form.querySelector<HTMLInputElement>('[name="title"]')!.value = '   ';
    submit(form);
    expect(form.textContent).toContain('Enter a title.');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps entered values and permits retry after a failed save', async () => {
    globalThis.fetch = vi.fn(async () => Response.json({ ok: false,
      error: { code: 'store_unavailable', message: 'Could not save card.' } }, { status: 503 }));
    const form = openForm();
    form.querySelector<HTMLInputElement>('[name="title"]')!.value = 'Mentoring';
    submit(form);
    await vi.waitFor(() => expect(form.textContent).toContain('Could not save card.'));
    expect(form.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe('Mentoring');
    expect(form.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled).toBe(false);
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
  });
  it('cancels with Escape, restores focus and prevents duplicate forms', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const form = openForm();
    openAddSkillSheet(document.body, vi.fn());
    expect(document.querySelectorAll('[role="dialog"]').length).toBe(1);
    form.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
