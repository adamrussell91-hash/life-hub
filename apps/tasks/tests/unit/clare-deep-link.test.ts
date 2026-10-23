// apps/tasks/tests/unit/clare-deep-link.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
  applyClareDeepLink,
  askHammondHref,
  parseClareDeepLink,
  runClareDeepLink
} from '@/chat/clare-deep-link';

describe('clare deep link (G-35)', () => {
  it('parses agent and prompt from the hash', () => {
    const link = parseClareDeepLink('#/clare?agent=hammond&prompt=Help%20with%20marking');
    expect(link).toEqual({ agent: 'hammond', prompt: 'Help with marking', send: false });
  });

  it('ignores non-clare hashes', () => {
    expect(parseClareDeepLink('#/goals?agent=hammond')).toEqual({ agent: null, prompt: null, send: false });
  });

  it('only sends when there is a prompt to send', () => {
    expect(parseClareDeepLink('#/clare?agent=clare&send=1&prompt=Book%20a%20meeting').send).toBe(true);
    expect(parseClareDeepLink('#/clare?agent=clare&send=1').send).toBe(false);
    expect(parseClareDeepLink('#/clare?agent=clare&send=1&prompt=%20%20').send).toBe(false);
  });

  it('builds Ask Hammond href and applies it without sending', () => {
    expect(askHammondHref('Talk about HA evidence')).toBe(
      '#/clare?agent=hammond&prompt=Talk%20about%20HA%20evidence'
    );
    const root = document.createElement('div');
    const hammond = document.createElement('button');
    hammond.dataset.agent = 'hammond';
    hammond.textContent = 'Hammond';
    const composer = document.createElement('textarea');
    composer.name = 'message';
    root.append(hammond, composer);
    let clicked = false;
    hammond.addEventListener('click', () => {
      clicked = true;
    });
    applyClareDeepLink(root, { agent: 'hammond', prompt: 'Prefilled', send: false });
    expect(clicked).toBe(true);
    expect(composer.value).toBe('Prefilled');
  });

  it('sends a send=1 prompt once and clears it from the address', async () => {
    history.replaceState(null, '', '/tasks/#/clare?agent=clare&send=1&prompt=Book%20a%20meeting');
    const root = document.createElement('div');
    const composer = document.createElement('textarea');
    composer.name = 'message';
    root.append(composer);
    const send = vi.fn().mockResolvedValue(undefined);

    await runClareDeepLink(root, send);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('Book a meeting');
    expect(composer.value).toBe('');
    expect(location.hash).toBe('#/clare');

    await runClareDeepLink(root, send);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('leaves a prefill link unsent', async () => {
    const root = document.createElement('div');
    const composer = document.createElement('textarea');
    root.append(composer);
    const send = vi.fn().mockResolvedValue(undefined);

    await runClareDeepLink(root, send, { agent: null, prompt: 'Draft only', send: false });

    expect(send).not.toHaveBeenCalled();
    expect(composer.value).toBe('Draft only');
  });
});
