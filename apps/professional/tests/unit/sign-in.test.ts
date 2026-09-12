import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSignIn } from '@/auth/gate';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('renderSignIn', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders the Professional Hub brand eyebrow, title, and no supporting copy', () => {
    const container = document.createElement('div');
    renderSignIn(container);
    expect(container.querySelector('.sign-in__brand')?.textContent).toBe('Professional Hub');
    expect(container.querySelector('.sign-in__title')?.textContent).toBe('Sign in');
    expect(container.querySelector('.sign-in__supporting')).toBeNull();
  });

  it('submits on Enter (form submit event), not only a button click', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, data: { authenticated: true } }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, data: { authenticated: true } }));

    const container = document.createElement('div');
    document.body.append(container);
    let succeeded = false;
    renderSignIn(container, { onSuccess: () => { succeeded = true; } });

    const input = container.querySelector<HTMLInputElement>('#sign-in-passphrase')!;
    const form = container.querySelector('form')!;
    input.value = 'professional-hub-local';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(succeeded).toBe(true);
    container.remove();
  });
});
