import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderPrimaryNav, resetRailDisclosureStateForTests } from '@/shell/shell';

const hubCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../src/styles/hub.css'),
  'utf8'
);

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
    expect(
      host.querySelector('.hub-rail__list--desktop [data-section-panel="views"]')?.dataset.open
    ).toBe('true');
    expect(
      host.querySelector('.hub-rail__list--desktop [data-section-panel="plan"]')?.dataset.open
    ).toBe('false');
  });

  it('keeps the phone rail in the DOM but hidden on desktop', () => {
    expect(hubCss).toMatch(/\.hub-rail__mobile\s*\{\s*display:\s*none;/);
    expect(hubCss).toMatch(/\.hub-rail__section-panel\[data-open="true"\]/);
    expect(hubCss).toMatch(/align-self:\s*start;/);
    expect(hubCss).toMatch(/min-height:\s*100dvh;/);
    const host = document.createElement('div');
    renderPrimaryNav(host, 'board');
    expect(host.querySelector('.hub-rail__list--desktop')).not.toBeNull();
    expect(host.querySelector('.hub-rail__mobile')).not.toBeNull();
    expect(host.querySelectorAll('.hub-rail__link[href="#/board"]').length).toBe(2);
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

  it('adds a Hubs switcher that leaves Tasks for Life, Teaching, and Knowledge', () => {
    const host = document.createElement('div');
    renderPrimaryNav(host, 'board');
    const hubs = host.querySelector('[data-hub-switcher]');
    expect(hubs?.textContent).toContain('Hubs');
    expect(hubs?.querySelector('a[href="/"]')?.textContent).toContain('Life');
    expect(hubs?.querySelector('a[href="/teaching/"]')?.textContent).toContain('Teaching');
    expect(hubs?.querySelector('a[href="/knowledge/"]')?.textContent).toContain('Knowledge');
    expect(hubs?.querySelector('a[href="/tasks/"]')?.getAttribute('aria-current')).toBe('page');
  });
});
