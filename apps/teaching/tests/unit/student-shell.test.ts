import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStudentShell, studentAnchor } from '@/student/shell';
import { navigate } from '@/app/router';
vi.mock('@/app/router', () => ({ navigate: vi.fn() }));

describe('student shell', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it.each(['/s/units/unit_a', '/s/classes/class_a', '/s/lessons/lesson_a'])('keeps %s on the student-safe host from LifeHub', (path) => {
    vi.stubGlobal('location', new URL('https://life-hub.adam-russell.com/teaching/s/lessons/lesson_a'));
    const link = studentAnchor(path, 'test', 'Back');
    expect(link.getAttribute('href')).toBe(`https://class.adam-russell.com${path}`);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps same-site student navigation in the SPA', () => {
    vi.stubGlobal('location', new URL('https://class.adam-russell.com/s/lessons/lesson_a'));
    const link = studentAnchor('/s/units/unit_a', 'test');
    const click = new MouseEvent('click', { cancelable: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/s/units/unit_a');
  });

  it('allows a modified click to open a student page in a new tab', () => {
    vi.stubGlobal('location', new URL('https://class.adam-russell.com/s/lessons/lesson_a'));
    const link = studentAnchor('/s/units/unit_a', 'test');
    const click = new MouseEvent('click', { cancelable: true, metaKey: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
  it('exposes a skip link to the main content', () => {
    const { surface, content } = createStudentShell();
    const skip = surface.querySelector<HTMLAnchorElement>('.skip-link');
    expect(skip?.textContent).toBe('Skip to content');
    expect(skip?.getAttribute('href')).toBe('#student-main');
    expect(content.id).toBe('student-main');
  });
});
