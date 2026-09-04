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

  it('renders a clean card with the brand first and no haze', () => {
    renderSignIn(host);

    const card = host.querySelector('.sign-in__card');
    const brand = host.querySelector('.sign-in__brand');

    expect(host.querySelector('.sign-in__haze')).toBeNull();
    expect(host.querySelector('.sign-in__bubble')).toBeNull();
    expect(host.querySelector('.sign-in__sparkle')).toBeNull();
    expect(host.querySelector('.sign-in__mark')).toBeNull();
    expect(card?.firstElementChild).toBe(brand);
    expect(host.querySelector('#sign-in-passphrase')).toBeTruthy();
    expect(brand?.textContent).toBe('Teaching Hub');
  });
});
