import { beforeEach, describe, expect, it } from 'vitest';
import { renderPrimaryNav, resetRailDisclosureStateForTests } from '@/shell/shell';

describe('primary rail navigation', () => {
  beforeEach(() => resetRailDisclosureStateForTests());

  it('places Chat in Home and removes it from Plan', () => {
    const host = document.createElement('div');
    renderPrimaryNav(host, 'board');
    expect(host.querySelector('[data-nav-section="home"]')?.textContent).toContain('Chat');
    expect(host.querySelector('[data-nav-section="plan"]')?.textContent).not.toContain('Chat');
  });

  it('opens only the active section by default', () => {
    const host = document.createElement('div');
    renderPrimaryNav(host, 'day');
    expect(host.querySelector('[data-section-toggle="views"]')?.getAttribute('aria-expanded')).toBe(
      'true'
    );
    expect(host.querySelector('[data-section-toggle="plan"]')?.getAttribute('aria-expanded')).toBe(
      'false'
    );
  });

  it('keeps multiple non-active sections open', () => {
    const host = document.createElement('div');
    renderPrimaryNav(host, 'board');
    (host.querySelector('[data-section-toggle="plan"]') as HTMLButtonElement).click();
    (host.querySelector('[data-section-toggle="views"]') as HTMLButtonElement).click();
    expect(host.querySelector('[data-section-toggle="plan"]')?.getAttribute('aria-expanded')).toBe(
      'true'
    );
    expect(host.querySelector('[data-section-toggle="views"]')?.getAttribute('aria-expanded')).toBe(
      'true'
    );
  });

  it('renders section controls above destinations for mobile', () => {
    const host = document.createElement('div');
    renderPrimaryNav(host, 'board');
    const mobile = host.querySelector('[data-mobile-rail]');
    expect(mobile?.querySelector('.hub-rail__mobile-tabs [data-section-toggle="home"]')).not.toBeNull();
    expect(mobile?.querySelector('.hub-rail__mobile-items [href="#/board"]')).not.toBeNull();
    expect(mobile?.querySelector('.hub-rail__mobile-items [href="#/clare"]')).not.toBeNull();
  });
});
