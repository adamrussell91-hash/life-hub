import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TEACHER_RAIL_PREFS_KEY } from '@/teacher/rail-prefs';
import { renderTeacherShell } from '@/teacher/shell';

class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe('teacher shell', () => {
  let root: HTMLElement;

  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    root = document.createElement('div');
    document.body.replaceChildren(root);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders brand without sign-out when onLogout is omitted', () => {
    const refs = renderTeacherShell(root);
    expect(root.textContent).toContain('Teaching Hub');
    expect(refs.logoutButton).toBeNull();
    expect(root.querySelector('[data-hub-sign-out]')).toBeNull();
    expect(root.querySelector('.teacher-layout__logout')).toBeNull();
    expect(root.querySelector('.teacher-layout__rail-toggle')).not.toBeNull();
    const skip = root.querySelector<HTMLAnchorElement>('.skip-link');
    expect(skip?.textContent).toBe('Skip to content');
    expect(skip?.getAttribute('href')).toBe('#teacher-main');
    expect(refs.main.id).toBe('teacher-main');
  });

  it('renders sign-out and invokes onLogout when clicked', async () => {
    const onLogout = vi.fn().mockResolvedValue(undefined);
    const refs = renderTeacherShell(root, { onLogout });

    expect(refs.logoutButton).toBeInstanceOf(HTMLButtonElement);
    expect(refs.logoutButton?.classList.contains('hub-icon-btn')).toBe(true);
    expect(refs.logoutButton?.getAttribute('aria-label')).toBe('Sign out');
    expect(refs.logoutButton?.textContent).not.toBe('Sign out');
    expect(root.querySelector('.teacher-layout__utilities .hub-icon-btn')).toBe(refs.logoutButton);
    expect(refs.main.contains(refs.logoutButton)).toBe(true);
    expect(refs.rail.contains(refs.logoutButton!)).toBe(false);
    expect(root.querySelector('.hub-mark')).toBeNull();

    refs.logoutButton?.click();
    await vi.waitFor(() => {
      expect(onLogout).toHaveBeenCalledTimes(1);
    });
  });

  it('hides the context bar when it has no children', () => {
    const refs = renderTeacherShell(root);
    expect(refs.contextBar.hidden).toBe(true);
  });

  it('collapses the curriculum rail and restores it from prefs', () => {
    renderTeacherShell(root);
    const layout = root.querySelector('.teacher-layout')!;
    const toggle = root.querySelector<HTMLButtonElement>('.teacher-layout__rail-toggle')!;

    expect(layout.classList.contains('teacher-layout--rail-collapsed')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Hide navigation');

    toggle.click();
    expect(layout.classList.contains('teacher-layout--rail-collapsed')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Show navigation');
    expect(JSON.parse(localStorage.getItem(TEACHER_RAIL_PREFS_KEY)!)).toEqual({
      collapsed: true
    });

    renderTeacherShell(root);
    const restored = root.querySelector('.teacher-layout')!;
    const restoredToggle = root.querySelector<HTMLButtonElement>(
      '.teacher-layout__rail-toggle'
    )!;
    expect(restored.classList.contains('teacher-layout--rail-collapsed')).toBe(true);
    expect(restoredToggle.getAttribute('aria-expanded')).toBe('false');

    restoredToggle.click();
    expect(restored.classList.contains('teacher-layout--rail-collapsed')).toBe(false);
    expect(JSON.parse(localStorage.getItem(TEACHER_RAIL_PREFS_KEY)!)).toEqual({
      collapsed: false
    });
  });

  it('keeps the curriculum rail expanded on mobile viewports even when prefs say collapsed', () => {
    localStorage.setItem(TEACHER_RAIL_PREFS_KEY, JSON.stringify({ collapsed: true }));
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query === '(max-width: 768px)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
        onchange: null
      }))
    );

    renderTeacherShell(root);
    const layout = root.querySelector('.teacher-layout')!;
    const toggle = root.querySelector<HTMLButtonElement>('.teacher-layout__rail-toggle')!;

    expect(layout.classList.contains('teacher-layout--rail-collapsed')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });
});
