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

  it('renders refresh in page-header actions and does not render sign-out', () => {
    const onRefresh = vi.fn();
    const refs = renderTeacherShell(root, { onLogout: vi.fn(), onRefresh });
    const host = document.createElement('div');
    renderPageHeader(host, { eyebrow: 'Teaching Hub', title: 'Classes' });

    expect(refs.logoutButton).toBeNull();
    expect(host.querySelector('[data-hub-sign-out]')).toBeNull();
    expect(host.textContent).not.toContain('Sign out');
    expect(host.querySelector('[data-hub-refresh]')?.getAttribute('aria-label')).toBe('Refresh');
    expect(host.querySelectorAll('.page-header__actions .hub-utilities .hub-icon-btn')).toHaveLength(1);

    const refresh = host.querySelector<HTMLButtonElement>('[data-hub-refresh]');
    refresh?.click();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('hides the context bar when it has no children', () => {
    const refs = renderTeacherShell(root);
    expect(refs.contextBar.hidden).toBe(true);
  });
});
