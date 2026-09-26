// apps/tasks/tests/unit/clare-deep-link.test.ts
import { describe, expect, it } from 'vitest';
import { applyClareDeepLink, askHammondHref, parseClareDeepLink } from '@/chat/clare-deep-link';

describe('clare deep link (G-35)', () => {
  it('parses agent and prompt from the hash', () => {
    const link = parseClareDeepLink('#/clare?agent=hammond&prompt=Help%20with%20marking');
    expect(link).toEqual({ agent: 'hammond', prompt: 'Help with marking' });
  });

  it('ignores non-clare hashes', () => {
    expect(parseClareDeepLink('#/goals?agent=hammond')).toEqual({ agent: null, prompt: null });
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
    applyClareDeepLink(root, { agent: 'hammond', prompt: 'Prefilled' });
    expect(clicked).toBe(true);
    expect(composer.value).toBe('Prefilled');
  });
});
