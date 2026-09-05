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
    const mark = host.querySelector('.sign-in__mark');
    expect(mark).not.toBeNull();
    expect(mark?.getAttribute('src')).toContain('tasks.svg');
    expect(card?.firstElementChild).toBe(mark);
    expect(card?.querySelector('.sign-in__brand')).toBe(brand);
    expect(brand?.textContent).toBe('Tasks Hub');
  });
});
