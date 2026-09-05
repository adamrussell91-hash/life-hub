import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderSignIn } from '@/auth/gate';

describe('sign-in gate', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
  });

  it('renders a clean card with the hub tile first and no haze', () => {
    renderSignIn(host);

    const card = host.querySelector('.sign-in__card');
    const mark = host.querySelector('.sign-in__mark');

    expect(host.querySelector('.sign-in__haze')).toBeNull();
    expect(host.querySelector('.sign-in__bubble')).toBeNull();
    expect(host.querySelector('.sign-in__sparkle')).toBeNull();
    expect(mark).toBeInstanceOf(HTMLImageElement);
    expect((mark as HTMLImageElement).src).toContain('/icons/teaching.svg');
    expect(card?.firstElementChild).toBe(mark);
    expect(host.querySelector('#sign-in-passphrase')).toBeTruthy();
    expect(host.querySelector('.sign-in__brand')?.textContent).toBe('Teaching Hub');
  });
});
