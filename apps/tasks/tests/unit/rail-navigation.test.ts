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

  it('mounts the locked hub mobile chrome beside the shell', () => {
    const root = document.createElement('div');
    const layout = document.createElement('div');
    layout.className = 'hub-layout';
    const railNav = document.createElement('div');
    layout.append(railNav);
    root.append(layout);
    document.body.append(root);
    renderPrimaryNav(railNav, 'board');
    const bar = root.querySelector('.hub-mobile-nav');
    expect(bar).not.toBeNull();
    expect(bar?.textContent).toContain('Home');
    expect(bar?.textContent).toContain('Chat');
    expect(bar?.textContent).toContain('Today');
    expect(bar?.textContent).toContain('More');
    expect(root.querySelector('.hub-more-sheet')).not.toBeNull();
    root.remove();
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
