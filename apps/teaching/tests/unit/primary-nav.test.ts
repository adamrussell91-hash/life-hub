import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/router')>();
  return { ...actual, navigate: vi.fn() };
});

import { navigate } from '@/app/router';
import { renderPrimaryNav } from '@/teacher/primary-nav';

describe('primary nav', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
  });

  it('renders the section links including Templates', () => {
    renderPrimaryNav(container, { activeSection: 'home' });
    const labels = [...container.querySelectorAll('.primary-nav__link')].map(
      (el) => el.querySelector('.primary-nav__label')?.textContent
    );
    expect(labels).toEqual([
      'Dashboard',
      'Classes',
      'Scope & Sequences',
      'Units',
      'Lessons',
      'Templates',
      'Resource Library',
      'Trash'
    ]);
    const links = [...container.querySelectorAll('.primary-nav__link')];
    expect(links).toHaveLength(8);
    for (const link of links) {
      expect(link.querySelector('svg.primary-nav__glyph')).not.toBeNull();
    }
  });

  it('marks the active section with aria-current', () => {
    renderPrimaryNav(container, { activeSection: 'units' });
    const active = container.querySelector('.primary-nav__link[aria-current="page"]');
    expect(active?.querySelector('.primary-nav__label')?.textContent).toBe('Units');
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it('navigates on click via the client router', () => {
    renderPrimaryNav(container, { activeSection: 'home' });
    const classes = [...container.querySelectorAll<HTMLAnchorElement>('.primary-nav__link')].find(
      (el) => el.querySelector('.primary-nav__label')?.textContent === 'Classes'
    )!;
    classes.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(navigate).toHaveBeenCalledWith('/classes');
  });
});
