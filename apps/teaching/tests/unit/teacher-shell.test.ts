import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerHubUtilities } from '@/teacher/hub-utilities';
import { renderPageHeader } from '@/teacher/page-header';
import { renderTeacherShell } from '@/teacher/shell';

describe('teacher shell', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.replaceChildren(root);
  });

  afterEach(() => {
    registerHubUtilities(null);
    vi.unstubAllGlobals();
  });

  it('renders brand without sign-out when onLogout is omitted', () => {
    const refs = renderTeacherShell(root);
    expect(root.textContent).toContain('Teaching Hub');
    expect(refs.logoutButton).toBeNull();
    expect(root.querySelector('[data-hub-sign-out]')).toBeNull();
    expect(root.querySelector('.teacher-layout__logout')).toBeNull();
    expect(root.querySelector('.teacher-layout__rail-toggle')).toBeNull();
    const skip = root.querySelector<HTMLAnchorElement>('.skip-link');
    expect(skip?.textContent).toBe('Skip to content');
    expect(skip?.getAttribute('href')).toBe('#teacher-main');
    expect(refs.main.id).toBe('teacher-main');
  });

  it('renders sign-out in page-header actions and invokes onLogout when clicked', async () => {
    const onLogout = vi.fn().mockResolvedValue(undefined);
    const refs = renderTeacherShell(root, { onLogout });
    const host = document.createElement('div');
    renderPageHeader(host, { title: 'Classes' });

    expect(refs.logoutButton).toBeInstanceOf(HTMLButtonElement);
    expect(refs.logoutButton?.classList.contains('hub-icon-btn')).toBe(true);
    expect(refs.logoutButton?.getAttribute('aria-label')).toBe('Sign out');
    expect(refs.logoutButton?.textContent).not.toBe('Sign out');
    expect(host.querySelector('.page-header__actions .hub-utilities .hub-icon-btn')).toBe(
      refs.logoutButton
    );
    expect(refs.rail.contains(refs.logoutButton!)).toBe(false);

    refs.logoutButton?.click();
    await vi.waitFor(() => {
      expect(onLogout).toHaveBeenCalledTimes(1);
    });
  });

  it('hides the context bar when it has no children', () => {
    const refs = renderTeacherShell(root);
    expect(refs.contextBar.hidden).toBe(true);
  });
});
