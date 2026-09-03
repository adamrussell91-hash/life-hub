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

  it('places the brand immediately after the haze without a hub tile', () => {
    renderSignIn(host);

    const card = host.querySelector('.sign-in__card');
    const haze = host.querySelector('.sign-in__haze');
    const brand = host.querySelector('.sign-in__brand');

    expect(haze).toBeTruthy();
    expect(card?.firstElementChild).toBe(haze);
    expect(host.querySelector('.sign-in__mark')).toBeNull();
    expect(haze?.nextElementSibling).toBe(brand);
  });
});
