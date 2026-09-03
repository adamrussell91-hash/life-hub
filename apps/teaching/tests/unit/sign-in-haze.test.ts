import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderSignIn } from '@/auth/gate';

describe('sign-in haze on the card', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
  });

  it('places cream haze as the first child of the sign-in card', () => {
    renderSignIn(host);

    const card = host.querySelector('.sign-in__card');
    const haze = host.querySelector('.sign-in__haze');
    const brand = host.querySelector('.sign-in__brand');

    expect(haze).toBeTruthy();
    expect(haze?.getAttribute('aria-hidden')).toBe('true');
    expect(card?.firstElementChild).toBe(haze);
    expect(host.querySelector('.sign-in__mark')).toBeNull();
    expect(haze?.nextElementSibling).toBe(brand);
    expect(haze?.querySelectorAll('.sign-in__bubble')).toHaveLength(5);
    expect(haze?.querySelectorAll('.sign-in__sparkle')).toHaveLength(6);
    expect(host.querySelector('#sign-in-passphrase')).toBeTruthy();
    expect(host.querySelector('.sign-in__brand')?.textContent).toBe('Teaching Hub');
  });
});
